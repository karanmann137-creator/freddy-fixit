-- SMS: consent, line-type cache, send gate, volume cap, and the owner alert.
--
-- WHAT THIS IS AND IS NOT. This is the gate half only. It sends nothing, calls nothing over
-- the network, and registers no cron job -- so it cannot leak a phone number to Twilio even
-- by accident. The `send-sms` / `sms-inbound` edge functions come next and ASK this gate;
-- they are the only things that will ever hold a Twilio credential.
--
-- ⚠️ TWO INDEPENDENT BRAKES, AND THE DATE ONE IS THE LEGAL PROMISE.
--   1. `sms_enabled` (platform_settings) defaults to FALSE -- the kill switch.
--   2. `sms_effective_date` = 2026-12-03 -- Privacy Policy §14 gives 14 days' notice before
--      a material change takes effect, and adding Twilio as a processor is material. The
--      §6.2 row and UA §6.12 / §11.1 were published 2026-11-19 and say in plain words that
--      "no phone number is sent to Twilio before that date".
-- The date check exists BECAUSE a kill switch relies on someone remembering not to flip it.
-- A promise enforced by a column cannot be forgotten. Do not remove it when the date passes;
-- it costs one comparison and it is the written record of why the clock existed.
--
-- WHY A TABLE AND NOT COLUMNS ON `profiles`. Same reason as `terms_acceptances`
-- (20261116): the "Users manage own profile" policy on `profiles` is FOR ALL on
-- `auth.uid() = id`, so any column there is PATCHable straight through PostgREST with the
-- public anon key that ships in the bundle. Two of these fields must not be user-writable:
--   * `line_type` is a cached Twilio Lookup result. A forged 'mobile' on a landline makes us
--     text a landline, which is a SILENT failure -- no bounce, no error, and we pay for it.
--   * `opt_in_at` is the CASL evidence. A record the subject can write is evidence of
--     nothing, which is the whole point of keeping it.
-- So: SELECT policy only, no INSERT/UPDATE/DELETE policy at all, and every write goes
-- through a SECURITY DEFINER function. A forged direct call gets `permission denied`.
--
-- ⚠️ CONSENT ATTACHES TO THE NUMBER, NOT THE PERSON. `sms_consent.phone` is stamped
-- server-side from `profiles.phone` at opt-in. If the person later changes their number, the
-- stored consent no longer matches and the gate refuses with a reason the UI can show. That
-- is deliberate and it is the safe direction: the new number never consented, and its line
-- type has never been looked up. Re-opting in is one tap; texting a stranger who inherited a
-- recycled number is a CASL complaint.

-- ---------------------------------------------------------------------------
-- Settings. `sms_enabled` false, cap 500/month, effective 2026-12-03.
-- `on conflict do nothing` so re-running this migration never re-arms a switch the
-- owner has since turned off, and never resets a cap he has since raised.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('sms_enabled',        'false'::jsonb),
  ('sms_monthly_cap',    '500'::jsonb),
  ('sms_effective_date', '"2026-12-03"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- sms_e164(): the ONE phone normaliser. Used to store, to compare and to look up, so a
-- number written "(825) 561-8331" at signup and "825-561-8331" in settings cannot read as
-- two different people. Returns NULL for anything that is not a plausible NANP number --
-- and a NULL is a refusal everywhere downstream, never a pass.
-- ---------------------------------------------------------------------------
create or replace function public.sms_e164(p_phone text)
returns text
language plpgsql
immutable
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_d text;
begin
  if p_phone is null then return null; end if;
  v_d := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if length(v_d) = 11 and left(v_d, 1) = '1' then v_d := substr(v_d, 2); end if;
  if length(v_d) <> 10 then return null; end if;
  -- NANP: area code and exchange both start 2-9. Catches '0000000000' and most typos.
  if left(v_d, 1) in ('0', '1') or substr(v_d, 4, 1) in ('0', '1') then return null; end if;
  return '+1' || v_d;
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_consent. One row per account.
-- ---------------------------------------------------------------------------
create table if not exists public.sms_consent (
  user_id        uuid        primary key references public.profiles(id) on delete cascade,
  phone          text        not null,
  opt_in_at      timestamptz,
  opt_in_surface text,
  opt_out_at     timestamptz,
  opt_out_source text,
  -- 'mobile' | 'voip' | 'landline' | 'unknown'. NULL means never looked up, which the gate
  -- treats exactly like 'unknown': refuse. Fails closed by construction.
  line_type      text,
  line_type_at   timestamptz,
  updated_at     timestamptz not null default now()
);

create index if not exists sms_consent_phone_idx on public.sms_consent (phone);

alter table public.sms_consent enable row level security;

drop policy if exists "Users read own sms consent" on public.sms_consent;
create policy "Users read own sms consent"
  on public.sms_consent for select
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- sms_log. Every attempt -- sent, refused and errored -- because the questions this has to
-- answer later are "did we text this person", "why did we not", and "how many this month".
-- A log of successes only answers none of them.
--
-- Admin-only SELECT: every row holds a phone number. No write policy; `sms_log_write` is the
-- single path. `user_id` is nullable ON DELETE SET NULL, not CASCADE: an inbound STOP from a
-- number we do not recognise still has to be recorded, and a deleted account's send history
-- is still the evidence that we stopped texting them.
-- ---------------------------------------------------------------------------
create table if not exists public.sms_log (
  id           bigserial   primary key,
  user_id      uuid        references public.profiles(id) on delete set null,
  phone        text        not null,
  kind         text        not null,
  job_id       uuid,
  status       text        not null,
  reason       text,
  provider_sid text,
  segments     int         not null default 1,
  dedupe_key   text,
  created_at   timestamptz not null default now()
);

-- Partial unique: the dedupe key stops a double-fire, but only against a message that
-- actually went out. A refusal must not poison the key -- otherwise fixing the reason for
-- the refusal would leave the message permanently unsendable.
create unique index if not exists sms_log_dedupe_key_uniq
  on public.sms_log (dedupe_key) where dedupe_key is not null and status = 'sent';

create index if not exists sms_log_month_idx on public.sms_log (created_at desc) where status = 'sent';
create index if not exists sms_log_user_idx  on public.sms_log (user_id, created_at desc);

alter table public.sms_log enable row level security;

drop policy if exists "Admins read sms log" on public.sms_log;
create policy "Admins read sms log"
  on public.sms_log for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- sms_month_usage(): sent this calendar month, the cap, and how close we are.
-- Calendar month in CALGARY time, not UTC -- session TimeZone is UTC, so date_trunc on a
-- timestamptz rolls the month over 6-7 hours early and the first evening of every month
-- would count against the previous one.
-- ---------------------------------------------------------------------------
create or replace function public.sms_month_usage()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_cap  int;
  v_sent int;
  v_from timestamptz;
begin
  v_cap := coalesce((select (value #>> '{}')::int from public.platform_settings
                      where key = 'sms_monthly_cap'), 500);
  v_from := date_trunc('month', (now() at time zone 'America/Edmonton'))
            at time zone 'America/Edmonton';

  select count(*) into v_sent
    from public.sms_log
   where status = 'sent' and created_at >= v_from;

  return jsonb_build_object(
    'sent',   coalesce(v_sent, 0),
    'cap',    v_cap,
    'month',  to_char((now() at time zone 'America/Edmonton')::date, 'YYYY-MM'),
    'pct',    case when v_cap > 0 then round(100.0 * coalesce(v_sent, 0) / v_cap) else 0 end,
    'at_cap', coalesce(v_sent, 0) >= v_cap
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_send_allowed(user, kind) -> NULL when allowed, else the plain-English reason.
--
-- Same shape as `job_money_block()` and `role_change_block()` on purpose: one function
-- answers the question, so the gate that refuses and the sentence the person reads cannot
-- drift, and no caller ever branches on the wording of a server error.
--
-- `auth.uid() is null` is tested FIRST and on its own, per the null-guard rule: in SQL
-- `auth.uid() <> p_user_id` is NULL when auth.uid() is NULL and a NULL IF condition does not
-- fire, so an unauthenticated caller would fall straight through. NULL here means
-- service_role or an internal caller -- the edge function doing the sending -- which may ask
-- about anybody. Everyone else may ask only about themselves.
--
-- Order matters: platform-wide brakes before anything that reads a person's row, so a
-- switched-off platform never explains itself in terms of somebody's consent.
-- ---------------------------------------------------------------------------
create or replace function public.sms_send_allowed(p_user_id uuid, p_kind text default null)
returns text
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_enabled  boolean;
  v_eff      date;
  v_phone    text;
  v_c        record;
  v_usage    jsonb;
begin
  if auth.uid() is null then
    null;
  elsif auth.uid() <> p_user_id and not public.is_admin() then
    return 'You are not allowed to ask about this account.';
  end if;

  if p_user_id is null then
    return 'Could not work out which account this is.';
  end if;

  v_enabled := coalesce((select (value #>> '{}')::boolean from public.platform_settings
                          where key = 'sms_enabled'), false);
  if not v_enabled then
    return 'Text messaging is not switched on yet.';
  end if;

  v_eff := coalesce((select (value #>> '{}')::date from public.platform_settings
                      where key = 'sms_effective_date'), date '2026-12-03');
  if (now() at time zone 'America/Edmonton')::date < v_eff then
    return 'Text messaging starts on ' || to_char(v_eff, 'FMMonth FMDD, YYYY')
        || '. Until then we only send email.';
  end if;

  if public.outbound_paused() then
    return 'Outbound messages are paused while the site is under maintenance.';
  end if;

  select public.sms_e164(p.phone) into v_phone
    from public.profiles p where p.id = p_user_id;

  if not found then
    return 'We could not find that account.';
  end if;
  if v_phone is null then
    return 'There is no mobile number on this account.';
  end if;

  select * into v_c from public.sms_consent c where c.user_id = p_user_id;

  if not found or v_c.opt_in_at is null then
    return 'This account has not asked for text messages.';
  end if;
  if v_c.opt_out_at is not null and v_c.opt_out_at >= v_c.opt_in_at then
    return 'This account has turned text messages off.';
  end if;
  if v_c.phone is distinct from v_phone then
    return 'The mobile number on this account changed. Text messages need to be turned on '
        || 'again for the new number.';
  end if;
  if coalesce(v_c.line_type, 'unknown') not in ('mobile', 'voip') then
    return case coalesce(v_c.line_type, 'unknown')
             when 'landline' then 'That number is a landline, so it cannot receive texts.'
             else 'We have not yet checked whether that number can receive texts.'
           end;
  end if;

  v_usage := public.sms_month_usage();
  if (v_usage ->> 'at_cap')::boolean then
    return 'This month''s text-message limit (' || (v_usage ->> 'cap')
        || ') has been reached. Email is still going out as normal.';
  end if;

  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_status(): what the settings screen and the onboarding checkbox read. One call, so the
-- toggle's position and the reason beside it come from the same place as the gate.
-- ---------------------------------------------------------------------------
create or replace function public.sms_status()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_c     record;
begin
  if v_uid is null then
    return jsonb_build_object('signed_in', false, 'opted_in', false);
  end if;

  select public.sms_e164(p.phone) into v_phone from public.profiles p where p.id = v_uid;
  select * into v_c from public.sms_consent c where c.user_id = v_uid;

  return jsonb_build_object(
    'signed_in',    true,
    'has_phone',    v_phone is not null,
    'phone',        v_phone,
    'opted_in',     v_c.opt_in_at is not null
                      and (v_c.opt_out_at is null or v_c.opt_out_at < v_c.opt_in_at),
    'opt_in_at',    v_c.opt_in_at,
    'stale_phone',  v_c.opt_in_at is not null and v_c.phone is distinct from v_phone,
    'line_type',    v_c.line_type,
    'blocked',      public.sms_send_allowed(v_uid, null)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_set_opt_in(): the user-facing write. Self only.
--
-- Takes no phone number. It stamps `profiles.phone` server-side, so the browser cannot
-- consent on behalf of a number the account does not hold -- the same reasoning as
-- `accept_terms()` not taking a version.
--
-- Opting IN after an opt-out moves `opt_in_at` forward and leaves `opt_out_at` where it was;
-- the gate compares the two, so the later act wins and the history survives. An opt-out is
-- never deleted: "prove they asked you to stop and prove when" is the question CASL asks.
--
-- Changing the number clears the cached line type, because it belonged to the old number.
-- ---------------------------------------------------------------------------
create or replace function public.sms_set_opt_in(p_opt_in boolean, p_surface text default 'settings')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
begin
  if v_uid is null then
    raise exception 'Sign in to change your text message settings.';
  end if;

  select public.sms_e164(p.phone) into v_phone from public.profiles p where p.id = v_uid;

  if p_opt_in and v_phone is null then
    raise exception 'Add a mobile number to your profile first.';
  end if;

  if p_opt_in then
    insert into public.sms_consent (user_id, phone, opt_in_at, opt_in_surface, updated_at)
    values (v_uid, v_phone, now(), coalesce(nullif(btrim(p_surface), ''), 'unknown'), now())
    on conflict (user_id) do update set
      opt_in_at      = now(),
      opt_in_surface = excluded.opt_in_surface,
      -- A new number invalidates the lookup that belonged to the old one.
      line_type      = case when sms_consent.phone is distinct from excluded.phone
                            then null else sms_consent.line_type end,
      line_type_at   = case when sms_consent.phone is distinct from excluded.phone
                            then null else sms_consent.line_type_at end,
      phone          = excluded.phone,
      updated_at     = now();
  else
    -- Opting out with no row at all still records the refusal, so a later "did they ever
    -- say no?" has an answer. coalesce on phone because there may be no number on file.
    insert into public.sms_consent (user_id, phone, opt_out_at, opt_out_source, updated_at)
    values (v_uid, coalesce(v_phone, 'unknown'), now(),
            coalesce(nullif(btrim(p_surface), ''), 'settings'), now())
    on conflict (user_id) do update set
      opt_out_at     = now(),
      opt_out_source = excluded.opt_out_source,
      updated_at     = now();
  end if;

  return public.sms_status();
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_record_opt_out(): the STOP-reply path. service_role only -- the inbound webhook has no
-- auth.uid() to work with, and the person replying STOP is identified by their number, not
-- by a session.
--
-- Matches on the normalised number across every account that holds it, because one number
-- can legitimately sit on two profiles (a contractor who is also a homeowner), and STOP from
-- a handset means stop to all of them. Returns how many it stopped.
--
-- CRTC and CASL both require the opt-out to work unconditionally, so this takes no account
-- id, asks no questions, and cannot be refused.
-- ---------------------------------------------------------------------------
create or replace function public.sms_record_opt_out(p_phone text, p_source text default 'stop_reply')
returns int
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_phone text := public.sms_e164(p_phone);
  v_n     int  := 0;
begin
  if v_phone is null then return 0; end if;

  with targets as (
    select p.id from public.profiles p where public.sms_e164(p.phone) = v_phone
  )
  insert into public.sms_consent (user_id, phone, opt_out_at, opt_out_source, updated_at)
  select t.id, v_phone, now(), coalesce(nullif(btrim(p_source), ''), 'stop_reply'), now()
    from targets t
  on conflict (user_id) do update set
    opt_out_at     = now(),
    opt_out_source = excluded.opt_out_source,
    updated_at     = now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_record_line_type(): caches one Twilio Lookup result. service_role only.
--
-- Keyed on the number, not the account, and written against every account holding it: the
-- lookup costs money per call and the answer is a property of the number.
-- ---------------------------------------------------------------------------
create or replace function public.sms_record_line_type(p_phone text, p_line_type text)
returns int
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_phone text := public.sms_e164(p_phone);
  v_type  text := lower(coalesce(nullif(btrim(p_line_type), ''), 'unknown'));
  v_n     int  := 0;
begin
  if v_phone is null then return 0; end if;
  -- Normalise Twilio's vocabulary down to the four values the gate understands. Anything
  -- unrecognised becomes 'unknown', which the gate refuses -- a new provider value must
  -- never read as permission.
  v_type := case
    when v_type = 'mobile' then 'mobile'
    when v_type in ('voip', 'fixedvoip', 'nonfixedvoip') then 'voip'
    when v_type in ('landline', 'fixedline') then 'landline'
    else 'unknown'
  end;

  update public.sms_consent c
     set line_type = v_type, line_type_at = now(), updated_at = now()
   where c.phone = v_phone;

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_log_write(): the single write into the log, and the ONLY place the volume alert can
-- fire from -- because that is the only moment the count changes.
--
-- Returns the row id, or NULL when the dedupe key says this message already went out. A
-- NULL is the caller's signal NOT to send; the unique index is what makes that race-safe.
--
-- The alert sits in its OWN exception block. A catch-all may cover exactly one thing, and a
-- fault in the alerting must never swallow the log row that is the evidence of the send.
-- ---------------------------------------------------------------------------
create or replace function public.sms_log_write(
  p_user_id    uuid,
  p_phone      text,
  p_kind       text,
  p_status     text,
  p_reason     text default null,
  p_job_id     uuid default null,
  p_provider_sid text default null,
  p_segments   int  default 1,
  p_dedupe_key text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_id bigint;
begin
  insert into public.sms_log (user_id, phone, kind, job_id, status, reason,
                              provider_sid, segments, dedupe_key)
  values (p_user_id, coalesce(public.sms_e164(p_phone), coalesce(p_phone, 'unknown')),
          coalesce(nullif(btrim(p_kind), ''), 'unknown'), p_job_id,
          coalesce(nullif(btrim(p_status), ''), 'error'), p_reason,
          p_provider_sid, greatest(1, coalesce(p_segments, 1)), p_dedupe_key)
  on conflict (dedupe_key) where dedupe_key is not null and status = 'sent'
  do nothing
  returning id into v_id;

  if v_id is not null and p_status = 'sent' then
    begin
      perform public.sms_volume_alert();
    exception when others then
      raise warning 'sms_volume_alert failed: %', sqlerrm;
    end;
  end if;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- sms_volume_alert(): emails the owner at 80% of the cap and again at 100%.
--
-- WHY THE BODY CARRIES A PASTE-BACK PROMPT. The owner is non-technical and works by pasting
-- into a chat. An alert that says "you are near the limit" leaves him with a decision and no
-- way to act on it; one that hands him the exact words to paste turns the alert into the
-- first half of the fix. Keep the prompt specific -- it must name the files to read and
-- refuse to raise the cap before showing a breakdown, or the easy answer is always "raise
-- the cap".
--
-- `_notify` only inserts; the Database Webhook on `public.notifications` does the email.
-- `sms_cap_alert` is deliberately NOT in send-notification's EMAIL_HANDLED_ELSEWHERE, so it
-- does email -- and it is deliberately NOT gated on `outbound_paused()`, for the same reason
-- health_alert is not: an operational alert to the owner must survive the pause.
--
-- The throttle key carries the month AND the threshold, so each fires once per month. Per
-- the alert rule, a throttle FAILS OPEN -- `alert_should_send` returns send=true on its own
-- error, because a duplicate alert is better than a silenced one.
-- ---------------------------------------------------------------------------
create or replace function public.sms_volume_alert()
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_u      jsonb := public.sms_month_usage();
  v_sent   int   := (v_u ->> 'sent')::int;
  v_cap    int   := (v_u ->> 'cap')::int;
  v_month  text  := v_u ->> 'month';
  v_level  text;
  v_key    text;
  v_title  text;
  v_body   text;
  v_admin  uuid;
  v_break  text;
begin
  if v_cap <= 0 then return 'no cap'; end if;

  if v_sent >= v_cap then
    v_level := 'cap';
  elsif v_sent >= (v_cap * 4) / 5 then
    v_level := 'warn';
  else
    return 'under';
  end if;

  v_key := 'sms_volume:' || v_month || ':' || v_level;
  if not ((public.alert_should_send(v_key, 60 * 24 * 40) ->> 'send')::boolean) then
    return 'throttled';
  end if;

  select string_agg(kind || ': ' || n, E'\n' order by n desc) into v_break
    from (select kind, count(*) as n
            from public.sms_log
           where status = 'sent'
             and created_at >= date_trunc('month', (now() at time zone 'America/Edmonton'))
                               at time zone 'America/Edmonton'
           group by kind) k;

  v_title := case when v_level = 'cap'
    then 'Text messages STOPPED: monthly limit of ' || v_cap || ' reached'
    else 'Text messages at ' || (v_u ->> 'pct') || '% of the monthly limit' end;

  v_body :=
    case when v_level = 'cap'
      then 'Freddy Fix It has sent ' || v_sent || ' text messages in ' || v_month
        || ', which is the whole monthly limit of ' || v_cap || '.' || E'\n\n'
        || 'Texting has stopped for the rest of the month. Email is still going out as '
        || 'normal, so nobody has missed anything important.'
      else 'Freddy Fix It has sent ' || v_sent || ' of ' || v_cap
        || ' text messages in ' || v_month || '.' || E'\n\n'
        || 'Nothing has stopped. At ' || v_cap || ' texting pauses for the rest of the '
        || 'month and email carries on by itself.'
    end
    || E'\n\nThis month so far, by type:\n' || coalesce(v_break, '(none)')
    || E'\n\n'
    || '----------------------------------------' || E'\n'
    || 'COPY EVERYTHING BELOW THIS LINE AND PASTE IT TO CLAUDE' || E'\n'
    || '----------------------------------------' || E'\n\n'
    || 'Our SMS volume hit ' || (v_u ->> 'pct') || '% of the monthly cap ('
    || v_sent || ' of ' || v_cap || ' in ' || v_month || '). Per-type breakdown:' || E'\n'
    || coalesce(v_break, '(none)') || E'\n\n'
    || 'Read docs/notifications-and-email.md and '
    || 'supabase/migrations/20261119_sms_consent_and_caps.sql, then query sms_log for '
    || 'this month and tell me, in plain English:' || E'\n'
    || '1. Which message types are driving the volume, and roughly what each costs us.'
    || E'\n'
    || '2. Whether any of them duplicate an email we already send -- if a type sends both, '
    || 'say which one I should drop.' || E'\n'
    || '3. Whether this volume is real growth or a loop (the same person or job texted '
    || 'more than once for the same thing).' || E'\n'
    || '4. Only then: whether to raise platform_settings.sms_monthly_cap, and to what.'
    || E'\n\n'
    || 'Do not raise the cap before showing me the per-type breakdown and your answer to '
    || 'number 3. If it is a loop, fix the loop instead of the cap.';

  for v_admin in select id from public.profiles where role = 'admin' loop
    perform public._notify(v_admin, 'sms_cap_alert', v_title, v_body, null);
  end loop;

  return 'alerted:' || v_level;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Grants.
--
-- `revoke ... from public` is required as well as from anon: the default function grant is
-- to PUBLIC, so revoking from anon alone is a no-op. And note the ordering rule -- a `drop
-- function` + `create` RESETS the ACL to the defaults, so this block must be re-run after
-- any recreate. Verify with pg_proc.proacl, never by reading this file.
--
-- The split that matters: a user may read and set their OWN consent; only service_role may
-- record a line type, honour a STOP, or write the log. Those three are the ones an attacker
-- would want -- a forged 'mobile' makes us text a landline, a forged log row inflates or
-- hides the volume count, and a forged opt-out silences someone else.
-- ---------------------------------------------------------------------------
revoke all on function public.sms_e164(text)                                  from public, anon;
revoke all on function public.sms_month_usage()                               from public, anon;
revoke all on function public.sms_send_allowed(uuid, text)                    from public, anon;
revoke all on function public.sms_status()                                    from public, anon;
revoke all on function public.sms_set_opt_in(boolean, text)                   from public, anon;
revoke all on function public.sms_record_opt_out(text, text)                  from public, anon;
revoke all on function public.sms_record_line_type(text, text)                from public, anon;
revoke all on function public.sms_log_write(uuid, text, text, text, text, uuid, text, int, text)
                                                                              from public, anon;
revoke all on function public.sms_volume_alert()                              from public, anon;

grant execute on function public.sms_e164(text)                to authenticated, service_role;
grant execute on function public.sms_send_allowed(uuid, text)  to authenticated, service_role;
grant execute on function public.sms_status()                  to authenticated, service_role;
grant execute on function public.sms_set_opt_in(boolean, text) to authenticated, service_role;

grant execute on function public.sms_month_usage()                            to service_role;
grant execute on function public.sms_record_opt_out(text, text)               to service_role;
grant execute on function public.sms_record_line_type(text, text)             to service_role;
grant execute on function public.sms_log_write(uuid, text, text, text, text, uuid, text, int, text)
                                                                              to service_role;
grant execute on function public.sms_volume_alert()                           to service_role;

-- ---------------------------------------------------------------------------
-- admin_sms_overview(): what the owner sees. A plain is_admin() read, NOT admin_guard() --
-- reads do not carry the second factor, because that factor rides our own Resend mailer and
-- a mailer outage must never blind the admin dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.admin_sms_overview()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_r jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'admin only');
  end if;

  select jsonb_build_object(
    'usage',    public.sms_month_usage(),
    'enabled',  coalesce((select (value #>> '{}')::boolean from public.platform_settings
                           where key = 'sms_enabled'), false),
    'starts',   (select value #>> '{}' from public.platform_settings
                  where key = 'sms_effective_date'),
    'opted_in', (select count(*) from public.sms_consent
                  where opt_in_at is not null
                    and (opt_out_at is null or opt_out_at < opt_in_at)),
    'opted_out',(select count(*) from public.sms_consent
                  where opt_out_at is not null
                    and (opt_in_at is null or opt_out_at >= opt_in_at)),
    'landlines',(select count(*) from public.sms_consent where line_type = 'landline'),
    'unchecked',(select count(*) from public.sms_consent
                  where opt_in_at is not null and line_type is null),
    'recent',   coalesce((select jsonb_agg(r) from (
                  select public.ff_local_ts(created_at) as at, kind, status, reason
                    from public.sms_log order by created_at desc limit 50) r), '[]'::jsonb)
  ) into v_r;

  return v_r;
end;
$function$;

revoke all on function public.admin_sms_overview() from public, anon;
grant execute on function public.admin_sms_overview() to authenticated, service_role;
