-- Close anonymous access to nine SECURITY DEFINER functions (2026-11-12).
--
-- The 2026-11-11 audit found 72 SECURITY DEFINER functions executable by
-- `anon`, 23 of them with no caller check in the body. Most of those 23 are
-- meant to be public (homepage reviews, pricing, the quote form, platform
-- status). These nine are not: nothing calls them before sign-in.
--
-- Checked for each, against supabase/schema/ and src/:
--   * not referenced by any RLS policy (a revoke there fails CLOSED and locks
--     real users out, which is the dangerous direction);
--   * every SQL caller is itself SECURITY DEFINER, so it runs as the owner and
--     is unaffected;
--   * edge functions call them with the service-role client.
--
-- The default grant is to PUBLIC, so revoking from anon alone is a no-op.

-- Signed-in callers and edge functions only.
do $do$
declare fn text;
begin
  foreach fn in array array[
    'public.admin_import_outreach(jsonb)',
    'public.admin_queue_outreach(text, integer, uuid)',
    'public.assign_job(uuid, uuid)',
    'public.bid_thread_open(uuid, uuid)',
    'public.get_job_fee(uuid, uuid)',
    'public.job_money_block(uuid)',
    'public.referral_waiver_eligible(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  -- Internal only: called by a trigger or by another definer function.
  foreach fn in array array[
    'public.gen_referral_code()',
    'public.trg_notify_request_received()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$do$;
