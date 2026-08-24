# Freddy Fix It — weekly review, 2026-08-24

**Nothing is on fire.** All seven health checks are green, no money is at risk, and the zero funnel is a deliberate `waitlist` pause that is correctly scoped.

**The single highest-leverage fix is removing the "fixed-price" claim from 27 public pages and the FAQPage JSON-LD** — 5 of the 14 real bids in the database carry no price at all, so the promise is false 36% of the time and Google is eligible to print it as a rich result with our name on it.

Two installers are ready. Run commands are at the bottom.

---

## Site status: paused on purpose

`platform_settings.mode = 'waitlist'`, set 2026-08-22 23:42 by the admin. Everything downstream follows from that, so read the funnel section with it in mind.

The pause is implemented well. `outbound_paused()` is true, and the cron stand-down is exactly right — four jobs still run (`auto-confirm-stale-jobs`, `platform-health-check`, `reconcile-payouts`, `release-unconfirmed-visits`), six are stood down (`daily-reminders`, `escalate-unbid-requests`, `newsletter-client`, `newsletter-contractor`, `refire-stale-requests`, `visit-reminders`). The `newsletter-contractor` gap noted in CLAUDE.md is closed; it is inactive.

The scoping is also right. `accept_bid`, `place_bid`, `propose_job_schedule`, `approve_job_schedule`, `mark_job_complete`, `confirm_job_completion`, `contract_signed` and `contract_ready` are **not** pause-gated, so work already in flight can still finish. No request carries `waitlisted = true`.

One hole, covered in finding 2.

---

## 1. Platform health and data integrity

`platform_health_check()` — all seven pass:

| Check | Result |
|---|---|
| `fee_rate_sane` | pass |
| `client_fee_matches_amount` | pass |
| `critical_rpcs_present` | pass |
| `no_stuck_payouts` | pass |
| `no_unpaid_balances` | pass |
| `no_underfunded_payouts` | pass |
| `no_stuck_signups` | pass |

Beyond the check: 0 orphaned `auth.users` rows, 0 jobs at `held`, 0 underfunded held jobs, `max(funded_amount)` still 0.00, `job_contracts` still 0 rows. The held→dispute→release path remains production-untested. That is the same standing item as last week, unchanged, and it cannot move while the site is paused.

Three data-integrity items got **worse or older** since last week, and they share a cause: `daily-reminders` is stood down, so nothing is nudging anyone about any of them.

**AI document review is not merely flaky — it has never once passed.** Contractors with `review_status = 'rejected'` and an empty `review_result = {}` went from 9 to **10**. Zero contractors have ever reached `passed`. CLAUDE.md records this as "sometimes records rejected with an empty result"; the data says the verdict is never recording and the pass path may never have executed. It is advisory-only so it blocks nothing, but it means the owner is manually vetting every contractor with no assistance from a function that runs on every upload. Worth an hour reading `review-contractor` v11's response parsing before the next batch of signups.

**Job `d4276678` has been stalled 12 days** on a NULL amount, up from 7 last week. A contractor was assigned and never proposed a price. `refire-stale-requests` does not cover assigned jobs, and the 48h stall nudge in `run_reminders()` step 4 is exactly what would chase it — and it is stood down.

**Three pending requests are now 23–24 days old holding 9 unpicked estimates.** Nine real bids from real contractors that nobody has chosen. These predate the pause. When the site reopens, these are the cheapest conversions available and they will be a month stale.

**Payout readiness is 4 of 12 active contractors.** Unchanged. Since `contract_ready` gates the agreement on `stripe_payouts_enabled`, two thirds of the active roster cannot be paid and therefore cannot have an agreement sent — which means they cannot complete a job even if they win one. That is worth a targeted email when the site reopens, not now.

---

## 2. Funnel and analytics

Zero signups, zero requests, zero bids, zero jobs this week. That is the pause working, not a conversion problem. There is nothing here to analyse and no CRO recommendation would be honest.

Two things are worth saying anyway.

**`/get-a-quote` is the one client entry point that ignores the pause.** This is finding 2 and it has an installer.

`submit_quote_lead` writes to `quote_leads`. The `enforce_platform_pause` trigger guards `client_requests` only — it does not cover `quote_leads`, and `triggers_on_quote_leads` is null. So while every other entry point on the site says we are closed, this page — which is in the sitemap and fires the GA4 `generate_lead` conversion — still tells the visitor *"Estimate request sent… we'll reach out shortly with a ballpark price."*

Nobody is reaching out. There is no notification on that table. The honest version: an admin Leads tab with a `new` badge does exist, and the single historical lead (2026-06-26) is marked `contacted`, so the pull model has worked exactly once. But it depends on the owner opening a tab, during a period when he has deliberately closed the site and has no reason to be checking for leads.

The fix routes the page into the same `WaitlistForm` every other entry point uses, so the visitor's details are captured somewhere the owner already looks and the promise matches reality. The pause branch is placed **after** the `done` return, so anyone who submitted moments before the switch flipped still sees their confirmation.

**Read the consent rate before concluding traffic is zero.** GA4 and PostHog are both gated behind opt-in cookie consent — no consent, no script, no hit. A low number can mean low consent rather than low traffic. Not actionable this week; noting it so it is not misread next week.

---

## 3. Site and SEO health

**Finding 1: 86 "fixed-price" strings promise something the platform does not deliver.**

Across `ServiceLanding.tsx` (52), `AreaLanding.tsx` (20), `BlogPost.tsx` (11) and `ServicesIndex.tsx` (2) — 27+ public pages, since the landing files are templates rendered per slug and per area.

The claim is false in two distinct ways, both of which are live features, not edge cases:

- A contractor can bid with **no firm price at all** by ticking "I'd like to see the space first" (`bids.walkthrough_requested`). **5 of the 14 real bids in the database do exactly that — 36%.**
- `propose_price_change()` lets the price move **after booking**, with the client's approval.

Two of these strings sit inside FAQ answers that are emitted as **FAQPage JSON-LD**, so Google can surface the claim as a rich result attributed to us. That is what lifts this above ordinary copy drift.

Replacement wording is true today: every bid is a written estimate for the whole job rather than an hourly rate, the price cannot change after booking without the client's approval, and some pros will ask to see the space first before quoting a firm number. The two FAQ answers say so explicitly.

Classified **substantive**, not cosmetic, under the skill's own tie-breaker: it changes what a user is told about money. It gets its own installer and is not bundled.

One string was deliberately left alone — `BlogPost.tsx:412`, *"Can I get the estimate in writing, with a fixed price?"* That is generic hiring advice addressed to the reader about hiring anyone, not a promise about this platform.

**Everything else is clean.** Sitemap is 62 URLs, zero orphans, zero dead entries, no drift since last week's cosmetic installer landed — and no new drift is possible right now because the newsletter cron is stood down, so no blog post has auto-published since 2026-08-18. All 19 service slugs and every area page resolve and are in the sitemap. No non-200s, no duplicate titles, no missing descriptions, no JSON-LD validation failures beyond the truthfulness problem above.

**No cosmetic installer this week.** There is nothing cosmetic to ship.

---

## 4. Legal and regulatory drift

**The standing prepaid-contracting item moved, and it moved against us.**

Last week's review recorded Alta Reg 185/1999's June 30, 2026 expiry as "status unknown." That is now resolved: it was **amended, not lapsed** — **Alberta Regulation 74/2025**, the Prepaid Contracting Business Licensing Amendment Regulation (cited as "AR 185/99 s7;74/2025"). Alberta's own guidance page at https://www.alberta.ca/prepaid-contracting-licence, published 2026-05-15, still actively publishes the requirement: criminal record check, security/bond, standard contract requirements, licence fee, 3-year records retention, business ID cards. Exemptions exist for commercial buildings, contractor-to-subcontractor work, and New Home/National Home Warranty members — none of which describe our residential marketplace.

The same guidance prohibits **in-home solicitation without a prior express invitation** for furnaces, air conditioners, water heaters, windows and energy audits. That maps directly onto our HVAC Maintenance, Air Conditioning and Windows & Doors service labels. Nothing on the platform currently solicits in person, so this is not a present breach — it is a constraint on any future door-to-door or in-person upsell.

**New sub-finding, and it quantifies the exposure.** Consumer Protection Act **s.28** lets a consumer cancel a direct sales contract **within one year** where the supplier was required to be licensed under Part 10 and was not.

This reframes the standing item. It has been carried as a wording and disclosure problem. It is not — it is a one-year rescission problem. UserAgreement §6.10 currently gives the 10-day any-reason right, the 30-day non-start right, and the 15-day refund commitment. It does **not** mention s.28.

Recommended wording, **for the owner and a lawyer to apply, not applied here** — §6.10 should acknowledge that where Alberta law required a supplier to hold a prepaid contracting licence and that supplier did not, the client may have a statutory right to cancel within one year, and that this right is not limited by anything else in the agreement.

I have not edited any legal page. Per the skill, legal drift is reported only.

Service Alberta Consumer Contact Centre: 1-877-427-4088.

**PIPA: no change.** No amendment bill has been introduced. The 12 committee recommendations from Feb 2025 are still in engagement, running Feb through Spring 2026.

**CASL: no legislative change.** Enforcement volume is up — 152,603 complaints in H1 2025, the highest since inception — but our posture is already compliant (List-Unsubscribe plus POST per RFC 8058, mailing address in every send, unsubscribe handled before any auth gate). The newsletter is stood down, so present exposure is nil.

---

## What changed in the installer mechanism, and why

Both installers this week use **anchored in-place substitution** rather than the documented base64-full-file pattern. This is a deliberate deviation and it is worth one paragraph.

The full-file pattern carries a complete copy of every listed file. That is the right tool for a structural change, and it is also precisely how a stale clone has twice reverted newer work and broken production — once wiping the pipeline strip and calendar, once orphaning `ContractPanel` and making every job unpayable. Both of this week's changes are text edits, so instead each installer carries a base64 JSON table of exact strings with exact expected occurrence counts, verifies **every** count across **every** file first, and **writes nothing at all** unless the whole plan matches. It therefore cannot revert an edit made after it was built — it only ever touches the strings listed in it.

If the repo has moved underneath it, it prints what it found and exits with zero files modified. That is the safe outcome; send the output back.

Verification performed on both, from a fresh clone at `e52972c`:

- `bash -n` clean
- base64 payload extracted from the written installer and `cmp`-identical to source (2752 and 4348 bytes)
- the node block extracted from the written installer and run against a pristine `git archive HEAD` checkout — all five resulting files **byte-identical** to the verified working tree
- a second run of each refuses and writes nothing
- `npm run typecheck` — **0 errors**, the baseline
- esbuild parse-check clean on all five files
- secret scan and PII scan clean

`npx vite build` is embedded in each installer as the owner-machine gate; it cannot run in this sandbox (rolldown ships a darwin-only binding).

---

## Run these

Two commands, in either order. Each waits for a `✅ … pushed` line. Hard-refresh with Cmd+Shift+R afterwards.

```
bash ~/freddy-fixit/apply-estimate-copy-2026-08-24.sh
```

Removes the fixed-price claim from 86 strings across four files. Rewrites the two FAQ answers that feed FAQPage JSON-LD.

```
bash ~/freddy-fixit/apply-quote-lead-pause-2026-08-24.sh
```

Makes `/get-a-quote` respect the site pause and capture into the waitlist instead of promising an estimate nobody is sending.

If git complains about a lock, prefix with `rm -f ~/freddy-fixit/.git/index.lock &&`.

---

## Carried forward

- **Owner + lawyer:** prepaid contracting licensing, now with a one-year CPA s.28 rescission exposure attached. Blocking-risk.
- **Owner:** leaked-password protection, Supabase Dashboard → Authentication → Policies. Not settable over MCP.
- **Owner, cosmetic:** delete the four tombstoned edge functions. They send nothing and hold no secrets; the MCP has no delete tool.
- `review-contractor` has never recorded a pass. Read its response parsing.
- Job `d4276678` — 12 days, NULL amount.
- Three requests, 23–24 days old, 9 unpicked estimates. First thing to work when the site reopens.
- 8 of 12 active contractors cannot receive payouts, and therefore cannot have an agreement sent.
- One real end-to-end live payment run is still owed.
