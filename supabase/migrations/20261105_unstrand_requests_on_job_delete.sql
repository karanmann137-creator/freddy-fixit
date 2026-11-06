-- 2026-11-05 — Stranded requests: a deleted job left its request unreachable.
--
-- Found by auditing why 12 requests produced 1 job. Clients were NOT failing to
-- pick: six of twelve requests got an accepted bid. Five of those six had no job
-- row at all, and the state they were left in was invisible from every surface:
--
--   * client_requests sat in 'matched' with assigned_contractor_id set and no job,
--   * ClientDashboard loads bids only for status='pending', so the client saw no
--     estimates, no job panel, a "matched" pill, and no error,
--   * run_reminders step 4 filters assigned_contractor_id IS NULL, so no nudge
--     went out either.
--
-- Root cause: admin_delete_job deleted the job row and nothing else. Its three
-- siblings all hand the request back — withdraw_job and decline_price_reopen reset
-- status and clear the assignee, remove_client_request removes the request too.
-- admin_delete_job was simply missing the step. Four calls in admin_audit_log.
--
-- MONEY: this touches NONE of the four payout guards. It adds no branch that
-- receives money (nothing increments funded_amount) and no branch that pays out
-- (nothing needs fully_funded). confirm_job_completion(), auto_confirm_stale_jobs(),
-- release-payment's 409 and reconcile-payouts' fully_funded filter are untouched.
-- The job_money_block(p_job_id) check, admin_guard() and the log_admin_action call
-- immediately after the guard are all preserved verbatim. create-or-replace is used
-- deliberately rather than drop+create, so the ACL survives (drop+create resets it
-- to Supabase's default grant to anon and authenticated — the 2026-11-04 lesson).
--
-- APPLIED LIVE 2026-11-05 via Supabase MCP. Committed here for version control only;
-- installers do not apply DB changes.

create or replace function public.admin_delete_job(p_job_id uuid, p_force boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_block   text;
  v_request uuid;
  v_reset   int;
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_delete_job', 'jobs', p_job_id::text, jsonb_build_object('force', p_force));

  if not p_force then
    v_block := public.job_money_block(p_job_id);
    if v_block is not null then
      raise exception 'This job holds money and was not deleted. %  (Refund the charge in Stripe first, then re-run with p_force => true.)', v_block;
    end if;
  end if;

  -- Capture the parent request BEFORE the delete, or it is unrecoverable.
  select request_id into v_request from public.jobs where id = p_job_id;

  delete from public.jobs where id = p_job_id;

  -- Hand the request back to the client, exactly as withdraw_job and
  -- decline_price_reopen do. Without this the request is STRANDED: it sits in
  -- 'matched' with an assignee and no job row, so ClientDashboard loads no bids
  -- (it reads bids only for status='pending'), shows no job panel, and raises no
  -- error -- and run_reminders step 4 skips it because assigned_contractor_id is
  -- not null, so no nudge goes out either. Five live requests reached that state
  -- before this was added (2026-11-05).
  if v_request is not null then
    update public.client_requests
       set status = 'pending', assigned_contractor_id = null
     where id = v_request
       and status not in ('completed', 'cancelled');
    get diagnostics v_reset = row_count;

    -- Resurface the estimates so the client can re-pick. An accepted bid left
    -- accepted on a re-opened request is invisible to the dashboard's
    -- status='pending' read -- the client would see fewer estimates than they
    -- originally got, with nothing explaining where one went.
    --
    -- The `not waitlisted` test is load-bearing, NOT cosmetic: bids carries a
    -- BEFORE UPDATE trigger (block_bids_on_waitlisted) that RAISES when the
    -- parent request is waitlisted, which would abort the admin's delete over a
    -- secondary tidy-up. The delete is the admin's intent; the resurface is not
    -- allowed to veto it. Tested explicitly rather than swallowed in a catch-all.
    --
    -- preferred_contractor_id is deliberately NOT cleared (withdraw_job doesn't
    -- either): it is a visibility reservation read by notify_preferred_contractor
    -- and list_open_jobs, not an auto-assign, and an admin cleanup should not
    -- silently discard a client's stated preference.
    if v_reset > 0 and not exists (
      select 1 from public.client_requests r where r.id = v_request and r.waitlisted
    ) then
      update public.bids set status = 'pending'
       where request_id = v_request and status = 'accepted';
    end if;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Data repair: the five requests already stranded.
--
-- refire_count is forced to 2 (the cap refire_stale_requests honours) so this
-- repair cannot restart contractor outreach on leads that are two to three
-- months old. escalate_stale_unbid_requests already excludes them — it requires
-- a request with NO bids, and all five have bids.
-- ---------------------------------------------------------------------------

with targets as (
  select unnest(array[
    '420a4f6c-4410-41fb-9e2f-c335eb5f7aa6','78816de2-e755-41ce-a611-81cdd5c0533c',
    '46211b55-78e4-4aab-8965-96aa52b01b62','24a44198-3bc7-4144-bb36-c3c563cc91ba',
    'd61d0a1a-ec61-4020-a75c-1f103e7cd037']::uuid[]) as id
), fix_req as (
  update client_requests cr
     set status = 'pending', assigned_contractor_id = null, refire_count = 2
   where cr.id in (select id from targets)
     and cr.status not in ('completed','cancelled')
  returning cr.id
), fix_bids as (
  update bids b set status = 'pending'
   where b.request_id in (select id from targets) and b.status = 'accepted'
  returning b.id
)
select (select count(*) from fix_req) as requests_reset,
       (select count(*) from fix_bids) as bids_resurfaced;

-- ---------------------------------------------------------------------------
-- run_reminders() step 4 — the "estimates waiting" nudge. THREE bugs.
--
-- Applied live as a surgical replacement of the step-4 block inside the existing
-- run_reminders() body (read pg_get_functiondef, assert the old block matched
-- exactly once, replace, execute). The rest of the function's nine steps are
-- unchanged, so the whole 500-line source is not restated here. The new block:
--
--   * counts only bids with status='pending', matching what ClientDashboard
--     actually renders. It used to count every bid, accepted and declined
--     included, so the email could promise more estimates than the page shows.
--   * links to /pick/<pick_token> rather than /client-dashboard. Every request
--     already carries a pick_token and /pick/:token is mounted in App.tsx, but
--     only the first-bid email was using them — every later nudge sent the
--     client into a login wall, the step PickPro.tsx records as having lost the
--     platform's first four clients.
--   * will not fire when the newest bid is older than 30 days. A cron is the
--     wrong sender for "your estimates are waiting" on a three-month-old
--     request; that lead belongs to the owner personally. Without the ceiling,
--     the data repair above would silently have mailed all five clients.
--
-- Verified: with the ceiling in place, exactly one open request falls in the
-- window, and its dedupe key is unchanged, so no email fires from this change.
-- ---------------------------------------------------------------------------
