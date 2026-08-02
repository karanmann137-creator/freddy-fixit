-- Mandatory photos on staged (milestone) jobs (2026-08-02)
--
-- Companion to 20260802130000_mandatory_before_after_job_photos.sql. Milestone
-- jobs never go through mark_job_complete — each stage closes via
-- complete_milestone — so the same rule has to be enforced here or a >$2k job
-- could release stage after stage with no evidence at all.
--
-- Admins are exempt: complete_milestone already permits is_admin(), and an admin
-- closing a stage is manual ops, not someone standing on site with a phone.
create or replace function public.complete_milestone(p_milestone uuid, p_photo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.job_milestones%rowtype;
  v_job public.jobs%rowtype;
  v_photo text;
begin
  select * into v_m from public.job_milestones where id = p_milestone;
  if not found then
    raise exception 'Milestone not found';
  end if;
  select * into v_job from public.jobs where id = v_m.job_id;
  if not public.is_admin() and auth.uid() <> v_job.contractor_id then
    raise exception 'Only the assigned contractor can complete this stage';
  end if;
  if v_m.status <> 'funded' then
    raise exception 'This stage must be funded before it can be completed';
  end if;

  -- A photo saved earlier on this stage counts, same as the whole-job path.
  v_photo := coalesce(p_photo, v_m.completion_photo_path);

  if not public.is_admin() then
    if v_photo is null then
      raise exception 'Add a photo of the finished work for this stage — the client can''t release payment without it.';
    end if;
    if v_job.before_photo_path is null and v_job.created_at >= public.photo_rules_start() then
      raise exception 'Add your "before" photo for this job first — the one you take when you arrive.';
    end if;
  end if;

  update public.job_milestones
     set status = 'completed',
         completed_at = now(),
         completion_photo_path = v_photo
   where id = p_milestone;

  if v_job.client_id is not null then
    perform public._notify(
      v_job.client_id, 'milestone_completed',
      'Stage completed: ' || v_m.title,
      'Your contractor marked "' || v_m.title || '" complete. Review and release payment for this stage.',
      v_m.job_id);
  end if;
end;
$$;
