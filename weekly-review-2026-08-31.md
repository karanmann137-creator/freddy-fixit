# Freddy Fix It — weekly review, 2026-08-31

**Nothing is on fire.** All seven platform health checks are green, every cron job succeeded, and the first live payout (job `fd9c3db4`, Aug 30) completed cleanly — the held→release path is now production-proven.

**The single highest-leverage fix:** five open requests are holding **17 estimates and zero picks**, and ten of those estimates carry no price at all. The entire funnel loss is at the moment the client chooses. Nothing upstream needs work this week.

---

## The week in numbers

This was the busiest week the platform has had. Last week was empty, so "week over week" is not a meaningful comparison — the honest read is the all-time funnel.

| Stage | This week | Last week | All time |
|---|---|---|---|
| Client signups | 2 | 0 | 7 |
| Contractor signups | 0 | 1 | 23 |
| Requests posted | 3 | 0 | 8 |
| Requests with 1+ bid | 3 | 0 | 8 |
| Bids placed | 10 | 0 | 24 |
| Requests awarded (job created) | 1 | 0 | 2 |
| Jobs reaching `scheduled` | 0 | 0 | 1 |
| Jobs reaching `held` | 0 | 0 | 0 |
| Jobs reaching `released` | 0 | 0 | 1 |

Median bids per request: **2.5**. Bid coverage: **8 of 8 requests (100%)** have received at least one estimate.

**Largest absolute drop-off between adjacent stages: requests-with-bids → requests-awarded, 8 → 2. Six requests lost, every one of them at the pick.** Matching, dispatch and bidding are all working. Supply is answering. The client is not choosing.

The sample is small — eight requests total — so treat the *rate* as indicative, not measured. But the six stalled requests are individually real and individually recoverable, which is what makes this actionable rather than statistical.

---

## Findings, ranked

### 1. Five requests are sitting on 17 estimates with nobody picked

| Request | Service | Posted | Bids | Re-fires | Days open |
|---|---|---|---|---|---|
| `7fadb4ff` | General Handyman | Jul 30 | 5 | 0 | 32 |
| `420a4f6c` | Plumbing Repair | Aug 1 | 4 | 2 | 30 |
| `6e2a3465` | Electrical Work | Aug 1 | 4 | 2 | 30 |
| `cf954333` | Appliance Repair / Install | Aug 28 | 2 | 2 | 3 |
| `f2329c43` | Plumbing Repair | Aug 30 | 3 | 0 | 1 |

`7fadb4ff` has had five estimates for a month, including four with firm prices ($80, $120, $79, $200), and has never been picked. Both `refire_count` limits are exhausted on three of these, so the automated nudges have already stopped — nothing in the system will chase these clients again.

**Recommended action:** there is no client-side "you have estimates waiting, pick one" reminder anywhere in `run_reminders()`. The 48h stall nudges cover estimate-owed and approval-owed, not pick-owed. That is the gap. Adding a pick reminder is a substantive change (new emitter, needs an `EMAIL_HANDLED_ELSEWHERE` check and an `outbound_paused()` gate) — flagged here, not built, because it wants a design decision on cadence and cap first.

Second, cheaper action: the owner can reach these five clients by hand today. Five phone calls will tell you more about why nobody is picking than any amount of instrumentation.

### 2. Ten of the seventeen open estimates carry no price

Every null-amount bid on the platform is `walkthrough_requested = true`, so this is the walkthrough-first feature working exactly as designed — not a bug. The problem is the mix.

- `f2329c43` (Plumbing, Aug 30) — **all 3 estimates are walkthrough-only.** The client has received zero prices.
- `6e2a3465` (Electrical, Aug 1) — **all 4 estimates are walkthrough-only, for 30 days.** Two of them carry no ballpark range either.

The homepage promises written estimates. On two of five open requests the client has been shown no number at all, and is being asked to book a site visit before learning anything. That is a materially different product from the one advertised, and it lands on exactly the two compulsory trades where reach is already thinnest (Plumbing 5, Electrical 6).

Also worth the owner's eye: contractor `55aab20b` placed **five walkthrough bids across five different requests inside three minutes** on Aug 30 (5:36–5:38pm), with near-identical messages and generic ranges. Not a violation, but it is low-effort volume bidding, and it consumes bid-cap slots that a priced estimate could have taken.

**Recommended action, in order of cost:** (a) require a ballpark `price_low`/`price_high` on a walkthrough bid — two of the twelve have neither, which is the least useful possible estimate; (b) surface walkthrough bids visually distinctly on the client's bid list so "no price yet" reads as a state rather than a missing field; (c) consider capping walkthrough-only bids per request so they cannot fill all seven slots. All three are substantive (bid path + client dashboard) and none is built here.

### 3. `withdraw_job()` strands the accepted bid — data defect, one request affected

Request `420a4f6c` is in an impossible-looking state: bid `fef445ef` is marked **`accepted`** ($375, Aug 1) with a sibling marked `declined`, while the request itself is `pending`, `assigned_contractor_id` is NULL, and no job row exists.

`accept_bid` → `_accept_bid_internal` cannot produce this; it sets the job, the request and every bid in one atomic block. `withdraw_job()` can, and did. Its tail:

```sql
delete from messages where job_id = p_job_id;
delete from jobs where id = p_job_id;

update client_requests
   set status = 'pending', assigned_contractor_id = null
 where id = v_request
   and status not in ('completed', 'cancelled');
```

It resets the request and **never touches `bids`**. So when a contractor withdraws, the request goes back on the market carrying a stale `accepted` bid and a stale `declined` one. `decline_price_reopen` already gets this right — it re-sets every other bid to `pending` precisely so the client can re-pick in one tap. `withdraw_job` should mirror it.

Proposed fix, committed as source only in `apply-withdraw-job-bids-2026-08-31.sh`:

```sql
update bids set status = 'pending'
 where request_id = v_request
   and status in ('accepted', 'declined');
```

**This is NOT applied.** It touches the bid path, so it goes through the `freddy-payment-change` review gate first. Two things to decide before applying: whether the withdrawing contractor's own bid should return to `pending` or be removed (I would remove it — they just walked), and whether the one existing bad row is repaired by hand or left as history.

`admin_delete_job` has the same omission and was not the cause here, but it should be fixed in the same pass.

### 4. `Solar` reaches zero contractors

`trade_reach('Solar')` returns **0**. Solar is selectable on both `Home.tsx` and `ClientOnboarding.tsx`, so a client can post a Solar job that will silently reach nobody — no error, no empty state, nothing anywhere says so. This is the exact failure mode `CLAUDE.md` documents for Locksmith: the "unmapped labels pass through to everyone" fallback keys on the label being *absent* from `service_specialty_map`, and Solar is present but maps to a specialty no active pro holds.

The auto-remediation is also inert: `contractor_outreach` holds **0 rows at status `'new'`**, so the `client_requests_outreach_gap` trigger has nothing to promote. The pipeline is built and has no ammunition.

Thin but non-zero, worth watching: Air Conditioning 2, Oil Change 2, Tire Swap 2, Vehicle Maintenance 2, Battery / Brakes 3, HVAC Maintenance 3.

**Recommended action:** either remove Solar from the two client-facing pickers until a pro holds it, or load solar installers into `contractor_outreach`. Removing it is the honest short-term move. Substantive (touches the service label lists in two files, and `CLAUDE.md` requires all four category lists move together) — not built here.

### 5. `/blog` sets no canonical, no title and no meta description — **cosmetic, installer ready**

`src/pages/Blog.tsx` is in the sitemap at priority 0.8 and is the hub for 20+ posts, but its only `useEffect` fetches DB posts. It never calls `upsertMeta`. Every other SEO route on the site does.

Because these routes are client-rendered and `index.html` ships a site-wide canonical, a direct hit on `/blog` inherits `canonical=https://freddyfixit.ca/` — **the blog index currently declares itself a duplicate of the homepage.** That throws no error and shows nothing in the browser; it shows up as a ranking problem weeks later.

Fixed in `apply-cosmetic-2026-08-31.sh`: adds the `upsertMeta` import and a meta effect matching the `ServicesIndex.tsx` pattern exactly — title, description, canonical `https://freddyfixit.ca/blog`, plus og:title / og:description / og:url. Restores only `document.title` on unmount, per the house rule. Verified: `npm run typecheck` passes with 0 errors, `esbuild` parses clean.

### 6. Documentation drift — two lines, no action needed this week

`CLAUDE.md` says 19 service landing slugs; there are **18**, and they match `sitemap.xml` and `ServiceLanding.tsx` exactly. `src/CLAUDE.md` still lists a `/contractors` (Browse) route, which no longer exists in `App.tsx`.

---

## 1. Platform health and data integrity

`platform_health_check()` — all seven green:

| Check | Result |
|---|---|
| `fee_rate_sane` | ✅ `platform_fee_rate() = 0.03` |
| `charged_fees_consistent` | ✅ 0 charged jobs whose fee ≠ 0 and ≠ amount×rate |
| `critical_rpcs_present` | ✅ all present |
| `no_stuck_payouts` | ✅ 0 confirmed jobs held >2h without payout |
| `no_unpaid_balances` | ✅ 0 finished jobs with a balance unpaid >3 days |
| `no_underfunded_payouts` | ✅ 0 released jobs paid out while under-funded |
| `no_stuck_signups` | ✅ every signup in the last 7 days got in |

Check 7 going green is worth naming: the Resend SMTP cutover on Aug 30 is holding, and the two client signups this week both got in.

Beyond the seven checks:

- **Orphaned accounts** — none.
- **Under-funded held jobs** — none; no job is at `held` at all.
- **Requests past two re-fires with zero bids** — none. The three requests at `refire_count = 2` all have bids; their problem is picks, not reach (finding 1).
- **`review_status='rejected'` with empty `review_result={}`** — the known open defect is still present. Advisory only, blocks nothing.
- **Active contractors who have never bid** — the majority of the 23. Expected at this stage; not treated as a defect.
- One data defect found, detailed as finding 3.

## 2. Funnel and analytics

Covered above. One thing not to over-read: GA4 and PostHog are both gated behind opt-in cookie consent, so a low pageview number can mean low *consent* rather than low traffic. Read the consent rate before concluding the site is quiet.

## 3. Site and SEO health

**Method note, stated plainly:** the live site could not be fetched this run — `web_fetch` refused every `freddyfixit.ca` URL as outside its provenance set, and per the standing rule I did not route around it with `curl` or a script. So this section is static analysis of a fresh clone at `a9015e1` — which is what Vercel builds from — and not a crawl. Live response codes and rendered head tags were not observed.

Against that clone:

- **Sitemap ↔ routes:** all 18 `/services/*` slugs match `ServiceLanding.tsx` exactly. All 8 `/areas/*` pages plus `/areas` resolve. Every sitemap entry maps to a real route in `App.tsx`. No orphan slugs, no entries pointing at routes that don't exist.
- **`index.html` head:** correct — title, description, canonical, full OG and Twitter sets, and a valid `@graph` JSON-LD carrying `LocalBusiness` (`#business`) and `WebSite` (`#website`, publisher → `#business`).
- **Per-page meta:** every SEO route sets title, description and canonical through the single `upsertMeta` in `src/lib/seo.ts` — **except `/blog`** (finding 5).
- **No thin service pages** found; each of the 18 carries what-we-cover, how-it-works, FAQ and related-services sections with Service + FAQPage JSON-LD.
- **Coverage gap, not a defect:** five client-selectable services have no landing page — Locksmith, Solar, Oil Change, Tire Swap / Rotation, Battery / Brakes. Three of those are the vehicle trades, which is a real search category in Calgary. Worth a future pass.

## 4. Legal and regulatory drift

**No drift.** All four areas checked against the site's current wording; nothing on the legal pages needs to change.

- **Alberta prepaid contracting** — no change. Requirements are as the site states: a business taking payment before work is complete, away from a fixed place of business, for work on private dwellings is a prepaid contracting business and must be licensed and bonded through Service Alberta. Contractor Terms §1.e states this accurately and places the obligation on the contractor.
- **Alberta consumer protection / cancellation** — no change. The 10-day cancellation right, the 30-day non-start / one-year rule, and the 15-day refund window in User Agreement §6.10 all still match the *Consumer Protection Act*. (British Columbia's consumer contract reforms take effect Aug 1, 2026; not applicable to a Calgary-only operation.)
- **Alberta PIPA** — no legislative change. The mandatory review's 12 recommendations went to the Legislative Assembly in Feb 2025, public consultation ran Feb 2 – May 1, 2026, and **no bill has been introduced.** Nothing to act on; worth re-checking each run, since a bill would likely bring breach-notification and vendor-contract obligations that touch the Privacy Policy directly.
- **PIPEDA** — no change.
- **CASL** — no change. The private right of action remains suspended; CRTC enforcement continues. The site's compliance posture is intact: mailing address present on all three legal pages, `List-Unsubscribe` + `List-Unsubscribe-Post` headers set, unsubscribe handled before any auth gate.

**Standing open item — no change.** Prepaid contracting is a licensing obligation, not a wording problem: contractors may each need a Service Alberta licence plus a bond, and the platform itself may qualify as a prepaid contracting business. Still needs a lawyer and Service Alberta.

---

## What to run

Cosmetic — the `/blog` canonical fix. Safe to run as-is:

```
bash ~/freddy-fixit/apply-cosmetic-2026-08-31.sh
```

Substantive — **do not run until reviewed.** This one commits the `withdraw_job` migration to the repo for version control; it does **not** apply anything to the database. Applying it live is a separate step through the payment-change review gate:

```
bash ~/freddy-fixit/apply-withdraw-job-bids-2026-08-31.sh
```

After either, wait for `✅ … pushed`, then hard-refresh with Cmd+Shift+R. If git complains about a lock, prefix the command with `rm -f ~/freddy-fixit/.git/index.lock &&`.

Nothing in this review has been deployed.
