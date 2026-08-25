-- Worklist for the one-shot image-compression backfill (edge fn compress-images).
--
-- storage.objects is not exposed over PostgREST, so even a service-role client
-- cannot select from it directly. A SECURITY DEFINER RPC is the supported way
-- in, which is the only reason this function exists.
--
-- THE BUCKET ALLOW-LIST IS INSIDE THE FUNCTION, NOT A CALLER ARGUMENT. That is
-- deliberate and load-bearing: `contractor-docs` must never be compressed --
-- review-contractor sends those files to Claude to *read* and the owner reads
-- them by eye, so squeezing an insurance certificate can destroy the fine
-- print that is the entire point of holding it. Putting the list here means a
-- future caller cannot reach that bucket even by explicitly asking for it.
--
-- Cursor is by NAME, not offset, so a retry stays correct as compressed files
-- drop out of the worklist underneath it.
create or replace function public.admin_oversized_objects(
  p_bucket text,
  p_floor  bigint default 300000,
  p_after  text   default '',
  p_limit  int    default 6
) returns table (name text, bytes bigint)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select o.name, (o.metadata->>'size')::bigint
  from storage.objects o
  where o.bucket_id = p_bucket
    and p_bucket in ('portfolio-photos', 'contractor-photos')
    and (o.metadata->>'size')::bigint > p_floor
    and o.name > coalesce(p_after, '')
  order by o.name
  limit greatest(1, least(p_limit, 50));
$$;

-- Revoking from anon alone is a no-op: the default grant is to PUBLIC.
revoke all on function public.admin_oversized_objects(text, bigint, text, int) from public;
revoke all on function public.admin_oversized_objects(text, bigint, text, int) from anon;
revoke all on function public.admin_oversized_objects(text, bigint, text, int) from authenticated;
grant execute on function public.admin_oversized_objects(text, bigint, text, int) to service_role;
