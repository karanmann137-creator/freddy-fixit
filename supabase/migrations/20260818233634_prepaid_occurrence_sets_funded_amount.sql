-- A prepaid recurring visit set payment_status='held' and total_charged, but
-- never funded_amount — so fully_funded (total_charged is not null and
-- funded_amount >= total_charged - 0.01) stayed FALSE forever. Every one of
-- the four payout guards then correctly refused to pay out, and
-- confirm_job_completion told the client to "pay the remaining balance" on
-- money they had already paid in the pool. There was no way out: that RPC
-- checks auth.uid() = client, so an admin could not confirm it for them.
--
-- The money genuinely IS collected here — the pool charge succeeded before the
-- occurrence was ever linked — so funded_amount must equal total_charged.
create or replace function public.consume_prepaid_occurrence(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_job record;
  v_plan uuid;
  v_rp record;
  v_linked int;
  v_total numeric;
begin
  select j.id, j.client_id, j.request_id, j.payment_status, j.prepayment_id, j.amount,
         cr.recurring, cr.recurring_parent_id
    into v_job
  from jobs j join client_requests cr on cr.id = j.request_id
  where j.id = p_job;
  if not found then raise exception 'job not found'; end if;

  -- Caller must own the job (or be admin).
  if v_job.client_id <> (select auth.uid())
     and not exists (select 1 from profiles p where p.id=(select auth.uid()) and p.role='admin') then
    raise exception 'not authorized';
  end if;

  if v_job.prepayment_id is not null then return true; end if;              -- already funded from a pool
  if v_job.payment_status = 'held' or v_job.payment_status = 'released' then return false; end if;

  v_plan := coalesce(v_job.recurring_parent_id, v_job.request_id);

  select rp.* into v_rp
  from recurring_prepayments rp
  where rp.plan_request_id = v_plan
    and rp.status in ('held','partially_released')
  order by rp.created_at asc
  limit 1;
  if not found then return false; end if;

  -- How many occurrences are already committed (linked jobs not refunded)?
  select count(*) into v_linked from jobs j
  where j.prepayment_id = v_rp.id and coalesce(j.payment_status,'') <> 'refunded';
  if v_linked >= v_rp.occurrences_total then return false; end if;          -- pool exhausted

  v_total := v_rp.amount_per_occurrence + v_rp.client_fee_per;

  update jobs
    set prepayment_id = v_rp.id,
        prepayment_seq = v_linked + 1,
        payment_status = 'held',
        total_charged = v_total,
        -- MONEY INVARIANT: 'held' alone is not enough to pay out. This visit's
        -- share of the pool is already collected, so it is fully funded the
        -- moment it is linked.
        funded_amount = v_total,
        client_fee = v_rp.client_fee_per,
        platform_fee = v_rp.commission_per,
        contractor_payout = v_rp.payout_per,
        paid_at = now()
  where id = p_job;

  return true;
end;
$function$;
