-- How many active, emailable, specialty-matched pros a service label reaches.
-- Same join the three matchers use, so this number is the real one.
create or replace function public.trade_reach(p_service text)
returns int
language sql stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select count(*)::int
  from public.contractors c
  join public.profiles p on p.id = c.id
  left join public.service_specialty_map m on m.service = p_service
  where c.status = 'active'
    and p.email is not null
    and (m.specialties is null or c.specialties && m.specialties);
$$;

-- Below this many matched pros, a posted job does not get a real market of
-- estimates and the trade is a recruiting target.
create or replace function public.outreach_gap_threshold()
returns int language sql immutable set search_path = public, pg_temp
as $$ select 6 $$;

-- Owner-facing recruiting report: which trades are thin, and how much cold
-- outreach material we actually hold for each.
create or replace function public.admin_outreach_gaps()
returns table (
  service          text,
  reach            int,
  is_gap           boolean,
  open_requests    int,
  outreach_new     int,
  outreach_pending int,
  outreach_sent    int
)
language plpgsql stable
security definer
set search_path = public, extensions, pg_temp
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
           where r.service_needed = m.service and r.status = 'pending'),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'new' and not o.unsubscribed),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'pending'),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'sent')
  from public.service_specialty_map m
  order by reach asc, m.service;
end $$;

-- Bulk import. Lands rows at status 'new' -- imported, NOT queued -- so a
-- paste can never send anything on its own. Existing rows are never touched:
-- an address we have already emailed, or that has unsubscribed, must not be
-- resurrected by a re-import.
create or replace function public.admin_import_outreach(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_before int; v_after int;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  select count(*) into v_before from public.contractor_outreach;

  insert into public.contractor_outreach (company_name, contact_name, email, trade, source, city, status)
  select nullif(trim(x->>'company_name'), ''),
         nullif(trim(x->>'contact_name'), ''),
         lower(trim(x->>'email')),
         nullif(trim(x->>'trade'), ''),
         coalesce(nullif(trim(x->>'source'), ''), 'manual_import'),
         coalesce(nullif(trim(x->>'city'), ''), 'Calgary'),
         'new'
  from jsonb_array_elements(p_rows) as x
  where coalesce(trim(x->>'email'), '') <> ''
    and coalesce(trim(x->>'company_name'), '') <> ''
    and trim(x->>'email') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  on conflict (lower(email)) do nothing;

  select count(*) into v_after from public.contractor_outreach;

  return jsonb_build_object(
    'imported', v_after - v_before,
    'skipped_duplicate_or_invalid',
      jsonb_array_length(p_rows) - (v_after - v_before)
  );
end $$;

-- Move imported rows into the send queue. This does NOT send; the
-- contractor-outreach function still needs an admin JWT and confirm:"SEND".
create or replace function public.admin_queue_outreach(
  p_trade text,
  p_limit int default 25,
  p_request uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_n int;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  with pick as (
    select id from public.contractor_outreach
     where status = 'new'
       and not unsubscribed
       and (p_trade is null or trade = p_trade)
     order by created_at
     limit greatest(coalesce(p_limit, 25), 0)
     for update skip locked
  )
  update public.contractor_outreach o
     set status = 'pending', queued_at = now(), queued_for = p_request
    from pick
   where o.id = pick.id;

  get diagnostics v_n = row_count;
  return jsonb_build_object('queued', v_n, 'trade', p_trade);
end $$;

revoke all on function public.trade_reach(text) from public, anon;
revoke all on function public.outreach_gap_threshold() from public, anon;
grant execute on function public.admin_outreach_gaps() to authenticated;
grant execute on function public.admin_import_outreach(jsonb) to authenticated;
grant execute on function public.admin_queue_outreach(text, int, uuid) to authenticated;
