-- RLS performance + scoping pass. Two mechanical changes, no change to WHO can
-- see WHAT -- verified by a rolled-back probe under real JWT claims before and
-- after (client / contractor / admin / anon row counts identical).
--
-- 1. auth.uid() and is_admin() are wrapped as (select ...). Postgres re-evaluates
--    a bare function call in a policy ONCE PER ROW. Wrapped in a scalar
--    subquery it becomes an InitPlan, evaluated once per query. On a table with
--    a million rows that is the difference between one auth lookup and a
--    million of them, and it is the single highest-leverage RLS change there is.
--
-- 2. Policies with no TO clause default to PUBLIC, so they are also evaluated
--    for anon. Every policy touched here tests auth.uid() or is_admin(), both
--    of which are NULL/false for anon, so it could never have matched -- the
--    work was pure waste. Scoping to `authenticated` skips it outright.
--
-- SAFETY RULE, and the reason this is generated rather than hand-written: a
-- policy may only be scoped TO authenticated if its expression CANNOT be true
-- for anon. Anything mentioning auth.uid()/auth.jwt()/is_admin() qualifies.
-- Everything else is a genuine public policy (blog, portfolio, service pricing,
-- the marketing site's reads) and is deliberately left alone -- scoping those
-- would take the public site down.
--
-- service_role has rolbypassrls = true, so edge functions are unaffected.
--
-- The unwrap-then-wrap double replace is idempotent: re-running can never
-- produce (select (select auth.uid())).
do $mig$
declare
  p record;
  v_qual text;
  v_check text;
  v_sql text;
  n int := 0;
begin
  for p in
    select tablename, policyname, roles::text as roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual,'') || coalesce(with_check,'') ~ 'auth\.uid\(\)|auth\.jwt\(\)|is_admin\(\)'
    order by tablename, policyname
  loop
    v_qual := replace(replace(replace(replace(p.qual,
                '( SELECT auth.uid() AS uid)', 'auth.uid()'),
                'auth.uid()', '(select auth.uid())'),
                '( SELECT is_admin() AS is_admin)', 'is_admin()'),
                'is_admin()', '(select is_admin())');
    v_check := replace(replace(replace(replace(p.with_check,
                '( SELECT auth.uid() AS uid)', 'auth.uid()'),
                'auth.uid()', '(select auth.uid())'),
                '( SELECT is_admin() AS is_admin)', 'is_admin()'),
                'is_admin()', '(select is_admin())');

    if p.roles <> '{public}'
       and p.qual is not distinct from v_qual
       and p.with_check is not distinct from v_check then
      continue;  -- already correct
    end if;

    v_sql := 'alter policy ' || quote_ident(p.policyname)
          || ' on public.' || quote_ident(p.tablename)
          || case when p.roles = '{public}' then ' to authenticated' else '' end
          || case when p.qual is not null then ' using (' || v_qual || ')' else '' end
          || case when p.with_check is not null then ' with check (' || v_check || ')' else '' end;

    execute v_sql;
    n := n + 1;
  end loop;

  raise notice 'rewrote % policies', n;
end $mig$;
