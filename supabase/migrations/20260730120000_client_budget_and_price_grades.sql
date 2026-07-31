-- Client budgets + category price benchmarks + A+/A/A- price grades.
--
-- Two grades, pointing in opposite directions on purpose:
--   * budget_grade      — shown to CONTRACTORS on a job. Higher budget = better grade.
--   * contractor grade  — shown to CLIENTS on a pro. Lower prices = better grade.
-- Both are graded against the same per-category benchmark.
--
-- Benchmark source: real completed jobs once a category has >= MIN_SAMPLES of
-- them, otherwise the curated service_pricing price book. The switch is
-- automatic, so this works on day one and gets more accurate as jobs land.

-- ---------------------------------------------------------------- 1. columns
alter table public.client_requests
  add column if not exists budget_min      numeric,
  add column if not exists budget_max      numeric,
  add column if not exists budget_flexible boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_requests_budget_sane') then
    alter table public.client_requests
      add constraint client_requests_budget_sane check (
        (budget_min is null or budget_min >= 0)
        and (budget_max is null or budget_max >= 0)
        and (budget_min is null or budget_max is null or budget_max >= budget_min)
      );
  end if;
end $$;

comment on column public.client_requests.budget_min is 'Client-set budget floor, visible to contractors browsing the job.';
comment on column public.client_requests.budget_max is 'Client-set budget ceiling, visible to contractors browsing the job.';
comment on column public.client_requests.budget_flexible is 'Client is open to quotes; hide the number and skip the grade.';

-- ------------------------------------------------- 2. per-category benchmark
-- One row per service in the price book, with the blended benchmark and a
-- flag saying where the number came from so the UI can be honest about it.
create or replace function public.get_service_price_stats()
returns table(
  service          text,
  base_price       numeric,
  typical_low      numeric,
  typical_high     numeric,
  unit             text,
  completed_count  integer,
  completed_avg    numeric,
  benchmark        numeric,
  benchmark_source text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    sp.service,
    sp.base_price,
    sp.typical_low,
    sp.typical_high,
    sp.unit,
    coalesce(rs.n, 0) as completed_count,
    round(rs.avg_amount, 2) as completed_avg,
    round(
      case
        when coalesce(rs.n, 0) >= 5 then rs.avg_amount
        else coalesce((sp.typical_low + sp.typical_high) / 2.0, sp.base_price)
      end, 2) as benchmark,
    case when coalesce(rs.n, 0) >= 5 then 'jobs' else 'pricebook' end as benchmark_source
  from public.service_pricing sp
  left join lateral (
    select count(*)::int as n, avg(j.amount) as avg_amount
    from public.jobs j
    join public.client_requests r on r.id = j.request_id
    where j.status = 'completed'
      and j.amount is not null
      and j.amount > 0
      and r.service_needed = sp.service
  ) rs on true
  order by sp.service;
$function$;

-- service_needed can hold several comma-joined services ("Plumbing Repair,
-- Electrical Work"). A job needing two trades costs roughly the sum of both,
-- so the benchmark sums across the tokens. Unknown tokens (e.g. "Other")
-- contribute nothing; if NO token is known the benchmark comes back null and
-- every caller degrades to "no benchmark" rather than guessing.
create or replace function public.service_benchmark(p_service text)
returns table(benchmark numeric, low_price numeric, high_price numeric, benchmark_source text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with tokens as (
    select trim(t) as service
    from unnest(string_to_array(coalesce(p_service, ''), ',')) as t
    where trim(t) <> ''
  ),
  hit as (
    select st.*
    from tokens tk
    join public.get_service_price_stats() st on st.service = tk.service
  )
  select
    nullif(sum(hit.benchmark), 0)                                  as benchmark,
    sum(coalesce(hit.typical_low, hit.base_price))                 as low_price,
    sum(coalesce(hit.typical_high, hit.base_price))                as high_price,
    case when bool_or(hit.benchmark_source = 'jobs') then 'jobs' else 'pricebook' end as benchmark_source
  from hit
  having count(*) > 0;
$function$;

-- ------------------------------------------------------------- 3. the grades
-- Budget grade, for contractors. A+ means the client is paying above market.
create or replace function public.budget_grade(p_budget_mid numeric, p_benchmark numeric)
returns text
language sql
immutable
as $function$
  select case
    when p_budget_mid is null or p_benchmark is null or p_benchmark <= 0 then null
    when p_budget_mid >= p_benchmark * 1.15 then 'A+'
    when p_budget_mid >= p_benchmark * 0.90 then 'A'
    else 'A-'
  end;
$function$;

-- Price grade, for clients looking at a pro. A+ means they come in under
-- market. Direction is deliberately inverted vs budget_grade — cheaper is
-- better for the person paying. This measures price only, NOT quality; the
-- separate star rating covers quality.
create or replace function public.contractor_price_grade(p_contractor uuid)
returns table(grade text, ratio numeric, sample_count integer, grade_source text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with priced as (
    -- Completed jobs are the truth. Fall back to bids so a new pro who has
    -- quoted but not yet finished work still gets a grade.
    select j.amount as amount, r.service_needed as service, 'jobs' as src
    from public.jobs j
    join public.client_requests r on r.id = j.request_id
    where j.contractor_id = p_contractor
      and j.status = 'completed'
      and j.amount is not null and j.amount > 0
    union all
    select b.amount, r.service_needed, 'bids'
    from public.bids b
    join public.client_requests r on r.id = b.request_id
    where b.contractor_id = p_contractor
      and b.amount is not null and b.amount > 0
      and not exists (
        select 1 from public.jobs j2
        where j2.contractor_id = p_contractor
          and j2.request_id = b.request_id
          and j2.status = 'completed'
      )
  ),
  best as (
    -- Prefer job-based samples; only use bids if there are no completed jobs.
    select * from priced
    where src = (select case when bool_or(src = 'jobs') then 'jobs' else 'bids' end from priced)
  ),
  ratios as (
    select best.amount / sb.benchmark as r
    from best
    cross join lateral public.service_benchmark(best.service) sb
    where sb.benchmark is not null and sb.benchmark > 0
  )
  select
    case
      when count(*) < 3 then null
      when avg(r) <= 0.90 then 'A+'
      when avg(r) <= 1.15 then 'A'
      else 'A-'
    end as grade,
    round(avg(r), 3) as ratio,
    count(*)::int as sample_count,
    (select case when bool_or(src = 'jobs') then 'jobs' else 'bids' end from priced) as grade_source
  from ratios;
$function$;

-- ------------------------------------------- 4. client-side budget edit RPC
create or replace function public.set_request_budget(
  p_request_id uuid,
  p_min        numeric default null,
  p_max        numeric default null,
  p_flexible   boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select user_id, status into v_owner, v_status
  from public.client_requests where id = p_request_id;

  if v_owner is null then raise exception 'Request not found'; end if;
  if v_owner is distinct from (select auth.uid()) and not public.is_admin() then
    raise exception 'You do not have permission to edit this request';
  end if;
  if v_status <> 'pending' then
    raise exception 'Budget can only be changed while the job is still open for bids';
  end if;

  if not coalesce(p_flexible, false) then
    if p_min is not null and p_min < 0 then raise exception 'Budget cannot be negative'; end if;
    if p_min is not null and p_max is not null and p_max < p_min then
      raise exception 'Budget maximum must be at least the minimum';
    end if;
  end if;

  update public.client_requests
     set budget_flexible = coalesce(p_flexible, false),
         budget_min      = case when coalesce(p_flexible, false) then null else p_min end,
         budget_max      = case when coalesce(p_flexible, false) then null else p_max end
   where id = p_request_id;
end;
$function$;

-- --------------------------------- 5. surface budget + grade to contractors
-- Same body as before, plus budget/benchmark/grade columns on the end.
drop function if exists public.list_open_jobs();
create or replace function public.list_open_jobs()
returns table(
  id uuid, service_needed text, location text, preferred_schedule text,
  job_description text, photo_path text, estimated_quote numeric, quote_notes text,
  created_at timestamp with time zone, vehicle_details jsonb, bid_count integer,
  my_amount numeric, my_message text, my_walkthrough boolean, is_preferred boolean,
  is_recurring boolean, recurring_frequency text,
  budget_min numeric, budget_max numeric, budget_flexible boolean,
  benchmark numeric, benchmark_low numeric, benchmark_high numeric,
  benchmark_source text, budget_grade text
)
language sql
security definer
set search_path to 'public'
as $function$
  with me as (
    select coalesce(specialties, '{}'::text[]) as specialties,
           coalesce(service_area, '{}'::text[]) as service_area,
           status
    from contractors where id = auth.uid()
  )
  select r.id, r.service_needed,
    public.mask_location(r.location) as location,
    r.preferred_schedule, r.job_description, r.photo_path, r.estimated_quote,
    r.quote_notes, r.created_at, r.vehicle_details,
    bc.bid_count,
    mb.amount as my_amount,
    mb.message as my_message,
    coalesce(mb.walkthrough_requested, false) as my_walkthrough,
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
    select b.amount, b.message, b.walkthrough_requested from bids b
    where b.request_id = r.id and b.contractor_id = auth.uid()
  ) mb on true
  left join public.service_specialty_map m on m.service = r.service_needed
  where r.status = 'pending'
    and me.status = 'active'
    and not exists (select 1 from hidden_jobs h where h.contractor_id = auth.uid() and h.request_id = r.id)
    and (
      r.preferred_contractor_id = auth.uid()
      or (
        (r.preferred_contractor_id is null or r.created_at < now() - interval '48 hours')
        and (m.service is null or me.specialties && m.specialties)
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
    r.created_at desc
  limit 50;
$function$;

-- ------------------------------- 6. surface contractor price grade to clients
drop function if exists public.get_contractor_directory();
create or replace function public.get_contractor_directory()
returns table(
  id uuid, first_name text, last_name text, specialties text[], service_area text[],
  years_of_experience integer, availability jsonb, photo_url text, rating numeric,
  total_jobs integer, rating_price numeric, rating_experience numeric,
  rating_result numeric, rating_count integer, google_reviews_url text,
  company_name text,
  price_grade text, price_ratio numeric, price_sample_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.first_name, p.last_name,
         c.specialties, c.service_area, c.years_of_experience,
         c.availability, c.photo_url, c.rating, c.total_jobs,
         c.rating_price, c.rating_experience, c.rating_result,
         c.rating_count, c.google_reviews_url, c.company_name,
         g.grade, g.ratio, g.sample_count
  from public.contractors c
  join public.profiles p on p.id = c.id
  left join lateral public.contractor_price_grade(c.id) g on true
  where c.status = 'active';
$function$;

-- ------------------------------------------------------------- 7. grants
grant execute on function public.get_service_price_stats()            to anon, authenticated;
grant execute on function public.service_benchmark(text)              to anon, authenticated;
grant execute on function public.budget_grade(numeric, numeric)       to anon, authenticated;
grant execute on function public.contractor_price_grade(uuid)         to anon, authenticated;
grant execute on function public.set_request_budget(uuid, numeric, numeric, boolean) to authenticated;
grant execute on function public.list_open_jobs()                     to authenticated;
grant execute on function public.get_contractor_directory()           to anon, authenticated;


-- ---------------------------------------------------------------------------
-- handle_new_user(): carry the budget through signup.
--
-- ClientOnboarding has no session when it submits, so the first request row is
-- created by this trigger from the signup metadata rather than by an insert
-- from the app. Without these three columns the very first job a client posts
-- would silently lose its budget. "flexible" wins over any typed numbers, the
-- same precedence the form and set_request_budget() use.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := coalesce(nullif(meta->>'role',''), 'client');
  v_dates date[];
  v_flexible boolean := coalesce((meta->>'budget_flexible')::boolean, false);
begin
  insert into public.profiles (id, email, first_name, last_name, phone, role)
  values (
    new.id,
    new.email,
    nullif(meta->>'first_name',''),
    nullif(meta->>'last_name',''),
    nullif(meta->>'phone',''),
    v_role
  )
  on conflict (id) do nothing;

  if v_role = 'contractor' and (meta ? 'specialties') then
    insert into public.contractors (
      id, company_name, specialties, years_of_experience, service_area,
      availability, work_type, licensed, license_number, has_liability_insurance,
      insurance_provider, insurance_expiry, has_wcb, operates_alone, work_references, status
    )
    values (
      new.id,
      nullif(meta->>'company_name',''),
      coalesce((select array_agg(value) from jsonb_array_elements_text(meta->'specialties') as value), '{}')::text[],
      nullif(meta->>'years_of_experience','')::int,
      coalesce((select array_agg(value) from jsonb_array_elements_text(meta->'service_area') as value), '{}')::text[],
      coalesce(meta->'availability', '{}'::jsonb),
      nullif(meta->>'work_type',''),
      coalesce((meta->>'licensed')::boolean, false),
      nullif(meta->>'license_number',''),
      coalesce((meta->>'has_liability_insurance')::boolean, false),
      nullif(meta->>'insurance_provider',''),
      nullif(meta->>'insurance_expiry',''),
      coalesce((meta->>'has_wcb')::boolean, false),
      coalesce((meta->>'operates_alone')::boolean, false),
      nullif(meta->>'work_references',''),
      'pending'
    )
    on conflict (id) do nothing;
  end if;

  if v_role = 'client' and coalesce(meta->>'job_description','') <> '' then
    begin
      if jsonb_typeof(meta->'recurring_dates') = 'array' then
        select array_agg((value)::date) into v_dates
        from jsonb_array_elements_text(meta->'recurring_dates') as value
        where nullif(value,'') is not null;
      end if;
    exception when others then v_dates := null;
    end;

    insert into public.client_requests (
      user_id, first_name, last_name, email, phone, service_needed,
      preferred_schedule, location, job_description, status, client_type,
      business_name, business_type, locations, recurring, recurring_frequency,
      recurring_start_date, recurring_end_date, billing_preference,
      recurring_interval_km, recurring_prepay_pref, recurring_dates,
      budget_min, budget_max, budget_flexible
    )
    values (
      new.id,
      nullif(meta->>'first_name',''),
      nullif(meta->>'last_name',''),
      new.email,
      nullif(meta->>'phone',''),
      nullif(meta->>'service_needed',''),
      nullif(meta->>'preferred_schedule',''),
      nullif(meta->>'location',''),
      nullif(meta->>'job_description',''),
      'pending',
      coalesce(nullif(meta->>'client_type',''),'individual'),
      nullif(meta->>'business_name',''),
      nullif(meta->>'business_type',''),
      nullif(meta->>'locations',''),
      coalesce((meta->>'recurring')::boolean, false),
      nullif(meta->>'recurring_frequency',''),
      nullif(meta->>'recurring_start_date','')::date,
      nullif(meta->>'recurring_end_date','')::date,
      nullif(meta->>'billing_preference',''),
      nullif(meta->>'recurring_interval_km','')::int,
      coalesce(nullif(meta->>'recurring_prepay_pref','')::int, 0),
      v_dates,
      case when v_flexible then null else nullif(meta->>'budget_min','')::numeric end,
      case when v_flexible then null else nullif(meta->>'budget_max','')::numeric end,
      v_flexible
    );
  end if;

  return new;
exception when others then
  return new;
end;
$function$;
