# Freddy Fix It — weekly site review, 2026-09-01

**Nothing is on fire.** Health check 7/7, mode `open`, 13 cron jobs armed, zero orphaned accounts, zero stuck signups, zero under-funded held jobs, zero sitemap 404s.

**The single highest-leverage fix is not a bug — it is the pick step.** Five of six open requests already have estimates waiting (11 pending bids), and three of those requests are 31–33 days old. Every automated remedy for that is intact and firing. The clients are simply not coming back to choose. That is where the next hour of work belongs.

---

## 1. Platform health and data integrity

`platform_health_check()` — all seven green:

| check | result |
|---|---|
| fee rate sane | ok |
| client_fee matches amount × rate | ok |
| critical RPCs present | ok |
| no confirmed+held payout stuck >2h | ok |
| no_unpaid_balances | ok |
| no_underfunded_payouts | ok |
| no_stuck_signups | ok |

Beyond the check:

- **Orphaned accounts (auth.users with no profile): 0.**
- **Jobs at `held` with `funded_amount < total_charged`: 0.**
- **Requests pending past two re-fires with zero bids: 0.**
- **Active contractors who have never bid: 11.** Not an incident, but it is half the active roster. These are pros who were approved, receive dispatch email, and have never quoted. Worth one round of outreach asking why — the answer is either "the email doesn't reach me", "the jobs aren't my trade", or "I'm not actually looking for work", and each has a different fix.
- **`review_status='rejected'` with empty `review_result={}`: 10 contractors.** The known open defect, now quantified. `review-contractor` is advisory-only so nothing is blocked, but ten pros have a rejection on file with no reason recorded and therefore nothing anyone can tell them. This is the one item here worth a code fix.

Money-path probe (rolled back, Tier 1): **25/25 passed** — both payout guards testable in SQL, all twelve autopay refusal clauses, the claim pause, three authorization cases, the ghost-client detector. Tier 2 read of the deployed `release-payment` and `reconcile-payouts` source confirmed guards 3 and 4 by inspection.

**Standing cautions, unchanged.** Card-on-file has never charged a real card — it is verified by probe and by a live run over an empty candidate set, which is not the same as proven. No job has ever reached `disputed`, so `resolve-dispute` has never executed against real money. The only live payout remains $4.65 on job `fd9c3db4`, 2026-08-30.

## 2. Funnel and analytics

All-time, and the sample is small enough that you should read it as a shape rather than a rate:

| stage | count |
|---|---|
| requests posted | 8 |
| requests with 1+ estimate | 7 |
| requests awarded (became jobs) | 2 |
| jobs reaching scheduled | 1 |
| jobs reaching held | 1 |
| jobs reaching released | 1 |

**The largest absolute drop-off is estimates → award: 7 requests got estimates, 2 became jobs.** It is not a traffic problem and it is not a matching problem. Contractors are quoting. Clients are not picking.

Right now: **6 open requests, 5 of them carry estimates, 11 pending bids in total, three of the requests 31–33 days old.**

The remedies already exist and are working as designed. `run_reminders()` step 4 nudges on bids waiting, keyed `<request>:<bidcount>` so a new estimate re-fires it. The one-tap `/pick/<token>` link probes 9/9 healthy — the token *is* the authorization, so there is no login wall between the email and the choice. Both are firing and the behaviour persists anyway.

That leaves three explanations worth testing, in order of cheapness: the emails are landing in spam (check Resend delivery on those three requests specifically); the client posted speculatively and never intended to hire; or the estimates came back higher than expected and nobody wants to say so. **The cheapest next action is to phone the three clients with month-old estimates.** Four requests this week cannot distinguish a real effect from noise, so no amount of further querying will answer this — a conversation will.

One thing that looks like a bug and is not: the Carpentry request reached one contractor out of fourteen matched. That is a `preferred_contractor_id` rehire reservation working exactly as designed, not the reach-cap defect from 2026-08-28.

## 3. Site and SEO health

Live sweep of all 62 sitemap URLs plus `/robots.txt`: **zero non-200**. Note that on a Vercel SPA catch-all every path returns 200, so that result rules out broken hosting, not dead routes — dead routes were ruled out separately by cross-checking code against the sitemap.

- **Service slugs: 18 in `ServiceLanding.tsx`, 18 in the sitemap, zero divergence in either direction.**
- **Sitemap: 62 URLs, zero duplicates, zero entries that 404.**
- **Every sitemap blog URL resolves** to a real published post — 14 hardcoded, 9 from `blog_posts`. Zero DB posts missing a description, zero unpublished.
- `index.html` carries exactly one `<title>`, one `<meta name="description">`, a correct canonical, full OG/Twitter tags and valid `@graph` JSON-LD (LocalBusiness + WebSite).
- Live spot checks rendered correct per-page title, description, canonical, a single `<h1>` and real body content on `/services/handyman`, `/areas/calgary-nw`, a DB blog post and `/contractor-guide`. **Zero console errors on any of them.**
- `robots.txt` correctly allows everything except the three dashboards, `/update-password` and `/auth/`, and points at the sitemap.

**Finding — two published blog posts are missing from `public/sitemap.xml`:**

- `the-calgary-fall-checklist-six-cheap-fixes-that-prevent-expensive-winters`
- `walkthrough-first-estimates-stop-guessing-start-winning`

Both render fine; they are simply not discoverable. The structural point is that `newsletter-send` auto-publishes a `blog_posts` row whenever `blog_title` is set, and nothing appends to the static sitemap — **so this recurs silently on every newsletter issue that carries a blog title.** Cosmetic; installer below. The durable fix is to generate the sitemap from `blog_posts` rather than maintain it by hand, which is a build-step change and therefore substantive.

**Finding — documentation drift.** `CLAUDE.md` and the weekly-review skill both say "19 service slugs". The real count is 18, in both the code and the sitemap. Worth correcting so a future session doesn't hunt for a missing page.

## 4. Legal and regulatory drift

- **Alberta prepaid contracting / Service Alberta licensing — no change.** Standing open item, unchanged: contractors may each need a licence and bond, and the platform itself may qualify as a prepaid contracting business. Lawyer plus Service Alberta; not resolvable by wording.
- **Alberta consumer protection / cancellation rights — no change.** The 10-day cancellation window after receipt of the written copy still stands, as does the 30-day non-commencement right. Nothing enacted in 2026; latest departmental materials still date to October 2023. The site's §6.10 and the `contract_copy` write-once stamp remain correct.
- **Alberta PIPA — consultation open, nothing enacted.** A review is running (survey 2 Feb – 16 Feb 2026, OIPC engagement spring 2026) with a committee recommendation to add administrative monetary penalties. No amendment in force, no wording change owed today. Worth re-checking next quarter, because monetary penalties would raise the cost of the privacy policy being wrong.
- **PIPEDA — no change.** Federal Bill C-27 died on the order paper 6 January 2025 and has not been reintroduced.
- **CASL — no change.** The existing posture (mailing address in every send, `List-Unsubscribe` + `List-Unsubscribe-Post`, unsubscribe handled before any auth gate) remains sufficient.

No legal text was edited. Nothing here requires an edit.

---

## What the two Freddy skills do not cover

Worth writing down, because it is the honest limit of this review. `freddy-money-test` and `freddy-payment-change` both stop at the database and the edge functions. Neither one opens the site. The gap was closed this run by four other things:

- `npm run typecheck` — **0 errors** (this is the only check that catches a truncated or empty module; `vite build` cannot, because esbuild does no typecheck).
- Route/default-export smoke pass — **21/21 lazy-loaded modules resolve**, so no route can crash inside `React.lazy`.
- The `impeccable` design scan — 10 findings, **all cosmetic** (`side-tab`, `bounce-easing`, `layout-transition` across eight components), **zero functional**. It is an anti-pattern linter, not a bug finder; it did not close the gap so much as confirm it.
- Live browser checks on four public routes with console-error capture — **clean**.

What still has no coverage: the signed-in flows. Nothing here exercised posting a request, placing a bid, signing an agreement, or a payment button, because doing so means real accounts and, at the end of it, a real card. **A checkout path that has never been clicked is unverified no matter how many probes pass.**

---

## Actions, ranked

1. **Phone the three clients with month-old estimates.** Nothing in the data will tell you why they didn't pick.
2. **Run the cosmetic installer** below to add the two blog posts to the sitemap.
3. **Fix `review-contractor` recording an empty `review_result` on reject** — 10 contractors currently hold a rejection with no reason attached.
4. **Ask the 11 never-bid active contractors why.** Half the roster has never quoted.
5. **Correct "19 service slugs" to 18** in `CLAUDE.md`.
6. Re-check Alberta PIPA next quarter for monetary penalties.

## Run this

```
bash ~/freddy-fixit/apply-cosmetic-2026-09-01.sh
```

Wait for `✅ pushed`, then hard-refresh (Cmd+Shift+R). If git complains about a lock, the script already clears it. It carries one file, `public/sitemap.xml`, verified byte-identical on round-trip and syntax-checked before being handed over.
