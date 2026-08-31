-- APPLIED LIVE via Supabase MCP on 2026-08-30. Committed for version control
-- only — installers do not apply DB changes.
--
-- A client can no longer move a booked visit that is less than 24 hours away.
--
-- The gate is `contract_signed`, and that is NOT an arbitrary choice — it is the
-- exact complement of `release_unconfirmed_visits`, which only ever releases a
-- visit that is BOTH unsigned AND unpaid, at scheduled_at - 12h. Gate the block
-- on anything wider and an unsigned job gets a wall at 24h and then silently
-- loses the slot at 12h anyway: the client is refused the one action that could
-- have saved the booking, and then the booking goes. So while nothing is signed
-- the client stays free to move the time; once the agreement is signed the pro
-- has committed the day and 24 hours' notice is the least they are owed.
--
-- Only the ALREADY-BOOKED time is tested, not the proposed new one. Moving a
-- visit that is five days out to tomorrow evening is a REQUEST — this RPC flips
-- the job back to 'assigned' and the contractor still has to accept — so
-- refusing it would block a change both sides might want. The harm this fixes is
-- one-sided: a pro who has held a day open losing it on a few hours' notice.
--
-- The client is not trapped. Chat stays open on a scheduled job, and
-- `chat_agree_time` still writes a new time when BOTH parties agree in the
-- thread — which is the right shape for a genuine last-minute change, because
-- the pro is party to it. The message says so rather than just refusing.
--
-- The frontend mirrors the same 24h + signed test in `canReschedule()` so the
-- button explains itself BEFORE the tap. The RPC is still the authority — the
-- UI test exists to avoid a dead-end click, not to enforce anything.
--
-- search_path also upgraded from 'public, pg_temp' to include extensions.
--
-- Verified by rolled-back probe under a real client JWT claim, 3/3:
--   signed + 6h away          -> blocked
--   unsigned + 6h away        -> allowed (the release sweep owns that case)
--   signed + 5d away -> 20h   -> allowed (the pro still has to accept)
-- ACL afterwards: {postgres, authenticated, service_role} — anon and PUBLIC
-- both revoked (the default grant is to PUBLIC, so revoking anon alone is a
-- no-op).

create or replace function public.client_reschedule_visit(
  p_job_id uuid,
  p_scheduled_at timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_client     uuid;
  v_contractor uuid;
  v_status     text;
  v_at         timestamptz;
begin
  select client_id, contractor_id, status, scheduled_at
    into v_client, v_contractor, v_status, v_at
    from jobs where id = p_job_id;

  if v_client is null then raise exception 'Job not found'; end if;
  if v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('scheduled','assigned') then
    raise exception 'This job can no longer be rescheduled here';
  end if;
  if p_scheduled_at <= now() then raise exception 'Pick a time in the future'; end if;

  if v_at is not null
     and v_at - now() < interval '24 hours'
     and public.contract_signed(p_job_id)
  then
    raise exception 'Your visit is less than 24 hours away, so the time can''t be changed here — your pro has set the day aside for you. Message them in the job chat and agree a new time together, and it will update automatically.';
  end if;

  update jobs
     set scheduled_at              = p_scheduled_at,
         client_rescheduled_at     = now(),
         client_confirmed_visit_at = null,
         reschedule_accepted_at    = null,
         schedule_proposed_at      = now(),
         client_approved_at        = null,
         status                    = 'assigned'
   where id = p_job_id;

  perform public.notify_user(v_contractor, 'reschedule_requested',
    'Client moved the visit',
    'The client changed the time to '||coalesce(public.ff_local_ts(p_scheduled_at),'a new time')||
    '. Open the job to accept it, or propose a different time if you''re not available.',
    'https://freddyfixit.ca/contractor-dashboard', 'Review new time');
end; $function$;

revoke all on function public.client_reschedule_visit(uuid, timestamptz) from public;
revoke execute on function public.client_reschedule_visit(uuid, timestamptz) from anon;
grant execute on function public.client_reschedule_visit(uuid, timestamptz) to authenticated;
