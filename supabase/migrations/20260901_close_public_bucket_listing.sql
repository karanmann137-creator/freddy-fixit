-- Close bucket enumeration on contractor-photos and portfolio-photos.
-- APPLIED LIVE VIA SUPABASE MCP -- this file is version control only.
--
-- Both buckets are public, and a PUBLIC bucket serves
-- /storage/v1/object/public/<bucket>/<path> WITHOUT consulting RLS. RLS on
-- storage.objects governs only the authenticated API surface: list, signed
-- URLs, move, upload. So the blanket `for select to public using (bucket_id
-- = '...')` policies were never what made avatars and portfolio images
-- display -- they were what made the buckets ENUMERABLE.
--
-- What that leaked: a folder name in either bucket IS the contractor's auth
-- uid (contractors.id is the auth uid), so anyone could list every
-- contractor's uid, their filenames and counts. The 2026-08-04 audit closed
-- public.contractors to anon precisely so uids would not leak; bucket
-- listing partially undid that. It also exposed the avatars and portfolios
-- of PENDING and DEACTIVATED contractors, which get_contractor_directory,
-- get_top_pros and get_contractor_profile all deliberately hide.
--
-- Safe to tighten because nothing in src/ lists either bucket -- every
-- frontend use is getPublicUrl / upload / remove. The only .list() calls are
-- in delete-account and admin-delete-account, both on service-role clients,
-- which bypass RLS entirely.
--
-- The write policies are re-scoped from {public} to {authenticated} at the
-- same time. That changes no behaviour: the USING clause already required a
-- non-null auth.uid(). It stops the ACL depending on the predicate being
-- correct -- the same lesson as set_job_autopay's null-unsafe owner check.

drop policy if exists "contractor photos public read" on storage.objects;
drop policy if exists "portfolio photos public read"  on storage.objects;

create policy "contractor photos owner or admin read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'contractor-photos'
    and ( split_part(name, '/', 1) = (select auth.uid())::text or public.is_admin() )
  );

create policy "portfolio photos owner or admin read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'portfolio-photos'
    and ( split_part(name, '/', 1) = (select auth.uid())::text or public.is_admin() )
  );

drop policy if exists "contractor photos owner upload" on storage.objects;
drop policy if exists "contractor photos owner update" on storage.objects;
drop policy if exists "contractor photos owner delete" on storage.objects;

create policy "contractor photos owner upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'contractor-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "contractor photos owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'contractor-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "contractor photos owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'contractor-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
