# Freddy Fix It — Weekly Review, 2026-10-05

**Verdict:** Nothing is on fire. The one failing health check is a remedy-exhausted signup rescue, not a live incident. Traffic is still too low this week to draw any funnel conclusion — the single highest-leverage fix is still demand, not the product.

No cosmetic or substantive code changes are shipped this week. Nothing found rose to the bar of a confirmed, actionable defect — see Findings below for what's open and what's just noted for next run.

---

## 1. Platform health and data integrity

`platform_health_check()`: **6 of 7 pass.**

- **Failing: `no_stuck_signups`.** This is not a live incident. The account(s) behind it have already exhausted `auth-rescue`'s lifetime cap (max 2 rescue sends ever, per account) — the remedy system worked as designed and ran out of retries, it didn't fail to run. No action needed unless a human wants to manually rescue via `admin_rescue_signup`.
- Orphaned accounts (`auth.users` with no profile): **0**.
- Active contractors who have never bid: **11**, two of which are the known-incomplete seed contractors (Slone, Justin) already tracked as an open item in CLAUDE.md. The other 9 are a normal part of a thin marketplace at this volume, not a defect.
- Requests stuck `pending` with ≥2 re-fires and 0 bids: **0**.
- Jobs at `held` with `funded_amount < total_charged` (underfunded payout risk): **0**.
- AI document review (`review_status='rejected'` with empty `review_result={}`): **11 rows**, including the one known test account already flagged in CLAUDE.md as an open defect (verdict not always recording). Not new, not escalating.

No live incident. Nothing here changes the cosmetic-vs-substantive calculus for this week.

## 2. Funnel and analytics

Traffic remains too thin to support a conversion conclusion. Over the last 3 full trailing weeks: at most **1 signup and 1 new request per week**. Zero jobs reached `held` or `released` in any of the last 4 weeks.

All-time (10 requests total): average **2.4 bids/request**, median **2**. That's the only funnel number with enough sample size to say anything about, and it says bidding itself isn't the blocker — getting requests posted at all is.

**This is a demand problem, not a CRO problem.** Recommending copy or layout changes against four-request weeks would be noise dressed up as insight. No action.

## 3. Site and SEO health

Homepage (`https://freddyfixit.ca/`) checked directly: `<title>`, meta description, OG tags, Twitter card tags and canonical URL are all present. `theme-color` correctly matches brand navy (`#1a2236`). One minor, low-priority item: `<title>` text differs slightly in wording from `og:title`/`twitter:title` — cosmetic, not broken, not worth an installer on its own.

**Could not complete this week:** the sitemap and the 19 service-landing pages, area pages, legal pages, blog, and contractor directory could not be crawled — the fetch tool available this run was restricted to URLs that had already appeared in context, and none of those internal paths qualified. A `site:freddyfixit.ca` web search also came back empty, but that's inconclusive (could be how the search tool handles `site:` queries, not necessarily an indexing problem) — not reporting it as a confirmed defect.

**Carryover for next run:** retry the full sitemap/internal-link/JSON-LD crawl once fetch access to those paths is available, or do a human spot-check in the meantime.

## 4. Legal and regulatory drift

No drift found against current site copy this week, across all four areas checked:

- **Prepaid contracting (Alberta licensing):** No change. What's out there — business registration, a criminal record check, a security/surety bond (roughly $10k–$75k coverage, ~$425/yr premium), contract-copy and 10-day cancellation-right disclosure requirements — matches the standing open item already in CLAUDE.md. Still needs a lawyer + Service Alberta; still open, still unchanged.
- **Alberta consumer protection / cancellation rights:** No drift against §6.10. The 10-day direct-sales cancellation right, 7-day internet/non-delivery right, unfair-practice cancellation right, and auto-renewal disclosure rules are established law, not a new 2026 change.
- **CASL:** No new compliance requirement. What's circulating (increased complaint record-keeping in H1 2025, penalties up to $1M personal / $10M corporate, more B2B scrutiny, registrar phishing guidance) is enforcement posture, not a new rule — the site's existing compliance (mailing address, List-Unsubscribe headers, opt-in) remains aligned.
- **Alberta PIPA / PIPEDA:** Still in consultation, not law. Alberta's PIPA reform (12 recommendations reported Feb 2025, public consultation opened Feb 2026, OIPC engagement running through spring 2026) has no bill introduced as of this week. No federal PIPEDA amendments found either.

Standing open item (prepaid contracting licensing — lawyer + Service Alberta) carries forward unchanged.

---

## Installers this week

**None.** Nothing found this week — cosmetic or substantive — met the bar for a code, DB, or legal change. No `apply-*.sh` is included.
