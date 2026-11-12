-- pg_net timeouts on the cron kickers (2026-11-12).
--
-- net.http_post defaults to a 5 s timeout. reconcile-payouts averages 5.6 s and
-- visit-reminder 5.0 s, so on 2026-11-11 29 of 69 responses in
-- net._http_response were recorded as timeouts for calls that had returned 200.
-- The functions finish either way; what was wrong is that the database's own
-- record said they failed, which makes that table useless for spotting a real
-- failure. kick_newsletter already sets a timeout; these four did not.
--
-- Written as an in-place rewrite of the live definitions (not four full
-- CREATE OR REPLACE bodies) so the change is exactly one added argument and
-- nothing else in these functions can drift. Idempotent.
--
-- Payment gate: kick_reconcile_payouts only triggers the reconcile-payouts edge
-- function. None of the four payout guards (confirm_job_completion,
-- auto_confirm_stale_jobs, release-payment's 409, reconcile-payouts'
-- fully_funded filter) is touched.

do $do$
declare
  f   record;
  v   text;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('kick_reconcile_payouts', 'kick_visit_reminders',
                         'kick_collect_balances', 'kick_meta_lead_scout')
  loop
    v := pg_get_functiondef(f.oid);
    if position('timeout_milliseconds' in v) > 0 then continue; end if;
    if v !~ 'jsonb_build_object\(''source'',\s*''cron''\)' then
      raise exception 'anchor not found in %', f.proname;
    end if;
    execute regexp_replace(
      v,
      '(jsonb_build_object\(''source'',\s*''cron''\))',
      E'\\1,\n      timeout_milliseconds := 60000');
  end loop;
end
$do$;
