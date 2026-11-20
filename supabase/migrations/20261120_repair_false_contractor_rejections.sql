-- Repair the 11 contractors falsely rejected by review-contractor (2026-11-20)
--
-- WHAT HAPPENED
-- `review-contractor` (deployed v18) sent the model string "claude-sonnet-4-6",
-- which does not exist. Every call 404'd. The function never checked `aiRes.ok`,
-- so `aiData.content?.[0]?.text || "{}"` fell through to the literal "{}" and
-- `JSON.parse("{}")` returned `{}`. The verdict line then read
--     const overall = reviewResult.overall === "approved" ? "approved" : "rejected";
-- which collapses EVERY non-approval — including the function's own "pending"
-- fallback — into a rejection. So the platform recorded a hard rejection for
-- documents that nothing had ever read, and emailed each contractor an
-- action-needed notice about it.
--
-- The fingerprint is exact and unambiguous: review_status = 'rejected' AND
-- review_result = '{}'. A real rejection carries issues/outcome/checked_at keys
-- (see the one genuine 'needs_review' row). All 11 'rejected' rows match the
-- fault; zero legitimate rejections exist in this table.
--
-- This was the whole pipeline: 0 contractors approved, and 26 of 27 bids ever
-- placed (all $8,162 of bid value) came from this falsely-rejected cohort.
--
-- WHAT THIS DOES
-- Resets the 11 to 'needs_review' — NOT to 'approved'. Nobody has actually
-- verified these documents, and auto-approving on the strength of a known-broken
-- reviewer would repeat the original mistake in the opposite direction. The
-- admin dashboard renders anything that is not 'pending', so 'needs_review' is
-- the status that puts them in front of a human for a real decision.
-- `review_result` records why, so the next reader is not left guessing.
--
-- Sends no email. Re-running the (now fixed) automated review for these 11 would
-- fire 22 emails and needs the owner's go-ahead first.
--
-- The function fault itself is fixed in review-contractor v13 / deployed v19:
-- an ordered model-candidate list retried on 404 ONLY, and a THREE-way verdict
-- where "could not tell" routes to needs_review instead of masquerading as a
-- rejection.

update public.contractors
set review_status = 'needs_review',
    review_result = jsonb_build_object(
      'outcome', 'needs_review',
      'summary', 'The earlier automated rejection was a system fault, not a verdict on these documents — the automated reviewer was calling a model that did not exist, so nothing was ever read. Please review the documents yourself.',
      'issues', jsonb_build_array('Prior rejection voided 2026-11-20: automated review had never run'),
      'checked_at', null
    )
where review_status = 'rejected'
  and review_result::text = '{}';
