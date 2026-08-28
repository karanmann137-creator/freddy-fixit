-- When a job is posted in a trade we are thin in, stage a cold-outreach
-- batch for that trade and tell the owner it is waiting.
--
-- Three rules this encodes, all deliberate:
--
--  1. It QUEUES, it never sends. Sending is still contractor-outreach with an
--     admin JWT and confirm:"SEND". "Don't send bulk email without asking the
--     owner" is a standing rule, and an automatic per-job blast on the shared
--     freddyfixit.ca domain would put the DKIM reputation that also carries
--     payment receipts and dispatch mail at risk.
--  2. The client's job NEVER leaves the platform. queued_for records which
--     request prompted the batch for auditing; the recruitment email is about
--     the trade, not the job. Describing a live request to non-members would
--     leak a client's address and problem to strangers.
--  3. It cannot break a job posting. The whole body is inside an exception
--     block -- a recruiting nicety is never worth a client's request.

create or replace function public.auto_queue_outreach_for_request()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_reach int;
  v_res   jsonb;
  v_n     int;
  a       record;
begin
  begin
    if new.status is distinct from 'pending' or coalesce(new.waitlisted, false) then
      return new;
    end if;

    v_reach := public.trade_reach(new.service_needed);
    if v_reach >= public.outreach_gap_threshold() then
      return new;
    end if;

    with pick as (
      select id from public.contractor_outreach
       where status = 'new'
         and not unsubscribed
         and trade = new.service_needed
       order by created_at
       limit 25
       for update skip locked
    )
    update public.contractor_outreach o
       set status = 'pending', queued_at = now(), queued_for = new.id
      from pick
     where o.id = pick.id;

    get diagnostics v_n = row_count;

    for a in select id from public.profiles where role = 'admin' loop
      perform public._notify(
        a.id,
        'outreach_gap',
        'Thin trade: ' || new.service_needed,
        case when v_n > 0
          then v_n || ' cold-outreach companies are queued and waiting for you to send. '
               || 'Only ' || v_reach || ' active pros match this job.'
          else 'Only ' || v_reach || ' active pros match this job and we hold no '
               || 'outreach contacts for this trade yet.'
        end,
        null
      );
    end loop;
  exception when others then
    raise warning 'auto_queue_outreach_for_request skipped for %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

drop trigger if exists client_requests_outreach_gap on public.client_requests;
create trigger client_requests_outreach_gap
  after insert on public.client_requests
  for each row execute function public.auto_queue_outreach_for_request();

revoke all on function public.auto_queue_outreach_for_request() from public, anon, authenticated;
