-- Freddy Fix It -- money guard probe.
--
-- Run this whole file as ONE statement through the Supabase MCP execute_sql
-- tool (or psql). It is READ-ONLY IN EFFECT: it creates fixtures, asserts
-- against them, then reports by raising an exception, which rolls the whole
-- transaction back. Nothing is ever written.
--
-- Expected: MONEY GUARD PROBE (rolled back)  25/25 passed
--
-- What it proves:
--   payout guard 1  confirm_job_completion() raises with the exact balance owed
--   payout guard 2  auto_confirm_stale_jobs() skips under-funded jobs
--   all twelve refusal clauses in jobs_due_for_autopay()
--   a filed claim stops automatic balance collection, permanently
--   the three dispute-path owner checks refuse a caller with no sign-in
--   platform_health_check() is green on real data, and check 5 notices a ghost client
--   collect-balances / reconcile-payouts / platform-health-check crons are armed
--
-- What it CANNOT prove:
--   payout guards 3 and 4 live in the release-payment and reconcile-payouts
--   edge functions. Verify those by reading deployed source.
--   Nothing here touches Stripe, so this proves the DECISION logic and never
--   the charge itself.
--
-- Two ordering rules, both learned by getting them wrong:
--   * take the health baseline BEFORE creating fixtures, or the probe's own
--     synthetic ghost-client job trips check 5 and the harness fails itself.
--   * platform_health_check() returns a TABLE (check_name/ok/detail), not jsonb.
--
-- An MCP SQL session has no auth.uid(), so owner-checked RPCs refuse. The
-- set_config('request.jwt.claims', ..., true) calls below impersonate a real
-- user for the length of the transaction. No admin login is needed.

do $probe$
declare
  v_client uuid; v_pro uuid; v_other uuid;
  j uuid; jf uuid;
  n int; got text; r text := ''; np int := 0; nf int := 0;
  hc_good int; hc_tot int; hc_bad text;
begin
  create temp table _mp(ok boolean, label text, detail text) on commit drop;

  -- HEALTH BASELINE must be taken BEFORE fixtures exist, or the probe's own
  -- synthetic ghost-client job trips check 5 and the harness fails itself.
  select count(*) filter (where ok), count(*),
         coalesce(string_agg(check_name, ', ') filter (where not ok), '')
    into hc_good, hc_tot, hc_bad from platform_health_check();
  insert into _mp values (hc_good = hc_tot,
    'HEALTH 1: platform_health_check all green (real data)', hc_good||'/'||hc_tot||' '||hc_bad);

  insert into _mp values (
    (select count(*) from cron.job where jobname='collect-balances' and active) = 1,
    'CRON 1: autopay sweep collect-balances is armed', '');
  insert into _mp values (
    (select count(*) from cron.job where jobname='reconcile-payouts' and active) = 1,
    'CRON 2: reconcile-payouts is armed', '');
  insert into _mp values (
    (select count(*) from cron.job where jobname='platform-health-check' and active) = 1,
    'CRON 3: platform-health-check is armed', '');

  select id into v_client from profiles where role='client' order by created_at limit 1;
  select id into v_other from profiles where role='client' and id <> v_client order by created_at limit 1;
  select id into v_pro   from contractors where status='active' order by created_at limit 1;
  if v_client is null or v_pro is null then raise exception 'no fixtures available'; end if;

  insert into jobs (client_id, contractor_id, amount, client_fee, total_charged, funded_amount,
                    deposit_rate, payment_status, status, contractor_completed_at,
                    autopay_balance, autopay_attempts, stripe_customer_id, stripe_payment_method_id)
  values (v_client, v_pro, 100, 3, 103, 41.20, 0.40, 'held', 'pending_confirmation',
          now() - interval '5 hours', true, 0, 'cus_PROBE', 'pm_PROBE')
  returning id into j;

  insert into jobs (client_id, contractor_id, amount, client_fee, total_charged, funded_amount,
                    deposit_rate, payment_status, status, contractor_completed_at,
                    autopay_balance, autopay_attempts, stripe_customer_id, stripe_payment_method_id)
  values (v_client, v_pro, 100, 3, 103, 103, 0.40, 'held', 'pending_confirmation',
          now() - interval '5 hours', true, 0, 'cus_PROBE', 'pm_PROBE')
  returning id into jf;

  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 1, 'autopay 01: a qualifying job is selected', 'got '||n);
  select count(*) into n from jobs_due_for_autopay(100) where job_id = jf;
  insert into _mp values (n = 0, 'autopay 02: fully-funded job refused', 'got '||n);

  update jobs set contractor_completed_at = now() - interval '30 minutes' where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 03: refuses inside the 2h undo grace', 'got '||n);
  update jobs set contractor_completed_at = now() - interval '5 hours' where id = j;

  update jobs set is_milestone = true where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 04: refuses a milestone job', 'got '||n);
  update jobs set is_milestone = false where id = j;

  update jobs set price_change_pending = '{"amount":150}'::jsonb where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 05: refuses while a price change is pending', 'got '||n);
  update jobs set price_change_pending = null where id = j;

  update jobs set autopay_balance = false where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 06: refuses when the client switched it off', 'got '||n);
  update jobs set autopay_balance = true where id = j;

  update jobs set autopay_attempts = 3 where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 07: refuses after 3 attempts', 'got '||n);
  update jobs set autopay_attempts = 0 where id = j;

  update jobs set autopay_last_attempt_at = now() - interval '2 hours' where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 08: refuses within 24h of the last attempt', 'got '||n);
  update jobs set autopay_last_attempt_at = null where id = j;

  update jobs set stripe_payment_method_id = null where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 09: refuses with no saved card', 'got '||n);
  update jobs set stripe_payment_method_id = 'pm_PROBE' where id = j;

  update jobs set payment_status = 'unpaid' where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 10: refuses an unpaid job', 'got '||n);
  update jobs set payment_status = 'held' where id = j;

  update jobs set status = 'in_progress' where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'autopay 11: refuses a job not yet finished', 'got '||n);
  update jobs set status = 'pending_confirmation' where id = j;

  update jobs set payment_status = 'disputed', disputed_at = now() where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'CLAIM 1: filing a claim stops the automatic charge', 'got '||n);

  update jobs set payment_status = 'held' where id = j;
  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 0, 'CLAIM 2: autopay never resumes after a claim', 'got '||n);
  update jobs set disputed_at = null where id = j;

  select count(*) into n from jobs_due_for_autopay(100) where job_id = j;
  insert into _mp values (n = 1, 'autopay 12: fixture restored to qualifying', 'got '||n);

  perform set_config('request.jwt.claims', json_build_object('sub', v_client::text, 'role','authenticated')::text, true);
  begin
    perform confirm_job_completion(j);
    insert into _mp values (false, 'GUARD 1a: raises on an under-funded job', 'did NOT raise');
  exception when others then
    got := sqlerrm;
    insert into _mp values (got like '%remaining balance of $61.80%',
      'GUARD 1a: raises with the exact balance owed', got);
  end;

  begin
    perform confirm_job_completion(jf);
    insert into _mp values (true, 'GUARD 1b: a fully-funded job still confirms', 'not over-tightened');
  exception when others then
    insert into _mp values (false, 'GUARD 1b: a fully-funded job still confirms', sqlerrm);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(v_other, v_pro)::text, 'role','authenticated')::text, true);
  begin
    perform confirm_job_completion(j);
    insert into _mp values (false, 'AUTH 1: another signed-in user cannot confirm your job', 'did NOT raise');
  exception when others then
    insert into _mp values (sqlerrm like '%Not authorized%', 'AUTH 1: another signed-in user cannot confirm your job', sqlerrm);
  end;

  perform set_config('request.jwt.claims', '', true);
  begin
    perform confirm_job_completion(j);
    insert into _mp values (false, 'AUTH 2: a caller with no sign-in cannot confirm', 'did NOT raise');
  exception when others then
    insert into _mp values (sqlerrm like '%Not authorized%', 'AUTH 2: a caller with no sign-in cannot confirm', sqlerrm);
  end;

  begin
    perform open_dispute(j, 'workmanship', 'probe', current_date, 'probe', 'refund', 10, 'probe', null);
    insert into _mp values (false, 'AUTH 3: a caller with no sign-in cannot file a claim', 'did NOT raise');
  exception when others then
    insert into _mp values (sqlerrm like '%Not authorized%', 'AUTH 3: a caller with no sign-in cannot file a claim', sqlerrm);
  end;

  update jobs set contractor_completed_at = now() - interval '10 days', status = 'pending_confirmation'
   where id = j;
  perform auto_confirm_stale_jobs();
  select status into got from jobs where id = j;
  insert into _mp values (got = 'pending_confirmation',
    'GUARD 2: auto-confirm skips an under-funded job', 'status='||got);

  -- the detector must NOTICE the ghost client the fixture now represents
  select count(*) filter (where not ok) into n
    from platform_health_check() where check_name = 'no_unpaid_balances';
  insert into _mp values (n = 1,
    'HEALTH 2: check 5 detects a ghost-client job', 'red as expected='||n);

  select count(*) filter (where ok), count(*) filter (where not ok) into np, nf from _mp;
  select string_agg((case when ok then 'PASS  ' else 'FAIL  ' end)||label||
                    (case when ok then '' else E'\n         --> '||coalesce(detail,'') end), E'\n' order by label)
    into r from _mp;
  raise exception E'MONEY GUARD PROBE (rolled back)  %/% passed\n%', np, np+nf, r;
end
$probe$;
