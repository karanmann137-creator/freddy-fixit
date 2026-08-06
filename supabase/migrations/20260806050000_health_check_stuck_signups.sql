-- Health check 7: no_stuck_signups
--
-- WHY THIS EXISTS.
-- Signup confirmation and password-reset email do NOT go through Resend like
-- the rest of our mail. They are sent by Supabase's own GoTrue mailer, on a
-- different sender and a different domain, which we do not monitor.
--
-- In Aug 2026 that path broke by itself. People signed up, received our Resend
-- welcome email, never received the GoTrue confirmation, and were locked out of
-- accounts they had just created. Nothing surfaced it: no error in the app, no
-- alert, no failed row anywhere. Three accounts sat stranded -- one of them an
-- already-approved contractor who had been getting job dispatch emails for five
-- days that he had no way to act on -- and we only found out because one of them
-- picked up the phone. Password reset runs through the same mailer, so the
-- obvious workaround was broken too.
--
-- The failure has a clean signature: an account that was created, never
-- confirmed, and never once signed in. This check watches for it.
--
-- The 24h-7d window has both ends on purpose. Starting at 24h means someone
-- still working through their inbox is not flagged. Ending at 7d means a
-- genuinely abandoned signup ages out on its own rather than pinning the check
-- red forever and training the owner to ignore it -- while a real mailer outage
-- re-fires every single day it continues, which is exactly what we want.
--
-- Back-tested against the incident it goes red on Aug 1, five days before the
-- first phone call, and stays clean on the four days before that.
--
-- Checks 1-6 are unchanged. search_path is widened to the project standard
-- (public, extensions, pg_temp) while we are in here.

CREATE OR REPLACE FUNCTION public.platform_health_check()
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_rate       numeric := platform_fee_rate();
  v_bad_fees   int;
  v_stuck      int;
  v_owing      int;
  v_short      int;
  v_signup     int;
  v_oldest_h   int;
  v_missing    text;
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

  -- 3) the functions the money path depends on all still exist
  select string_agg(want, ', ') into v_missing
  from (values ('platform_fee_rate'),('get_job_fee'),('referral_waiver_eligible'),
               ('list_open_jobs'),('admin_rank_contractors'),('kick_reconcile_payouts')) as t(want)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = t.want);
  check_name := 'critical_rpcs_present';
  ok := (v_missing is null);
  detail := coalesce('missing: ' || v_missing, 'all present');
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

  -- 7) SIGNUPS THAT NEVER GOT IN.  See the header comment -- this is the auth
  --    mailer outage that locked three people out of their own accounts for a
  --    week with nothing anywhere to show for it.
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
end $function$;
