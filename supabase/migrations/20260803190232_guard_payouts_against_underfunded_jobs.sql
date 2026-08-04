-- With a 40% deposit, 'held' no longer means "the whole job is paid for". Every
-- path that can lead to a 93% transfer has to check funding as well, or the
-- platform pays the contractor out of its own balance.
--
-- Three guards, and they only work as a set:
--   1. confirm_job_completion() - the client cannot confirm while a balance is owed.
--   2. auto_confirm_stale_jobs() - the 3-day timer skips under-funded jobs, so it
--      can never silently authorise a payout on money that was never collected.
--   3. release-payment (edge fn) - the last line of defence, deployed separately.

create or replace function public.confirm_job_completion(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_contractor uuid; v_client uuid; v_status text; v_req uuid; v_pay text;
  v_pending jsonb; v_funded numeric; v_total numeric; v_full boolean;
begin
  select contractor_id, client_id, status, request_id, payment_status, price_change_pending,
         funded_amount, total_charged, fully_funded
    into v_contractor, v_client, v_status, v_req, v_pay, v_pending,
         v_funded, v_total, v_full
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_pay = 'disputed' then raise exception 'This job is under dispute and cannot be confirmed yet.'; end if;
  if v_pending is not null then raise exception 'Please approve or decline your pro''s proposed price change before confirming.'; end if;
  if v_pay = 'held' and not coalesce(v_full, false) then
    raise exception 'Please pay the remaining balance of $% before confirming the work is done.',
      to_char(greatest(coalesce(v_total,0) - coalesce(v_funded,0), 0), 'FM999999990.00');
  end if;
  if v_status <> 'pending_confirmation' then raise exception 'Job is not awaiting confirmation'; end if;

  update jobs set status = 'completed', client_confirmed_at = now() where id = p_job_id;
  update client_requests set status = 'completed' where id = v_req;

  perform public._notify(v_contractor, 'job_confirmed', 'Job confirmed complete',
    'The client confirmed the job is done. Nice work!', p_job_id);
  perform public.notify_email('job_confirmed_contractor', p_job_id);
end; $function$;

create or replace function public.auto_confirm_stale_jobs(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare r record; n int := 0;
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
    update jobs set status = 'completed', client_confirmed_at = now() where id = r.id;
    update client_requests set status = 'completed' where id = r.request_id;
    perform public._notify(r.contractor_id, 'job_confirmed', 'Job auto-confirmed',
      'The job was automatically confirmed complete after '||p_days||' days.', r.id);
    perform public._notify(r.client_id, 'job_confirmed', 'Job auto-confirmed',
      'We auto-confirmed your completed job after '||p_days||' days with no response.', r.id);
    n := n + 1;
  end loop;
  return n;
end; $function$;

-- Health check gains two funding checks, and check 4 stops false-alarming on a
-- job that is legitimately waiting for its balance.
create or replace function public.platform_health_check()
returns table(check_name text, ok boolean, detail text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_rate       numeric := platform_fee_rate();
  v_bad_fees   int;
  v_stuck      int;
  v_owing      int;
  v_short      int;
  v_missing    text;
begin
  -- 1) fee rate is sane (a corrupted/blank rate would mis-charge everyone)
  check_name := 'fee_rate_sane';
  ok := (v_rate is not null and v_rate >= 0 and v_rate < 0.20);
  detail := 'platform_fee_rate() = ' || coalesce(v_rate::text,'NULL');
  return next;

  -- 2) every charged fee equals either the waived 0 or exactly amount*rate.
  select count(*) into v_bad_fees
  from jobs
  where client_fee is not null
    and amount is not null
    and client_fee <> 0
    and abs(client_fee - round(amount * v_rate, 2)) > 0.01;
  check_name := 'charged_fees_consistent';
  ok := (v_bad_fees = 0);
  detail := v_bad_fees || ' charged job(s) whose fee != 0 and != amount*rate';
  return next;

  -- 3) the functions the money path depends on all still exist
  select string_agg(want, ', ') into v_missing
  from (values ('platform_fee_rate'),('get_job_fee'),('referral_waiver_eligible'),
               ('list_open_jobs'),('admin_rank_contractors'),('kick_reconcile_payouts')) as t(want)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = t.want);
  check_name := 'critical_rpcs_present';
  ok := (v_missing is null);
  detail := coalesce('missing: ' || v_missing, 'all present');
  return next;

  -- 4) no confirmed+FULLY FUNDED payout left unreleased for >2h
  select count(*) into v_stuck
  from jobs
  where status = 'completed'
    and payment_status = 'held'
    and coalesce(fully_funded, false)
    and client_confirmed_at is not null
    and disputed_at is null
    and client_confirmed_at < now() - interval '2 hours';
  check_name := 'no_stuck_payouts';
  ok := (v_stuck = 0);
  detail := v_stuck || ' confirmed job(s) held >2h without payout';
  return next;

  -- 5) the ghost-client case: the work is finished, the deposit is held, and the
  --    client has never come back to pay the balance. Auto-confirm deliberately
  --    skips these, so nothing else will ever surface them.
  select count(*) into v_owing
  from jobs
  where payment_status = 'held'
    and not coalesce(fully_funded, false)
    and disputed_at is null
    and contractor_completed_at is not null
    and contractor_completed_at < now() - interval '3 days';
  check_name := 'no_unpaid_balances';
  ok := (v_owing = 0);
  detail := v_owing || ' finished job(s) with a balance unpaid for >3 days';
  return next;

  -- 6) the funding invariant itself: nothing may have paid out for more than we
  --    actually collected.
  select count(*) into v_short
  from jobs
  where payment_status = 'released'
    and total_charged is not null
    and funded_amount < total_charged - 0.01;
  check_name := 'no_underfunded_payouts';
  ok := (v_short = 0);
  detail := v_short || ' released job(s) that were paid out while under-funded';
  return next;
end $function$;
