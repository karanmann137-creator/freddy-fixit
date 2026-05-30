-- Optional problem photo on client_requests + private storage bucket.
-- Already applied to production via Supabase on 2026-05-29.
alter table public.client_requests add column if not exists photo_path text;
insert into storage.buckets (id, name, public) values ('problem-photos','problem-photos', false) on conflict (id) do nothing;
drop policy if exists "client upload problem photos" on storage.objects;
create policy "client upload problem photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'problem-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read permitted problem photos" on storage.objects;
create policy "read permitted problem photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'problem-photos'
    and ( (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
          or exists (select 1 from public.client_requests cr where cr.photo_path = storage.objects.name) )
  );
