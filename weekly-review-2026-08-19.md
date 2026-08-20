# Freddy Fix It — weekly review, 2026-08-19

**Nothing is on fire.** All seven platform health checks are green, no money is at risk, and no signup is stuck.

**Highest-leverage fix: pick up the phone.** The platform's only live job has sat seven days waiting for the contractor to type a price, and three clients are sitting on 2–4 estimates each that they have never chosen from — the oldest for twenty days. Nothing is broken. People are just not finishing.

Run against fresh clone `0386c0b` (2026-08-19 10:37). Repo state includes yesterday's nav/band-rhythm work.

---

## 1. Platform health — all green

`platform_health_check()`, all seven by name:

| check | result |
|---|---|
| fee_rate_sane | ok — `platform_fee_rate()` = 0.03 |
| charged_fees_consistent | ok — 0 jobs with a mismatched fee |
| critical_rpcs_present | ok — all present |
| no_stuck_payouts | ok — 0 confirmed jobs held >2h without payout |
| no_unpaid_balances | ok — 0 finished jobs with a balance unpaid >3 days |
| no_underfunded_payouts | ok — 0 released jobs paid out while under-funded |
| no_stuck_signups | ok — every signup in the last 7 days got in |

The failure shapes the health check does not cover:

- Orphaned accounts (auth user, no profile): **0**
- Requests pending past two re-fires with zero bids: **0**
- Jobs at `held` with `funded_amount < total_charged`: **0**
- Jobs stuck in `processing` past the 3h window: **0**
- Active contractors who have never bid: **1** (`4911d340`) — not a defect, just a quiet pro

Worth stating plainly because it frames everything below: **`job_contracts` still has 0 rows and `funded_amount` has never been non-zero.** No agreement has ever been signed and no dollar has ever moved through the platform. The held → dispute → release path remains production-untested.

---

## 2. Findings, ranked

### 2.1 The funnel dies at "someone has to choose" — not at matching

All time: **5 requests → 5 received at least one bid → 1 awarded → 0 ever scheduled → 0 ever paid.** Median bids per request is **3.0**.

Matching works. Every single request got estimates. What does not happen is the client coming back to pick:

| request | service | age | bids | re-fires |
|---|---|---|---|---|
| `7fadb4ff` | General Handyman | 20 days | 4 | 0 |
| `420a4f6c` | Plumbing Repair | 18 days | 2 | 2 |
| `6e2a3465` | Electrical Work | 18 days | 3 | 2 |

The largest absolute drop between adjacent stages is **bids received → awarded: 5 → 1**. That is the stage to fix, and it is not a reminder problem — `bids_waiting` exists, is emitted by `run_reminders`, and fired **6 times in the last 30 days**. The nudge is landing and not converting.

This is nine estimates from real contractors sitting unanswered. Recommendation: phone these three clients personally and ask what stopped them. Three conversations will tell you more than any amount of instrumentation at this volume, and it is the only way to learn whether the blocker is price, trust, or simply that the job got done elsewhere.

**Sample-size honesty:** five requests cannot distinguish a real effect from noise. Do not redesign anything on this data. The top of the funnel is the actual constraint — see 2.2.

### 2.2 Traffic is the constraint, and this week it was zero

- Signups this week: **0** (previous week 2; last 30 days 19)
- Requests posted this week: **0** (previous week 1; last 30 days 5)

A funnel with nothing entering it is a demand problem, not a conversion problem. No button, headline or layout change is worth doing until requests are arriving. The SEO items in section 3 are the cheap end of fixing that; contractor-side recruitment and Google Business Profile are the expensive end.

### 2.3 The one live job has been stalled seven days on a missing price

Job `d4276678`, assigned **Aug 12**, still `status=assigned`, `payment_status=unpaid`, and **`amount` is NULL**.

`contract_ready()` returns: *"Add your price to this job first — the agreement has to show what the client is agreeing to pay."*

So the contractor won the job and never entered a price. The `estimate_owed` nudge fired **twice** and did not move them. The pro does have payouts enabled, so nothing structural is blocking them.

This single job is also what stands between you and the outstanding *"one real end-to-end live payment run"* item. Recommendation: contact this contractor directly. If they have gone cold, the client should be released back to the other bidders.

### 2.4 The AI document reviewer is rejecting every contractor who uploads documents, and recording no reason

`CLAUDE.md` describes this as an occasional defect. It is not occasional — it is total.

- Contractors with `review_status='rejected'` **and** an empty `review_result={}`: **9**
- Contractors with `review_status='rejected'` and a populated `review_result`: **0**
- Contractors with any documents on file: **9**

The overlap is exact. **Every contractor who has ever uploaded a document has been rejected with no reason recorded.** All nine are `status='active'` — you approved them by hand anyway, which is why this has stayed invisible.

Impact is limited because `review-contractor` is advisory and never touches `contractors.status`. But the admin vetting panel is showing a bare red "rejected" with no explanation for every documented pro on the platform, which makes the panel worse than useless during vetting — it is actively misleading.

**Substantive; no installer this week.** This is an edge-function defect (`review-contractor` v11) and edge changes do not ship through installers. It needs a session that reads the function, reproduces one call, and finds why the verdict is not persisting. Recommend making that next week's single substantive task.

### 2.5 Two scheduled jobs are switched off

From `cron.job`:

| job | schedule | active | last run |
|---|---|---|---|
| `refire-stale-requests` | `22 * * * *` | **false** | 2026-08-15 |
| `newsletter-client` | `0 16 * * 4` | **false** | 2026-08-13 |
| `escalate-unbid-requests` | `7 * * * *` | **false** | — |

Everything else (`daily-reminders`, `reconcile-payouts`, `platform-health-check`, `visit-reminders`, `release-unconfirmed-visits`, `auto-confirm-stale-jobs`, `newsletter-contractor`) is active, and there were **zero cron failures in the last 7 days**.

`refire-stale-requests` being off is the one that costs you something: stalled requests get no nudge. Practical impact right now is small — two of the three pending requests already hit the two-nudge cap, and the third has four bids so it would not qualify — but it is a silent regression that will matter the moment volume picks up.

`newsletter-client` being off means **5 client subscribers and 7 queued issues** are going nowhere while the contractor newsletter (20 subscribers) still sends every Tuesday.

**I have not re-enabled either.** Both are live DB writes I was not asked to make, and re-enabling the newsletter would send bulk email, which is off-limits without your say-so. If these were deliberate, ignore this. If not, the commands are:

```sql
-- re-enable the stalled-request nudge (safe, no email to clients)
select cron.alter_job((select jobid from cron.job where jobname='refire-stale-requests'), active := true);

-- re-enable the Thursday client newsletter (THIS SENDS EMAIL — only if you mean it)
select cron.alter_job((select jobid from cron.job where jobname='newsletter-client'), active := true);
```

### 2.6 Seven of eleven active contractors cannot be paid, so they cannot send an agreement

Only **4 of 11** active contractors have `stripe_payouts_enabled`.

Since the 2026-08-16 change, `contract_ready()` requires a payout account before an agreement can be sent. That is the right design — it stops a client paying for a job whose pro has nowhere to receive money. But it means **7 of your 11 active pros will hit a hard stop the moment they win a job.**

No such job exists today, so this is not an incident. It is a cliff you will walk off the first time one of those seven wins work. Recommendation: the contractor dashboard already itemises what Stripe wants; a direct nudge to those seven before they win a job is cheaper than explaining it to them mid-job.

---

## 3. Site and SEO health

Structurally sound. The 18 service slugs in `ServiceLanding.tsx`, the 8 area slugs in `AreaLanding.tsx` and the 14 hardcoded blog slugs all appear in `public/sitemap.xml` with no orphans and no dead entries. `robots.txt` correctly disallows the three dashboards and `/auth/`. Homepage returns 200 with a canonical, a full Open Graph set and LocalBusiness JSON-LD.

Three real gaps, all cosmetic and all in this week's installer:

**3.1 Nine auto-published blog posts are invisible to search engines.** `newsletter-send` auto-publishes a `blog_posts` row whenever an issue has a `blog_title`, but `public/sitemap.xml` is a static file listing only the 14 hardcoded slugs. There are **9 DB-published posts** absent from it — the newest published **yesterday**. That is roughly 39% of your blog reachable only by crawling the `/blog` index. Fixed this week by listing them.

Note the fix is a treadmill: a new post appears every ~5 days and the static sitemap will drift again. Generating the sitemap at build time from `blog_posts` is the durable answer, but that is a build-step change — substantive, not shipped, worth doing properly later. Until then this weekly review can top it up.

**3.2 `/contractor-guide` was not in the sitemap.** A public, twelve-section content page that is your main contractor-recruitment asset, invisible to search. Added.

**3.3 Social meta contradicted every landing page.** `index.html` claimed *"up to 3 fixed-price quotes"* in `og:description`, `twitter:description` and the LocalBusiness JSON-LD, while `ServiceLanding.tsx` (6 places) and `AreaLanding.tsx` say *"up to five estimates"* — which is the documented marketing line. The `description` meta also claimed *"have AI match you to your ideal contractor"*, which is not what happens: contractors bid and the client picks, and the admin-assign path was removed. Both corrected to "up to five estimates" / "choose the one you want".

---

## 4. Legal and regulatory drift

**Alberta prepaid contracting — this one moved, and it needs a phone call.** The *Prepaid Contracting Business Licensing Regulation* (Alta Reg 185/1999) carried an expiry date of **June 30, 2026**, subject to review for "ongoing relevancy and necessity, with the option that it may be repassed in its present or an amended form." That date has now passed and I could not confirm from public sources whether it was repassed, amended or allowed to lapse.

This is the standing open item, but it is no longer "no change" — the governing regulation's status is now genuinely unknown, and Freddy Fix It collects a 40% deposit before work on every job. Recommendation: call **Service Alberta and Red Tape Reduction at 1-877-427-4088** and ask directly what the current licensing requirement is for (a) contractors taking deposits and (b) a platform that collects deposits on their behalf. That is a fifteen-minute call that resolves an item that has been open for months. It does not replace the lawyer, but it will tell the lawyer what to look at.

**CASL — no change.** The private right of action remains indefinitely suspended; enforcement stays with the CRTC, Competition Bureau and Privacy Commissioner. The current posture (mailing address in the footer, `List-Unsubscribe` plus `List-Unsubscribe-Post`, unsubscribe handled before any auth gate, un-prechecked opt-in) remains correct.

**Alberta PIPA — no change.** No amendment bill has been introduced. The Standing Committee's 12 recommendations from February 2025 remain recommendations, with government engagement running through Spring 2026. One to watch is the OIPC's proposal that valid consent require comprehensive, specific, plain-language notice of every purpose — if that becomes law it would touch the privacy policy's disclosure of Stripe, Supabase, Vercel, Resend, Google and Komoot. Nothing to do today.

**Alberta consumer protection / cancellation rights — no change found.** §6.10 and the 15-day refund path still read correctly against current rules.

No legal page was edited. Per standing rule, drift is reported only.

---

## 5. Housekeeping

`src/CLAUDE.md` and `supabase/CLAUDE.md` have drifted badly from reality. `supabase/CLAUDE.md` still documents `place_bid` as enforcing "max 3 bids" (the real cap is 7), describes a `jobs` table with none of the payment columns, and lists three storage buckets of the six that exist. `src/CLAUDE.md` lists a public `/contractors` browse route that is not in `App.tsx`. Root `CLAUDE.md` is current and excellent; the two children are stale enough to mislead a future session that trusts them. Worth a rewrite pass when there is a quiet week.

---

## What to run

One installer this week, cosmetic only. It carries **two files** (`index.html`, `public/sitemap.xml`), built from fresh clone `0386c0b`, byte-level round-trip verified, `bash -n` clean, secret-scanned.

```
bash ~/freddy-fixit/apply-cosmetic-2026-08-19.sh
```

Wait for `✅ cosmetic SEO + meta copy pushed`, then hard-refresh with Cmd+Shift+R. If git complains about a lock, run it as:

```
rm -f ~/freddy-fixit/.git/index.lock && bash ~/freddy-fixit/apply-cosmetic-2026-08-19.sh
```

Nothing here is deployed until you run that and Vercel finishes building.

No substantive installer this week. The two substantive findings — the AI reviewer recording no verdict (2.4) and the disabled cron jobs (2.5) — are a live edge-function change and live DB writes respectively, neither of which ships through an installer, and both of which should be a deliberate decision rather than something bundled into a weekly cosmetic run.

## The three things worth your time this week

1. Phone the three clients sitting on unpicked estimates, and the contractor sitting on the unpriced job. Four calls.
2. Call Service Alberta about prepaid contracting licensing. One call, closes a months-old open item.
3. Decide whether the two disabled cron jobs were deliberate.
