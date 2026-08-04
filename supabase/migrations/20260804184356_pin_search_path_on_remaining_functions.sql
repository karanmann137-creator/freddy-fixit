-- An unpinned search_path on a SECURITY DEFINER function lets a caller who can
-- create a schema shadow an unqualified reference. Pin all remaining functions.
-- `extensions` is included deliberately: pgcrypto lives there, and omitting it
-- is exactly what broke every signup for a month (see gen_referral_code).
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proconfig is null
      and p.prokind = 'f'
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public, extensions, pg_temp',
      r.proname, r.args
    );
  end loop;
end $$;
