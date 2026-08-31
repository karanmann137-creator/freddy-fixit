-- Fix the timer_started client notification, which never fired.
--
-- APPLIED LIVE via Supabase MCP. This file is version control only — an
-- installer does not run migrations.
--
-- The bug, and why it was invisible. 20260830_notify_client_on_first_job_timer_start.sql
-- shipped the notification, but the contractor name lookup joined
-- `contractors c on c.user_id = v_contractor`. There is no `user_id` column on
-- `contractors` — CONTRACTORS.ID *IS* THE AUTH UID. So the SELECT raised 42703
-- every single time.
--
-- That alone would have been a missing name. What made it a missing
-- NOTIFICATION is that the lookup and the `_notify()` call shared ONE
--   begin ... exception when others then null; end;
-- block. The catch-all was there to protect the timer from a notification
-- failure — a sound instinct — but because a cosmetic read sat inside the same
-- block, its error aborted the block before `_notify()` was ever reached, and
-- then swallowed the evidence. The pro's timer started, the client heard
-- nothing, and nothing errored anywhere.
--
-- This is the pgcrypto signup-killer shape exactly: a catch-all wrapped around
-- a block containing both a cosmetic lookup AND a real side effect silently
-- discards the side effect. The structural rule this encodes:
--
--   A catch-all may cover exactly one thing that matters. Anything cosmetic in
--   the same block gets its own guard, or it can take the real work with it.
--
-- So the name lookup now has its own block defaulting `v_name := null`, and it
-- degrades to "Your contractor" rather than killing the bell. The notification
-- keeps its own catch-all, for the original good reason: a notification must
-- never roll back a timer a pro has already started standing in someone's
-- kitchen.
--
-- Verified by rolled-back probe under real JWT claims (job fd9c3db4):
--   start_job_timer as contractor -> OK
--   client notifications 18 -> 19
--   newest: type=timer_started, name resolved from company_name
--   2nd start raised: A timer is already running on this job
--   after 2nd: 19 -> 19 (unchanged — a resume must not re-bell)
--
-- `timer_started` is deliberately NOT in EMAIL_HANDLED_ELSEWHERE in
-- send-notification: it has exactly one emitter (this function), and the owner
-- asked for the client to be emailed when the timer starts, so the generic
-- webhook email IS that email.

create or replace function public.start_job_timer(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_contractor uuid;
  v_status     text;
  v_client     uuid;
  v_service    text;
  v_first      boolean;
  v_name       text;
  v_id         uuid;
begin
  select j.contractor_id, j.status, j.client_id, r.service_needed
    into v_contractor, v_status, v_client, v_service
    from jobs j
    left join client_requests r on r.id = j.request_id
   where j.id = p_job_id;

  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status in ('completed','cancelled') then raise exception 'Job is finished — the timer can''t be started'; end if;
  if exists (select 1 from job_time_logs where job_id = p_job_id and ended_at is null) then
    raise exception 'A timer is already running on this job';
  end if;

  -- Read BEFORE the insert, or the row we are about to write makes every start
  -- look like a resume and the client is never told at all.
  v_first := not exists (select 1 from job_time_logs where job_id = p_job_id);

  insert into job_time_logs (job_id, contractor_id) values (p_job_id, v_contractor)
  returning id into v_id;

  if v_first and v_client is not null then
    -- Cosmetic only, and guarded on its own so it cannot take the notification
    -- with it. `contractors.id` IS the auth uid; there is no user_id column.
    begin
      select nullif(trim(coalesce(c.company_name, p.first_name, '')), '')
        into v_name
        from profiles p
        left join contractors c on c.id = p.id
       where p.id = v_contractor;
    exception when others then
      v_name := null;
    end;

    begin
      perform public._notify(
        v_client,
        'timer_started',
        coalesce(v_name, 'Your contractor') || ' has started work',
        coalesce(v_name, 'Your pro') || ' just started the timer on your '
          || coalesce(lower(v_service), 'job')
          || '. You can watch the tracked time on your dashboard. The price you agreed does not change on its own — if they need to bill for the time, you will get a price change to approve first.',
        p_job_id
      );
    exception when others then
      -- A notification must never roll back a timer the pro has already
      -- started standing in someone's kitchen.
      null;
    end;
  end if;

  return v_id;
end; $function$;

-- Only a signed-in contractor ever calls this. The default grant is to PUBLIC,
-- so revoking from anon alone would be a no-op.
revoke execute on function public.start_job_timer(uuid) from public, anon;
grant  execute on function public.start_job_timer(uuid) to authenticated, service_role;
