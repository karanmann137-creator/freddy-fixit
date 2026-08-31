-- remove_client_request() read `client_requests.client_id`, which does not exist
-- (the column is `user_id`; `client_id` lives on `jobs`). plpgsql resolves the
-- column on first execution, so every client-side request deletion raised
-- 42703 "column client_id does not exist" from 2026-08-03 until this fix --
-- before any guard could run. One identifier changed; the money guard
-- (job_money_block), the ownership check and the in-progress guard are
-- byte-identical to the previous definition.
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
  select user_id into v_client from client_requests where id = p_request_id;
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
