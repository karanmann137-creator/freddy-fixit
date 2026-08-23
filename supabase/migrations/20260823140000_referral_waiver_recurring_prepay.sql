-- Referral 3% waiver in the recurring prepay pool.
--
-- Applied LIVE via Supabase MCP on 2026-08-23. Committed here for version
-- control only — installers do not run migrations.
--
-- Until now the pool ignored the referral waiver entirely, and that didn't
-- merely skip the discount, it DESTROYED it: linking the first prepaid visit
-- sets that job to payment_status='held', after which referral_waiver_eligible
-- returns false forever. A referred client who prepaid a plan as their first
-- action lost the reward with nothing to show for it.
--
-- The flag lives on the POOL, not re-decided per occurrence. The pool is
-- charged a fixed amount up front; re-deciding eligibility at link time could
-- disagree with what was actually collected and leave the last visit short.
--
-- Arithmetic reconciles exactly, which is the whole point:
--   pool charged   = basePer*occ + feePer*(occ-1)
--   sum of jobs    = basePer + (occ-1)*(basePer+feePer)
--                  = basePer*occ + feePer*(occ-1)
-- so funded_amount stays honest per job and no visit ends up under-funded.

alter table public.recurring_prepayments
  add column if not exists fee_waived boolean not null default false;

comment on column public.recurring_prepayments.fee_waived is
  'True when a referral waived the 3% client service fee on this pool. The waiver applies to occurrence 1 only, and the pool total was charged accordingly.';

-- >>> BEGIN consume_prepaid_occurrence (verbatim pg_get_functiondef of the live function)
CREATE OR REPLACE FUNCTION public.consume_prepaid_occurrence(p_job uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_job record;
  v_plan uuid;
  v_rp record;
  v_linked int;
  v_seq int;
  v_fee numeric;
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

  v_seq := v_linked + 1;
  -- A referral waives the service fee on the FIRST occurrence only, and the pool
  -- was charged one fee short to match. Read the stamped flag rather than
  -- re-deciding eligibility here, or the jobs stop summing to what was collected.
  v_fee := case when coalesce(v_rp.fee_waived, false) and v_seq = 1
                then 0::numeric else v_rp.client_fee_per end;
  v_total := v_rp.amount_per_occurrence + v_fee;

  update jobs
    set prepayment_id = v_rp.id,
        prepayment_seq = v_seq,
        payment_status = 'held',
        total_charged = v_total,
        -- MONEY INVARIANT: 'held' alone is not enough to pay out. This visit's
        -- share of the pool is already collected, so it is fully funded the
        -- moment it is linked.
        funded_amount = v_total,
        client_fee = v_fee,
        platform_fee = v_rp.commission_per,
        contractor_payout = v_rp.payout_per,
        paid_at = now()
  where id = p_job;

  return true;
end;
$function$
-- <<< END consume_prepaid_occurrence
;
