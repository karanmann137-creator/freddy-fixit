-- ############################################################################
-- ##  SUPERSEDED — DO NOT RUN THIS FILE.                                    ##
-- ##                                                                        ##
-- ##  Gating the BID was the wrong checkpoint. It asks a contractor to do    ##
-- ##  paperwork before they have ever seen a client, on a platform that has  ##
-- ##  produced 14 bids and 1 job total. Supply is the binding constraint;    ##
-- ##  spending friction before value is how you lose the supply side.        ##
-- ##                                                                        ##
-- ##  Use instead:  migration-require-payout-before-contract.sql             ##
-- ##  which gates the AGREEMENT — i.e. the moment the pro has won the job.   ##
-- ##                                                                        ##
-- ##  Kept only for the trigger-vs-function-edit reasoning below, which is   ##
-- ##  still worth reading if a bids trigger is ever needed for something     ##
-- ##  else. The _accept_bid_internal / decline_price_reopen carve-out note   ##
-- ##  in particular is a real trap.                                          ##
-- ############################################################################

-- ============================================================================
-- Require a connected payout account before a contractor can bid
-- Written 2026-08-16. NOT APPLIED. SUPERSEDED — see banner above.
-- ============================================================================
--
-- WHY A TRIGGER AND NOT AN EDIT TO place_bid()
--
-- place_bid() is ~100 lines carrying the advisory lock that closes the
-- check-then-insert race, the 7-bid cap, the 48h preferred-pro reservation,
-- the mandatory walkthrough ballpark range, three notification paths and two
-- internal-token edge calls. Reproducing all of that to add three lines is the
-- superset-rewrite failure mode that has broken production twice. A trigger is
-- additive and cannot clobber logic it does not mention.
--
-- RAISE IS CORRECT HERE. The flag-don't-raise rule exists for chat_guard,
-- where the row being inspected is itself the evidence and must survive. Here
-- we want the bid to not exist.
--
-- THE UPDATE CARVE-OUT IS LOAD-BEARING. `_accept_bid_internal` and
-- `decline_price_reopen` both UPDATE bids (verified against pg_proc, not
-- assumed). When a client picks a winner, the losing bids get updated — and
-- some of those losers are exactly the pros this trigger blocks. A blanket
-- BEFORE UPDATE would therefore make it impossible for a client to accept any
-- bid at all. place_bid's upsert sets `created_at = now()` on a re-quote and
-- nothing else does, so that is the signal used to tell a genuine re-quote
-- apart from a bookkeeping update.
-- ============================================================================

create or replace function public.bids_require_payout_account()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_ok boolean;
begin
  -- Bookkeeping updates (status flips from accept/decline) pass straight
  -- through. Only inserts and genuine re-quotes are gated.
  if tg_op = 'UPDATE' and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  select coalesce(stripe_payouts_enabled, false)
    into v_ok
    from public.contractors
   where id = new.contractor_id;

  if not coalesce(v_ok, false) then
    raise exception 'Set up your payout account before bidding. A client cannot pay you until your Stripe account is connected. Open your dashboard and click Set up payouts - it takes about five minutes.';
  end if;

  return new;
end
$fn$;

drop trigger if exists bids_require_payout_account on public.bids;

create trigger bids_require_payout_account
  before insert or update on public.bids
  for each row execute function public.bids_require_payout_account();

-- Default function grant is to PUBLIC, so revoking from anon alone is a no-op.
revoke all on function public.bids_require_payout_account() from public;
revoke all on function public.bids_require_payout_account() from anon, authenticated;


-- ============================================================================
-- VERIFY AFTER APPLYING (safe, rolls itself back)
-- ============================================================================
-- Confirms the trigger blocks an un-onboarded pro and leaves accept/decline
-- bookkeeping updates alone. Accumulates into a text var and raises at the
-- end, because MCP execute_sql does not surface RAISE NOTICE.
--
-- do $probe$
-- declare
--   r text := '';
--   v_blocked int;
--   v_open    int;
-- begin
--   select count(*) into v_blocked
--     from public.bids b join public.contractors c on c.id = b.contractor_id
--    where coalesce(c.stripe_payouts_enabled,false) = false;
--   select count(*) into v_open from public.contractors
--    where status='active' and coalesce(stripe_payouts_enabled,false);
--
--   r := r || E'\n existing bids from un-onboarded pros (unaffected): ' || v_blocked;
--   r := r || E'\n contractors who can still bid after this ships:    ' || v_open;
--   raise exception E'PROBE RESULTS (rolled back):%', r;
-- end
-- $probe$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop trigger if exists bids_require_payout_account on public.bids;
-- drop function if exists public.bids_require_payout_account();


-- ============================================================================
-- WHAT THIS DOES NOT DO
-- ============================================================================
-- It does not touch the 5 bids that already exist from pros without payout
-- accounts. Those sit on all 3 of your currently open requests and a client
-- can still accept one today, which walks the job into the money trap:
-- deposit collected, balance collected, work done, client confirms, payout
-- fails with no Stripe account to transfer to.
--
-- The gate is forward-looking only. The existing 5 are fixed by those 5 pros
-- completing payout setup, which is what the Phase 0 email asks for.
--
-- It also does not gate assign_job (admin assign). Left deliberate: the owner
-- assigning someone is a decision, not an accident, and the admin roster
-- already shows payout status per contractor.
--
-- Frontend to ship alongside (installer, separate): dim the bid button and
-- show the same reason when stripe_payouts_enabled is false, so a pro learns
-- this before writing out a quote rather than after. Do NOT filter
-- list_open_jobs - an empty feed reads as a dead platform.
