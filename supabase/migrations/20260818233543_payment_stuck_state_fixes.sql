-- Payment audit fixes, 18 Aug 2026.
--
-- Five separate stuck states, all found by reading code that has never run
-- against real money. See PAYMENT-AUDIT-2026-08-18.md.

-- ---------------------------------------------------------------------------
-- 1. When a Stripe Checkout session was opened.
--
-- create-payment-intent writes payment_status='processing' BEFORE the client
-- pays, and nothing recorded when. Without a timestamp the deletion guards
-- below would have to block 'processing' forever, which would turn an
-- abandoned checkout into a job the contractor can never withdraw from. The
-- stamp bounds the block to the life of the Stripe session.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists checkout_started_at timestamptz;
comment on column public.jobs.checkout_started_at is
  'When a Stripe Checkout session was opened for this job. Bounds the window in which the job counts as holding live money and cannot be destroyed.';


-- ---------------------------------------------------------------------------
-- 2. One place that answers "can this job be destroyed?".
--
-- withdraw_job, remove_client_request and decline_price_reopen each carried
-- their own copy of the money guard and they had already drifted: only
-- withdraw_job checked the prepay pool, only two checked milestones, and none
-- of the three knew about 'processing' at all — so a contractor could hard
-- DELETE a job (every child cascades, disputes included) while the client was
-- on the Stripe page, destroying the only pointer to a live payment intent.
--
-- Returns NULL when the job holds no money and is safe to destroy, otherwise
-- the plain-English reason. Same shape as contract_ready().
-- ---------------------------------------------------------------------------
create or replace function public.job_money_block(p_job_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_pay      text;
  v_started  timestamptz;
begin
  select payment_status, checkout_started_at into v_pay, v_started
    from public.jobs where id = p_job_id;
  if not found then return null; end if;   -- nothing to protect

  -- Whole-job funds.
  if coalesce(v_pay, 'unpaid') in ('held', 'released', 'disputed') then
    return 'This job has already been paid for, so it cannot be removed here. The money is still held safely — email hello@freddyfixit.ca and we will sort out the refund.';
  end if;

  -- A checkout that is open right now. Stripe sessions are created with a 2h
  -- expiry, so a 3h window strictly contains the life of any session that
  -- could still be paid. Older stamps age out on their own rather than
  -- stranding the job.
  if coalesce(v_pay, 'unpaid') = 'processing'
     and v_started is not null
     and v_started > now() - interval '3 hours' then
    return 'A payment for this job is going through right now. Give it a few minutes and try again — removing it mid-payment would lose track of the charge.';
  end if;

  -- A milestone job holds real money per stage while jobs.payment_status is
  -- still 'unpaid'. 'refunded' is terminal and deliberately NOT listed.
  if exists (
    select 1 from public.job_milestones m
     where m.job_id = p_job_id
       and m.status in ('funded', 'completed', 'released', 'disputed')
  ) then
    return 'A stage of this job has already been paid for, so it cannot be removed here. Email hello@freddyfixit.ca and we will sort out the refund.';
  end if;

  -- A prepaid recurring visit is covered by a pool charge.
  if exists (
    select 1 from public.jobs j
      join public.recurring_prepayments rp on rp.id = j.prepayment_id
     where j.id = p_job_id
       and rp.status in ('held', 'partially_released')
  ) then
    return 'This visit is covered by a prepaid plan, so it cannot be removed here. Email hello@freddyfixit.ca.';
  end if;

  return null;
end;
$function$;

revoke all on function public.job_money_block(uuid) from public;
grant execute on function public.job_money_block(uuid) to authenticated, service_role;
