-- APPLIED LIVE via Supabase MCP on 2026-08-30. Committed for version control
-- only — installers do not apply DB changes.
--
-- Tell the client when their contractor starts tracking time on the job.
--
-- Three decisions are load-bearing:
--
-- 1. It fires on the FIRST start for that job ONLY. A pro who breaks for lunch
--    and restarts would otherwise ping the client every time, and a notification
--    that arrives four times an afternoon is one the client learns to ignore --
--    including the ones that gate their money. The "is this the first?" read
--    happens BEFORE the insert, or the row we are about to write makes every
--    start look like a resume and the client is never told at all.
--
-- 2. The notification is wrapped in its own exception block. Starting the timer
--    is something a pro presses while standing in somebody's house; it must
--    never fail because a notification did. This is the pgcrypto lesson, where
--    an unguarded raise inside a signup transaction cost every account for a
--    month. A bell is never worth the action it is reporting on.
--
-- 3. The body deliberately does NOT promise a price. "Bill for tracked time"
--    only pre-fills the existing price-change form, which the client still has
--    to approve -- so the copy says time is being recorded and that any change
--    to the price still needs their approval. Telling a client they are now on
--    the clock, when the quoted price may never move, invents a bill.
--
-- No raw net.http_post here on purpose: writing the notifications row is what
-- fans out to email, through the webhook whose WHEN clause honours
-- outbound_paused(). A direct post in a function body answers to nothing and is
-- a pause bypass. The in-app bell survives a pause either way.
--
-- `timer_started` is deliberately NOT added to EMAIL_HANDLED_ELSEWHERE in
-- send-notification: it has exactly one emitter and no richer dedicated email,
-- so the generic webhook copy IS the email, which is what was asked for.
--
-- search_path also upgraded from 'public, pg_temp' to include extensions.

create or replace function public.start_job_timer(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
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

  v_first := not exists (select 1 from job_time_logs where job_id = p_job_id);

  insert into job_time_logs (job_id, contractor_id) values (p_job_id, v_contractor)
  returning id into v_id;

  if v_first and v_client is not null then
    begin
      select nullif(trim(coalesce(c.company_name, p.first_name, '')), '')
        into v_name
        from profiles p
        left join contractors c on c.user_id = v_contractor
       where p.id = v_contractor;

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
      -- Swallowed on purpose. See note 2 above.
      null;
    end;
  end if;

  return v_id;
end; $function$;

revoke all on function public.start_job_timer(uuid) from public;
revoke execute on function public.start_job_timer(uuid) from anon;
grant execute on function public.start_job_timer(uuid) to authenticated;
