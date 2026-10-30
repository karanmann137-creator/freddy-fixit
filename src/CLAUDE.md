# src/ — Frontend (CLAUDE.md)

React 19 + TS + Vite + Wouter + Framer Motion. Import alias `@/` → `src/`. Styles are inline style objects (no CSS framework). See root `CLAUDE.md` for the deploy/installer model.

## Routes (App.tsx)
Public: `/` (Home), `/login`, `/update-password`, `/client-onboarding`, `/contractor-onboarding`, `/contractors` (Browse), `/client-success`, `/contractor-success`.
Protected via `ProtectedRoute` (role-gated): `/client-dashboard`, `/contractor-dashboard`, `/admin-dashboard`.
Internal: `/ui-lab` — every `components/ui/` primitive against the real tokens, with a live dark/light flip. **Unlinked and noindexed** (sets `robots` on mount and **removes it on unmount** — `upsertMeta` mutates in place, so a stale robots tag would silently noindex the next page). Delete `pages/UiLab.tsx` and its route together once all three dashboards are ported.

## `components/ui/` — the shared dashboard primitives (added 2026-10-30)
**Mount these rather than re-deriving a row/button/pill in a page.** Three dashboards previously shared nothing but a copy-pasted `.ffdash` style block, so "how a row looks" was three edits in three ~200KB files and the copies had drifted. `Pass`/`PassTop`/`IconButton`, `StateLine`, `Hero`/`HeroSub`/`PassMeta`, `JobSwitcher`, `Group`/`Sheet`/`Row`, `Stepper`, `Pill`, `Button`/`ButtonRow`/`Stack`, `AttentionCard`/`TrustLine`, `Mark`. Import from `@/components/ui`.
- **A primitive carries no business logic.** One that knows what `fully_funded` means is not a primitive — that belongs in the page.
- **No Framer Motion here**, ever. Only `Home`, `ClientSuccess`, `ContractorSuccess` import it and that must stay true; the motion is CSS transitions plus `@keyframes ffu-pls`.
- **Classes are all prefixed `ffu-`** in one injected sheet (`uiStyles.ts`, idempotent, injected on import). The names this design wants — `row`, `btn`, `pill`, `sheet`, `step` — are far too generic for a document-wide stylesheet; unprefixed, `.row` alone would reach unrelated markup and break it silently.
- **Nothing is hard-coded**; every value resolves through `--ff-*` in `main.tsx`. That is what lets `Pass` re-theme from one prop.
- **`<Pass forceNavy>` (default true) applies `ff-on-dark ff-anchor`** — the dormant modifier `main.tsx` kept "in case a future band genuinely needs a forced-navy exception". This is that band. `forceNavy={false}` is the whole change if the pass should follow light mode instead, so **don't hard-code `#111827` inside and take that switch away**.
- **`StateLine` is the palette gate: orange appears exactly once per screen, and only when the answer is "you".** A waiting screen has no orange on it anywhere — that is what makes orange legible as a call to action elsewhere. Wanting a second orange thing means you want `wait` or a neutral `Pill`.
- **One `--ff-gut`** is shared by a `Row`'s icon column and its separator inset, so a hairline can never disagree with the column above it. `.ffu-ri-wrap` renders even with no icon for the same reason.
- `Row` renders a `<button>` only when given `onClick` (a non-interactive row as a button is announced pressable and Tab-reachable for nothing), and `AttentionCard` caps at `max` rows (3 client / 4 contractor) and returns **null** when empty.

## Key pages / components
- `pages/ClientOnboarding.tsx` — on mount checks the session and **branches**: logged-out → 3-step signup flow (calls `supabase.auth.signUp`, creates profile + first request); logged-in → renders `<NewRequest/>`. **Exports `SERVICES` and `SCHEDULES`** (consumed by NewRequest).
- `components/NewRequest.tsx` — returning-client new-request form. Reuses session + saved profile/last-request details, asks "same address as last time?", inserts a `client_requests` row (no signup), redirects to dashboard. Imports `{ SERVICES, SCHEDULES }` from ClientOnboarding (circular import is fine — only used at render time).
- `pages/ClientDashboard.tsx` — loads profile+requests in parallel, then contractor+job (job query embeds `messages(*)`). Realtime 🔔. "+ New Request" → `/client-onboarding`.
- `pages/ContractorDashboard.tsx` — embedded select avoids N+1; earnings stats read DB-maintained `contractor.total_earned` / `total_jobs` (single source of truth, not recomputed).
- `pages/AdminDashboard.tsx` — requests/contractors/jobs tabs with **range-based pagination** (20/page; reloads on page change). Approve/Deactivate call `admin_set_contractor_status` RPC. Shows a **re-signup warning** on contractor cards (hashes the contractor's email/phone/name and matches `deleted_account_flags` where `was_poor`; hashing helpers must stay byte-identical to the `delete-account` edge fn).
- `pages/BrowseContractors.tsx` — reads `get_contractor_directory()` RPC (replaces old contractor_directory view; SECURITY DEFINER, contact-free columns).
- `components/DeleteAccount.tsx` — danger-zone card + typed-"DELETE" modal → `supabase.functions.invoke("delete-account")` → signOut + redirect. Surfaces the function's JSON `error` body (e.g. active-job block).
- `components/RequestPhotoQuote.tsx` — photo/quote widget for an existing request (not a new-request entry point).
- `components/TopNav.tsx` — nav + realtime notifications bell. Wrapped in `.ff-on-dark` so it stays navy in light mode; paints its background only once scrolled (`ff-nav-lifted`).
- `components/PasswordField.tsx` — **the one password input on the platform** (all four password-taking pages). Reveal eye + strength meter + HIBP breach check. See root CLAUDE.md → Account security.
- `components/TwoStepPanel.tsx` — enrol/disable two-step sign-in from Settings; pairs with the code gate on `Login.tsx`.

## Shared lib modules worth knowing before you add one
These exist specifically so a second copy doesn't drift. Check here before writing a helper.
- `lib/myProfile.ts` — `getMyProfile(userId)`: the one cached answer to "who is signed in and what role are they?". Caches the in-flight promise, never caches absence. Call `clearMyProfile()` after any write to `profiles.role`.
- `lib/mfa.ts` — `MfaStatus` + `mfaReason()`, the single reason→English map for the `mfa_*` RPCs.
- `lib/passwordStrength.ts` — `scorePassword()`, `checkPwned()` (k-anonymity; the password never leaves the browser), `formatBreachCount()`.
- `lib/seo.ts` — `upsertMeta()`. **One copy.** It was pasted into six SEO routes and drifted silently.
- `lib/referralCode.ts` — `applyReferralAtSignup()`; cannot throw, and a network error is not a bad code.
- `lib/notificationRoutes.ts` — `noteTarget(type, jobId, dashboardPath)`; unknown types fall back to the dashboard root.
- `lib/imageCompress.ts` — `compressImage(file, profile)`; **every failure path returns the ORIGINAL file**.
- `lib/platformStatus.ts`, `lib/servicePricing.ts` — already session-cached with the same module-level `cache` + `inflight` pattern as `myProfile`.
- Also: `chatParse.ts`, `chatUnread.ts`, `jobCode.ts`, `recurrence.ts`, `checklistTemplates.ts`, `stripeRequirements.ts`, `contractCopy.ts`, `contractorGuide.ts`, `blogDb.tsx`, `analytics.ts`, `respTime.ts`, `reviewPrompt.ts`.

## Service categories — keep these in sync
Canonical list = `ContractorOnboarding.tsx` `SPECIALTIES` (stored in `contractors.specialties`). `BrowseContractors.tsx` `CATEGORIES` **must match these strings exactly** (filter uses exact array containment). `Home.tsx` `SERVICES` and `ClientOnboarding.tsx` `SERVICES` carry their own (sometimes reworded) variants + extras like "Other". Adding a category = edit all four.
Current set: General Repairs, Plumbing, Electrical, HVAC, Carpentry, Painting, Drywall, Flooring / Tile, Tire Swap / Rotation, Oil Change, Battery / Brakes, Vehicle Maintenance, Landscaping, Snow Removal, Gutters, Windows & Doors, Siding & Roofing, Garage, Air Conditioning, Cleaning Services.

## Conventions
- Privileged writes go through RPCs / edge functions, not direct table writes (e.g. status changes, bids, deletion). Reads use `supabase.from(...)`.
- Photos upload to Storage under a `${userId}/` prefix (buckets: `problem-photos`, `completion-photos`, `portfolio-photos`).
- JSX/$ gotcha: write money as `{"$" + n.toFixed(2)}`; embed CSS via `<style>{"..."}</style>`; avoid backtick template literals in generator scripts.
- No typecheck on build — esbuild does no typecheck, so `npm run typecheck` (tsconfig.check.json, baseline **0 errors**) is the only thing that catches a broken module. `vite build` runs on the owner's machine only.
- **Never call a supabase query inside `onAuthStateChange`** — it deadlocks. Do it on route change instead. A synchronous cache-clear in that callback is fine.
- **Use `.maybeSingle()`, never `.single()`** for profile/role lookups.
- **A failed read is not an empty result** — surface "couldn't load" rather than rendering a confident zero.
- `supabase.functions.invoke` throws away the response body; dig a 409/428 reason off `error.context`.
