-- The five service_role-only SMS functions were still callable by `authenticated`.
--
-- WHY THIS EXISTS. `20261119_sms_consent_and_caps.sql` split its grants deliberately: the
-- five functions a browser must never call were granted `to service_role` only, with a
-- comment explaining each (a forged 'mobile' makes us text a landline, a forged log row
-- distorts the volume count, a forged opt-out silences someone else). The grants were
-- right. The REVOKES were not: every line read
--
--   revoke all on function … from public, anon;
--
-- and that is only two thirds of the sweep. Supabase grants EXECUTE on new functions in
-- `public` to **both** `anon` AND `authenticated`, so revoking PUBLIC and `anon` leaves an
-- explicit `authenticated=X/postgres` entry sitting in `proacl` untouched — and a plain
-- `grant … to service_role` adds a row, it does not remove one. The intent was expressed
-- in the grant block and silently contradicted by the revoke block directly above it.
--
-- What that bought an attacker with nothing but a signed-in session and the anon key that
-- ships in the JS bundle:
--   sms_record_line_type(phone,'mobile')  — mark any landline as textable, so we send to it
--   sms_record_opt_out(phone)             — silence any OTHER person's number
--   sms_log_write(…, dedupe_key)          — burn a dedupe key so the real message is
--                                           suppressed as a duplicate and never sends,
--                                           and inflate the monthly count toward the cap
--   sms_volume_alert()                    — nuisance only (the throttle holds)
--   sms_month_usage()                     — read-only, but there is no reason for it
--
-- None of it was exploitable today: `sms_enabled` is false, no number is bought, and
-- nothing sends. That is the point — this was found before the sender exists, by reading
-- `pg_proc.proacl` rather than the migration, which is the rule CLAUDE.md states and the
-- reason it states it. The August 2026 sweep caught the PUBLIC case; this is the commoner
-- one, and it does not look like a hole in the file.
--
-- `revoke … from authenticated` is the fix, kept as its own migration rather than an edit
-- to the original so the applied history matches the repo. The original file keeps its
-- `public, anon` lines; this one finishes the sweep.
--
-- ⚠️ ANY RECREATE OF THESE FIVE FUNCTIONS RESETS THE ACL AND RE-OPENS THIS. `drop
-- function` + `create` restores the Supabase defaults (`create or replace` preserves the
-- ACL). Re-run this block after any recreate, and verify with `proacl`, never by reading
-- the migration.

revoke all on function public.sms_month_usage()                 from authenticated;
revoke all on function public.sms_record_opt_out(text, text)    from authenticated;
revoke all on function public.sms_record_line_type(text, text)  from authenticated;
revoke all on function public.sms_log_write(uuid, text, text, text, text, uuid, text, int, text)
                                                                from authenticated;
revoke all on function public.sms_volume_alert()                from authenticated;

-- Re-assert the intended grants. Harmless if already present, and it means this file alone
-- states the full desired end state for these five.
grant execute on function public.sms_month_usage()                to service_role;
grant execute on function public.sms_record_opt_out(text, text)    to service_role;
grant execute on function public.sms_record_line_type(text, text)  to service_role;
grant execute on function public.sms_log_write(uuid, text, text, text, text, uuid, text, int, text)
                                                                   to service_role;
grant execute on function public.sms_volume_alert()                to service_role;
