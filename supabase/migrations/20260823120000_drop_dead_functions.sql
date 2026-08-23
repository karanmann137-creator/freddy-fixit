-- Drop six dead functions. Batch 2 of the code-review cleanup, 2026-08-23.
--
-- Each was verified unreferenced by: pg_proc.prosrc cross-reference across the
-- whole public schema, pg_trigger, pg_views, every file in src/, and every
-- edge-function source in supabase/functions/ (including the five recovered on
-- 2026-08-23, so the scan_rate_check blind spot cannot repeat: that RPC looked
-- dead only because analyze-repair had no source in the repo to grep).
--
-- pg_stat_user_functions was NOT used as evidence — track_functions is off on
-- this project, so it reports NULL calls for everything including RPCs that are
-- demonstrably live. Static analysis is the whole basis here.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ff_hash / record_deleted_contractor_flag / flagged_deleted_matches
--
-- A dead PARALLEL implementation of re-signup flagging, and a broken one.
-- ff_hash salted with a hardcoded pepper before hashing. The LIVE path does
-- not: the delete-account edge function hashes normalized email/phone/
-- name with plain SHA-256 in TypeScript and inserts into deleted_account_flags
-- directly, and admin_resignup_matches (called from AdminDashboard.tsx) reads
-- them back with plain extensions.digest(). So flagged_deleted_matches could
-- never have matched a single row written by the live deletion path, and
-- record_deleted_contractor_flag would have written rows the live reader could
-- never find. Dropping them removes the risk that a later session wires up the
-- peppered pair and silently breaks re-signup detection.
--
-- The deleted_account_flags TABLE is live and is NOT touched here.
--
-- 2. client_fee_rate / client_completed_jobs
--
-- A superseded pricing model: 0% service fee for repeat clients, 3% for
-- first-timers. Live pricing is a flat platform_fee_rate() = 0.03 charged on
-- every job, with the only waiver coming from the referral system. Nothing
-- calls either one. This pair is worth deleting rather than leaving: wiring
-- client_fee_rate into the fee path would zero out revenue on every repeat
-- customer, and it reads like a legitimate helper.
--
-- 3. delete_my_account
--
-- Superseded by the delete-account edge function, which performs the same
-- deletes inline and additionally handles the active-job block, the poor-rating
-- flag, Storage cleanup and auth.admin.deleteUser. delete-account does not call
-- this RPC. Leaving it exposed means a second, partial account-deletion path
-- reachable over PostgREST by any authenticated user — it deletes the profile
-- but leaves the auth.users row, which is exactly how orphaned accounts get
-- made.
--
-- Full prior definitions are recoverable from git history and from the
-- Supabase migration log; they are not reproduced here.
-- ─────────────────────────────────────────────────────────────────────────────

-- Dependents first, then the shared helper.
drop function if exists public.flagged_deleted_matches(uuid);
drop function if exists public.record_deleted_contractor_flag(text, text, text, text, integer, numeric, boolean);
drop function if exists public.ff_hash(text);

drop function if exists public.client_fee_rate(uuid);
drop function if exists public.client_completed_jobs(uuid);

drop function if exists public.delete_my_account();
