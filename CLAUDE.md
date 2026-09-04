# Freddy Fix It — CLAUDE.md

Calgary home-services marketplace. Client posts a request → contractors bid (or admin assigns) → client picks → job lifecycle → payment → review.
Live: https://freddyfixit.ca (+ www), https://freddy-fixit.vercel.app · Supabase project ref `kvypmjxbbaaknvddwwai`

The owner is **non-technical** and deploys by pasting terminal commands. Optimize every answer for that:
ship one runnable thing, keep explanations short, never assume CLI fluency.

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Wouter (routing) + Framer Motion. Build = `vite build` (esbuild, **no typecheck** — type errors don't block deploys). There is **no `.css` file** in `src/`; global styles are injected in `main.tsx`.
- **Backend:** Supabase only (Postgres + Auth + RLS + Storage + Edge Functions). No app server. "API" = PostgREST (`supabase.from(...)`) for reads + `SECURITY DEFINER` RPCs / edge functions for privileged writes.
- **Deploy:** Vercel auto-deploys from GitHub `main`. Email via Resend. DNS via Cloudflare. Payments via Stripe Connect. Analytics GA4 `G-WFMM73FJVL`.
- Details by area: see `src/CLAUDE.md` (frontend) and `supabase/CLAUDE.md` (DB/functions).

## How work ships (READ THIS FIRST)
Repo `github.com/karanmann137-creator/freddy-fixit` is **PUBLIC**. The assistant can clone but **cannot push**; the owner deploys by running an installer script.

1. Clone once per session. The clone is **cumulative** — keep editing it across turns; don't re-clone mid-project (you'd lose un-pushed edits).
2. Edit files in the clone. Validate before shipping (see below).
3. Emit ONE installer `.sh` that base64-decodes each changed file into `~/freddy-fixit/`, then `git add -A && commit && push`. Verify the installer round-trips (decode == source) and `bash -n` before presenting.
4. Owner runs `bash ~/freddy-fixit/apply-<x>.sh`, waits for `✅ … pushed`, then hard-refreshes (Cmd+Shift+R). If git complains, prefix `rm -f ~/freddy-fixit/.git/index.lock &&`.

**Installer rules:**
- **Prefer a MINIMAL installer** carrying only the files you changed. Superset installers carry FULL copies of every listed file, so one built from a stale clone silently reverts newer work — it has broken production twice (`56f96d3` wiped the pipeline strip/calendar; `fa5e2b5` orphaned `ContractPanel` and made **every job unpayable**). If you must ship a superset, regenerate every file from the CURRENT repo.
- Installers are cumulative per file; the owner runs only the newest.
- **Decode with `base64 -d < /tmp/f > path`, never `base64 -d /tmp/f > path`.** macOS base64 rejects a positional input file (`invalid argument`) and wants `-i`; GNU accepts both. The stdin redirect is the only form that works on both, and the sandbox is Linux so this can't be caught locally — `bash -n` passes either way.
- **⚠️ Never redirect a decode straight onto the destination file. Decode to `/tmp`, check the byte count, THEN `cp`.** The shell truncates a redirect target *before* the command runs, so the positional-argument form above didn't merely fail — it left **`src/pages/ClientDashboard.tsx` at 0 bytes**, and `set -euo pipefail` aborted the script before anything could notice. That 0-byte file was then committed and pushed (`b1361b6`), and because `App.tsx` lazy-imports it, **every client visiting `/client-dashboard` got a crash** until it was restored from `HEAD~1`. Installers now carry a per-file expected byte size and refuse to write on a mismatch, so a bad decode is non-destructive.
- **A byte-level round-trip verifies the INSTALLER, not the payload.** The regenerated installer round-tripped perfectly — against the already-corrupted working tree — and reported "13 files decoded, 0 mismatched". Also check each file against a sanity floor and against `git cat-file -s HEAD:<path>`, and confirm `npm run typecheck` is 0 errors. **`vite build` cannot catch this**: esbuild does no typecheck, so an empty module builds fine and only explodes at runtime inside `React.lazy`. Typecheck was the only thing that caught it (`TS2322: Property 'default' is missing`).
- **DB and edge changes are NOT applied by installers** — apply them live via Supabase MCP. Migration + edge source is committed via the installer for version control only.
- **⚠️ The repo copy of an edge function can lag the deployed one, and the deployed one is the truth.** Because installers don't deploy edge code, `supabase/functions/<slug>/index.ts` is documentation, not the artefact. Regenerating a deploy from a stale repo copy silently reverts live work — the edge equivalent of the superset-installer outages above. **Read the deployed source with `get_edge_function` before editing any edge function.** Known stale as of 2026-09-01: `create-payment-intent` (deployed v19), `stripe-webhook` (v19), `resolve-dispute`, `adjust-payment`.
- `mcp__cowork__present_files` can't present `.sh` — give the run command as plain text.

## Build / validate
```
npm install                             # first time
npm run typecheck                       # tsconfig.check.json — baseline is 0 errors
npx esbuild <file> --loader:.tsx=tsx    # per-file parse check
npx vite build                          # full build — OWNER'S MACHINE ONLY
```
`vite build` **cannot run in the Linux sandbox** (rolldown ships a darwin-only native binding). Validate with typecheck + esbuild and embed `vite build` in the installer as the owner-machine gate.
CI: `.github/workflows/typecheck.yml` runs `npm run typecheck` non-blocking on push/PR to main.

## Brand tokens
Navy `#1a2236` · section navy `#151d2e` · footer `#111827` · orange `#ea6b14` · text `#f0f4ff`.
Fonts: Bebas Neue (headings), DM Sans (body), loaded per-page via a Google Fonts `<link>`.

**`.ff-on-dark` is how navy survives light mode (2026-08-19).** Light mode had almost no brand colour in it: `--ff-bg` and `--ff-surface` were both effectively white, so the 60 and the 30 of the 60/30/10 collapsed into one value and the site read as white + near-black + orange. Dark mode only looks like the brand because its 60 AND its 30 are both navy.

The fix is a scope class in `main.tsx` that re-declares the whole dark token block. **Custom properties resolve at the point of use**, so wrapping a subtree in `ff-on-dark` makes it — its cards, its hairlines, every `rgba(var(--ff-fg), …)` overlay — render exactly as it does in dark mode, with no per-component changes. In dark mode every value is already in effect, so **the class is a no-op and dark mode cannot regress**; `check_tokens.js` asserts that mechanically (30/30 properties identical) rather than trusting that 25 copied lines are right by eye.

**The catch that makes it subtle: a `var()` inside a custom-property DECLARATION is substituted where it is declared, not where it is used.** `--ff-c60: var(--ff-bg)` therefore froze to the light value on `:root` and would have inherited into `.ff-on-dark` still white. The seven aliased tokens (`--ff-c60`, `--ff-c30`, `--ff-ink-1..4`, `--ff-hair`) are spelled out as literals inside the class for exactly that reason — add a new alias at `:root` without a literal here and it will silently render the wrong theme.

Mounted on **TopNav** (navy in both themes — which is also what keeps it legible where it floats over the hero), the **Home hero** (its warm glow, near-black bottom gradient and ink watermark icons all assume a dark ground and read as a smudge on white), the **Freddy Verified band** and the **Footer**. `SettingsModal` is deliberately rendered OUTSIDE the nav's wrapper: it lives in that component only because the gear that opens it does, and inheriting the nav's tokens would render a full-screen navy modal over a light page. The dropdown menu stays inside on purpose — that one really is nav chrome. Page ground stays light: light mode exists so someone can read a contract or an invoice in daylight, and a tinted ground is what makes that unpleasant.

**The nav paints on scroll, not always (2026-08-19).** The first version of the above painted the ground with a single blanket rule, `:root[data-theme="light"] .ff-on-dark { background-color: var(--ff-bg) }`. A specificity audit showed that rule only ever did real work on the nav — it lost to the Footer's inline style, and the hero resolves to the same navy under scope anyway — and what it did there was **cut a hard horizontal seam across the hero**, because a fixed opaque bar sits directly on top of the hero glow whose ellipse centre is at about +9vh. Light mode got exactly the flattening the rule's own comment said it was gated to avoid.

It is replaced by three rules that are theme-agnostic:

- `main.tsx` — `.ff-nav-wrap { background-color: var(--ff-bg); border-bottom: 1px solid transparent; transition: … }` plus `.ff-nav-wrap.ff-nav-lifted { border-bottom-color: var(--ff-hair); box-shadow: … }`. Because the wrapper carries `ff-on-dark`, `--ff-bg` is navy in **both** themes. This also fixes a pre-existing dark-mode bug where the nav never painted at all and body text scrolled visibly under it.
- `Home.tsx` — `.ff-nav-wrap:not(.ff-nav-lifted) { background-color: transparent; }`. It lives in **Home's own `<style>` block on purpose**, so it unmounts with the page and no other route can inherit a transparent nav. Specificity 0,2,0 beats the 0,1,0 base rule regardless of sheet order (preferred over `body:has(.ff-hero)`, which would have raised a support question for nothing).
- `TopNav.tsx` — a `lifted` state on `window.scrollY > 12`, `{ passive: true }`, with `onScroll()` **called once on mount** because a refresh restores scroll position without ever firing a scroll event. `.ff-nav-wrap.ff-nav-lifted { pointer-events: auto; }` also overrides the wrapper's blanket `pointer-events: none` — once the bar is an opaque slab over real content, letting clicks through means tapping the navy hits a link the user cannot see.

**The light-mode peek (2026-09-01).** Light mode existed and was effectively invisible — nobody discovers a setting behind a gear icon. A first-time, signed-out visitor who walks from the home page into **About us** or **the Blog** now sees the site in light mode once, with a small prompt beside the gear saying what happened and offering to open Settings. Those two are the reading surfaces, which is the whole reason light mode exists.

`src/lib/theme.ts` owns the eligibility: `hasThemePreference()`, `lightPeekEligible()`, `markLightPeekUsed()`, plus the one-shot key `ff_light_peek`. **Both helpers answer in the direction that STOPS the peek on any localStorage failure** (preference "exists", eligible false) — Safari private mode throws on write, so a peek that fired there could never record that it had fired and would re-flip the theme on every navigation forever. **An unreadable answer is a refusal, never a peek.** Any existing `ff_theme` value also disqualifies it: absence of the key is the only signal that nobody has chosen, and we never override a deliberate choice.

It uses **`setTheme` (persists), not `applyTheme`** — `SettingsPanel` reads the *stored* value on open, so applying without persisting would show "Dark" selected on a visibly light page, on the very screen the prompt sends people to. `markLightPeekUsed()` is called **before** showing, the same claim-then-act shape the reminder emitters use.

It lives in **TopNav**, not in About or Blog: TopNav already knows `authed` and already owns the gear and the `ff:open-settings` listener, so no second auth query is needed. Two effects, and **their declaration order is load-bearing** — the first records "did they arrive from `/`?" and clears the prompt on every route change; the second waits for `authed === false` (it starts `null` while the session hydrates) and shows. The reset therefore runs first and the show wins on the firing navigation.

**Band rhythm on Home is deliberate, and it has to work in both themes.** Light mode ran ~2,900px of unbroken `#e9eef8` then ~4,250px of unbroken `#ffffff` with no brand colour at all for ~7,000px between hero and footer, which is what read as "broken". The stack alternates ground / surface every band, with one navy anchor at the **Freddy Verified** section: hero navy → trust strip → Before&After ground → **About surface → Freddy Verified navy** (2026-08-24 — moved directly under Before&After so the trust claim and the "why us" story lead the page, ahead of the process/FAQ/services detail) → How It Works surface (`.ff-how-surface`, declared after `.ff-how` so it wins the tie without `!important`) → FAQ ground → Services surface → Testimonials ground → footer navy.

Freddy Verified uses **`--ff-bg`, not `--ff-surface`** — under the scope `--ff-surface` is `#151d2e`, which is exactly what a normal surface band already renders as in dark mode, so the band would vanish into whichever surface band sits directly above it (About, now that it moved). `check_rhythm.js` resolves every band through the real token tables in both themes and fails if any two adjacent bands land on the same colour, or if navy appears only at the two ends.

---

# Gotchas (hard-won — read before changing anything)

## Money
- **MONEY INVARIANT: a payout requires `payment_status='held'` AND `fully_funded`.** A job is collected in two charges now, so "held" no longer means "paid for" — `funded_amount` says how much actually arrived. Every new branch that receives money must increment `funded_amount`; every branch that pays out must check `fully_funded`. Miss one and the platform transfers 93% of a job it collected 40% of, silently, on a 3-day timer.
- **The service fee is charged once, in full, with the deposit** — never split it proportionally. `platform_health_check` check 2 asserts `client_fee = round(amount * rate, 2)`, and both `adjust-payment` and `stripe-webhook` reconstruct the applied rate from `client_fee / amount` (0 when a referral waived it).
- **A job can hold MULTIPLE payment intents** (deposit + balance + top-ups). Refund/adjust logic must walk `extra_charge_intent_ids` newest-first, never assume one.
- **`withdraw_job()` (contractor) and `remove_client_request()` (client) hard-DELETE and everything cascades.** Every child of `jobs` is ON DELETE CASCADE — disputes included. Any new "remove this" path must guard on `payment_status`, funded milestones and held prepayment pools first, or it destroys the only pointer to a live Stripe payment intent.
- **The held→release path ran for real on 2026-08-30 and the money moved** (job `fd9c3db4`, two transfer legs totalling $4.65). It is no longer untested. The **dispute** branch still is — no job has ever reached `disputed`.

## Postgres
- **Never use bare `to_char()` on a `timestamptz`** — the DB session TimeZone is UTC, so it renders visit times 6-7h ahead of Calgary. Use `public.ff_local_ts(ts)`, the single source of truth for user-facing date/time text. (`to_char()` on a `date` is fine.)
- **When an RPC gains a parameter, DROP the old signature first** or PostgREST hits overload ambiguity.
- **`SECURITY DEFINER` + `set search_path = public` breaks pgcrypto** — it lives in the `extensions` schema. Use `set search_path = public, extensions, pg_temp` and schema-qualify (`extensions.gen_random_bytes`). This exact bug killed **every signup for a month** (see Contractors → Onboarding).
- **`is_admin()`-gated RPCs return `[]` from an MCP SQL session** — there's no `auth.uid()`, so the guard is false. Verify by running the body with the guard removed.
- **MCP `execute_sql` does not surface `RAISE NOTICE`** (returns `[]`). To report from a rolled-back probe, accumulate into a `text` var and finish with `raise exception E'PROBE RESULTS (rolled back):%', r;` — the tool returns the error text and the transaction rolls back automatically.
- A trigger that must not lose its row should **set a flag, not `RAISE`** — a RAISE rolls back the row that is itself the evidence (see `chat_guard()`).

## Frontend
- **`supabase.functions.invoke` throws away the response body.** A 409/428 with a plain-English reason is invisible unless you pull it off `error.context`: `try { const j = await (error as any).context?.json?.(); if (j?.error) m = j.error; } catch {}`.
- **Use `.maybeSingle()`, never `.single()`** for profile/role lookups — `.single()` returns an error object on zero rows, which orphaned accounts hit constantly.
- **Every upload is compressed in the browser first — `src/lib/imageCompress.ts`, `compressImage(file, profile)`.** Three profiles: `photo` (1600px / q0.82 — completion + milestone photos, request photos, chat images, portfolio), `avatar` (640px / q0.85 — `contractor-photos`), `document` (2400px / q0.92 — `contractor-docs`, kept deliberately gentle because `review-contractor` sends these to Claude to *read* and the owner reads them by eye; over-compressing an insurance certificate destroys the payload). Output is always WebP, which is in `allowed_mime_types` on all six image buckets. **The governing rule is that every failure path returns the ORIGINAL file** — undecodable (HEIC on desktop Chrome), no canvas, `toBlob` null, or a "compressed" result that came back bigger. A completion photo is a payment gate and a dispute exhibit, so a slightly large photo is a rounding error and a lost one is a blocked payout. Videos, PDFs and GIFs pass through untouched (a canvas round-trip would kill GIF animation). **The signed-contract upload in `ContractPanel` is deliberately NOT compressed** — it's a legal instrument. When adding an upload, derive the path extension from the *returned* file and pass its `type` as `contentType`, or you write a `.jpg` path holding WebP bytes.
- **The role lookup is cached once per session — `src/lib/myProfile.ts` (2026-08-25).** `ProtectedRoute`, `TopNav` and `FinishSignupBanner` each read `profiles` independently; the banner fired on **every route change** and TopNav additionally on every `onAuthStateChange`, **including the periodic TOKEN_REFRESHED**. `getMyProfile(userId)` gives all three one answer.

  **It caches the in-flight PROMISE, not just the resolved value.** All three mount on the same navigation, so caching only the value still lets all three fire before any of them answers; storing the promise collapses the burst into one query.

  **Absence is never cached.** A missing `profiles` row is the half-finished-signup case — the one answer that heals on its own, via `ensure_profile()` or the signup trigger landing a beat late. Caching `exists:false` for a session would pin the finish-signup banner on screen for an account that has already been repaired. Orphans are rare, so re-asking costs nothing. A failed read isn't cached either, and returns `ok:false` so callers can tell "no row" from "couldn't tell" — all three preserve their old behaviour of passing through rather than acting on bad information.

  Invalidate with `clearMyProfile()` **anywhere `profiles.role` is written**: `AuthCallback` (both updates), `ContractorOnboarding`, and after `ensure_profile` in both dashboards. The module also clears itself inside `onAuthStateChange` — that is a **synchronous assignment, not a query**, so the auth-lock deadlock rule is not violated.

- **`NotificationBell`'s 2-minute safety-net poll is visibility-gated.** It is a backstop behind the realtime subscription, and a background tab polling forever is pure waste. It now checks `document.visibilityState === "visible"` inside the interval **and** re-loads once on `visibilitychange`, so a tab returning to the foreground is instantly current rather than up to two minutes stale.

- **HEIC photos often arrive with an empty `f.type`**, so a strict MIME whitelist silently rejects good iPhone photos — fall back to the extension. Related: a cancelled file picker returns no file, so use `if (!f) return;` (**never `?? null`**, which wipes the prior selection), and reset `e.target.value` on reject so re-choosing the same file re-fires `onChange`.
- **`askConfirm` returns a promise that only settles when `<ConfirmDialog>` closes** — forget to mount the dialog and the button hangs forever with no error.
- **Only the first three "Needs your attention" rows render** (`attn.slice(0,3)`; the contractor side shows four), so push-order decides what a user sees. Money-gating rows go first. On the contractor side the rows are an `else if` chain — a new overlapping predicate must be inserted *before* the one it overlaps.
- **An attention button lands on the CONTROL it names, never on the top of the card (2026-08-31).** The contractor's expanded job card is long — agreement, milestones, timeline, walkthrough, the whole propose form, timer, checklist, expenses, photos — and every row used to route through a `goJob` that ended in `window.scrollTo({top:0})`. So "Add photos" scrolled to a heading with the uploader several phone-screens below, which reads as a button that did nothing. `goJob` is gone; every row now calls **`focusJobAnchor(job, anchorId)`**, and the seven module-level constants `A_CLAIM` / `A_RESCHED` / `A_WALK` / `A_PROPOSE` / `A_PHOTOS` / `A_ONWAY` / `A_BALANCE` are spread onto their sections with **`jobAnchor(id, style?)`**.

  **The anchors are bare ids, deliberately NOT keyed per job.** Exactly one card is expanded at a time (`activeJobId === job.id`), so each id is unique in the document — the same reasoning that lets `ContractPanel` ship a single `CONTRACT_ANCHOR`. Keying them per job silently breaks the ring, because the pulse compares `pulseAnchor` to the id **by string**. Two `<JobPhotos>` mounts share `A_PHOTOS` for the same reason: they sit in the mutually exclusive `scheduled|in_progress` and `pending_confirmation` branches and can never render together.

  **`focusJobAnchor` calls `setJobFilter(null)` first**, or a stage filter can hide the very job being opened and the scroll finds nothing. It falls back to `scrollTo({top:0})` when the id isn't in the DOM — a section that isn't on screen for this job's state has no anchor, and scrolling somewhere beats scrolling nowhere. **`ringAnchor(anchorId, delay)` is the ONE implementation of "scroll there and ring it"**, shared by the profile-gap chips (60ms) and every job row (80ms); it was pasted twice before this and had already drifted. `A_PROPOSE` wraps the whole propose form in a div that re-declares the parent's `flex column` + `gap:.7rem`, so the ring outlines the form rather than one field and nothing moves visually.
- **Two smooth scrolls on the same box fight each other** — a "jump to X" handler silently loses to a generic `window.scrollTo({top:0})` from the same click. Attention rows carry `ownsScroll` so the shared button suppresses its top-scroll. Scroll targets need a stable `id` **on every render branch (including loading)** plus `scrollMarginTop:"5.5rem"` to clear the fixed nav.
- **wouter no-ops when you navigate to the path you're already on** — no re-render, no effect. Same-path navigation uses window CustomEvents instead (`ff:dash-nav`, `ff:open-settings`, `ff:open-chat`, `ff:google-review`, `ff:chat-changed`).
- **A bare `1fr` in `gridTemplateColumns` is `minmax(auto, 1fr)`** — the track can't shrink below its content, so one `whiteSpace:nowrap` child blows the grid off-screen. Use `minmax(0, 1fr)` and put `minWidth:0` on grid/flex items before `textOverflow:ellipsis` will clip. Never `overflow-x:hidden` on `html`/`body` — it breaks `position:sticky` (the dashboard sidebar depends on it).
- **`--ff-font-scale` is 1.1**, so 1rem ≈ 17.6px. It's a user-facing text-size preference — never change it, but account for it when sizing.
- **`Ic`'s shapes are Lucide paths, hand-copied — not the package (2026-08-24).** Every glyph in `ICONS` was refreshed from lucide.dev's current path data (fetched via `npm pack lucide-static` as a build-time data source, never installed as a dependency) so the app's icons match what's on the Lucide site, without adding the ~39MB `lucide-react` that was deliberately removed on 2026-08-23. `menu`, `info`, `repeat` and `file` were added for real this pass — the old substitutes (`<span>` hamburger bars, `refresh` for recurring, `bell` for info, `download` for documents) are retired; those three names now only mean spinner/recurring-refresh, real notification bell, and literal download respectively. `garage-door`, `pipe` and `trowel` have no Lucide equivalent and stay hand-authored. Check the icon set before naming one — a missing glyph renders **blank**, not an error. Add the glyph to `Ic`; do not reach for a package.
- **`photo_rules_start()` lives in three places** — the DB function, `PHOTO_RULES_START` in `src/components/JobPhotos.tsx`, and the same const in `supabase/functions/visit-reminder/index.ts`. Change one, change all three.
- Inline styles can't express `:hover` or `@keyframes` — both dashboards carry a scoped `.ffdash` `<style>` block for those.
- Pages outside `.ffdash` (Login, AuthCallback, UpdatePassword) need an inline `dim(on)` helper — a disabled button there looks enabled.
- **iOS Safari zooms the viewport on focus when an input's COMPUTED font-size is under 16px, and never zooms back out on blur (2026-08-31).** Because `--ff-font-scale` is 1.1, the codebase's habitual inline `fontSize:".85rem"` computes to **~15px — one pixel under the threshold**. That is the whole of "bidding doesn't work on my phone": the bid field was reachable, but focusing it zoomed the page and stranded the user with the Send button off-screen. The fix is a **single `!important` font floor plus a 44px min-height inside the existing `@media (pointer: coarse)` block in `main.tsx`**, not ~40 per-call-site edits — inline styles beat the injected stylesheet, so `!important` is what makes the floor actually win, and a stylesheet rule also catches the next input somebody adds. **Checkboxes and radios are excluded from both rules**, or a 44px checkbox appears. Don't "fix" this by lowering `--ff-font-scale`; it is a user-facing text-size preference.
- **A control that can never succeed is worse than no control (2026-08-31).** Both dashboards rendered buttons whose RPC would be rejected given the job's own visible state, with nothing on screen saying so — this was most of what the owner reported as the dashboards feeling "redundant and overwhelming". Two module-level predicates now mirror the server guard `job_money_block()`: **`canWithdraw(job)`** in ContractorDashboard (both Withdraw buttons) and **`canRemoveRequest(request, job)`** in ClientDashboard (both Delete buttons).

  **Both are deliberately STRICTER than the server**, because the browser cannot see the whole truth — a milestone job holds real money per stage while `jobs.payment_status` is still `'unpaid'`, and `'processing'` means a Stripe checkout may be open right now. Over-hiding a destructive control costs one email; over-showing it offers to delete the only pointer to a live charge. **When you widen either predicate, widen it toward the server, never past it.**

  The client-side **completed** case is the sharp one and the reason `canRemoveRequest` refuses it outright: `remove_client_request`'s assigned branch skips completed jobs when cancelling them but **still writes `client_requests.status = 'cancelled'`**, so on a finished job that was never charged the button didn't fail loudly — it quietly relabelled a completed job in the client's own history as cancelled.

  **The explanatory note beside a hidden Withdraw is keyed on `payment_status !== 'unpaid'`, NOT on `!canWithdraw`** — the predicate also hides on a milestone job holding nothing yet, where "this job is paid for" would be a plain lie. Where nothing is held, the button is simply absent and nothing is claimed.
- **A block gated only on a `*_at` flag lingers forever, because nothing clears those flags on completion.** The contractor's "the client changed the time" prompt was gated on `client_rescheduled_at && !reschedule_accepted_at` alone, so it and its Accept button sat on completed and cancelled jobs indefinitely; it now also requires `status in (assigned, scheduled, in_progress)`. (`propose_job_schedule` **does** null both flags when a pro counters, so the gate only stops terminal-state leakage and cannot strand a live negotiation.) `RequestPhotoQuote`'s `canQuote` was likewise a bare `true` and stayed editable after completion. When adding a flag-gated block, ask what clears the flag — usually nothing does.

## Authoring
- Avoid `${` inside template literals in generator scripts; for `$` amounts in JSX use `{"$" + x}`; embed CSS as `<style>{"...double-quoted css..."}</style>` (no backticks).
- In Python generator scripts, `%` inside a heredoc will crash `%`-formatting — use `.replace("__TOKEN__", value)`.
- The `Write` tool requires an explicit `Read` of an existing file first; having its contents in context does not satisfy the guard.
- `any` is used liberally; esbuild does no typecheck, so rely on `npm run typecheck`.
- **Prior sessions shipped features that were never documented. Before building anything, check whether it already exists in the repo/DB.**

---

# Money

## Model
Stripe Connect, separate charges + transfers, Stripe-hosted Checkout. Client pays job price + **3% service fee**; funds are **held**; on client confirmation (or 3-day auto-confirm) **93%** transfers to the contractor and the platform keeps **7%**. Live since 2026-06-26 with `sk_live` and a single webhook destination.

Single sources of truth (never hardcode these): **`platform_fee_rate()`** = 0.03 (what the client pays on top), **`platform_deposit_rate()`** = 0.40 (how much is collected up front), **`platform_commission_rate()`** = 0.07 (what the platform keeps out of the contractor's side — the contractor receives `1 - this`). `get_job_fee(client, job)` returns the canonical `{base, rate, fee, total, waived}`.

**`platform_commission_rate()` landed 2026-09-01 and closed the last hardcoded rate in SQL.** It replaced the literal `0.07` in `propose_milestones` and the `0.93`/`0.07` pair in `get_recurring_prepay_quote` and `recompute_contractor_stats`. **No arithmetic changed** — `1 - 0.07::numeric` is exactly `0.93` in Postgres numeric, so the new expressions are byte-equivalent to the literals they replaced, proven 17/17 by rolled-back probe against a $3,333.33 three-stage plan and a $250 × 4 prepay quote with the expectations spelled out using the ORIGINAL literals. Two shapes are preserved deliberately: `propose_milestones` still takes the stage payout as the **complement** (`v_amount - v_pf`) rather than rounding it independently, so a stage's fee and payout always add back to the stage exactly; and the `0.93` in `recompute_contractor_stats` was only ever a **fallback** for rows where `contractor_payout` was never written, so the stored value still wins. **Touches none of the four payout guards** — `release-payment` reads `contractor_payout` off the row and has never computed the rate itself, so the payout path is unaffected either way.

**The five remaining `0.07`/`0.93` literals in edge functions are deliberate, not debt.** They are in `create-payment-intent`, `create-milestone-payment`, `adjust-payment`, `stripe-webhook` and `notify-email` (the last display-only). Reading a rate constant over the network from inside the charge path would turn an unreadable constant into a **blocked checkout** — a new failure mode bought for no present benefit — and a TypeScript fallback constant would be exactly the "second hardcoded copy" this rule exists to prevent. If the commission ever changes, these five are the change list; grep `0\.07` and `0\.93` under `supabase/functions/`.

**A sixth copy had been sitting in the frontend, and it is gone (2026-09-01).** `ContractorDashboard`'s `netPayout()` computed a contractor's expected payout as `amount * 0.93` — the number the pro reads on their own job cards, in the "coming your way" total and in the exported payouts CSV. **A dashboard label is not the charge path**, so the argument that justifies the five edge literals does not reach it: the worst case here is a missing number, not a blocked checkout. `src/lib/platformRates.ts` reads `platform_commission_rate()` once per session — the RPC is granted to `authenticated`, and the dashboard sits behind `ProtectedRoute` with a real user JWT.

Three things about it match patterns already in this file. It **caches the in-flight PROMISE, not the value** (`myProfile.ts`'s rule — several cards ask on the same render pass, and value-caching still lets them all fire before any answers), it **never caches a failure**, and it returns `null` rather than guessing when the rate is unreadable, because **a failed read is not an empty result**. `netPayout` is now `number | null`: the stored `contractor_payout` still always wins where it exists (it is what will really be paid, even if the rate later changes), and where it doesn't and the rate is unknown, the job card shows the estimate without a payout line and `awaitingTotal` withholds the whole "coming your way" card. **A wrong payout figure is worse to a contractor than a missing one.**

**MONEY: touches none of the four payout guards.** It is a display path — it computes no charge, writes nothing, and cannot affect `funded_amount` or `fully_funded`.

The same apply also pinned `search_path` to `public, extensions, pg_temp` on five money functions that were missing it — `platform_fee_rate`, `platform_deposit_rate`, `propose_milestones`, `get_recurring_prepay_quote` and `recompute_contractor_stats` had `public` alone or `public, pg_temp`, which is the exact shape that killed every signup for a month.

## 40/60 deposit split (2026-08-03)
Client pays a **40% deposit at booking** and the **60% balance when the work is done**. Applies to **every job** (owner overrode a proposed ~$400 floor).

- `jobs.total_charged` = FULL amount owed. `jobs.funded_amount` = collected so far. `fully_funded` is a **generated stored column** (`total_charged is not null and funded_amount >= total_charged - 0.01`). `jobs.deposit_rate` is stamped per job at checkout so a later platform-rate change can't re-split a job in flight.
- `payment_status` deliberately keeps `'held'` for a deposit rather than gaining a `deposit_held` value — ~20 call sites compare `=== 'held'`. **Funding is expressed by the numbers, not the enum.**
- **Three payout guards, which only work as a set:** `confirm_job_completion()` raises with the exact balance owed; `auto_confirm_stale_jobs()` skips under-funded jobs (without this the platform pays the contractor out of its own balance on a timer); `release-payment` 409s on `!fully_funded`; `reconcile-payouts` filters `.eq("fully_funded", true)`.
- Charging: `create-payment-intent` v16 collects `round(amount * deposit_rate, 2) + full clientFee` (metadata `kind:"deposit"`) while writing `total_charged` = the FULL amount. New **`create-balance-payment`** (v1, jwt) derives the balance **server-side** from `total_charged - funded_amount`, with seven guards and the same fail-CLOSED 428 contract gate. `stripe-webhook` has four explicit branches (`deposit` / `balance` / `price_topup` / milestone+prepay). **Only the first three increment `jobs.funded_amount`** — the milestone and prepay branch deliberately writes nothing to `jobs` at all. Milestone money lives entirely on `job_milestones` and pool money on `recurring_prepayments`; `create-milestone-payment` never sets `jobs.total_charged` either, so `fully_funded` is false for a milestone job **by construction** and no job-level payout guard can be misled by it. That is also why `refund-milestone` has no `jobs.funded_amount` to decrement, and why the milestone branch never sets `payment_status='held'` — health check 5 `no_unpaid_balances` cannot trip on a milestone job. **Any NEW branch that credits a job-level balance must increment `funded_amount`; a branch that credits a stage or a pool must not.**
- Client pays the balance FIRST, **then** confirms — two separate actions, enforced in DB and UI. Balance payment is allowed at any time (money is only held; release still needs `client_confirmed_at`).
- `platform_health_check()` gained check 5 `no_unpaid_balances` (ghost client: work done, deposit held, never came back) and check 6 `no_underfunded_payouts`.
- The deposit stays **HELD**, never advanced to the contractor — UserAgreement §6.10 promises refund of unreleased deposits within 15 days of a valid cancellation, so it is a commitment device, not materials funding.
- Two latent bugs fixed while auditing: `open_dispute()` wrote `'disputed'`, which the CHECK constraint rejected (23514); `propose_price_change()` wrote NULL into the NOT NULL `payment_status` (23502). Neither had ever fired because no job has reached `held`.
- **Phase 2 shipped 2026-08-31 — card-on-file auto-collection.** See the section below.

**The ghost client is now told, not just the admin — `run_reminders()` step 8 (2026-08-31).** Health check 5 `no_unpaid_balances` could only ever *detect* the state: deposit held, work finished and photographed, client never came back to pay the 60%. Every payout guard then correctly refuses to release, so **the contractor waits indefinitely and the one person who could fix it was never asked.** Step 8 emails the client the exact outstanding figure with a Pay-the-balance CTA.

Three things about it are deliberate. It **escalates 24h → 3d → 7d and then stops**, with the stage number in the `reminder_log` dedupe key (`balance_owed:<job>:<stage>`) — so paying, or the job leaving `held`, ends it early, and a client who never pays gets three emails rather than one a day forever. It **skips milestone and prepay jobs** (their money moves per stage / per pool; neither has a whole-job balance to pay) and jobs with a **pending price change**, because naming a figure that is mid-negotiation is worse than saying nothing, and step 6 already nudges those. And `balance_owed` is **deliberately absent from `EMAIL_HANDLED_ELSEWHERE`** — there is no richer dedicated emitter, so the webhook's copy is the only copy. It routes to the client's **Requests** tab, not History: the job is not finished until it is paid.

**MONEY: touches none of the four payout guards.** It writes a notification and nothing else — no charge, no transfer, no status change, no `funded_amount`. It cannot make an under-funded job payable; it only asks the client to fund it. The same apply also fixed this function's `search_path`, which was missing `extensions`. Verified by rolled-back probe: fires once at 26h, does **not** re-fire on an immediate second run, fires once more when aged to 4 days, and goes silent the moment `funded_amount` reaches `total_charged`.

## Milestone escrow for big jobs
Jobs quoted **> $2,000** can be paid in **2–5 stages** instead of one charge; small jobs are untouched (`jobs.is_milestone` gates everything). Same economics per stage (3% fee + 7% commission).

Flow: contractor builds a plan (auto-suggest Deposit 20 / Rough-in 30 / Substantial 30 / Final 20, must sum to the quote) → client approves the schedule (nothing charged) → per stage: client **funds** → contractor **completes + photo** → client **approves & releases** (93%) or **disputes** (freezes only that stage). Stages fund strictly in order; 3-day per-stage auto-approve.

`job_milestones` (`pending→funded→completed→released`, plus `disputed` and `refunded`) + `jobs.is_milestone` / `milestone_schedule_status`. RPCs: `get_job_milestones`, `propose_milestones`, `approve_milestone_schedule`, `complete_milestone`, `approve_milestone`, `dispute_milestone`, `auto_approve_stale_milestones`. Edge: `create-milestone-payment`, `refund-milestone` (admin-only, refunds a still-held stage). UI: `src/components/MilestonePanel.tsx` (role `contractor|client|admin`).

**`released` OR `refunded` are BOTH terminal** — treating only `released` as terminal meant a job with a refunded stage never auto-completed and the next stage could never fund. Referral waiver applies to the first funded stage only.

## Recurring prepay pool
One Stripe charge covers N visits, released 93% per completed+confirmed visit. `recurring_prepayments` (pending→held→partially_released→released; refunded/canceled) + `jobs.prepayment_id` / `prepayment_seq`. RPCs `get_recurring_prepay_quote`, `consume_prepaid_occurrence`. Edge `create-recurring-prepayment`, `refund-recurring-prepayment` (admin). Prepay is a **post-quote dashboard action** — booking only captures the preference (`client_requests.recurring_prepay_pref`). Unused visits are refundable. Admin **Prepaid** tab does per-pool refunds.

**The referral waiver applies to a pool too, and the flag lives on the POOL (2026-08-23).** Until now `create-recurring-prepayment` ignored the waiver entirely — which didn't merely skip the discount, it **destroyed** it: linking the first prepaid visit sets that job to `held`, after which `referral_waiver_eligible` returns false forever. So a referred client whose first action was prepaying a plan lost the reward with nothing to show for it. The pool now charges `basePer*occ + feePer*(occ-1)` when eligible and stamps `recurring_prepayments.fee_waived`; `consume_prepaid_occurrence` reads that stamped flag and zeroes `client_fee` on **occurrence 1 only**. The arithmetic reconciles exactly — sum of linked jobs = `basePer + (occ-1)*(basePer+feePer)` = the pool total — so `funded_amount` stays honest per job and no visit ends up under-funded. **Do not re-decide eligibility at link time**: the pool was charged a fixed amount up front, and a later re-check could disagree with what was collected and leave the last visit short.

The waiver is **consumed in `stripe-webhook`** when the pool flips `pending → held`, not at checkout and not at first link. At checkout an abandoned session would burn the reward; at first link there's a weeks-long window in which the client could spend the same waiver again on a separate one-off job.

## Price changes after booking
A contractor can adjust the price at any live stage **until payout** — assigned / scheduled / in_progress / pending_confirmation. Two-sided completion is preserved.

`jobs.price_change_pending jsonb` / `price_change_proposed_at` / `extra_charge_intent_ids text[]`. `propose_price_change(...)` on an **unpaid** job applies the price and returns to `assigned` for re-approval (`'reapprove'`); on a **held** job it stores the pending jsonb and notifies the client (`'pending_client_approval'`). `decline_price_change(...)` clears it. `confirm_job_completion` raises while a change is pending, and `auto_confirm_stale_jobs` skips those jobs. Edge **adjust-payment** (v2): increase → Stripe Checkout for the delta (`kind:'price_topup'`), decrease → partial refund, no-change → apply; preserves the original fee rate and pays 93% of the FINAL amount. On an under-funded job an increase rolls into the outstanding balance instead of opening a top-up. `release-payment` 409s while a change is pending.

**The client can walk instead of paying more (2026-08-18).** `decline_price_reopen(job)` cancels the job, flips the request back to `pending`, declines the offending pro's bid and re-sets **every other bid to `pending`**, so the client re-picks in one tap from estimates already on the request. `preferred_contractor_id` is cleared too, or a rehire reservation would hand it straight back to the same pro. Nothing is deleted — chat, agreement and history survive on the cancelled row.

It carries **three money guards** modelled on `withdraw_job`, because it cancels a job and every child of `jobs` is ON DELETE CASCADE: whole-job `payment_status in ('held','released','disputed')`; any `job_milestones` stage in `funded/completed/released/disputed` (**a milestone job holds real money while `jobs.payment_status` is still `'unpaid'`**); and a `recurring_prepayments` pool in `held/partially_released`. It touches **none of the four payout guards** — it can only fire on a job that holds no money at all.

The contractor is told this plainly in `renderPriceChange` before they send: on an unpaid job, an amber block says raising the price can cost them the job because the client can re-open it to the other bidders in one tap; once money is held it says the opposite, that the job can't be handed away but the change can be declined. The old single line ("They'll re-approve … your chat history stays") was misleadingly reassuring.

## Stuck-state audit (2026-08-18)

Full write-up in `PAYMENT-AUDIT-2026-08-18.md`. Every finding came from reading code that has never executed against real money — the DB still holds one `unpaid` job, zero contracts, zero milestones, zero pools, and `funded_amount` has never been non-zero. **None of the four payout guards was weakened.**

- **`job_money_block(p_job_id) returns text`** is now the ONE answer to "can this job be destroyed?" — NULL = safe, else the plain-English reason (same shape as `contract_ready`). `withdraw_job`, `remove_client_request`, `decline_price_reopen` and `admin_delete_job` all call it. They had each carried their own copy and **already drifted**: only `withdraw_job` checked the prepay pool, only two checked milestones, none knew about `processing`, and `admin_delete_job` had **no money guard at all** behind a live admin button. It gained `p_force boolean default false` (SQL-only, never wired to a button, use only after refunding in Stripe) — which needed `drop function if exists public.admin_delete_job(uuid);` first.
- **`jobs.checkout_started_at`** bounds the `processing` block to 3h. That window strictly contains the Stripe session's life, because all four checkout functions now set `expires_at = now + 2h`. Without the stamp the guard would have to block `processing` forever and an abandoned checkout would become a job the contractor can never withdraw from — a *new* stuck state. `stripe-webhook` also handles **`checkout.session.expired`** (guarded on `payment_status='processing'`, deposit-kind only) so it clears instantly; **enable that event on the Stripe webhook destination** — if it isn't, nothing breaks, the 3h window just self-expires.
- **P0, the prepay deadlock:** `consume_prepaid_occurrence` set `payment_status='held'` and `total_charged` but never `funded_amount`, so `fully_funded` stayed FALSE **forever**. All four payout guards then correctly refused to pay out and `confirm_job_completion` told the client to pay a balance they had already paid into the pool — with no way out, since that RPC checks `auth.uid() = client` so an admin couldn't confirm it for them. Now writes `funded_amount = v_total`. This *satisfies* guards 1/3/4 rather than weakening them.
- **The four checkout functions redirected to `/client`, which is not a route** — the catch-all sent every paying client to the marketing homepage with no confirmation. Now `/client-dashboard?payment=success|cancelled&job=<id>` (`&tab=recurring` for a pool), and `ClientDashboard` finally **reads those params** — banner + `history.replaceState` strip + a 3-pass re-read of the job, because the webhook can land seconds after the redirect. That effect is declared **before** the deep-link effect on purpose, since `clearDashNavFromUrl()` strips `?job=`.
- **`create-milestone-payment` treated only `released` as terminal**, so refunding stage 1 — the one remedy an admin has — permanently blocked stages 2..N with "Fund the earlier stages first". `release-payment` already got this right; they now agree.
- **`auto_confirm_stale_jobs` / `auto_approve_stale_milestones`** looped with no exception handling, so one bad row aborted the batch and everything behind it silently stopped. Both now use the per-row `begin…exception when others` pattern `refire_stale_requests` already used. This makes guard 2 run to completion.
- **The dashboard used to lie twice.** `confirmCompletion` reported EVERY release failure as green "being processed… nothing more for you to do" — flatly wrong for the two failures that actually happen (unpaid balance, which only the client can fix; unfinished payout setup, which `reconcile-payouts` retries forever without succeeding). Now three branches keyed on the 409 reason dug off `error.context`. Separately the job read's `error` was thrown away, so a failed read looked identical to "no job yet" and **the entire payment surface vanished silently** — now `jobLoadFailed` keeps the last-known job on screen behind a banner.
- **`release-payment`'s admin alert had no identity** — `reconcile-payouts` runs every 15 min, so a single broken payout sent ~96 identical, unidentifiable emails a day. It now names the job/stage/pool and the likely cause.
- **CLOSED 2026-09-01 — the Pay button is now idempotent.** `create-payment-intent` didn't store its session id, so a client who abandoned checkout and pressed "Start a new payment" left the old session live and could pay **both**. `jobs.stripe_session_id` now records the outstanding deposit session, and **v19 expires the stored session before creating the replacement**. The pay button is still deliberately NOT disabled during `processing` (that would strand the client for 2h), and `stripe-webhook`'s duplicate-deposit capture into `funded_amount` + `extra_charge_intent_ids` stays as the net underneath.

  **⚠️ Expiring a session fires `checkout.session.expired`, and that branch's guard is load-bearing.** It previously matched on job id + `payment_status='processing'` alone — so the expire() call above would have flipped a job with a **live** replacement checkout back to `unpaid`. The deposit branch's `processing → held` update would then match nothing, the client's real payment would be recorded as a "duplicate charge", the job would sit unpaid, and all four payout guards would correctly refuse to release it. `stripe-webhook` **v19** therefore adds `.or("stripe_session_id.eq.<cs.id>,stripe_session_id.is.null")`, so an expiry only ever clears the session it names. The `is.null` arm preserves the old behaviour for pre-v19 jobs that carry no stored id. (PostgREST ANDs separate filter params and groups `.or()`, so the predicate is `id AND processing AND (session matches OR session null)`.)

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

## Disputes / claims
Client files a formal claim (`ReportProblem` → `open_dispute` RPC: reason, service date, agreed scope, requested remedy, amount, signed declaration + photos) which freezes payment to `disputed` and notifies contractor + all admins. Contractor responds within 3 days (`RespondToClaim` → `respond_to_dispute`). Admin resolves via `resolve-dispute` edge fn (v5 — walks multiple payment intents newest-first) with full/partial refund or release. Photos in the private `problem-photos` bucket; dispute parties can read each other's via RLS. Clients reach the flow from the sidebar **File a claim** action (`FileClaimModal.tsx` → picks a job by `jobCode`).

**Filing a claim stops the automatic balance charge, in two independent places (2026-08-31).** A client can file while the balance is still outstanding — `open_dispute` requires `payment_status='held'`, which a deposit-only job satisfies — so card-on-file collection and the claim window genuinely overlap. `open_dispute` writes **both** `payment_status='disputed'` and `disputed_at=now()`, and `jobs_due_for_autopay` requires `payment_status='held'` **and** `disputed_at is null`; separately `collect-balance-auto` re-reads the job row immediately before touching Stripe and skips on `payment_status !== "held" || job.disputed_at`. Either one alone would be enough; the second exists because the sweep and the charge are not in the same transaction. Verified by rolled-back probe: three identical held, under-funded, completed jobs, 3/3 qualifying at baseline → no-claim **1**, claim-filed **0**.

**And autopay never resumes on a job that has ever been disputed.** The predicate tests `disputed_at is null`, not the current status, so a claim resolved back to `'held'` with a balance still owed stays off automatic collection permanently (probe: **0**). That is deliberate and it is the safe direction — a job someone formally complained about should not silently charge their card again on an hourly timer. The client can still pay manually, or turn autopay back on themselves via `set_job_autopay`, which is a deliberate act by the one person entitled to make it.

**Three RPCs on this path had a null-unsafe owner check, fixed 2026-08-31.** `open_dispute`, `respond_to_dispute` and `confirm_job_completion` all guarded with `v_client <> auth.uid()`. **In SQL that comparison is NULL when `auth.uid()` is NULL, and a NULL `if` condition does not fire** — so the "Not authorized" raise was silently skipped for a caller with no JWT. It was latent rather than live (zero DB callers, zero cron callers, and all three browser call sites sit behind `ProtectedRoute` with a real user JWT), and it is the same shape found and fixed in `set_job_autopay`. All three now test `auth.uid() is null` **first**. The same apply added the missing `extensions` to their `search_path` and revoked them from `public`/`anon` — **remember `revoke … from public` as well as from `anon`**, since the default grant is PUBLIC.

**MONEY: `confirm_job_completion` is payout guard 1**, so it was changed by `CREATE OR REPLACE` with every other line preserved byte-for-byte — the balance-owed raise, the disputed check, the price-change check, the status check, both updates and both notifications. The guard is made **stricter** (it refuses a caller it previously accepted), never looser, and guards 2, 3 and 4 are untouched. Proven by probe under real and absent claims, 6/6: no-JWT refused on both RPCs, guard 1 still raises the exact figure (`$61.80`), a fully-funded job still confirms (so it was not over-tightened), a different real user refused, `extensions` present on all three. `platform_health_check()` 7/7 after apply.

## Receipts + reconciliation
`receipt_sent_at` on `jobs` and `job_milestones`; AFTER UPDATE triggers on `payment_status→released` fire **payment-receipt** (v2) with **claim-then-send** (`UPDATE … SET receipt_sent_at WHERE … IS NULL`), so a replay can't double-send. Client receipt splits deposit/balance rows; contractor payout statement (93%, tax note) is unchanged.

**reconcile-payouts** (v3, pg_cron every 15 min via `kick_reconcile_payouts()`): first `auto_approve_stale_milestones(3)`, then releases stuck single-charge jobs and completed+approved+un-disputed stages. This is the safety net for auto-confirmed jobs, which historically never released funds.

## Payout onboarding (Stripe Connect)
`refresh-connect-status` **v11** returns `requirements` (de-duped `currently_due` + `past_due`), `past_due`, `pending_verification`, `disabled_reason` — `eventually_due` is **deliberately excluded** (not blocking, would nag). Accepts an admin-only `{contractor_id}` so the owner can inspect someone else's account.

`src/lib/stripeRequirements.ts` maps codes to plain English (`needFor`/`needsFor`/`needsSummary`/`pendingText`/`disabledText`). It lives in the **frontend on purpose** so copy changes need no edge redeploy. Matching is by regex on the code *tail*, because Stripe namespaces the same field under `individual.*`/`company.*`/`representative.*`/`owners.*` and prefixes person requirements with a person id. `needsFor` **collapses by label** (address line1+city+postal = one action). Unknown codes fall back to a generic line, never a raw code. Contractor dashboard shows the itemised list; "reviewing, nothing to do" when nothing is outstanding. Admin roster has **"What's blocking their payouts?"** per contractor.

## Referrals
`profiles.referral_code`/`referred_by` (auto via `gen_referral_code()`), `referrals` table, RPCs `apply_referral_code`, `get_my_referral`, `consume_referral_waiver`, `referral_waiver_eligible`. Reward = **3% fee waived on the referred client's first job** — the client service fee only, so the contractor still receives 93% and the platform nets ~4% instead of ~7%. `create-payment-intent`, `create-milestone-payment` and `create-recurring-prepayment` all waive via a **read-only** `referral_waiver_eligible` check; `stripe-webhook` calls `consume_referral_waiver` only once the money has actually landed, so an abandoned checkout can't burn the reward.

**A code can be entered three ways (2026-08-23), and until this landed only one of them existed.** App.tsx captures `?ref=` → `localStorage['ff_ref_code']`; ClientOnboarding and AuthCallback apply it. That was the *only* path, so **a code heard verbally, or a link pasted somewhere that strips the query string, was permanently unusable** — which is why the table held 0 referrals against 29 profiles that all have codes. Added: an optional field on the ClientOnboarding form, and a manual-entry box in the ClientDashboard referral card for people who already have an account. Two ordering rules are load-bearing: the typed code is stashed to `ff_ref_code` **before** the email-confirmation early return (there's no session yet, so `apply_referral_code` — which is keyed on `auth.uid()` — cannot run, and AuthCallback only ever reads localStorage), and in the apply block **the typed code wins over the stashed one** (someone who arrived on a `?ref=` link then deliberately typed a different code meant the one they typed). A bad code must never block a signup: `apply_referral_code` returns `{ok:false,reason}` rather than throwing, and the call is wrapped anyway.

**A code invites ONE friend, then retires into a badge (2026-08-23).** *Redeeming* was already one-time (`profiles.referred_by` is set once, `referrals.referred_id` is UNIQUE, the dashboard entry box hides itself) — what was uncapped was how many people one code could be handed to. "One friend" has two naive implementations and **both silently break a promise**: block on any pending row and a stranger who applies your code and never books kills it *forever*; block only on a rewarded row and several people hold a live waiver at once, so two people are each promised a discount and one quietly doesn't get it.

The resolution separates the **waiver** from the **reward**. A pending referral blocks the code only while it is **under 30 days old**, after which the code frees itself — but the old row is **never expired or deleted**, so the friend who applied it keeps the discount they were promised however long they take to book (`referral_waiver_eligible` still reads a bare `status='pending'`, deliberately untouched). Because that lets two live waivers briefly coexist, the reward is capped separately: `consume_referral_waiver` still returns true and still zeroes the fee for whoever books, but if that referrer has already been rewarded once the row closes as **`'honored'`** instead of `'rewarded'`. The friend gets their money; the referrer gets exactly one badge. At most one `'rewarded'` row per referrer ever, enforced by the guard *and* by partial unique index `referrals_one_reward_per_referrer` — belt and braces because the guard runs inside `stripe-webhook` after real money has landed, where a constraint error must never be the only thing standing between us and a payout. (`referrals.status` has no CHECK constraint, so `'honored'` needed no DDL.)

`get_my_referral` returns **`code_status`** (`active` / `in_use` / `retired`) and **`badge`**, and that is the single source of truth for the ClientDashboard card's three states — same rule the RPC enforces server-side, so card and code can't disagree. **The copy button is hidden in `in_use` and `retired`**: sharing a code that will be refused is a dead end the sharer can't see. `apply_referral_code` gained reasons `code_retired` and `code_in_use`, mapped to plain English on the dashboard, because "invalid code" would send someone hunting for a typo in a code that is perfectly real.

**MONEY:** touches none of the four payout guards. It only decides whether `client_fee` is 0 on somebody's first job, and it makes waivers rarer, never more common; health check 2 already tolerates a 0 fee.

**A code refused at signup now says why — `src/lib/referralCode.ts` (2026-08-23).** Both signup call sites called the RPC fire-and-forget and threw `{ok:false,reason}` away, so a code that is perfectly real but retired or on hold failed **silently** at exactly the moment somebody was most likely to have typed it: during signup, off a code a friend read out to them. Neither site can render the message itself — `ClientOnboarding` is mid-submit inside account creation and `AuthCallback` is a redirect page with no UI — so `applyReferralAtSignup()` **stashes** the English text under `ff_ref_error`, and `ClientDashboard` reads it once on mount into `refMsg`, which renders directly above the manual entry box. The explanation and the second chance arrive together, on the tab they land on.

Three rules the helper encodes, none of them obvious from the call site:

- **It cannot throw and returns nothing.** It runs inside signup, and the pgcrypto incident is the standing proof that a raise in that transaction costs somebody their account. A referral code is never worth a signup.
- **An RPC/network error is not a bad code.** On `error` it says nothing and **leaves the code stashed** so the next sign-in retries — the old code removed `ff_ref_code` unconditionally, so a flaky moment silently burned the referral. Only a real refusal clears it, because leaving that would re-fire the same message on every sign-in.
- **The reason→English map has exactly one copy.** It was inline in `ClientDashboard`; a third paste is how `upsertMeta` ended up byte-identical across six SEO routes and drifted with no error to show for it. `App.tsx` and `ClientOnboarding` use the exported `REF_CODE_KEY` / `stashedReferralCode()` rather than the raw string for the same reason.

The two load-bearing orderings are unchanged: the typed code is stashed **before** the email-confirmation early return, and in the apply block **the typed code wins over the stashed one**.

## Health check
`platform_health_check()` returns 7 named checks: fee rate sane; `client_fee` matches `amount * rate`; critical RPCs present; no confirmed+held payout stuck >2h; `no_unpaid_balances`; `no_underfunded_payouts`; **`no_stuck_signups`**. `run_platform_health_check()` (pg_cron `platform-health-check`, 15:00 UTC daily) alerts every admin when a check fails, deduped ~20h — and since `health_alert` is NOT in `EMAIL_HANDLED_ELSEWHERE`, that alert emails as well as ringing the bell.

**Check 5 now escalates to a human, and the escalation is what makes it useful (2026-08-31).** The alert could only ever say *"N finished job(s) with a balance unpaid for >3 days"* — a count, with no job code, no client, no amount and no age. There was nothing in it the owner could act on, and `run_reminders()` step 8 stops nudging the client after 7 days by design, so past that point **nothing happens again on its own**: the contractor stays unpaid and the one person who could fix it has already ignored three emails.

**`escalate_unpaid_balances(p_days default 10)`** is called from `run_platform_health_check()` and names each stuck job — job code (matching `jobCode()`), service, exact amount owed, days since the work was finished, the client's name/email/phone, and which contractor is still waiting — followed by the two ways out: phone the client, or refund the deposit in Stripe and cancel.

Five things about it are load-bearing:

- **The predicate MIRRORS step 8** — same milestone / prepay / pending-price-change exclusions — so the two halves of the ghost-client problem can never disagree about what "a balance is owed" means.
- **10 days is three days AFTER step 8's last nudge.** Escalating earlier would just re-send an email the client already has; this alert means *the automation is exhausted*.
- **The type must be `health_alert`.** The `send-notification-email` trigger's WHEN clause is `new.type = 'health_alert' OR NOT outbound_paused()`, so any new type would be **silently un-emailed while the site is paused** — precisely when the owner's only warning system has to keep working.
- **It is throttled on the SET of stuck job ids** (`health5|unpaid_balance|<md5 of sorted ids>`, 72h), the same idiom as the profile nudge's `profile_nudge:<sorted gap keys>`. A *new* stuck job changes the key and gets through at once; an unchanged list re-alerts every 3 days instead of every day forever — the `alert_throttle_log` lesson.
- **The generic health alert is emitted FIRST**, because it dedupes on "any `health_alert` row in the last 20 hours" and the escalation writes `health_alert` rows too. The other order would let the escalation mute the very check that summoned it. The escalation call then sits **outside** the `v_fail = 0` early return and inside **its own** exception block, so neither a future predicate edit nor a fault in the escalation can take the health alert down with it.

**MONEY: touches none of the four payout guards.** It writes notification rows and nothing else. The same apply also fixed `run_platform_health_check`'s `search_path`, which was `public` alone — missing both `extensions` and `pg_temp`. Verified by rolled-back probe, 6/6: escalates once with the right copy at 12 days, is throttled on an immediate re-run, fires again the moment a second stuck job joins the list, goes silent when the balances are paid, and correctly ignores both an 8-day job (still step 8's) and a 30-day milestone job.

**Check 7 `no_stuck_signups` (2026-08-06)** counts `auth.users` rows created **24h–7d ago** that are still `email_confirmed_at is null` AND `last_sign_in_at is null`. Both ends of the window are deliberate: 24h so someone still working through their inbox isn't flagged, 7d so a genuinely abandoned signup ages out on its own instead of pinning the check red forever — while a real mailer outage re-fires every day it continues. Back-tested against the Aug 2026 incident it goes red on **Aug 1**, five days before the first phone call, and stays clean on the four days before that.

---

# Job lifecycle

Request → bids → client picks → assigned → contractor proposes time + price → client approves → (contract signed) → client pays deposit → scheduled → on-my-way / in_progress → contractor completes + photo → client pays balance → client confirms → release (or 3-day auto-confirm) → review.

## Bidding
Cap is **7 distinct contractors per request** (`place_bid`, `v_cap`), guarded by `pg_advisory_xact_lock(hashtext(request_id))` to close the check-then-insert race; re-quoting your own bid is never blocked. Customer-facing marketing says **5 estimates** (deliberate under-promise); contractor/admin UI shows `/7`.

Bids are **private** — RLS lets a contractor read only their own; `list_open_jobs` returns the aggregate `bid_count` plus the caller's own `my_amount`/`my_walkthrough`, never another pro's number.

**Walkthrough-first bids:** a pro can bid with no firm price by ticking "I'd like to see the space first" (`bids.walkthrough_requested`, optional `price_low`/`price_high` ballpark). A normal bid with no total raises. On assigned jobs there's a separate free pre-estimate visit: `propose_walkthrough` / `approve_walkthrough` / `decline_walkthrough` / `complete_walkthrough` (`jobs.walkthrough_*` columns). No payment path — afterwards the pro uses the normal propose form.

`accept_bid` (client picks) and `assign_job` (admin) both create the job row.

## Matching
**`service_specialty_map` is the single source of truth** for all three matchers — `notify_contractors_new_request()` (in-app 🔔), `dispatch-job` (email), `list_open_jobs()` (feed). It bridges the client `service_needed` vocabulary to contractor `specialties`. Unmapped labels and `Other` pass through to everyone so a job is never invisible. Changing the DATA keeps all three in lockstep with zero code changes.

**`service_compulsory` (2026-08-16) is the sibling table for Alberta's compulsory trades** — same shape, one row per service label, `{service, compulsory, trade, note}`, public-read, with `service_is_compulsory(text)` and `get_service_compulsory()`. Seven of 23 labels are flagged: Electrical Work, Plumbing Repair, Air Conditioning, HVAC Maintenance, Appliance Repair / Install, Battery / Brakes, Solar. **A compulsory trade is not the same as every task in it being restricted** — Alberta publishes a broad "Undertakings and Activities" list and a narrower "Restricted Activities" list, and only the second carries legal force. Automotive Service Technician is compulsory, but *"performing vehicle maintenance services"* is the one item omitted from its restricted list, so Oil Change / Tire Swap / Vehicle Maintenance are **not** gated while brakes are (an enumerated vehicle system). Gasfitter Class B goes the other way: its restricted list is *identical* to its full scope and names maintenance explicitly, so HVAC Maintenance **is** gated. The `note` column records each of these reasons so a later session doesn't "helpfully" re-flag them. **Nothing gates bidding, dispatch or the feed on this flag** — it feeds the Service Agreement's permit section and gives a future certificate check somewhere to hang. And it deliberately does not ask for a Master ticket: that's a Safety Codes Council permit-pulling credential held by the *business* (plus Calgary's own City Qualified Trade registration), so requiring it would exclude legal journeymen who sub the permit out while telling the client nothing about competence.

Handyman is intentionally wide — `{General Repairs, Carpentry, Painting, Drywall, Flooring / Tile}` in both directions, because that's where volume is. **Deliberately NOT electrical, plumbing, HVAC or cleaning** — those pros can't do the work and would start treating our email as noise.

**A 1:1 mapping is a silent reach cap (2026-08-28).** An Appliance Repair job reached exactly one contractor and was reported as an email bug. It was two faults stacked. The immediate one was activation — only one pro was both `active` and specialty-matched at dispatch time — and note that **`contractors` has no `updated_at`**, so there is no way to prove after the fact when anyone was re-approved; a deactivation window is invisible in the data. The structural one was worse: **19 of the 23 service labels mapped to themselves and nothing else**, so even with every pro active the job could only ever reach 2 of 23. Re-approving everyone would have taken the email from 1 recipient to 2 and it would still have looked broken.

Nine labels were widened (Appliance Repair, Windows & Doors, Garage, Locksmith, Gutters, Siding & Roofing, Concrete / Masonry, Snow Removal, Landscaping); Appliance went 2 → 13. **Locksmith matched ZERO active pros.** The "unmapped labels pass through to everyone" fallback keys on the label being *absent from the table*, so a label that IS mapped, to a specialty nobody holds, reaches nobody at all — no error, no empty state, nothing anywhere says so. **`public.trade_reach(service)` is the one function that answers "how many pros would actually see this?"** — check it before assuming a trade is covered.

Compulsory trades (Electrical, Plumbing, Air Conditioning, HVAC), Cleaning, Solar and the four vehicle labels were deliberately **not** widened, for the same reason Handyman excludes them.

**Order matters when fixing this: widen the map FIRST, then `refire_request`.** `refire_request` shrinks `dispatched_to` to actual bidders and re-invokes `dispatch-job`, which recomputes the match from the map *at that moment* — the other order re-mails the same two pros and burns the re-fire.

**Preferred-pro reservation:** a request with `preferred_contractor_id` (rehire) is visible and biddable ONLY to that pro for 48h, enforced in both `list_open_jobs` and `place_bid`; the `notify_preferred_contractor()` trigger sends the dedicated `rehire_request` bell (and `notify_contractors_new_request()` short-circuits so the pro isn't alerted twice).

**Re-firing a stalled request (2026-08-05).** `client_requests.dispatched_to` is a **permanent** "already told them" list, not a cooldown — `dispatch-job` filters on it, so re-invoking it is a no-op and there was no way to nudge pros who got the email but never bid. `refire_request(request_id)` **shrinks `dispatched_to` down to the contractors who already bid**, then re-invokes dispatch-job: every matched pro who hasn't quoted is emailed again exactly once per re-fire, nobody who already quoted is pestered, and the guard is intact afterwards so a stray double-invoke stays a no-op. It recomputes the same matcher itself (service_specialty_map, active, minus `hidden_jobs`, minus bidders) because dispatch-job answers asynchronously and its count can't be read back. Rehire reservations are respected.

`refire_stale_requests(p_min_bids default 3)` runs hourly (pg_cron `refire-stale-requests`, `22 * * * *`) and nudges at **~24h and ~48h only, max twice** (`refire_count < 2`, plus a 20h belt-and-braces gap), and only while the request is pending, under 3 bids and unawarded. Each request is wrapped in its own exception block so one bad row can't stop the sweep. `admin_refire_request(request_id)` is the **admin-only button** on the Requests tab — it deliberately ignores the two-nudge cap and returns `{reached, bids, refire_count}` so the press is informed. New columns `client_requests.refire_count` / `refire_last_at`. **A manual re-fire done in raw SQL must bump `refire_count`**, or the next sweep re-sends an email that just landed.

**`escalate_stale_unbid_requests` used to be a fourth, private matcher** (`service_needed ILIKE '%'||specialty||'%'`). `'Plumbing Repair'`/`'Plumbing'` is true so the bug hid, but `'General Handyman'`/`'General Repairs'` is FALSE — and that's where the volume is. It corrupted `n_match`, which feeds the admin alert text, so the owner was told "no active contractor matches this trade" about jobs fourteen pros match. It now reads `service_specialty_map` like everything else.

**Ranking (never a filter):** my-reserved → in-zone → fewest bids → newest. Zones parsed from `location` cover NW/NE/SW/SE, Downtown/Beltline and towns (Airdrie/Cochrane/Chestermere/Okotoks/Strathmore); out-of-zone jobs stay visible, just lower. `admin_rank_contractors(request_id)` applies the same logic to the admin view.

## Scheduling
Contractor proposes a time + price (`propose_job_schedule`, accepts optional add-ons) → client approves (`approve_job_schedule(p_job_id, p_selected_items int[])`, **idempotent add-on math**).

**Day-before confirm-or-change:** `run_reminders()` step 3 pings scheduled visits within 28h (`visit_reminder_sent_at`). Client uses `confirm_visit(job)` or `client_reschedule_visit(job, ts)` (flips back to `assigned`, warns the pro); contractor uses `contractor_accept_reschedule(job)` or re-uses the propose form to counter.

**A client cannot move the time inside 24h of the booked start (2026-08-31).** `client_reschedule_visit` raises in plain English when `scheduled_at - now() < 24h`, and the dashboard hides the reschedule control in the same window with the same wording, so the button and the RPC agree. A pro who has blocked out a morning, bought parts and driven across the city was previously losing the slot with no notice and no remedy — and because a reschedule flips the job back to `assigned`, it also unwound the schedule stamps. **The DB check is the real rule; the UI is a courtesy.** The client is pointed at chat instead, which is the right escalation: a same-day change is a conversation, not a form. The contractor side is deliberately unrestricted — a pro who genuinely can't make it must always be able to say so.

**T-1h reminder:** **visit-reminder** edge fn + pg_cron `visit-reminders` every 10 min via `kick_visit_reminders()`, acting on visits **50–70 min out** with claim-then-send on `jobs.hour_reminder_sent_at`. Content is facts + the last 8 non-blocked messages **verbatim** — no AI, nothing invented. **Email is gated OFF** behind `visit_reminder_enabled()` returning false: cron runs, 🔔 fires, Resend is skipped. One command turns it on.

**Known gap:** `run_reminders()` runs once daily at 16:30 UTC with a 28h lookahead, so a job booked **<19h out** gets no day-before prompt. The T-1h reminder still fires.

## Slot release
`release_unconfirmed_visits()`, pg_cron every 15 min. A booked visit never **signed AND paid** by its deadline gives the *time* back and nothing else: `status` → `assigned` (exactly where the pro's propose form reappears), the eight schedule/reminder stamps NULLed, `jobs.slot_released_at` / `slot_released_from` recorded. **The job, estimate, contractor assignment and agreement all survive.**

Deadline = `greatest(scheduled_at - 12h, client_approved_at + 2h)` — 12h lets the pro refill the slot; the 2h floor stops a genuine same-day booking being released instantly. Skips funded stages, held prepay pools, and `on_my_way_at` set. Both parties get a `visit_slot_released` notification which **deliberately DOES email** (transactional and consequential).

## Mandatory before/after photos
Both photos are **required**; `mark_job_complete` and `complete_milestone` raise without them (admins exempt on milestones). Photos are saved **on capture**, not at completion — `save_job_photo(p_job_id, p_kind, p_path)` writes immediately, so a pro who closes the app between arriving and finishing keeps the before shot.

Columns `jobs.before_photo_path` / `before_photo_at` / `after_photo_at`. Both live in the existing private **`completion-photos`** bucket at `<job_id>/before-<uuid>.<ext>` / `after-<uuid>.<ext>` — matching that path convention gave client + admin read access for free via the bucket's existing `split_part(name,'/',1)` policies. The RPC re-checks the path prefix.

**Grandfathering via `photo_rules_start()`** = `2026-08-02 00:00:00+00`: the *before* rule applies only to jobs created on/after it; the *after* rule applies to everyone. This stops an in-flight job's payment being stranded by a rule its pro was never shown.

`src/components/JobPhotos.tsx` exports **`photosMissing(job)`** — the single source of truth used by the gate, the dimmed button, the inline hint and the attention card, so those four can never disagree. `accept="image/*"` **without `capture`** so a pro can attach a photo already taken elsewhere.

**The uploader is styled as a payment gate, not as an optional extra (2026-08-31).** It previously read as one more grey panel among a dozen on a long card, and pros were reaching "Mark complete" — the button that releases their money — before noticing it was disabled. An outstanding photo now carries an amber/orange treatment and states the consequence in the panel itself rather than only in the hint underneath. The urgency is driven by `photosMissing(job)`, so it clears itself the moment both photos land and cannot disagree with the gate. Its section is `A_PHOTOS`, so the attention row lands on the uploader directly (see the anchor note in Frontend).

## On-job tools
- **`JobChecklist.tsx`** + `src/lib/checklistTemplates.ts` — a GENERIC 8-item list plus per-trade templates for all 23 service labels (`suggestedChecklist(serviceNeeded)`). `set_job_checklist(p_job_id, p_checklist)` (cap 40). Client sees read-only progress.
- **`JobTimer.tsx`** — multi-session start/stop (`start_job_timer`/`stop_job_timer`, `job_time_logs`). "Bill for tracked time" rounds to the nearest 15 min × `contractors.hourly_rate` and **pre-fills the existing price-change form** — no new payment path. Gated off milestone/released/disputed jobs. Client sees tracked time read-only plus the required billed-by-the-hour notice.

  **`start_job_timer` bells and emails the client (`timer_started`, 2026-08-31).** The client's only signal that work had begun was the pro's own word; now starting the clock tells them, and says plainly that tracked time does **not** change the price on its own — a price change is a separate, explicitly-approved step. `timer_started` is deliberately **absent from `EMAIL_HANDLED_ELSEWHERE`**, so the notifications webhook emails it; there is no dedicated emitter to duplicate.

  **⚠️ The first version of this shipped silently broken, and the shape is worth memorising.** The notify block looked up the contractor's display name with `join contractors c on c.user_id = p.id` — **there is no `user_id` column on `contractors`; `contractors.id` IS the auth uid.** That raised 42703, and because the cosmetic lookup and the real `_notify()` call sat inside **one shared `exception when others then null`**, the catch-all swallowed the notification along with the failed lookup. The timer started, no error surfaced anywhere, and the client was told nothing.

  The structural rule: **a catch-all may cover exactly one thing that matters, and anything cosmetic in the same block gets its own guard.** This is the pgcrypto signup-killer in miniature — a nice-to-have failing inside the same `begin…exception` as the thing that actually matters takes it down with it. The fix splits the blocks and joins on `c.id = p.id`. Verified by rolled-back probe under real JWT claims: notifications 18 → 19, `type=timer_started`, name resolved from `company_name`; a second start correctly raises "A timer is already running on this job" and does **not** re-bell (19 → 19).
- **`JobExpenses.tsx`** — `job_expenses` table, contractor-private (**clients NEVER see it**; RLS contractor-own + admin read). Shows per-job costs · 93% payout · est. profit, and a "Real profit" rollup on the earnings tab.
- **`RequestPhotoQuote`** — client job-request photos, visible to the pro and admin.
- **`src/lib/jobText.ts` + `src/components/JobDescription.tsx` — NORMALISE, NEVER REWRITE (2026-08-31).** A job description is free typing from someone describing a broken thing on a phone, and `composedDescription()` joins several parts with blank lines ("what they wrote" + an answer summary + "Details: a, b"). Every reader rendered it in a plain `<div>`, which **collapses those blank lines**, so the sentence, the summary and the tag list ran together into one unpunctuated wall — that is most of what read as "bad grammar"; the rest is missing capitals and full stops. `tidyDescription()` restores the paragraphs and fixes spacing, sentence case and terminal punctuation, and `tidyOneLine()` is the snippet form.

  **It does not paraphrase, reorder, expand abbreviations or "correct" a trade term.** Spacing and case cannot change meaning; rewriting can — and this text sits in front of a contractor who is about to **price the job off it**, and in front of the client in their own dashboard. Two carve-outs earn their keep: an ALL-CAPS token is left alone (`A/C`, `GFCI` and model numbers are names, not shouting), and a label-prefixed list line gets no full stop, because a period on `Details: fridge, freezer` reads like a sentence that lost its verb.

  `JobDescription` clamps to 4 lines with a **measured** Read more / Show less — `-webkit-line-clamp` is applied first, then `scrollHeight > clientHeight` decides whether the button renders at all, re-measured on resize via `ResizeObserver`. Line count depends on container width, so this cannot be decided from character length, and a "Read more" that expands to reveal nothing is worse than no button. The clamp also matters on its own: a long description used to push the Bids block and the bid button below the fold on a phone, so the one thing a contractor opened the card to do was the hardest to reach.

## Recurring jobs
`src/lib/recurrence.ts` — `FREQ_LABELS`, `recurrenceOptionsFor(services)`, `isPerKmService`, `cadenceHint`, `SLIDER_STOPS`, `freqLabel(token)` (formats any token including `every_N_weeks`/`every_N_months`).

Booking UI is a **6-stop slider** (1wk/2wk/3wk/1mo/2mo/3mo → `weekly, biweekly, every_3_weeks, monthly, every_2_months, quarterly`) plus separate **Seasonal** and **Per distance (km)** buttons (vehicle services), plus an optional **specific visit dates** multi-picker layered on top of the cadence.

`generate_recurring_occurrences()` (hooked into `run_reminders()` step 0) creates the next request when due, copying the plan, reserving the same pro via `preferred_contractor_id`, and notifying both. **No auto-charge** — the client still approves each occurrence. A specific-dates branch materializes each pinned date within its 7-day lead window, deduped via `recurring_source_date`, independent of the single-outstanding cadence guard. `freq_interval()` regex-parses `every_N_*`; `recurrence_interval('per_km')` = 4 months (can't read an odometer).

Plan columns on `client_requests`: `recurring_plan_status` (active|paused|ended), `recurring_next_due`, `recurring_parent_id`, `recurring_dates date[]`, `recurring_source_date`, `recurring_interval_km`, `recurring_prepay_pref`. RPCs `list_my_recurring_plans`, `set_recurring_plan_status`.

---

# Contracts / e-signature

**In-house e-signature, required on EVERY job, fail-CLOSED.** Legally valid under Alberta's Electronic Transactions Act + PIPEDA (intent + typed-name signature + IP/timestamp audit trail).

Flow: contractor composes a Service Agreement (auto-generated by `build_contract_body`, or **uploads their own** with a mandatory liability-ack) + optional custom clauses → contractor signs (this "sends" it) → client reviews and signs → a tamper-evident signed HTML copy (both names, date/time/IP) is generated and emailed to both.

`job_contracts` (one per job: status draft|sent|signed|void, source generated|uploaded, body_md, custom_clauses, uploaded_path/ack, per-party `signed_at`/`sig_name`, signed_html) + a private **`contracts`** bucket. RPCs `get_job_contract`, `build_contract_body`, `save_contract_draft`, `contract_signed`, `contract_required` (**true for every job**), **`contract_ready(p_job_id) returns text`** (NULL = ready, else the plain-English reason). Edge **contract-sign** v2 returns **409** with that reason.

**`contract_ready` is also the payout gate (2026-08-16).** Its fifth reason requires `contractors.stripe_payouts_enabled` before the agreement can be sent. This closes the money trap by construction: because the payment functions already 428 on an unsigned agreement, blocking the signature means **no client can ever be charged for a job whose contractor has nowhere to be paid** — which previously failed at the very last step, after the client had paid twice and the work was done. It touches **none of the four payout guards**; it sits upstream of all of them. The contractor composes and signs first, so the contractor is the one who sees this, not the client. Deliberately NOT a gate on bidding — a pro bids freely with nothing on file, and friction is spent only once they have won (see Verification markers).

**The payment gate is fail-CLOSED:** `create-payment-intent`, `create-balance-payment`, `create-milestone-payment` and `create-recurring-prepayment` return **HTTP 428** on unsigned OR on any check error. The frontend mirrors this — `ClientDashboard` starts `contractBlocked = true` and only clears it on a positive `contract_signed`; an RPC error shows "couldn't verify — please refresh" rather than letting a doomed click through.

`jobs_void_contract_on_price_change` voids a **signed** agreement when `jobs.amount` changes — but **only while `payment_status='unpaid'`**, since after that the price-change flow has its own explicit consent and voiding would strand a funded job.

**`ContractPanel.tsx` has seven return branches** and `CONTRACT_ANCHOR = "ff-contract-panel"` is spread onto **all of them, including loading** — a real tap usually lands before `get_job_contract` resolves, and without an id there the scroll silently no-ops.

**The agreement is signed BEFORE any payment**, so `client_fee`/`total_charged` are still NULL at that moment — `build_contract_body` derives the fee and the 40/60 schedule from `platform_fee_rate()` instead. This also fixed a pre-existing defect where every contract printed a bare "Job price $X" with no fee, no total and no schedule, which Alberta's written-copy rules require.

**Permits & certification section (2026-08-16).** `build_contract_body` emits a `## Permits & certification` block between *Price & payment* and the Alberta cancellation rights, but **only when the job's `service_needed` is flagged in `service_compulsory`**. It states the trade the work legally requires, and sets the default that **the contractor determines whether a permit is needed, pulls it before starting, and hands over the permit number and inspection result**, with the fee included in the price. Unpermitted electrical/plumbing/gas work is the failure that surfaces years later — an insurer refuses a claim, or it kills a sale — and nothing on the platform asked. Restricting it to genuinely gated trades is deliberate: a permit clause on a lawn mow is boilerplate the client skims past. An **unknown service label produces no section**, never a false claim. The trade's indefinite article is computed (`~* '^[aeiou]'`) because "a Electrician" in a legal document reads as carelessly generated. That change also fixed the function's `search_path`, which was still `public, pg_temp`.

Legal: UserAgreement **§6.11** (client) + **§9.5** (contractor) — e-signature validity, and *the agreement is strictly between contractor and client; it places NO liability/obligation/warranty on the Company; any such term is void; contractor indemnifies the Company for clauses or documents they add.*

**This is the highest-risk surface on the platform.** A superset installer once dropped the `<ContractPanel/>` mounts, and because the gate fails closed, **every job became unpayable with no error anywhere** — the client simply had no surface on which to sign. `job_contracts` had 0 rows and 0 jobs had ever reached `held`.

---

# Chat & messaging

## Chat guard
Blocks circumvention (phone / email / messaging_app / social / payment / off_platform). `chat_flag_reasons(text)` returns tokens; the BEFORE INSERT trigger `messages_chat_guard` → `chat_guard()` **sets `new.blocked := true` rather than RAISEing**, because a RAISE would roll back the row that is itself the evidence.

`messages.blocked` + `flag_reasons`; the SELECT policy is `blocked is not true or sender_id = auth.uid()`, so the recipient never sees it — and since realtime respects RLS, that governs the live stream too. `notify_new_message()` returns early on `NEW.blocked`, **before** touching `message_email_log`, so a blocked message can't email anyone or burn the 15-minute throttle a legitimate follow-up needs.

Client side: `src/lib/chatParse.ts` `blockedReason()` + `BLOCKED_HELP`; the sender keeps their text, sees a red banner and a struck-through "Only you can see this message" bubble. Admin: `admin_list_chat_flags(p_limit)` behind a **Flagged chat** tab.

## Scheduling from the chat
Detection **must** be client-side (Postgres can't resolve "thursday at 2pm" against the reader's local calendar). `detectDateTime()` in `chatParse.ts` is deliberately conservative — it needs **both** a day anchor and a time of day, since a false positive books an appointment nobody agreed to. `findTime` requires am/pm, noon/midnight or a colon; `findDay` tries ISO → "august 5" → "5 august" → today/tomorrow → weekday → slash-date last, guarded so `3/4 inch coupling` isn't March 4th. Verified 11/11 should-fire, 16/16 should-not-fire.

The sender's browser fires `chat_propose_time` fire-and-forget after its own message sends (a scheduling hiccup must never make a delivered message look failed), stamping `jobs.chat_time_at/_by/_proposed_at/_msg/_resolved_at` — so the prompt reaches the other side with **no polling and no open chat window**. `ChatTimePrompt.tsx` is role-agnostic and mounted in both dashboards keyed on `chat_time_by !== me`.

`chat_agree_time` branches so it can **never skip a payment step**: `scheduled` (booked and paid — the time simply moves), `proposal_updated` (estimate with the client — only the proposed time moves), `penciled` (no estimate yet), `ignored`. All three live branches write `scheduled_at`, so the calendar updates for free. Dismissing only hides the modal; an attention row persists.

## Inbox + unread
**Read state is per-person, not per-message:** `message_reads` holds one row per `(job_id, user_id)` with `last_read_at`. One write per open regardless of message count, survives messages landing mid-read, and gives each party an independent position. (The legacy per-row `messages.is_read` is dead — nothing reads or writes it.)

**`my_conversations()`** returns every job the caller is party to **plus** its unread count **plus** the running total in one call — inbox rows, sidebar badge and per-job pills all read the same array, so a "3 unread" badge can't open onto an empty list. Blocked messages are excluded from both count and snippet. **`mark_job_read(p_job_id)`** returns early unless the caller is the job's client or contractor, which is what makes admin peeking safe.

`src/lib/chatUnread.ts` — `useConversations(userId)` (`unreadFor`, `markRead` optimistic-then-reconcile, `refresh`), the time formatters, and **`chatReadOnly(job)` / `chatClosedReason(job)`**: chat closes only once `status==='completed' && payment_status==='released'`, or the job is cancelled. The old `status==='completed'` test **cut off messaging during the 3-day dispute window**, precisely when a client most needs their pro.

`MessagesInbox.tsx` is deliberately dumb — renders what it's handed, never queries or counts. Rows keyed on `job_id`. Unread also appears in *Needs your attention*, capped at 3 (contractor) / 2 (client) so chat can't bury money-gating rows.

Admin needed no DB work — the existing `Admin full access to messages` ALL policy means a **Read chat** button on the Jobs tab opens `JobChat` with `role="admin"`, `readOnly`; `markRead()` is a no-op for admins.

## Bid-stage chat (2026-08-18)
A private thread between the client and **ONE** pro who bid, **before any job exists** — so a client can ask several pros a question and compare answers, not just prices.

Two rules are load-bearing and enforced in the **database, not the UI**:
- **The CLIENT opens the thread; a pro can only reply.** A pro who could message first would turn a posted request into a cold-call list.
- **A pro sees only their own thread.** RLS matches a contractor on `thread_contractor_id`, so pro A can never read pro B's conversation.

Built on `public.messages` **on purpose**, not a parallel table — so `chat_guard()` circumvention blocking, the `blocked` flag and sender-only visibility all apply unchanged. Bid stage is exactly where the incentive to go off-platform is highest, because there is no job yet to lose.

`messages.request_id` + `messages.thread_contractor_id`, with CHECK `messages_one_thread` = `((job_id is not null) <> (request_id is not null)) and (request_id is null or thread_contractor_id is not null)` — a message belongs to a job **or** a request, never both. Index `messages_request_thread_idx`. Read state in `bid_thread_reads (request_id, contractor_id, user_id, last_read_at)`, the same per-person model as `message_reads`.

**The "has the client written yet?" test cannot live inline in the send policy** — an INSERT WITH CHECK on `messages` containing a subquery on `messages` is *infinite recursion*. It lives in `SECURITY DEFINER` **`bid_thread_open(request_id, contractor_id)`**, which also made the test stricter: it requires that the **request owner** specifically has spoken, not merely somebody other than the caller.

`my_bid_threads()` returns threads + unread + snippet in one call. Its client side is one row per pro who bid on any of my `status='pending'` requests, so a thread can be **started** from the list; its contractor side returns only threads the client has already opened, so an empty result genuinely means nobody has written. `mark_bid_thread_read(request, contractor)` returns early unless the caller is one of the two parties.

`notify_new_message()` gained a request branch **before** the untouched job branch. It **does not** touch `message_email_log` (PK is `(job_id, recipient_id)`, and `job_id` is null here) — it throttles on the `notifications` table instead, 15 min per recipient. Type is `bid_message`, routed to `available` (contractor) / `requests` (client) in `notificationRoutes.ts`.

**`BidChat.tsx` is deliberately TEXT ONLY.** Attachments would need storage RLS keyed on a job id that doesn't exist yet, and a pre-hire question doesn't need a photo — the client's request photos are already on the request.

Verified end to end with a rolled-back RLS probe under real JWT claims, 16/16: contractor-initiates blocked, client-opens OK, pro-replies OK, pro2 reading pro1's thread returns 0 rows, pro2 hijack blocked, unread 1 → 0 after mark_read.

## Media in chat
Private **`message-media`** bucket (image/jpeg,png,webp,gif,heic,heif + video/mp4,webm,quicktime; 50MB cap), `messages.attachment_path` / `attachment_type`, path convention `<job_id>/<file>` with storage RLS keyed on the first path segment. `JobChat.tsx` validates type and size **before** upload (images ≤10MB, videos ≤50MB), supports caption-only or attachment-only messages, and renders via 1-hour signed URLs cached in state.

**Bid-stage chat carries photos too, in the SAME bucket under a second path convention (2026-08-28).** `BidChat` was "deliberately TEXT ONLY" because storage RLS on `message-media` keys on a **job id that does not exist yet** at bid stage. A parallel bucket was the obvious move and the wrong one — it would have duplicated the sender-only-visibility and `chat_guard` plumbing. Instead bid media lives at **`<request_id>/<contractor_id>/<file>`**, gated by `bid_media_path_ok(name)`, which **re-derives both load-bearing bid-thread rules from the path itself**: the client may only write into the folder of a pro who actually bid, and the pro may only write into their own folder and only once `bid_thread_open()` says the client has spoken first. So an upload can never get ahead of the rule it exists to serve, and pro A can never write into pro B's folder.

**⚠️ The uuid first segment is mandatory, and not for tidiness.** The existing `message_media_*` policies do `(split_part(name,'/',1))::uuid` — a **cast, not a match**. One object whose first segment isn't a uuid raises 22P02 *during policy evaluation*, which breaks reads of the **whole bucket for everyone**, not just that row. `bid_media_path_ok` uses a `CASE` so its regex shape test short-circuits ahead of its own two casts, for the same reason.

`bid_media_select` is keyed on the **message row**, not the path (`exists (select 1 from messages m where m.attachment_path = objects.name and m.request_id is not null)`), so it inherits `messages` RLS's pro-A-cannot-read-pro-B answer instead of restating it and drifting. The consequence to remember: **an object is unreadable until a message points at it**, which is why the composer previews from a local `URL.createObjectURL` and `signMissing()` only ever runs after the insert. Verified 9/9 with a rolled-back probe under real JWT claims (client-into-bidder-folder OK, client-into-non-bidder blocked, pro-before-client blocked, pro-after-client OK, pro2 hijack blocked, non-uuid shape denied as 42501 not 22P02, unlinked object unreadable).

`my_bid_threads()` and `my_conversations()` already fell back to `'Sent a photo'` on `attachment_path is not null`, so inbox snippets needed no DB change. BidChat is **images only** on purpose — a pre-hire question doesn't need a video, and 50MB uploads from someone who hasn't been hired yet is a bill with no job attached.

## Image safety scanning
`src/lib/imageSafety.ts` → `scanImage(bucket, path)` → `{verdict, categories, detail}`, backed by the **`scan-image`** edge function (v1, `verify_jwt=true`) and the **`image_scans`** ledger, unique on `(bucket, path)` so a re-scan reads the stored row instead of paying for a second model call.

**It fails open in two places, deliberately.** The function returns `"unknown"` for every condition it can't resolve — no key, download error, model timeout, unreadable format — and returns those as **HTTP 200** so no caller can learn to read a status code as a rejection. The library is the second layer: any network/parse failure on the browser side also returns `"unknown"`, and every caller treats `"unknown"` as *send it*. The browser gives up at **12s** while the function aborts at 20s, because the person is holding a Send button — and giving up early is safe rather than wasteful, since the function keeps running and still writes its verdict. This is the same rule `imageCompress.ts` follows when every failure path returns the ORIGINAL file, and for the same reason: a completion photo is a payment gate, a problem photo is a client's remedy, and losing one to a scanner outage is a far worse failure than briefly letting through a photo a human can still deal with.

**`shouldBlock(r, { evidence: true })` is the surface distinction.** On evidence surfaces — dispute exhibits (`ReportProblem`, `RespondToClaim`) and completion photos (`JobPhotos`, `MilestonePanel`) — a **`gore` reject does NOT block**, because a claim can legitimately be about an injury the work caused and a finished-work photo is what releases money. Refusing either would use a moderation tool to destroy somebody's only route to being paid or made whole. They are still **scanned**, so the verdict reaches `image_scans` for an admin either way. `sexual` and `hate` block on every surface without exception; neither is ever evidence of anything on a home-services platform. A `flag` verdict (readable contact details) is never a block — it's recorded for the admin queue, exactly like `chat_guard()`'s text-side flags, because a photo of a furnace label carrying the manufacturer's support number is innocent.

**The scan is NOT a security boundary.** It runs *after* the object is in storage — it has to, since the function reads the object — so a caller that skips it changes nothing about who can upload. Storage RLS governs that. This is moderation, and it is advisory by construction.

Wired at every image upload: `ClientOnboarding`, `NewRequest`, `RequestPhotoQuote`, `JobChat`, `BidChat`, plus the four evidence surfaces. **Refusal copy differs by what the person can still do**: `NewRequest` stops *before* the request insert, clears `photoFile` and says "press Submit again to post without a photo" — nothing is half-created and the page is still on screen. `ClientOnboarding` posts first and explains on the success screen, because the account and the request are already made and refusing there would strand a signup.

## Client photo nudge (2026-08-28)
A request photo is **optional and stays optional** — it is a nudge, never a gate. Pressing Next on ClientOnboarding step 2 with no photo pulses `#co-photo`, adds an asterisk and shows the advisory once; a second press proceeds. The nudge sits **after** `validate()`, so a real error still wins. `photoNudged` is a **useRef, not state**, because a re-render between the two presses would race the click handler. The asterisk appears **only after the nudge** — marking a genuinely optional field on first sight is a lie. That page is outside `.ffdash`, so it carries its own `@keyframes ff-co-pulse` / `.ff-photo-pulse` rather than reusing the dashboard's `.ff-pulse`.

Afterwards the gap is recoverable rather than lost: a `pending` request with no `photo_path` pushes a **"Your request has no photo"** attention row (below every money row, above the conversational ones) whose CTA calls `focusPhoto`, and `RequestPhotoQuote` takes `canUpload` so the photo can be added from the dashboard at any time. **`focusPhoto` must `setReqDetailOpen(true)` before scrolling** — the photo panel lives inside the request-detail block, which is collapsed exactly when estimates are on screen, so without that the CTA scrolls to nothing. Scoped to `pending` because once a pro is picked the photo has done its job.

**`NewRequest` carries the same nudge (2026-08-31).** The returning-client form is where most repeat requests are actually posted, so nudging only on ClientOnboarding covered the smaller half of the traffic. Same three rules — after `validate()`, `useRef` not state, asterisk only after the first press — and the second press still posts. It stays a nudge on this form too: a returning client posting a job they've posted before is exactly who should not be blocked over a photo.

**Switching requests must clear the previously-selected job (2026-08-31).** `ClientDashboard` keeps the open job in state, and picking a different request left the old `job` mounted underneath the new request's header — so the payment panel, the agreement and the attention anchors all belonged to a job the client was no longer looking at. That is a money surface reading from the wrong row, which is worse than a blank one. The selected-request setter now clears the job alongside it, and the read that repopulates it is keyed on the new request. **A failed read still is not an empty result** — the existing `jobLoadFailed` banner is preserved, so "couldn't load" and "no job yet" stay distinguishable.

---

# Notifications & email

## Pausing outbound email (2026-08-19)
**There is ONE switch, not two.** `public.outbound_paused()` = `platform_mode() in ('paused','waitlist')` — it owns no flag of its own, it reads the site pause the admin Platform tab already sets. So **`set_platform_mode('open')` turns every emitter back on by itself**; there is nothing to remember to flip back, which is the whole point (a second switch is one somebody forgets, and then the site reopens silently and nobody hears from us).

Gated with an early return: `trg_dispatch_new_request`, `kick_newsletter`, `kick_visit_reminders`, `run_reminders` and the job-thread branch of `notify_new_message`. The two Database Webhook triggers — `"send-notification-email"` on `notifications` and `"notify-admin-client "` on `client_requests` (**trailing space, load-bearing**) — were **recreated with a `WHEN` clause** rather than `ALTER TABLE … DISABLE TRIGGER`, because a WHEN clause is self-re-arming and a disabled trigger needs a manual, forgettable reversal. A trigger WHEN clause may **call a function but may not contain a subquery**, which is why the health-check exemption is keyed on `NEW.type = 'health_alert'` and not on a `profiles` lookup of the admin recipients.

**The in-app 🔔 survives the pause** — the `notifications` ROW is still inserted, only the email fan-out is suppressed. Unread counts, badges and `my_conversations()` are untouched.

**Gate placement is deliberate.** In `notify_new_message` it sits *before* the `message_email_log` upsert so the 15-minute throttle isn't burned on a message nobody was told about. In `run_reminders` it's the very first statement so `reminder_log` and `visit_reminder_sent_at` are never stamped — nothing is permanently skipped, the nudges just resume.

**Not gated, on purpose:** `enqueue_admin_alert` and the `health_alert` type (the owner's only warning system while the site is dark — his call); payment receipts and the money sweeps `reconcile-payouts` / `auto-confirm-stale-jobs` / `release-unconfirmed-visits` (a payout that is owed is owed whether or not we're open — also his call); **GoTrue auth mail**, since silencing signup confirmation and password reset reproduces the Aug 2026 lockout incident exactly; and **both signup welcome emails** (see below).

**Signup welcome mail was un-gated on 2026-08-23 — owner's call, and it belongs with GoTrue.** `send_contractor_welcome` used to return early on `outbound_paused()`, so a pro who signed up during the pause heard *nothing at all* from us. That is the Aug 2026 shape exactly: our welcome was the only mail that reliably reached a new account, so muting it makes a broken GoTrue confirmation completely invisible — no welcome, no confirmation, no error, nothing to reply to. The pause is about not soliciting people, not about refusing to answer someone who just handed us their email address. Instead of a gate, **the copy is mode-aware**: in `waitlist`/`paused` the client email says plainly that we aren't taking jobs yet, rather than promising estimates that can't arrive. Verified with a rolled-back probe under `outbound_paused() = true`: both welcomes still enqueue, and a contractor signup does not enqueue a client email.

Cron stand-down is belt-and-braces — the real guarantee is `outbound_paused()` **inside** each emitter, so hand-re-arming a cron job still can't send mail while the site is paused. While paused, 4 jobs run (`reconcile-payouts`, `auto-confirm-stale-jobs`, `release-unconfirmed-visits`, `platform-health-check`) and 6 are stood down (`daily-reminders`, `visit-reminders`, `newsletter-client`, `newsletter-contractor`, `refire-stale-requests`, `escalate-unbid-requests`).

**`set_platform_mode`'s quiet-list had a gap** — it named only three cron jobs, so `newsletter-contractor` stayed armed for the entire pause and kept firing every Tuesday 16:00 UTC at 25 subscribers with 8 issues queued. It now names all six. If you add an outbound cron job, add it to that list *and* gate its `kick_*` function; the list alone is not the guarantee.

## The duplicate-email rule
A **Database Webhook fires on EVERY `public.notifications` INSERT** → `send-notification`. Some notification types are ALSO emailed by a richer, dedicated function. When that happens the type goes in **`EMAIL_HANDLED_ELSEWHERE`** in `send-notification` — the in-app 🔔 still writes and shows, only the generic email is skipped.

Current set: `job_in_field`, `rehire_request`, `contractor_guide`, `chat_time_proposed`, `chat_time_agreed`, `visit_reminder`, `bid_received`.

**Before adding a type, verify it has exactly one emitter** — suppressing a type with several emitters silently kills legitimate mail. Conversely, a genuinely transactional type (`visit_slot_released`, `contract_signature`) is deliberately left OUT so it does email.

Historical duplicates fixed: the legacy `notify-admin-contractor` trigger duplicated `contractor-welcome` + `admin-alert` (dropped; `notify-admin` v17 reduced to client-confirmation-only — note the sibling trigger name **`"notify-admin-client "` has a trailing space**); `job_in_field` doubled with `dispatch-job`; `rehire_request` doubled with `dispatch-job` inside the 48h reservation window (fixed by making dispatch-job v16 reservation-aware rather than dropping the richer email); `bid_received` doubled with `send-bid-email`, whose copy carries the pro's name, the price and the one-tap `/pick/<token>` link while the generic one only offered a login wall.

**`notify_user` double-sent all thirteen of its types, and it did it in a way the suppression set could never have caught (2026-08-23).** The helper wrote the bell row — firing the webhook, which emails — **and** separately posted the same title and body to the `send-reminder` edge function, which emailed a second, thinner copy from the same address. `EMAIL_HANDLED_ELSEWHERE` was no defence: it suppresses the *webhook's* email in favour of a richer one elsewhere, and here the webhook's copy was the better of the two. **The duplicate emitter has to be found by reading the emitting function, not by reading the type list.** The post is gone, `send-notification` v16 is the sole emitter for those types, and `send-reminder` — the open relay described in the security section — lost its last caller as a result and is now a 410 tombstone.

Two things that were being lost with it, and one that wasn't. `notify_user` carried a per-call CTA the webhook cannot see, because **the `notifications` table does not store one**; eleven of the thirteen pointed at the dashboard `dashboardFor(role)` already resolves, so those lost nothing. `recurring_due` and `seasonal` pointed at `/new-request` — they are re-booking nudges, and sending them to a dashboard with nothing on it would put a click between the nudge and the thing it nudges — so they are preserved explicitly in `CTA_OVERRIDE` in `send-notification`. **Keep that map small and justified**: the dashboard is the right destination for nearly everything, because it is where the thing being notified about actually lives.

The direct post was also **invisible to `outbound_paused()`**. The webhook honours the pause through its trigger `WHEN` clause, but a raw `net.http_post` in a function body answers to nothing — so while the site sat in `waitlist`, the *only* mail going out for those thirteen types was the thin duplicate, and it was going out precisely when the pause said nothing should. A new `net.http_post` in a function body is a pause bypass unless the function calls `outbound_paused()` itself.

## Routing
`src/lib/notificationRoutes.ts` — `noteTarget(type, jobId, dashboardPath)` → `{path, tab?, jobId?}`. `PAGE_BY_TYPE` handles dedicated pages (`contractor_guide → /contractor-guide`); then a per-role map resolves the tab (~42 types enumerated by regexing `pg_proc.prosrc` for `_notify`/`notify_user`). **Unknown types fall back to the dashboard root**, so a new type can never break navigation.

Because wouter no-ops on same-path navigation, `openNote` dispatches a `ff:dash-nav` CustomEvent when already on the target path, and otherwise navigates to `?tab=…&job=…`. All three dashboards mount `readDashNavFromUrl()` + `clearDashNavFromUrl()` (a `history.replaceState` so a later refresh isn't yanked back) and validate the tab against their own nav array. Contractor also clears `jobFilter` (a stage filter could hide the very job being opened) and scrolls to `#job-<id>`.

**`job_id` is NULL on ~94% of notifications**, so type→tab routing is the workhorse; `?job=` deep-linking is a bonus. Backfilling `p_job` across ~30 notifier functions was deliberately NOT done.

Sidebar badges render on the collapsed/mobile icon rail too (absolutely-positioned orange pill, `9+` cap).

## Edge functions that send
`send-notification` (webhook fan-out) · `notify-email` (v8, `verify_jwt=false`, `contract_copy` — **write-once**, guarded by `contract_copy_sent_at` with an `.is(...,null)` update so the Alberta 10-day clock can't be reset) · `dispatch-job` (v16, subject **"URGENT — new {service} job in {area}, bid now"**, reservation-aware, `BID_CAP = 7`) · `notify-accepted` · `admin-alert` (new_contractor / new_job to hello@, fired by AFTER INSERT triggers via `net.http_post`, wrapped in `enqueue_admin_alert` so a mail hiccup never blocks the insert) · `contractor-welcome` (v2, leads with the guide; fired by the `contractor_welcome_email` AFTER INSERT trigger → `send_contractor_welcome()`; **no expiry** — a leftover campaign guard in that fn would have silently no-opped from Sept 12) · **`client-welcome`** (v1, 2026-08-23 — see below) · `payment-receipt` · `visit-reminder` (**email OFF**) · `support-request` · `admin-message` · `finish-signup-nudge` · `contractor-outreach` (v13) · `newsletter-send` / `newsletter-unsubscribe` / `newsletter-ai-draft` · **`mfa-code`** (v1, two-step sign-in codes, gated on `x-ff-internal`).

**`client-welcome` (2026-08-23) — clients had never had a welcome email at all.** Contractors have had one since launch; a client signed up and the only thing that ever reached them was a GoTrue confirmation from a sender they don't recognise. Fired by the **`client_welcome_email` AFTER INSERT trigger on `public.profiles`, `WHEN (new.role = 'client')`** → `send_client_welcome()`. On `profiles` rather than `auth.users` because the role lives there and a WHEN clause is the cheapest filter — which also means `ensure_profile()`'s orphan repair sends it, the one case where somebody most needs to hear from us. `verify_jwt=false`, `{test:true}` previews to hello@.

**The load-bearing paragraph is the one naming the second email.** It says a separate confirmation is coming, to check spam, that they can't sign in until they click it, and to **reply to this email** if it doesn't arrive — so the Aug 2026 failure produces a reply instead of silence. The rest of the copy is mode-aware (`platform_settings.mode`, defaulting to `open` on any read failure, since the open copy is the superset), and it carries the referral code worded as **one friend**, matching `apply_referral_code` — promising "invite your friends" and then refusing the second one would be our bug showing up as their embarrassment.

**v2 (2026-08-30) dropped the words "different sender".** The paragraph originally told clients the confirmation mail came from a sender other than this one, which was true right up until GoTrue was pointed at Resend over SMTP on the same `noreply@freddyfixit.ca` address. **The paragraph itself stays, and that is the point** — it is still a second *transport*, and still the one nothing in our code can retry, so naming it is what turns a silent lockout into a reply. Only the sender claim changed.

`send_client_welcome()` is wrapped in its own exception block because it runs **inside the signup transaction**; an unguarded raise would roll back the profiles insert and orphan the auth user, which is the exact shape of the bug that killed every signup for a month. **A welcome email is never worth an account.**

**Neither welcome trigger carries an anon JWT any more.** Both target `verify_jwt=false` functions, so the bearer bought nothing — verified by posting to `contractor-welcome` with no `Authorization` header and getting its own `400 {"error":"missing id"}` back, which proves the body ran. `pg_proc.prosrc` is publicly readable and the repo is public.

**CASL:** mailing address `20 Whiteram Mews NE, Calgary`, `List-Unsubscribe` + `List-Unsubscribe-Post` headers (Gmail one-click sends **POST**, per RFC 8058), and unsubscribe handled **before** any auth gate, always returning the same page (no id-existence leak).

**DKIM:** an outage once killed ALL platform email — a second, truncated TXT record at `resend._domainkey.freddyfixit.ca` with no `p=`. Check for stray records first if Resend returns "domain not verified". **Since 2026-08-30 this is worse than it was**: auth mail rides the same key, so a DKIM fault now locks people out of their accounts as well as silencing receipts.

**⚠️ There WERE two email systems; since 2026-08-30 both are Resend — but they are still two different SENDERS with different failure modes.** Everything above — welcome, dispatch, receipts, reminders, newsletter — is ours, sent from edge functions via the Resend **API** as `noreply@freddyfixit.ca`. **Signup confirmation and password reset are sent by Supabase's GoTrue mailer**, which until 2026-08-30 was an unmonitored shared sender on a domain we did not own. It is now pointed at Resend over **SMTP** (`smtp.resend.com:465`) with the same `noreply@freddyfixit.ca` sender — so both paths share a domain, a DKIM key and a quota, but they are still **two different transports**, and GoTrue's is the one nothing in our code can retry. In Aug 2026 that path broke on its own: people signed up, got our Resend welcome, never got the GoTrue confirmation, and were **silently locked out with no error visible to anyone**. Three accounts were stranded — one an already-approved contractor who had been receiving job emails for five days that he could not act on — and we only found out because one of them phoned. Password reset runs through the same mailer, so "just reset your password" fails too and is not a workaround. That specific outage is closed, but the shape can recur any time GoTrue's transport fails, which is why `auth-rescue` exists.

Diagnosing it: **GoTrue returns HTTP 500 on SMTP failure and 200 on a successful handoff**, so triggering a real auth email from Postgres (`net.http_post` → `/auth/v1/recover`, then re-select `net._http_response` after `pg_sleep(12)`) tells you whether the mailer accepted it. A 200 proves handoff, never delivery — only an inbox proves that. The permanent detection net is health check 7 `no_stuck_signups`.

Standing owner instruction: **don't send bulk email without asking.**

## Signup rescue — `auth-rescue` (2026-08-30)

Health check 7 could only ever *tell* us somebody was locked out. `auth-rescue`
is the remedy, and it exists because on 2026-08-30 an account (`auth.users`
`5c597221`) was stuck in exactly the Aug 2026 shape: our Resend welcome arrived, the GoTrue
confirmation did not, no error was visible to anyone.

**This one was a DELIVERY failure, not an outage.** A live `net.http_post` to
`/auth/v1/recover` came back **200**, and `confirmation_sent_at` was stamped —
so GoTrue accepted the handoff and tried. The mail died somewhere past the
sender (spam, recipient filtering, or the reputation of Supabase's shared
free-tier sender), which is a place we have no visibility into and cannot
retry into. **Diagnosing a 200 as "email works" is the trap** — a 200 proves
handoff, never delivery.

**The fix removes GoTrue's mailer from the path while keeping its token
minting.** `admin.auth.admin.generateLink()` returns an action link and **sends
nothing**, so the edge function mints the link and delivers it over Resend, on
the DKIM-verified `freddyfixit.ca` domain that already carries every receipt,
dispatch and reminder we send — the one sender we monitor and whose failures
we would notice.

**A magic link is not a force-confirm, and the distinction is the whole
safety argument.** The recipient still has to receive the mail to use it, so it
proves address ownership exactly as the confirmation email did — it is a change
of *carrier*, not a weakening of verification. `admin.updateUserById({
email_confirm: true })` would unlock an account with no proof at all and was
deliberately rejected. Clicking the link both signs them in and confirms the
address, which is what finally clears health check 7.

**`auth-rescue` v1, `verify_jwt=false`, gated in code two ways.** Either an
`x-ff-internal` single-use token redeemed through `consume_internal_token`
(proving the caller is Postgres) or a real admin JWT resolved via
`admin.auth.getUser()` → `profiles.role`. `verify_jwt` buys nothing here, as
always — the anon key is a valid project-signed JWT and ships publicly.
Verified: a valid anon bearer with **no** internal token gets **403**.
**Identity comes from `auth_rescue_target(p_user)`, never from the request
body** — the body carries a uuid and nothing else, so it cannot name an email
to mail.

Two copy variants. **`apology`** says plainly that this was our fault, that
they did nothing wrong, that the link expires in 24h, and to reply for a fresh
one; **`stuck`** is the gentler automated nudge that suggests checking spam.
Both reply to hello@, so a failure produces a human reply instead of silence —
the same reasoning as the paragraph in `client-welcome` that names the second
email.

The sweep `rescue_stuck_signups()` runs hourly (pg_cron `rescue-stuck-signups`,
`37 * * * *`) over accounts **6h–7d old** with no confirmation and no sign-in,
**max 2 successful rescues ever and none within 24h**, 25 per pass, **each row
in its own exception block** so one bad row can't strand everyone behind it.
`admin_rescue_signup(user, kind)` is the `is_admin()`-gated one-shot and ignores
the cap on purpose. Every send lands in `signup_rescue_log` (RLS on, no policy).

**It is deliberately NOT in `set_platform_mode`'s quiet list.** Silencing signup
rescue during a pause reproduces the Aug 2026 lockout exactly. The pause is
about not soliciting people, not about refusing to answer someone who already
handed us their email address — same call as the two welcome emails and GoTrue
itself.

**The failure class was closed the same day: custom SMTP is now configured
(2026-08-30).** Dashboard → Authentication → Emails → Enable custom SMTP, host
`smtp.resend.com`, port 465, user `resend`, sender `noreply@freddyfixit.ca`,
min interval 10s. GoTrue no longer sends anything itself — confirmation and
password-reset mail now leave over the same DKIM-verified domain, from the same
provider, as every receipt and dispatch we send. A live `/auth/v1/recover`
probe returned **200** afterwards, which now means more than it used to: bad
credentials or a bad host would fail the SMTP connection and return **500**, so
a 200 proves Resend accepted the message. It still does not prove delivery —
only an inbox does that.

**This trades an invisible failure for a correlated one, deliberately.** Auth
mail and transactional mail now share one provider, one domain and one quota,
so a Resend outage or a blown sending limit takes down **both** at once, where
before they failed independently. `auth-rescue` rides Resend too, so it is no
help in that scenario. The trade is worth it because the old independence was
worthless: the second sender was one we did not own, did not monitor, and could
not retry into — an outage there was silent, and silence is what stranded three
accounts in Aug 2026 and one more on 2026-08-30. A shared failure we would
notice within minutes beats a separate one we would learn about by phone.
**Watch the Resend quota as a platform-wide dependency now, not just a
marketing one.**

`auth-rescue` stays as the net underneath: it is what recovers accounts that
were stranded *before* SMTP was fixed, and what catches any future delivery
failure that a 200 hides.

## Newsletter
Sender **tips@freddyfixit.ca** (reply-to hello@). Two audiences: client (home & vehicle tips) and contractor (business tips).

`newsletter_subscribers` (email, audience, first_name, source, `unsub_token`, unsubscribed_at) + `newsletter_content` (audience, seq, subject, preheader, body_md, blog_title, blog_tag, status draft|queued|sent) pre-loaded with a **24-issue bank**. `newsletter_subscribe(...)` RPC (anon+authenticated). pg_cron `newsletter-contractor` (Tue 16:00 UTC) + `newsletter-client` (Thu 16:00 UTC) via `kick_newsletter(audience)`.

`newsletter-send` picks the **lowest-seq queued** issue, renders md → branded HTML, and **auto-publishes a `blog_posts` row** when `blog_title` is set. `{test:true}` previews to hello@ only. 5-day per-audience rate guard (it's anon-callable). `newsletter-ai-draft` is admin-gated and **`ANTHROPIC_API_KEY` IS now set** (confirmed 2026-09-03 — this line used to say it was dormant for want of the key, which was stale). It drafts to status `draft` and never auto-sends, so it still cannot mail anyone by itself.

Subscribe surfaces: footer form, and an un-prechecked CASL opt-in on both onboarding flows.

---

# Contractors

## Onboarding
`ContractorOnboarding.tsx`, **5 steps** (2026-08-19, was 8): basics → what you do (specialties + line of work) → where & when (service area + availability) → credentials → photo & documents. **The only submit path is the final "Complete Registration"** — an earlier "sign up now, finish later" fast-track was removed because it produced accounts with almost nothing, which is why the 8→5 merge dropped SCREENS and not a single question: the metadata object and the `contractors.upsert` are byte-identical to the 8-step version.

**Ordering is load-bearing.** `form.workType` must be answered on step 2 because `wt` drives both the credential copy on step 4 and the per-document `required` flags on step 5. `TOTAL`, the 5-element `STEP_TITLES` array (indexed `[step-1]`) and every `if (step === N)` in `validate()` move together — and the draft-restore clamp `d.step <= TOTAL` is what makes a stale 8-step draft land on step 1 instead of a blank screen.

Borrowed from the client flow: **`ServicePicker`** for specialties (passed **`allowCustom={false}`** — an off-list specialty is in no `service_specialty_map` row, so it would match no request and silently starve that pro of leads; the prop defaults to `true` so ClientOnboarding/NewRequest are unchanged), **`VoiceDictate`** on the references textarea (renders `null` where the Web Speech API is missing, so no feature detection is needed — and the step-4 guide tip deliberately doesn't mention a microphone that might not appear), and **`AddressAutocomplete`** above the zone chips. The address is **never stored**: `zonesFromAddress()` regexes the Calgary quadrant out of the picked string and pre-ticks the chips, which are what `service_area` saves and what all three matchers read. It only ever ADDS zones, so a deliberate pick survives typing an address elsewhere.

Documents are **optional at signup** (added later from the dashboard; admin approval still gates jobs). Phone is optional. Uploads use `accept="image/*,application/pdf"` so iOS transcodes HEIC. Drafts persist to `localStorage['ff_contractor_draft']` (never the password) with a "We saved your progress" banner + Start over. Names prefill from Google metadata or the email local-part, only ever into empty fields.

**⚠️ The signup-killer (2026-07-16).** EVERY signup silently failed for ~a month. `handle_new_user` → profiles insert → `assign_referral_code()` → `gen_referral_code()` → unqualified `gen_random_bytes(6)`, but pgcrypto lives in `extensions` — 42883, swallowed by the catch-all, whole transaction rolled back = auth user with no profile. Fixed in `gen_referral_code()` and `admin_resignup_matches()` by `set search_path = public, extensions, pg_temp` + schema-qualifying `extensions.gen_random_bytes/digest`, plus an inner exception guard in `assign_referral_code()` so a referral-code failure can never block signup again. (`ff_hash()` was fixed at the same time and dropped as dead on 2026-08-23.) **This is why the search_path gotcha is in the list.**

**Orphan recovery** (Google one-tap creates an `auth.users` row instantly, before any profile exists): `ensure_profile(p_role)` RPC self-repairs — role from metadata → p_role → 'client', names from metadata or the email local-part. Both dashboards call it on a missing row and re-fetch. `ProtectedRoute` uses `.maybeSingle()` and **passes through** users with no profile. `FinishSignupBanner.tsx` (mounted in App.tsx, checked on route change — **never inside `onAuthStateChange`**) shows a bottom banner with a CTA to the right onboarding. Admin has **finish-signup-nudge** (`{dryRun:true}` previews, `{confirm:"SEND"}` sends).

**Duplicate prevention:** `check_signup_availability(p_email, p_phone)` (anon-callable; phone compared digits-only on the last 10). Backstop trigger `enforce_unique_signup_phone()` **BEFORE INSERT on auth.users** raises `PHONE_TAKEN` (the AFTER-INSERT `handle_new_user` swallows errors, so it can't be the guard). No UNIQUE index — two seed accounts share a number. Also: with email confirmation on, Supabase returns a **fake success** for an already-registered email (`user.identities.length === 0`) rather than an error — check for it.

`GuideBubble.tsx` (the Freddy speech-bubble reframe + "Why we ask:" line) is still used on `NewRequest`, but was **removed from both onboarding flows on 2026-08-24** in favour of `OnboardingProgress.tsx` — a numbered step bar — plus a single short `STEP_TITLES[step-1]` line. The step count is now carried visually by the bar, so nothing textual repeats it.

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

# Clients

- **`ClientOnboarding.tsx`** (3 steps: need → details → account). Google one-tap is on the **final account step** (2026-08-24 — moved from the top of step 1, so it now sits alongside the email/password fields it's an alternative to, rather than above a job description it has nothing to do with). Phone optional, auto-formatted; address via `AddressAutocomplete.tsx` (Photon / photon.komoot.io, OpenStreetMap, **no API key**, Calgary-biased, 280ms debounce, silently degrades to plain typing). Validation scrolls to the first error (`co-err-*` ids). `NewRequest.tsx` is the short returning-client form ("same address as last time?"), reached because ClientOnboarding branches logged-in → NewRequest. `?pro=` pre-targets a favourite.
- **Base prices** — `service_pricing` table (label PK → base_price / typical_low / typical_high / unit) for all 23 services, public via `get_service_pricing()`; `src/lib/servicePricing.ts` (`useServicePricing()` cached once/session, `rangeText`/`fromText`/`money`). Clients see "from $X" in the picker and a typical range on the lead form; contractors get a base-price box with a one-tap "Use base price" plus optional min–max inputs (`price_low`/`price_high`/`used_base_price` on `bids` and `jobs`).
- **Client dashboard** sidebar: My Requests / Messages / My Pros / Recurring Plans / History / Profile / Settings. **Needs your attention** ordered money-first (contract → balance → price change → schedule → walkthrough → confirm → bids), each row carrying `ownsScroll` and an anchor (`ffc-price`, `ffc-sched`, `ffc-hike`, `ffc-walkthrough`, `ffc-confirm`, `ffc-bids`).
- **My Pros** — `favorites` + `toggle_favorite(uuid)`, `list_my_pros()` (worked-with OR favorited; jobs_together, last_service, rating). Rehire routes to `/client-onboarding`. The same list also renders as a **"Book a pro you've used before"** strip on the Requests (home) tab — first 6, horizontally scrolling, one "Book again" per card, with an "All N pros →" link once there are more than 3. It sits **below Needs-your-attention on purpose** so money-gating rows still come first, and it renders above the empty state too, since a returning client with no open request is exactly who should see it. Rebooking is the cheapest job on the platform to win and it was one tab deep.
- **Self-serve deletion** — `delete-account` edge fn + `DeleteAccount` component (inside SettingsPanel), with re-signup flagging for poorly-rated contractors.
- **Google review popup** — `src/lib/reviewPrompt.ts` fires `ff:google-review`; `GoogleReviewModal.tsx` listens. Three moments only (account created, job posted, job done), localStorage-deduped with a ~21-day cooldown and a "Don't ask again" opt-out. URL `https://g.page/r/CYvpOy2pJh_YEAI/review`.
- **ChatWidget** — AI assistant; the floating bubble hides on dashboards but the panel stays mountable so `ff:open-chat` still works.

---

# Admin

`AdminDashboard.tsx`, left sidebar: Health / Requests / Jobs / Picks / Accounts / Disputes / Prepaid / Flagged chat / Leads. `loadAll` checks each `Promise.all` result's `.error` and shows a banner naming the failed areas — a swallowed error used to render a silent false-empty tab. Newer tabs load in their **own** try/catch so an older DB still renders everything else.

- **Requests** — bids render read-only at **every** status (they used to vanish the moment a client picked). The accepted bid gets a green `✓ PICKED` chip; declined bids dim. **The client picks bids** — the admin assign dropdown and accept-bid buttons were removed. Pending requests carry a **"Re-send to contractors"** button (`admin_refire_request`) plus a "Re-sent N times" line; it's hidden on non-pending requests because dispatch-job refuses those and it would be a dead control.
- **Jobs** — service title, `{client} → {contractor}`, location, job code, **Read chat**, **Delete job** (`admin_delete_job`).
- **Picks** — `admin_list_picks(p_limit)`. Built on **`jobs`, not `bids`**, because a job row exists for every match (bid, rehire, or admin assign) and `jobs.created_at` IS the pick moment (`bids` has no `updated_at`). Derives `how` = `client_pick` / `rehire` / `admin_assign`, plus the winning amount and `bid_count`.
- **Accounts** — `admin_list_accounts()` lists **every `auth.users` row** (so orphans show), joined to profiles + contractors: contact, role, join/last-sign-in, request/job counts, orphaned flag, and full vetting (company, specialties, area, licence/insurance/WCB, references, experience, availability, rating/jobs/earned, pricing, `stripe_payouts_enabled`, Google reviews, AI verdict). Plus **Documents** (signed-URL buttons for the private `contractor-docs` bucket via the `contractor_docs_admin_select` policy) and **Photos** thumbnails. Approve/Deactivate (`admin_set_contractor_status`), payout diagnosis, **Delete account** (`admin-delete-account` — full wipe incl. storage under `${uid}/` across 6 buckets, then `auth.admin.deleteUser`; blocks self-delete). Orphan bar offers **finish-signup-nudge**.
- **Email contractors** — `AdminMessageModal.tsx` + **admin-message** edge fn. Recipient emails are looked up **server-side**, never trusted from the client. Every send logged to `admin_messages` (shared `batch_id`); history via `admin_list_messages`.
- `admin_rank_contractors`, `admin_list_chat_flags`, `admin_list_picks`, `admin_list_accounts`, `admin_get_contractor_detail`, `admin_delete_job`, `admin_set_contractor_status`, `admin_resignup_matches` are all `is_admin()`-gated.

---

# Content, SEO & growth

- **`src/lib/seo.ts` owns `upsertMeta` — there is exactly ONE copy (2026-08-23).** It had been pasted byte-identical into all six public SEO routes (About, ServicesIndex, ServiceLanding, AreaLanding, ForContractors, BlogPost) across ~49 call sites. These routes are client-rendered, so `index.html` has already shipped a site-wide description and canonical; the function **mutates the existing head element in place** rather than appending, because two `<meta name="description">` tags leave the crawler to pick. That is also why drift here is the dangerous kind — a wrong canonical throws no error and shows nothing in the browser, so you'd learn about it from a ranking drop weeks later. Each page still restores `document.title` on unmount; the meta tags are deliberately **not** restored, since the next route overwrites all of them on mount and a cleanup racing the next page's effect would blank what it had just set. The four JSON-LD injections were left per-page on purpose — each has a different `data-*-ld` key and a genuinely different payload, so folding them together would buy nothing.
- **Service landing pages** — `/services` index + `/services/:slug` (`ServicesIndex.tsx` / `ServiceLanding.tsx`), 19 slugs targeting Calgary trade searches, each with per-page meta + Service/FAQPage JSON-LD, "what we cover" / "how it works" / FAQ / related services, CTA → `/client-onboarding?service=<name>` (name must match the Home SERVICES label). Site-wide LocalBusiness + WebSite JSON-LD in `index.html`. Sitemap + footer link every page. Also `AreaLanding` for geographic pages.
- **Homepage** — single big orange "Request Free Estimates →" CTA with a small "Join Freddy's Team" pill. "Built On Trust" surfaces real reviews via `get_homepage_reviews(p_limit)` (reviewer first name + contractor company; **no fabricated testimonials** — graceful empty state) and vetted-pro cards via `get_top_pros(p_limit)` (initials avatars, rating or "Vetted & approved", job count, first 3 specialties; no contact info). "Used Freddy before? Log in to rebook your pro →".
- **Blog** — hardcoded posts in `Blog.tsx` + `BlogPost.tsx` (Pricing / Vehicle / Contractor tags) **plus** DB posts via `src/lib/blogDb.tsx` (`getDbPosts`/`getDbPost`, `MdBody` mirroring the newsletter md rules). Unknown slugs fall back to a DB fetch. Price content is worded as "ballpark ranges, not firm estimates".
- **`/for-contractors`** recruitment landing page (no fees / no lead-buying, secure payout, local jobs).
- **GA4** — `src/lib/analytics.ts`, `initAnalytics()` in main.tsx injects gtag itself (**do NOT add a script tag to index.html**), `trackPageView()` on route change, conversions `generate_lead` (GetQuote), `post_job` + `sign_up` (ClientOnboarding), `sign_up` (ContractorOnboarding). IP anonymized, `send_page_view:false`.
- **PostHog ships alongside GA4, and it is already a heatmap / session-replay tool.** Same file: `POSTHOG_KEY`, host `us.i.posthog.com`, `person_profiles:"identified_only"`, `session_recording:{ maskAllInputs:true }`. `trackEvent()` fires to gtag **and** mirrors to `posthog.capture`. Before adding any product-analytics, heatmap or replay vendor, look here first — one is installed and recording.
- **Both are gated behind opt-in cookie consent.** `initAnalytics()` returns early unless `consentGranted()`, and `trackEvent()` / `trackPageView()` re-check it, so **no consent = no script, no cookie, no hit**. That's the right CASL/PIPA posture, but it means a low GA4 number can mean low *consent* rather than low traffic. Read the consent rate before concluding the site is quiet or that analytics is broken.
- **Homepage before/after images are responsive (2026-08-18).** Each pair ships twice in `public/before-after/`: `<name>.webp` at 1100px and `<name>-sm.webp` at 688px, wired through `baSrcSet()` + `BA_SIZES` in `Home.tsx`. The slider box caps at 900px so nothing ever needs more than 1100 (1466KB → 676KB desktop, 294KB mobile). **Regenerating one file means regenerating both widths** — otherwise the srcset keeps serving a stale variant to whichever half of visitors matches the other breakpoint.
- **Lead scouts: `reddit-lead-scout` is DORMANT, `meta-lead-scout` is LIVE (2026-09-03). Neither ever auto-posts.** `reddit-lead-scout` is blocked by Reddit's Responsible Builder Policy (OAuth pre-wired if `REDDIT_CLIENT_ID`/`SECRET` ever land); interim is F5Bot + a manual reply cheatsheet.

## `meta-lead-scout` — armed 2026-09-03

**own-Page-only** (Meta ToS forbids scanning others' posts or groups) — reads FB Page comments (`{page}/feed`) and DMs (`{page}/conversations`) plus IG comments when `META_IG_ID` is set, classifies each against `CLIENT_ASK`/`CONTRACTOR_ASK`, dedupes into `social_leads` (`MAX_LEADS_PER_RUN = 12`, `MAX_AGE_HOURS = 48`) and emails an approval digest to hello@. It **drafts** replies and never sends one. Secrets `META_PAGE_TOKEN` + `META_PAGE_ID` are set; App **Freddy Lead Scout** `1580205976489384` (Development mode, which is sufficient for a Page you administer), Page **FreddyFixit** `1339030759289723`, six scopes: `pages_show_list`, `pages_messaging`, `pages_read_engagement`, `pages_read_user_content`, `instagram_basic`, `instagram_manage_comments`.

**pg_cron `meta-lead-scout` (jobid 16, `43 */2 * * *`) → `kick_meta_lead_scout()`.** Minute 43 avoids all twelve pre-existing jobs. The kicker follows the `kick_reconcile_payouts` pattern exactly: `SECURITY DEFINER`, `search_path = public, extensions, pg_temp`, an inner `begin…exception when others then raise warning`, and `revoke all from public, anon, authenticated` + `grant execute to postgres, service_role`.

**⚠️ v6 was an open emitter and it is the same class of bug as `notify-email` v9.** `verify_jwt=false` with **no in-code gate at all** — any unauthenticated POST of `{"test":true}` sent a Resend email from `noreply@freddyfixit.ca`. Since 2026-08-30 GoTrue auth mail rides the same Resend domain, DKIM key and quota, so an open emitter here could burn the quota that carries signup confirmation and password reset — **the Aug 2026 lockout shape reached from the other end**. **v7** added `isAuthorized()`, mounted first in `serve()` before any body parse or scan: an `x-ff-internal` single-use token redeemed through `consume_internal_token` (proving the caller is Postgres) **or** a real admin JWT resolved via `admin.auth.getUser()` → `profiles.role`, else **403**. It fails CLOSED on any error. Verified live 2/2: ungated → `403 {"error":"forbidden"}`; token-gated → 200 with a full scan.

**v7 also clears module-level state at the top of every request.** Deno edge isolates are **reused between invocations**, so `scanStatus` and `lastResend` persisted across runs and a later invocation could report a *previous* run's HTTP codes — diagnosis that lies is worse than no diagnosis.

**v8 added `alertOnGraphFailure()`, because silent failure had no alarm.** If the Page token expires or is revoked, every Graph call 400s and a 2-hourly cron goes on reporting "0 leads" forever with nobody told. Any non-2xx from any Graph endpoint now emails the owner, throttled through `alert_should_send(key, 720)` on a key encoding the **distinct failure**, so a new failure gets through at once. It **fails OPEN** — an unreadable throttle sends anyway. The result surfaces as `alerted` in the JSON response (`none` / `throttled` / `alerted` / `alert-send-failed`), which is also the marker that v8 is live.

**Deliberately NOT in `set_platform_mode`'s quiet list.** It only ever emails hello@ — the owner — so it belongs with `platform-health-check`, armed during a pause, not with the six solicitation emitters that stand down.

**MONEY: touches none of the four payout guards.** It is a lead-gen read path — computes no charge, writes only `social_leads`, cannot affect `funded_amount` or `fully_funded`. `platform_health_check()` 7/7 after apply.

**Standing strategic gap, unresolved.** Every job the platform has won came from the owner **commenting on other people's posts** and Messenger chats **on his personal profile**. That traffic never touches a Page, so an own-Page-only scout structurally cannot reproduce what is working today — `scanned: 0` on a 0-follower Page is that gap made concrete, not a bug. No compliant automation reaches personal-profile activity.
- Offline owner deliverables (Desktop, not in repo): Google-Business-Profile-Guide, Contractor-Recruitment-Kit, Analytics-Setup-Guide, Reddit-Reply-Cheatsheet, Meta-Setup-Guide, Facebook-Groups-Lead-Kit.

## Trade-targeted cold outreach (2026-08-28)

`contractor-outreach` **v14** is the cold-email sender and it already existed — queue-driven off `contractor_outreach`, admin-JWT gated, `confirm:"SEND"` required, CASL mailing address + RFC 8058 one-click unsubscribe, 600ms pacing for Resend's 2/s limit. It only ever reads `status='pending'` and flips rows to `'sent'`, which is what makes it **structurally incapable of mailing the same address twice**. What it could not do was aim.

New columns `trade` / `source` / `city` / `queued_at` / `queued_for` / `unsubscribed`, a unique index on `lower(email)`, and a new status **`'new'` = imported but NOT queued**. That status is the whole safety design: the sender picks up `'pending'` only, so **importing a list can never send anything by itself**. `admin_import_outreach(jsonb)` lands rows at `'new'` and `on conflict do nothing`, so a re-import can never resurrect an address we already mailed or that unsubscribed. `admin_queue_outreach(trade, limit, request)` promotes `'new'` → `'pending'`. Sending is still a separate, confirmed admin act.

Trigger `client_requests_outreach_gap` (AFTER INSERT) queues up to 25 candidates for the job's trade when `trade_reach(service) < outreach_gap_threshold()` (6), and bells every admin. Three rules it encodes:

- **It queues, it never sends.** An automatic per-job blast would put the shared `freddyfixit.ca` DKIM reputation at risk — the same reputation that carries payment receipts, dispatch and GoTrue-adjacent mail, and a DKIM fault has already taken all platform email down once. "Don't send bulk email without asking the owner" still holds.
- **The client's job never leaves the platform.** `queued_for` is an audit pointer; the copy names the *trade* and says requests are coming in, never how many and never whose. Describing a live request to a non-member would leak that client's address and problem to a stranger.
- **It cannot break a job posting.** The whole body is inside an exception block. A recruiting nicety is never worth a client's request — that is the pgcrypto lesson.

A rolled-back probe verified all three paths: gap trade queued 1 and belled the admin, healthy trade queued 0, an unknown label inserted fine (unmapped ⇒ `trade_reach` counts everyone ⇒ above threshold). The probe also caught a real bug before it shipped — `contractor_outreach_status_check` predated `'new'` and would have rejected every import.

**The pipeline has no ammunition until company records are loaded.** Contact details must be supplied or gathered from conspicuously-published business listings; CASL implied consent covers role-relevant B2B recruitment from a published address, not an unlimited list.

---

# Legal & compliance

Company entity **Freddy FixIt Contractors Inc.** Pages: `/user-agreement` (incl. Contractor Terms), `/privacy-policy`, `/homeowner-protection-promise` — linked in the footer and gated behind an acceptance checkbox in every signup flow. Onboarding chrome hides most nav but **keeps the legal links reachable**.

**User Agreement** — §6.3 payment reality (charged at approval, held, released on confirmation; now the 40/60 split), §6.7 fees, §6.8 milestone payments, §6.9 concerns/cancellations/refunds, **§6.10 Alberta cancellation rights**, §6.11 e-signature, §7.5 truthful information, **§8 Prohibited Conduct** (one account, no fake requests, no off-platform payment or poaching, no harassment, no unlawful services, no scraping), Contractor Terms §1.e prepaid-contracting licence, §9.4 staged jobs, §9.5 e-signature liability. "Vetted/verified/approved" is explicitly defined as *our review process was completed*, not a guarantee. Amendments require **14-day email notice** (Jiffy's no-notice clause and arbitration clause were deliberately not copied).

**Alberta prepaid contracting.** Money collected **before work is complete** for services performed away from a fixed storefront can make a job a *prepaid contract* — this applies to the single-charge, deposit and milestone flows alike. Owner decision: keep collecting pre-completion payment and add safeguards. Shipped: a **written contract copy emailed at approval** (`notify-email` `contract_copy`, stamping `jobs.contract_copy_sent_at`, which is the audit timestamp the 10-day clock runs from — **write-once**), a 15-day refund path for every held state, and the disclosure clauses above.

**⚠️ STILL OPEN, not resolvable by wording:** prepaid contracting is a **licensing** obligation. Contractors may each need a Service Alberta licence + ~$10k bond, and **the platform itself may qualify as a prepaid contracting business needing its own licence.** Needs a lawyer + Service Alberta.

**Privacy Policy** — Alberta PIPA + PIPEDA; discloses Stripe, Supabase, Vercel, Resend, Google (sign-in + GA4) and Komoot GmbH (Photon, Germany); GA4 cookies + opt-out; 7-year payment retention; job media kept with transaction records up to 7 years, profile media best-effort 90 days; OIPC Alberta rights.

Consumer-facing wording: say **"held securely"**, never "escrow" — the Stripe held balance is not a trust account.

---

# Infrastructure & ops

**pg_cron jobs:** `daily-reminders` (16:30 UTC → `run_reminders()`), `reconcile-payouts` (every 15 min), `platform-health-check` (15:00 UTC), `visit-reminders` (every 10 min), `release_unconfirmed_visits` (every 15 min), `newsletter-contractor` (Tue 16:00), `newsletter-client` (Thu 16:00), `prune-rate-limits` (04:17 UTC daily → `prune_rate_limit_hits()`), `rescue-stuck-signups` (`37 * * * *`), **`meta-lead-scout` (jobid 16, `43 */2 * * *` → `kick_meta_lead_scout()`, added 2026-09-03)**, plus auto-confirm. **As of 2026-09-03 the site is `open` and all 14 cron jobs are armed.** (This line previously said the site was in `waitlist` with six stood down — that was stale. Read `platform_settings.mode` / `outbound_paused()` rather than trusting a doc.) `set_platform_mode('paused'|'waitlist')` stands six of them down and `set_platform_mode('open')` re-arms them; the real guarantee is `outbound_paused()` **inside** each emitter, not the cron list. DB→edge calls go through `net.http_post`, wrapped in an exception guard (pattern: `kick_reconcile_payouts()`). **New kickers must mint `issue_internal_token('edge-internal')` and send it as `x-ff-internal`, not carry the anon bearer** — the bearer proves nothing and sits in publicly-readable `pg_proc.prosrc` on a public repo. `notify_email()` and `kick_meta_lead_scout()` follow the token pattern; the older kickers still carry the bearer and are a cleanup backlog, not a design.

`run_reminders()` steps: 0 recurring generation · 1 recurring-due nudges · 2 seasonal nudges (one per engaged client per season, `reminder_log` dedupe) · 3 day-before visit confirm · 4–7 48h stall nudges (bids waiting / approval owed / price change pending / contractor estimate owed) · 8 balance owed after completion (24h → 3d → 7d, then stops).

**Storage buckets:** `contractor-docs` (private; admin SELECT via `contractor_docs_admin_select`), `completion-photos` (private, job-party), `problem-photos` (private, dispute parties), `message-media` (private, job-party), `contracts` (private, job-party), `contractor-photos` + `portfolio-photos` (public objects, **but no longer listable** — see Security model). Every upload is rate-limited by the `ff_upload_rate_guard` trigger, and **objects cannot be deleted in SQL** (`storage.protect_delete()`) — removal needs the Storage API from a service-role edge function.

**Auth deadlock rule: never call a supabase query inside `onAuthStateChange`.** Do it on route change instead.

**Responsive:** fixed-count grids use `repeat(N, minmax(0,1fr))` (`auto-fit` is NOT a drop-in — it silently changes column count); auto-fit grids use `minmax(min(NNNpx,100%), 1fr)`; page padding is `clamp(1rem, 4vw, 1.5rem)`; `main.tsx` injects `img,video,canvas` and `input,select,textarea { max-width:100% }` (**`svg` excluded** — `Ic` icons must not shrink). Verified: no fixed `width`/`minWidth` ≥300px anywhere in `src`.

**`src/lib/jobCode.ts`** — `jobCode(id)` = `FFX-` + first 5 hex of the job UUID, uppercased; `codeMatches()` for tolerant lookup. **No DB column.** Shown on client, contractor and admin cards and in the claim picker.

---

# Security model (2026-08-04 audit)

**`verify_jwt=true` is NOT authentication here.** The anon key is itself a valid project-signed JWT and ships publicly in the JS bundle, so it satisfies the platform gate. Any edge function that must know *who* is calling has to check in code: pull the bearer, `admin.auth.getUser(jwt)`, and resolve role/identity from `profiles` — **never from the request body.** `support-request` v2 does exactly this; trusting the body previously let anyone send mail that looked like it came from another user.

**The internal-token primitive.** DB→edge calls (triggers, pg_cron) carried the anon bearer, which proves nothing. Now `public.internal_tokens` + `issue_internal_token(p_purpose)` / `consume_internal_token(p_token, p_purpose)`: the DB mints a single-use 10-minute token and sends it as the **`x-ff-internal`** header; the edge function redeems it through its service-role client. Redeeming is what proves the caller is Postgres. Universal purpose string is **`'edge-internal'`**. Minting DB callers: `accept_bid`, `place_bid`, `notify_new_message`, `kick_newsletter`. Gated functions: `notify-accepted` v12, `notify-message` v2, `newsletter-send` v2 (which also accepts a real admin JWT). A service-role key is deliberately **never** embedded in a function body — `pg_proc.prosrc` is publicly readable.

**Revoking from `anon` alone is a no-op.** The default function grant is to `PUBLIC` (`proacl` = `=X/postgres`), so `revoke … from public` is required too. Internal/cron functions (`notify_user`, `_notify`, the four `kick_*`, `run_reminders`, `run_platform_health_check`, `escalate_stale_unbid_requests`, `auto_confirm_stale_jobs`, `auto_approve_stale_milestones`, `generate_recurring_occurrences`, both token functions) are now `{postgres,service_role}` only.

**`contractors` is own-row + RPC only.** The old "Active contractors visible to clients" policy exposed all 38 columns — auth uids, `total_earned`, `stripe_account_id`, licence/insurance, `work_references`, `doc_urls` — to anon. It's dropped, and `anon` has no grants on the table. Every read of someone else's row goes through a curating `SECURITY DEFINER` RPC (`get_contractor_profile`, `get_top_pros`, `get_contractor_directory`, `list_my_pros`, `admin_get_contractor_detail`). `TRUNCATE` (not subject to RLS) revoked from `anon`/`authenticated` on every public table.

**Every `public` function now has a pinned `search_path`** (`public, extensions, pg_temp` — `extensions` included because pgcrypto lives there).

**The contract gate and `remove_client_request` were locked down on 2026-08-31.** `contract_signed`, `contract_required`, `contract_ready` and `remove_client_request` were executable by `PUBLIC`, and the first two had no pinned `search_path`. Both were fixed with **`alter function … set search_path = …`** plus `revoke … from public, anon` — `alter function` on purpose, because a DROP/CREATE would rewrite a live definition the fail-closed payment gate depends on, and the ACL is the whole point here anyway.

**Revoking on a fail-CLOSED gate is the dangerous kind of tightening**, so it required *proving* no anon caller exists before applying it: all five edge call sites use the service-role `admin` client (unaffected by these grants), and both browser call sites sit behind `ProtectedRoute` with a real user JWT. Get that wrong and every job becomes unpayable with no error anywhere — exactly the `fa5e2b5` outage, reached by a different route. Post-apply probe confirmed `authenticated` still executes all four and `anon` is denied. **And remember `revoke … from public` as well as from `anon`** — the default grant is PUBLIC, so revoking anon alone is a no-op.

**Frontend honesty rule:** a failed read is not an empty result. `contractsFailed` suppresses the "needs a signed agreement" nudge, `expensesFailed` replaces the profit rollup with a notice, `ContractPanel` has an error+retry branch, and `FreddyRewind` says it couldn't load rather than reporting a $0 year. Same principle behind `.maybeSingle()` everywhere.

**`src/lib/contractCopy.ts`** — `sendContractCopy(jobId)` retries the Alberta written-copy email 3× (the edge update is write-once, so retrying can't double-send) and returns false only if all attempts fail; `CONTRACT_COPY_FAILED` is the copy to show then.

**Leaked-password protection is handled in the browser, because the Supabase setting is Pro-plan only** and this project is on the free plan — see *Passwords* below. The Dashboard toggle is not an available option here, so don't file it as an owner action again.

**The source-less edge functions were recovered on 2026-08-23** and now live in `supabase/functions/`. There were **five**, not six. (**Correction, 2026-08-24:** `send-bid-email` is still deployed — v11, ACTIVE — and it has now been read. It is **not** an open relay: v11 gates on the single-use `x-ff-internal` token that `place_bid` mints, exactly like `notify-message` v2, and `verify_jwt` stays false on purpose because the caller is Postgres and has no user JWT. v10 *was* the hole this section describes — arbitrary `to_email`, no gate at all — and v11 closed it while also fixing a copy bug that rendered a walkthrough bid as the literal words "a quote". Its one-tap `/pick/<pick_token>` link is the reason four clients with estimates and no picks became a solvable problem: the token IS the authorization, so there is no login wall between the email and the choice.) Reading them confirmed what the audit could only suspect:

- **`send-reminder` (was v1, `verify_jwt=false`) was an open mail relay on our sending domain.** It took `subject`, `title`, `body` and an arbitrary `email` **straight from the request body** and sent that HTML as `noreply@freddyfixit.ca`. **Closed 2026-08-23 by removing its last caller, not by gating it** — see the duplicate-email rule. `notify_user`'s post to it was a second, thinner copy of an email the notifications webhook already sent, so deleting the caller fixed three things at once: it closed the relay by construction (a gate is a thing that can be got wrong later; an uncalled function is not), it stopped thirteen notification types double-sending, and it closed a bypass of `outbound_paused()`. Now a **410 tombstone, `verify_jwt=true`**.
- **`send-welcome` (was v10, `verify_jwt=false`) was the same hole plus Twilio.** Arbitrary `email` *and* arbitrary `phone` from the body, sending paid SMS. Superseded by `contractor-welcome` v2, zero callers. Now a **410 tombstone, `verify_jwt=true`**.
- **`remind-contractor` (was v8, `verify_jwt=false`)** emailed a contractor a "upload your documents" nudge from a body-supplied `contractor_id`. Zero callers; copy was stale ("Step 6 of your profile" — onboarding is 5 steps). Now a **410 tombstone, `verify_jwt=true`**.
- **`resend-domains` (v2)** was already a 410 tombstone.

**All four are tombstones, not deletions — the Supabase MCP has no delete-function tool.** Each is a bare `serve()` returning `410 {"status":"gone"}`: no `Deno.env.get`, no Resend, no Twilio, no request body read, and `verify_jwt=true`. That closes the hole immediately and is the state the repo records. Removing them entirely is a Dashboard action (Edge Functions → select → Delete) and is cosmetic at this point. **Verified zero callers** across `pg_proc.prosrc` in `public`/`extensions`/`cron`, every non-internal trigger, `cron.job`, and the repo.

- **`analyze-repair` (v3, `verify_jwt=false`) is NOT junk** — it's the AI Repair Scanner, a real public lead-gen tool with CORS locked to our origins, per-IP rate limiting, prompt-injection screening, and server-side filtering of its recommendations to the 23 known service labels. **It is the only caller of `scan_rate_check`, and it calls it over REST** — which is exactly why a repo grep made that RPC look dead. It also writes to a **`repair_scans`** table. Don't delete either without first checking for a frontend entry point.

Their DKIM reputation is shared with every transactional email we send, and a DKIM fault has already taken all platform email down once.

The full ranked findings live in `SECURITY-AUDIT-PRIVATE.md`, which is **gitignored** — the repo is public and must never carry a map of holes.

---

## A public bucket is not a listable bucket (2026-09-01)

`contractor-photos` and `portfolio-photos` are public, and each carried a
blanket `for select to public using (bucket_id = '...')` policy. **That policy
was never what made the images display.** A public bucket serves
`/storage/v1/object/public/<bucket>/<path>` **without consulting RLS at all**;
RLS on `storage.objects` governs only the authenticated API surface — list,
signed URLs, move, upload. So the blanket policy bought nothing except
**enumeration**.

What that leaked is the point. **A folder name in either bucket IS the
contractor's auth uid** (`contractors.id` is the auth uid), so anyone could
list every contractor's uid, their filenames and their counts — undoing part of
what the 2026-08-04 audit closed when it took `public.contractors` away from
anon. It also exposed the avatars and portfolios of **pending and deactivated**
contractors, which `get_contractor_directory`, `get_top_pros` and
`get_contractor_profile` all deliberately hide.

Both blanket policies are replaced by owner-or-admin reads, and the three
`contractor-photos` write policies were re-scoped `{public}` → `{authenticated}`
to match the `portfolio-photos` pair. **The write re-scope changes no
behaviour** — the USING clause already required a non-null `auth.uid()` — it
stops the ACL depending on the predicate being correct, the same lesson as
`set_job_autopay`'s null-unsafe owner check.

**Tightening a read policy is the dangerous direction**, so it was proven safe
*before* applying: nothing in `src/` lists either bucket (every frontend use is
`getPublicUrl` / `upload` / `remove`), and the only `.list()` calls anywhere are
in `delete-account` and `admin-delete-account`, both on **service-role** clients
that bypass RLS. Proven *after* applying by a rolled-back probe **9/9** (anon
lists 0; an owner sees only their own folder; a second contractor sees 0 of the
first's; admin still sees all; both buckets still `public=true`; all four
`contractor-photos` policies now `{authenticated}`; both blanket policies gone)
**plus a live `net.http_get` on a real avatar with no auth header returning
`200 image/png`** — the public URL was verified still serving, not assumed.

## `notify-email` was an open emitter (2026-09-01)

The open-queue note said only that `contract_copy` was callable by anyone with
a job_id, blunted by its write-once stamp. Reading the source showed it was
worse: the function took `{event, job_id}` **straight from the body with no gate
at all**, so the other three events — `schedule_proposed`,
`job_completed_client`, `job_confirmed_contractor` — could be fired an
**unlimited** number of times at a job's client and contractor from
`noreply@freddyfixit.ca`. Since 2026-08-30 GoTrue auth mail rides the same
Resend domain, DKIM key and quota, so abusing it could silence signup
confirmation and password reset — **the exact Aug 2026 lockout shape**, reached
from the other end.

And `contract_copy` was not merely spam-blunted. Burning
`contract_copy_sent_at` early **starts the Alberta 10-day cancellation clock at
a moment of the caller's choosing** *and* makes the real send at approval time
skip — so the client never receives a document the law requires them to have.
The write-once guard was protecting the stamp, not the client.

**Two halves, and the order between them is load-bearing.**

`public.notify_email()` now mints `issue_internal_token('edge-internal')` and
sends it as `x-ff-internal`, instead of the **hardcoded anon JWT bearer** it
used to carry — which proved nothing and sat in publicly-readable
`pg_proc.prosrc` on a public repo. **This migration goes FIRST**: an
`x-ff-internal` header sent to a still-ungated function is harmless, whereas
deploying the gate first would break the `job_confirmed_contractor` email in the
window between the two steps. The mint stays **inside** the function's existing
catch-all, because `confirm_job_completion` — **payout guard 1** — calls it, and
a notification is never worth a payout.

`notify-email` **v9** then gates in code, accepting exactly two callers:
Postgres proving itself with the single-use token redeemed through
`consume_internal_token`, or a real user JWT belonging to a **party to that
job** (client or contractor) or an admin. `verify_jwt` stays false and buys
nothing, as always.

**The caller is resolved BEFORE the job row is read**, so an unauthenticated
caller cannot use 404-vs-403 to test whether a job uuid exists. Identity comes
from the JWT and the job row, **never from the request body**. It fails CLOSED —
any error resolving either credential is a refusal, never a send.

**No frontend change was needed.** `src/lib/contractCopy.ts` calls
`supabase.functions.invoke`, which automatically attaches the signed-in user's
JWT, and both call sites (`MilestonePanel`, `ClientDashboard`) sit behind
`ProtectedRoute` as that job's client — so the party check passes.

**MONEY: touches none of the four payout guards.** Verified live **4/4**: no
auth → `403 {"error":"forbidden"}`; a valid, publicly-shipped **anon bearer** →
403 (the realistic attacker credential); a fresh internal token → `404 {"error":
"Job not found"}` on a bogus uuid, which proves the gate passed **without
sending any email**; the same token replayed → 403, so single-use holds.
`platform_health_check()` 7/7 after.

---

# Account security (2026-08-24/25 audit)

Three things landed together and they lean on each other: a password can't be a
known-breached one, an admin action needs a second factor, and a stolen session
can't be used as a firehose. None of them is a Supabase feature — this project
is on the **free plan**, so every Pro-only control had to be rebuilt in the open.

## Passwords — `src/lib/passwordStrength.ts` + `src/components/PasswordField.tsx`

**The password never leaves the browser.** `checkPwned()` uses Have I Been
Pwned's k-anonymity range API: SHA-1 the password locally, send only the **first
five hex characters** of the hash, match the remaining 35 against the list HIBP
returns. HIBP learns a 5-character prefix shared by roughly 800 other hashes and
nothing else. **Never replace this with an API that takes the password**, or the
plaintext — that is the whole reason the substitute is acceptable at all.

Scoring **weights length far above character variety**, per NIST SP 800-63B. A
meter that rates `P@ssw0rd!` above `correct horse battery staple` teaches
exactly the wrong lesson: the first is in every crack dictionary published since
2009 and the second is not. Symbol variety earns at most one point, and only
once the password is already long. The short built-in `COMMON` list exists only
so the meter reacts *instantly*, before the network check answers — HIBP covers
the long tail far better than any list we could ship.

`PasswordField` is **the one password input on the platform**; all four
password-taking pages (Login, both onboardings, UpdatePassword) go through it so
the reveal toggle, meter and breach check can't drift. Two modes: `meter` off on
Login (scoring a password somebody already has is noise and they can't act on
it), `meter` on wherever a password is being *chosen*. **The eye button is
`type="button"`** — Login wraps its fields in a real `<form onSubmit>`, and a
bare `<button>` in a form defaults to `type="submit"`, so without it clicking the
eye attempts a sign-in with a half-typed password.

## Two-step sign-in — email OTP on Resend, not GoTrue

Built on **our** mailer on purpose. GoTrue's mailer is the path that broke
silently in Aug 2026 and locked three people out with no error visible to
anyone; putting a second factor on it would mean a mailer outage locks the owner
out of his own admin dashboard.

Tables `user_mfa` + `mfa_challenges`. RPCs `mfa_status`, `mfa_request_code`,
`mfa_verify`, `mfa_disable`, `mfa_use_recovery`, `admin_clear_mfa` (break-glass),
and `mfa_ok()`. Edge `mfa-code` delivers via Resend, gated on `x-ff-internal`.
UI: `src/components/TwoStepPanel.tsx` (Settings) + the Login gate; the
reason→English map has **exactly one copy**, in `src/lib/mfa.ts`.

Details that are load-bearing:

- **`mfa_ok()` returns TRUE for anyone not enrolled.** It answers "is a code
  owed?", not "is this user protected?" — so adding `mfa_ok()` to a guard can
  never lock out an account that never opted in. Enrolled users get a **12-hour**
  verified window.
- **`admin_guard()` = admin role AND `mfa_ok()`**, and it raises in **plain
  English** (`Verify your sign-in code first, then try again.`) because it
  surfaces in the admin dashboard, where "permission denied" would send the
  owner hunting for a role problem that doesn't exist.
- **Requesting a code is rate-limited to 5/hour per user** — it is the only
  thing between a stolen session and using our Resend domain as a mail cannon.
- **A send failure does not raise.** The code is already stored, so another
  request recovers; raising on an auth path is the Aug 2026 shape again.
- Codes are 6 digits from `extensions.gen_random_bytes` (pinned `search_path`,
  per the pgcrypto incident), hashed with `mfa_hash(code, user)` — never stored
  plain — expire in **10 minutes**, allow **5 attempts**, and a new request
  **supersedes** any outstanding code for that purpose so an older email can't
  be used afterwards. Enrolling mints **10 single-use recovery codes**, returned
  once and only as hashes thereafter.

## Rate limiting — one primitive, several users

`public.rate_limit_hits(bucket, key, window_start, count)` with
**`rl_hit_key(bucket, key, limit, window_secs)`** — a single upsert that rolls
its own window. `rl_hit(bucket, …)` is the IP-keyed convenience wrapper. Cron
`prune-rate-limits` (04:17 UTC) runs `prune_rate_limit_hits()`.

**`rl_hit_key` returns TRUE when it cannot identify the caller** (null/blank
key). A rate limiter that fails closed on an unidentifiable caller blocks
service-role and internal writers, which is a far worse outcome than letting one
anonymous request through.

Current users: signup availability checks, `mfa_request_code` (its own inline
count), and storage uploads.

## Upload rate limit at the storage layer

Trigger **`ff_upload_rate_guard`** BEFORE INSERT on `storage.objects` →
`storage_upload_rate_guard()`: **60 uploads per hour per authenticated user**,
raising `54000` with a plain-English message. It sits at the *storage* layer
rather than in each upload call site because there are a dozen call sites and a
missed one is invisible.

**`auth.uid()` null means service_role or an internal writer, and is let
through** — the same reasoning as `rl_hit_key`. It also means the guard is not a
defence against a leaked service-role key; nothing at this layer could be.

## `storage.protect_delete()` — you cannot delete objects in SQL

`delete from storage.objects` raises `42501: Direct deletion from storage tables
is not allowed. Use the Storage API instead.` This is Supabase's guard and it is
**correct** — deleting the index row in SQL leaves the S3 blob orphaned, paid
for, and invisible. Do not try to disable it.

The consequence: **any admin cleanup that removes a file needs an edge function
with a service-role client**, calling `storage.from(bucket).remove([...])`.
`admin-delete-portfolio-item` (v1, `verify_jwt=true`) is the first of these — it
deletes the **storage object first and the `portfolio_items` row second**,
deliberately. A row pointing at a real file is recoverable and retryable; a
deleted row pointing at an orphaned file is exactly the state the DB guard
exists to prevent. It authenticates two ways (an admin JWT resolved through
`auth.getUser()` → `profiles.role`, or an `x-ff-internal` token), caps at
`MAX_ITEMS = 25`, and reports per-item results plus `not_found`.

**It also closed a real moderation gap**: before it existed, the owner's only
tool for one bad portfolio photo was deleting the contractor's entire account.

Watch the result aggregation — **`[].every(…)` is `true`**, so `results.every(r
=> r.ok)` alone would report success for a call that matched nothing. The check
is `results.length > 0 && results.every(…) && missing.length === 0`.

## Backfill compression — `compress-images`

Edge function that re-encodes oversized objects already in storage, fed by
`admin_oversized_objects(bucket, floor, after, limit)`. Two portfolio photos
were **too large to re-encode server-side at all** and were removed instead
(2026-08-25), with the contractor emailed to re-upload through the site, where
`compressImage` handles it in the browser. Storage went 54 MB → 47 MB; largest
remaining portfolio photo is 861 KB.

## RLS + ACL hygiene pass

Every policy re-scoped to `authenticated` with `auth.uid()` wrapped as `(select
auth.uid())` for InitPlan hoisting; anon read closed on `reviews`; trigger
function ACLs locked to `{postgres, service_role}`; full `config.toml` written
for every edge function. **Remember `revoke … from public` as well as from
`anon`** — the default grant is to PUBLIC, so revoking from `anon` alone is a
no-op.

---

# Open / queued

- **Owner action, cosmetic: remove the four tombstoned edge functions** (`send-reminder`, `send-welcome`, `remind-contractor`, `resend-domains`) in Supabase Dashboard → Edge Functions → Delete. They already send nothing and hold no secrets; the MCP just has no delete tool.
- **Prepaid-contracting licensing** (contractor licence + bond; whether the platform needs its own) — lawyer + Service Alberta. Blocking-risk item.
- **The dispute branch is still production-untested** — the held→release path ran live on 2026-08-30, but no job has ever reached `disputed`, so `resolve-dispute` has never executed against real money.
- **The ghost client is now covered end to end (2026-08-31)** — card-on-file collects the balance automatically, `run_reminders()` step 8 nudges when it can't (24h/3d/7d), and `escalate_unpaid_balances()` hands the job to the owner at 10 days. **Card-on-file has never charged a real card**, only an empty candidate set; treat it as unproven until it has.
- Seed contractors Slone (`a01c49f7-0ba6-4e0a-bc81-aba53baebcb7`) and Justin (`44748517-72d6-440a-ab06-b13e2660cc80`) still have NULL `company_name` + vetting answers — owner to provide.
- `review-contractor` sometimes records `review_status='rejected'` with an empty `review_result={}`.
- **Decide the social bot's fate — finish it or delete it whole.** `social-bot-brain` and `social-bot-harness` are deployed and, by design, can only write a PROPOSAL into `social_actions` and wait for a human. `admin_list_social_actions` / `admin_review_social_action` are that human-approval half — and **no UI was ever built for them**, so they read as dead code. They were deliberately spared in the 2026-08-23 cleanup: cherry-picking the approval half out of a human-in-the-loop safety design is the worst of both worlds, because switching the bot on would then pile up proposals with no way to review them. All of `social_actions` / `social_conversations` / `social_messages` / `social_leads` are at **0 rows** — the bot has never run. Either build the admin tab or drop the two RPCs, the two edge functions and the four tables together.
- **`insurance_on_file` must gain an expiry test** once `insurance_expiry_date` is a real parsed date — showing "insurance on file" for a lapsed policy is worse than showing nothing, because the client relies on it.
- **Two-step sign-in is opt-in and nobody is enrolled yet.** `admin_guard()` therefore behaves exactly like the old `is_admin()` check until the owner enrols. Enrolling is the point; until then the second factor is inert.
- Keep this file + `src/CLAUDE.md` + `supabase/CLAUDE.md` current as features land.

# Privacy / safety
- Repo is PUBLIC → never commit secrets (service-role key, Stripe keys, Resend key) or user PII (real contractor/client emails, phones, names). Reference seed rows by UUID; look up details in the DB when needed.
- Business contacts only: admin `hello@freddyfixit.ca`, from `noreply@freddyfixit.ca`, newsletter `tips@freddyfixit.ca`.
