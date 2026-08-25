-- rate_limit_hits is keyed by distinct client IP, so it is unbounded at the
-- scale this audit is aimed at. Prune anything outside the widest window.

delete from public.rate_limit_hits where key = '184.34.184.206';  -- verification probe row

create or replace function public.prune_rate_limit_hits()
returns void language sql security definer
set search_path = public, extensions, pg_temp
as $fn$
  delete from public.rate_limit_hits where window_start < now() - interval '2 days';
$fn$;
revoke all on function public.prune_rate_limit_hits() from public, anon, authenticated;
grant execute on function public.prune_rate_limit_hits() to service_role;

select cron.schedule('prune-rate-limits', '17 4 * * *', $cron$select public.prune_rate_limit_hits();$cron$);
