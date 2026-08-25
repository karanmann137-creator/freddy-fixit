-- Email OTP second factor.
--
-- WHY RESEND AND NOT GOTRUE. Supabase's own mailer sends signup confirmation and
-- password reset, and in Aug 2026 it failed silently for a month: three accounts
-- were stranded, one an approved contractor receiving job emails he could not act
-- on, and we only found out because somebody phoned. Hanging a second factor off
-- that same mailer would have turned "new signups are stuck" into "every existing
-- account is locked out". Codes therefore ride the mailer we monitor -- Resend,
-- via the `mfa-code` edge function.
--
-- WHY IT CANNOT LOCK ANYONE OUT. mfa_ok() returns TRUE for anybody with no
-- user_mfa row, so applying this migration changes nothing for anyone until they
-- deliberately opt in. Enrolment is not complete until a code has been verified.
-- Ten single-use recovery codes are issued at enrolment. admin_clear_mfa() is the
-- break-glass. And if all of that fails, the owner can run:
--
--   delete from public.user_mfa
--    where user_id = (select id from auth.users where email = 'you@example.com');

create table if not exists public.user_mfa (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  enabled          boolean not null default false,
  enrolled_at      timestamptz,
  recovery_hashes  text[] not null default '{}',
  recovery_used    int not null default 0,
  last_verified_at timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.mfa_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,
  purpose    text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mfa_challenges_user_idx
  on public.mfa_challenges (user_id, purpose, created_at desc);

alter table public.user_mfa       enable row level security;
alter table public.mfa_challenges enable row level security;

-- Own-row SELECT only. There is deliberately no INSERT/UPDATE/DELETE policy:
-- every write goes through a SECURITY DEFINER RPC that has verified a code.
drop policy if exists user_mfa_own_read on public.user_mfa;
create policy user_mfa_own_read on public.user_mfa
  for select to authenticated using (user_id = (select auth.uid()));

-- mfa_challenges gets NO policy at all. RLS is on and nothing matches, so the
-- table is unreachable from PostgREST by any role -- which is the point: the
-- code hashes and the attempt counter must not be readable by the account being
-- challenged.
revoke all on public.mfa_challenges from anon, authenticated;
grant select on public.user_mfa to authenticated;
revoke insert, update, delete on public.user_mfa from anon, authenticated;

-- The user id is the salt, so a hash lifted from one row is useless against
-- another, and a stolen table cannot be attacked with one rainbow table.
create or replace function public.mfa_hash(p_code text, p_user uuid)
returns text language sql immutable security definer
set search_path = public, extensions, pg_temp as $function$
  select encode(extensions.digest(upper(trim(p_code)) || ':' || p_user::text, 'sha256'), 'hex');
$function$;

-- The enforcement primitive. PERMISSIVE ON ABSENCE BY DESIGN: no row means the
-- user never opted in, and that must read as "fine", not "blocked". A 12-hour
-- window keeps it from prompting on every page.
create or replace function public.mfa_ok()
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp as $function$
  select coalesce(
    (select (not m.enabled)
         or (m.last_verified_at is not null
             and m.last_verified_at > now() - interval '12 hours')
       from public.user_mfa m
      where m.user_id = auth.uid()),
    true);
$function$;

create or replace function public.mfa_status()
returns jsonb language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $function$
declare m public.user_mfa;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  select * into m from public.user_mfa where user_id = auth.uid();
  if not found then
    return jsonb_build_object('enabled', false, 'enrolled', false,
                              'recovery_left', 0, 'verified_recently', true);
  end if;
  return jsonb_build_object(
    'enabled',           m.enabled,
    'enrolled',          m.enrolled_at is not null,
    'recovery_left',     coalesce(array_length(m.recovery_hashes, 1), 0),
    'recovery_used',     m.recovery_used,
    'last_verified_at',  m.last_verified_at,
    'verified_recently', public.mfa_ok());
end;
$function$;

create or replace function public.mfa_request_code(p_purpose text default 'login')
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_recent int;
  v_email  text;
  v_name   text;
  v_tok    text;
  v_url    text := coalesce(current_setting('app.supabase_url', true),
                            'https://kvypmjxbbaaknvddwwai.supabase.co')
                   || '/functions/v1/mfa-code';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_purpose not in ('enroll','login','disable') then
    return jsonb_build_object('ok', false, 'reason', 'bad_purpose');
  end if;

  -- Rate limit: 5 codes per hour per user. Cheap, and it is the only thing
  -- between a stolen session and using our Resend domain as a mail cannon.
  select count(*) into v_recent
    from public.mfa_challenges
   where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null then return jsonb_build_object('ok', false, 'reason', 'no_email'); end if;
  select p.first_name into v_name from public.profiles p where p.id = v_uid;

  -- 6 digits from a CSPRNG. gen_random_bytes lives in `extensions`, which is
  -- why this function pins search_path -- see the Aug 2026 signup incident.
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');

  -- Supersede any outstanding code for this purpose, so an old email cannot be
  -- used after a new one has been requested.
  update public.mfa_challenges
     set consumed_at = now()
   where user_id = v_uid and purpose = p_purpose and consumed_at is null;

  insert into public.mfa_challenges (user_id, code_hash, purpose, expires_at)
  values (v_uid, public.mfa_hash(v_code, v_uid), p_purpose, now() + interval '10 minutes');

  begin
    v_tok := public.issue_internal_token('edge-internal');
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-ff-internal', v_tok),
      body    := jsonb_build_object('email', v_email, 'name', coalesce(v_name,''),
                                    'code', v_code, 'purpose', p_purpose)
    );
  exception when others then
    -- The code is already stored, so a mail hiccup is recoverable by asking for
    -- another one. Never let it raise on an auth path.
    raise warning 'mfa-code enqueue failed: %', sqlerrm;
    return jsonb_build_object('ok', false, 'reason', 'send_failed');
  end;

  return jsonb_build_object('ok', true, 'expires_in', 600);
end;
$function$;

create or replace function public.mfa_verify(p_code text, p_purpose text default 'login')
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
declare
  v_uid  uuid := auth.uid();
  v_ch   public.mfa_challenges;
  v_codes text[] := '{}';
  v_hashes text[] := '{}';
  v_c    text;
  i      int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  select * into v_ch
    from public.mfa_challenges
   where user_id = v_uid and purpose = p_purpose and consumed_at is null
   order by created_at desc
   limit 1
   for update;

  if not found then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if v_ch.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_ch.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'too_many_attempts'); end if;

  update public.mfa_challenges set attempts = attempts + 1 where id = v_ch.id;

  if v_ch.code_hash <> public.mfa_hash(p_code, v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_code',
                              'attempts_left', 4 - v_ch.attempts);
  end if;

  update public.mfa_challenges set consumed_at = now() where id = v_ch.id;

  if p_purpose = 'enroll' then
    for i in 1..10 loop
      v_c := upper(encode(extensions.gen_random_bytes(5), 'hex'));  -- 10 hex chars
      v_codes  := v_codes  || v_c;
      v_hashes := v_hashes || public.mfa_hash(v_c, v_uid);
    end loop;

    insert into public.user_mfa (user_id, enabled, enrolled_at, recovery_hashes,
                                 recovery_used, last_verified_at)
    values (v_uid, true, now(), v_hashes, 0, now())
    on conflict (user_id) do update
      set enabled = true, enrolled_at = now(),
          recovery_hashes = excluded.recovery_hashes,
          recovery_used = 0, last_verified_at = now();

    return jsonb_build_object('ok', true, 'recovery_codes', v_codes);
  end if;

  update public.user_mfa set last_verified_at = now() where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.mfa_use_recovery(p_code text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
declare
  v_uid  uuid := auth.uid();
  v_hash text;
  m      public.user_mfa;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  select * into m from public.user_mfa where user_id = v_uid for update;
  if not found or not m.enabled then return jsonb_build_object('ok', false, 'reason', 'not_enrolled'); end if;

  v_hash := public.mfa_hash(p_code, v_uid);
  if not (v_hash = any(m.recovery_hashes)) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_code');
  end if;

  update public.user_mfa
     set recovery_hashes  = array_remove(recovery_hashes, v_hash),
         recovery_used    = recovery_used + 1,
         last_verified_at = now()
   where user_id = v_uid;

  return jsonb_build_object('ok', true,
    'recovery_left', coalesce(array_length(array_remove(m.recovery_hashes, v_hash), 1), 0));
end;
$function$;

-- Turning it off must itself pass the factor, or a stolen session simply
-- switches it off and the whole thing was decoration.
create or replace function public.mfa_disable()
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if not public.mfa_ok() then return jsonb_build_object('ok', false, 'reason', 'verify_first'); end if;
  delete from public.user_mfa where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Break glass, for somebody who has lost both their email and their recovery
-- codes. Deliberately NOT moved onto admin_guard() below: if the owner's own
-- two-step goes wrong, this is the function that has to still work.
create or replace function public.admin_clear_mfa(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
declare v_is_admin boolean;
begin
  select exists(select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin') into v_is_admin;
  if not v_is_admin then raise exception 'Not authorized'; end if;

  delete from public.user_mfa       where user_id = p_user_id;
  delete from public.mfa_challenges where user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- mfa_hash is revoked from every caller role: it is a building block, and a
-- client that can compute hashes can test recovery codes offline.
revoke execute on function public.mfa_hash(text, uuid) from public, anon, authenticated;

revoke execute on function public.mfa_ok()                       from public, anon;
revoke execute on function public.mfa_status()                   from public, anon;
revoke execute on function public.mfa_request_code(text)         from public, anon;
revoke execute on function public.mfa_verify(text, text)         from public, anon;
revoke execute on function public.mfa_use_recovery(text)         from public, anon;
revoke execute on function public.mfa_disable()                  from public, anon;
revoke execute on function public.admin_clear_mfa(uuid)          from public, anon;

grant execute on function public.mfa_ok()               to authenticated;
grant execute on function public.mfa_status()           to authenticated;
grant execute on function public.mfa_request_code(text) to authenticated;
grant execute on function public.mfa_verify(text, text) to authenticated;
grant execute on function public.mfa_use_recovery(text) to authenticated;
grant execute on function public.mfa_disable()          to authenticated;
grant execute on function public.admin_clear_mfa(uuid)  to authenticated;
