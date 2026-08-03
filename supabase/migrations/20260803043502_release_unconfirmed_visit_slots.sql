-- Release a booked visit slot when the job never got signed and paid in time.
--
-- Nothing is cancelled or deleted: the job, the estimate, the contractor
-- assignment and the agreement draft all survive. Only the *time* is given
-- back, the job drops to 'assigned' (which is exactly the state where the
-- contractor's "propose a time" form reappears), and both sides are told why.
-- Either side can then rebook through the normal flow, or through chat
-- scheduling (chat_propose_time / chat_agree_time both handle 'assigned').
--
-- Deadline: greatest(scheduled_at - 12h, client_approved_at + 2h)
--   - 12h before the visit leaves the pro time to refill the slot
--   - the +2h floor stops a genuine same-day booking being released the
--     instant it is made
-- Because greatest() puts an already-past visit time in the past, a visit whose
-- slot has already lapsed unpaid is caught on the next run.

alter table public.jobs
  add column if not exists slot_released_at   timestamptz,
  add column if not exists slot_released_from timestamptz;

comment on column public.jobs.slot_released_at is
  'When the booked visit time was released because the job was not signed and paid in time.';
comment on column public.jobs.slot_released_from is
  'The visit time that was released, kept so both parties can be told what they lost.';

create or replace function public.release_unconfirmed_visits()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r     record;
  v_n   integer := 0;
  v_when text;
begin
  for r in
    select j.id, j.client_id, j.contractor_id, j.scheduled_at,
           cr.service_needed
      from jobs j
      left join client_requests cr on cr.id = j.request_id
     where j.status = 'scheduled'
       and j.scheduled_at is not null
       and j.client_approved_at is not null
       and coalesce(j.payment_status, 'unpaid') not in ('held', 'released', 'disputed')
       and j.on_my_way_at is null
       and not public.contract_signed(j.id)
       and now() >= greatest(j.scheduled_at - interval '12 hours',
                             j.client_approved_at + interval '2 hours')
       -- staged jobs pay per stage, so jobs.payment_status stays 'unpaid'
       and not exists (
             select 1 from job_milestones m
              where m.job_id = j.id
                and m.status in ('funded', 'completed', 'released', 'disputed'))
       -- prepaid recurring visits are already covered by the pool
       and not exists (
             select 1 from recurring_prepayments rp
              where rp.id = j.prepayment_id
                and rp.status in ('held', 'partially_released'))
  loop
    v_when := coalesce(public.ff_local_ts(r.scheduled_at), 'the booked time');

    update jobs
       set status                    = 'assigned',
           slot_released_at          = now(),
           slot_released_from        = r.scheduled_at,
           scheduled_at              = null,
           schedule_proposed_at      = null,
           client_approved_at        = null,
           client_confirmed_visit_at = null,
           client_rescheduled_at     = null,
           reschedule_accepted_at    = null,
           visit_reminder_sent_at    = null,
           hour_reminder_sent_at     = null
     where id = r.id;

    begin
      perform public._notify(
        r.client_id, 'visit_slot_released',
        'Your ' || coalesce(r.service_needed, 'job') || ' visit needs rebooking',
        'The visit booked for ' || v_when || ' has been released, because the service agreement was not signed and paid in time. Nothing is cancelled and you have not been charged — your pro is still on the job. Sign the agreement and pay, and pick a new time together.',
        r.id);
      perform public._notify(
        r.contractor_id, 'visit_slot_released',
        'Visit slot released — not signed and paid in time',
        'The ' || coalesce(r.service_needed, 'job') || ' visit booked for ' || v_when || ' has been released, so you can use that time for other work. The job is still yours — send the agreement, and propose a new time once the client has signed and paid.',
        r.id);
    exception when others then null;
    end;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

revoke all on function public.release_unconfirmed_visits() from public, anon, authenticated;

-- cron.schedule() raises if the job name already exists, so drop it first.
-- (The live database was set up with the bare schedule() call; this guard only
--  matters if this file is ever replayed.)
select cron.unschedule('release-unconfirmed-visits')
 where exists (select 1 from cron.job where jobname = 'release-unconfirmed-visits');

select cron.schedule('release-unconfirmed-visits', '*/15 * * * *',
                     $$select public.release_unconfirmed_visits();$$);
