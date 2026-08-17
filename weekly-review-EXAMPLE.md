# Weekly review — 2026-08-17

> **This is a format example, not a real run.** Numbers below are illustrative.
> Delete this file whenever you like; the real reports are named `weekly-review-<date>.md`.

**Verdict:** Nothing is on fire. Health checks 1–7 green.
**Highest-leverage fix:** 11 of 14 requests never reached a second bid. Supply depth, not the website, is the constraint.

---

## 1. Platform health & data integrity

`platform_health_check()` — 7/7 passing.

| Check | Status |
|---|---|
| 1 fee rate sane | pass |
| 2 client_fee matches amount × rate | pass |
| 3 critical RPCs present | pass |
| 4 no stuck confirmed+held payout | pass |
| 5 no_unpaid_balances | pass |
| 6 no_underfunded_payouts | pass |
| 7 no_stuck_signups | pass |

Beyond the health check:

- **2 orphaned accounts** — auth rows with no profile, created Aug 12 and Aug 14. Both are Google one-tap drop-offs. `finish-signup-nudge` has not been run on them. *(Action: dry-run the nudge, listed in installers below.)*
- **1 contractor active with zero bids in 30 days** — UUID `a01c49f7…`. Also still missing `company_name`, a known open item.
- **0 jobs have reached `held`.** Unchanged for 7 weeks. The held → dispute → release path remains production-untested.

## 2. Funnel & analytics

Week of Aug 10–16, with prior week in brackets.

| Stage | Count | Δ |
|---|---|---|
| Signups (client) | 9 | [6] +3 |
| Signups (contractor) | 2 | [1] +1 |
| Requests posted | 14 | [11] +3 |
| Requests with ≥1 bid | 8 | [7] +1 |
| Requests with ≥2 bids | 3 | [4] −1 |
| Requests awarded | 2 | [2] — |
| Jobs scheduled | 1 | [2] −1 |
| Jobs reaching `held` | 0 | [0] — |

**Largest drop-off: ≥1 bid → ≥2 bids (8 → 3).** Clients are being shown a single quote and stalling. Marketing promises 5 estimates.

Breakdown by trade shows all 6 zero-bid requests were Electrical and HVAC — trades where `service_specialty_map` maps narrowly and only 2 and 1 active pros exist respectively.

**Sample caution:** at n=14 requests, a one-week swing of ±2 is not distinguishable from noise. The trade concentration is the durable signal; the week-over-week deltas are not.

## 3. Site & SEO health

- All 19 service pages return 200. Sitemap matches routes; no 404s.
- **4 service pages share the same meta description** (`/services/drywall`, `/painting`, `/flooring`, `/general-repairs`). Cosmetic — fixed in the installer below.
- `/services/hvac` JSON-LD is missing `areaServed`. Cosmetic — fixed below.
- 2 area pages have under 200 words of body copy. Substantive (needs real content, not a template fill) — flagged, no installer.
- No broken internal links.

## 4. Legal & regulatory

- **Alberta prepaid contracting licensing — no change this week.** Still open, still needs a lawyer and Service Alberta. Unresolvable by wording.
- Alberta consumer protection / cancellation rights — no change.
- PIPA / PIPEDA — no change.
- CASL — no change. Mailing address and `List-Unsubscribe` headers still present and correct.

*Legal findings are advisory only. Nothing in this section is ever auto-applied.*

---

## What's ready to run

**Cosmetic** — safe to run without reading the diff:

```
bash ~/freddy-fixit/apply-cosmetic-2026-08-17.sh
```

Carries 5 files: 4 unique meta descriptions, 1 JSON-LD `areaServed` fix.

**Substantive** — read the report section first:

```
bash ~/freddy-fixit/apply-specialty-map-2026-08-17.sh
```

Widens `service_specialty_map` for Electrical and HVAC. **Note:** this one commits the migration for version control only — the DB change itself is applied live via Supabase and is described in the report. Review before running.

## Not actioned, needs your decision

1. Recruit Electrical and HVAC pros — the bid-depth problem is a supply problem and no code change fixes it.
2. Two area pages need real copy written.
3. Seed contractor `a01c49f7…` still has NULL `company_name`.
