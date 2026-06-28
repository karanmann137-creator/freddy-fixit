-- Resolve advisor "Security Definer View" on public.contractor_directory.
-- The view was security_invoker=false on purpose: it exposed only curated,
-- contact-free contractor columns past profiles RLS (which holds email/phone).
-- Replaced with SECURITY DEFINER functions (same minimal column exposure).
-- Already applied to production via Supabase MCP on 2026-06-27.

drop function if exists public.get_contractor_profile(uuid);
drop view if exists public.contractor_directory;

create or replace function public.get_contractor_directory()
returns table (
  id uuid, first_name text, last_name text,
  specialties text[], service_area text[], years_of_experience integer,
  availability jsonb, photo_url text, rating numeric, total_jobs integer,
  rating_price numeric, rating_experience numeric, rating_result numeric,
  rating_count integer, google_reviews_url text, company_name text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name,
         c.specialties, c.service_area, c.years_of_experience,
         c.availability, c.photo_url, c.rating, c.total_jobs,
         c.rating_price, c.rating_experience, c.rating_result,
         c.rating_count, c.google_reviews_url, c.company_name
  from public.contractors c
  join public.profiles p on p.id = c.id
  where c.status = 'active';
$$;

create or replace function public.get_contractor_profile(p_id uuid)
returns table (
  id uuid, first_name text, last_name text,
  specialties text[], service_area text[], years_of_experience integer,
  availability jsonb, photo_url text, rating numeric, total_jobs integer,
  rating_price numeric, rating_experience numeric, rating_result numeric,
  rating_count integer, google_reviews_url text, company_name text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name,
         c.specialties, c.service_area, c.years_of_experience,
         c.availability, c.photo_url, c.rating, c.total_jobs,
         c.rating_price, c.rating_experience, c.rating_result,
         c.rating_count, c.google_reviews_url, c.company_name
  from public.contractors c
  join public.profiles p on p.id = c.id
  where c.id = p_id
    and (c.status = 'active' or public.is_admin());
$$;

revoke all on function public.get_contractor_directory() from public;
grant execute on function public.get_contractor_directory() to anon, authenticated;
grant execute on function public.get_contractor_profile(uuid) to anon, authenticated;
