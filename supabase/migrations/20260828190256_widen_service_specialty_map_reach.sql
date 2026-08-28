-- Widen service_specialty_map so a posted job reaches every pro who can
-- plausibly do it. 19 of 23 labels were 1:1, which is why an Appliance
-- Repair job could only ever reach 2 of 23 active pros even with everyone
-- approved. This changes DATA only -- all three matchers
-- (notify_contractors_new_request, dispatch-job, list_open_jobs) read this
-- table, so they stay in lockstep with zero code changes.
--
-- Deliberately NOT widened: Electrical Work, Plumbing Repair, Air
-- Conditioning, HVAC Maintenance (Alberta compulsory trades -- a handyman
-- cannot legally do the work), Cleaning Services, Solar, and the four
-- vehicle labels. Sending those to pros who cannot do the job is how our
-- email starts being treated as noise.

update public.service_specialty_map
   set specialties = array['Appliance Repair / Install','General Repairs']
 where service = 'Appliance Repair / Install';

update public.service_specialty_map
   set specialties = array['Windows & Doors','Carpentry','General Repairs']
 where service = 'Windows & Doors';

update public.service_specialty_map
   set specialties = array['Garage','Carpentry','General Repairs']
 where service = 'Garage';

-- Locksmith matched ZERO active pros: the label is mapped, so the
-- "unmapped labels pass through to everyone" fallback never applied and a
-- locksmith job reached nobody at all.
update public.service_specialty_map
   set specialties = array['Locksmith','General Repairs','Carpentry']
 where service = 'Locksmith';

update public.service_specialty_map
   set specialties = array['Gutters','Siding & Roofing','General Repairs']
 where service = 'Gutters';

update public.service_specialty_map
   set specialties = array['Siding & Roofing','General Repairs']
 where service = 'Siding & Roofing';

update public.service_specialty_map
   set specialties = array['Concrete / Masonry','General Repairs']
 where service = 'Concrete / Masonry';

-- Same crews, opposite seasons.
update public.service_specialty_map
   set specialties = array['Snow Removal','Landscaping']
 where service = 'Snow Removal';

update public.service_specialty_map
   set specialties = array['Landscaping','Snow Removal']
 where service = 'Landscaping';
