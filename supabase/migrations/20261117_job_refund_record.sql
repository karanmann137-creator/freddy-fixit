-- Record refunds on the job, so a CREDIT NOTE can be rendered from our own data.
--
-- THE GAP THIS CLOSES. Two paths refund a client's money and neither leaves a
-- usable record of it on the job:
--
--   * `adjust-payment` (deployed v9) refunds the excess when a client approves a
--     price DECREASE below what we already hold. It calls stripe.refunds.create,
--     decrements `funded_amount` -- and records the amount nowhere at all. The
--     only trace is in Stripe.
--   * `resolve-dispute` (deployed v12) does write `disputes.refund_amount`,
--     `resolution_note` and `resolved_at`, so that path is recoverable -- but
--     from a different table, with a different shape, reachable only through the
--     dispute. A document that had to read both would be two code paths that can
--     disagree about the same job.
--
-- A refund that exists only at Stripe is a bookkeeping hole independent of any
-- document: the client's own invoice would keep showing the full amount paid.
--
-- WHY THREE COLUMNS AND NOT A `job_refunds` TABLE. A table is the textbook shape
-- for a one-to-many event log, and it was the first design. It was rejected:
-- there are 56 tables already, a new one needs its own RLS policies on a public
-- repo, and the question a credit note actually answers is "how much of this job
-- has been credited back" -- a running total on the job, not a list of events.
-- Stripe keeps the per-event ledger and keeps it better than we would. If a
-- per-refund document is ever genuinely needed, the table can be added then,
-- against a real requirement rather than an imagined one.
--
-- `refunded_total` ACCUMULATES. A job can be refunded more than once (a price
-- decrease, then another), so both writers increment rather than assign. The
-- date and reason describe the most recent one, which is what a credit note
-- issued today is about.
--
-- MONEY: TOUCHES NONE OF THE FOUR PAYOUT GUARDS. `confirm_job_completion()`,
-- `auto_confirm_stale_jobs()`, `release-payment`'s !fully_funded 409 and
-- `reconcile-payouts`' fully_funded filter are all unmodified and none of them
-- reads these columns. The arithmetic on `funded_amount` is untouched -- both
-- writers already decrement it correctly and that is the number every guard
-- reads. These three columns are a RECORD of money that has already moved, not
-- an input to any decision about moving money.

alter table public.jobs
  add column if not exists refunded_total numeric(12,2) not null default 0,
  add column if not exists last_refund_at timestamptz,
  add column if not exists last_refund_reason text;

comment on column public.jobs.refunded_total is
  'Running total refunded to the client on this job, in dollars. Accumulated by adjust-payment (price decrease) and resolve-dispute. A RECORD of money already returned -- read by the credit note, read by no payout guard.';
comment on column public.jobs.last_refund_at is
  'When the most recent refund on this job was issued.';
comment on column public.jobs.last_refund_reason is
  'Plain-English reason for the most recent refund, shown on the credit note.';

-- Both writers hold a service-role client, so no grant or policy change is
-- needed: the existing `jobs` policies already govern who can READ the row, and
-- the credit note is read by the client and the admin, both of whom can already
-- select the job.
