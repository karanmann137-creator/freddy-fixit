-- platform_health_check(): 7 checks -> 9, and check 3 widened.
--
-- WHY (2026-11-04). The owner asked why every fault on this platform is
-- discovered by him, personally, in the course of using it. The answer is
-- structural: all seven existing checks read the `jobs` table and assert
-- relationships between values that EXIST. Every outage actually suffered here
-- has been an ABSENCE -- a confirmation email that never sent, a <ContractPanel/>
-- mount that got dropped and made every job unpayable, a module that built to
-- zero bytes, and on this day a second-factor gate whose remedy was reachable
-- from nowhere in the product. You cannot SQL-query a missing button, which is
-- why the check sat at 7/7 green while he was locked out of his own dashboard.
--
-- The mount class is now caught in CI by tools/check_mounts.py, which reads the
-- tree rather than the data. What is added HERE is the subset of the absence
-- class that the database genuinely can see:
--
--   check 3 widened -- the gates and doors themselves. If mfa_verify() or
--     contract_ready() ever vanishes, a gate silently stops gating or a door
--     silently disappears, and nothing else reports it.
--   check 8 admin_can_act -- the exact 2026-11-04 lockout, stated as the harm
--     rather than as a usage statistic. Goes red the moment an enrolled admin's
--     12-hour window lapses, which is hours BEFORE he next tries to approve
--     something and meets a refusal.
--   check 9 no_jobs_blocked_on_payout_onboarding -- flagged in
--     PAYMENT-AUDIT-2026-08-18.md and never enforced: contract_ready()'s fifth
--     reason requires stripe_payouts_enabled, so a job assigned to a contractor
--     who has not finished onboarding walks the client through price and time
--     and then parks them on ContractPanel's waiting branch indefinitely.
--
-- Deliberately NOT added: a generic "feature table has 0 rows" sweep. On a
-- platform with 12 requests and 5 jobs almost every feature table is legitimately
-- empty, so such a check would be red on day one and stay red -- and a gate that
-- cries wolf is a gate someone learns to skip. Both checks below are precise and
-- SELF-CLEARING: each goes green the moment the underlying harm is resolved.
--
-- MONEY: touches none of the four payout guards. Read-only; computes no charge,
-- writes nothing, cannot affect funded_amount or fully_funded.
--
-- Signature is unchanged -- same TABLE(check_name, ok, detail) -- so CREATE OR
-- REPLACE is safe here and no grant needs re-issuing.

create or replace function public.platform_health_check()
returns table(check_name text, ok boolean, detail text)
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_rate       numeric := platform_fee_rate();
  v_bad_fees   int;
  v_stuck      int;
  v_owing      int;
  v_short      int;
  v_signup     int;
  v_oldest_h   int;
  v_missing    text;
  v_lapsed     int;
  v_noadmin    int;
  v_blocked    int;
  v_pros       int;
begin
  -- 1) fee rate is sane (a corrupted/blank rate would mis-charge everyone)
  check_name := 'fee_rate_sane';
  ok := (v_rate is not null and v_rate >= 0 and v_rate < 0.20);
  detail := 'platform_fee_rate() = ' || coalesce(v_rate::text,'NULL');
  return next;

  -- 2) every charged fee equals either the waived 0 or exactly amount*rate.
  select count(*) into v_bad_fees
  from jobs
  where client_fee is not null
    and amount is not null
    and client_fee <> 0
    and abs(client_fee - round(amount * v_rate, 2)) > 0.01;
  check_name := 'charged_fees_consistent';
  ok := (v_bad_fees = 0);
  detail := v_bad_fees || ' charged job(s) whose fee != 0 and != amount*rate';
  return next;

  -- 3) the functions the money path depends on all still exist.
  --
  --    Widened 2026-11-04 from 6 names to 15. The original six were money-path
  --    only; the additions are the GATES and the DOORS. A gate that disappears
  --    does not raise -- `admin_guard()` missing means the thirteen destructive
  --    RPCs stop demanding a second factor, and `contract_ready` missing means
  --    the fail-closed payment gate has nothing to consult. A door that
  --    disappears is the 2026-11-04 lockout: without `mfa_request_code` /
  --    `mfa_verify` an enrolled admin can never clear `admin_guard()` again.
  --    Absence is the whole failure mode, so absence is what this asserts.
  select string_agg(want, ', ') into v_missing
  from (values ('platform_fee_rate'),('get_job_fee'),('referral_waiver_eligible'),
               ('list_open_jobs'),('admin_rank_contractors'),('kick_reconcile_payouts'),
               -- gates
               ('admin_guard'),('admin_action_allowed'),('mfa_ok'),
               ('contract_ready'),('job_money_block'),
               -- doors: the surfaces that let someone SATISFY a gate
               ('mfa_request_code'),('mfa_verify'),('mfa_use_recovery'),('mfa_status')
       ) as t(want)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = t.want);
  check_name := 'critical_rpcs_present';
  ok := (v_missing is null);
  detail := coalesce('missing: ' || v_missing, 'all 15 present (6 money, 5 gates, 4 doors)');
  return next;

  -- 4) no confirmed+FULLY FUNDED payout left unreleased for >2h
  select count(*) into v_stuck
  from jobs
  where status = 'completed'
    and payment_status = 'held'
    and coalesce(fully_funded, false)
    and client_confirmed_at is not null
    and disputed_at is null
    and client_confirmed_at < now() - interval '2 hours';
  check_name := 'no_stuck_payouts';
  ok := (v_stuck = 0);
  detail := v_stuck || ' confirmed job(s) held >2h without payout';
  return next;

  -- 5) the ghost-client case: the work is finished, the deposit is held, and the
  --    client has never come back to pay the balance. Auto-confirm deliberately
  --    skips these, so nothing else will ever surface them.
  select count(*) into v_owing
  from jobs
  where payment_status = 'held'
    and not coalesce(fully_funded, false)
    and disputed_at is null
    and contractor_completed_at is not null
    and contractor_completed_at < now() - interval '3 days';
  check_name := 'no_unpaid_balances';
  ok := (v_owing = 0);
  detail := v_owing || ' finished job(s) with a balance unpaid for >3 days';
  return next;

  -- 6) the funding invariant itself: nothing may have paid out for more than we
  --    actually collected.
  select count(*) into v_short
  from jobs
  where payment_status = 'released'
    and total_charged is not null
    and funded_amount < total_charged - 0.01;
  check_name := 'no_underfunded_payouts';
  ok := (v_short = 0);
  detail := v_short || ' released job(s) that were paid out while under-funded';
  return next;

  -- 7) SIGNUPS THAT NEVER GOT IN.  Auth email (confirmation + password reset)
  --    goes out through Supabase's own GoTrue mailer, NOT through Resend like
  --    the rest of our mail -- a completely separate sender and domain. When
  --    that path broke in Aug 2026 people signed up, received our Resend
  --    welcome, never received the confirmation, and were silently locked out.
  --    Nothing anywhere surfaced it; we only found out because one contractor
  --    phoned. Three accounts were stuck, one an already-approved pro who had
  --    been getting job emails for five days that he could not act on.
  --
  --    Signature of the failure: created, never confirmed, never once signed in.
  --    The window starts at 24h so a person still working through their inbox
  --    is not flagged, and ends at 7d so a genuine abandoned signup ages out on
  --    its own instead of pinning the check red forever. A real mailer outage
  --    keeps re-firing every day it continues, which is exactly what we want.
  select count(*),
         coalesce(max(extract(epoch from (now() - u.created_at)) / 3600), 0)::int
    into v_signup, v_oldest_h
  from auth.users u
  where u.email_confirmed_at is null
    and u.last_sign_in_at is null
    and u.created_at < now() - interval '24 hours'
    and u.created_at > now() - interval '7 days';
  check_name := 'no_stuck_signups';
  ok := (v_signup = 0);
  detail := case
              when v_signup = 0 then 'every signup in the last 7 days got in'
              else v_signup || ' account(s) never confirmed and never signed in (oldest '
                   || v_oldest_h || 'h) - check the Supabase auth mailer'
            end;
  return next;

  -- 8) CAN THE ADMIN ACTUALLY ACT?  (added 2026-11-04, the day it bit)
  --
  --    `mfa_ok()` counts a code verified in the last 12 hours, and
  --    `admin_guard()` sits on thirteen destructive RPCs. So an enrolled admin
  --    whose window has lapsed is refused by every one of them -- he cannot
  --    approve a contractor, resolve a dispute, or change platform mode. On
  --    2026-11-04 that is exactly what happened: enrolled at 21:48 the previous
  --    day, the window aged out, and the refusal named a code that NO surface in
  --    the product could request, because the only caller of
  --    mfa_verify(purpose='login') was the password form on /login and he signs
  --    in with Google. He sat locked out with a pending contractor waiting.
  --
  --    This asks `admin_action_allowed(id)` rather than re-deriving the 12-hour
  --    rule, so this check and the live gate can never disagree -- that function
  --    exists precisely for callers with no `auth.uid()`, which is what a cron
  --    health check is.
  --
  --    Self-clearing: green again the moment he enters a code. It can only be
  --    red while he is genuinely blocked, so it cannot cry wolf.
  select count(*) into v_lapsed
  from profiles p
  where p.role = 'admin'
    and not coalesce((public.admin_action_allowed(p.id)->>'ok')::boolean, true);

  -- A platform with no admin at all is a different and worse problem, and it
  -- would otherwise read as a clean pass on an empty set -- `[].every()` is true.
  select count(*) into v_noadmin from profiles where role = 'admin';

  check_name := 'admin_can_act';
  ok := (v_lapsed = 0 and v_noadmin > 0);
  detail := case
              when v_noadmin = 0 then 'NO account has role=admin - nobody can administer the platform'
              when v_lapsed = 0  then v_noadmin || ' admin(s), all currently able to act'
              else v_lapsed || ' of ' || v_noadmin || ' admin(s) blocked: two-step window lapsed, so every '
                   || 'guarded action is refused. Fix: sign in and enter the emailed code, or use a recovery code.'
            end;
  return next;

  -- 9) JOBS HEADED FOR A WALL THEY CANNOT SEE.
  --
  --    `contract_ready()`'s fifth reason requires `contractors.stripe_payouts_enabled`
  --    -- no client may ever be charged for a job whose contractor has nowhere to
  --    be paid. Correct, and invisible: the client clears price and time, reaches
  --    the agreement step, and gets ContractPanel's waiting branch ("your
  --    contractor is preparing the agreement") with no timeframe and no
  --    escalation, indefinitely. The contractor is not told either.
  --
  --    Named in PAYMENT-AUDIT-2026-08-18.md and never enforced until now, which
  --    is the whole reason this migration exists: a finding written into a file
  --    that nothing reads is not a safeguard.
  --
  --    Counts only ASSIGNED, unpaid, undisputed jobs -- a completed or released
  --    job is past the gate and a contractor who later lapses cannot retro-break
  --    it. Self-clearing the moment onboarding finishes.
  select count(*), count(distinct j.contractor_id) into v_blocked, v_pros
  from jobs j
  join contractors c on c.id = j.contractor_id
  where j.payment_status = 'unpaid'
    and j.status not in ('cancelled','completed')
    and j.disputed_at is null
    and not coalesce(c.stripe_payouts_enabled, false);
  check_name := 'no_jobs_blocked_on_payout_onboarding';
  ok := (v_blocked = 0);
  detail := case
              when v_blocked = 0 then 'no live job is waiting on contractor payout onboarding'
              else v_blocked || ' live job(s) can never be paid: ' || v_pros
                   || ' contractor(s) have not finished Stripe payout onboarding, so '
                   || 'contract_ready() refuses and the client waits with no explanation'
            end;
  return next;
end $function$;
