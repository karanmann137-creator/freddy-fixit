-- platform_commission_rate() — the third and last of the rate constants.
--
-- platform_fee_rate() (0.03, what the CLIENT pays on top) and
-- platform_deposit_rate() (0.40, how much of the job is collected up front)
-- have been single sources of truth for a while. The 7% commission the
-- platform keeps out of the contractor's side never got one, so it sat
-- hardcoded in three SQL functions that could drift from each other with
-- nothing to show for it. This is that function.
--
-- MONEY: this changes NO arithmetic. 0.07 becomes a function returning 0.07,
-- and every 0.93 becomes (1 - rate), which is exactly 0.93 in Postgres numeric.
-- It touches none of the four payout guards: confirm_job_completion(),
-- auto_confirm_stale_jobs(), release-payment's !fully_funded 409 and
-- reconcile-payouts' fully_funded filter are all untouched and unreferenced
-- here. release-payment reads contractor_payout from the row; it has never
-- computed the rate itself, so the payout path is unaffected either way.
--
-- APPLIED LIVE via Supabase MCP as migration 20260901010821_platform_commission_rate.
-- This file is version control only — installers do not apply DB changes.

create or replace function public.platform_commission_rate()
returns numeric
language sql
immutable
set search_path = public, extensions, pg_temp
as $$ select 0.07::numeric $$;

comment on function public.platform_commission_rate() is
  'Platform commission kept from the contractor side (0.07). Single source of truth — never hardcode 0.07 or 0.93. The contractor receives (1 - this).';

revoke all on function public.platform_commission_rate() from public, anon;
grant execute on function public.platform_commission_rate() to authenticated, service_role;

-- The two existing rate functions get their search_path pinned the same way.
-- alter function, not drop/create: these are live money constants and there is
-- no reason to rewrite a definition when only the setting needs changing.
alter function public.platform_fee_rate() set search_path = public, extensions, pg_temp;
alter function public.platform_deposit_rate() set search_path = public, extensions, pg_temp;


-- 1/3 — propose_milestones. Byte-for-byte the deployed definition except that
-- v_pf now reads the rate, and search_path gains extensions + pg_temp (it was
-- 'public' alone, which is the shape that killed every signup for a month).
-- The fee is still computed first and the payout taken as the COMPLEMENT
-- (v_amount - v_pf) rather than as its own rounding, so a stage's fee and
-- payout always add back up to the stage exactly.
create or replace function public.propose_milestones(p_job_id uuid, p_stages jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_job public.jobs%rowtype;
  v_count int;
  v_sum numeric := 0;
  v_amount numeric;
  v_rate numeric := public.platform_fee_rate();
  v_comm numeric := public.platform_commission_rate();
  v_stage jsonb;
  v_seq int := 0;
  v_title text;
  v_pf numeric;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found';
  end if;
  if not public.is_admin() and auth.uid() <> v_job.contractor_id then
    raise exception 'Only the assigned contractor can propose milestones';
  end if;
  if coalesce(v_job.amount,0) <= 2000 then
    raise exception 'Milestones are only for jobs over $2,000';
  end if;

  v_count := jsonb_array_length(p_stages);
  if v_count < 2 or v_count > 5 then
    raise exception 'A milestone plan needs between 2 and 5 stages';
  end if;

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    v_amount := (v_stage->>'amount')::numeric;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Every stage needs a positive amount';
    end if;
    v_sum := v_sum + v_amount;
  end loop;

  if round(v_sum,2) <> round(coalesce(v_job.amount,0),2) then
    raise exception 'Stage amounts (%) must add up to the quote (%)', v_sum, v_job.amount;
  end if;

  -- reset any prior proposed (un-funded) plan
  delete from public.job_milestones
   where job_id = p_job_id and status = 'pending';

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    v_seq := v_seq + 1;
    v_amount := (v_stage->>'amount')::numeric;
    v_title := coalesce(nullif(trim(v_stage->>'title'),''), 'Stage ' || v_seq);
    v_pf := round(v_amount * v_comm, 2);
    insert into public.job_milestones
      (job_id, seq, title, amount, client_fee, contractor_payout, platform_fee, status)
    values
      (p_job_id, v_seq, v_title, v_amount,
       round(v_amount * v_rate, 2),
       v_amount - v_pf,
       v_pf,
       'pending');
  end loop;

  update public.jobs
     set is_milestone = true,
         milestone_schedule_status = 'proposed'
   where id = p_job_id;
end;
$function$;


-- 2/3 — get_recurring_prepay_quote. payout_per and commission_per are each
-- rounded independently here (they are a display quote, not a ledger), so the
-- 0.93 is expressed as (1 - rate) to keep the returned figures identical.
create or replace function public.get_recurring_prepay_quote(p_request uuid, p_count integer)
returns table(base_per numeric, fee_rate numeric, fee_per numeric, payout_per numeric, commission_per numeric, occurrences integer, total numeric, priced boolean)
language sql
security definer
set search_path = public, extensions, pg_temp
as $function$
  with plan as (
    select cr.id, cr.estimated_quote
    from client_requests cr
    where cr.id = p_request and cr.user_id = (select auth.uid()) and cr.recurring = true
  ),
  latest as (
    select j.amount
    from jobs j
    join client_requests cc on cc.id = j.request_id
    where (cc.id = p_request or cc.recurring_parent_id = p_request)
      and j.amount is not null and j.amount > 0
    order by j.created_at desc limit 1
  ),
  b as (
    select greatest(coalesce((select amount from latest), (select estimated_quote from plan), 0), 0) as base_per,
           public.platform_fee_rate() as fee_rate,
           public.platform_commission_rate() as comm_rate,
           greatest(least(coalesce(p_count,0), 12), 1) as occ
  )
  select
    round(base_per,2),
    fee_rate,
    round(base_per * fee_rate, 2),
    round(base_per * (1 - comm_rate), 2),
    round(base_per * comm_rate, 2),
    occ,
    round(occ * (base_per + round(base_per * fee_rate,2)), 2),
    (base_per > 0)
  from b;
$function$;


-- 3/3 — recompute_contractor_stats. The 0.93 here is only a FALLBACK for rows
-- where contractor_payout was never written; the stored value still wins.
create or replace function public.recompute_contractor_stats(p_contractor uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $function$
  update contractors c set
    total_jobs   = coalesce((select count(*) from jobs j
                              where j.contractor_id = p_contractor and j.status = 'completed'), 0),
    total_earned = coalesce((select sum(coalesce(j.contractor_payout,
                                                 round(j.amount * (1 - public.platform_commission_rate()), 2)))
                              from jobs j
                              where j.contractor_id = p_contractor and j.status = 'completed'), 0)
  where c.id = p_contractor;
$function$;
