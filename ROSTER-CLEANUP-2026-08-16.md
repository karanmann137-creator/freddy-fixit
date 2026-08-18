# Roster cleanup — 16 Aug 2026

**Done and live.** 11 contractors moved from `active` to `pending`. Fully reversible, see below.

## What changed

Your active roster went from **22 to 11**. Every one of the 11 remaining has either placed a bid or finished payout setup — so the list a client sees is now people who have actually shown up.

The share of your visible roster carrying a verification marker went from **6 of 22 (27%) to 6 of 11 (55%)**.

## Who moved, and why they qualified

All 11 had, between them: **zero bids, zero jobs, zero documents of any kind, and no payout account.** They completed signup and stopped.

| Contractor ID | Joined | Last signed in |
|---|---|---|
| `a01c49f7-0ba6-4e0a-bc81-aba53baebcb7` | 2026-06-01 | 2026-06-01 |
| `44748517-72d6-440a-ab06-b13e2660cc80` | 2026-06-01 | 2026-06-05 |
| `d50b5a94-433d-4975-a07d-0b4aaabd4ed1` | 2026-07-17 | 2026-07-06 |
| `9240c7b1-680d-4582-b1fa-bd19d22b1da6` | 2026-07-17 | 2026-07-11 |
| `44c3148f-3a06-4cfb-b53b-d0859f573169` | 2026-07-17 | 2026-07-28 |
| `e79c8293-4642-4de3-87e1-b60deb324fc2` | 2026-07-22 | 2026-07-22 |
| `0433f963-2e43-41ff-a162-1fcf22da7215` | 2026-07-25 | 2026-07-25 |
| `72d329a8-754e-4a98-b63d-11bee9c304a7` | 2026-07-28 | 2026-07-28 |
| `d6eed5b1-090e-4001-9b10-2b7ba4b799e5` | 2026-08-01 | never |
| `51c5bb65-0fe4-47f1-8885-2094670a4095` | 2026-08-02 | 2026-08-02 |
| `55aab20b-c21a-4f63-a9a5-b678a2520a81` | 2026-08-09 | 2026-08-12 |

**The first two are your seed accounts** (the ones in CLAUDE.md with no company name and no vetting answers). If you know them personally and want them back on, say so — it's one line.

**The last one signed in four days ago** and claimed 18 specialties. That's the one I'd most expect to be a live person who just hasn't seen a job worth bidding on. Worth a second look before the roster settles.

## Who I deliberately did NOT move

`4911d340-04a7-4fdc-baa1-3169ad87cfde` — joined 4 Aug, never bid, no documents, **but has completed Stripe payout setup.** That is the single hardest step in the whole onboarding and nobody does it by accident. Someone who connected their bank account wants to work; they just haven't found a job yet. Deactivating them would be the exact mistake we spent this afternoon avoiding.

## What `pending` actually does to them

- They disappear from `get_contractor_directory`, so clients stop seeing them as vetted pros.
- `list_open_jobs` returns **nothing** — their job feed goes empty.
- `place_bid` raises *"Your contractor account is not active yet"* if they try anyway.
- They stop being matched by `dispatch-job` and `notify_contractors_new_request`, so the job emails stop.

**No email was sent to any of them.** The two triggers on `contractors` are both AFTER INSERT only — verified against `pg_trigger` before running this. Nothing fires on an UPDATE, so this was silent.

The empty job feed is the one thing to keep in mind. If one of these people logs in next week, the platform will look dead to them rather than telling them why. That is the argument for eventually showing a "your account is pending approval" state on the contractor dashboard instead of an empty list — not urgent at 11 accounts, but it is a real rough edge.

## Reversing it

Any single person:

```sql
update public.contractors set status = 'active'
 where id = 'PASTE-THE-ID-HERE';
```

All eleven at once:

```sql
update public.contractors set status = 'active'
 where id in (
   'a01c49f7-0ba6-4e0a-bc81-aba53baebcb7','44748517-72d6-440a-ab06-b13e2660cc80',
   'd50b5a94-433d-4975-a07d-0b4aaabd4ed1','9240c7b1-680d-4582-b1fa-bd19d22b1da6',
   '44c3148f-3a06-4cfb-b53b-d0859f573169','e79c8293-4642-4de3-87e1-b60deb324fc2',
   '0433f963-2e43-41ff-a162-1fcf22da7215','72d329a8-754e-4a98-b63d-11bee9c304a7',
   'd6eed5b1-090e-4001-9b10-2b7ba4b799e5','51c5bb65-0fe4-47f1-8885-2094670a4095',
   '55aab20b-c21a-4f63-a9a5-b678a2520a81'
 );
```

You can also do it one at a time from the admin dashboard's Accounts tab with the Approve button, which is the same thing with a nicer surface.

## The thing this does not fix

Moving someone to `pending` is a filing decision, not a conversation. Eleven people signed up to work and never did, and nobody has ever asked them why. Draft email 3 in `PHASE-0-CONTRACTOR-BACKFILL.md` is that conversation — it goes to exactly these people and asks whether they're still interested. It hasn't been sent.
