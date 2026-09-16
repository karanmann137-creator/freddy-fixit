# Freddy Fix It — weekly review, 2026-09-08

**Yes, something is on fire.** Health check 7 is red: a client who signed up on 2026-09-06 has never confirmed and never signed in, and `auth-rescue` has already spent both of its two automatic attempts, so nothing further will fire on its own.

**Highest-leverage fix:** the `bids_waiting` nudge. Its dedupe key embeds the bid count, so it re-arms only when a *new* bid arrives — never on elapsed time. That makes it permanently silent at exactly the point where the funnel's largest drop-off sits: 9 of 9 requests received a bid, only 3 of 9 were awarded, and 14 bids are stranded across 6 pending requests, two of them un-nudged for 25 and 30 days.

---

## 1. Platform health and data integrity

`platform_health_check()` at 2026-09-08 15:18 UTC — **6 of 7 ok**:

| # | Check | Result |
|---|---|---|
| 1 | `fee_rate_sane` | ok — `platform_fee_rate() = 0.03` |
| 2 | `charged_fees_consistent` | ok — 0 mismatches |
| 3 | `critical_rpcs_present` | ok — all present |
| 4 | `no_stuck_payouts` | ok — 0 |
| 5 | `no_unpaid_balances` | ok — 0 |
| 6 | `no_underfunded_payouts` | ok — 0 |
| 7 | `no_stuck_signups` | **FAIL** — "1 account(s) never confirmed and never signed in (oldest 42h)" |

### FINDING 1 — Live incident: a client is locked out and the automation is exhausted

Auth user `bf7c6463` signed up 2026-09-06 21:44 UTC as a **client**. `email_confirmed_at` is null, `last_sign_in_at` is null, 42 hours elapsed. This is the Aug 2026 lockout shape: the account exists, our welcome mail went out, the confirmation did not land, and nothing on screen anywhere says so.

`signup_rescue_log` shows **2 rescues sent, which is the hard maximum** — last at 2026-09-08 05:37 UTC, kind `stuck`. `rescue_stuck_signups()` will not fire again for this account. A `health_alert` was raised at 2026-09-08 15:00 UTC.

The raw predicate independently returns 1, and `bf7c6463` is the only unconfirmed account in the last 14 days, so the check is not misfiring.

**Recommended action — owner, one command.** `admin_rescue_signup` ignores the two-rescue cap by design and is exactly the break-glass tool for this state:

```sql
select public.admin_rescue_signup('bf7c6463-b078-49c0-928e-d380ad07c9a3', 'apology');
```

Use `apology`, not `stuck` — two automated "check your spam" nudges have already gone unanswered, and the apology variant says plainly that this is our fault, that the link expires in 24h, and to reply for a fresh one. If that also produces nothing, phone or email the address from hello@ directly; a delivery failure past the sender is a place we have no visibility into and cannot retry into. Not executed here: this is an unattended run and the task asks for a report, and a third mail to a person who has ignored two is a judgment call the owner should make.

### FINDING 2 — `trade_reach('Solar') = 0`: a silent matcher black hole

A Solar request today would reach **zero** contractors. No error, no empty state, nothing anywhere says so — this is the documented Locksmith shape recurring: a label that *is* mapped in `service_specialty_map`, but mapped to a specialty no active pro holds, so the "unmapped labels pass through to everyone" fallback never engages.

Six more trades are one deactivation away from the same state:

| Service | `trade_reach` |
|---|---|
| Solar | **0** |
| Air Conditioning | 1 |
| Oil Change | 1 |
| Tire Swap / Rotation | 1 |
| Vehicle Maintenance | 1 |
| Battery / Brakes | 2 |
| HVAC Maintenance | 2 |
| Plumbing Repair | 4 |

Plumbing Repair is the platform's **most-requested** trade (3 of the 6 open pending requests) and reaches 4 pros.

**Recommended action.** Either widen `service_specialty_map` for Solar, or accept that we do not serve it and remove it from the client-facing service list — an unserviceable option on the request form is worse than a shorter form, because it produces a request that silently reaches nobody. Solar is a compulsory-adjacent trade, so widening it into the Handyman bucket is *not* appropriate; recruitment is the real fix. Check `trade_reach(service)` before assuming any trade is covered.

### FINDING 3 — 10 of 22 contractors have `review_status='rejected'` with empty `review_result={}`

Root `CLAUDE.md` records this as "at least one contractor". It is now **10 of 22**. The AI document verdict is not recording, so there is no reason to show the contractor and nothing for the owner to review against. It is advisory-only and blocks nothing, but at 45% of the roster it has stopped being an edge case and is now the normal outcome.

**Recommended action.** Read `review-contractor` v12's deployed source (via `get_edge_function` — the repo copy can lag) and find the path that writes `review_status` without writing `review_result`. Likely an exception branch that stamps the status in its handler and returns before the verdict object is assembled. Substantive, DB/edge — not bundled.

### FINDING 4 — 11 of 22 active contractors have never placed a bid

Half the approved roster has never bid on anything. Combined with Finding 2, the roster is both shallow per trade and half-inert. This is not a defect; it is the recruitment reality, and it is the ceiling on Finding 5 below.

### Nothing found

Zero orphaned auth users (30 auth rows = 30 profiles). Zero stale requests with 2+ re-fires and zero bids. Zero held-and-underfunded jobs. Zero disputed jobs. Zero tables without RLS. All 14 cron jobs active; `platform_mode` is `open`.

Two hardening notes, not incidents: 87 `SECURITY DEFINER` functions pin `search_path` without `extensions` (none of them call unqualified pgcrypto, so none is the signup-killer shape), and 37 of 197 omit `pg_temp`.

---

## 2. Funnel and analytics

**Largest absolute drop-off: bids received → client picks.** Nine of nine requests received at least one bid — matching and dispatch work. Three of nine were awarded.

| Week of | Requests | Got ≥1 bid | Awarded |
|---|---|---|---|
| 2026-07-27 | 3 | 3 | 0 |
| 2026-08-10 | 1 | 1 | 1 |
| 2026-08-24 | 3 | 3 | 1 |
| 2026-08-31 | 2 | 2 | 1 |
| 2026-09-07 | **0** | 0 | 0 |

Downstream is a single thread: 1 job ever scheduled, 1 funded, 1 released, 1 contract signed, 0 reviews.

**Say it plainly: the top of this funnel is a demand problem, not a CRO problem.** One to three requests a week, zero requests and zero signups in the week of 2026-09-07, and a downstream of exactly one job. No button, headline or form change can be distinguished from noise at this volume, and this report will not recommend one.

The pick step is the exception, because the failure there has a *mechanism* rather than a rate.

### FINDING 5 — The `bids_waiting` nudge goes permanently silent on the requests that need it most

`run_reminders()` step 4 builds its dedupe key as:

```sql
v_kind := 'bids_waiting:'||r.req_id||':'||r.bid_count;
```

The bid count is in the key. So the nudge re-arms **only when a new bid arrives**, never on elapsed time. Once bidding stops on a request, the client is told once and then never again — and a request that has stopped attracting bids is precisely the one whose client most needs prompting, because no further bid will ever restart the clock.

Six pending unawarded requests hold **14 bids** between them. All six carry a `pick_token`, so the one-tap `/pick/<token>` link already exists with no login wall:

| Request | Service | Age | Bids | Newest bid | Last nudged | Refires |
|---|---|---|---|---|---|---|
| `7fadb4ff` | General Handyman | 40d | 4 | 28d ago | **2026-08-14 (25d)** | 0 |
| `6e2a3465` | Electrical Work | 38d | 3 | 33d ago | **2026-08-09 (30d)** | 2 |
| `420a4f6c` | Plumbing Repair | 38d | 3 | 8d ago | 2026-09-03 | 2 |
| `f2329c43` | Plumbing Repair | 9d | 2 | 8d ago | 2026-09-03 | 2 |
| `cf954333` | Appliance Repair / Install | 11d | 1 | 10d ago | 2026-09-01 | 2 |
| `24a44198` | Plumbing Repair | 2d | 1 | 1d ago | never | 1 |

`420a4f6c` proves the mechanism exactly: a 38-day-old request was re-nudged on 2026-09-03 **only** because a new bid bumped its count from 2 to 3. The two requests where bidding genuinely stopped — `7fadb4ff` and `6e2a3465` — have been silent for 25 and 30 days with 4 and 3 estimates sitting unread.

**Recommended action, in two parts.**

*Part one — make the nudge re-arm on time as well as on bid count.* Escalate the way step 8 (`balance_owed`) already does, with the stage number in the key rather than the bid count:

```sql
v_kind := 'bids_waiting:'||r.req_id||':'||r.bid_count||':'||v_stage;
```

with `v_stage` derived from the age of the newest bid (48h → 5d → 12d, then stop). That preserves the existing behaviour — a new bid still restarts the sequence — while giving a stalled request three prompts instead of one, and it stops after three rather than mailing forever.

*Part two — hand a genuinely stalled pick to a human.* There is no `escalate_unpaid_balances()` equivalent for picks. A request with bids that is still unawarded after ~14 days should raise a `health_alert` naming the request, the service, the bid count and the client, exactly as `escalate_unpaid_balances()` does at 10 days. Two of the six above would have been surfaced weeks ago.

**Not applied and not shipped as an installer this week.** Step 4 is an email emitter, and the standing rule is not to send bulk email without asking. A change that re-arms a dormant nudge across six requests would, on its first cron pass, mail every one of those clients. That is the owner's call to make, not an unattended run's. The exact edit is above and is a single `CREATE OR REPLACE` on `run_reminders()` applied live via Supabase MCP — DB changes never go through an installer.

---

## 3. Site and SEO health

Service slugs: **18 of 18** consistent between `ServiceLanding.tsx` and `public/sitemap.xml`. Area slugs: **8 of 8** consistent with `AreaLanding.tsx`. Every internal `href` harvested from `src/` resolves to a real route in `App.tsx` — no dead internal links. `index.html` carries exactly one `<title>`, one `<meta name="description">` and one canonical; no duplicates.

Note on method: the site is client-rendered, so per-route titles and meta are set at runtime by `upsertMeta` and a raw HTML fetch of any route returns only the `index.html` shell. This audit was therefore run against repo source, which is the more reliable instrument here, not a fallback.

### FINDING 6 — A published blog post is missing from the sitemap

`blog_posts` holds 12 published rows. `public/sitemap.xml` carries 11 `/blog/*` entries. Missing: **`the-7-c-rule-calgary-winter-tire-timing`**, which is live and reachable.

This is structural, not a one-off. `newsletter-send` auto-publishes a `blog_posts` row when `blog_title` is set — it writes the row and nothing writes the sitemap entry, so every future newsletter-published post will be invisible to crawlers the same way. There are 12 more queued issues (contractor 7, client 5).

**Recommended action, cosmetic — queued, not shipped this week.** Add one line to `public/sitemap.xml` before `</urlset>`:

```xml
  <url><loc>https://freddyfixit.ca/blog/the-7-c-rule-calgary-winter-tire-timing</loc></url>
```

The durable fix is to generate the `/blog/*` block of the sitemap from `blog_posts` rather than maintaining it by hand; that is substantive and belongs in its own change.

### FINDING 7 — The sitemap has no `<lastmod>` on any of its 64 entries

Crawlers get no recrawl signal, so updated service and area pages are re-fetched on the crawler's own schedule rather than ours. Low impact at current traffic, but free to fix and it compounds. Fold into the same generated-sitemap change as Finding 6.

### FINDING 8 — Documentation drift in `src/CLAUDE.md`

`src/CLAUDE.md` line 6 lists `/contractors` (Browse) as a public route, and lines 15 and 35 describe `pages/BrowseContractors.tsx`. **Neither exists** — there is no such file and no such route in `App.tsx`. Root `CLAUDE.md` also says "19 service slugs"; there are 18.

These files are the authoritative record a future session reads before touching anything, and the standing instruction is to keep them current. A route documented as existing is the kind of drift that produces a broken internal link the next time somebody adds a nav item in good faith.

**Recommended action, cosmetic — queued.** Delete the `/contractors` entry from the route list and the two `BrowseContractors.tsx` bullets in `src/CLAUDE.md`; correct "19" to "18" in root `CLAUDE.md`.

---

## 4. Legal and regulatory drift

### FINDING 9 — The standing prepaid-contracting item is no longer "no change"

The **Prepaid Contracting Business Licensing Regulation, Alta Reg 185/1999** carried an expiry of **June 30, 2026** — now past — and was amended in 2025 by **Alberta Regulation 74/2025**. Every prior run of this review recorded "no change" on this item. That answer is stale as of this week.

The live Alberta.ca prepaid contracting licence page (meta-published 2026-05-15) still describes the regime in force, and the two-part test is unchanged: a prepaid contracting business both solicits, negotiates or concludes agreements **in person away from its place of business**, *and* **accepts money before the work is complete**. Freddy Fix It does the second on every job. Exemptions are commercial buildings, contractor-to-subcontractor work, Alberta New Home Warranty with pre-possession and deposit insurance, National Home Warranty, and licensed water wells — none of which covers residential home services.

Licensing requires a criminal record check, a security (bond), copies of standard contracts, and a fee; records must be kept 3 years. The page cross-references CPA ss. 26–34 (cancellation) and s. 35 (required contents of sales contracts).

Also noted: **no in-home solicitation of furnaces, air conditioners, water heaters, windows or energy audits without an express prior invitation.** Nothing on the platform does in-home solicitation today, but Air Conditioning and Windows & Doors are both live service labels and any future door-knocking or in-home upsell flow would land directly on this prohibition.

**Recommended action.** This is a **licensing** obligation, not a wording problem, and it cannot be resolved by editing a legal page. What changed this week is that the governing regulation has been amended and its old expiry has passed, which makes this the right moment to take it to a lawyer and Service Alberta rather than carrying it forward as an open item for another quarter. Two questions to put to them: whether each contractor needs their own licence and bond, and whether the platform itself qualifies as a prepaid contracting business. **No legal page was edited and none should be until that answer exists.**

### No change

**Alberta cancellation rights — no change.** 10 days from receipt of the contract copy with no reason required; 1 year where goods or services are not delivered within 30 days of the contract date; refund due within **15 days**. This continues to match UserAgreement §6.10 and the platform's existing 15-day refund path and the `contract_copy_sent_at` audit stamp the 10-day clock runs from.

**CASL, PIPEDA and Alberta PIPA — no enacted change.** CASL still requires consent, sender identification and a working unsubscribe honoured within 10 business days, penalties to $10M; the platform's mailing address, `List-Unsubscribe` / `List-Unsubscribe-Post` headers and pre-auth unsubscribe handling remain compliant. Bill C-27 / CPPA is still pending. Further AB and BC PIPA amendments are anticipated but not enacted.

---

## Judgment calls made in this unattended run

**No cosmetic installer this week.** Health check 7 is red with a real locked-out client. The skill is explicit that a live incident stops the cosmetic auto-apply: do not ship copy tweaks during an outage. Findings 6, 7 and 8 are cosmetic and are queued with their exact changes above; bundle them next week if check 7 is green.

**Nothing was applied live and no email was sent.** The `run_reminders()` step 4 change (Finding 5) touches an email emitter that would, on its first pass, mail six clients — that needs the owner's yes. `admin_rescue_signup` (Finding 1) is a third message to someone who has ignored two automated ones. Both are reported with the exact command rather than executed.

## Owner actions, ranked

1. Rescue the locked-out client — `select public.admin_rescue_signup('bf7c6463-b078-49c0-928e-d380ad07c9a3', 'apology');`
2. Say yes or no to the `bids_waiting` escalation (Finding 5). 14 estimates are sitting unread across 6 requests; two clients have heard nothing for 25 and 30 days.
3. Decide Solar: recruit for it or remove it from the request form (Finding 2).
4. Take the prepaid-contracting licensing question to a lawyer and Service Alberta (Finding 9).

No installer scripts were produced this week.
