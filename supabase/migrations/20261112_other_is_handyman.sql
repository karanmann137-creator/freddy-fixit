-- "Other" is a handyman job (2026-11-12, owner decision).
--
-- "Other" had no row in service_specialty_map, and service_specialties()
-- returns NULL (reach every contractor) as soon as one label is unmapped. So a
-- request for "General Handyman, Other" emailed the whole roster, mechanics
-- included. Now "Other" reaches the same trades as General Handyman, plus any
-- contractor who has opted in to jobs outside their trades. The opt-in is
-- stored as the specialty "Other" on the contractor (a checkbox on their
-- dashboard profile), so all six readers of service_specialties() pick it up
-- with no code change.

insert into public.service_specialty_map (service, specialties)
select 'Other', m.specialties || array['Other']
  from public.service_specialty_map m
 where m.service = 'General Handyman'
on conflict (service) do update set specialties = excluded.specialties;
