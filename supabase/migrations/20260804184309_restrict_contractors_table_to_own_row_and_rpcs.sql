-- The "Active contractors visible to clients" policy exposed all 38 columns of
-- every active contractor to ANY caller, including anon: auth user ids
-- (contractors.id IS the auth uid), total_earned, stripe_account_id,
-- insurance_provider/expiry, license_number, work_references, doc_urls,
-- review_result, hourly_rate, weekly_goal.
--
-- Nothing needs it. Verified across src/: all 11 direct `from("contractors")`
-- call sites are own-row (.eq("id", user.id) / .eq("id", profile.id) /
-- upsert({id:userId})), covered by "Contractors manage own profile". Every
-- read of SOMEONE ELSE's contractor row goes through a SECURITY DEFINER RPC
-- that curates its own column list: get_contractor_profile, get_top_pros,
-- get_contractor_directory, list_my_pros, admin_get_contractor_detail.
drop policy if exists "Active contractors visible to clients" on public.contractors;

-- The client_requests policy "Contractors view assigned requests" does
--   EXISTS (SELECT 1 FROM contractors c WHERE c.id = auth.uid() AND c.status='active')
-- which is an own-row read, still satisfied by "Contractors manage own profile".

-- anon has no legitimate direct access to this table at all; it only ever
-- reaches contractor data through the DEFINER RPCs above.
revoke all on table public.contractors from anon;

-- TRUNCATE is NOT subject to RLS. No app path issues TRUNCATE (PostgREST cannot
-- emit it), so removing it from the client-facing roles across the schema costs
-- nothing and removes an RLS-bypassing verb from a public key.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
  loop
    execute format('revoke truncate on table public.%I from anon, authenticated', r.relname);
  end loop;
end $$;
