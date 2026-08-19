# Payment audit — 18 August 2026

Scope: every path money can take through Freddy Fix It — single charge, the 40/60 deposit split, milestone escrow, the recurring prepay pool, price changes, refunds and disputes. Read across the Postgres functions, all twelve payment edge functions, and the dashboard code that drives them.

Standing caveat, and it colours everything below. The database holds **one job**, it is `unpaid`, and there are **zero** contracts, milestones, prepay pools and disputes. `funded_amount` has never been anything but zero. `platform_health_check()` returns seven greens, but every one of those greens is counting an empty set. Nothing in this report was found by watching something break — it was found by reading what the code *would* do. That is also why it is worth doing now: the first real payment is the expensive place to discover any of it.

---

## P0 — Everyone who pays is dumped on the marketing homepage

All four payment functions send the client to the same place when Stripe is finished with them:

```
success_url: `${SITE}/client?payment=success`
cancel_url:  `${SITE}/client?payment=cancelled`
```

`create-payment-intent:122`, `create-balance-payment:85`, `create-milestone-payment:108`, `create-recurring-prepayment:107`.

**`/client` is not a route.** `App.tsx` has `/client-onboarding`, `/client-success` and `/client-dashboard`, and its catch-all is `<Route>{() => <Redirect to="/" />}</Route>`. So a client who has just handed over a $412 deposit is redirected to the homepage — the one with the hero and the before/after slider — with no confirmation, no receipt, no job, and no indication the payment worked. The cancel path does exactly the same thing, so a client who changes their mind also loses their place.

Nothing else in the audit is this cheap to fix or this certain to happen. It fires on the *first* payment the platform ever takes.

The fix is four string literals: `/client-dashboard?payment=success`. Edge-function redeploy only, no migration. It touches none of the four payout guards.

---

## P0 — `processing` is an unguarded, invisible, deletable state that holds real money

`create-payment-intent` refuses a job at `held` (line 56) or `released` (line 58), then writes `payment_status = 'processing'` at line 161 — **before** the client has paid anything. Nothing anywhere refuses a job at `processing`. That single omission opens four separate holes.

**The client is invited to pay twice.** `ClientDashboard.tsx:606` explicitly folds `processing` in with `unpaid` and `failed`. There is no "we're confirming your payment" state anywhere in the app. A client returning from Stripe — by the success URL, the cancel URL, or the Back button — sees the same enabled "Pay $X deposit" button at the same price. If they click it, a second Checkout session is created and can be genuinely paid.

**The second charge then vanishes.** `stripe-webhook:210` guards the deposit branch with `.eq("payment_status", "processing")`. The first success flips the row to `held`; the second success matches zero rows. No `funded_amount`, no entry in `extra_charge_intent_ids`, and no admin alert — the alert at line 222 only fires for an unrecognised `kind`. That payment intent is now recorded in no column, which means `adjust-payment` and `resolve-dispute` — both of which walk `stripe_payment_intent_id` plus `extra_charge_intent_ids` — can never refund it. It is recoverable only by hand in the Stripe dashboard, by someone who knows to look.

**The job can be deleted out from under the payment.** `withdraw_job`, `remove_client_request` and `decline_price_reopen` all guard on `payment_status in ('held','released','disputed')`. I checked all three function bodies: **none of them contains the string `processing`**. `withdraw_job` hard-DELETEs and every child of `jobs` cascades. A contractor who withdraws while the client is on the Stripe page destroys the only pointer to a live payment intent, and the webhook lands on nothing.

**Nothing ever cleans up.** The webhook handles exactly three event types — `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`. There is no `checkout.session.expired` handler, so an abandoned checkout leaves the job at `processing` forever. No cron sweeps it. `platform_health_check()` has no check for it.

---

## P0 — Every prepaid recurring visit is a deadlock

`consume_prepaid_occurrence` is the function that draws a visit down against a prepay pool. It sets `payment_status = 'held'`, `total_charged`, `client_fee`, `platform_fee`, `contractor_payout` and `paid_at` — and it never sets `funded_amount`, which stays at its default of zero.

`fully_funded` is a generated column: `total_charged is not null and funded_amount >= total_charged - 0.01`. So it is **false on every prepaid visit that will ever exist**.

What the client then sees when they try to confirm the work: `confirm_job_completion` raises *"Please pay the remaining balance of $X before confirming the work is done"* — where X is the full price of a visit they have already paid for, in advance, in the pool. There is no way past it. `auto_confirm_stale_jobs` skips the job on the same test, so `client_confirmed_at` is never set, and `reconcile-payouts` branch 1b requires exactly that column. `create-balance-payment` 409s on any job with a `prepayment_id`, so the client cannot even pay the phantom balance to escape.

An admin cannot rescue it either: `confirm_job_completion` checks `client_id = auth.uid()`, so it is uncallable from an admin session, and no admin RPC writes `funded_amount`, `payment_status` or `total_charged`. The only exit that exists is `refund-recurring-prepayment`, which refunds the remaining pool and pays the contractor nothing for work already done.

The fix is one line in one function — set `funded_amount` to the same value as `total_charged` in that `update`, since the money genuinely did arrive when the pool was funded. It touches payout guards 1, 2 and 4 by *satisfying* them rather than weakening them: the guards are asking "did the money arrive", and for a prepaid visit the honest answer is yes.

---

## P1 — `refunded` is terminal in two files and not in the third

The rule is that a milestone stage at `released` **or** `refunded` is finished. Two places implement it correctly:

- `release-payment:129` — `.not("status", "in", "(released,refunded)")`
- `refund-milestone:72` — same shape

One place does not:

- `create-milestone-payment:79` — `.lt("seq", m.seq).neq("status", "released")`

So the moment an admin refunds stage 1 of a five-stage job, stages 2 through 5 return *"Fund the earlier stages first"* forever. The client cannot legally be charged for work the contractor is about to do, and there is no override.

Sitting next to it: `dispute_milestone` writes `status = 'disputed'` and `disputed_at`, and **nothing in the entire schema ever clears `disputed_at`** — no function matches `disputed_at = null`. `dispute_milestone` also creates no row in `disputes`, so `resolve-dispute` cannot see the stage at all. `release-payment:98` 409s while `disputed_at` is set. A stage disputed and then settled in the contractor's favour therefore has no release path, and settling it the client's way trips the gate above.

---

## P1 — `admin_delete_job` will delete a job holding money

The whole function body is an admin check followed by `delete from public.jobs where id = p_job_id`. There is no `payment_status` guard, no milestone check, no prepay check — and it is a **"Delete job" button on the admin Jobs tab**. `withdraw_job` and `decline_price_reopen` both carry the full three-part money guard; this one carries none, and it is the one an admin can fire on any job in the system with one click.

---

## P1 — One bad row stops the whole day's sweep

`auto_confirm_stale_jobs` and `auto_approve_stale_milestones` contain no `exception` block anywhere in their bodies — I checked for the keyword and it is absent from both. Each runs a loop in a single transaction, so one row that raises (a notification failure, an `net.http_post` hiccup, a constraint) aborts the entire run. Every job due to auto-confirm that day silently doesn't. `decline_price_reopen`, `release_unconfirmed_visits`, `withdraw_job` and `mark_job_complete` all do have exception handling, which makes the two that don't look like an oversight rather than a decision.

Separately, the cron entry is `0 9 * * *` — **once daily**. A job that finishes at 09:05 UTC misses that morning's sweep by five minutes and waits until the next one, so the advertised "3-day auto-confirm" is really three to four days. `reconcile-payouts` runs every fifteen minutes but only looks at jobs that already have `client_confirmed_at`, so it does not compensate.

---

## P1 — A failed payout is reported to the client as success

`ClientDashboard.tsx:801`:

```js
const failed = !!error || (data && (data as any).error);
if (failed) {
  notify("Job confirmed. The payment to your contractor is being processed and will complete automatically within a few minutes — nothing more for you to do.", "ok");
}
```

The comment above it reasons that `reconcile-payouts` retries every fifteen minutes, so reassurance beats alarm. That reasoning holds for a transient network blip. It does not hold for the failure that will actually happen: `release-payment` calls `payoutAccount()` and 409s if the contractor's Stripe onboarding has lapsed or gone into review. Reconcile will retry that every fifteen minutes and fail every time, forever. The client has been told there is nothing more to do, the contractor is not paid, and the only signal anyone gets is the admin alert at `release-payment:245`, which sends `String(err)` **with no job id in it** — roughly ninety-six identical, unidentifiable emails a day.

This is also the one money call in the app that does not pull the reason off `error.context`. Every other one does, correctly — the deposit, balance, prepay, adjust-payment, connect-account, milestone and contract-sign calls are all clean.

---

## P1 — A failed read makes the entire payment surface disappear

`ClientDashboard.tsx:326`:

```js
const [{ data: con }, { data: job }] = await Promise.all([...]);
```

The error is not destructured, so a transient failure on the jobs read is indistinguishable from "no job exists". `setActiveJob(null)` follows, and the client is shown the pre-match "waiting for a contractor to be assigned" screen: no contract panel, no pay button, no milestone panel, no receipt. Their job appears to have evaporated.

The irony is six lines further down, where the contract gate is meticulously fail-closed with a `contractCheckError` flag and a "couldn't verify — please refresh" message. The same care simply wasn't applied one level up, to the question of whether the job exists at all.

---

## P2 — The Back button permanently disables the pay button

Every checkout handler sets a busy flag, then does `window.location.href = data.url`, and only clears the flag in its `catch`. On a bfcache restore — Safari and Firefox Back — React state comes back intact, so the button reads "Opening checkout…", is dimmed by `.ffdash button:disabled { opacity: .55 }`, and never recovers without a manual reload. Affects `busyPay`, `busyBalance`, `busyPlan`, `busyStripe`, and `MilestonePanel`'s `busyKey`, which disables *every* stage action rather than the one clicked.

---

## P2 — Seven of eleven active pros cannot be paid, and the client is the one who waits

Four of the eleven active contractors have `stripe_payouts_enabled`. Since `contract_ready` now requires a payout account before an agreement can be sent, a client who picks one of the other seven gets `ContractPanel`'s waiting branch: *"Your contractor is preparing the agreement… we'll email you when it's ready."* Indefinitely. No timeframe, no escalation, and the client sidebar offers only "File a claim" and "Report a bug" — there is no "Request help", which is the one a stuck pre-payment client would actually want.

The gate itself is right; it closes the money trap by construction. What is missing is a nudge on the contractor's side and a way out on the client's.

---

## P2 — Nothing ever checks Stripe's version of the truth

`reconcile-payouts` reads only the database. No function anywhere reads a payment intent or a balance back from Stripe. The webhook handles three event types, so a `charge.refunded` or a `charge.dispute.created` — a client charging back through their bank — is completely invisible, and the platform would go on to transfer 93% of a payment it no longer holds.

Signature verification and replay-safety are otherwise sound: `constructEventAsync` returns 400 on a bad signature, and each branch is guarded by a status transition or array membership, so a redelivered event does not double-count.

---

## P2 — What the health check cannot see

All seven checks read the `jobs` table only. **No check reads `job_milestones` or `recurring_prepayments` at all.** Invisible to it today: a milestone stage disputed forever; a refunded stage blocking every later stage; a prepay pool held with no consumable visit; a job stuck at `processing`; a milestone job left `unpaid` after all its stages released; a contractor whose payouts lapsed while holding a live job.

Check 5 does happen to catch the prepay deadlock — but it reports it as "work done, deposit held, client never came back", which would send the owner chasing a client who owes nothing.

---

## What is genuinely sound

Worth saying, because most of this file is bad news.

The four payout guards are consistent with each other on the single-charge and 40/60 paths — that invariant holds. `funded_amount` is written in exactly three places and never without reconciliation. A double transfer is prevented by `idempotencyKey: payout_${job.id}`, which `resolve-dispute` deliberately reuses. The DB is never marked `released` when a Stripe transfer throws — the transfer call precedes the update and the outer catch returns 500. `withdraw_job`, `remove_client_request` and `decline_price_reopen` all carry the milestone and prepay guards correctly; only `processing` is missing from them. Every payment function's repo source matches its deployed version — no drift. And every money call in the frontend except `release-payment` correctly digs the plain-English reason out of `error.context`.

---

## Suggested order of work

**First, because they are cheap and certain.** Fix the four checkout return URLs. Add `processing` to the three deletion guards and to `create-payment-intent`'s refusal list. Set `funded_amount` in `consume_prepaid_occurrence`. Accept `refunded` as terminal in `create-milestone-payment`. Give `admin_delete_job` the same money guard `withdraw_job` already has. None of these weakens a payout guard; three of them strengthen one.

**Second, because they change what a person sees.** A `processing` branch in the client dashboard that says "we're confirming your payment" and hides the pay button. Clearing the busy flags on `pageshow`. Telling the truth when `release-payment` fails, and putting the job id in the admin alert. Destructuring the error on the active-job read.

**Third, the safety nets.** A `checkout.session.expired` handler and a sweep for stale `processing`. Health checks that read `job_milestones` and `recurring_prepayments`. Per-row exception blocks in the two sweeps that lack them, and moving auto-confirm off a once-daily cron.

**Fourth, and this is the one that cannot be skipped.** One real end-to-end payment with real money — book, sign, pay the deposit, complete, pay the balance, confirm, watch the transfer land. Every conclusion in this file is a reading of code that has never executed against Stripe. The audit narrows where to look; it is not a substitute for running it once.
