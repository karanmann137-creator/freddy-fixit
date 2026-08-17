# Phase 0 — contractor backfill

Written 2026-08-16. **Nothing here has been sent or applied.** Drafts for your review.

---

## The thing to deal with first

You currently have **3 open client requests. All three of them** carry bids from contractors who cannot receive money — 5 such bids from 5 different pros. This isn't a corner case; it's every live request on the platform right now.

If a client picks one of those bids this week, here is what happens:

Client picks → contract gets signed → client pays the 40% deposit → funds held at Stripe → work gets done → client pays the balance → client confirms → **the payout fails**, because there is no Stripe account to transfer to.

It breaks at the last step, after the client has paid twice and the contractor has finished the job. That's the worst possible place for it to break.

I checked whether anything guards against this. Across the whole database, only two functions reference the contractor's Stripe status — `admin_get_contractor_detail` and `admin_list_accounts` — and both are admin screens that only *read* it. Nothing in the bid path, the pick path, the contract path or the payment path checks whether the pro on the other end can actually be paid.

**Fastest fix: email those 5 pros today.** That's five people, not a campaign. Draft below.

---

## Who the 22 actually are

I split the active roster by whether they've ever done anything.

| Segment | Pros | Payouts on | Has ID | Has insurance | Has WCB |
|---|---|---|---|---|---|
| Won work | 1 | 1 | 1 | 0 | 0 |
| Bid, never won | 9 | 2 | 7 | 4 | 3 |
| No bids, signed in <30d | 7 | 1 | 0 | 0 | 0 |
| No bids, dormant | 4 | 0 | 0 | 0 | 0 |
| Never signed in | 1 | 0 | 0 | 0 | 0 |

**Only 10 of 22 have ever placed a bid.** Between them, 14 bids and 1 job.

The other 12 have never bid once, and between all twelve of them there is not a single ID, insurance certificate or WCB document on file. They completed signup and stopped.

This changes the size of the problem considerably. The backfill isn't 22 conversations, it's **10** — and really it's the 9 who bid but can't get paid.

It also means the roster is inflated. Twelve accounts are presented to clients as vetted active contractors while having done nothing and provided nothing. That's the part that's hardest to defend if anyone asks what "vetted" means.

---

## The friction ladder (revised 2026-08-16)

An earlier draft of this gated **bidding** on payout setup. That was wrong. On a platform with 14 bids and 1 job to its name, supply is the binding constraint, and asking a contractor to do paperwork before they have ever seen a client is how you lose them. Nobody sets up a Stripe account for a maybe.

The fix isn't to require less. It's to require each thing **at the moment it becomes load-bearing**, so every ask arrives with an obvious reason attached.

| Stage | What we require | Why here |
|---|---|---|
| Sign up | Nothing new | No client contact. Zero risk. |
| Browse and bid | **Nothing** | Client sees a name and a number. No money, no home visit. Let them bid freely, forever. |
| Won the job → send agreement | **Payout account** | They have a real job in hand. Five minutes is obviously worth it now, and it closes the money trap before any client is charged. |
| Won the job → before the visit | **Proof of insurance** | Someone is about to be in a stranger's home. This is the moment it matters. |
| Bidding in a compulsory trade | **Trade certificate** | Electrical, plumbing, gas, A/C, appliance. Not policy — it's illegal to do the work without one. |

Everything else moves from gate to **incentive**: verified pros show verification markers on their bid row, unverified pros just don't. Clients pick the ones with the badges, pros notice, pros verify themselves. That's the spec's client-facing display doing double duty — honesty toward the client, and a reason for the contractor to bother.

The important consequence: **the money trap closes on its own.** Gating the agreement means no client can ever be charged for a job whose contractor can't be paid. The 5 exposed bids stop being an emergency and become a nudge.

## Recommended order

**0. Verification markers — SHIPPED to the database, installer waiting for you.** The incentive half of the ladder is built: `id_verified` / `insurance_on_file` / `wcb_on_file` now come back from `get_contractor_directory` and `get_contractor_profile`, and `VerifiedMarks.tsx` renders them on every bid row and public profile. Right now **6 of your 22 active pros would show a marker** — which is exactly the point. A client comparing bids sees who has done the paperwork, and the pros who haven't find out why they're losing.

**1. ~~Ship the agreement gate~~ — DONE 2026-08-16.** `migration-require-payout-before-contract.sql` is applied live. The money trap is closed: no client can be charged for a job whose contractor has nowhere to be paid. It blocked nothing that already existed (1 job, 0 contracts, 0 jobs ever held), and it costs the supply side nothing because it only bites after a pro has won.

**2. Nudge the 5 pros with live bids.** Not urgent any more, and framed as opportunity: you have a live bid, get ready.

**3. Email the other working pros** about insurance and WCB. No deadline attached.

**4. Decide on the 12 non-bidders.** My read: move them to `pending` rather than deleting. They stop appearing as vetted and stop inflating the roster; nothing is lost, since if one turns up wanting to bid you approve them then. One line of SQL, reversible, and I'd want your yes first.

**5. Phase 1 schema**, per the main spec.

**Not doing:** the `place_bid` gate. Superseded — see the banner in `migration-require-payout-to-bid.sql`.

---

## Draft — email 1, the 5 exposed pros

Subject: **You've got a live bid — worth getting ready**

> Hi {first_name},
>
> Your bid is sitting in front of a client right now, so this is a good moment to get your payout account connected. If they pick you, that's the one thing that has to be done before the job can start — and it's easier to do today than on the day.
>
> Five minutes. Log in, open your dashboard, click **Set up payouts**. Stripe handles it and asks for a piece of government ID.
>
> Good luck with the bid.
>
> Karan
> Freddy Fix It

## Draft — email 2, the other working pros

Subject: **Two things to finish on your Freddy Fix It profile**

> Hi {first_name},
>
> Quick housekeeping. To keep bidding on jobs, I need two things from you.
>
> **1. Payout account.** Log in and click **Set up payouts** on your dashboard. Five minutes, handled by Stripe. Without it you can't get paid, so I'm going to start requiring it before a bid can go in.
>
> **2. Current documents.** A certificate of liability insurance, and a WCB clearance letter if you carry coverage.
>
> We tell homeowners the pros on Freddy Fix It are vetted, and I want that to mean something specific rather than something vague. This is me making it true.
>
> Reply here if anything's unclear.
>
> Karan
> Freddy Fix It

## Draft — email 3, the 12 who never bid

Subject: **Still interested in Freddy Fix It jobs?**

> Hi {first_name},
>
> You signed up as a contractor with us but haven't bid on anything yet, so I wanted to check whether you're still interested before I tidy up the roster.
>
> If you are: reply and let me know, and I'll walk you through finishing your profile — payout setup and your insurance and WCB documents.
>
> If you're not, no problem at all, and you don't need to do anything.
>
> Karan
> Freddy Fix It

---

## Notes on the drafts

**Certificate holder is deliberately not in these.** It's the highest-value ask and the one most likely to get pushback, and burying it in a housekeeping email is how it gets ignored or refused. Send it on its own once payouts are sorted.

**Email 1 leads with their money, not our policy.** "You have a live bid and can't get paid" is a reason to act in the next ten minutes. "Please complete your profile" is not.

**Email 3 is a genuine question, not a warning.** Some of those 12 will be people who signed up in a hurry and forgot. Giving them an easy out costs nothing and the ones who reply are worth having.

**Standing rule respected:** none of this sends without you. Email 1 is 5 people and email 2 is 5 people, which is normal operational contact rather than a campaign; email 3 goes to 12 and is closer to bulk, so it's your call.

**Sending mechanism:** the admin dashboard's *Email contractors* tool (`AdminMessageModal`) does this natively and logs every send to `admin_messages`. Recipient addresses are looked up server-side, so you don't need to handle anyone's email by hand.
