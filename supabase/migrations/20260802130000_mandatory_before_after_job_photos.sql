-- Mandatory before/after job photos (2026-08-02)
--
-- The completion photo used to be optional: mark_job_complete did
--   completion_photo_path = coalesce(p_photo_path, completion_photo_path)
-- so passing NULL simply left the column alone and the job still flipped to
-- pending_confirmation. There was no "before" photo concept at all.
--
-- Now both are required. The before photo is what makes the after photo mean
-- anything to the client; the after photo is what unlocks confirmation and
-- therefore payment.
--
-- Photos save the moment they are taken (save_job_photo) rather than being held
-- until completion — if the pro closes the app on site, the photo is already on
-- the record and mark_job_complete just reads the columns.
--
-- Both photos live in the existing private completion-photos bucket under
-- <job_id>/…, which is exactly what that bucket's RLS keys on, so no storage
-- policy changes were needed.

alter table public.jobs
  add column if not exists before_photo_path text,
  add column if not exists before_photo_at   timestamptz,
  add column if not exists after_photo_at    timestamptz;

-- Grandfathering. Jobs booked before this were never prompted for a before
-- photo, so blocking them on one would strand an in-flight contractor's payment.
-- The after-photo rule applies to everyone.
--
-- Mirrored client-side by PHOTO_RULES_START in src/components/JobPhotos.tsx and
-- in supabase/functions/visit-reminder/index.ts — keep all three in sync.
create or replace function public.photo_rules_start()
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $$ select timestamptz '2026-08-02 00:00:00+00' $$;

revoke all on function public.photo_rules_start() from public;
grant execute on function public.photo_rules_start() to anon, authenticated;


-- Save one photo the instant it is taken.
create or replace function public.save_job_photo(p_job_id uuid, p_kind text, p_path text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_contractor uuid; v_status text;
begin
  if p_kind not in ('before','after') then raise exception 'Unknown photo type'; end if;
  if p_path is null or btrim(p_path) = '' then raise exception 'No photo was uploaded'; end if;

  -- The bucket RLS already keys on <job_id>/… ; mirror that here so a path
  -- belonging to another job can never be written onto this record.
  if split_part(p_path, '/', 1) <> p_job_id::text then
    raise exception 'That photo does not belong to this job';
  end if;

  select contractor_id, status into v_contractor, v_status from public.jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('assigned','scheduled','in_progress','pending_confirmation') then
    raise exception 'This job is no longer open for photos';
  end if;

  if p_kind = 'before' then
    update public.jobs set before_photo_path = p_path, before_photo_at = now() where id = p_job_id;
  else
    update public.jobs set completion_photo_path = p_path, after_photo_at = now() where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.save_job_photo(uuid, text, text) from public, anon;
grant execute on function public.save_job_photo(uuid, text, text) to authenticated;


-- The gate. Same body as before plus the two photo guards.
create or replace function public.mark_job_complete(p_job_id uuid, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contractor uuid; v_client uuid; v_status text; v_req uuid;
  v_before text; v_after text; v_created timestamptz;
begin
  select contractor_id, client_id, status, request_id, before_photo_path, completion_photo_path, created_at
    into v_contractor, v_client, v_status, v_req, v_before, v_after, v_created
    from public.jobs where id = p_job_id;

  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('scheduled','in_progress') then raise exception 'Job is not in a completable state'; end if;

  -- p_photo_path is still accepted so an after photo can be supplied inline,
  -- but the saved column counts too (save_job_photo may already have set it).
  v_after := coalesce(p_photo_path, v_after);

  if v_after is null then
    raise exception 'Add a photo of the finished work before you mark this job complete — the client can''t confirm and release your payment without it.';
  end if;

  if v_before is null and v_created >= public.photo_rules_start() then
    raise exception 'Add your "before" photo first — the one you take when you arrive, so the client can see the difference.';
  end if;

  update public.jobs
     set status = 'pending_confirmation',
         contractor_completed_at = now(),
         completion_photo_path = v_after,
         after_photo_at = coalesce(after_photo_at, now())
   where id = p_job_id;

  update public.client_requests set status = 'in_progress' where id = v_req;

  perform public._notify(v_client, 'completion_pending', 'Job marked complete',
    'Your contractor marked the job complete and uploaded a photo of the finished work. Please review and confirm in your dashboard.', p_job_id);
end;
$$;
