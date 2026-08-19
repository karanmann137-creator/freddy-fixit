-- Both sweeps looped over rows with no exception handling, so one bad row
-- aborted the whole batch and every job behind it silently stopped being
-- auto-confirmed. Same per-row pattern refire_stale_requests already uses.

create or replace function public.auto_confirm_stale_jobs(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare r record; n int := 0; v_failed int := 0;
begin
  for r in
    select id, contractor_id, client_id, request_id
      from jobs
     where status = 'pending_confirmation'
       and disputed_at is null
       and payment_status <> 'disputed'
       and price_change_pending is null
       -- Never auto-confirm a job whose balance is still outstanding: confirming
       -- is what authorises the 93% transfer.
       and (payment_status <> 'held' or coalesce(fully_funded, false))
       and contractor_completed_at < now() - make_interval(days => p_days)
  loop
    begin
      update jobs set status = 'completed', client_confirmed_at = now() where id = r.id;
      update client_requests set status = 'completed' where id = r.request_id;
      perform public._notify(r.contractor_id, 'job_confirmed', 'Job auto-confirmed',
        'The job was automatically confirmed complete after '||p_days||' days.', r.id);
      perform public._notify(r.client_id, 'job_confirmed', 'Job auto-confirmed',
        'We auto-confirmed your completed job after '||p_days||' days with no response.', r.id);
      n := n + 1;
    exception when others then
      -- One unhappy row must not stop the sweep. reconcile-payouts is the
      -- safety net for the money side either way.
      v_failed := v_failed + 1;
      raise warning 'auto_confirm_stale_jobs: job % skipped: %', r.id, sqlerrm;
    end;
  end loop;
  if v_failed > 0 then
    raise warning 'auto_confirm_stale_jobs: % confirmed, % skipped', n, v_failed;
  end if;
  return n;
end;
$function$;


create or replace function public.auto_approve_stale_milestones(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_row public.job_milestones%rowtype;
  v_n int := 0;
  v_failed int := 0;
begin
  for v_row in
    select * from public.job_milestones
     where status = 'completed'
       and client_approved_at is null
       and disputed_at is null
       and completed_at < now() - make_interval(days => p_days)
  loop
    begin
      update public.job_milestones
         set client_approved_at = now()
       where id = v_row.id;
      v_n := v_n + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'auto_approve_stale_milestones: stage % skipped: %', v_row.id, sqlerrm;
    end;
  end loop;
  if v_failed > 0 then
    raise warning 'auto_approve_stale_milestones: % approved, % skipped', v_n, v_failed;
  end if;
  return v_n;
end;
$function$;
