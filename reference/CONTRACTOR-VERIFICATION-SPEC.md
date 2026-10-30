# Contractor verification — spec

**Status:** proposed, nothing built yet. Written 2026-08-16.
**Why now:** "Vetted" is the brand promise and the User Agreement defines it as *our review process was completed*. Right now that review process is: someone uploaded a file, and an AI said it looked like a real document. Nobody has ever checked with an issuer.

---

## Part 0 — What the data actually says (read this first)

I queried the live DB before writing anything. The findings change what this project is.

| | Count of 22 contractors |
|---|---|
| `status='active'` | **22** |
| `stripe_payouts_enabled` | 4 |
| Has a gov ID doc | 8 |
| Has an insurance doc | 4 |
| Has a WCB doc | 3 |
| Has a trade cert doc | **0** |
| `insurance_expiry` populated | 5 |
| …of those, parseable as a date | **0** |

Three things follow.

**1. This is a backfill project, not a signup-gate project.** All 22 contractors are already active and biddable. Every one of them is already presented to clients as vetted. Building a stricter onboarding flow protects contractor #23 onward and does nothing about the 22 who are live today. Phase 0 has to be "check the people already on the platform."

**2. Only 4 contractors have any identity verification at all.** Stripe Connect KYC is real identity verification — government ID checked against a name and date of birth by a company that is regulated to do it, and we already pay for it. Four contractors have completed it. The other 18 are active, receive job emails, can bid, can win work, and cannot be paid — and no third party has ever confirmed they are who they say they are. The 8 gov-ID uploads were reviewed by Claude looking at a photo, which tells you a document is legible, not that it is genuine.

**3. `insurance_expiry` cannot be migrated — it must be re-collected.** I masked the 5 populated values to avoid printing contractor data: the shapes are `AAAA` ×2, `AAAA-AA` ×2, `AAAA AAAA` ×1. Every character is a letter. There is not a single digit in the column. Whatever people typed, it was not a date. A text→date migration would salvage zero rows, so don't write one.

**The honest summary:** we have 22 active contractors, 4 identity-verified, 0 trade-cert-verified, and an insurance expiry field that has never once been filled in with a date.

---

## Part 1 — What can actually be verified, and how

The gap isn't a better document reader. It's that nobody ever asks the issuer.

### Identity — solved, just not switched on

Stripe Connect KYC. Already integrated, already paid for, already legally sufficient. `stripe_payouts_enabled = true` means Stripe checked a government ID against a real person. This is a stronger signal than any document we could review ourselves.

**Rule: identity is verified when Stripe says payouts are enabled. Full stop.** Don't build a parallel ID-checking process; we'd be doing worse work than the thing we already have.

Side benefit: making payouts onboarding a hard requirement for `active` fixes both problems at once. A pro who can't be paid shouldn't be bidding anyway — that's the setup where a client picks someone, work happens, and the money has nowhere to go.

### Trade certification — verifiable, manual

Alberta's **Tradesecrets Tradesperson Lookup** is a public registry. Give it a first name, last name, and either a Certificate number or an AIT ID, and it confirms whether that person holds a valid Alberta trade certificate.

Constraints worth knowing before we design around it:

- Alberta-issued certificates only. A Red Seal from Saskatchewan won't appear.
- No API. It's a web form. This is assisted-manual: we surface the name and ID on the admin screen with a link, a human checks, a human records the outcome.
- Requires the certificate/AIT number, which **we currently don't collect anywhere** — there's no column for it.

Only some trades need this at all, so the schema needs `not_applicable` as a real, first-class state, not a null.

**Which of our 23 services need a certificate.** Alberta designates 47 trades; 18 are *compulsory certification*, meaning it is illegal to perform the restricted activities without a ticket or apprentice registration. Mapping the compulsory list onto our service labels:

| Service | Compulsory trade | Require cert? |
|---|---|---|
| Electrical Work | Electrician | **Yes** |
| Solar | Electrician (PV interconnection) | **Yes** |
| Plumbing Repair | Plumber | **Yes** |
| HVAC Maintenance | Gasfitter A/B, RAC Mechanic, Sheet Metal | **Yes** |
| Air Conditioning | Refrigeration & A/C Mechanic | **Yes** |
| Appliance Repair / Install | Appliance Service Technician | **Yes** |
| Vehicle Maintenance, Battery / Brakes, Oil Change, Tire Swap | Automotive Service Technician | **Check first** |
| The other 13 | — | No |

The vehicle group needs confirming before we gate it. Automotive Service Technician is compulsory, but only for *restricted activities* — routine maintenance like an oil change or tire rotation may fall outside that definition. One call to AIT settles it; don't guess, because gating wrongly locks out pros doing legal work.

Everything else — Carpentry, Painting, Drywall / Flooring, Siding & Roofing, Landscaping, Concrete / Masonry, Windows & Doors, Cleaning, Snow Removal, Gutters, Garage, Locksmith, General Handyman — is either optional-certification or not a designated trade at all. `not_applicable`, no chip, no nag.

**A ticket is not a licence to pull a permit.** For electrical, plumbing and gas work in Calgary, the permit is pulled by a licensed *contractor*, which typically requires a Master certificate held by the business, not just a journeyman ticket held by the person. Worth confirming with the City before we describe anyone as cleared to do permitted work — "certified journeyperson" and "can legally pull your permit" are different claims.

### WCB coverage — verifiable, manual

WCB Alberta issues **clearance letters** through the myWCB portal. A clearance letter is the authoritative statement that an account is in good standing as of a date. Two ways to get one: the contractor pulls their own and sends it, or we request one with their account number and permission.

Same shape as trade certs: no API, human in the loop, and **we don't collect the WCB account number** today.

Clearance letters go stale. That's a feature — it's why this needs an expiry-driven re-check rather than a one-time flag.

### Insurance — no registry exists, so change the mechanism

There is no public database of Canadian certificates of insurance. You cannot look up whether a policy is in force. This is the one that can't be solved by checking harder.

Two changes that actually help:

**Broker-direct delivery.** Instead of the contractor uploading a PDF, the contractor's broker emails the certificate to hello@freddyfixit.ca. A forged document is one Photoshop job; a forged document arriving from a broker's own domain is fraud with a paper trail. Costs the contractor one email to their broker.

**Name Freddy FixIt Contractors Inc. as certificate holder.** This is the high-leverage one and it's nearly free. A named certificate holder gets notified by the insurer when the policy is cancelled. Expiry-date checking cannot catch a mid-term cancellation — a pro whose policy lapses in March still shows a December expiry and looks fine to us until December. Certificate-holder status is the only mechanism that closes that hole.

---

## Part 2 — Schema

### New table: `contractor_verifications`

Not more columns on `contractors`. Verification is temporal (things expire), multi-kind (four independent checks), and evidentiary (we need to record who checked, when, against what). Flattening that into boolean columns is how we ended up with `has_liability_insurance = true` and no way to know if anyone looked.

```sql
create table public.contractor_verifications (
  id           uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  kind         text not null check (kind in ('identity','trade_cert','wcb','insurance')),
  status       text not null default 'unverified'
                 check (status in ('unverified','pending_evidence','verified','expired','failed','not_applicable')),
  source       text,          -- 'stripe_kyc' | 'tradesecrets' | 'wcb_clearance' | 'broker_email' | 'self_upload'
  checked_at   timestamptz,
  checked_by   uuid references auth.users(id),   -- null when machine-derived (Stripe)
  expires_at   timestamptz,
  evidence     jsonb not null default '{}'::jsonb,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (contractor_id, kind)
);
```

Notes on the design:

- `unique (contractor_id, kind)` — one current row per check. History lives in `evidence` and in the audit trail, not in duplicate rows. Keeps every query a simple join.
- `expires_at` is what drives re-checks. Identity has none (Stripe re-verifies on its own). Insurance and WCB have real ones. Trade certs have long ones.
- `evidence` holds the shape of what was seen, never the document itself: `{"letter_date":"2026-08-14","account_last4":"…"}`. Documents stay in the private bucket.
- `checked_by` distinguishes a human decision from a derived one. When a client asks "who verified this," we need an answer.
- **Nothing in this table ever writes `contractors.status`.** A verification row is an input to the owner's decision, never a substitute for it. This is the exact failure mode we removed from `review-contractor` and from the retired `contractor-vetting-review` scheduled task; don't rebuild it here.

### `contractors` column additions

```sql
alter table public.contractors
  add column wcb_account_number   text,
  add column trade_cert_ait_id    text,
  add column insurance_expiry_date date,
  add column insurance_broker_email text,
  add column cert_holder_confirmed_at timestamptz;
```

`insurance_expiry_date` is a **new column**, not a type change on `insurance_expiry`. Reasons: the existing text column has zero salvageable values, ~20 call sites and the retired vetting task read the text column, and a rename would break `review-contractor` silently. Leave the text column in place, stop writing to it, and drop it in a later cleanup once nothing reads it.

`cert_holder_confirmed_at` records that we saw Freddy FixIt Contractors Inc. listed as certificate holder on the certificate — which is the thing that earns us cancellation notice.

### RLS

Contractors read their own rows. Admins read and write everything. **Anon and authenticated get nothing** — this table contains WCB account fragments and broker contacts. Clients see verification state only through a curating `SECURITY DEFINER` RPC that returns badges, never rows.

```sql
alter table public.contractor_verifications enable row level security;

create policy cv_own_select on public.contractor_verifications
  for select to authenticated using (contractor_id = auth.uid());

create policy cv_admin_all on public.contractor_verifications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

Same rule as `contractors`: every read of someone else's verification state goes through an RPC that curates it.

---

## Part 3 — Where it hooks in

### Onboarding (`ContractorOnboarding.tsx`, credentials + documents steps)

New fields, all optional at signup — documents are already optional and tightening that at the front door is what killed the removed "sign up now, finish later" fast track:

- **WCB account number** — text, shown when `has_wcb` is ticked. Copy: "We use this to confirm your coverage directly with WCB. We never see your claims."
- **Trade certificate / AIT number** — text, shown when the selected specialty is compulsory-certification. Copy: "So we can confirm your ticket on Alberta's public Tradesecrets registry."
- **Insurance expiry** — a real date picker writing `insurance_expiry_date`. Not a text box. A text box is how we got `AAAA AAAA`.
- **Broker email** — optional, with a one-tap "Ask my broker to send it" that pre-fills a mailto naming Freddy FixIt Contractors Inc. as certificate holder.

Each gets a `GuideBubble` "Why we ask:" line, consistent with the rest of the flow.

### Profile gaps (`contractorGaps` / `ContractorProfileCompletion.tsx`)

Verification state becomes profile gaps with the existing chip + pulse treatment. New anchors following the `cpc-*` convention: `cpc-wcb-number`, `cpc-cert-number`, `cpc-insurance-date`.

**Payouts stays non-ignorable** and gets stronger framing now that it's the identity check: not "connect your payout account" but "verify your identity and get paid." Same `skippable:false`.

The other three are ignorable gaps — a handyman genuinely has no trade cert and shouldn't be nagged forever. That's what `not_applicable` is for.

### Admin review panel (`admin_get_contractor_detail`)

Per verification kind, a row showing current status, when it was checked, by whom, and when it expires — plus the action that advances it:

- **Identity** — read-only, mirrors Stripe. If payouts aren't enabled, the existing "What's blocking their payouts?" diagnosis appears here.
- **Trade cert** — the name and AIT number rendered next to a link to the Tradesecrets lookup, and two buttons: *Confirmed on registry* / *Not found*. One click after one lookup.
- **WCB** — account number, a "Request clearance letter" mailto, and *Clearance letter received* with a date field feeding `expires_at`.
- **Insurance** — broker email, whether the certificate names us as certificate holder, expiry date, and *Certificate verified*.

Every button writes a `contractor_verifications` row with `checked_by = auth.uid()`. None of them touches `contractors.status`. Approving a contractor stays a separate, deliberate press.

### Client-facing display — the part to get right

This is where we can accidentally lie. The User Agreement is careful: "vetted" means our review process was completed, not that we guarantee anything. The UI has to match that.

**Show what was checked, not a trust score.** On the public profile (`/contractors/:id`), a short list: "Identity verified through Stripe · Trade certificate confirmed with Alberta Tradesecrets · WCB clearance letter on file (Aug 2026) · $2M liability insurance, certificate on file."

**Never show a shield, a percentage, or a badge that implies more than we did.** A green checkmark next to "Insurance" reads to a homeowner as "Freddy guarantees this person is insured." We don't guarantee that. We saw a certificate.

**Absence should be quiet, not scarlet.** A handyman with no trade certificate is not a lesser contractor. Omit the line; don't render a red X. Only Identity is universal.

Data comes through `get_contractor_profile` and `get_contractor_directory`, both of which already curate. Add a `verifications` array to their select — same pattern as when `photo_url` was added.

---

## Part 4 — Re-check lifecycle

Verification decays. A one-time check that never expires is only marginally better than no check.

### Expiry-driven sweep

A daily pg_cron job (fold it into the existing `run_reminders()` rather than adding a new cron — one more entry in a list of eight is one more thing to forget):

1. `expires_at < now()` → status becomes `expired`, contractor gets a notification, profile gap reappears.
2. `expires_at < now() + 30 days` → contractor gets a heads-up notification. Once, deduped through `reminder_log` like the seasonal nudges.
3. `expires_at < now() + 7 days` and still not renewed → admin notification. Owner decides; the system doesn't deactivate anyone.

**Nothing in this sweep changes `contractors.status`.** An expired insurance certificate on an active contractor is a thing the owner should know about and decide about. Auto-deactivation on a timer would take a pro offline mid-job, and every job they're on has money in it.

Expiry defaults: WCB clearance 90 days (clearance letters are point-in-time and that's the conventional window), insurance the certificate's actual expiry date, trade cert 3 years or the certificate's own expiry, identity never (Stripe handles its own re-verification and tells us via `stripe_payouts_enabled`).

### Health check

Add check 8, `no_unverified_active_contractors`: count contractors with `status='active'` and no `verified` identity row. **Today that returns 18** — it goes red the moment it ships, which is correct and is the point. It should stay red until the backfill is done and then never go red again without a reason.

Wire it into `platform_health_check()` alongside checks 1–7 so it rides the existing daily alert and shows in the weekly review.

---

## Part 5 — Rollout

Ordered so the riskiest work happens on the smallest surface, and so the owner never has a half-built state where the UI claims more than the data supports.

### Phase 0 — Backfill the 22 (do this before writing any code)

No deploy needed. This is email and lookups.

1. Email all 22 active contractors: to keep bidding, complete payout setup (identity) and send current insurance and WCB documents. Give a deadline. **Standing rule: ask the owner before sending — this is bulk email.**
2. For the 8 with gov ID on file, payout setup should be quick; Stripe will want the same document.
3. Run Tradesecrets lookups for whichever of the 22 are in compulsory trades. Handful of minutes each, and it's the first time anyone will have actually checked.
4. Record outcomes in a scratch sheet. The table doesn't exist yet and that's fine — Phase 1 imports the sheet.

Expect fallout. Some of the 22 won't respond, and some of those are inactive accounts we'd rather know about. Better to find out now than when a client is standing in a stranger's kitchen.

### Phase 1 — Schema (live via Supabase MCP, committed via installer)

Table, columns, RLS, an `upsert_contractor_verification` admin RPC, and the `evidence` shape. Derive identity rows immediately from `stripe_payouts_enabled` — 4 rows land verified for free. Import the Phase 0 sheet.

Nothing user-visible yet. Safe to ship on its own.

### Phase 2 — Admin surface

`admin_get_contractor_detail` gains the verification block; the panel gains the four action rows. Owner-only, so a mistake here is recoverable and invisible to clients.

This is the phase where verification actually starts happening, because until there's a button it's a spreadsheet nobody updates.

### Phase 3 — Onboarding + profile gaps

New fields, new gap chips, payouts reframed as identity verification. Affects contractor #23 onward plus every existing pro's dashboard.

### Phase 4 — Client-facing display

Last, deliberately. The badges only get shown once the data behind them is real. Showing "Identity verified" while 18 of 22 aren't would be worse than showing nothing.

### Phase 5 — Health check 8 + expiry sweep

The permanent net. Ships after the backfill so it goes green and stays meaningful, rather than being red from day one and getting ignored — which is what happens to an alert that's always on.

---

## Constraints carried from CLAUDE.md

- **DB and edge changes are applied live via Supabase MCP.** Installers commit the migration source for version control only.
- **Never `RAISE` in a trigger that must not lose its row** — set a flag.
- `SECURITY DEFINER` functions need `set search_path = public, extensions, pg_temp`. This exact bug killed every signup for a month.
- **When an RPC gains a parameter, drop the old signature first** or PostgREST hits overload ambiguity.
- **`is_admin()`-gated RPCs return `[]` in an MCP session.** Verify by running the body with the guard removed.
- Repo is public — no WCB numbers, broker emails, or contractor names in committed code or migration comments. Reference by UUID.
- **Don't send bulk email without asking.** Phase 0 is bulk email.

---

## Owner decisions (2026-08-16)

> **Revised same day.** The first version of this section gated *bidding* on payout setup. That was the wrong checkpoint — it spends friction on a contractor before they have ever seen a client, and supply is this platform's binding constraint. The gate moved to the **agreement**, i.e. the moment a pro has actually won the job. See the friction ladder in `PHASE-0-CONTRACTOR-BACKFILL.md`; the migration is `migration-require-payout-before-contract.sql`. The text below is kept because the audit finding in it is still accurate and still the reason any gate is needed at all.

**Payout setup is required before money moves.** This is the deadline mechanism — no arbitrary date needed, the gate is the date.

It is **not enforced anywhere today.** I checked `place_bid`, `list_open_jobs`, `accept_bid` and `assign_job`: none of them reference `stripe_payouts_enabled` or `stripe_account_id`. That absence is why 18 active pros have no payout account.

Where the gate goes:

- **`place_bid`** — the real one. A DB-level raise, so it can't be bypassed by a stale frontend.
- **`assign_job`** — admin assign has to check too, or the owner can route around the gate by accident. (`accept_bid` inherits it: no bid, no pick.)
- **`list_open_jobs`** — **do not filter here.** Keep the feed visible and block at bid time with a plain reason. A pro who opens an empty feed concludes the platform is dead and leaves; a pro who sees six jobs and one "set up payouts to bid on these" line converts.
- **Frontend** — dim the bid button, state the reason, link straight to payouts. Same treatment as the existing non-ignorable payouts gap.
- **`dispatch-job`** — keep emailing un-onboarded pros during the backfill; the job email is the strongest nudge we have. Revisit once the backfill is done.

**Sequencing matters.** Shipping this cold takes bidding from 22 pros to 4 overnight, and the weekly review already identifies bid depth as the platform's binding constraint. Order: email the 22 → give a stated window → then ship the gate. Not the reverse.

## Still open

1. **Automotive restricted activities** — confirm with AIT whether oil changes and tire rotations are restricted activities for an Automotive Service Technician before gating the four vehicle services.
2. **Master certificate vs journeyman ticket** — confirm with the City of Calgary what's needed to pull electrical, plumbing and gas permits, so the client-facing wording doesn't overclaim.
3. **Certificate-holder request** — send it as its own email, not folded into the document request. See the note below on why it draws pushback.
