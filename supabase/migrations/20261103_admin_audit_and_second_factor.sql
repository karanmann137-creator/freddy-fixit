-- 2026-11-03 · Admin blast-radius reduction: an audit log, a self-bypass fix,
-- and the second factor extended to the destructive admin paths.
--
-- APPLIED LIVE via Supabase MCP. This file exists for version control only —
-- running it is not what put these objects in the database.
--
-- Context. The owner asked whether the admin account is a big security risk.
-- The audit said yes, for three reasons:
--   1. The admin account was not enrolled in two-step at all, so admin_guard()
--      was behaving exactly like is_admin(). The one enrolled account on the
--      platform is a CLIENT. The CLAUDE.md note "nobody is enrolled yet" was
--      stale in the misleading direction.
--   2. Only 5 of 38 admin-gated functions used admin_guard(); 33 used plain
--      is_admin(), and ZERO edge functions checked for a second factor.
--   3. Nothing anywhere recorded what an admin had done. 38 admin-trusting RLS
--      policies across 30 tables mean the account reads every client address,
--      every private chat and every contractor licence document — and left no
--      trace doing it.
--
-- And one outright hole, which is the headline of this migration: see part 2.
--
-- MONEY: none of this touches any of the four payout guards. No money path,
-- no funded_amount, no payment_status, no payout and no deletion logic
-- changed. The migration adds refusals and an append-only record, nothing else.
--
-- EVERYTHING HERE IS A NO-OP UNTIL THE ADMIN ENROLS. mfa_ok() returns TRUE for
-- anyone not enrolled — it answers "is a code owed?", not "is this user
-- protected?" — so adding the second factor to a guard can never lock out an
-- account that never opted in. That property is what made it safe to apply all
-- of this to 13 live functions in one transaction.


-- ────────────────────────────────────────────────────────────────────────────
-- Part 1 — the audit log, its reader, and the gate an edge function can call.
-- Applied as migration `admin_audit_log_and_action_gate`.
-- ────────────────────────────────────────────────────────────────────────────

-- NO FOREIGN KEYS, DELIBERATELY. The single most important entry this table can
-- ever hold is "the admin deleted this account". An FK to auth.users would
-- either cascade that row away at exactly the moment it matters, or block the
-- delete it is supposed to be recording. actor_email is SNAPSHOTTED for the
-- same reason: six months later the uuid alone answers nothing.
create table if not exists public.admin_audit_log (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  target_table text,
  target_id    text,
  detail       jsonb not null default '{}'::jsonb,
  via          text not null default 'rpc'
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx   on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_action_idx  on public.admin_audit_log (action, created_at desc);

alter table public.admin_audit_log enable row level security;

-- SELECT only, and no INSERT/UPDATE/DELETE policy exists at all. A log a
-- compromised admin session can edit is not a log. Writes arrive exclusively
-- through log_admin_action, which is granted to service_role alone — and which
-- still works from inside the admin RPCs because a SECURITY DEFINER body runs
-- with the owner's privileges, not the caller's.
drop policy if exists admin_audit_log_admin_select on public.admin_audit_log;
create policy admin_audit_log_admin_select on public.admin_audit_log
  for select to authenticated using (public.is_admin());

revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function public.log_admin_action(
  p_action       text,
  p_target_table text  default null,
  p_target_id    text  default null,
  p_detail       jsonb default '{}'::jsonb,
  p_actor        uuid  default null,
  p_via          text  default 'rpc'
) returns bigint
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_email text;
  v_id    bigint;
begin
  -- p_actor exists for the edge-function callers: they hold a service-role
  -- client and so have no auth.uid() to fall back on.
  select u.email into v_email from auth.users u where u.id = v_actor;
  insert into public.admin_audit_log
    (actor_id, actor_email, action, target_table, target_id, detail, via)
  values (v_actor, v_email, p_action, p_target_table, p_target_id,
          coalesce(p_detail, '{}'::jsonb), coalesce(p_via, 'rpc'))
  returning id into v_id;
  return v_id;
end
$fn$;

revoke all on function public.log_admin_action(text,text,text,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.log_admin_action(text,text,text,jsonb,uuid,text) to service_role;

-- The reader. ff_local_ts because a bare to_char() on a timestamptz renders
-- Calgary times 6–7 hours ahead.
create or replace function public.admin_audit_tail(p_limit int default 200)
returns table (
  id bigint, at_local text, actor_email text, action text,
  target_table text, target_id text, detail jsonb, via text
)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  -- Reads stay on plain is_admin(), NOT admin_guard(). The second factor is
  -- delivered by our own Resend mailer — the same mailer whose silent failure
  -- locked three people out in Aug 2026 — so a mailer outage must never blind
  -- the admin dashboard. Irreversible writes get the factor; looking gets none.
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select l.id, public.ff_local_ts(l.created_at), l.actor_email, l.action,
           l.target_table, l.target_id, l.detail, l.via
      from public.admin_audit_log l
     order by l.created_at desc, l.id desc
     limit greatest(1, least(coalesce(p_limit, 200), 1000));
end
$fn$;

revoke all on function public.admin_audit_tail(int) from public, anon;
grant execute on function public.admin_audit_tail(int) to authenticated;

-- The gate an edge function can actually use. An edge function holds a
-- service-role client plus the caller's JWT, so it has no auth.uid() and
-- cannot evaluate mfa_ok(). This answers the same question for a NAMED user
-- id, and RETURNS rather than raises so the caller can turn it into an HTTP
-- status with a plain-English reason attached.
create or replace function public.admin_action_allowed(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_role text; v_mfa record;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Not signed in.');
  end if;
  select p.role into v_role from public.profiles p where p.id = p_user_id;
  if coalesce(v_role, '') <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'Not authorized.');
  end if;
  select m.enabled, m.last_verified_at into v_mfa
    from public.user_mfa m where m.user_id = p_user_id;
  -- Mirrors mfa_ok() exactly, including the part that matters most: not
  -- enrolled means OK. Diverge from mfa_ok() here and the edge functions start
  -- disagreeing with the RPCs about whether a code is owed.
  if v_mfa is null or not v_mfa.enabled
     or (v_mfa.last_verified_at is not null and v_mfa.last_verified_at > now() - interval '12 hours')
  then
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'Verify your sign-in code first, then try again.');
end
$fn$;

revoke all on function public.admin_action_allowed(uuid) from public, anon, authenticated;
grant execute on function public.admin_action_allowed(uuid) to service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- Part 2 — THE HOLE. admin_clear_mfa could strip the caller's OWN factor.
-- Applied as migration `admin_clear_mfa_close_self_bypass`.
-- ────────────────────────────────────────────────────────────────────────────
--
-- The break-glass function checked only an inline
--   exists(select 1 from profiles where id = auth.uid() and role = 'admin')
-- and accepted ANY user id — including the caller's own.
--
-- The attack, start to finish, from a stolen password alone:
--   1. Sign in as the admin. No code is owed yet: mfa_ok() is only consulted
--      when a guarded action is attempted.
--   2. Call admin_clear_mfa(<own id>). The user_mfa row is deleted.
--   3. mfa_ok() now returns TRUE — because it returns true for anyone not
--      enrolled, which is correct behaviour being turned against itself.
--   4. Every admin_guard() function is now open.
--
-- The entire two-step build was bypassable from a password. Fixed two
-- independent ways: the function now demands admin_guard() (so a code is owed
-- before you may clear anyone's), and self-targeting is refused outright.
--
-- CONSEQUENCE, documented on purpose: once enrolled, the admin's only routes
-- out of a lost second factor are the ten single-use recovery codes
-- (mfa_use_recovery) or `delete from public.user_mfa` in the Supabase SQL
-- editor — which needs the project-owner login, not the app login. That is the
-- point. A session that can strip its own second factor does not have one.

create or replace function public.admin_clear_mfa(p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  perform public.admin_guard();
  if p_user_id is null then raise exception 'No account given.'; end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot switch off your own two-step sign-in from here. Use one of your recovery codes, or turn it off in Settings after verifying.';
  end if;
  delete from public.user_mfa       where user_id = p_user_id;
  delete from public.mfa_challenges where user_id = p_user_id;
  perform public.log_admin_action('admin_clear_mfa', 'user_mfa', p_user_id::text,
    jsonb_build_object('note', 'two-step sign-in cleared for this user'));
  return jsonb_build_object('ok', true);
end
$fn$;

revoke all on function public.admin_clear_mfa(uuid) from public, anon;
grant execute on function public.admin_clear_mfa(uuid) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- Part 3 — admin_guard() + an audit entry on the 12 destructive RPCs.
-- Applied as migration `admin_guard_and_audit_on_destructive_rpcs`.
-- ────────────────────────────────────────────────────────────────────────────
--
-- Patched in place off pg_get_functiondef rather than retyped, because
-- retyping twelve function bodies to change one line each is how you lose a
-- clause nobody notices for a month. The gate line is rewritten, the result is
-- EXECUTEd, and the hit count is asserted at the end — the whole DO block is
-- one transaction, so a single mismatch rolls all twelve back untouched.
--
-- WHICH FUNCTIONS, AND WHY NOT THE OTHERS. The rule applied is: irreversible
-- or far-reaching writes get the factor; reads do not. Critically, a function
-- where is_admin() is one branch of a normal-user OR must NOT be swapped —
-- accept_bid, the five milestone functions, get_job_contract,
-- get_job_milestones, get_contractor_profile, build_contract_body,
-- remove_client_request, propose_milestones, set_quote, set_request_budget,
-- enforce_platform_pause, prevent_role_escalation and get_match_scores all
-- have that shape, and swapping them would demand a sign-in code from every
-- client and contractor on the platform.
--
-- Note regexp_replace replaces only the FIRST match without the 'g' flag,
-- which is what we want here: one gate line per function.

do $mig$
declare r record; v_def text; v_new text; v_hits int := 0;
begin
  for r in select * from (values
    ('admin_delete_job',            $l$perform public.log_admin_action('admin_delete_job', 'jobs', p_job_id::text, jsonb_build_object('force', p_force));$l$),
    ('admin_delete_request',        $l$perform public.log_admin_action('admin_delete_request', 'client_requests', p_request_id::text);$l$),
    ('admin_set_contractor_status', $l$perform public.log_admin_action('admin_set_contractor_status', 'contractors', p_id::text, jsonb_build_object('status', p_status));$l$),
    ('admin_rescue_signup',         $l$perform public.log_admin_action('admin_rescue_signup', 'auth.users', p_user::text, jsonb_build_object('kind', p_kind));$l$),
    ('set_platform_mode',           $l$perform public.log_admin_action('set_platform_mode', 'platform_settings', p_mode, jsonb_build_object('mode', p_mode));$l$),
    ('admin_refire_request',        $l$perform public.log_admin_action('admin_refire_request', 'client_requests', p_request_id::text);$l$),
    ('admin_queue_outreach',        $l$perform public.log_admin_action('admin_queue_outreach', 'outreach_targets', null);$l$),
    ('admin_import_outreach',       $l$perform public.log_admin_action('admin_import_outreach', 'outreach_targets', null);$l$),
    ('admin_rotate_social_bot_key', $l$perform public.log_admin_action('admin_rotate_social_bot_key', 'social_bot_keys', null);$l$),
    ('admin_review_social_action',  $l$perform public.log_admin_action('admin_review_social_action', 'social_actions', p_id::text);$l$),
    ('release_waitlisted_requests', $l$perform public.log_admin_action('release_waitlisted_requests', 'client_requests', null);$l$),
    ('assign_job',                  $l$perform public.log_admin_action('assign_job', 'client_requests', p_request_id::text, jsonb_build_object('contractor_id', p_contractor_id));$l$)
  ) as t(fn, log_call)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if v_def is null then
      raise exception 'function % not found, refusing to continue', r.fn;
    end if;

    -- Already on admin_guard(): just insert the log call after it. The log
    -- sits IMMEDIATELY AFTER THE GUARD on purpose — an RPC is one
    -- transaction, so "logged iff committed" comes free: a refused or failed
    -- action rolls its own log row back with it, and nothing can act without
    -- logging because the log is upstream of the work.
    v_new := regexp_replace(v_def, 'perform public\.admin_guard\(\);',
      'perform public.admin_guard();' || chr(10) || '  ' || r.log_call);

    -- Still on plain is_admin(): swap the gate AND insert the log call.
    if v_new = v_def then
      v_new := regexp_replace(v_def,
        'if not public\.is_admin\(\) then\s*raise exception ''[^'']*'';\s*end if;',
        'perform public.admin_guard();' || chr(10) || '  ' || r.log_call);
    end if;

    if v_new = v_def then
      raise exception 'gate line not found in %, refusing to continue', r.fn;
    end if;

    execute v_new;
    v_hits := v_hits + 1;
  end loop;

  if v_hits <> 12 then
    raise exception 'expected to patch 12 functions, patched %', v_hits;
  end if;
end
$mig$;


-- ────────────────────────────────────────────────────────────────────────────
-- Verification — run as one rolled-back probe, output verbatim.
-- ────────────────────────────────────────────────────────────────────────────
--   A. anon refused: Not authorized
--   B. auth.uid() resolves = f8da9f51-…, is_admin=true, mfa_ok=true
--   B. admin action OK
--   B. log rows written = 1
--   B. newest entry: hello@freddyfixit.ca | admin_set_contractor_status |
--      contractors | a01c49f7-… | {"status": "active"} | via=rpc
--   C. admin_action_allowed(admin, not enrolled) = {"ok": true}
--   C. admin_action_allowed(a client)            = {"ok": false, "reason": "Not authorized."}
--   C. admin_action_allowed(null)                = {"ok": false, "reason": "Not signed in."}
--   D. self-clear refused: You cannot switch off your own two-step sign-in …
--   E. break-glass on another user OK
--   F. admin now enrolled, unverified. mfa_ok=false
--   F. guarded action refused: Verify your sign-in code first, then try again.
--   F. admin_action_allowed(enrolled, unverified) = {"ok": false, "reason": "Verify …"}
--   F. admin read (audit tail) still works, rows=2
--   F. after verifying, guarded action OK
--   G. forge refused: permission denied for function log_admin_action
--   H. 7/7 platform_health_check passing
--
-- Static check across all 13 patched functions: guard=1, logged=1,
-- leftover_is_admin=0 for every one.
--
-- G is the one worth re-reading. `set local role authenticated` plus a forged
-- JWT claim cannot write to the log even though the admin RPCs can, because a
-- SECURITY DEFINER body executes with the owner's privileges while a direct
-- call from a user JWT does not. That is what makes the log unforgeable.


-- ────────────────────────────────────────────────────────────────────────────
-- Edge functions — deployed separately, NOT by this file.
-- ────────────────────────────────────────────────────────────────────────────
-- admin-delete-account v8, admin-update-email v8, admin-message v8 each now
-- call admin_action_allowed(caller) and FAIL CLOSED on any error resolving it,
-- then log through log_admin_action. Two details that are load-bearing:
--
--   · admin-delete-account logs BEFORE it deletes. Logging afterwards would
--     record a bare uuid, because the profile row carrying the email and name
--     is gone by then.
--   · admin-update-email logs AFTER, recording both addresses, because the
--     entry's whole purpose is answering "what was this login before?" once
--     the old address is nowhere in the database.
--   · admin-message logs ONE entry per batch, not per recipient.
--     admin_messages already holds the per-recipient rows and 200 entries
--     would drown every other action in the log; batch_id is the join back.
