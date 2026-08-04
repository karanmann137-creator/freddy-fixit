-- escalate_stale_unbid_requests() was matching contractors with
--   req.service_needed ILIKE '%' || specialty || '%'
-- which is a fourth, private matcher that disagrees with the other three.
-- 'Plumbing Repair' ILIKE '%Plumbing%' happens to be true, so the bug hid; but
-- 'General Handyman' ILIKE '%General Repairs%' is FALSE, and General Handyman is
-- where the volume is. The consequence was not just a missed bell: n_match fed
-- the admin alert, so the owner was told "no active contractor matches this
-- trade" about a job that fourteen active pros match.
--
-- service_specialty_map is the single source of truth. Use it here too, with the
-- same passthrough rule (no row = match everyone) so a new service label can
-- never make a job invisible.
create or replace function public.escalate_stale_unbid_requests(p_hours int default 24)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  req      record;
  adm      record;
  ctr      record;
  required text[];
  n_match  int;
  n_done   int := 0;
begin
  for req in
    select cr.*
    from client_requests cr
    where cr.status = 'pending'
      and cr.no_bid_escalated_at is null
      and cr.created_at < now() - make_interval(hours => p_hours)
      and not exists (select 1 from bids b where b.request_id = cr.id)
      and not exists (select 1 from jobs j where j.request_id = cr.id)
  loop
    select m.specialties into required
    from service_specialty_map m where m.service = req.service_needed;

    select count(*) into n_match
    from contractors c
    where c.status = 'active'
      and (required is null or c.specialties && required);

    -- (a) alert every admin
    for adm in select id from profiles where role = 'admin' loop
      perform public._notify(
        adm.id,
        'no_quotes_alert',
        '⚠️ Job still has no quotes',
        coalesce(req.service_needed,'A request')
          || coalesce(' in '||req.location,'')
          || ' has had no bids for '||p_hours||'h. '
          || case when n_match = 0
                  then 'No active contractor matches this trade — source one or quote it directly.'
                  else n_match||' matching contractor(s) were re-notified. Consider assigning or quoting it yourself.'
             end,
        null
      );
    end loop;

    -- (b) re-ping matching contractors (if any)
    if n_match > 0 then
      for ctr in
        select c.id from contractors c
        where c.status = 'active'
          and (required is null or c.specialties && required)
      loop
        perform public._notify(
          ctr.id,
          'job_still_open',
          'Job still open in your field',
          coalesce(req.service_needed,'A job')
            || coalesce(' in '||req.location,'')
            || ' is still waiting for a quote — place a bid before it fills up.',
          null
        );
      end loop;
    end if;

    update client_requests set no_bid_escalated_at = now() where id = req.id;
    n_done := n_done + 1;
  end loop;

  return n_done;
end $$;

revoke all on function public.escalate_stale_unbid_requests(int) from public, anon, authenticated;
grant execute on function public.escalate_stale_unbid_requests(int) to postgres, service_role;
