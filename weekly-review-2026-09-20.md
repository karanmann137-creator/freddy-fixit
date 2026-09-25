# Freddy Fix It — review, 2026-09-20

**Nothing is on fire.** `platform_health_check()` is 6/7. The one red is a single signup that was never rescued and is about to age out of the check's window rather than be fixed. No job holds money incorrectly. The one job that reached `released` was paid correctly.

**The single highest-leverage fix is to stop reads failing silently.** One idiom — `const { data } = await supabase...` — is the mechanical cause behind both failures you hit during your real-world test, and behind both of the largest drops in the funnel.

---

## The pattern you noticed

You said a bug keeps becoming a major obstacle to a job completing. That is one bug wearing different clothes, and it has a name: **silent failure**. No error, no empty state, no failing check — just something that quietly did not happen.

The mechanism is specific and it is everywhere in the codebase. `supabase.from(...)` **resolves** with `{ data: null, error }` rather than throwing. So this line:

```js
const { data } = await supabase.from("bids").select(...);
setClientBids(data ?? []);
```

turns a failed network read into a confident, normal-looking "No estimates yet." A `try/catch` wrapped around it cannot fire, because nothing was thrown. `ContractorDashboard.tsx:620-621` proves this at the worst possible place — `setLoadError(true)` sits in a catch block that is structurally unreachable behind nine reads that all discard their errors.

This is the same shape as the two worst incidents in this project's history, both already written up in CLAUDE.md: the pgcrypto `42883` that killed every signup for a month because a catch-all swallowed it, and the `42703` in `timer_started` that silently ate the client's notification. Same failure class, different line numbers.

Your own documentation already states the diagnostic rule, and production now confirms it twice this week:

> When a feature's table has 0 rows against non-zero opportunities, suspect the route to it before suspecting the RPC.

`reviews` = 0 against 1 released job. `job_contracts` = 1 row against 4 jobs.

There are two secondary mechanisms, both smaller:

**Anchor-vs-state mismatch.** An attention row's button scrolls to a DOM id that does not render in the state the row fires in. The scroll helper falls back to `scrollTo({top:0})`, so the page jumps to the top and the button appears to do nothing. Already fixed on the contractor side; still live on the client side.

**Duplicated predicates that drift.** "Is this job fully funded" now exists in three divergent copies that disagree with each other on exactly the input all three of your live jobs have.

---

## What the data says

### Platform health — 6/7

| check | result |
|---|---|
| fee_rate_sane | pass |
| charged_fees_consistent | pass |
| critical_rpcs_present | pass |
| no_stuck_payouts | pass |
| no_unpaid_balances | pass |
| no_underfunded_payouts | pass |
| **no_stuck_signups** | **fail — 1 account, oldest 151h** |

Account `d274ea4b-477c-427d-b066-208bc9dcf34e` (client) signed up, never confirmed, never signed in. `auth-rescue` has already spent both of its automatic attempts (`rescue_ok = 2`). Nothing further will happen on its own.

**And here is the instance of the pattern hiding inside your own monitoring:** check 7's window is 24h–7d. This account is at 151h. In roughly seventeen hours it falls out of the window, the check turns green, and the person is still locked out. The check will report success for a failure it stopped being able to see.

Action: `select admin_rescue_signup('d274ea4b-477c-427d-b066-208bc9dcf34e','apology');` or phone them. Then consider whether the 7d ceiling should raise a different, permanent alert rather than simply forgetting.

### Integrity probes the seven checks do not cover

| probe | count |
|---|---|
| orphaned accounts (auth.users with no profile) | 0 |
| jobs held but under-funded | 0 |
| requests re-fired twice with zero bids | 0 |
| active contractors who have never bid | 11 |
| `review_status='rejected'` with empty `review_result` | **11** |
| active contractors without payouts enabled | **16 of 23** |

Two notes. CLAUDE.md says the empty-verdict defect affects "at least one contractor" — it is eleven, and that doc line should be corrected. And sixteen of twenty-three active contractors cannot pass `contract_ready()`'s fifth refusal, which requires `stripe_payouts_enabled`. That is not the current blocker on any live job, but it is a loaded gun on 70% of the roster — and per edge-function finding E1 below, that particular refusal never alerts anyone.

### The funnel

Lifetime, because the weekly sample is too small to mean anything:

| stage | count |
|---|---|
| requests posted | 10 |
| requests with 1+ bid | 10 |
| **requests awarded** | **4** |
| jobs created | 4 |
| **contracts signed** | **1** |
| jobs scheduled or beyond | 2 |
| jobs ever held | 1 |
| jobs released | 1 |
| reviews | 0 |

**Largest absolute adjacent drop-off: requests with bids (10) → requests awarded (4). Six lost.**

Every single request gets bids. Matching, `service_specialty_map` and dispatch are working perfectly — that half of the platform is not the problem. Six of ten clients then never pick anyone. Client-side finding C4 below is a live candidate cause at precisely that stage: the bids read discards its error and renders "no estimates yet."

**Second drop: jobs created (4) → contracts signed (1).** That is the agreement dead end — your incident #1 — and it is mechanically located below.

Week over week: this week 1 client signup, 0 contractor signups, 1 request, 3 bids, 0 jobs. Last week 1 client signup, 4 contractor signups, 0 requests, 4 bids, 1 job. **This sample cannot distinguish a real effect from noise and no conclusion should be drawn from it.** Traffic at the top of the funnel is the constraint; that is a demand problem, not a conversion problem, and no button-colour change addresses it.

### The four jobs

| job | status | payment | amount | total_charged | funded | contract | payouts ready |
|---|---|---|---|---|---|---|---|
| d4276678 | assigned | unpaid | NULL | NULL | 0.00 | none | yes |
| fd9c3db4 | completed | released | 5.00 | 5.15 | 5.15 | signed | yes |
| cafa6928 | assigned | unpaid | 5.00 | NULL | 0.00 | none | yes |
| 68ad4672 | assigned | unpaid | 105.00 | NULL | 0.00 | none | **no** |

All three live jobs have `total_charged` NULL. That is exactly the input on which finding CD2 produces no balance-owed row at all.

`contract_ready()` returns a correct, plain-English reason for each:

- **d4276678** — "Add your price to this job first."
- **cafa6928** — "Book a visit time first."
- **68ad4672** — "Wait for the client to approve your time and price."

The gate is working as designed. The question the review answers is whether the contractor ever sees the reason — and in the "sent" case, they do not.

---

## Findings, ranked

### 1. The agreement dead end — your incident #1, mechanically located

`ContractPanel.tsx:146-152` fetches the blocking reason **only when the contract status is neither `signed` nor `sent`**. `ContractorDashboard.tsx:1493-1497` excludes both those statuses from the attention row.

So the moment an agreement is marked "sent," no reason is computed, no attention row appears, and **there is no resend control on any of the seven render branches.** The panel asserts at `:193` and `:280-289` that the client "has been emailed to review and sign," with no delivery verification behind that claim.

That is precisely what happened to you: the contractor pressed send, the UI stated it was sent, the client never received it, and nothing anywhere could say so or try again.

**Fix:** compute the reason on `sent` too; add a resend control; replace the assertion with the actual state ("sent 3 days ago — resend").

### 2. Reads that discard their errors — the root cause

**Worst instance, `ContractorDashboard.tsx:504-627`.** Nine parallel reads, every one destructuring only `{ data }`. `const enriched = jobs ?? []`, `setAvailableJobs(open ?? [])`, `setMyReviews(revs ?? [])`. The `setLoadError(true)` at 620-621 cannot fire. A contractor whose network hiccups sees "No jobs yet" and "No Open Jobs Right Now" — a normal, empty, entirely wrong dashboard, with nothing to report to you.

**C4 — `ClientDashboard.tsx:1364-1401`.** The bids read does the same. Renders "no estimates yet" at the pick-a-pro step, which is where the funnel loses six of ten requests.

**C7 — `ClientDashboard.tsx:505-507`.** Only two of seven parallel reads set `loadError`. When the others fail, My Pros and Recurring Plans silently vanish from the navigation.

**C6 — `:670-671` and `:688-696`.** Contract status read error discarded → "Waiting on your pro to send the service agreement" displayed on an agreement that is already signed.

**C9 — `:636-643`.** Contractor read error discarded → an assigned job displays with no pro attached.

**MilestonePanel.tsx:89-94** discards the fee-rate error and falls back to a hardcoded `0.03` — the only place in these files that guesses rather than admitting it does not know.

**ContractPanel.tsx:129-137** discards `build_contract_body`'s error, leaving the preview empty while **the Sign button stays enabled** — a contractor can sign a blank legal document.

### 3. The confirm-payment path tells the client the wrong thing — your incident #2

**C1 — `ClientDashboard.tsx:1701-1704`, `:1273`.** Every release-note CTA scrolls to `ffc-confirm`, but line 1234 has already flipped the job to `completed`, and `ffc-confirm` only renders in the `pending_confirmation` branch (`:2403`). The page jumps to the top and nothing happens — on the single row that says money reached nobody.

**C2 — `:1267-1270` vs `:2490`.** The balance branch says "pay below." On a `completed` job, only the rating form renders below. Your incident #2, reproduced through a second door.

**C3 — `:1290`.** A bare `catch` reports "Job confirmed. The payment is being processed… nothing more for you to do." A green success message for a release that threw, in a toast that disappears in six seconds.

**C5 — `:1234-1235` with `:527`.** Confirming marks the request completed, which drops it from `openReqs`, which makes `activeReq` jump to a different request. The job just confirmed — with its release note and its rating form — disappears mid-action. This is why `reviews` is 0.

### 4. Three answers to "is this job funded"

`ContractorDashboard.tsx:1150-1155` uses `> 0.005` on raw `total_charged` with no `amount` fallback and never reads the server's generated `fully_funded`. `ClientDashboard.tsx:1035-1039` uses `<= 0.005` **with** the fallback. `JobTimeline.tsx:28-31` uses `- 0.01` and prefers `fully_funded`.

On a job where `total_charged` is NULL — which is all three live jobs — the contractor gets no balance-owed row at all.

**Fix:** one `src/lib/jobMoney.ts` exporting `jobFullyFunded(job)` and `jobBalance(job)`, reading the server's `fully_funded` first. Three call sites, one answer.

### 5. Edge functions — refusals that alert nobody

**E1.** `release-payment` alerts **only from its catch block**, but every guard refusal is `return json(..., 409)`. So "Contractor has not finished payout setup" — the cause its own alert text names as most likely — never alerts. `reconcile-payouts` retries every fifteen minutes, forever, counting failures into a JSON body that `kick_reconcile_payouts()` discards. Job-mode is caught by health check 4. **A stuck milestone stage or prepay occurrence is covered by no health check at all.**

**E2.** `stripe-webhook`'s `price_topup` branch sits entirely inside `if (job?.price_change_pending)`. Clear that block between checkout creation and payment and the charge is discarded: no `funded_amount`, no `extra_charge_intent_ids` (so it is never refundable), no alert.

**E3.** No `charge.refunded` or `charge.dispute.created` handling. A chargeback leaves `funded_amount` untouched, so `fully_funded` stays **stale-true** and guards 3 and 4 wave a payout through on clawed-back money.

**E4.** The repo copy of `checkout.session.expired` lacks v19's `stripe_session_id` guard. Likely a stale repo copy rather than a live defect — but the deployed function is the truth and must be read before any edit.

**E5/E6.** `refund-milestone` uses a fixed idempotency key. Stripe caches errors for 24h, so one decline replays for a day.

---

## Not checked this run

SEO/site health across the 19 service slugs and the legal-drift pass did not complete — the research agent ran out of usage partway. Neither is urgent: the honest headline this week is a product-reliability problem, not a visibility one, and nothing in the legal picture is known to have moved. The standing open item is unchanged and unchanged in one line: **prepaid-contracting licensing still needs a lawyer and Service Alberta.** I will run both phases on the next pass.

---

## What to do, in order

**1. Run the cleanup installer that is already waiting.** Thirty deletions and four modifications are sitting uncommitted in your folder, and the client-dashboard rating fix exists *only* there. Nothing else should be built on top of an unpushed tree.

```
bash ~/freddy-fixit/apply-cleanup.sh
```

**2. Rescue the stranded signup** before it ages out of the health check in ~17 hours.

**3. Then the structural fix**, which is what actually answers "won't break so often." Three parts, in this order:

- A shared read helper that **cannot** discard an error, applied to the nine contractor reads and the seven client reads first. This is the single change that converts the largest class of invisible failures into visible ones.
- `src/lib/jobMoney.ts`, collapsing the three funded-ness predicates into one that reads `fully_funded`.
- Make silence itself detectable: alert on 409 refusals in the payout chain, add a health check for stuck milestone and prepay releases, and handle `charge.refunded`.

I have not written an installer for part 3 yet, deliberately. Installers are cumulative per file and you run only the newest — building one now, against a tree whose pending changes have not been pushed, is exactly how a superset installer silently reverted production twice before. Run the cleanup, then I will ship these as their own explained installer with the money-path changes separated from the rest.

**Confidence, stated honestly:** the money invariant holds and all seven checks bar one pass, but the dispute branch has never executed against real money and card-on-file has never charged a real card. Neither is proven, only probed.
