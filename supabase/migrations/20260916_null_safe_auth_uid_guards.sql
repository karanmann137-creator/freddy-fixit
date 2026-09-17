-- Make the "are you allowed to do this?" guard fire for an unauthenticated caller.
--
-- `if v_client <> auth.uid() then raise` is silently broken: in SQL that
-- comparison is NULL when auth.uid() is NULL, and a NULL `if` condition does
-- not fire, so a caller with no JWT falls straight through. Because these are
-- SECURITY DEFINER, the internal job/request lookup still populates v_client,
-- so the preceding "not found" raise does not fire either, and the mutation
-- afterwards bypasses RLS as well.
--
-- Same shape found in set_job_autopay (2026-08-31) and fixed then in
-- open_dispute / respond_to_dispute / confirm_job_completion. These 19 are the
-- rest of the family, and unlike those three they are reachable with the
-- publicly-shipped anon key.
--
-- Each guard becomes STRICTER, never looser: it now refuses a caller it
-- previously accepted, and accepts nobody new. Bodies are patched
-- programmatically from pg_get_functiondef so nothing but the 22 bytes of
-- `auth.uid() is null or ` can change; the length assertion below is what
-- proves that. CREATE OR REPLACE preserves owner and grants, and no signature
-- changes, so PostgREST sees no new overload.
--
-- place_bid is deliberately skipped: its guard is a compound reservation test,
-- not this shape. It is also self-closing — `select status into v_active from
-- contractors where id = auth.uid()` leaves v_active NULL for an anon caller
-- and the very next guard is an `is null` test (null-SAFE, so it fires), with
-- bids.contractor_id NOT NULL as a second backstop.
--
-- Touches NONE of the four payout guards.
--
-- Applied live via Supabase MCP on 2026-09-16 as
-- `null_safe_auth_uid_guards_on_anon_reachable_rpcs`. This file is version
-- control only — installers do not apply DB changes.

do $mig$
declare
  r       record;
  v_new   text;
  v_count int := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prosrc ~ '<>\s*auth\.uid\(\)'
       and (p.proacl is null
            or (p.proacl)[1]::text like '=X/%'
            or exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%'))
     order by 1
  loop
    v_new := regexp_replace(
               r.def,
               '(if\s+)(v_\w+\s*<>\s*auth\.uid\(\)\s+then)',
               '\1auth.uid() is null or \2',
               'g');

    if v_new = r.def then
      continue;
    end if;

    if length(v_new) - length(r.def) <> 22 then
      raise exception 'Refusing to patch %: byte delta % (expected 22)',
        r.fn, length(v_new) - length(r.def);
    end if;

    execute v_new;
    v_count := v_count + 1;
  end loop;

  if v_count <> 19 then
    raise exception 'Expected to patch 19 functions, patched %', v_count;
  end if;
end
$mig$;
