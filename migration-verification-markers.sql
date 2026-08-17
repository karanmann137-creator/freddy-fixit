-- ============================================================================
-- Client-visible verification markers
-- Written 2026-08-16.
--
-- Purpose: turn verification from a GATE into an INCENTIVE. Pros who have done
-- the paperwork show markers on their bid row; pros who haven't show nothing.
-- Clients pick the ones with markers, pros notice, pros verify themselves.
-- This is what makes the staged friction ladder work without blocking bids.
-- ============================================================================
--
-- WHY DROP AND CREATE RATHER THAN CREATE OR REPLACE
--
-- Both functions return a fixed TABLE(...) signature. Postgres will not let
-- CREATE OR REPLACE change a function's return type, so adding columns needs a
-- DROP first. Verified with pg_proc that NO other function references either
-- one, so nothing breaks behind them. Grants are re-issued below because DROP
-- discards them.
--
-- WHY THESE THREE FLAGS AND NOT A TRUST SCORE
--
-- Each flag is a statement of fact we can defend if a client ever asks what it
-- means:
--
--   id_verified       Stripe Connect completed identity verification, which
--                     requires government photo ID checked by a regulated third
--                     party. This is the ONLY one of the three we can honestly
--                     call "verified" today.
--   insurance_on_file We hold a certificate of liability insurance. We have NOT
--                     confirmed it is current or genuine — hence "on file",
--                     never "verified". Wording is load-bearing.
--   wcb_on_file       Same: we hold a WCB clearance letter, unchecked.
--
-- Trade certificate is deliberately EXCLUDED from v1. It is the one a client is
-- most likely to read as "this pro is licensed for compulsory work", and we
-- have no Tradesecrets lookup yet. Showing it before we can check it is the one
-- marker that could actually mislead someone into an unsafe hire. It lands in
-- Phase 1 with real verification behind it.
--
-- ABSENCE IS QUIET, NOT SCARLET. Nothing here produces a negative signal. A pro
-- with no markers simply has no markers — no red X, no "unverified" badge, no
-- score. A brand-new pro must still be able to win their first job.
--
-- WHEN contractor_verifications LANDS (Phase 1), only the three expressions
-- below change. The column names, the RPC signatures and every line of frontend
-- stay exactly as they are.
--
-- FUTURE TRAP, WRITE IT DOWN NOW: once insurance_expiry_date is a real parsed
-- date, insurance_on_file MUST also test `expiry > now()`. Showing "insurance on
-- file" for a policy that lapsed in March is worse than showing nothing at all,
-- because the client relies on it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. get_contractor_directory() — feeds the bid rows on ClientDashboard
-- ----------------------------------------------------------------------------
drop function if exists public.get_contractor_directory();

create function public.get_contractor_directory()
returns table(
  id uuid, first_name text, last_name text, specialties text[],
  service_area text[], years_of_experience integer, availability jsonb,
  photo_url text, rating numeric, total_jobs integer, rating_price numeric,
  rating_experience numeric, rating_result numeric, rating_count integer,
  google_reviews_url text, company_name text, price_grade text,
  price_ratio numeric, price_sample_count integer,
  id_verified boolean, insurance_on_file boolean, wcb_on_file boolean
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select p.id, p.first_name, p.last_name,
         c.specialties, c.service_area, c.years_of_experience,
         c.availability, c.photo_url, c.rating, c.total_jobs,
         c.rating_price, c.rating_experience, c.rating_result,
         c.rating_count, c.google_reviews_url, c.company_name,
         g.grade, g.ratio, g.sample_count,
         coalesce(c.stripe_payouts_enabled, false),
         coalesce(nullif(c.doc_urls->>'insurance', ''), '') <> '',
         coalesce(nullif(c.doc_urls->>'wcb', ''), '') <> ''
  from public.contractors c
  join public.profiles p on p.id = c.id
  left join lateral public.contractor_price_grade(c.id) g on true
  where c.status = 'active';
$function$;

grant execute on function public.get_contractor_directory() to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. get_contractor_profile(uuid) — feeds the public /contractors/:id page
-- ----------------------------------------------------------------------------
drop function if exists public.get_contractor_profile(uuid);

create function public.get_contractor_profile(p_id uuid)
returns table(
  id uuid, first_name text, last_name text, specialties text[],
  service_area text[], years_of_experience integer, availability jsonb,
  photo_url text, rating numeric, total_jobs integer, rating_price numeric,
  rating_experience numeric, rating_result numeric, rating_count integer,
  google_reviews_url text, company_name text,
  id_verified boolean, insurance_on_file boolean, wcb_on_file boolean
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select p.id, p.first_name, p.last_name,
         c.specialties, c.service_area, c.years_of_experience,
         c.availability, c.photo_url, c.rating, c.total_jobs,
         c.rating_price, c.rating_experience, c.rating_result,
         c.rating_count, c.google_reviews_url, c.company_name,
         coalesce(c.stripe_payouts_enabled, false),
         coalesce(nullif(c.doc_urls->>'insurance', ''), '') <> '',
         coalesce(nullif(c.doc_urls->>'wcb', ''), '') <> ''
  from public.contractors c
  join public.profiles p on p.id = c.id
  where c.id = p_id
    and (c.status = 'active' or public.is_admin());
$function$;

grant execute on function public.get_contractor_profile(uuid) to anon, authenticated, service_role;


-- ============================================================================
-- WHAT THIS DOES NOT EXPOSE
-- ============================================================================
-- No document URLs, no expiry dates, no policy numbers, no Stripe account id,
-- no insurer name, no WCB account number. Three booleans and nothing else, so
-- widening the client-facing surface cannot leak a contractor's paperwork. This
-- matters because the old "Active contractors visible to clients" RLS policy
-- exposed all 38 columns to anon and had to be dropped; every read of someone
-- else's contractor row goes through a curating RPC precisely so this stays
-- true.


-- ============================================================================
-- VERIFY AFTER APPLYING
-- ============================================================================
-- select count(*)                                   as active,
--        count(*) filter (where id_verified)        as id_verified,
--        count(*) filter (where insurance_on_file)  as insured,
--        count(*) filter (where wcb_on_file)        as wcb
--   from public.get_contractor_directory();
--
-- Expected on 2026-08-16: 22 active, 4 id_verified, 4 insured, 3 wcb.
-- If active drops below 22 the join or the status filter got broken.
--
-- Then: select public.platform_health_check();   -- expect 7/7


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Re-apply the previous bodies: identical minus the three trailing select
-- expressions and the three trailing column declarations, with search_path back
-- to 'public'. Re-grant to anon, authenticated, service_role.
