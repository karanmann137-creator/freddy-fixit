-- 20260831_withdraw_job_restore_bids.sql
--
-- Destroying a job must also release its bids.
--
-- withdraw_job() and admin_delete_job() both delete the job row, but neither
-- touches `bids`. The winning bid stays 'accepted' and the losers stay
-- 'declined', so a request returned to 'pending' carries estimates that can
-- no longer be acted on or re-quoted. Observed live on request 420a4f6c.
--
-- admin_delete_job additionally never reset client_requests, leaving the
-- request 'matched' and pointing at a contractor with no job.
--
-- MONEY: neither payout guard set is touched. job_money_block() still runs
-- first and unchanged in both functions; the new statements execute only once
-- it has returned NULL, i.e. only on a job holding no money.

create or replace function public.withdraw_job(p_job_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_contractor uuid;
  v_request    uuid;
  v_status     text;
  v_block      text;
begin
  select contractor_id, request_id, status
    into v_contractor, v_request, v_status
    from jobs where id = p_job_id;

  if v_contractor is null then
    raise exception 'Job not found';
  end if;
  if v_contractor <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  v_block := public.job_money_block(p_job_id);
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  if v_status in ('completed', 'pending_confirmation') then
    raise exception 'This job is already finished, so it cannot be withdrawn.';
  end if;

  delete from messages where job_id = p_job_id;
  delete from jobs where id = p_job_id;

  update client_requests
     set status = 'pending', assigned_contractor_id = null
   where id = v_request
     and status not in ('completed', 'cancelled');

  -- NEW: put the estimates back in play alongside the request.
  update bids
     set status = 'pending'
   where request_id = v_request
     and status in ('accepted', 'declined');
end;
$function$;

create or replace function public.admin_delete_job(p_job_id uuid, p_force boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_block   text;
  v_request uuid;
begin
  perform public.admin_guard();

  select request_id into v_request from public.jobs where id = p_job_id;

  if not p_force then
    v_block := public.job_money_block(p_job_id);
    if v_block is not null then
      raise exception 'This job holds money and was not deleted. %  (Refund the charge in Stripe first, then re-run with p_force => true.)', v_block;
    end if;
  end if;

  delete from public.jobs where id = p_job_id;

  -- NEW: the request and its estimates go back on the board too, or the
  -- request is stranded 'matched' against a contractor with no job.
  update public.client_requests
     set status = 'pending', assigned_contractor_id = null
   where id = v_request
     and status not in ('completed', 'cancelled');

  update public.bids
     set status = 'pending'
   where request_id = v_request
     and status in ('accepted', 'declined');
end;
$function$;

-- One-off repair for requests already stranded by the old behaviour.
--
-- Scoped by SHAPE, not by id. The shape is unambiguous and can only have been
-- produced by the bug: an accepted-or-declined bid on a request that is back
-- at 'pending', has no assigned contractor, and has no job row anywhere. A
-- request that is pending for ordinary reasons carries 'pending' bids, so
-- this cannot touch one. Known live match: request 420a4f6c (one accepted
-- $375 plumbing bid, one declined sibling).
update public.bids b
   set status = 'pending'
 where b.status in ('accepted', 'declined')
   and exists (
     select 1 from public.client_requests r
      where r.id = b.request_id
        and r.status = 'pending'
        and r.assigned_contractor_id is null
   )
   and not exists (
     select 1 from public.jobs j where j.request_id = b.request_id
   );
