-- Applied live via MCP on 2026-08-02. Recorded here for version control.
--
-- run_reminders() has the same UTC bug in its day-before "your visit is coming
-- up" nudge. Rather than paste back a long function and risk drift, the fix is a
-- surgical string replacement on the live definition, guarded so it fails loudly
-- if the expected text isn't there.
--
-- Depends on public.ff_local_ts() from 20260802150000.

do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_reminders';

  v_new := replace(v_def,
    'to_char(r.scheduled_at, ''Mon DD at FMHH12:MI AM'')',
    'coalesce(public.ff_local_ts(r.scheduled_at), ''the booked time'')');

  if v_new = v_def then
    raise exception 'run_reminders: expected to_char pattern not found - not replaced';
  end if;

  execute v_new;
end $mig$;

-- The other to_char() calls left in run_reminders are reminder_log dedupe keys
-- (to_char(now(),'YYYY-MM'), to_char(schedule_proposed_at,'YYYYMMDDHH24MI'),
-- to_char(price_change_proposed_at,'YYYYMMDDHH24MI')). They are never shown to a
-- user and rewriting them would re-fire reminders that already went out.
