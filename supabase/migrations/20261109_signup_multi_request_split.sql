-- 2026-11-09 — handle_new_user(): let the FIRST-JOB signup post more than one request.
--
-- ALREADY APPLIED LIVE via Supabase MCP. This file is version control only.
--
-- WHY THIS LIVES IN THE TRIGGER AND NOT IN AN RPC OR THE BROWSER.
--
-- A request is dispatched ON INSERT. `client_requests` carries both
-- `trg_dispatch_new_request` and `trg_notify_contractors_new_request` as AFTER
-- INSERT triggers, so contractors are emailed the instant the row lands — and
-- `dispatched_to` is a PERMANENT "already told them" list, not a cooldown. So a
-- post-hoc "split this request in two" RPC cannot work: by the time the browser
-- has a session, the wrong trades have already been told about the combined job
-- and that cannot be un-told. The split has to be decided before the first
-- insert, which on the signup path means it has to travel in the signup
-- metadata and be acted on inside this trigger.
--
-- Inserting part 1 here and the rest from the browser afterwards was also
-- rejected: part 1 is dispatched immediately, so if the follow-up insert fails
-- (offline, tab closed, email-confirm path with no session) the client's second
-- job is silently gone with no record of it anywhere.
--
-- WHY IT IS SAFE TO PUT IT HERE AT ALL. This function IS the signup transaction
-- and it already carries a function-level `exception when others then return
-- new` — which is exactly how an unqualified `gen_random_bytes` once rolled back
-- the profiles insert and killed every signup for a month. So:
--
--   * The DEFAULT is byte-for-byte today's behaviour. `v_jobs` is seeded with
--     the single row this function has always written, built from the same three
--     metadata keys. With no `split_jobs` in the metadata nothing changes.
--   * Guard (1) validates the suggestion BEFORE trusting it. Signup metadata is
--     user-controlled, so a bad `::numeric` cast would be an unauthenticated way
--     to break signup; `budget_min` is regex-checked rather than cast-and-hoped.
--     2–4 parts only, every part must name a service and carry words.
--   * Guard (2) wraps the insert in a subtransaction and, on ANY failure,
--     discards the split and retries as the single combined row. A plpgsql
--     exception block is a subtransaction, so a pass that inserted some rows
--     before raising is rolled back entirely — which is what makes the retry
--     duplicate-free.
--   * The insert is ONE statement over `jsonb_array_elements`, so N rows land
--     atomically. Same reason NewRequest.tsx uses a single multi-row `.insert`
--     rather than a loop.
--
-- Net: a broken split costs the client nothing. Worst case they get the one
-- combined request they would have got yesterday. The split is an enhancement
-- at the top of the funnel, so it fails OPEN.
--
-- Proven by rolled-back probe, five cases:
--   A  no `split_jobs`                 → 1 row, combined service, budget 150
--   B  valid 3-way split               → 3 rows, per-part service + budget
--   C  one part with blank service     → 1 combined row (guard 1 refused)
--   D  one part with "four hundred"    → 1 combined row (guard 1 refused)
--   E  5 parts (over the max of 4)     → 1 combined row (guard 1 refused)
-- `profiles` row created in all five.
--
-- `search_path` also moved from 'public' to 'public, extensions, pg_temp' per the
-- standing rule — this function reaches pgcrypto transitively through
-- `assign_referral_code()`.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := coalesce(nullif(meta->>'role',''), 'client');
  v_dates date[];
  v_flexible boolean := coalesce((meta->>'budget_flexible')::boolean, false);
  v_jobs jsonb;
  v_try int;
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

    -- The one row this function has always written.
    v_jobs := jsonb_build_array(jsonb_build_object(
      'service_needed',  meta->>'service_needed',
      'job_description', meta->>'job_description',
      'budget_min',      meta->>'budget_min'
    ));

    -- Guard (1): trust `split_jobs` only if every element is usable. Anything
    -- else keeps the single-row default -- a malformed suggestion must post the
    -- request, not refuse it.
    begin
      if jsonb_typeof(meta->'split_jobs') = 'array'
         and jsonb_array_length(meta->'split_jobs') between 2 and 4
         and not exists (
           select 1 from jsonb_array_elements(meta->'split_jobs') as e
           where coalesce(e->>'service_needed','') = ''
              or coalesce(e->>'job_description','') = ''
              or coalesce(e->>'budget_min','') !~ '^([0-9]+(\.[0-9]+)?)?$'
         )
      then
        v_jobs := meta->'split_jobs';
      end if;
    exception when others then
      null;  -- keep the default
    end;

    -- Guard (2): attempt the split, and on any failure fall back to the single
    -- combined row. Two passes, never more: pass 1 is whatever `v_jobs` holds,
    -- pass 2 is always the default. A plpgsql exception block is a
    -- subtransaction, so a pass that inserted some rows before raising is rolled
    -- back entirely -- which is what makes the retry safe from duplicates.
    for v_try in 1..2 loop
      begin
        insert into public.client_requests (
          user_id, first_name, last_name, email, phone, service_needed,
          preferred_schedule, location, job_description, status, client_type,
          business_name, business_type, locations, recurring, recurring_frequency,
          recurring_start_date, recurring_end_date, billing_preference,
          recurring_interval_km, recurring_prepay_pref, recurring_dates,
          budget_min, budget_max, budget_flexible
        )
        select
          new.id,
          nullif(meta->>'first_name',''),
          nullif(meta->>'last_name',''),
          new.email,
          nullif(meta->>'phone',''),
          nullif(j->>'service_needed',''),
          nullif(meta->>'preferred_schedule',''),
          nullif(meta->>'location',''),
          nullif(j->>'job_description',''),
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
          case when v_flexible then null else nullif(j->>'budget_min','')::numeric end,
          case when v_flexible then null else nullif(meta->>'budget_max','')::numeric end,
          v_flexible
        from jsonb_array_elements(v_jobs) as j;
        exit;
      exception when others then
        v_jobs := jsonb_build_array(jsonb_build_object(
          'service_needed',  meta->>'service_needed',
          'job_description', meta->>'job_description',
          'budget_min',      meta->>'budget_min'
        ));
      end;
    end loop;
  end if;

  return new;
exception when others then
  return new;
end;
$function$;
