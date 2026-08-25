-- P1-6. Close anon read on public.reviews.
--
-- The old policy was `reviews public read USING (true)` with no TO clause, so
-- it applied to anon as well. That handed anyone with the publishable key the
-- full row: client_id, contractor_id, job_id and the free-text comment -- i.e.
-- who hired whom, and what they said about it. Same shape as the `contractors`
-- exposure closed in the 2026-08-04 audit.
--
-- Nothing public breaks, because every public reader is SECURITY DEFINER and
-- therefore bypasses RLS: get_homepage_reviews, get_contractor_reviews,
-- get_top_pros, submit_review. The only direct table reads from the browser
-- are by an authenticated party to the review (ClientDashboard.tsx:1031 and
-- ContractorDashboard.tsx:363), both covered below. delete-account reads it
-- with the service_role key, which has rolbypassrls.
--
-- The exposure is latent today (the table is empty) -- it opens the moment the
-- first review is written, which is exactly why it is closed now.

drop policy if exists "reviews public read" on public.reviews;

create policy reviews_party_read on public.reviews
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or contractor_id = (select auth.uid())
    or (select is_admin())
  );
