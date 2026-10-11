# Freddy Fix It — Weekly Site Review — 2026-09-28

**Verdict:** Nothing is on fire — all 7 platform health checks pass, no unpaid balances, no underfunded payouts, no stuck signups. The single highest-leverage fix is **top-of-funnel traffic**: the last two weeks show zero new signups of either role and zero requests posted, while everything that *does* enter the funnel (bid acquisition, job progression) converts well. This is a demand problem, not a conversion problem — no button-colour or copy change fixes it.

No code, copy, or config changes are shipped this week — **no installer scripts accompany this report.** Every finding below is either healthy, a low-priority data point, or something that needs the owner's judgment (a contractor list, a regulation to watch), not an edit.

---

## 1. Platform health & data integrity

`platform_health_check()`: **7/7 pass.** Fee rate sane, `client_fee` matches `amount × rate`, critical RPCs present, no payout stuck >2h, no unpaid balances >3 days, no underfunded payouts, no stuck signups. Supabase advisors show no new security issues — only a known low-priority duplicate index on `contractor_outreach.email`, not worth an installer on its own.

Supplementary checks:

- **Orphaned `auth.users` (no profile):** 0. Clean.
- **Active contractors who have never bid:** 11. Two are the already-documented seed accounts (Slone, Justin) with NULL company/vetting fields awaiting owner input. The other 9 have real company names, broad service areas, and specialties across many trades, with no matching gap found in `service_specialty_map` — this reads as a genuine low-engagement group given how little request volume exists right now (see §2), not a matcher bug. Worth a nudge email to these 9 once volume picks up; not urgent.
- **Pending requests re-fired twice with zero bids:** 0. Clean.
- **Held jobs with `funded_amount < total_charged`:** 0. Clean, consistent with health checks 5/6.
- **Contractors `review_status='rejected'` with empty `review_result={}`:** 11. This is the known open item from CLAUDE.md ("at least one contractor…"), but the real count is 11, not "at least one." Advisory-only (doesn't block anything), but worth knowing the AI document review verdict is failing to record more often than the doc implies — a candidate for `review-contractor` investigation in a future session, not urgent this week.

## 2. Funnel & analytics (trailing 10 weeks)

- **Signups:** Sparse throughout — contractor signups landed in 6 of the 10 weeks (1–5/week), client signups in 6 of 10 weeks (1–3/week). **The most recent two weeks (9/21, 9/28) show zero signups of either role.**
- **Requests posted → reached ≥1 bid:** Only 5 of 10 weeks had any requests at all (1–3/week). Of those, **every single request that was posted reached at least one bid** — 100% bid-acquisition conversion on this sample, median 1–4 bids/request. Weeks 8/3, 8/17, 9/7, and 9/21 had zero requests posted.
- **Jobs created → scheduled → held → released:** Only 5 weeks saw a job created, exactly 1/week each. One (the week of 8/24) is the platform's first live payout (job `fd9c3db4`, already documented) and reached `released`. The rest haven't progressed further yet, which is expected given how recently they were created.

**The largest absolute drop-off is signups → posted requests in the most recent weeks**, not bid-acquisition or job-progression — both of the latter convert well on the (very small) available sample. Sample sizes are 1–5 per week; this is too thin to draw strong causal conclusions, but the pattern of consecutive zero-signup, zero-request weeks is real and worth watching. Recommended action: focus growth effort (the queued contractor-outreach pipeline, the meta-lead-scout digest, any paid/organic acquisition the owner is running) on top-of-funnel volume rather than on-site conversion mechanics.

## 3. Site & SEO health

Homepage (`https://freddyfixit.ca/`) meta tags are clean: canonical set correctly, on-brand description, full Open Graph + Twitter Card tags, correct theme-color (`#1a2236`, matches brand navy), viewport present, title reads well for search.

**Coverage limitation this run:** the deeper crawl (sitemap entries, the 19 service-slug landing pages, area pages, JSON-LD validation, internal dead-link check) could not be completed. This run had no connected browser (Claude in Chrome was not connected, and nobody was at a desktop to connect it) and the fetch tool available this run can only retrieve URLs that were already supplied — it could reach the homepage but no subpages. This is a tooling gap for this run, not a finding that those pages are broken or fine — treat §3 as partial this week and re-run the deeper crawl next week or interactively.

**Indexing signal (report cautiously):** four separate searches for the domain (`site:freddyfixit.ca`, "freddyfixit.ca services", the business name, and a quoted domain search) returned **zero results for the actual Calgary business** — only unrelated US businesses with similar names surfaced. This could mean a real indexing/visibility gap, or it could simply be a search-tool coverage limitation for a low-traffic `.ca` domain — search tools don't reliably mirror what Google's own index shows. **Recommended action: check Google Search Console directly** (Coverage report + a manual "site:freddyfixit.ca" search in an actual browser) to confirm one way or the other. This is worth doing this week — if the site genuinely isn't indexed, that alone would explain a meaningful share of the flat top-of-funnel numbers in §2.

## 4. Legal & regulatory drift

- **Alberta prepaid contracting licence** (the platform's standing highest-risk open item): requirements are unchanged from what's already documented — $78/year application fee, $10,000 bond (surety bond, cash security agreement, or irrevocable letter of credit), police information check, compliant contract templates. **One thing worth flagging to the owner directly:** the regulation that governs this (Alta Reg 185/1999, Prepaid Contracting Business Licensing Regulation) is shown with an expiry date of June 30, 2026 on CanLII. Alberta routinely renews/re-enacts regulations like this near their sunset date as a matter of course, so this is not necessarily a substantive change — but given how central this licensing question is to the platform (both per-contractor and possibly platform-level), it's worth a direct check with Service Alberta rather than assuming routine renewal. This is a "watch and verify," not a "drop everything."
- **Alberta Consumer Protection Act — cancellation rights:** unchanged. 10-day cooling-off period for off-premises contracts, extended 1-year cancellation right on licence/disclosure defects or non-delivery within 30 days. Matches UserAgreement §6.10 as documented. No drift.
- **Alberta PIPA:** No amendment bill has been introduced yet. A reform is anticipated in the 2026–2027 window following a Standing Committee's 12 recommendations (submitted Feb 2025), and federal Bill C-36 (Protecting Privacy and Consumer Data Act) had its first reading June 15, 2026 and could eventually influence provincial rules. Current breach-notification standard (notify without unreasonable delay on real risk of significant harm) is unchanged — nothing in the Privacy Policy needs to change today. Add to the list of things to re-check next quarter; no action needed now.
- **CASL:** No 2026 amendments found; enforcement continues to focus on phishing/spam campaigns, not new rules. Core three-part requirement (consent, sender ID, working unsubscribe) is unchanged and matches current site behaviour (mailing address, List-Unsubscribe headers, unsubscribe before auth gate). No drift.

*Note: §4's "compare against what the site currently says" step relied on the documented Legal & compliance section of the repo's CLAUDE.md rather than a fresh fetch of the live `/user-agreement` and `/privacy-policy` pages, for the same tooling-access reason noted in §3.*

---

## Summary of actions for the owner

1. Check Google Search Console this week to confirm or rule out an indexing problem — this is the one item that could materially explain the flat top-of-funnel numbers.
2. No urgent action on the prepaid-contracting regulation, but a quick check with Service Alberta on the June 30, 2026 expiry date wouldn't hurt given how much rides on this.
3. Nothing else requires action this week. Re-run the deeper SEO crawl (sitemap, service pages, area pages, JSON-LD) next time with a connected browser for full §3 coverage.
