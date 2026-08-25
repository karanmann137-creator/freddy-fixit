-- P1-6: close anon / PUBLIC EXECUTE on the admin RPCs and platform_health_check.
--
-- Revoking from `anon` alone is a no-op on these: the default function grant is
-- to PUBLIC (proacl `=X/postgres`), so `revoke ... from public` is required too.
--
-- platform_health_check() is the one real (minor) leak: NO guard of any kind and
-- anon=X, so any holder of the publicly-shipped anon key could read platform
-- internals -- stuck payouts, unpaid balances, underfunded jobs, stuck signups.
-- It is NOT given a guard, because it has exactly one caller,
-- run_platform_health_check() (pg_cron, {postgres,service_role}), and the frontend
-- Health tab calls the separate, already-guarded admin_health(). A guard would be
-- a second thing to keep right; no grant is simply nothing to get wrong.
--
-- The admin_* functions all check is_admin() in-body already, so these revokes
-- are defence in depth: they stop an unauthenticated caller reaching the body at
-- all, rather than relying on the guard inside it.

revoke execute on function public.platform_health_check() from public, anon, authenticated;

revoke execute on function public.admin_health()                          from public, anon;
revoke execute on function public.admin_list_accounts()                   from public, anon;
revoke execute on function public.admin_list_messages(integer)            from public, anon;
revoke execute on function public.admin_rank_contractors(uuid)            from public, anon;
revoke execute on function public.admin_resignup_matches()                from public, anon;
revoke execute on function public.admin_delete_job(uuid, boolean)         from public, anon;
revoke execute on function public.admin_delete_request(uuid)              from public, anon;
revoke execute on function public.admin_set_contractor_status(uuid, text) from public, anon;
