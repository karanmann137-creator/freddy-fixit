# Contractors

## Onboarding
`ContractorOnboarding.tsx`, **5 steps** (2026-08-19, was 8): basics → what you do (specialties + line of work) → where & when (service area + availability) → credentials → photo & documents. **The only submit path is the final "Complete Registration"** — an earlier "sign up now, finish later" fast-track was removed because it produced accounts with almost nothing, which is why the 8→5 merge dropped SCREENS and not a single question: the metadata object and the `contractors.upsert` are byte-identical to the 8-step version.

**Ordering is load-bearing.** `form.workType` must be answered on step 2 because `wt` drives both the credential copy on step 4 and the per-document `required` flags on step 5. `TOTAL`, the 5-element `STEP_TITLES` array (indexed `[step-1]`) and every `if (step === N)` in `validate()` move together — and the draft-restore clamp `d.step <= TOTAL` is what makes a stale 8-step draft land on step 1 instead of a blank screen.

Borrowed from the client flow: **`ServicePicker`** for specialties (passed **`allowCustom={false}`** — an off-list specialty is in no `service_specialty_map` row, so it would match no request and silently starve that pro of leads; the prop defaults to `true` so ClientOnboarding/NewRequest are unchanged), **`VoiceDictate`** on the references textarea (renders `null` where the Web Speech API is missing, so no feature detection is needed — and the step-4 guide tip deliberately doesn't mention a microphone that might not appear), and a **postal-code box** above the zone chips. It is **never stored**: `areasFromPostal()` (from `src/lib/calgaryAreas.ts`) pre-ticks the chips, which are what `service_area` saves and what all three matchers read. It only ever ADDS zones, so a deliberate pick survives typing a postal code elsewhere, and an unrecognised code suggests nothing rather than guessing.

**It used to be an `AddressAutocomplete` + a local `zonesFromAddress()`, and both are gone (2026-09-09).** The address was never saved either, but asking for one at all set the wrong expectation on a form whose only real location answer is the chips — and a home address tells the matcher nothing `service_area` doesn't already say. The local `const AREAS` was deleted in the same pass: the contractor side and the client side each held their own copy of the same eight zones, **and one of those lists is matched against the other by every matcher on the platform**. Two copies of a list that MUST agree is a drift waiting to happen, and a drift here surfaces as jobs quietly never reaching a pro rather than as an error. Both sides now import `AREAS` from `calgaryAreas.ts` and derive chips with the same function.

Documents are **optional at signup** (added later from the dashboard; admin approval still gates jobs). Phone is optional. Uploads use `accept="image/*,application/pdf"` so iOS transcodes HEIC. Drafts persist to `localStorage['ff_contractor_draft']` (never the password) with a "We saved your progress" banner + Start over. Names prefill from Google metadata or the email local-part, only ever into empty fields.

**⚠️ The signup-killer (2026-07-16).** EVERY signup silently failed for ~a month. `handle_new_user` → profiles insert → `assign_referral_code()` → `gen_referral_code()` → unqualified `gen_random_bytes(6)`, but pgcrypto lives in `extensions` — 42883, swallowed by the catch-all, whole transaction rolled back = auth user with no profile. Fixed in `gen_referral_code()` and `admin_resignup_matches()` by `set search_path = public, extensions, pg_temp` + schema-qualifying `extensions.gen_random_bytes/digest`, plus an inner exception guard in `assign_referral_code()` so a referral-code failure can never block signup again. (`ff_hash()` was fixed at the same time and dropped as dead on 2026-08-23.) **This is why the search_path gotcha is in the list.**

**Orphan recovery** (Google one-tap creates an `auth.users` row instantly, before any profile exists): `ensure_profile(p_role)` RPC self-repairs — role from metadata → p_role → 'client', names from metadata or the email local-part. Both dashboards call it on a missing row and re-fetch. `ProtectedRoute` uses `.maybeSingle()` and **passes through** users with no profile. `FinishSignupBanner.tsx` (mounted in App.tsx, checked on route change — **never inside `onAuthStateChange`**) shows a bottom banner with a CTA to the right onboarding. Admin has **finish-signup-nudge** (`{dryRun:true}` previews, `{confirm:"SEND"}` sends).

**Duplicate prevention:** `check_signup_availability(p_email, p_phone)` (anon-callable; phone compared digits-only on the last 10). Backstop trigger `enforce_unique_signup_phone()` **BEFORE INSERT on auth.users** raises `PHONE_TAKEN` (the AFTER-INSERT `handle_new_user` swallows errors, so it can't be the guard). No UNIQUE index — two seed accounts share a number. Also: with email confirmation on, Supabase returns a **fake success** for an already-registered email (`user.identities.length === 0`) rather than an error — check for it.

`GuideBubble.tsx` (the Freddy speech-bubble reframe + "Why we ask:" line) was **removed from both onboarding flows on 2026-08-24** in favour of `OnboardingProgress.tsx` — a numbered step bar — plus a single short `STEP_TITLES[step-1]` line. The step count is now carried visually by the bar, so nothing textual repeats it.

**The file itself was DELETED on 2026-09-17, and this line is why it needed checking twice.** This paragraph said GuideBubble "is still used on `NewRequest`" right up until the 2026-09-09 returning-client pass took it out of there too — so the doc claimed a live mount that no longer existed, and a filename grep appeared to agree because `OnboardingProgress.tsx` names it in a comment. **An import-graph walk from `src/main.tsx` is the authority on reachability, not a grep and not this file**; it put GuideBubble in a set of exactly two unreachable `src/` files (the other being `src/CLAUDE.md`, which is documentation). When a component is retired from its last mount, delete it in the same pass — a dead file that a stale doc vouches for is worse than either alone.

## Profile completion
`contractorGaps(c)` in ContractorDashboard returns `{key, label, anchor}[]`; `contractorMissing(c)` is its `.map(g => g.label)`. `ContractorProfileCompletion.tsx` exports `GAP_ANCHORS` (`cpc-photo` / `cpc-area` / `cpc-worktype` / `cpc-credentials` / `cpc-docs`) and takes a `highlight` prop.

**`ContractorProfileCompletion` renders whether or not anything is missing.** It used to be hidden the moment the profile was complete, which left a finished contractor with no way to change their photo, area or credentials ever again — the card just turns from orange-nudge to plain.

**Profile photo (2026-08-05).** `contractors.photo_url`, public **`contractor-photos`** bucket at `<uid>/avatar.<ext>` with `upsert:true` — same convention as signup, so adding one here overwrites the signup upload. Overwriting the same path leaves the old image in the CDN cache, so the stored URL is stamped `?v=<Date.now()>`; without that a replaced photo looks like it didn't save. Missing photo is a normal profile gap (chip + pulse, ignorable, **no email** — an owner decision). Clients see it as a 44px avatar on each bid row in `ClientDashboard`, falling back to initials rather than a broken image; the data comes from `get_contractor_directory`, whose `.select()` there had to gain `photo_url`.

## Verification markers (2026-08-16)
`src/components/VerifiedMarks.tsx` renders up to three chips on each bid row and on the public profile, fed by three booleans added to `get_contractor_directory()` and `get_contractor_profile()`: `id_verified` (= `stripe_payouts_enabled`), `insurance_on_file` and `wcb_on_file` (= a non-empty `doc_urls` key). Both RPCs return a fixed `TABLE(...)`, so adding the columns needed **DROP then CREATE**, not `CREATE OR REPLACE`, and the grants had to be re-issued — and as with `photo_url`, the `.select()` at the ClientDashboard call site must name each new column or PostgREST silently omits it.

**The wording is load-bearing.** Only `id_verified` says "verified", because Stripe had a regulated third party check government photo ID. Insurance and WCB say **"on file"** — a claim about what we hold, not about whether the document is current or genuine. Never promote an "on file" marker to "verified" without a real check behind it. Trade certificate is deliberately absent until there is a Tradesecrets lookup: it is the marker most likely to be read as "licensed for compulsory work", so it is the one that could push someone into an unsafe hire.

**Absence is quiet, not scarlet** — no red X, no "unverified" badge, no trust score, because a brand-new pro still has to be able to win their first job. This is what makes the friction ladder work: verification is an incentive (verified pros visibly win more) rather than a gate on bidding. Today 6 of 22 active pros show any marker.

**Owed:** once `insurance_expiry_date` is a real parsed date, `insurance_on_file` must also test `expiry > now()` — showing "insurance on file" for a lapsed policy is worse than showing nothing, because the client relies on it.

`focusProfileGap(anchor)` switches to the Profile tab, then `requestAnimationFrame` + 60ms (so the tab paints before measuring) → `scrollIntoView({block:"center"})` → `.ff-pulse` for **4500ms** (1.5s × 3 keyframes + a persistent orange outline; `prefers-reduced-motion` gets a static tint).

The banner renders each gap as a tappable chip plus an **"Ignore — my profile is complete"** link, persisted to `contractors.setup_skipped` as `profile_nudge:<sorted gap keys>` — **keyed to the gap SET**, so if the gaps later change the reminder returns on its own. The Profile-tab card is deliberately NOT hidden by the ignore.

**Payouts is non-ignorable** — the Get-set-up checklist step is `skippable:false`, the standalone banner has no ignore, and both the filter and the per-row check read `st.skippable && skipped.includes(st.key)` so a historic `"payouts"` skip can't keep it hidden.

`ProfileCompleteCelebration.tsx` fires confetti on the incomplete→complete transition.

## AI document review
**review-contractor** (v12) fires non-blocking after doc uploads: downloads from the private `contractor-docs` bucket, sends to Claude with a vetting checklist (insurance: valid CoI, not expired, Alberta, $1M+; WCB: clearance ≤90 days; cert: valid trade cert / Red Seal; gov_id: photo ID matching the name), and writes `contractors.review_status` + `review_result` jsonb.

**Advisory only** — it never touches `contractors.status`. It previously auto-activated contractors on a pass, bypassing the owner. Pass email says "docs passed our automated checks, final review underway", NOT "you're approved". `verify_jwt=true` plus an in-code gate (caller must be that contractor or an admin) — it used to be callable by anyone with a contractor_id. `review_status='pending'` means it never ran (no docs).

**Open:** at least one contractor has `review_status='rejected'` with an empty `review_result={}` — the verdict isn't always recording, so no reason exists to show them. Advisory, so it doesn't block.

## Contractor dashboard
Left `DashboardSidebar`: My Jobs / Messages / Available Jobs / Calendar / Earnings / Reviews / Profile. Footer actions: Request help / Report a bug (both `src/components/RequestHelpModal.tsx`, `mode="help"|"bug"` → `support-request` edge fn), Settings, Log out. Opens with "Welcome, {first_name}" + account status, an incomplete-profile banner, and **Needs your attention**.

- **Pipeline strip** — six stage cards with live counts (New leads → Needs your estimate → Awaiting client → Scheduled → In progress → Awaiting payment). Clicking toggles `jobFilter`; module-level `STAGE_MATCH` / `STAGE_LABEL` are shared by counters and filter so counts always equal what a click shows.
- **Calendar** — `JobsCalendar.tsx`, Sunday-start month grid bucketed by LOCAL `scheduled_at`, ≤2 chips per cell, statuses legend, unbooked-jobs nudge, selected-day detail.
- **Earnings** — `get_contractor_earnings_stats()` (this week/month/last month/year/lifetime + pending + 8-week trend), `set_weekly_goal`, goal progress bar, auto insight line, reliability streak, `contractor_response_stats` speed-to-lead (formatted by `src/lib/respTime.ts`), real-profit rollup from `job_expenses`.
- **Get-set-up checklist** — profile → payouts → availability → first bid.
- **Freddy Rewind** — `src/components/FreddyRewind.tsx` (mode client|contractor), `get_contractor_rewind()` / `get_client_rewind()`, canvas 1080×1350 PNG share card embedding the referral link.

## Contractor guide
`src/lib/contractorGuide.ts` is the **single source of truth** (`_TITLE`/`_PREHEADER`/`_URL`/`_MD`) shared by the page, the newsletter issue and the welcome email so they can't drift. Twelve sections; **money is described in plain English with NO percentages** (deliberate — the payment system may change again). Emphasises the step most pros miss: **ask the client to confirm the work is done, because that's the only way the money moves.**

Rendered by `src/pages/ContractorGuide.tsx` at the **public** route `/contractor-guide` (public so the emailed link works logged-out). Reachable from Settings, a dismissible dashboard card (`localStorage['ff_seen_contractor_guide']`), and the `contractor_guide` notification route.

## Public profile
`/contractors/:id` — `get_contractor_profile` (gated `status='active' OR is_admin()`). **`await supabase.auth.getSession()` before the RPC** or a fresh tab fires it before the JWT hydrates and an admin sees "not found" for pending contractors. "← Back" resolves the viewer's role and returns them to THEIR dashboard. "Book This Contractor" carries `?pro=` for the preferred-pro reservation.

Admins additionally see an **Admin Review panel**: `admin_get_contractor_detail(p_id)` renders full vetting (contact, trade, experience, availability, credentials, references, pricing, payouts, Google reviews, AI verdict), per-document signed-URL buttons, and Approve / Deactivate.

---

