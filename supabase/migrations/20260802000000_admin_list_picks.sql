-- Admin "Picks" feed: which contractor a client ended up with, newest first.
--
-- Built on `jobs`, not `bids`, on purpose. A job row exists for EVERY match —
-- client picked a bid (accept_bid), client rehired a favourite pro, or an admin
-- assigned directly (assign_job) — whereas an accepted bid only exists for the
-- first of those. `jobs.created_at` is the moment the pick happened; `bids` has
-- no updated_at, so it can't tell us when a bid flipped to accepted.
--
-- `how` is derived, not stored:
--   client_pick  — a bid on this request is 'accepted'
--   rehire       — the request reserved this exact pro (preferred_contractor_id)
--   admin_assign — neither of the above
--
-- Read-only and admin-gated. SECURITY DEFINER so it can cross profiles +
-- contractors + bids in one pass, with public.is_admin() as the gate.

create or replace function public.admin_list_picks(p_limit int default 100)
returns table (
  job_id          uuid,
  request_id      uuid,
  picked_at       timestamptz,
  service         text,
  location        text,
  job_status      text,
  amount          numeric,
  client_id       uuid,
  client_name     text,
  contractor_id   uuid,
  contractor_name text,
  company_name    text,
  winning_amount  numeric,
  bid_count       int,
  how             text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    j.id,
    j.request_id,
    j.created_at,
    r.service_needed,
    r.location,
    j.status,
    j.amount,
    j.client_id,
    nullif(trim(coalesce(cp.first_name, '') || ' ' || coalesce(cp.last_name, '')), ''),
    j.contractor_id,
    nullif(trim(coalesce(kp.first_name, '') || ' ' || coalesce(kp.last_name, '')), ''),
    c.company_name,
    ab.amount,
    coalesce(bc.n, 0)::int,
    case
      when ab.id is not null                              then 'client_pick'
      when r.preferred_contractor_id = j.contractor_id    then 'rehire'
      else 'admin_assign'
    end
  from public.jobs j
  join public.client_requests r on r.id = j.request_id
  left join public.profiles    cp on cp.id = j.client_id
  left join public.profiles    kp on kp.id = j.contractor_id
  left join public.contractors c  on c.id  = j.contractor_id
  -- The winning bid, if the match came from the bid flow at all.
  left join lateral (
    select b.id, b.amount
    from public.bids b
    where b.request_id = j.request_id and b.status = 'accepted'
    limit 1
  ) ab on true
  -- How many pros competed for it.
  left join lateral (
    select count(*) as n
    from public.bids b
    where b.request_id = j.request_id
  ) bc on true
  where public.is_admin()
  order by j.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.admin_list_picks(int) from public, anon;
grant execute on function public.admin_list_picks(int) to authenticated;
