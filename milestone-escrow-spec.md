# Milestone Escrow for Big Jobs — Implementation Spec

**Goal:** Let clients pay for large jobs (quote **> $2,000**) in staged, escrow-protected milestones instead of one big upfront charge. Contractor gets paid as each stage is approved; client only releases against completed work; the platform keeps its escrow protection and its economics unchanged.

Small jobs (≤ $2,000) are untouched — they keep today's single charge → hold → release flow.

---

## How it works (the journey)

1. **Contractor quotes a big job.** On any job whose agreed price is over $2,000, the quote form gains a **milestone builder**: 2–5 stages, each with a title and dollar amount. The amounts must sum to the quote. A sensible default is auto-suggested (e.g. Deposit 20% / Rough-in 30% / Substantial 30% / Final 20%), which the contractor can edit.
2. **Client approves the schedule.** The client sees the stages and totals and approves the plan (one tap). Nothing is charged yet.
3. **Fund-as-you-go, stage by stage.** For each milestone in order:
   - Client clicks **"Fund this stage"** → Stripe Checkout for *that milestone's* amount + 3% service fee. Funds are **held** on the platform balance (same as today).
   - Contractor does the work and marks the stage complete (with a photo, like the current completion flow).
   - Client **approves the stage** → that milestone's 93% is transferred to the contractor; the platform keeps 7%. If the client does nothing, the stage **auto-approves after 3 days** (same safety net as today, per milestone).
   - The next stage unlocks for funding.
4. **Job completes** when the final milestone is released. Review/rating flow runs as it does now.

Client never fronts the whole amount; contractor is paid progressively; every dollar is still held in escrow until that specific stage is approved.

---

## Data model

New table **`job_milestones`**:

| column | notes |
|---|---|
| `id` uuid PK | |
| `job_id` uuid FK → jobs | |
| `seq` int | 1..N, ordering |
| `title` text | e.g. "Rough-in" |
| `amount` numeric | the milestone's quote portion |
| `client_fee` numeric | 3% of amount (0 if waived) |
| `contractor_payout` numeric | 93% of amount |
| `platform_fee` numeric | 7% of amount |
| `status` text | `pending` → `funded` → `completed` → `released`; plus `disputed` |
| `stripe_session_id` / `stripe_payment_intent` / `stripe_transfer_id` | Stripe references |
| `completed_at` / `completed_photo` / `funded_at` / `released_at` | timestamps + proof |

Jobs table gains: `is_milestone bool`, `milestone_schedule_status` (`proposed`/`approved`), and reuses existing `amount` as the grand total. Existing single-charge columns stay for small jobs.

---

## Money flow (unchanged economics, applied per stage)

Per milestone: client pays `amount + 3%`, held; on approval `93%` → contractor, `7%` kept. Summed across stages this is **identical** to charging the whole job once — same 3% client fee, same 7% commission. This reuses your existing rate source (`platform_fee_rate()`), hold logic, and `release-payment`'s idempotent transfer (keyed per milestone instead of per job).

---

## Backend changes

- **`create-milestone-payment` (new edge fn)** — like `create-payment-intent` but charges one milestone; enforces order (can't fund stage N+1 until stage N is released) and that the schedule is approved.
- **`release-payment` (extend)** — accept an optional `milestone_id`; transfer that milestone's `contractor_payout` with idempotency key `payout_<milestone_id>`. Job-level path stays for small jobs.
- **`stripe-webhook` (extend)** — on `payment_intent.succeeded`, mark the milestone `funded` (matched via metadata).
- **`reconcile-payouts` + auto-confirm cron (extend)** — operate per approved-but-unreleased milestone, so the 3-day auto-approve + payout safety net covers milestones too.
- **RPCs:** `propose_milestones(job, [{title,amount}])`, `approve_milestone_schedule(job)`, `complete_milestone(milestone, photo)`, `approve_milestone(milestone)` (drives release), all `SECURITY DEFINER` with the usual auth checks.

## Frontend changes

- **ContractorDashboard:** milestone builder in the quote form (only shows when quote > $2k); per-stage "mark complete + photo" on the job card.
- **ClientDashboard:** approve-schedule step; a stage list showing status, a "Fund this stage" button on the current stage, and "Approve & release" per completed stage; receipt shows the per-stage fee.
- **AdminDashboard:** milestone view for oversight + manual release.

---

## Decisions (defaults I'll use unless you say otherwise)

1. **Funding model: fund-as-you-go** (client pays each stage just before it starts). *Alternative: fund the whole job upfront, release per stage — simpler but doesn't solve client cash-flow, which was your reason for choosing milestones.*
2. **Threshold: > $2,000.** Below that, no change. Milestone jobs allow 2–5 stages.
3. **Fees: proportional per stage** (3% + 7% on each milestone) → total economics identical to today.
4. **Auto-approve: 3 days per stage** (matches the current job auto-confirm), with the reconcile-payouts safety net extended to milestones.
5. **Disputes:** a client can dispute an individual milestone; only that stage's funds freeze (`disputed`), the rest of the schedule pauses until resolved. Reuses your existing dispute machinery, scoped to a milestone.
6. **Referral 3% waiver:** applies to the **first funded milestone only** (not every stage), so a referred client's reward isn't multiplied across stages.

---

## Rollout & safety (money code)

- Build and test all DB + edge changes on a **Supabase branch** first, verify a full multi-stage flow end-to-end in **Stripe test mode**, then merge to production.
- Fully **backwards compatible**: existing and small jobs keep the current single-charge path untouched; `is_milestone` gates the new flow.
- Frontend + edge-function *source* ship via the usual installer; DB migrations + edge deploys applied live via Supabase.

## Build phases

1. DB: `job_milestones` table + job flags + RPCs (on a branch).
2. Edge: `create-milestone-payment`, extend `release-payment` / `stripe-webhook` / `reconcile-payouts`.
3. Frontend: contractor milestone builder → client fund/approve UI → admin oversight.
4. End-to-end test in Stripe test mode, then production merge + deploy.
