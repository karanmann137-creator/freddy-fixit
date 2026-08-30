-- ============================================================================
-- ALREADY APPLIED LIVE via Supabase MCP on 2026-08-30.
-- The installer does NOT apply this file. It is committed for version control
-- only. Do not run it expecting it to change production.
-- ============================================================================
--
-- Why this exists
-- ---------------
-- Signup confirmation and password reset are sent by Supabase's own GoTrue
-- mailer -- a different sender, on a domain we do not own and do not monitor.
-- In Aug 2026 that path broke and three accounts were silently locked out.
-- Health check 7 (no_stuck_signups) detects it; nothing FIXED it.
--
-- On 2026-08-30 an account (auth.users 5c597221) was stuck the same way. A
-- live probe of
-- /auth/v1/recover returned 200, so GoTrue accepted the handoff -- meaning
-- this instance was a DELIVERY failure (spam / recipient filtering / shared
-- free-tier sender reputation), which is invisible to us and which "just
-- reset your password" cannot work around, because reset uses the same mailer.
--
-- The remedy is to take GoTrue's MAILER out of the path while keeping its
-- token minting: admin.auth.admin.generateLink() returns an action link and
-- sends nothing, so the edge function `auth-rescue` delivers that link over
-- Resend on the DKIM-verified freddyfixit.ca domain that already carries every
-- receipt and dispatch email.
--
-- A magic link is NOT a force-confirm. The recipient must still receive it to
-- use it, so it proves address ownership exactly as the confirmation email
-- did. admin.updateUserById({email_confirm:true}) would unlock an account with
-- no proof at all and was deliberately rejected.

-- ---------------------------------------------------------------- ledger ---
create table if not exists public.signup_rescue_log (
  id       bigserial primary key,
  user_id  uuid not null,
  kind     text not null default 'stuck',
  ok       boolean not null default false,
  detail   text,
  sent_at  timestamptz not null default now()
);
create index if not exists signup_rescue_log_user_idx
  on public.signup_rescue_log (user_id, sent_at desc);

-- RLS on with NO policy, on purpose: nobody but service_role/postgres has any
-- business reading who we had to rescue.
alter table public.signup_rescue_log enable row level security;

-- --------------------------------------------------------------- lookups ---
-- Identity is resolved HERE, from the database -- never from the edge
-- function's request body. `verify_jwt` is not authentication: the anon key is
-- itself a valid project-signed JWT and ships publicly in the JS bundle.
create or replace function public.auth_rescue_target(p_user uuid)
returns table(email text, first_name text, role text)
language sql security definer
set search_path = public, extensions, pg_temp
as $$
  select u.email::text,
         coalesce(p.first_name, '')::text,
         coalesce(p.role, u.raw_user_meta_data->>'role', 'client')::text
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user
$$;

create or replace function public.auth_rescue_logged(
  p_user uuid, p_kind text, p_ok boolean, p_detail text default null)
returns void
language sql security definer
set search_path = public, extensions, pg_temp
as $$
  insert into public.signup_rescue_log (user_id, kind, ok, detail)
  values (p_user, coalesce(p_kind,'stuck'), coalesce(p_ok,false), p_detail);
$$;

-- ----------------------------------------------------------------- sweep ---
-- Windows are deliberate, and they mirror health check 7's reasoning:
--   6h  -- someone still working through their inbox is not stuck yet.
--   7d  -- a genuinely abandoned signup ages out instead of being mailed
--          forever; a real outage keeps re-firing while it continues.
--   <2 successful rescues ever, and none in the last 24h -- two nudges is
--          help, a nightly one is harassment from a sender they don't know.
create or replace function public.rescue_stuck_signups()
returns integer
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r        record;
  v_token  text;
  v_key    text;
  v_n      integer := 0;
begin
  select substring(prosrc from 'eyJ[A-Za-z0-9_.-]{40,}')
    into v_key from pg_proc where proname = 'kick_reconcile_payouts' limit 1;
  if v_key is null then return 0; end if;

  for r in
    select u.id
    from auth.users u
    where u.email_confirmed_at is null
      and u.last_sign_in_at is null
      and u.created_at < now() - interval '6 hours'
      and u.created_at > now() - interval '7 days'
      and (select count(*) from public.signup_rescue_log l
             where l.user_id = u.id and l.ok) < 2
      and not exists (select 1 from public.signup_rescue_log l
             where l.user_id = u.id and l.sent_at > now() - interval '24 hours')
    order by u.created_at
    limit 25
  loop
    -- Per-row exception block: one bad row must never abort the sweep and
    -- silently strand everyone behind it (the auto_confirm_stale_jobs lesson).
    begin
      v_token := public.issue_internal_token('edge-internal');
      perform net.http_post(
        url     := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/auth-rescue',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_key,
                     'x-ff-internal', v_token),
        body    := jsonb_build_object('user_id', r.id, 'kind', 'stuck')
      );
      v_n := v_n + 1;
    exception when others then
      null;
    end;
  end loop;

  return v_n;
end;
$$;

-- Admin one-shot. Ignores the cap and the window on purpose -- it is a human
-- deciding to help one named person, and `kind => 'apology'` is the copy that
-- says plainly that this was our fault.
create or replace function public.admin_rescue_signup(
  p_user uuid, p_kind text default 'stuck')
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token text; v_key text;
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  select substring(prosrc from 'eyJ[A-Za-z0-9_.-]{40,}')
    into v_key from pg_proc where proname = 'kick_reconcile_payouts' limit 1;
  v_token := public.issue_internal_token('edge-internal');
  perform net.http_post(
    url     := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/auth-rescue',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'x-ff-internal', v_token),
    body    := jsonb_build_object('user_id', p_user, 'kind', coalesce(p_kind,'stuck'))
  );
  return jsonb_build_object('ok', true, 'queued_for', p_user);
end;
$$;

-- ------------------------------------------------------------------ acls ---
-- Revoking from anon alone is a NO-OP: the default grant is to PUBLIC.
revoke all on function public.auth_rescue_target(uuid)            from public, anon, authenticated;
revoke all on function public.auth_rescue_logged(uuid,text,boolean,text) from public, anon, authenticated;
revoke all on function public.rescue_stuck_signups()              from public, anon, authenticated;
revoke all on function public.admin_rescue_signup(uuid,text)      from public, anon, authenticated;

grant execute on function public.auth_rescue_target(uuid)            to postgres, service_role;
grant execute on function public.auth_rescue_logged(uuid,text,boolean,text) to postgres, service_role;
grant execute on function public.rescue_stuck_signups()              to postgres, service_role;
grant execute on function public.admin_rescue_signup(uuid,text)      to postgres, service_role, authenticated;

-- ------------------------------------------------------------------ cron ---
-- Hourly at :37. Deliberately NOT added to set_platform_mode's quiet list --
-- this must keep running while the site is paused. Silencing signup rescue
-- during a pause reproduces the Aug 2026 lockout exactly, and the pause is
-- about not SOLICITING people, not about refusing to answer someone who
-- already handed us their email address.
select cron.schedule('rescue-stuck-signups', '37 * * * *',
                     $c$select public.rescue_stuck_signups();$c$);
