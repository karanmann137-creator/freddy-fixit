-- P0 security fixes, 2026-08-25.  APPLIED LIVE VIA SUPABASE MCP — this file is
-- committed for version control only; running an installer does NOT apply it.
--
-- Five SECURITY DEFINER functions were EXECUTE-able by anon with no caller guard.
-- Revoking from `anon` alone is a no-op: the default grant is to PUBLIC, so
-- every revoke below names public, anon AND authenticated.
-- Every legitimate caller is a trigger or another SECURITY DEFINER function,
-- which runs as the owner (postgres) and is therefore unaffected by these revokes.
-- Verified callers:
--   notify_email               <- confirm_job_completion, propose_job_schedule,
--                                 propose_price_change, request_quote_revision,
--                                 trg_jobs_notify_client       (all SECURITY DEFINER)
--   enqueue_payment_receipt    <- receipt_on_job_release, receipt_on_milestone_release
--   enqueue_admin_alert        <- trg_admin_alert_new_contractor, trg_admin_alert_new_job
--   recompute_contractor_stats <- jobs_stats_trigger
--   build_contract_body        <- save_contract_draft + ContractPanel.tsx:128 (authenticated contractor)

-- P0-1: three anon-callable email primitives. Each does a net.http_post to an
-- edge function that sends real mail from noreply@freddyfixit.ca. Same shape as
-- the notify_user hole closed on 2026-08-04, which is why they were looked for.
revoke all on function public.notify_email(text, uuid)            from public, anon, authenticated;
revoke all on function public.enqueue_payment_receipt(text, uuid) from public, anon, authenticated;
revoke all on function public.enqueue_admin_alert(text, uuid)     from public, anon, authenticated;

-- P0-3: unauthenticated write to public.contractors, plus a correlated aggregate
-- over public.jobs on every call (a cheap DoS from an anon endpoint).
revoke all on function public.recompute_contractor_stats(uuid)    from public, anon, authenticated;

-- P0-2: build_contract_body was an IDOR returning a named client's home address,
-- job description, price and fee to anyone holding a job UUID and the public anon key.
--
-- The body is ~7.7k characters of legal text that must not be retyped, so the
-- original is RENAMED (which preserves it byte for byte) and a thin guarded
-- wrapper takes over the public name. The wrapper is SECURITY DEFINER owned by
-- postgres, so it can still reach the internal function after the revoke.
alter function public.build_contract_body(uuid) rename to build_contract_body_internal;
revoke all on function public.build_contract_body_internal(uuid) from public, anon, authenticated;

create function public.build_contract_body(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_job record;
begin
  select client_id, contractor_id into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job not found';
  end if;

  -- auth.uid() reads the JWT claim from the session, not the executing role, so
  -- this still identifies the real caller when reached through save_contract_draft.
  if v_uid is null
     or not (v_uid = v_job.contractor_id or v_uid = v_job.client_id or public.is_admin())
  then
    raise exception 'not authorized to view this agreement';
  end if;

  return public.build_contract_body_internal(p_job_id);
end
$fn$;

revoke all on function public.build_contract_body(uuid) from public, anon;
grant execute on function public.build_contract_body(uuid) to authenticated, service_role;
