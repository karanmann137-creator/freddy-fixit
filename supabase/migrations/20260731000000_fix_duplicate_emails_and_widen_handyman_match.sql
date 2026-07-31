-- Two fixes to how a new job reaches contractors.
-- Both are already applied live via the Supabase MCP tools; this file is the
-- version-controlled record.
--
-- ============================================================================
-- 1. Duplicate emails
-- ============================================================================
-- "notify-admin-contractor" was a leftover Supabase Database Webhook from before
-- contractor-welcome and admin-alert existed. On every contractors INSERT it
-- called the notify-admin edge function, which sent TWO emails:
--   * "New Contractor Application" -> hello@   (duplicated by admin-alert)
--   * "Application received"       -> the pro  (duplicated by contractor-welcome)
-- Both newer functions carry strictly more information and a CASL footer, so the
-- legacy path added nothing but a second copy in each inbox.
--
-- The matching "notify-admin-client " trigger on client_requests STAYS: it is the
-- only thing that sends the client their "we've received your request"
-- confirmation. notify-admin v17 drops its own admin branch instead, so hello@
-- gets one new-job alert (from admin-alert) rather than two.

drop trigger if exists "notify-admin-contractor" on public.contractors;

-- ============================================================================
-- 2. Handyman matching was too narrow
-- ============================================================================
-- service_specialty_map was a strict 1:1 lookup, so a "General Handyman" job only
-- reached pros who had literally ticked the "General Repairs" checkbox — 8 of 14
-- active pros. It skipped obvious generalists (e.g. a pro listing Carpentry +
-- Painting + Drywall + Flooring + Landscaping) purely on a label technicality.
--
-- All three matchers — notify_contractors_new_request() (in-app bell),
-- dispatch-job (email), and list_open_jobs() (Available Jobs feed) — read this
-- one table, so changing the data here keeps them in lockstep by construction.
-- No function or edge-function logic changes.

-- Handyman jobs now reach the handyman trades. Deliberately NOT electrical,
-- plumbing, HVAC or cleaning: those pros can't do the work and would start
-- treating our email as noise.
update public.service_specialty_map
   set specialties = array['General Repairs','Carpentry','Painting','Drywall','Flooring / Tile']
 where service = 'General Handyman';

-- The reverse: a handyman is qualified for small painting/carpentry/drywall
-- jobs, so they now see those too. This is where most job volume sits, and more
-- bids per job is the point of the marketplace.
update public.service_specialty_map
   set specialties = array['Painting','General Repairs']
 where service = 'Painting';

update public.service_specialty_map
   set specialties = array['Carpentry','General Repairs']
 where service = 'Carpentry';

update public.service_specialty_map
   set specialties = array['Drywall','Flooring / Tile','General Repairs']
 where service = 'Drywall / Flooring';
