-- Applied live via Supabase MCP on 2026-09-01. Committed for version control only.
--
-- A client who abandons a Stripe Checkout session and then presses "Start a new
-- payment" used to leave the first session live, so both could be paid. There was
-- no way to expire the old one because its id was never stored anywhere.
--
-- create-payment-intent v19 now stores the session id here, and on a repeat press
-- expires the stored session before opening a replacement — which makes the Pay
-- button idempotent instead of duplicating a charge.
--
-- The column is deliberately nullable: every job created before v19 has no stored
-- id, and the expired-session branch in stripe-webhook v19 matches
-- `stripe_session_id = <cs.id> OR stripe_session_id is null` precisely so those
-- older jobs keep their previous behaviour.
--
-- MONEY: touches none of the four payout guards. It adds a pointer used to CANCEL
-- an unpaid checkout; it moves no money, changes no status, and never writes
-- funded_amount.

alter table public.jobs add column if not exists stripe_session_id text;

comment on column public.jobs.stripe_session_id is
  'Stripe Checkout Session id for the outstanding deposit checkout, stored so a repeat press of Pay can expire the stale session instead of opening a second payable one. Null for jobs created before create-payment-intent v19.';
