-- Money-safety guards.
--
-- withdraw_job() hard-DELETEs the job row. Every child table CASCADEs
-- (disputes, job_contracts, job_expenses, job_milestones, job_time_logs,
--  message_reads, messages, reviews), so withdrawing a PAID job destroyed the
-- only record of the Stripe payment intent -- release-payment and
-- reconcile-payouts would then have no row to find and the client's money
-- would sit in the platform balance with nothing pointing at it.
--
-- remove_client_request() cancelled the job with no refund and no warning when
-- the client's payment was already held.
--
-- Both now refuse and raise a plain-English message the dashboards surface.

create or replace function public.withdraw_job(p_job_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_contractor uuid;
  v_request    uuid;
  v_pay        text;
  v_status     text;
begin
  select contractor_id, request_id, payment_status, status
    into v_contractor, v_request, v_pay, v_status
    from jobs where id = p_job_id;

  if v_contractor is null then
    raise exception 'Job not found';
  end if;
  if v_contractor <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  -- money guard: never destroy a job that holds or has moved funds
  if coalesce(v_pay, 'unpaid') in ('held', 'released', 'disputed') then
    raise exception 'This job has already been paid for, so it cannot be withdrawn. Message the client, or contact support at hello@freddyfixit.ca to arrange a refund.';
  end if;

  if v_status in ('completed', 'pending_confirmation') then
    raise exception 'This job is already finished, so it cannot be withdrawn.';
  end if;

  if exists (
    select 1 from job_milestones m
     where m.job_id = p_job_id
       and m.status in ('funded', 'completed', 'released', 'disputed')
  ) then
    raise exception 'A stage of this job has already been funded, so it cannot be withdrawn. Contact support at hello@freddyfixit.ca.';
  end if;

  if exists (
    select 1 from jobs j
      join recurring_prepayments rp on rp.id = j.prepayment_id
     where j.id = p_job_id
       and rp.status in ('held', 'partially_released')
  ) then
    raise exception 'This visit is covered by a prepaid plan, so it cannot be withdrawn. Contact support at hello@freddyfixit.ca.';
  end if;

  delete from messages where job_id = p_job_id;
  delete from jobs where id = p_job_id;

  update client_requests
     set status = 'pending', assigned_contractor_id = null
   where id = v_request
     and status not in ('completed', 'cancelled');
end;
$function$;

create or replace function public.remove_client_request(p_request_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_client   uuid;
  v_assigned boolean := false;
begin
  select client_id into v_client from client_requests where id = p_request_id;
  if v_client is null then
    raise exception 'Request not found';
  end if;
  if v_client <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  -- money guard: a held payment must be refunded through support, not silently cancelled
  if exists (
    select 1 from jobs j
     where j.request_id = p_request_id
       and coalesce(j.payment_status, 'unpaid') in ('held', 'disputed')
  ) then
    raise exception 'You have already paid for this job, so it cannot be deleted here. Your money is still held safely. Contact us at hello@freddyfixit.ca and we will sort out a refund.';
  end if;

  if exists (
    select 1 from jobs j
     where j.request_id = p_request_id
       and j.status in ('in_progress', 'pending_confirmation')
  ) then
    raise exception 'Work on this job has already started, so it cannot be deleted here. Contact us at hello@freddyfixit.ca.';
  end if;

  if exists (
    select 1 from job_milestones m
      join jobs j on j.id = m.job_id
     where j.request_id = p_request_id
       and m.status in ('funded', 'completed', 'released', 'disputed')
  ) then
    raise exception 'You have already funded a stage of this job, so it cannot be deleted here. Contact us at hello@freddyfixit.ca and we will sort out a refund.';
  end if;

  if exists (select 1 from jobs where request_id = p_request_id) then
    v_assigned := true;
  end if;

  if v_assigned then
    update jobs set status = 'cancelled'
     where request_id = p_request_id
       and status not in ('completed', 'cancelled');
    update client_requests set status = 'cancelled' where id = p_request_id;
    return 'cancelled';
  else
    delete from client_requests where id = p_request_id;
    return 'deleted';
  end if;
end;
$function$;
