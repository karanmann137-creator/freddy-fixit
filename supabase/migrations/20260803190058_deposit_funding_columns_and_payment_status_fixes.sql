-- Part 1: fix two latent payment_status bugs that would have fired the first time
-- anyone actually paid for a job.
--
--   * open_dispute() writes payment_status = 'disputed', which the CHECK constraint
--     rejected (23514). Every in-app claim on a paid job would have failed.
--   * propose_price_change() writes NULL into the NOT NULL payment_status column
--     when clearing a stale 'processing'/'failed' state (23502). The intent was
--     clearly "back to unpaid".
--
-- Neither has ever fired because no job has ever reached 'held'.

alter table public.jobs drop constraint if exists jobs_payment_status_check;
alter table public.jobs add constraint jobs_payment_status_check
  check (payment_status = any (array[
    'unpaid','processing','held','released','refunded','failed','disputed'
  ]));

-- Part 2: partial-funding tracking.
--
-- A job is now collected in two charges: a deposit at booking and the balance
-- when the work is done. 'held' keeps its existing meaning (money is in escrow);
-- funded_amount says HOW MUCH of total_charged is actually in escrow.
--
--   INVARIANT: money may only be released to a contractor when the job is 'held'
--   AND fully_funded. Every payout path must check both.
--
-- deposit_rate is stored per job so that changing the platform-wide rate later
-- can never retroactively alter a job that is already in flight.

alter table public.jobs
  add column if not exists funded_amount  numeric(10,2) not null default 0,
  add column if not exists deposit_rate   numeric(4,3)  not null default 0.40,
  add column if not exists deposit_paid_at timestamptz;

alter table public.jobs drop column if exists fully_funded;
alter table public.jobs
  add column fully_funded boolean
  generated always as (
    total_charged is not null and funded_amount >= total_charged - 0.01
  ) stored;

comment on column public.jobs.funded_amount is
  'Dollars actually collected and held for this job (deposit + balance + any approved top-ups). Compare against total_charged before releasing any payout.';
comment on column public.jobs.deposit_rate is
  'Fraction of the job total taken as the upfront deposit, frozen at booking time.';
comment on column public.jobs.fully_funded is
  'True when the full total_charged has been collected. Required for any payout.';

-- Any job that already reached a paid state was collected in full under the old
-- single-charge flow, so it is fully funded by definition. (Live today: zero rows.)
update public.jobs
   set funded_amount = coalesce(total_charged, amount, 0),
       deposit_rate  = 1.0
 where payment_status in ('held','released','refunded','disputed')
   and funded_amount = 0;

create index if not exists jobs_underfunded_idx
  on public.jobs (payment_status)
  where payment_status = 'held';
