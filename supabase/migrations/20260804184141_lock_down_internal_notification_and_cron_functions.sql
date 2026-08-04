-- Internal-only SECURITY DEFINER functions must not be callable over PostgREST.
-- Every legitimate caller is either another SECURITY DEFINER function (runs as
-- postgres), a trigger, pg_cron (postgres), or an edge function using the
-- service-role key. None of them lose access here.
--
-- NOTE: the default grant is to PUBLIC (proacl "=X/postgres"), so revoking from
-- anon/authenticated alone is a NO-OP. PUBLIC must be revoked too.
-- Target ACL shape is the one release_unconfirmed_visits already has:
--   {postgres=X/postgres,service_role=X/postgres}
do $$
declare
  r record;
  v_names text[] := array[
    'notify_user',
    '_notify',
    'kick_newsletter',
    'kick_reconcile_payouts',
    'kick_visit_reminders',
    'run_reminders',
    'run_platform_health_check',
    'escalate_stale_unbid_requests',
    'auto_confirm_stale_jobs',
    'auto_approve_stale_milestones',
    'generate_recurring_occurrences'
  ];
  v_sig text;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(v_names)
  loop
    v_sig := format('public.%I(%s)', r.proname, r.args);
    execute format('revoke all on function %s from public', v_sig);
    execute format('revoke all on function %s from anon', v_sig);
    execute format('revoke all on function %s from authenticated', v_sig);
    execute format('grant execute on function %s to service_role', v_sig);
    execute format('grant execute on function %s to postgres', v_sig);
  end loop;
end $$;
