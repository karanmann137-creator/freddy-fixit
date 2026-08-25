-- P1-7. Revoke PUBLIC/anon/authenticated EXECUTE on trigger function bodies.
--
-- HONESTY NOTE: this was NOT a reachable hole. PostgREST does not expose
-- functions returning `trigger`, so nobody could have called these over the
-- public API. This is defence in depth -- it removes a default grant that
-- exists only because Postgres grants EXECUTE to PUBLIC on every new function.
--
-- Safety was verified by probe, not assumed: PostgreSQL checks EXECUTE on a
-- trigger function at CREATE TRIGGER time, NOT at fire time. A throwaway table
-- + trigger with all EXECUTE revoked, inserted as `authenticated`, still fired
-- the trigger. That matters here because the set includes handle_new_user --
-- the function whose silent failure killed every signup for a month.

do $mig$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and (p.proacl is null or p.proacl::text like '%=X/%'
           or p.proacl::text like '%anon=X%' or p.proacl::text like '%authenticated=X%')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    n := n + 1;
  end loop;
  raise notice 'locked down % trigger functions', n;
end $mig$;
