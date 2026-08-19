-- Every path that destroys or cancels a job now asks job_money_block() first,
-- so the four guards can no longer drift apart.

-- ---------------------------------------------------------------------------
-- withdraw_job (contractor) — hard DELETE, everything cascades.
-- ---------------------------------------------------------------------------
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
end;
$function$;


-- ---------------------------------------------------------------------------
-- remove_client_request (client) — deletes the request outright when no job
-- exists, otherwise cancels. Checks every job on the request, since a request
-- can carry more than one.
-- ---------------------------------------------------------------------------
create or replace function public.remove_client_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_client   uuid;
  v_assigned boolean := false;
  v_job      record;
  v_block    text;
begin
  select client_id into v_client from client_requests where id = p_request_id;
  if v_client is null then
    raise exception 'Request not found';
  end if;
  if v_client <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  for v_job in select id from jobs where request_id = p_request_id loop
    v_block := public.job_money_block(v_job.id);
    if v_block is not null then
      raise exception '%', v_block;
    end if;
  end loop;

  if exists (
    select 1 from jobs j
     where j.request_id = p_request_id
       and j.status in ('in_progress', 'pending_confirmation')
  ) then
    raise exception 'Work on this job has already started, so it cannot be deleted here. Contact us at hello@freddyfixit.ca.';
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


-- ---------------------------------------------------------------------------
-- decline_price_reopen (client walks instead of paying more) — cancels the job
-- and re-opens the request to the other bidders.
-- ---------------------------------------------------------------------------
create or replace function public.decline_price_reopen(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_client uuid; v_contractor uuid; v_req uuid; v_block text; v_reopened int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select client_id, contractor_id, request_id
    into v_client, v_contractor, v_req
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if v_client <> auth.uid() then raise exception 'Not authorized'; end if;

  v_block := public.job_money_block(p_job_id);
  if v_block is not null then
    raise exception '%', v_block;
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
end;
$function$;


-- ---------------------------------------------------------------------------
-- admin_delete_job — was is_admin() then DELETE, with no money guard at all,
-- behind a button on the admin Jobs tab. Every child of jobs is ON DELETE
-- CASCADE, disputes included.
--
-- p_force exists so a genuinely broken job is never unfixable, but it is not
-- wired to any button: it is deliberately only reachable from SQL, and only
-- after the charge has been refunded in Stripe.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_delete_job(uuid);

create or replace function public.admin_delete_job(p_job_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_is_admin boolean;
  v_block    text;
begin
  select (role = 'admin') into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then raise exception 'Not authorized'; end if;

  if not p_force then
    v_block := public.job_money_block(p_job_id);
    if v_block is not null then
      raise exception 'This job holds money and was not deleted. %  (Refund the charge in Stripe first, then re-run with p_force => true.)', v_block;
    end if;
  end if;

  delete from public.jobs where id = p_job_id;
end;
$function$;

revoke all on function public.admin_delete_job(uuid, boolean) from public;
grant execute on function public.admin_delete_job(uuid, boolean) to authenticated, service_role;
