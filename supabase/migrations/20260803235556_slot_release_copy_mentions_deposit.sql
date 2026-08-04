-- Jobs are now booked with a deposit, not the full price. The slot-release
-- notice still said "signed and paid in time", which reads as though the whole
-- job price was owed up front -- the exact objection the deposit exists to
-- answer. Only the two message strings change; the predicate is unchanged and
-- already correct (a paid deposit moves payment_status to 'held', which the
-- WHERE clause excludes, so the slot is protected the moment the deposit lands).
CREATE OR REPLACE FUNCTION public.release_unconfirmed_visits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        'The visit booked for ' || v_when || ' has been released, because the service agreement was not signed and the deposit not paid in time. Nothing is cancelled and you have not been charged -- your pro is still on the job. Sign the agreement and pay the deposit, and pick a new time together.',
        r.id);
      perform public._notify(
        r.contractor_id, 'visit_slot_released',
        'Visit slot released -- no signed agreement or deposit in time',
        'The ' || coalesce(r.service_needed, 'job') || ' visit booked for ' || v_when || ' has been released, so you can use that time for other work. The job is still yours -- send the agreement, and propose a new time once the client has signed and paid their deposit.',
        r.id);
    exception when others then null;
    end;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;
