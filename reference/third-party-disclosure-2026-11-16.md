# Third-party disclosure — what changed, and why

**Date:** 16 November 2026
**Files changed:** `/privacy-policy`, `/user-agreement` (both Parts)
**Status:** written and gate-checked, **not yet published**

This document exists so the wording can be read without reading code, and so it can be
sent to a lawyer as-is. It is background material, not instructions — see
`docs/legal.md` for the maintained rule.

---

## Why this was needed

Both legal pages already disclosed seven third-party providers. An inventory of every
external host the code actually talks to — across `src/` and all 56 edge functions —
found eleven. The four missing ones were not trivial, and one of them was serious.

**The serious one: contractor documents are read by an AI service, and nothing said so.**
When a contractor uploads their credentials, the edge function `review-contractor` sends
the file contents to Anthropic's API to check they look valid and unexpired. The documents
it sends include business licence, certificate of insurance, WCB clearance letter, trade
or Red Seal certification, **and government-issued photo identification**. Six other edge
functions also send user content to the same service: uploaded photos and videos for
safety scanning, job descriptions for repair suggestions, support chat messages, and lead
contact details for draft outreach.

Under Alberta's PIPA, a person has to be told who their information is disclosed to and
for what purpose. Sending someone's photo ID to a US processor without saying so is the
kind of gap that is cheap to fix now and expensive to explain later.

**The structural cause is worth recording.** A new third-party processor gets added to
this platform by someone writing an edge function. Nothing in that process asks "does
this add a third party to the privacy policy?" — so the legal pages drift behind the code
silently, and no check anywhere catches it. The rule added to `docs/legal.md` is: when you
add an outbound call to a new host, add the provider row in the same ship.

---

## The provider list — 7 rows became 11

The itemised table lives in **Privacy Policy §6.2** and is the single copy. The new User
Agreement §16.1 points at it rather than repeating it, because two copies of a provider
list drift apart and §6.2 is the document a regulator would actually read.

### Already disclosed (unchanged)

| Provider | Used for | Where |
|---|---|---|
| Supabase, Inc. | Database, login, file storage | United States |
| Vercel, Inc. | Website hosting | United States |
| Resend, Inc. | Sending email | United States |
| Stripe, Inc. | Payments and payouts | United States |
| PostHog, Inc. | Product analytics, session replay | United States |
| Komoot GmbH (Photon) | Address suggestions as you type | Germany |

### Newly added

| Provider | Used for | Where |
|---|---|---|
| **Anthropic PBC (Claude)** | Reviewing contractor documents (incl. photo ID); scanning uploaded photos/videos for unsafe content; suggesting a repair category from a job description; support chat replies; drafting outreach and newsletter copy for staff to review | United States |
| **Cloudflare, Inc.** | Domain name resolution, network security, bot and denial-of-service protection | United States / global |
| **Have I Been Pwned** | Checking a chosen password against known public breaches | Australia / global |
| **Unsplash** | Decorative stock photographs on article and onboarding pages | United States |

### Changed row

**Google LLC** previously read "analytics and optional Sign in with Google". It now also
names **Google Fonts**, with this point made explicitly: the site's fonts load from
Google's servers on every page, which means a visitor's IP address reaches Google **before
and regardless of whether they accepted analytics cookies**. That was true before this
change and was not disclosed. If that is not acceptable, the fix is technical, not legal —
self-host the three font files and the disclosure can be removed.

### Deliberately not listed

Code-delivery networks used when the software is built, and the public map link to the
Google Business Profile. Neither handles personal information about a user.

---

## The exact new wording

### Privacy Policy §6.5 — Public Posts on Other Platforms (new)

> We may review **publicly visible** posts on third-party platforms — currently Facebook
> (Meta Platforms, Inc.) and Reddit, Inc. — to identify people in the Calgary area who are
> openly looking for a contractor, so we can tell them the Platform exists. This is a
> one-way read: we do **not** share your account information, Job details, or any personal
> information you give us with Facebook or Reddit, and we do not use either platform to
> advertise to you. If you are contacted this way, the message will say where we found your
> post and how to opt out, and we will not contact you again if you ask us not to.

The former §6.5 (Business Transfers) became §6.6. Nothing cross-references it by number,
so this is safe.

### Privacy Policy §7 — countries updated

The cross-border transfer section previously named only the United States and Germany. It
now also names Australia (the password check) and "global networks whose exact server
location varies by request" (domain name resolution and network security).

### User Agreement §16 — Third-Party Services and Automated Processing (new)

Five clauses:

- **16.1** We run the Platform on third-party services, listed in Privacy Policy §6.2,
  which forms part of the Agreement. We may change providers; material changes get notice
  under §12.
- **16.2** Payments are processed by Stripe and subject to Stripe's own terms. We never
  receive card numbers. Held funds are not a trust or escrow account.
- **16.3** Automated and AI-assisted processing — names Anthropic, lists the five uses,
  and states that **no account is approved, rejected, suspended, priced, charged or paid
  on the basis of an automated decision alone.** Gives a right to ask a person to review.
- **16.4** Third-party providers are independent; we are not liable for their outages or
  incidents, except where liability cannot be excluded by law.
- **16.5** Links to sites we do not operate are not endorsed.

It is numbered **16**, at the end, rather than inserted in the middle. Sections 5, 6.4,
6.9, 6.10 and 13 are referred to **by number** from both halves of the page and from the
Privacy Policy. Inserting a section mid-document would renumber those and silently break
every reference, which is the sort of error nobody notices until it is quoted back at you.

### Contractor Terms §1.f — How Your Documents Are Verified (new)

Tells a contractor, before they upload, that their documents — named explicitly, photo ID
included — are stored with our storage provider and **read by Anthropic's AI service**,
that the result is **advisory only and shown to staff rather than used to approve or
reject automatically**, that clients never see the documents themselves, and that they can
request a manual review by email instead.

---

## Two things to check before a lawyer signs off

1. **Two corporate names are soft.** The legal operator of the Pwned Passwords service is
   listed as "Have I Been Pwned (Pwned Passwords)" and Unsplash is listed bare as
   "Unsplash" — Unsplash was acquired by Getty Images and the correct current entity name
   was not verified. Both are described accurately by *function*; only the registered name
   is uncertain. Worth confirming.

2. **The promise in §16.3 is now a commitment the code has to keep.** Both new clauses say
   AI output is advisory and never the sole basis of a decision. That is true today —
   `review-contractor` is advisory by design and never changes a contractor's status. If a
   future change ever lets an automated verdict approve or reject someone directly, the
   policy becomes false. This is the kind of promise worth keeping deliberately.

---

## Before publishing

**User Agreement §12 requires 14 days' email notice before an amendment takes effect.**
Publishing these pages does not send that notice; it is a separate step.

The two halves pull in different directions, and the resolution is to do both on the same
day rather than to pick one:

- The **Privacy Policy** changes mostly describe what the platform already does. Under
  PIPA, disclosing an existing practice sooner is better than disclosing it later, so
  there is no reason to delay that half.
- The **User Agreement** changes add genuinely new terms, which is what §12's notice
  period is for.

So: publish, and send the 14-day notice the same day, saying plainly that the update names
every third-party service used and explains where AI assists. Contractors are the ones
who need to read §1.f, so it is worth calling out to them specifically.
