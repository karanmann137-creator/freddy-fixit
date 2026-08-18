-- decline_price_reopen lets a client who was quoted one price and then asked for
-- more walk away and re-pick from the bids already on their request. It cancels
-- the job, so it must carry the same money guards as withdraw_job: a job that
-- holds funds anywhere must never be cancelled out from under a live Stripe
-- payment intent. The original only tested payment_status in ('held','released'),
-- which misses 'disputed', and misses milestone/prepay jobs entirely — those can
-- hold real money while jobs.payment_status is still 'unpaid'.
-- Also pins search_path to include extensions (house rule).
create or replace function public.decline_price_reopen(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_client uuid; v_contractor uuid; v_req uuid; v_pay text; v_reopened int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select client_id, contractor_id, request_id, payment_status
    into v_client, v_contractor, v_req, v_pay
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if v_client <> auth.uid() then raise exception 'Not authorized'; end if;

  -- Money guard 1: whole-job funds.
  if coalesce(v_pay,'unpaid') in ('held','released','disputed') then
    raise exception 'You have already paid on this job, so it cannot be re-opened to other pros. Open a claim from your dashboard, or email hello@freddyfixit.ca and we will sort the refund.';
  end if;

  -- Money guard 2: a milestone job can hold funds per stage while the job-level
  -- payment_status is still 'unpaid'.
  if exists (
    select 1 from job_milestones m
     where m.job_id = p_job_id
       and m.status in ('funded','completed','released','disputed')
  ) then
    raise exception 'A stage of this job has already been paid for, so it cannot be re-opened to other pros. Email hello@freddyfixit.ca and we will sort the refund.';
  end if;

  -- Money guard 3: a prepaid recurring visit is covered by a pool charge.
  if exists (
    select 1 from jobs j
      join recurring_prepayments rp on rp.id = j.prepayment_id
     where j.id = p_job_id
       and rp.status in ('held','partially_released')
  ) then
    raise exception 'This visit is covered by a prepaid plan, so it cannot be re-opened to other pros. Email hello@freddyfixit.ca.';
  end if;

  -- Void this job. Nothing is deleted: the chat, the agreement and the history
  -- all survive on the cancelled row.
  update jobs set status = 'cancelled',
    price_hike_from = null, price_hike_reason = null, price_hike_at = null,
    price_change_pending = null, price_change_proposed_at = null
  where id = p_job_id;

  -- Re-open the request to other pros. preferred_contractor_id is cleared too,
  -- or a rehire reservation would hand it straight back to the same pro.
  update client_requests
    set status = 'pending', assigned_contractor_id = null, preferred_contractor_id = null
  where id = v_req;

  -- Offending pro is out; resurface every other bid so the client can re-pick.
  update bids set status = 'declined' where request_id = v_req and contractor_id = v_contractor;
  update bids set status = 'pending'  where request_id = v_req and contractor_id <> v_contractor;
  get diagnostics v_reopened = row_count;

  perform public.notify_user(v_contractor, 'job_reopened', 'The client declined your price change',
    'The client did not accept the new price and has re-opened the job to other pros. It is no longer assigned to you.',
    'https://freddyfixit.ca/contractor-dashboard', 'View jobs');
end; $function$;

revoke all on function public.decline_price_reopen(uuid) from public;
grant execute on function public.decline_price_reopen(uuid) to authenticated;
