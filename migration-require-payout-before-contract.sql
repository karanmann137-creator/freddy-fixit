-- ============================================================================
-- Require a connected payout account before the AGREEMENT can be sent
-- Written 2026-08-16. NOT APPLIED.
--
-- Supersedes migration-require-payout-to-bid.sql, which gated bidding. That
-- was the wrong checkpoint: it asked a contractor to do paperwork before they
-- had ever seen a client. This gates the moment they have actually won a job.
-- ============================================================================
--
-- WHY contract_ready() IS THE RIGHT HOOK
--
-- contract_ready(p_job_id) already exists and already does exactly this job:
-- it returns NULL when an agreement can be sent, or a plain-English reason why
-- not. contract-sign v2 returns 409 carrying that reason, and ClientDashboard
-- mirrors it. Its four existing reasons are all of the same shape - "add your
-- price", "book a visit time", "wait for the client to approve". A fifth fits
-- without inventing any new machinery, new error path or new frontend copy.
--
-- Because the agreement gate is already fail-CLOSED for payment
-- (create-payment-intent, create-balance-payment, create-milestone-payment and
-- create-recurring-prepayment all return 428 on an unsigned agreement), an
-- unsigned agreement means no money can be collected. So blocking the
-- signature blocks the money trap by construction - no client can be charged
-- for a job whose contractor has nowhere to be paid.
--
-- WHY THE CONTRACTOR SEES THIS AND THE CLIENT DOES NOT
--
-- The contractor composes and signs first; signing is what "sends" the
-- agreement to the client. So the contractor hits this check before the client
-- has any surface to sign on. The only way a client could see it is if payouts
-- were switched off between the two signatures, which is why the wording below
-- is still safe to show either party.
--
-- NOTE: contract_ready currently has search_path = 'public', 'pg_temp' and is
-- missing 'extensions'. It uses no pgcrypto so it is not broken, but the house
-- rule is public, extensions, pg_temp on every public function. Fixed here.
-- ============================================================================

create or replace function public.contract_ready(p_job_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  j record;
  v_payouts boolean;
begin
  select id, amount, scheduled_at, client_approved_at, is_milestone,
         milestone_schedule_status, status, contractor_id
    into j
    from jobs where id = p_job_id;

  if j.id is null then
    return 'This job could not be found.';
  end if;

  if coalesce(j.amount, 0) <= 0 then
    return 'Add your price to this job first — the agreement has to show what the client is agreeing to pay.';
  end if;

  if j.scheduled_at is null then
    return 'Book a visit time first — the agreement has to show when the work is happening.';
  end if;

  if j.client_approved_at is null then
    return 'Wait for the client to approve your time and price — then the agreement will match what they agreed to.';
  end if;

  if coalesce(j.is_milestone, false)
     and coalesce(j.milestone_schedule_status, '') <> 'approved' then
    return 'Wait for the client to approve your stage-by-stage payment plan before you send the agreement.';
  end if;

  -- NEW: the contractor must be able to receive money before the client is
  -- asked to send any. Without this the job runs all the way to release and
  -- fails at the transfer, after the client has paid twice and the work is done.
  select coalesce(stripe_payouts_enabled, false)
    into v_payouts
    from contractors where id = j.contractor_id;

  if not coalesce(v_payouts, false) then
    return 'Set up your payout account before sending this agreement — the client cannot pay for the job until your account is connected. Open your dashboard and click Set up payouts; it takes about five minutes.';
  end if;

  return null; -- ready to sign
end;
$function$;


-- ============================================================================
-- VERIFY AFTER APPLYING (safe, rolls itself back)
-- ============================================================================
-- MCP execute_sql does not surface RAISE NOTICE, so accumulate and raise.
--
-- do $probe$
-- declare
--   r text := '';
--   v_jobs int; v_blocked int;
-- begin
--   select count(*) into v_jobs from public.jobs;
--   select count(*) into v_blocked
--     from public.jobs j
--     join public.contractors c on c.id = j.contractor_id
--    where coalesce(c.stripe_payouts_enabled,false) = false
--      and coalesce(j.payment_status,'unpaid') = 'unpaid';
--   r := r || E'\n jobs total:                                 ' || v_jobs;
--   r := r || E'\n unpaid jobs now blocked at signature:       ' || v_blocked;
--   raise exception E'PROBE RESULTS (rolled back):%', r;
-- end
-- $probe$;
--
-- Then confirm the four original reasons still fire, and run
--   select public.platform_health_check();
-- expecting 7/7.


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Re-apply the previous body: identical to the above minus the v_payouts block
-- and with search_path back to 'public', 'pg_temp'. Nothing else changed.


-- ============================================================================
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ============================================================================
-- Does not gate bidding. A contractor can bid freely, forever, with nothing on
-- file. Friction is spent only once they have won.
--
-- Does not gate list_open_jobs. An empty feed reads as a dead platform.
--
-- Does not touch contractors.status. Nothing here approves or deactivates
-- anyone; that stays the owner's press.
--
-- Frontend to ship alongside (installer, separate): when a pro without payouts
-- places a bid, show a NUDGE - "set up payouts now so you're ready if they
-- pick you" - not a block. Nudge early, gate late.
