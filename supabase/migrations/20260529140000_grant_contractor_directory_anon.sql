-- Allow logged-out visitors to read the curated contractor directory.
-- Already applied to production via Supabase on 2026-05-29.
grant select on public.contractor_directory to anon;
