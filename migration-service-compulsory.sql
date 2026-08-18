-- ============================================================================
-- Compulsory-certification flag per service label
-- Applied live 2026-08-16 via Supabase MCP. Committed here for version control.
-- ============================================================================
--
-- WHY THIS IS DATA AND NOT CODE
-- Same shape as service_specialty_map: one row per service label, read by
-- whatever needs it. Changing WHICH trades are gated is then a one-row UPDATE,
-- not a deploy. That is the pattern that has kept the three job matchers in
-- lockstep for months.
--
-- WHAT "COMPULSORY" ACTUALLY MEANS IN ALBERTA
-- A trade being on the compulsory-certification list is NOT the same as every
-- task inside that trade requiring a ticket. Alberta publishes two lists per
-- trade: "Undertakings and Activities" (the whole scope) and "Restricted
-- Activities" (the subset that legally requires a journeyperson certificate,
-- a recognized trade certificate, or registered apprenticeship). Only the
-- second list carries legal force. This table follows the second list.
--
-- The difference is not academic:
--   Automotive Service Technician IS compulsory, but "performing vehicle
--   maintenance services" is the one item deliberately OMITTED from its
--   restricted list. So an oil change or a tire rotation is not gated, while
--   brakes are - "inspecting, testing, analyzing and repairing motor vehicles,
--   including vehicle systems" is restricted, and brakes are an enumerated
--   vehicle system. One service to flag, not four.
--
--   Gasfitter Class B goes the other way. Its restricted list is IDENTICAL to
--   its full scope, all ten items, explicitly including "altering, adjusting
--   and maintaining B gas systems". There is no maintenance carve-out, so
--   HVAC Maintenance on a gas appliance IS gated.
--
-- Sources: Alberta designated trades + restricted activities, tradesecrets.alberta.ca
-- ============================================================================

create table if not exists public.service_compulsory (
  service     text primary key,
  compulsory  boolean not null default false,
  trade       text,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.service_compulsory enable row level security;

-- Public read, same as service_pricing and service_specialty_map. There is
-- nothing private here - it is published regulation.
drop policy if exists service_compulsory_read on public.service_compulsory;
create policy service_compulsory_read on public.service_compulsory for select using (true);

-- Read-only to the app. Revoking from anon alone is a no-op (the default grant
-- is to PUBLIC), so revoke ALL first and grant back only select.
revoke all on public.service_compulsory from anon, authenticated;
grant select on public.service_compulsory to anon, authenticated;

-- Seed every known label from the pricing table so the vocabulary cannot drift
-- away from what clients actually pick.
insert into public.service_compulsory (service, compulsory)
select sp.service, false from public.service_pricing sp
on conflict (service) do nothing;

-- Restricted activities -> certificate legally required.
insert into public.service_compulsory (service, compulsory, trade, note) values
  ('Electrical Work', true, 'Electrician',
   'Installing, altering, repairing and maintaining electrical systems is a restricted activity.'),
  ('Plumbing Repair', true, 'Plumber',
   'Installing, altering, repairing and maintaining plumbing systems is a restricted activity.'),
  ('Air Conditioning', true, 'Refrigeration and Air Conditioning Mechanic',
   'Installing, servicing and repairing refrigeration and air conditioning systems is a restricted activity.'),
  ('HVAC Maintenance', true, 'Gasfitter (Class B)',
   'Altering, adjusting and maintaining gas systems, appliances and controls is a restricted activity. The Gasfitter B restricted-activity list is identical to its full scope -- there is no maintenance carve-out.'),
  ('Appliance Repair / Install', true, 'Appliance Service Technician',
   'Installing, servicing and repairing gas and electrical appliances is a restricted activity.'),
  ('Battery / Brakes', true, 'Automotive Service Technician',
   'Inspecting, testing, analyzing and repairing motor vehicle systems -- brakes among them -- is a restricted activity.'),
  ('Solar', true, 'Electrician',
   'The electrical portion of a solar installation -- wiring, inverter, panel tie-in -- is a restricted activity and needs an electrical permit. Mounting and roof work on its own is not.')
on conflict (service) do update
  set compulsory = excluded.compulsory,
      trade      = excluded.trade,
      note       = excluded.note,
      updated_at = now();

-- Deliberately NOT compulsory, and the reason recorded so a future session
-- does not "helpfully" flag them.
update public.service_compulsory
   set compulsory = false,
       trade      = 'Automotive Service Technician',
       note       = 'Compulsory trade, but "performing vehicle maintenance services" is absent from its restricted-activities list, so this work is not certificate-gated.',
       updated_at = now()
 where service in ('Oil Change', 'Tire Swap / Rotation', 'Vehicle Maintenance');

-- ----------------------------------------------------------------------------
-- Accessors
-- ----------------------------------------------------------------------------
-- search_path is pinned to public, extensions, pg_temp on every public function
-- in this database. extensions is included because pgcrypto lives there and
-- omitting it once silently killed every signup for a month.

create or replace function public.service_is_compulsory(p_service text)
returns boolean
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(bool_or(sc.compulsory), false)
  from public.service_compulsory sc
  where lower(btrim(sc.service)) = lower(btrim(coalesce(p_service, '')));
$$;

-- Frontend accessor, mirroring get_service_pricing().
create or replace function public.get_service_compulsory()
returns table (service text, compulsory boolean, trade text, note text)
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select sc.service, sc.compulsory, sc.trade, sc.note
  from public.service_compulsory sc
  order by sc.service;
$$;

grant execute on function public.service_is_compulsory(text) to anon, authenticated;
grant execute on function public.get_service_compulsory() to anon, authenticated;

-- ============================================================================
-- RESULT: 23 labels, 7 compulsory
--   Air Conditioning, Appliance Repair / Install, Battery / Brakes,
--   Electrical Work, HVAC Maintenance, Plumbing Repair, Solar
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- It does not gate bidding, dispatch or the feed. Nothing reads this flag to
-- decide who may quote. It exists so the Service Agreement can tell the client
-- the truth about the work, and so a future certificate check has somewhere to
-- hang. Gating supply on paperwork is how you end up with an empty feed.
--
-- It does not require a Master Electrician / Master Plumber certificate.
-- That is a permit-pulling credential from the Safety Codes Council held by
-- the BUSINESS (3 years post-journeyman plus an exam), and Calgary layers its
-- own City Qualified Trade registration on top. Requiring it would exclude
-- legal journeymen who sub the permit out, while telling the client nothing
-- about competence.
-- ============================================================================
