# Job shapes, price changes & multi-visit — spec

**Status: proposal, 2026-11-07. Nothing here is shipped.** Written from an audit of the
live DB, the deployed edge functions and `src/` — not from the docs. Where this file and
the code disagree, the code wins.

**Read this section before building anything below.** The audit turned up a result that
changes the whole shape of the work: **most of the money machinery for mid-job price
changes is already built and has never been used on a real job.** `jobs` is at 1 row;
`job_expenses`, `job_milestones` and `recurring_prepayments` are at 0; the `price_change`
notification type has never fired once. So the job here is mostly **finishing, exposing and
documenting** what exists — not building it. Four of the six asks are already code.

---

## 1. The six asks, answered

| Ask | Verdict | What's actually true |
|---|---|---|
| Faster payment processing? | **Mostly no** | ~2 days is recoverable from our side. The dominant 2–7 days is Stripe's and is not ours to shorten. Detail in §6. |
| Disclaimer when posting a job | **Absent — build it** | The client sees only a User Agreement checkbox and a "this is a guide, not a quote" line on the budget picker. Nothing anywhere warns the price can move after they approve it. |
| Multiple visits / day-1 + day-2 hours | **Absent — the real build** | `jobs.scheduled_at` is a single scalar. 15 per-job scheduling stamps, one photo pair per job, one-shot reminder claims. This is the largest piece of work in this spec. |
| Pro uploads material invoices + hours, updates price | **Half built** | The price-update path is complete and good (`propose_price_change` → `adjust-payment`). The **evidence** half is missing: `job_expenses` has no file column and is explicitly contractor-only ("Clients NEVER see this"), and `job_time_logs` is not linked to a price proposal. |
| Disclaimer to the client when the price changes | **Partially built, and the email is broken** | The in-dashboard panel is decent. The email is the thin generic one, and the rich email the DB tries to send **does not exist** — deployed `notify-email` v15 has no `price_change` branch and returns `{status:"ignored"}`. |
| Keep 40% deposit regardless; recalc fee on new total; update contracts | **Money: already true. Contract: a real gap.** | See §2 — this one needs a correction. |

### 1a. A correction on the fee, because the number matters

The ask said "if price is changed then calculate 7% off of new total". There are two rates
and they sit on opposite sides of the ledger:

- **3%** is the **client** service fee (`platform_fee_rate()`), paid by the client on top of
  the job price.
- **7%** is the **platform commission** (`platform_commission_rate()`); the contractor
  receives 93% of the final job price.

Both already compute off the **final** amount, not the original estimate. The instinct was
right; it's the client-side 3% that gets topped up, and the 7% follows automatically because
`contractor_payout` is rewritten on every adjustment.

### 1b. "Keep the 40% deposit regardless" is already true by construction

`create-balance-payment` (deployed v8) derives the balance server-side as
`total_charged − funded_amount`. It never re-reads a rate and never recomputes the deposit.
So when a price rises mid-job:

- the deposit already collected stays exactly as collected — not topped up, not recomputed;
- the entire increase, fee included, lands in the **balance**;
- on a **part-funded** job, `fully_funded` (a **generated** column:
  `total_charged IS NOT NULL AND funded_amount >= total_charged − 0.01`) flips to `false` the
  instant `total_charged` rises, so payout guards 1 and 2 start biting with no code change.

**The two branches behave differently and it matters.** `adjust-payment` only applies a new
price directly on the **part-funded** branch. On a **fully-funded** job it returns a Stripe
Checkout URL and **writes nothing** — the price is applied by `stripe-webhook` only after
the top-up is actually paid. So a fully-funded job at `pending_confirmation` stays
fully funded **at the old price** and is blocked purely by `price_change_pending`, not by
funding. Only the part-funded case "un-funds" the job. Either way, nothing explains the
blocked state to either party today — see **W3**.

---

## 2. The contract is the highest-risk gap in this spec

`public.build_contract_body_internal(p_job_id)` generates the Service Agreement in SQL. Its
sections are: header → Scope of work → Price & payment → Permits & certification →
Your cancellation rights (Alberta) → governing law.

**The agreement contains zero words about the price changing.** Not about scope creep, not
about materials, not about extras, not about the deposit being kept. The `## Price & payment`
section states a specific job price, a specific fee and two specific instalments as settled
facts.

Worse, `void_contract_on_price_change` **returns early unless `payment_status = 'unpaid'`**.
So the exact case this spec is about — a price raised on a **held** job, after the deposit —
leaves the client holding a signed agreement that names the **old** price and the **old**
total, with nothing anywhere recording the new one. `create-balance-payment` then charges
them against it.

This is the one item here that is not merely unfinished but actively wrong, and it is a
legal exposure rather than a UX one. Alberta prepaid-contracting rules require a written
copy stating what will be collected and when; `jobs.contract_copy_sent_at` is the audit
timestamp the client's 10-day cancellation clock runs from. A mid-job raise means the
document they hold no longer states the amount being collected.

Compounding it: our own cancellation clause promises to refund **"any funds still held"** on
a valid cancellation. "Keep the 40% deposit regardless" may not be enforceable against a
clause we wrote ourselves. **Lawyer, not developer** — see §7.

---

## 3. Every job shape, and the comms that go with it

This is the matrix the ask called for. "Scale" maps to the interface tiers in §5.
Shapes 1–8 are the normal lifecycle; **9–20 are the ones that today strand a user**, and
shapes 15–20 were added after an independent review found the first draft had missed them.

### Normal shapes

| # | Shape | Money | Visits | What the client must be told, and when |
|---|---|---|---|---|
| 1 | **Micro fix** (<$300) — faucet, outlet, toilet flapper | Single charge or 40/60 | 1 | Keep it minimal. Price-can-change line at posting. No breakdown theatre. |
| 2 | **Standard job** ($300–$2k) — firm quote off photos | 40/60 | 1 | Full quote breakdown at approval + price-can-change disclaimer **on the approve button**, not buried. |
| 3 | **Materials-dependent** — price depends on parts bought on the day | 40/60, balance absorbs the delta | 1 | At approval: "your pro will confirm material cost on the day". On change: the new email (**W3**) with invoice evidence attached (**W2**). |
| 4 | **Diagnostic-first** (`subject_to_inspection`, `callout_fee`) | Callout fee, then a real quote | 1–2 | Already flagged in the UI as a display note only. Needs: "today's visit is a diagnosis; the repair is quoted after." The second trip here is the commonest multi-visit case and the one most likely to strand someone today. |
| 5 | **Multi-day, one price** ($2k–$10k) — reno, fence, flooring | 40/60, one balance at the end | 2+ | Per-visit schedule, per-visit hours, one price. **Needs W1.** Client needs a "what's happening on each day" view, not one date. |
| 6 | **Staged / milestone** (>$2k) — phased work | Per-stage, held per stage | per stage | Already built (`MilestonePanel`, threshold `$2,000`). Each stage funded and released on its own; `fully_funded` is false by design. Comms exist per stage. |
| 7 | **Recurring / maintenance** — snow, lawn, cleaning | Per-visit, or a prepaid pool | many, each its own job | Each occurrence is a **separate job**, not a visit. Pool money never touches `funded_amount`. |
| 8 | **Emergency / urgent** | Same as 1–3 | 1 | Compressed comms; price-change risk is *highest* here because nobody quoted off photos. Say so explicitly. |

### The shapes that strand people today

| # | Shape | What happens now | What it needs |
|---|---|---|---|
| 9 | **Price rises mid-job, job already held** | Works, but: contract not voided (§2), email is the generic one, no evidence, and the job silently becomes un-fundable until the client approves | W2 + W3 + W4 |
| 10 | **Price rises and the client goes quiet** | `create-balance-payment` **409s on any pending price change**; `auto_confirm_stale_jobs` filters `price_change_pending is null`; `confirm_job_completion` blocks. `run_reminders` **step 6** does nudge at 48h — but it's **one email, dedupe-keyed on `proposed_at`, with no ladder and no expiry**. The proposal simply never dies. | Expiry + escalation (**W5**) — build on step 6, don't duplicate it |
| 11 | **Price falls / partial cancel** | `adjust-payment` refunds newest-first and decrements `funded_amount`. Production-untested. | Test coverage (**W6**) |
| 12 | **Pro returns to finish — no new money** | No model for it. The pro must either leave the job open (no reminder fires for visit 2) or mark complete and lose the slot | W1 |
| 13 | **Warranty / rework return** | No model. Would have to be a new job at $0 | W1, or an explicit `revisit` reason |
| 14 | **Client declines the raise — on an UNPAID job** | Works: `decline_price_reopen` cancels the job, reopens the request, re-pends the other bids — but **wipes `price_hike_from/reason/at` plus `price_change_pending`**, destroying the record of why it fell apart | Price history table (**W4**) |
| **15** | **Client refuses the raise — on a HELD job** | **Nothing happens. There is no exit.** `decline_price_reopen` guards through `job_money_block()`, which refuses outright for `payment_status in ('held','released','disputed')`. So the job cannot be confirmed, cannot be funded, cannot be declined and cannot be deleted. **This is the single worst stranding case on the platform and it is the exact case this spec is about.** | **W5 — and it is now the critical path** |
| 16 | **Pro abandons a held job mid-way** | Same dead-end from the other side: `job_money_block` refuses every destroy path and there is no pro-side exit. No shape, no comms, no refund route. | W5 (shared unwind path) |
| 17 | **Dispute raised while a change is pending** | `adjust-payment` requires `held` and `propose_price_change` refuses `disputed`, so the pending jsonb is **stuck forever** — and auto-confirm keeps skipping the job even after the dispute resolves | W5 must clear the jsonb on dispute entry |
| 18 | **Pro's `stripe_payouts_enabled` goes false mid-job** | `contract_ready`'s fifth reason exists for this, but `create-balance-payment` checks `contract_signed`, **not `contract_ready`** — so which surfaces re-check needs confirming before relying on it | Audit the re-check; comms for the pro |
| 19 | **Price changes between visit 1 and visit 2** | Undefined. Balance collection 409s while the pro is still returning, and nothing says whether visit 2 proceeds | The W1 × W5 interaction — decide explicitly |
| 20 | **Pro wants to appeal a declined change, or be paid for work already done** | No model for either. A job that unwinds mid-work pays the pro nothing | Policy decision first (§9) |

---

## 4. Workstreams, ranked

Ranked by risk removed per unit of effort, not by how interesting they are. **Every entry
states which of the four payout guards it touches**, per the standing money rule. "None"
means the change cannot move money and the guards are untouched — which is the goal for
most of this list.

### W0 — Contract: add an "If the price changes" clause. Do this first.

**Guards touched: none.** No money code moves.

Three edits, all to inline string literals, all applied **live via Supabase MCP** (the
contract body is a SQL function; installers don't apply DB changes):

1. `build_contract_body_internal` — new `## If the price changes` section after
   `## Price & payment`. It must state: that the price can change if the scope or materials
   differ from the estimate; that **no change takes effect without the client's approval**;
   that the deposit already paid is not re-collected and the increase lands in the final
   payment; that the service fee is recalculated on the final price; and that declining a
   change cancels the job and refunds funds still held.
2. The same wording is **hand-duplicated** in `notify-email`'s `contract_copy` branch
   (deployed v15). Two copies to keep in step — change both in the same pass or the emailed
   written copy and the signed agreement will disagree, which is the exact document Alberta
   cares about.
3. Decide the `void_contract_on_price_change` question (§7, Q1). The cheap, defensible
   interim: on a **held**-job raise, don't void the signature, but **stamp an addendum** —
   see W4 — and re-send the written copy so the client holds a document naming the real
   amount. Voiding a signature on a job that already has a held deposit would make the job
   unpayable via the fail-closed 428 gate, which is a worse failure than the one it fixes.

### W1 — Multi-visit scheduling

**Guards touched: none** (if, and only if, visits carry no money of their own — see below).

The decision already taken: **small jobs get scheduling-only visits; large jobs get
milestone-per-visit.** That's the right split and it keeps money out of W1 entirely. Large
jobs reuse `job_milestones`, which is already built, already has a per-stage completion
photo column, and is already escrowed per stage.

For the scheduling-only half, a new table:

```
job_visits(id, job_id, seq, scheduled_at, status,
           client_approved_at, client_confirmed_visit_at,
           visit_reminder_sent_at, hour_reminder_sent_at,
           on_my_way_at, slot_released_at, slot_released_from,
           before_photo_path, after_photo_path, notes)
```

`jobs.scheduled_at` stays, redefined as **"the next unfinished visit"**, maintained by
trigger. That keeps every existing reader working instead of requiring a sweep of 15 columns
and every surface that reads them.

What breaks if you skip the redefinition, each silently and with no error:

- `visit-reminder` (v8) claims `hour_reminder_sent_at` **once per job** before sending, so
  **visit 2 never gets a T-1h reminder.**
- `release_unconfirmed_visits()` computes its deadline as
  `greatest(scheduled_at − 12h, client_approved_at + 2h)` — against the wrong visit it can
  **release a slot mid-job.**
- `visitLocked` (`ClientDashboard.tsx:970`) and the server's 24h reschedule guard both read
  the single `scheduled_at`: the client gets locked out of changing visit 2 because visit 1
  is imminent.
- `photosMissing(job)` requires exactly one `before_photo_path` + one `completion_photo_path`
  — two **columns**, not rows. Per-visit photos need rows. Note `photo_rules_start()` is
  triplicated (DB function, `JobPhotos.tsx`, `visit-reminder/index.ts`) — change one, change
  all three.
- `job_time_logs` and `job_expenses` have **no visit column**, so day-1 hours and day-2 hours
  cannot be told apart. This is the direct blocker on the "first day hours + second day
  hours" ask, and it is a one-column migration on each.
- `JobsCalendar.tsx` renders one event per job.

The reschedule prompt still **exists twice** — `ClientDashboard.tsx:2849` (has the 24h lock)
and `JobChat.tsx:604` (no lock, no change-time path). Fix the second copy as part of this
work or multi-visit inherits a two-year-old divergence.

### W2 — Evidence: invoices and hours attached to a price change

**Guards touched: none.** Evidence is read-only; it justifies a change, it doesn't make one.

Today `job_expenses(id, job_id, contractor_id, label, amount, created_at)` has **no file
path column**, no storage bucket, and `JobExpenses.tsx:2` states outright *"Clients NEVER
see this"* (RLS is contractor-own + admin). It's a private margin tracker, not a client
receipt. Three changes:

1. Add `receipt_path` + `visit_id` to `job_expenses`; new storage bucket for receipts. Per
   the standing upload rules: compress via `compressImage(file, 'document')`, derive the
   extension from the **returned** file, pass its `type` as `contentType`, and remember
   PDFs pass through uncompressed.
2. Add a `client_visible boolean default false` column. **Be clear that this does not avoid
   an RLS change** — the first draft implied it did. Clients cannot read `job_expenses` at
   all today (contractor-own + admin), so the policy must change regardless; the column only
   **bounds the blast radius**, because every existing row was written under a promise that
   the client would never see it and must stay invisible by default. **Widening a read policy
   applies retroactively to every row ever written**, which is why the flag, not the policy,
   carries the decision.
3. Link evidence to the proposal. `price_change_pending` is a jsonb carrying
   `amount/labour/parts/callout/subject/price_low/price_high/used_base_price/reason`. Add an
   `evidence` key listing expense ids and a time-log total. **Do not store the evidence only
   there** — `decline_price_reopen` wipes that jsonb (shape 14), so the receipts must live in
   `job_expenses` and be referenced, never embedded.

Note the image safety scan **fails open** and is not a security boundary; on evidence
surfaces a `gore` reject deliberately does not block.

### W3 — Comms: the disclaimers, and the email that doesn't exist

**Guards touched: none directly — but W3 must mirror guard 1's message exactly.** When
`confirm_job_completion()` raises with the balance owed, the client-facing copy has to say
the same number. The standing frontend rule applies: **never branch on a server error's
wording where the job's own state can answer** (matching the substring `"fund"` once
reported a settlement delay as "you owe a balance", with no button anywhere to pay it).

Four pieces:

1. **Posting-time disclaimer.** Put it in `BudgetPicker.tsx:76-78` — it is the one **shared**
   component used by both posting flows (`ClientOnboarding.tsx` and `NewRequest.tsx`), so
   one edit covers both. Proposed wording, next to the existing "this is a guide, not a
   quote" line:
   > *A job's price can change once a pro sees the work — scope and materials are the usual
   > reasons. Any change needs your approval before it takes effect, and you'll see what
   > changed and why. Talk the details through with your pro before you confirm anything.*
2. **Approve-time disclaimer.** `ClientDashboard.tsx:2736-2766` — the approve-time-and-price
   panel. This is the moment the client commits money; the posting-time line is too far back
   to count. One line above the "Approve & schedule" button.
3. **The `price_change` email is broken and nobody has noticed** because the type has never
   fired. `propose_price_change` calls `notify_email('price_change', job)`, and deployed
   `notify-email` v15 **has no `price_change` branch** — it returns
   `{status:"ignored", reason:"unknown event"}`. The client gets only the thin generic email
   from the `public.notifications` webhook: subject is the notification title, body is the
   notification body. Write the real branch. It must state old price, new price, the delta,
   the reason, the fee impact, **what happens to the deposit**, and the two options with a
   deadline.
   **Then the ordering trap, which the first draft of this spec got wrong.** It is not enough
   to add `price_change` to `EMAIL_HANDLED_ELSEWHERE` — `price_change` has **two** paths
   inside `propose_price_change` and only one of them asks for a `price_change` email. The
   held branch calls `notify_email('price_change')`; the **unpaid branch writes a
   `price_change` bell but calls `notify_email('schedule_proposed')`**. Suppress the type
   globally and the unpaid-path *price hike* emails only "🕒 Your contractor proposed a
   time", with **no mention that the price rose at all**. So: first make the unpaid branch
   also call `notify_email('price_change')`, **then** add the type to
   `EMAIL_HANDLED_ELSEWHERE` at `send-notification/index.ts:83`. In that order, or one of the
   two paths goes silent. This is the one-emitter rule working as intended — verify emitters
   by reading the emitting function, never by reading the type list.
4. **Explain the blocked state.** A job can be blocked from completion by `price_change_pending`
   alone (fully-funded case) or by funding (part-funded case) — see §1b. Both parties need to
   see which it is and what clears it. One shared predicate per the standing rule —
   `jobFullyFunded(job)` already exists and must **not** be reused to explain a
   pending-proposal block, because it isn't what's blocking. The note must key on the *thing
   it claims*, not on the predicate that hid a button.

While in here: **`schedule_proposed` has two emitters** (the bell webhook *and*
`notify_email`, which v15 does handle) and is not in `EMAIL_HANDLED_ELSEWHERE`. That is a
live duplicate-email bug, pre-existing and unrelated to this spec. Worth fixing in the same
pass since the file is open.

### W4 — Price history / addendum trail

**Guards touched: none.**

Today the record is one-deep and lossy: `price_hike_from/reason/at` is written on the
**unpaid** path only, never on the held path, and `decline_price_reopen` clears it. So the
commonest interesting case — a raise after the deposit — leaves no history at all, and a
declined raise on an unpaid job leaves none either. (The first draft also claimed a declined
*held* raise destroys the trail; it does not, because on a held job there is no decline path
to reach — shape 15. Once W5 adds one, the loss becomes real, which is the argument for
building this table alongside W5 rather than after it.)

```
job_price_changes(id, job_id, proposed_by, proposed_at,
                  from_amount, to_amount, from_total, to_total,
                  reason, evidence jsonb, outcome, decided_at, decided_by,
                  contract_addendum_md, written_copy_sent_at)
```

Append-only, in the shape of `admin_audit_log`: SELECT policy only, writes through one
`SECURITY DEFINER` function, **no foreign keys** and a snapshot of the amounts rather than a
reference. One departure from that model: `admin_audit_log`'s readers are admins, but this
table's readers are the **client and the contractor on that job**, so the SELECT policy must
be **party-scoped**, not open. Copying `admin_audit_log`'s policy verbatim would publish
every job's pricing history to every signed-in user — the most important row it can hold is "the price changed and the client walked",
and an FK would cascade that row away with the job. `contract_addendum_md` is what makes
W0's addendum option real, and `written_copy_sent_at` is the Alberta audit stamp.

### W5 — The unwind path: expiry, escalation, and an exit from a held job. **This is the critical path.**

**Guards touched: none** — but only because of a detail worth stating, since it is the whole
reason this is safe. On the **held** path `propose_price_change` writes *only* the
`price_change_pending` jsonb; it never touches `amount` or `total_charged`. So "revert on
expiry" is just clearing a jsonb — nothing moves downward and `fully_funded` cannot flip
true on a job that shouldn't pay out. (`fully_funded` is additionally guarded by
`total_charged IS NOT NULL`, so a NULL total reads **false**, not true.) **If a future
version of W5 ever writes a price on expiry, that reasoning collapses and all four guards
are back in scope.**

This was ranked mid-list in the first draft. An independent review corrected that:
**shape 15 means a held job with a pending price change has no exit at all.**
`decline_price_reopen` guards through `job_money_block()`, which refuses for
`payment_status in ('held','released','disputed')` — so the client cannot decline. Meanwhile
`create-balance-payment` 409s, `confirm_job_completion` blocks, and `auto_confirm_stale_jobs`
filters `price_change_pending is null`. The job is frozen in every direction, permanently,
with real money held. **W5 is not a nudge improvement; it is the only exit.** Build it
before W3 and W4.

What it needs:

1. **A decline path that works on a held job** — a `SECURITY DEFINER` unwind that clears the
   proposal and leaves the job payable at the **original** price, plus a separate, deliberate
   cancel-and-refund route for the case where the client wants out entirely. Refunds go
   through the existing newest-first walk; do not invent a second one.
2. **`expires_at` on the proposal, plus a sweep.** Two lessons from the agent-team work apply
   verbatim: **a proposal past `expires_at` is still literally `'pending'`**, so anything
   that dedupes on status will refresh expired rows forever; and **expiry must be swept from
   somewhere nobody can forget to call** — there it was `agent_run_start`, here it is
   `run_reminders`.
3. **Extend `run_reminders` step 6, don't duplicate it.** Step 6 already nudges a pending
   price change at 48h, dedupe-keyed on `proposed_at`. It is one email with no ladder and no
   expiry. Add the ladder and the deadline to step 6 rather than adding a step 9, or the
   client gets two emails about the same proposal — exactly the duplicate-emitter class the
   email rules exist to prevent.
4. **Clear the jsonb when a dispute opens** (shape 17), or the proposal outlives the dispute
   and keeps the job skipped by auto-confirm forever.
5. **A pro-side exit** (shape 16), sharing the same unwind so there is one answer to "this
   job is over and money is held", not two.

### W6 — Test the whole price-change path, because none of it has ever run

**Guards touched: all four — this is the workstream that verifies them.**

Use the `freddy-money-test` skill. The entire branch is production-untested and the audit
found a concrete symptom of that: `propose_price_change` once wrote NULL into the NOT NULL
`payment_status` column for an unknown period, and nobody found out, because no job has ever
reached `held`. Specifically untested: the held-path proposal, the top-up Checkout
(`kind:'price_topup'`, 2h expiry), the newest-first refund walk on a decrease, and the
`extra_charge_intent_ids` idempotency guard. Note **`extra_charge_intent_ids` is the sole
idempotency key** for both the `balance` and `price_topup` webhook branches — any new charge
must append to it in the **same write** as `funded_amount`.

### W7 — Scale-based interface

**Guards touched: none.** Presentation only. See §5.

---

## 5. Interface tiers by job scale

A scale concept is almost entirely new. The **only** numeric size branch in `src/` today is
`MilestonePanel.tsx:119` — `if (total <= 2000 && !job?.is_milestone) return null;` — which
is a *money* threshold, not a layout one. `used_base_price`, `subject_to_inspection` and
`price_low`/`price_high` all exist but branch nothing except display notes.

Proposed tiers. The point is **subtraction at the small end**, not addition at the large end
— a $150 faucet swap currently renders the same panel stack as a $12,000 reno.

| Tier | Range | Client sees | Pro sees |
|---|---|---|---|
| **A — Simple** | < $500 | One price, one date, one before/after pair. No breakdown table, no milestone offer, no visit list. | Timer + "mark complete". Expenses collapsed. |
| **B — Standard** | $500–$2,000 | Quote breakdown, approve-time disclaimer, single visit. | Timer, expenses, photo gate. |
| **C — Project** | $2,000–$10,000 | **Visit list** (W1), per-visit hours, milestone offer surfaced rather than buried, evidence feed (W2). | Per-visit scheduling, invoice upload, price-change proposal with evidence attached. |
| **D — Major** | > $10,000 | Milestones **default on**, per-stage approval, full price history (W4). | Stage management; scheduling-only visits discouraged. |

Thresholds belong in **one** place — a single exported predicate, `jobTier(job)`, read by
every surface. The standing rule is one predicate shared by every reader, so a gate, a
dimmed button, a hint and an attention card can never disagree. Reuse the existing `$2,000`
constant as tier C's floor rather than inventing a second number that can drift from it.

**Open question for the owner:** should the tier key off price, or off the *service type*? A
$400 furnace diagnosis and a $400 fence repair are the same money and genuinely different
jobs. Price is cheaper to build and will be right most of the time; service type is more
accurate and needs a mapping table nobody maintains.

---

## 6. Faster payment processing — the honest answer

Measured end to end, from the client's card being charged to money landing in the pro's bank:

| Step | Trigger | Typical | Worst case | Whose delay |
|---|---|---|---|---|
| Deposit charged | client books | instant | — | — |
| Pro marks complete | contractor | instant | — | — |
| Balance (60%) collected | `collect-balances` cron, hourly, needs completion > 2h old | 2–3h | ~3 days (card declines), or client-dependent with no saved card | **ours** |
| `fully_funded` flips | `stripe-webhook` | seconds | — | Stripe |
| Client confirms | `confirm_job_completion()` | instant **if they click** | `auto_confirm_stale_jobs` — 3-day window, swept **once daily at 09:00 UTC** → up to **4 days** | **ours** |
| Transfer created | synchronous with the confirm click | seconds | `reconcile-payouts` every 15 min otherwise | **ours** |
| Transfer **executes** | `source_transaction` settles | **~2 business days** | **~7 days** for a new Canadian account's first payout | **Stripe** |
| Connect account → bank | no `payout_schedule` is set anywhere → Stripe's CA Express default | +0–1 day | + country delay | **Stripe** |

**About two days are recoverable from our side; the remaining two to seven are Stripe's.**

Levers, ranked:

1. **Auto-confirm 3 days → 48h, and sweep hourly instead of daily at 09:00 UTC.** Removes up
   to ~2 days for an unresponsive client — roughly all of the available win, and most of it
   is pure cron latency rather than a real waiting period. It changes guard 2's *timing*
   only, so keep the `fully_funded` skip **byte-identical** and do not touch the condition
   itself.
   **The real cost, stated precisely, because it is easy to understate:** the window is
   measured from `contractor_completed_at`, **not** from when the balance actually landed,
   and `collect-balances` runs hourly with card declines stretching to ~3 days. So at 48h, a
   job whose balance clears at hour 47 gives the client **about one hour** of objection
   before 93% moves — where the 3-day window gave them most of a day. If this lever is taken,
   the honest fix is to measure the window from **funding**, not from completion, which makes
   it strictly safer than today as well as faster.
2. **Have `auto_confirm_stale_jobs` kick `reconcile-payouts` directly.** Removes ≤15 min and
   closes the gap where an auto-confirmed job is only ever paid by cron. Near-zero risk,
   near-zero value — 15 minutes of a multi-day timeline.
3. **Trim the 2h autopay grace.** Removes up to ~3h, but that grace exists so a pro who
   mis-marks a job complete can undo it before a card is touched. Trading an hour for refund
   handling is a bad trade.
4. **Accept that Stripe dominates — or pay to shorten it.** Instant Payouts carry a fee and
   need an *available* balance, which conflicts directly with the pending `source_transaction`
   legs that exist because of the 2026-08-30 incident: the first real payout failed with
   "insufficient funds" on a fully-funded job, because card money sits pending ~7 days.
   Alternatively ask Stripe to drop the new-account first-payout hold. Both re-open a solved
   failure mode.

**Not a lever:** advancing the held deposit early. The deposit stays held by invariant.

**Recommendation:** do lever 1, skip 2 and 3, and set expectations in the contractor-facing
copy instead. The biggest perceived win available isn't speed — it's **telling the pro when
the money will arrive**, which nothing does today.

---

## 7. Needs a lawyer, not a developer

1. **Does a post-signature price increase require a new written copy and a fresh 10-day
   cancellation right, or only express consent?** This determines W0 item 3 — addendum vs
   re-sign. It is currently sidestepped by `void_contract_on_price_change` returning early
   once `payment_status != 'unpaid'`.
2. **Is "keep the 40% deposit regardless" enforceable** against the clause we wrote
   ourselves, which promises to refund *"any funds still held (not yet released to the
   contractor)"* on a valid cancellation? These two statements conflict today.
3. **Who discloses the material markup?** If a pro raises a price citing materials and
   uploads an invoice, the client will compare the invoice to the increase. Whether the pro
   may mark up materials, and whether that must be stated, is a policy decision with a legal
   edge.
4. The standing blocking item from `docs/legal.md` still applies: the Service Alberta
   prepaid-contracting licence and bond, and whether the platform itself needs one.

Wording constraint throughout: say **"held securely"**, never "escrow".

---

## 8. Bugs found during the audit — independent of this spec

These are real today, cheap to fix, and do not need the spec approved first.

1. **`price_change` email silently does nothing.** `propose_price_change` calls
   `notify_email('price_change')`; deployed `notify-email` v15 has no such branch and
   returns `{status:"ignored", reason:"unknown event"}`. Never noticed because the type has
   never fired.
2. **`schedule_proposed` has two emitters** — the `public.notifications` webhook *and*
   `notify_email`, which does handle it — and is **not** in `EMAIL_HANDLED_ELSEWHERE`. Live
   duplicate email on a type that fires regularly.
3. **The 3% fee is recalculated in two places with different fallbacks.**
   `adjust-payment` uses `origRate = r2(client_fee / oldAmount)` falling back to **0.03**;
   `stripe-webhook`'s `price_topup` branch uses the same expression falling back to **0**. A
   referral-waived job (fee 0) that hits the `oldAmount === 0` path gets charged 3% by one
   and 0% by the other. Also `r2()` on a *rate* quantises it to 2dp. Do not add a third copy.
4. **`get_job_fee()` recomputes off `jobs.amount` while `jobs.client_fee` is a stamped
   snapshot.** Any two surfaces reading different ones disagree the instant a price moves.
   `propose_price_change`'s unpaid branch updates `amount` but not
   `client_fee/platform_fee/total_charged/contractor_payout` — harmless while those are
   NULL, stale if `payment_status` was `processing`/`failed`.
5. **The repo copy of `supabase/functions/stripe-webhook/index.ts` cannot compile** — lines
   177, 182 and 183 begin comments with a single `/`. The deployed version is fine; the
   committed one is not, which means the version-control copy is worthless for that function.
6. **`JobChat.tsx:604` reschedule chip has no 24h lock and no change-time path**, unlike its
   twin at `ClientDashboard.tsx:2849`. The known "exists twice" divergence, still diverged.
7. **A held job with a pending price change is a permanent dead-end** (shape 15). Not a
   typo-class bug — a missing path — but it is live, it is reachable the first time a pro
   raises a price after a deposit, and it freezes real money with no exit for either party.
   It is latent today only because no job has ever reached `held` with a proposal on it. This
   is W5 and it is the reason W5 is the critical path.

---

## 9. Decisions needed before W1 starts

1. **Tier by price or by service type?** (§5)
2. **Addendum or re-sign** on a held-job price raise? (§7 Q1) — blocks W0.
3. **Does the client see material receipts?** W2 proposes a per-row `client_visible` flag
   defaulting to false, which lets the pro choose. The alternative is always-visible, which
   is more trust but exposes the pro's supplier pricing.
4. **What happens on expiry of an ignored price change?** (W5) Recommended: clear the
   proposal, leave the job payable at the **original** price, and let the balance collect.
5. **Max visits per job** before the UI pushes the pro toward milestones. Suggest 4.
6. **When a held job unwinds mid-work, does the pro get paid for work already done?** (shapes
   16 and 20) Today the answer is no, and there is no mechanism either way. This is a policy
   call before it is a code call, and it is the one most likely to produce an angry phone
   call.
7. **Can a pro appeal a declined price change,** or is a decline final? (shape 20)
8. **If the price changes between visit 1 and visit 2, does visit 2 go ahead?** (shape 19)
   Balance collection 409s while a proposal is pending, so today the pro would be returning
   to a job that cannot collect. Decide before W1 ships, not after.

---

## Suggested order

**W0 → W5 → W3 → W4 → W2 → W1 → W7**, with W6 running against each money-touching step.

W5 moved ahead of W3 after the review: a held job with a pending price change currently has
**no exit in any direction** (shape 15), and no amount of better email copy fixes a job that
cannot be unwound. W0 stays first only because it is pure copy, carries no code risk, and
removes the legal exposure — it can proceed in parallel with W5 rather than blocking it.

After those two: W3 makes the whole thing comprehensible to the people in it. W4 makes it
auditable. W2 and W1 are the real builds and should not start until the cheap half is done,
because both become easier once there is a price-history table, a working unwind and a
working email to hang them off.

---

## Review record

This spec was written from a live audit, then reviewed independently against `CLAUDE.md`'s
money invariants and re-verified against the deployed system. The review confirmed every
load-bearing fact about the current system **except four**, all now corrected in place:

1. §1b overstated the un-funding effect — it applies to the part-funded branch only.
2. Shape 10 claimed no reminder chases a pending proposal; `run_reminders` **step 6** does.
3. W3's `EMAIL_HANDLED_ELSEWHERE` instruction, in its original order, would have silenced
   the unpaid-path price-hike email entirely.
4. W2 implied the `client_visible` column avoids an RLS change. It does not.

It also found **shape 15 and five further stranding cases** the first draft missed, which is
what moved W5 to the critical path. If this spec is picked up months from now, re-verify the
"what exists today" claims before acting on them — the code wins, not this file.

