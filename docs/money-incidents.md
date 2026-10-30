## Card on file — automatic balance collection (2026-08-31)

Phase 2 of the 40/60 split, and the structural fix for the **ghost client**:
deposit held, work finished and photographed, the client never comes back to pay
the 60%. Every payout guard then correctly refuses to release, so **the
contractor waits indefinitely**. `run_reminders()` step 8 (24h/3d/7d) and
`escalate_unpaid_balances()` (10 days) are both *remedies* for that state; this
is what stops it arising.

**MONEY: touches NONE of the four payout guards.** `confirm_job_completion()`
still raises with the exact balance owed, `auto_confirm_stale_jobs()` still skips
under-funded jobs, `release-payment` still 409s on `!fully_funded`, and
`reconcile-payouts` still filters `.eq("fully_funded", true)`. What changed is
only *how the balance arrives*. Money collected this way is **held**, never
released — confirmation, the 3-day window and the dispute branch are untouched.

**There is ONE receiving branch, deliberately.** The off-session charge is tagged
`metadata.kind = 'balance'`, so the **existing** `stripe-webhook` balance branch
does the `funded_amount` increment, reusing its `extra_charge_intent_ids`
idempotency guard. A second receiving branch would have been a second place to
get `funded_amount` wrong, which is the one arithmetic the money invariant rests
on. `metadata.source = "autopay"` is the other half of the tag and is equally
load-bearing: `stripe-webhook` **v18** reads it in the
`payment_intent.payment_failed` branch and **returns early**, because a declined
saved card is not an owner problem — the client has already been told in plain
English and the sweep retries twice more. Alerting on every decline would bury
the alerts that do need him.

**Saving the card happens at deposit checkout, not as a separate step.**
`create-payment-intent` **v18** passes `customer_creation: "always"` plus
`payment_intent_data.setup_future_usage: 'off_session'` — `setup_future_usage`
requires a Customer, which is what the first flag supplies. `stripe-webhook`
stores `stripe_customer_id` / `stripe_payment_method_id` on the job **only when
`pi.setup_future_usage === "off_session" && pi.customer`**, so a job whose client
paid without a saved card simply has nulls and is invisible to the sweep.

**Collection: `collect-balance-auto` (v1, `verify_jwt=false`), armed by pg_cron
`collect-balances` at `52 * * * *`.** `verify_jwt` buys nothing as always, so it
gates in code: an `x-ff-internal` single-use token redeemed through
`consume_internal_token` (proving the caller is Postgres) **or** a real admin
JWT, else **403**. Verified live: an ungated POST returns `403 {"error":"forbidden"}`.

`jobs_due_for_autopay(p_limit)` is the predicate, and **every clause in it is a
refusal** — the default answer is no. It requires `payment_status='held'`, not
`fully_funded`, `status in ('pending_confirmation','completed')`, no dispute, not
milestone, no prepay pool, no pending price change, `contractor_completed_at` set
and **older than 2h**, a balance over half a cent, `autopay_balance = true`, both
Stripe ids present, `autopay_attempts < 3`, and the last attempt over 24h ago.
Milestone and prepay are excluded for the same reason step 8 excludes them —
their money moves per stage or per pool and neither has a whole-job balance —
and a pending price change is excluded because **charging a figure that is
mid-negotiation is worse than charging nothing**. The 2h grace exists so a pro
who marks a job complete by mistake can undo it before anyone's card is touched;
24h between attempts means three tries span three days.

**Claim before charge.** `record_autopay_attempt()` stamps the attempt *before*
Stripe is called, so a crash mid-charge burns the attempt rather than
re-charging on the next sweep. The idempotency key is **per-attempt**
(`autopay_<job>_<attempt>`) because **Stripe caches ERRORS as well as successes
for 24h** — a fixed key would return the first decline forever, the same trap
that made `payout_<job>` unusable in `release-payment`.

**The contract gate still fails CLOSED.** The function re-checks
`contract_required` → `contract_signed` and refuses on *any* error. An
unreadable answer is a refusal, never a charge.

**`set_job_autopay(job, on)` is the client's consent switch**, and its owner
check is written `auth.uid() is null or v_client <> auth.uid()` on purpose. **The
obvious form is silently broken**: `v_client <> auth.uid()` evaluates to NULL
when `auth.uid()` is NULL, and **a NULL `if` condition does not fire**, so an
unauthenticated caller fell straight through the guard. Found by a rolled-back
probe, not by a failure. The grants (revoked from `public, anon`, granted to
`authenticated`) meant nothing could actually reach it — but *a guard that
depends on an ACL to be correct is one refactor away from being wrong*. This is
the SQL sibling of `.maybeSingle()` vs `.single()`: absence is not a match.
Turning autopay back **on** also clears `autopay_last_error` and resets
`autopay_attempts` to 0, so the sweep retries rather than staying stuck.

**`autopay_balance` defaults to TRUE.** The client opted in at checkout by paying
a deposit on a job whose signed agreement states the balance is due on
completion; the switch exists so they can say no, not so they have to say yes
twice. The UI is `autopayNote(job, whenText)` in `ClientDashboard` — **ONE
renderer mounted in BOTH balance panels**, so the "we'll charge your card"
promise and the manual Pay button can never disagree about what is about to
happen. It renders nothing when there is no saved card, which is most jobs. A
decline shows the plain-English Stripe reason plus either "we'll try again
tomorrow" or, at three attempts, "we won't try again — please pay below". **The
manual Pay-the-balance button is never removed or disabled by any of this**; a
client whose card fails must always have a way to pay.

Verified before arming the cron: predicate **15/15** by rolled-back probe (picked
exactly the three qualifying rows; correctly refused too-new, milestone,
disputed, price-change-pending, autopay-off, attempts-exhausted, no-card,
fully-funded, recent-attempt, unpaid, wrong-status and not-yet-completed),
consent switch **4/4**, `platform_health_check()` **7/7**, and a live end-to-end
run returning `{"ok":true,"checked":0,"charged":0,"failed":0,"skipped":0}` —
which also proved no real production job qualified, so arming the cron could not
charge anyone.

**Standing caution:** this has never charged a real card. It is verified by probe
and by a live run over an empty candidate set, which is not the same as proven.

## The first live payout, and why one transfer was never going to work (2026-08-30)

The platform's first real job reached `held`, the client confirmed, and the payout
failed with **`Insufficient funds in Stripe account`** — then failed again every 15
minutes for hours while `reconcile-payouts` retried. Nothing was wrong with the
money. The owner checked the bank and the charges had gone through; **Stripe was
reporting a platform-balance problem in language that reads like a client payment
failure**, and the dashboard passed that wording straight to the client.

**Root cause: a transfer draws on the AVAILABLE balance, and card money sits in
PENDING until it settles** — about 7 days for a new Canadian account's first
payout. So a correctly-collected, fully-funded job is unpayable for a week unless
the transfer names the charge it comes from. `source_transaction` does exactly
that: the transfer draws on a specific charge, inherits its pending status, and
executes on settlement.

**The trap is that a transfer cannot exceed its `source_transaction` charge, and a
Freddy job is funded by TWO charges.** Deposit $2.15 + balance $3.00 fund a $4.65
payout, so no single charge is large enough — **a one-`source_transaction` payout
is arithmetically impossible on any 40/60 job**, which is every job. `release-payment`
**v18** therefore splits the payout into legs, one per funding charge, and Stripe
allows several transfers against one charge so long as they sum to no more than it.
`jobs.stripe_transfer_ids text[]` records all of them; `stripe_transfer_id` keeps the
first for backward compatibility.

Four rules the implementation encodes, none of them optional:

- **The ledger is read from Stripe, not from our own columns.** `priorTransfers()`
  lists `transfers.list({ transfer_group })` and pays only the shortfall. This is
  what makes a retry safe after a partial success — and it is required, because
  **Stripe idempotency caches ERRORS as well as successes for 24h**, so replaying a
  fixed key like `payout_<job>` would have returned the cached "Insufficient funds"
  forever. Keys are now per-charge.
- **A failed read is not an empty result.** `priorTransfers()` **rethrows** if the
  list call fails rather than assuming zero. Assuming zero here means paying the
  contractor twice.
- **The no-charge fallback is kept deliberately.** If no funding charge is readable,
  `planLegs` emits one legless transfer — the old behaviour — so an unreadable
  intent degrades to "might wait for settlement", never to "cannot pay".
- **Milestone mode uses `transfer_group = ms_<milestone_id>`**, not the job id, or
  its ledger read would count the job-level payout as already paid. Prepay keeps the
  job id.

**None of the four payout guards was weakened.** Guard 3's `!fully_funded` 409 is
unchanged and still sits ahead of every transfer; guards 1, 2 and 4 were not touched.
This change is downstream of all of them — it only alters *how* an already-authorised
payout reaches Stripe.

**Alert throttling.** A single broken payout emailed the owner ~96 times a day
because `reconcile-payouts` retries every 15 minutes. `alert_throttle_log` +
`alert_should_send(key, cooldown_mins default 360)` collapse that to one email per
6 hours per distinct failure, with a running count in the body. The throttle key is
`release-payment|<what>|<why>` with hex ids masked, so two *different* failures still
both get through. **`alert_should_send` fails OPEN** — any error sends the email,
because a throttle that silences an alert on its own bug is worse than a duplicate.
(Its first version was wrong: `now()` is frozen for the whole transaction in Postgres,
so comparing `last_sent_at` to `now()` after updating it in the same statement always
passed. It reads the prior value from a CTE.)

**Frontend rule this produced: never branch on a server error's wording where the
job's own state can answer.** `confirmCompletion` matched the substring `"fund"`,
so `"Insufficient funds in Stripe account"` — a **platform settlement** message the
client can do nothing about — was reported as "you still owe a balance". `jobBalance()`
was 0, so there was no button anywhere on the page and the client was told to pay
something they had already paid, with no way to. It now branches on
`jobFullyFunded(activeJob)` first, and the payout branch no longer matches the bare
tokens `payout`/`transfer` (which would have caught our own "Could not read existing
Stripe transfers…"). The third branch says plainly that the payment is complete,
nothing is owed, and the transfer is just slow.

**And the message now survives.** It was a toast that vanished in six seconds, on a
surface that unmounts the moment confirming flips the job to `completed` — which is
why the owner reported "no way to input new information to actually pay on the
website". `releaseNote` persists it as a **Needs-your-attention row pushed ahead of
every other money row**, since a release that did not complete is the only state in
which money has been taken and reached nobody.

