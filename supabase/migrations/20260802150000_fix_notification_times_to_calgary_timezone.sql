-- Applied live via MCP on 2026-08-02. Recorded here for version control.
--
-- The DB session TimeZone is UTC, so to_char(timestamptz, ...) rendered every
-- scheduling notification 6-7 hours ahead of Calgary: the Aug 2 job booked for
-- 10:00 AM was announced to both the client and the contractor as 4:00 PM.
-- build_contract_body / chat_agree_time / chat_propose_time already did this
-- correctly; these seven did not. ff_local_ts() is now the single source of
-- truth so the two groups can't drift again.
--
-- NOTE: to_char() is still used elsewhere on purpose - on `date` values
-- (generate_recurring_occurrences, get_contractor_earnings_stats), where there
-- is no timezone to get wrong, and for reminder_log dedupe keys, which are sort
-- keys rather than user-facing text (changing them would re-fire old reminders).

create or replace function public.ff_local_ts(p timestamptz)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$ select to_char(p at time zone 'America/Edmonton', 'FMDay FMMon FMDD at FMHH12:MIam') $$;

comment on function public.ff_local_ts(timestamptz) is
  'Formats a timestamptz in Calgary local time for user-facing notification text. Never use bare to_char() on a timestamptz - the session TZ is UTC.';

grant execute on function public.ff_local_ts(timestamptz) to authenticated, anon;

-- The seven affected functions were recreated verbatim with the single
-- to_char(...) call in each swapped for coalesce(public.ff_local_ts(...), <fallback>):
--
--   approve_job_schedule          'The client approved <time>. You''re booked.'
--   approve_walkthrough           'The client approved your walkthrough visit on <time>...'
--   client_reschedule_visit       'The client changed the time to <time>...'
--   confirm_visit                 'The client confirmed they''ll be ready for <time>.'
--   contractor_accept_reschedule  'Your contractor confirmed the visit for <time>.'
--   propose_job_schedule          'Your contractor proposed <time> - $X...'
--   propose_walkthrough           'Proposed visit: <time>. The visit is free...'
--
-- Bodies are unchanged apart from that substitution; see the live definitions
-- (pg_get_functiondef) for the authoritative source. Applied via the MCP
-- migration `fix_notification_times_to_calgary_timezone`.

-- Verification used after applying:
--   select public.ff_local_ts('2026-08-02 16:00:00+00');  -- 'Sunday Aug 2 at 10:00am'
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and pg_get_functiondef(p.oid) like '%FMHH12:MI AM%';  -- 0
