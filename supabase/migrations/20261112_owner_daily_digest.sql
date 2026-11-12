-- Owner daily digest (2026-11-12).
--
-- One short email a day to the owner covering both sides of the business:
-- customers who are stuck, trades with no contractor, and failing health
-- checks. It replaces the approval queue nobody was opening (lead-response had
-- 9 proposals pending and 0 approved) and the never-built contractor-supply and
-- ops-watchdog agents. Plain SQL: no model call, no edge function of its own.
--
-- Delivery reuses the existing path: _notify() inserts a notifications row and
-- the send-notification webhook emails it. Type 'owner_digest' has exactly one
-- emitter (this function) and is NOT 'health_alert', because
-- run_platform_health_check() dedupes on health_alert rows and must not be
-- muted by this.
--
-- Sends only when something needs the owner, plus every Monday regardless so
-- that silence on other days means "nothing to do" and not "it stopped running".

create or replace function public.owner_daily_digest(p_send boolean default true)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_need  int;
  v_body  text;
  v_title text;
  v_admin uuid;
  v_monday boolean := extract(isodow from (now() at time zone 'America/Edmonton')) = 1;
begin
  with base as (
    select r.id, r.service_needed, r.status, r.assigned_contractor_id, r.created_at,
           nullif(btrim(coalesce(r.first_name, '')), '') as fname,
           (select count(*) from public.jobs j where j.request_id = r.id) as job_ct,
           (select count(*) from public.bids b
             where b.request_id = r.id and b.status = 'pending') as pending_bids,
           (select max(b.created_at) from public.bids b
             where b.request_id = r.id and b.status = 'pending') as newest_bid,
           public.trade_reach(r.service_needed) as reach
      from public.client_requests r
     where coalesce(r.waitlisted, false) = false
       and r.status not in ('completed', 'cancelled')
  ), items as (
    select 1 as ord, count(*) as n,
           format('CUSTOMERS — %s broken: a pro is assigned but there is no job, so the client sees nothing (%s). Repair it in the admin dashboard.',
                  case when count(*) = 1 then '1 request is' else count(*) || ' requests are' end,
                  left(string_agg(coalesce(service_needed, 'request'), ', '), 300)) as line
      from base where assigned_contractor_id is not null and job_ct = 0
    union all
    select 2, count(*),
           format('CUSTOMERS — %s not picked a pro. The oldest has waited since %s. Call or text them their pick link: %s.',
                  case when count(*) = 1 then '1 client has estimates and has'
                       else count(*) || ' clients have estimates and have' end,
                  public.ff_local_ts(min(newest_bid)),
                  left(string_agg(coalesce(fname, 'client') || ' (' || coalesce(service_needed, 'request') || ')',
                                  '; ' order by newest_bid desc), 600))
      from base
     where status = 'pending' and assigned_contractor_id is null
       and pending_bids > 0 and newest_bid < now() - interval '1 day'
    union all
    select 3, count(*),
           format('CUSTOMERS — %s no estimate after a day: %s. Assign a pro by hand or tell the client.',
                  case when count(*) = 1 then '1 request has' else count(*) || ' requests have' end,
                  left(string_agg(coalesce(service_needed, 'request'), ', '), 300))
      from base
     where status = 'pending' and assigned_contractor_id is null
       and pending_bids = 0 and reach > 0 and created_at < now() - interval '1 day'
    union all
    select 4, count(*),
           format('CONTRACTORS — nobody on the platform can do: %s. %s waiting on it. Recruit for this trade first.',
                  left(string_agg(distinct coalesce(service_needed, 'unknown'), ', '), 300),
                  case when count(*) = 1 then '1 open request is' else count(*) || ' open requests are' end)
      from base
     where status = 'pending' and assigned_contractor_id is null
       and pending_bids = 0 and reach = 0
    union all
    -- Informational only (n = 0): never makes the digest send on its own.
    select 5, 0,
           format('CONTRACTORS — %s signed up in the last 7 days.',
                  case when count(*) = 1 then '1 new pro' else count(*) || ' new pros' end)
      from public.contractors where created_at > now() - interval '7 days'
    having count(*) > 0
    union all
    select 6, count(*),
           format('SITE — %s failing: %s.',
                  case when count(*) = 1 then '1 health check is' else count(*) || ' health checks are' end,
                  string_agg(check_name, ', '))
      from public.platform_health_check() where not ok
  )
  select (select count(*) from items where n > 0),
         string_agg(line, E'\n' order by ord) filter (where n > 0 or ord = 5)
    into v_need, v_body
    from items;

  if coalesce(v_need, 0) = 0 and not v_monday then
    return 'nothing needs the owner today; not sent';
  end if;

  v_title := case when coalesce(v_need, 0) = 0 then 'Freddy today: nothing needs you'
                  when v_need = 1 then 'Freddy today: 1 thing needs you'
                  else 'Freddy today: ' || v_need || ' things need you' end;
  v_body := coalesce(v_body, 'No stuck customers, no uncovered trades, all health checks passing.');

  if p_send then
    for v_admin in select id from public.profiles where role = 'admin' loop
      if not exists (
        select 1 from public.notifications
         where user_id = v_admin and type = 'owner_digest'
           and created_at > now() - interval '20 hours'
      ) then
        perform public._notify(v_admin, 'owner_digest', v_title, v_body, null);
      end if;
    end loop;
  end if;

  return v_title || E'\n' || v_body;
exception when others then
  -- Never let the digest break cron; the health check is the backstop.
  raise warning 'owner_daily_digest failed: %', sqlerrm;
  return 'error: ' || sqlerrm;
end;
$function$;

-- Default grant is to PUBLIC, so revoking from anon alone would be a no-op.
revoke all on function public.owner_daily_digest(boolean) from public, anon, authenticated;
grant execute on function public.owner_daily_digest(boolean) to service_role;

-- 14:12 UTC = 7:12am (MST) / 8:12am (MDT) Calgary, after agent-lead-response
-- (14:00) and on a minute no other job uses.
select cron.schedule('owner-daily-digest', '12 14 * * *', 'select public.owner_daily_digest();');
