-- Multi-label dispatch: one answer to "which specialties does this
-- service_needed value reach?"
--
-- THE BUG. The post-a-job form multi-selects services and stores them joined:
-- `service_needed = selectedServices.join(", ")` (NewRequest.tsx,
-- ClientOnboarding.tsx). Every matcher then looked that whole joined string up
-- with an EXACT match on service_specialty_map.service — a table keyed by one
-- label per row. So "General Handyman, Other" matched no row, `required` came
-- back NULL, and NULL falls into the documented and deliberate "unmapped label
-- passes through to everyone" branch. Verified live before this migration:
--   {"service_needed":"General Handyman, Other","mapped":null,
--    "reach":25,"all_active":25}
-- Twenty-five of twenty-five active contractors, i.e. every multi-select
-- request on the platform has been emailed to the entire roster since
-- multi-select shipped. Nothing was thrown and no empty state showed, because
-- reaching TOO MANY pros looks exactly like a healthy dispatch from the admin
-- side and like spam from the contractor side.
--
-- Seven SQL sites and one edge function read the map this way. Six are fixed
-- here, `dispatch-job` is redeployed alongside, and admin_outreach_gaps was
-- never wrong about matching (it iterates the map, so it only ever passes
-- single labels) but did undercount open requests for the same reason.
--
-- WHY A FUNCTION AND NOT A WIDER TABLE. service_specialty_map stays the single
-- source of truth for all the matchers — that is the property worth keeping,
-- because changing the DATA keeps them in lockstep with zero code changes.
-- Adding comma-joined composite rows to the table would multiply out
-- combinatorially (36 services) and break that property instead. So the table
-- keeps holding one label per row and this function does the decomposition,
-- once, for every reader.
--
-- WHY ONE UNKNOWN LABEL STILL MEANS EVERYONE. "Other" is a real option in the
-- picker and genuinely means "we don't know the trade". Returning the union of
-- just the labels we DO recognise would narrow the audience on the strength of
-- a label that was explicitly a shrug, so a request for
-- "Plumbing Repair, Other" would stop reaching the pro the "Other" half was
-- about. Any unmapped label therefore returns NULL and reaches everyone, which
-- is exactly today's behaviour. The change is strictly conservative: it can
-- only ever reach FEWER pros than today when every label is known, and never
-- fewer than the narrowest single label in the list.

-- ---------------------------------------------------------------------------
-- The one decomposition
-- ---------------------------------------------------------------------------

create or replace function public.service_specialties(p_service text)
returns text[]
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_label  text;
  v_labels text[];
  v_spec   text[];
  v_out    text[] := '{}'::text[];
begin
  select array_agg(distinct btrim(l))
    into v_labels
    from unnest(string_to_array(coalesce(p_service, ''), ',')) l
   where btrim(l) <> '';

  -- No labels at all (null, blank, or ", ,") reaches everyone, same as an
  -- unmapped one.
  if v_labels is null or array_length(v_labels, 1) is null then
    return null;
  end if;

  foreach v_label in array v_labels loop
    v_spec := null;   -- SELECT INTO sets NULL on zero rows, but say it anyway
    select m.specialties into v_spec
      from public.service_specialty_map m
     where m.service = v_label;
    if v_spec is null then
      return null;    -- one unknown label ⇒ reach everyone
    end if;
    v_out := v_out || v_spec;
  end loop;

  select array_agg(distinct s order by s) into v_out from unnest(v_out) s;
  -- array_agg over an empty input returns NULL, and NULL here would mean
  -- "everyone" — the opposite of what a map row holding '{}' says. Coalesce so
  -- an empty mapping keeps meaning "nobody", unchanged.
  return coalesce(v_out, '{}'::text[]);
end;
$$;

comment on function public.service_specialties(text) is
  'Specialties reached by a service_needed value, which may be several labels joined with ", ". NULL means reach everyone (some label is unmapped, or there are no labels). The ONE answer — do not look service_specialty_map up directly from a request row.';

-- Execute is left at the default PUBLIC grant deliberately: this reveals
-- nothing that service_specialty_map does not already expose through its own
-- `service_specialty_map_read` policy, which is granted to public.

-- ---------------------------------------------------------------------------
-- The six readers
-- ---------------------------------------------------------------------------

-- 1/6 — the new-request fan-out. This is the one that actually emailed the
-- whole roster.
create or replace function public.notify_contractors_new_request()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  r record;
  req_spec text[];
begin
  if new.status <> 'pending' then return new; end if;
  if new.waitlisted then return new; end if;
  if new.preferred_contractor_id is not null then return new; end if;

  req_spec := public.service_specialties(new.service_needed);

  for r in
    select c.id from public.contractors c
    where c.status = 'active'
      and (req_spec is null or c.specialties && req_spec)
  loop
    perform public._notify(
      r.id, 'job_in_field', 'New job in your field',
      coalesce(new.service_needed,'A new job')
        || ' in ' || public.mask_location(new.location)
        || ' — place a bid before it fills up.',
      null);
  end loop;
  return new;
end;
$$;

-- 2/6 — trade_reach(). Fixing it here also fixes agent_lead_response_run's
-- `unreachable_trade` finding, which passes r.service_needed straight in.
create or replace function public.trade_reach(p_service text)
returns integer
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select count(*)::int
  from public.contractors c
  join public.profiles p on p.id = c.id
  cross join lateral (select public.service_specialties(p_service) as required) m
  where c.status = 'active'
    and p.email is not null
    and (m.required is null or c.specialties && m.required);
$$;

-- 3/6 — the contractor job board.
create or replace function public.list_open_jobs()
returns table(id uuid, service_needed text, location text, preferred_schedule text, job_description text, photo_path text, estimated_quote numeric, quote_notes text, created_at timestamp with time zone, vehicle_details jsonb, bid_count integer, my_amount numeric, my_message text, my_walkthrough boolean, my_price_low numeric, my_price_high numeric, is_preferred boolean, is_recurring boolean, recurring_frequency text, budget_min numeric, budget_max numeric, budget_flexible boolean, benchmark numeric, benchmark_low numeric, benchmark_high numeric, benchmark_source text, budget_grade text)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with me as (
    select coalesce(specialties, '{}'::text[]) as specialties,
           coalesce(service_area, '{}'::text[]) as service_area,
           status
    from contractors where id = auth.uid()
  )
  select r.id, r.service_needed,
    public.mask_location(r.location) as location,
    r.preferred_schedule,
    public.scrub_address_text(r.job_description) as job_description,
    r.photo_path, r.estimated_quote,
    r.quote_notes,
    coalesce(r.reposted_at, r.created_at) as created_at,
    r.vehicle_details,
    bc.bid_count,
    mb.amount as my_amount,
    mb.message as my_message,
    coalesce(mb.walkthrough_requested, false) as my_walkthrough,
    mb.price_low as my_price_low,
    mb.price_high as my_price_high,
    coalesce(r.preferred_contractor_id = auth.uid(), false) as is_preferred,
    coalesce(r.recurring, false) as is_recurring,
    r.recurring_frequency,
    case when r.budget_flexible then null else r.budget_min end as budget_min,
    case when r.budget_flexible then null else r.budget_max end as budget_max,
    coalesce(r.budget_flexible, false) as budget_flexible,
    sb.benchmark, sb.low_price as benchmark_low, sb.high_price as benchmark_high,
    sb.benchmark_source,
    case when coalesce(r.budget_flexible, false) then null
         else public.budget_grade(
                (coalesce(r.budget_min, r.budget_max) + coalesce(r.budget_max, r.budget_min)) / 2.0,
                sb.benchmark)
    end as budget_grade
  from client_requests r
  cross join me
  left join lateral public.service_benchmark(r.service_needed) sb on true
  left join lateral (
    select
      (regexp_match(r.location, '(?i)\m(NW|NE|SW|SE)\M'))[1] as q,
      (regexp_match(r.location, '(?i)(Airdrie|Cochrane|Chestermere|Okotoks|Strathmore)'))[1] as town,
      (r.location ~* '(downtown|beltline)') as is_downtown
  ) loc on true
  left join lateral (
    select count(distinct b.contractor_id)::int as bid_count
    from bids b where b.request_id = r.id and b.status <> 'declined'
  ) bc on true
  left join lateral (
    select b.amount, b.message, b.walkthrough_requested, b.price_low, b.price_high from bids b
    where b.request_id = r.id and b.contractor_id = auth.uid()
  ) mb on true
  left join lateral (select public.service_specialties(r.service_needed) as required) m on true
  where r.status = 'pending'
    and r.waitlisted is not true
    and me.status = 'active'
    and not exists (select 1 from hidden_jobs h where h.contractor_id = auth.uid() and h.request_id = r.id)
    and (
      -- Fresh (or freshly reposted). A repost restarts this clock without
      -- touching created_at, so the raw data is never rewritten.
      coalesce(r.reposted_at, r.created_at) > now() - interval '14 days'
      -- ... or somebody bid in the last week. `bids` has no updated_at, so
      -- created_at IS the recency signal.
      or exists (select 1 from bids b2
                  where b2.request_id = r.id
                    and b2.status <> 'declined'
                    and b2.created_at > now() - interval '7 days')
      -- ... or client and pro are still talking details.
      or exists (select 1 from messages mg
                  where mg.request_id = r.id
                    and mg.blocked is not true
                    and mg.created_at > now() - interval '7 days')
    )
    and (
      r.preferred_contractor_id = auth.uid()
      or (
        (r.preferred_contractor_id is null or r.created_at < now() - interval '48 hours')
        and (m.required is null or me.specialties && m.required)
      )
    )
  order by
    coalesce(r.preferred_contractor_id = auth.uid(), false) desc,
    exists (
      select 1 from unnest(me.service_area) sa
      where (loc.q is not null and sa ilike '%'||loc.q||'%')
         or (loc.is_downtown and sa ~* '(downtown|beltline)')
         or (loc.town is not null and sa ilike '%'||loc.town||'%')
    ) desc,
    bc.bid_count asc,
    coalesce(r.reposted_at, r.created_at) desc
  limit 50;
$$;

-- 4/6 — the admin's "who matches this request?" ranking. Its reqmap CTE is
-- replaced by the shared function, which collapses the
-- `not exists (select 1 from reqmap)` passthrough into a plain NULL test.
-- search_path also gains `extensions`, which it was missing.
create or replace function public.admin_rank_contractors(p_request_id uuid)
returns table(id uuid, first_name text, last_name text, specialties text[], rating numeric, total_jobs integer, is_match boolean, in_zone boolean)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_service  text;
  v_loc      text;
  v_required text[];
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select service_needed, location into v_service, v_loc
    from client_requests where id = p_request_id;

  v_required := public.service_specialties(v_service);

  return query
  with req as (
    select
      lower(coalesce(v_loc,'')) as loc,
      (regexp_match(lower(coalesce(v_loc,'')), '\m(nw|ne|sw|se)\M'))[1] as q,
      (lower(coalesce(v_loc,'')) ~ '(downtown|beltline)') as is_downtown,
      (regexp_match(lower(coalesce(v_loc,'')), '\m(airdrie|cochrane|chestermere|okotoks|strathmore)\M'))[1] as town
  )
  select
    p.id, p.first_name, p.last_name,
    c.specialties, c.rating, c.total_jobs,
    (v_required is null or c.specialties && v_required) as is_match,
    -- in_zone: contractor's service_area covers the request's quadrant/downtown/town
    exists (
      select 1 from unnest(coalesce(c.service_area, '{}'::text[])) sa, req
      where (req.q is not null and sa ilike '%'||req.q||'%')
         or (req.is_downtown and sa ~* '(downtown|beltline)')
         or (req.town is not null and sa ilike '%'||req.town||'%')
    ) as in_zone
  from contractors c
  join profiles p on p.id = c.id
  where c.status = 'active'
  order by
    (v_required is null or c.specialties && v_required) desc,
    exists (
      select 1 from unnest(coalesce(c.service_area, '{}'::text[])) sa, req
      where (req.q is not null and sa ilike '%'||req.q||'%')
         or (req.is_downtown and sa ~* '(downtown|beltline)')
         or (req.town is not null and sa ilike '%'||req.town||'%')
    ) desc,
    coalesce(c.rating, 0) desc,
    coalesce(c.total_jobs, 0) desc,
    p.first_name asc;
end;
$$;

-- 5/6 — the 24h no-bid escalation. Both the admin alert's match count and the
-- contractor re-notify loop read the same `required`, so one fix covers both.
create or replace function public.escalate_stale_unbid_requests(p_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
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
      and cr.waitlisted is not true
      and cr.no_bid_escalated_at is null
      and cr.created_at < now() - make_interval(hours => p_hours)
      and not exists (select 1 from bids b where b.request_id = cr.id)
      and not exists (select 1 from jobs j where j.request_id = cr.id)
  loop
    required := public.service_specialties(req.service_needed);

    select count(*) into n_match
    from contractors c
    where c.status = 'active'
      and (required is null or c.specialties && required);

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
            || coalesce(' in '||public.mask_location(req.location),'')
            || ' is still waiting for a quote — place a bid before it fills up.',
          null
        );
      end loop;
    end if;

    update client_requests set no_bid_escalated_at = now() where id = req.id;
    n_done := n_done + 1;
  end loop;

  return n_done;
end;
$$;

-- 6/6 — the manual re-fire. Only the reach COUNT it returns was wrong (the
-- fan-out itself is dispatch-job's, redeployed alongside this migration), but
-- that count is what the admin reads to decide whether re-firing is worth it.
create or replace function public.refire_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_req      record;
  v_required text[];
  v_bidders  uuid[];
  v_reach    int;
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/dispatch-job';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4';
begin
  select * into v_req from public.client_requests where id = p_request_id;
  if not found then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    return 0;
  end if;
  if v_req.waitlisted then
    return 0;
  end if;

  select array_agg(distinct b.contractor_id) into v_bidders
  from public.bids b where b.request_id = p_request_id;
  v_bidders := coalesce(v_bidders, '{}'::uuid[]);

  v_required := public.service_specialties(v_req.service_needed);

  if v_req.preferred_contractor_id is not null
     and v_req.created_at > now() - interval '48 hours' then
    v_reach := (select count(*) from public.contractors c
                 where c.id = v_req.preferred_contractor_id
                   and c.status = 'active'
                   and not (c.id = any(v_bidders)));
  else
    select count(*) into v_reach
    from public.contractors c
    join public.profiles p on p.id = c.id
    where c.status = 'active'
      and p.email is not null
      and not (c.id = any(v_bidders))
      and (v_required is null or c.specialties && v_required)
      and not exists (select 1 from public.hidden_jobs h
                       where h.request_id = p_request_id and h.contractor_id = c.id);
  end if;

  update public.client_requests
     set dispatched_to  = v_bidders,
         refire_count   = refire_count + 1,
         refire_last_at = now()
   where id = p_request_id;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('request_id', p_request_id),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'dispatch-job re-fire failed for %: %', p_request_id, sqlerrm;
  end;

  return coalesce(v_reach, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_outreach_gaps: matching was never wrong here (it iterates the map, so
-- it only ever passes single labels to trade_reach), but `open_requests` was
-- counted with `r.service_needed = m.service`, which misses every multi-select
-- request — the exact rows most likely to be sitting in a gap. A request now
-- counts under each of its labels.
-- ---------------------------------------------------------------------------

create or replace function public.admin_outreach_gaps()
returns table(service text, reach integer, is_gap boolean, open_requests integer, outreach_new integer, outreach_pending integer, outreach_sent integer)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  return query
  select m.service,
         public.trade_reach(m.service) as reach,
         public.trade_reach(m.service) < public.outreach_gap_threshold() as is_gap,
         (select count(*)::int from public.client_requests r
           where r.status = 'pending'
             and m.service = any (
               select btrim(l)
               from unnest(string_to_array(coalesce(r.service_needed,''), ',')) l
             )),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'new' and not o.unsubscribed),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'pending'),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'sent')
  from public.service_specialty_map m
  order by reach asc, m.service;
end $$;
