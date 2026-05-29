-- Enable RLS on profiles + curated contractor directory
-- Already applied to production via Supabase on 2026-05-29.
-- Committed here for version control / reproducibility.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.shares_connection(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.jobs j
            where (j.client_id = auth.uid() and j.contractor_id = other)
               or (j.contractor_id = auth.uid() and j.client_id = other))
    or
    exists (select 1 from public.client_requests cr
            where (cr.user_id = auth.uid() and cr.assigned_contractor_id = other)
               or (cr.assigned_contractor_id = auth.uid() and cr.user_id = other));
$$;

drop policy if exists "Admins manage all profiles" on public.profiles;
create policy "Admins manage all profiles" on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Connected users can view profiles" on public.profiles;
create policy "Connected users can view profiles" on public.profiles
  for select to authenticated
  using (public.shares_connection(id));

drop view if exists public.contractor_directory;
create view public.contractor_directory
with (security_invoker = false) as
  select
    p.id, p.first_name, p.last_name,
    c.specialties, c.service_area, c.years_of_experience,
    c.availability, c.photo_url, c.rating, c.total_jobs
  from public.contractors c
  join public.profiles p on p.id = c.id
  where c.status = 'active';

grant select on public.contractor_directory to authenticated;

alter table public.profiles enable row level security;
