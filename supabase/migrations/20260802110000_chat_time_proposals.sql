-- Scheduling from the chat.
--
-- Detection is client-side (src/lib/chatParse.ts) because Postgres cannot resolve
-- "thursday at 2pm" against the reader's local calendar. The RESULT is persisted
-- here, onto the job row, which is what makes the prompt appear on the other
-- person's dashboard with no polling and no open chat window — both dashboards
-- already load the job.

alter table public.jobs
  add column if not exists chat_time_at          timestamptz,
  add column if not exists chat_time_by          uuid references public.profiles(id),
  add column if not exists chat_time_proposed_at timestamptz,
  add column if not exists chat_time_msg         text,
  add column if not exists chat_time_resolved_at timestamptz;

-- The sender's browser calls this after its own message sends. Fire-and-forget:
-- a scheduling hiccup must never make a delivered message look failed.
create or replace function public.chat_propose_time(
  p_job_id uuid, p_at timestamptz, p_snippet text default null
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_job   record;
  v_other uuid;
  v_name  text;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then raise exception 'Job not found'; end if;
  if v_uid is null or v_uid not in (v_job.client_id, v_job.contractor_id) then
    raise exception 'Not your job';
  end if;
  if v_job.status in ('completed','cancelled','pending_confirmation') then
    return 'ignored';
  end if;
  if p_at is null or p_at <= now() then
    return 'ignored';
  end if;

  if v_job.chat_time_resolved_at is null
     and v_job.chat_time_by = v_uid
     and v_job.chat_time_at = p_at then
    return 'duplicate';
  end if;

  update public.jobs set
    chat_time_at          = p_at,
    chat_time_by          = v_uid,
    chat_time_proposed_at = now(),
    chat_time_msg         = left(coalesce(p_snippet, ''), 300),
    chat_time_resolved_at = null
  where id = p_job_id;

  v_other := case when v_uid = v_job.client_id then v_job.contractor_id else v_job.client_id end;
  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_name from public.profiles where id = v_uid;

  if v_other is not null then
    perform public._notify(
      v_other,
      'chat_time_proposed',
      'A time was suggested in your chat',
      coalesce(v_name, 'The other party') || ' suggested ' ||
        to_char(p_at at time zone 'America/Edmonton', 'FMDay FMMon FMDD at FMHH12:MIam') ||
        '. Accept it or suggest another time.',
      p_job_id
    );
  end if;

  return 'proposed';
end;
$function$;

-- Accepting. The branches exist so this can NEVER skip a payment step:
--   scheduled        the job is booked and paid; the time simply moves
--   proposal_updated an estimate is sitting with the client; only the proposed
--                    time moves — approval and payment still run normally
--   penciled         no formal schedule yet; the time shows on the calendar
--   ignored          nothing to do
create or replace function public.chat_agree_time(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_job  record;
  v_at   timestamptz;
  v_mode text;
  v_name text;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then raise exception 'Job not found'; end if;
  if v_uid is null or v_uid not in (v_job.client_id, v_job.contractor_id) then
    raise exception 'Not your job';
  end if;
  if v_job.chat_time_at is null or v_job.chat_time_resolved_at is not null then
    raise exception 'There is no time waiting on your answer';
  end if;
  if v_job.chat_time_by = v_uid then
    raise exception 'You suggested this time — the other side needs to accept it';
  end if;

  v_at := v_job.chat_time_at;

  if v_job.status = 'scheduled' then
    update public.jobs set
      scheduled_at              = v_at,
      client_confirmed_visit_at = now(),
      client_rescheduled_at     = null,
      reschedule_accepted_at    = null,
      visit_reminder_sent_at    = null,
      chat_time_resolved_at     = now()
    where id = p_job_id;
    v_mode := 'scheduled';

  elsif v_job.status = 'assigned' and v_job.schedule_proposed_at is not null
        and v_job.client_approved_at is null then
    update public.jobs set
      scheduled_at          = v_at,
      schedule_proposed_at  = now(),
      chat_time_resolved_at = now()
    where id = p_job_id;
    v_mode := 'proposal_updated';

  elsif v_job.status in ('assigned','in_progress') then
    update public.jobs set
      scheduled_at          = v_at,
      chat_time_resolved_at = now()
    where id = p_job_id;
    v_mode := 'penciled';

  else
    update public.jobs set chat_time_resolved_at = now() where id = p_job_id;
    return 'ignored';
  end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_name from public.profiles where id = v_uid;

  perform public._notify(
    v_job.chat_time_by,
    'chat_time_agreed',
    'Your time was accepted',
    coalesce(v_name, 'The other party') || ' accepted ' ||
      to_char(v_at at time zone 'America/Edmonton', 'FMDay FMMon FMDD at FMHH12:MIam') ||
      case v_mode
        when 'proposal_updated' then '. The client still needs to approve the estimate before it is booked.'
        when 'penciled'         then '. It is pencilled in — send your estimate to lock it in.'
        else '. It is on the calendar.'
      end,
    p_job_id
  );

  return v_mode;
end;
$function$;

-- Declining just clears the proposal; the UI then opens the chat so they can
-- type a different time, which fires chat_propose_time the other way.
create or replace function public.chat_decline_time(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_job record;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then raise exception 'Job not found'; end if;
  if v_uid is null or v_uid not in (v_job.client_id, v_job.contractor_id) then
    raise exception 'Not your job';
  end if;

  update public.jobs set chat_time_resolved_at = now()
  where id = p_job_id and chat_time_resolved_at is null;

  return 'declined';
end;
$function$;

revoke all on function public.chat_propose_time(uuid, timestamptz, text) from public, anon;
revoke all on function public.chat_agree_time(uuid)   from public, anon;
revoke all on function public.chat_decline_time(uuid) from public, anon;
grant execute on function public.chat_propose_time(uuid, timestamptz, text) to authenticated;
grant execute on function public.chat_agree_time(uuid)   to authenticated;
grant execute on function public.chat_decline_time(uuid) to authenticated;
