# Freddy Fix It — CLAUDE.md

Calgary home-services marketplace. Client posts a request → contractors bid (or admin assigns) → client picks → job lifecycle → payment → review.
Live: https://freddyfixit.ca (+ www), https://freddy-fixit.vercel.app · Supabase project ref `kvypmjxbbaaknvddwwai`

The owner is **non-technical** and deploys by pasting terminal commands. Optimize every answer for that:
ship one runnable thing, keep explanations short, never assume CLI fluency.

> **This file is the always-loaded core: hard rules only.** The reasoning, the dated
> incident write-ups and the per-area detail live in `docs/` and are read **on demand**.
> They were split out of this file on 2026-10-29 because a 233KB auto-loaded CLAUDE.md
> consumed ~29% of the context window every turn and made the two dashboards
> mathematically unworkable. **Nothing was deleted**: the split was done by moving
> contiguous line ranges, and the re-concatenation was verified byte-identical to the
> pre-split file before anything else was touched. The `docs/` files have been edited
> since, so don't expect that diff to come back clean now — the guarantee was that the
> *split* lost nothing, not that the content is frozen.
>
> **Before changing anything in an area, read its `docs/` file.** The rules below tell
> you *what* must hold; the docs tell you *why*, and the why is where the outages are
> recorded. A rule you don't understand the reason for is a rule you will optimize away.

## Doc index — read the one for the area you're touching

| File | What's in it |
|---|---|
| `docs/overview-and-shipping.md` | Stack detail, how work ships, full installer rules, build/validate |
| `docs/brand-and-motion.md` | Fonts (`--ff-font-display`; the display-face/Bebas surface split), colour tokens, `.ff-on-dark`, easing scale, band rhythm, nav paint-on-scroll, light-mode peek |
| `docs/gotchas.md` | The full hard-won list: Money, Postgres, Frontend, Authoring |
| `docs/money.md` | Fee model, 40/60 deposit split, milestone escrow, prepay pool, price changes, stuck-state audit |
| `docs/money-incidents.md` | Card-on-file autopay (2026-08-31); the first live payout and the two-leg transfer fix (2026-08-30) |
| `docs/money-disputes-health.md` | Disputes/claims, the null-unsafe-guard family of 20, receipts/reconciliation, payout onboarding, referrals, health check |
| `docs/job-lifecycle.md` | Bidding, matching (`service_specialty_map`, `trade_reach`), scheduling, slot release, mandatory photos, on-job tools, recurring jobs |
| `docs/contracts.md` | In-house e-signature, `contract_ready`, the fail-closed payment gate |
| `docs/chat.md` | Chat guard, scheduling from chat, inbox/unread, bid-stage chat, media, image safety scanning, photo nudge |
| `docs/notifications-and-email.md` | Pausing outbound email, the duplicate-email rule, routing, every edge fn that sends, `auth-rescue`, newsletter |
| `docs/contractors.md` | Onboarding, profile completion, verification markers, AI doc review, dashboard, guide, public profile |
| `docs/clients.md` | Onboarding, base prices, client dashboard, My Pros, approximate location + address confirmation |
| `docs/admin.md` | Admin dashboard tabs and the `is_admin()`-gated RPCs |
| `docs/growth-and-seo.md` | SEO routes, `seo.ts`, blog, GA4/PostHog + consent gating, lead scouts, cold outreach |
| `docs/legal.md` | User Agreement, Alberta prepaid contracting, Privacy Policy |
| `docs/infra-and-ops.md` | pg_cron inventory, `run_reminders()` steps, storage buckets, responsive rules |
| `docs/security.md` | The 2026-08-04 audit, internal-token primitive, tombstoned functions, public-bucket listing, `notify-email` open emitter |
| `docs/account-security.md` | Passwords/HIBP, two-step sign-in, rate limiting, upload guard, `storage.protect_delete()` |
| `docs/open-queued.md` | Open items, queued work, privacy/safety rules |

Area detail also lives in `src/CLAUDE.md` (frontend) and `supabase/CLAUDE.md` (DB/functions).

**`reference/` is background material, NOT instructions — do not read it unless the task
actually requires it.** It holds forward-looking plans and specs (growth playbook,
automation stack, contractor-verification spec, social-bot spec, marketing brief, the
original milestone-escrow design) plus `reference/reviews/` for weekly site reviews. None of
it is maintained, and a spec in there describes what someone *intended*, not what exists —
where a spec and the code disagree, the code and `docs/` win. These files used to sit in the
repo root, where they turned up in every repo-wide grep and looked authoritative.
`reference/README.md` says which file to open for which task. Weekly reviews are gitignored
and `tools/ship.py` prunes them past 3 weeks automatically (by the date in the filename,
always keeping the newest), so write new ones to `reference/reviews/`, never the root.

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Wouter (routing) + Framer Motion. Build = `vite build` (esbuild, **no typecheck** — type errors don't block deploys). There is **no `.css` file** in `src/`; global styles are injected in `main.tsx`.
- **Backend:** Supabase only (Postgres + Auth + RLS + Storage + Edge Functions). No app server. "API" = PostgREST (`supabase.from(...)`) for reads + `SECURITY DEFINER` RPCs / edge functions for privileged writes.
- **Deploy:** Vercel auto-deploys from GitHub `main`. Email via Resend. DNS via Cloudflare. Payments via Stripe Connect. Analytics GA4 `G-WFMM73FJVL` + PostHog.

## Working efficiently in this repo (read before opening a file)

`src/pages/ContractorDashboard.tsx` (~211KB), `src/pages/ClientDashboard.tsx` (~199KB),
`src/pages/ClientOnboarding.tsx` (~115KB) and `src/pages/AdminDashboard.tsx` (~114KB) are
each 28k–53k tokens. **Reading one whole is a quarter of the context window; reading two is
not possible.**

- **Never `Read` a file over ~1,500 lines in full.** `Grep` for the symbol, `Read` with
  `offset`/`limit` around the hit (±80 lines), then `Edit`. `Edit` needs only one prior
  `Read` of the file, not a complete one.
- **Shipping a big file costs nothing, so don't let that shape the edit.** The installer
  carries no file contents (see *How work ships*), so there is no output cost per changed
  file — only the cost of having read it. Optimize the read, not the ship.
- Prefer `grep -n` / `sed -n 'A,Bp'` via bash over `Read` when you only need to see shape
  or line numbers — it costs a fraction and you can be surgical with the range.

## How work ships (READ THIS FIRST)
Repo `github.com/karanmann137-creator/freddy-fixit` is **PUBLIC**.

**The assistant's mounted folder IS the live repo.** `/Users/karanmann/freddy-fixit` is the
same directory the installer's `cd ~/freddy-fixit` lands in. There is **no clone**, and the
installer **carries no file contents at all** — it is ~1–5KB of gates that check what is
already in the folder and push it. `tools/ship.py` is the authority on this, not this file.

1. Edit files in `/Users/karanmann/freddy-fixit` directly with Read/Edit/Write. Don't clone.
2. Validate (see Build / validate below).
3. `python3 tools/ship.py --message "what changed" [--delete path ...] [--delete-untracked path ...]`
4. Owner runs `bash ~/freddy-fixit/apply-<x>.sh`, waits for `✅ … pushed`, then hard-refreshes (Cmd+Shift+R). If git complains, prefix `rm -f ~/freddy-fixit/.git/index.lock &&`.

**A payload-free installer deletes four documented failure classes BY CONSTRUCTION**, which
is why the old rules about them are gone rather than relaxed: there is no decode to get
wrong, no redirect to truncate a file to 0 bytes (`b1361b6`, which crashed every client on
`/client-dashboard`), no payload for a stale superset to revert from (`56f96d3` wiped the
pipeline strip/calendar; `fa5e2b5` orphaned `ContractPanel` and made **every job
unpayable**), and no installer-vs-source round-trip to verify — they are the same file.

**⚠️ It introduces exactly ONE new sharp edge, and it is sharp: the working tree is the only
copy of the change.** Un-shipped edits in the mount are backed up by nothing — ship, or lose
them. The emitted installer therefore **never** runs a bare `git checkout -- .`; its failure
trap restores only the paths it deleted, by name. **Do not add a general revert.**

**Rules that still hold. Full write-ups in `docs/overview-and-shipping.md`.**
- **`npm run typecheck` at 0 errors is the gate that matters.** **`vite build` cannot catch an empty or broken module** — esbuild does no typecheck, so it builds fine and only explodes at runtime inside `React.lazy`. Typecheck is what caught `b1361b6` (`TS2322: Property 'default' is missing`).
- **DB and edge changes are NOT applied by installers** — apply them live via Supabase MCP. Migration + edge source is committed for version control only.
- **⚠️ The repo copy of an edge function can lag the deployed one, and the deployed one is the truth. Read the deployed source with `get_edge_function` before editing any edge function.** Known stale as of 2026-09-01: `create-payment-intent` (v19), `stripe-webhook` (v19), `resolve-dispute`, `adjust-payment`.
- `mcp__cowork__present_files` can't present `.sh` — give the run command as plain text.
- `tools/ship.py`'s deletion gate picks its needle off the file extension (TS/TSX imports omit it, asset URLs carry it), and `_public_twin()` is md5-gated on purpose. **A gate that cries wolf is a gate someone learns to skip.** Regression-test both directions by hand before trusting a run.
- **What the assistant cannot do from the sandbox:** delete files, and run git write operations (git must unlink `.git/index.lock`; the mount refuses unlink). Both live in the installer, which runs on the owner's machine.

## Build / validate
```
npm install                             # first time
npm run typecheck                       # tsconfig.check.json — baseline is 0 errors
npx esbuild <file> --loader:.tsx=tsx    # per-file parse check
npx vite build                          # full build — OWNER'S MACHINE ONLY
```
`vite build` **cannot run in the Linux sandbox** (rolldown ships a darwin-only native binding). Validate with typecheck + esbuild and embed `vite build` in the installer as the owner-machine gate.
CI: `.github/workflows/typecheck.yml` runs `npm run typecheck` non-blocking on push/PR to main.

## Brand tokens (summary — full rules in `docs/brand-and-motion.md`)
Navy `#1a2236` · section navy `#151d2e` · footer `#111827` · orange `#ea6b14` · text `#f0f4ff`.
Fonts **Archivo** (headlines on pages you *read*), **Bebas Neue** (headings on pages you *operate* — all dashboards, onboarding, auth, forms — plus all small labels/chips/numerals/buttons/logo everywhere), DM Sans (body). All three load from the single `<link>` in `index.html` — plus ~39 redundant per-page loaders that are each a subset of it, so **a face used site-wide belongs in that `<link>`, never in a page's own `<style>`**.
- **The display face is `var(--ff-font-display)` and NOTHING names it directly** (2026-10-31). It was the literal `'Fraunces', Georgia, serif` in **19 places across 12 files**, so a face change meant 19 edits and any one miss rendered a page in two display faces with no error. Weight comes from `--ff-display-wght` (700). Both live in `:root` in `main.tsx`.
- **Archivo replaced Fraunces for a structural reason, not an aesthetic one.** Every band states itself twice — headline in the display face, card titles *inside that band* in Bebas — so a high-contrast serif above Bebas read as a collision rather than a hierarchy, three faces per band with DM Sans body. Archivo shares Bebas's grotesque skeleton, so the two relate. **If the face ever changes again, the test is "does it sit above Bebas", not "is it nice".**
- **A grotesque at 500 is not a serif at 500.** Display sites are weight **700** and tracking near **-0.028em**; Fraunces' stroke contrast carried display weight that Archivo needs mass and tightness for. Swap the token without revisiting those two and every headline looks under-set. Sub-display sites (`.ff-panel-label` at 1.22rem, `.ff-about-tagline` at 2rem) deliberately keep **500** so they stay subordinate to the h1 — the weight bump exists to stop a grotesque looking under-set at *display* size, and those aren't display size.
- **Fraunces is GONE from `index.html`.** Nothing under `src/` renders it. If it comes back it comes back in that `<link>` **and** in the token together; one without the other either falls back to Arial or pays for an unused variable-font download.
- A selector naming `h3` must be **SPLIT, never swapped** — h3s are card titles and stay Bebas, carrying the original tracking **verbatim** (the value is not uniform across files).
- `line-height` must rise off `1` when a display heading changes face — both Fraunces and Archivo have real descenders where Bebas's all-caps metrics effectively didn't. Archivo's are shallower, so the display sites sit at 1.02–1.04 rather than 1.05–1.06; **at or above 1.0, never below**.
- Don't reach for `font-variation-settings` on the display face — setting `wght` there overrides the `font-weight` declaration outright, which now means overriding `--ff-display-wght`.
- There is **ONE easing scale** (`--ff-ease-out` / `--ff-ease-in-out` / `--ff-ease-drawer` in `main.tsx`) and one shadow scale. The easing tokens live in plain `:root`, deliberately **not** in `.ff-on-dark`.
- `ff-enter` / `ff-enter-b` keep **separate `@keyframes` names** on purpose — swapping to a class naming the same keyframes doesn't restart the animation.
- The dashboard press is `scale(0.97)`, asymmetric, and its three copies (`AdminDashboard`, `ClientDashboard`, `ContractorDashboard`) must stay byte-identical.
- `transition: all` is gone from `src/`. Keep it gone.
- **`.ff-on-dark` is how navy survives light mode.** A `var()` inside a custom-property *declaration* substitutes where it is **declared**, so the seven aliased tokens are spelled out as literals inside the class — add a new alias at `:root` without a literal there and it silently renders the wrong theme. `check_tokens.js` asserts 30/30.
- Band rhythm on Home alternates ground/surface with one navy anchor at Freddy Verified (which uses `--ff-bg`, not `--ff-surface`); `check_rhythm.js` fails on two adjacent bands landing on the same colour.
- Motion review guidance is the `emil-motion` skill. Only `Home.tsx`, `ClientSuccess.tsx`, `ContractorSuccess.tsx` import Framer Motion — keep that true. Springs are `{ type: "spring", duration, bounce }`, never stiffness/damping.

---

# Hard invariants

## Money — the four payout guards
**MONEY INVARIANT: a payout requires `payment_status='held'` AND `fully_funded`.** A job is collected in two charges, so "held" no longer means "paid for" — `funded_amount` says how much actually arrived. **Every new branch that receives money must increment `funded_amount`; every branch that pays out must check `fully_funded`.** Miss one and the platform transfers 93% of a job it collected 40% of, silently, on a 3-day timer.

The four guards, which only work as a set:
1. `confirm_job_completion()` raises with the exact balance owed.
2. `auto_confirm_stale_jobs()` skips under-funded jobs.
3. `release-payment` 409s on `!fully_funded`.
4. `reconcile-payouts` filters `.eq("fully_funded", true)`.

**Every change that touches money must state which guards it touches.** Say so explicitly, and make guards stricter, never looser. Use the `freddy-payment-change` skill as the review gate and `freddy-money-test` to verify.

Other money rules:
- **A job-level balance increments `funded_amount`; a stage or a pool must not.** Milestone money lives on `job_milestones`, pool money on `recurring_prepayments`, so `fully_funded` is false for a milestone job **by construction**.
- **The service fee is charged once, in full, with the deposit** — never split it proportionally.
- **A job can hold MULTIPLE payment intents** (deposit + balance + top-ups). Refund/adjust logic walks `extra_charge_intent_ids` newest-first, never assumes one.
- **`withdraw_job()`, `remove_client_request()`, `decline_price_reopen()` and `admin_delete_job()` hard-DELETE and everything cascades** (disputes included). All four must guard through **`job_money_block(p_job_id)`** — the ONE answer to "can this job be destroyed?" (NULL = safe, else the plain-English reason).
- **Never hardcode a rate.** `platform_fee_rate()` = 0.03, `platform_deposit_rate()` = 0.40, `platform_commission_rate()` = 0.07 (contractor receives `1 - this`). `get_job_fee(client, job)` returns the canonical `{base, rate, fee, total, waived}`. The five `0.07`/`0.93` literals under `supabase/functions/` are deliberate (reading a rate over the network inside the charge path would turn an unreadable constant into a blocked checkout) — grep `0\.07` and `0\.93` there if the commission ever changes. The frontend reads the rate via `src/lib/platformRates.ts`.
- **A transfer draws on the AVAILABLE balance and cannot exceed its `source_transaction` charge** — and a 40/60 job is funded by two charges, so a one-`source_transaction` payout is arithmetically impossible. `release-payment` splits into legs, reads the prior ledger **from Stripe** (not our columns), rethrows on a failed list read, and keys idempotently **per charge** because **Stripe caches errors as well as successes for 24h**.
- **`released` OR `refunded` are BOTH terminal** on a milestone stage.
- The deposit stays **HELD**, never advanced to the contractor.
- Card-on-file autopay has **never charged a real card** — treat it as unproven. The **dispute branch is still production-untested**.

## Postgres
- **Never use bare `to_char()` on a `timestamptz`** — session TimeZone is UTC, so it renders Calgary times 6–7h ahead. Use `public.ff_local_ts(ts)`. (`to_char()` on a `date` is fine.)
- **When an RPC gains a parameter, DROP the old signature first** or PostgREST hits overload ambiguity. An RPC returning a fixed `TABLE(...)` needs **DROP then CREATE** to add a column, and the grants must be re-issued.
- **`SECURITY DEFINER` + `set search_path = public` breaks pgcrypto** — it lives in `extensions`. Use `set search_path = public, extensions, pg_temp` and schema-qualify (`extensions.gen_random_bytes`). **This exact bug killed every signup for a month.**
- **A guard written `v_x <> auth.uid()` is silently broken.** In SQL that comparison is NULL when `auth.uid()` is NULL, and **a NULL `if` condition does not fire** — so an unauthenticated caller falls straight through. Always test `auth.uid() is null` **first**. This was a family of **twenty** functions, nineteen anon-reachable with the publicly-shipped anon key. An `is null` test is null-safe and does fire; **read the adjacent guard before assuming a broken one is reachable**.
- **`SECURITY DEFINER` removes RLS as the backstop** — the row lookup finds the row even for an anon caller, so a "not found" raise doesn't save you either.
- **Revoking from `anon` alone is a no-op** — the default function grant is to PUBLIC, so `revoke … from public` is required too. True-PUBLIC executability is `proacl is null OR (proacl)[1]::text like '=X/%'`; `proacl::text like '%=X/%'` is **wrong**.
- **`is_admin()`-gated RPCs return `[]` from an MCP SQL session** — there's no `auth.uid()`, so the guard is false. Verify by running the body with the guard removed. (Corollary: **the MCP session IS the unauthenticated case**, which makes it a direct exploit check.)
- **MCP `execute_sql` does not surface `RAISE NOTICE`.** To report from a rolled-back probe, accumulate into a `text` var and finish with `raise exception E'PROBE RESULTS (rolled back):%', r;`.
- A trigger that must not lose its row should **set a flag, not `RAISE`** — a RAISE rolls back the row that is itself the evidence.
- **A catch-all may cover exactly one thing that matters; anything cosmetic in the same block gets its own guard.** A failed display lookup inside a shared `exception when others then null` takes the real notification down with it, silently.
- **A new `net.http_post` in a function body is a pause bypass** unless the function calls `outbound_paused()` itself.
- Changes go through the `freddy-db-change` skill. Prove behaviour with a **rolled-back probe**, not by reading.

## Frontend
- **`supabase.functions.invoke` throws away the response body.** Pull the reason off `error.context`: `try { const j = await (error as any).context?.json?.(); if (j?.error) m = j.error; } catch {}`.
- **Use `.maybeSingle()`, never `.single()`** for profile/role lookups — `.single()` errors on zero rows, which orphaned accounts hit constantly.
- **A failed read is not an empty result.** Distinguish "no row" from "couldn't tell" at **every** call site, not just the one where the rule was first written (`pickBid` re-opened the exact hole `jobLoadFailed` exists to close). `getMyProfile` returns `ok:false`; `contractsFailed` / `expensesFailed` / `jobLoadFailed` suppress the nudge rather than asserting a zero.
- **Never branch on a server error's wording where the job's own state can answer.** Matching the substring `"fund"` reported a platform settlement delay as "you owe a balance", with no button anywhere to pay it.
- **One predicate, shared by every reader.** `photosMissing(job)`, `canWithdraw(job)`, `canRemoveRequest(req, job)`, `addressMissing(job)`, `chatReadOnly(job)`, `jobFullyFunded(job)`, `autopayNote(...)` each have exactly one implementation mounted everywhere, so a gate, a dimmed button, a hint and an attention card can never disagree. Browser-side money predicates are deliberately **stricter** than the server; widen them **toward** the server, never past it.
- **A control that can never succeed is worse than no control**, and an explanatory note must be keyed on the thing it claims, not on the predicate that hid the button.
- **The role lookup is cached once per session** (`src/lib/myProfile.ts`) and caches the in-flight **promise**, not the value. **Absence is never cached**, nor is a failure. Invalidate with `clearMyProfile()` anywhere `profiles.role` is written.
- **Never call a supabase query inside `onAuthStateChange`** — auth-lock deadlock. Do it on route change. (A synchronous assignment there is fine.)
- **wouter no-ops when you navigate to the path you're already on.** Same-path navigation uses window CustomEvents (`ff:dash-nav`, `ff:open-settings`, `ff:open-chat`, `ff:google-review`, `ff:chat-changed`).
- **An attention button lands on the CONTROL it names, never the top of the card.** Use `focusJobAnchor(job, anchorId)` / `ringAnchor(anchorId, delay)`. Anchors are **bare ids, deliberately not keyed per job** — exactly one card is expanded at a time, and the pulse compares `pulseAnchor` **by string**, so keying them per job silently breaks the ring. Scroll targets need a stable `id` on **every** render branch including loading, plus `scrollMarginTop:"5.5rem"`.
- **Two smooth scrolls on the same box fight each other** — attention rows carry `ownsScroll` so the shared button suppresses its top-scroll.
- **Only the first three "Needs your attention" rows render** (four on the contractor side). Money-gating rows go first. The contractor side is an `else if` chain — a new overlapping predicate must be inserted **before** the one it overlaps.
- **When you gate a condition, grep for every other place that reads the same flags.** A block gated only on a `*_at` flag lingers forever, because nothing clears those flags on completion — and the reschedule prompt exists **twice**, with the fix applied to one copy for months.
- **A form that is correct, granted and gated correctly can still be unreachable, and nothing reports it.** When a feature's table has 0 rows against non-zero opportunities, suspect the route to it before suspecting the RPC.
- **A bare `1fr` in `gridTemplateColumns` is `minmax(auto, 1fr)`** — use `minmax(0, 1fr)` and `minWidth:0` before `textOverflow:ellipsis` clips. Never `overflow-x:hidden` on `html`/`body` (breaks `position:sticky`, which the sidebar depends on).
- **`--ff-font-scale` is 1.1**, so 1rem ≈ 17.6px and the habitual `fontSize:".85rem"` computes to ~15px — **one pixel under iOS Safari's 16px zoom threshold**, which zooms on focus and never zooms back. The fix is the single `!important` font floor + 44px min-height in the `@media (pointer: coarse)` block in `main.tsx` (checkboxes and radios excluded). **Never lower `--ff-font-scale`** — it's a user-facing preference.
- **Every upload is compressed in the browser first** — `compressImage(file, profile)` with profiles `photo` / `avatar` / `document`. **Every failure path returns the ORIGINAL file.** Videos, PDFs and GIFs pass through. The signed-contract upload in `ContractPanel` is deliberately **not** compressed. Derive the path extension from the *returned* file and pass its `type` as `contentType`.
- **Image safety scanning fails OPEN in two places** and returns HTTP 200 for every unresolvable condition, so no caller can learn to read a status code as a rejection. On evidence surfaces (`shouldBlock(r, { evidence: true })`) a `gore` reject does **not** block. The scan runs after the object is in storage — **it is not a security boundary**.
- **HEIC photos often arrive with an empty `f.type`** — fall back to the extension. A cancelled file picker returns no file, so `if (!f) return;` (**never `?? null`**), and reset `e.target.value` on reject.
- **`askConfirm` only settles when `<ConfirmDialog>` closes** — forget to mount it and the button hangs forever with no error.
- Inline styles can't express `:hover`/`@keyframes` — both dashboards carry a scoped `.ffdash` `<style>` block. Pages outside `.ffdash` (Login, AuthCallback, UpdatePassword) need an inline `dim(on)` helper. **An inline `style` attribute beats the injected stylesheet.**
- **`Ic`'s glyphs are hand-copied Lucide paths, not the package.** A missing glyph renders **blank**, not an error. Add the glyph; do not reach for a package.
- **`photo_rules_start()` lives in three places** — the DB function, `JobPhotos.tsx`, and `supabase/functions/visit-reminder/index.ts`. Change one, change all three.
- **`upsertMeta` has exactly ONE copy** (`src/lib/seo.ts`) and mutates the existing head element **in place**. A wrong canonical throws no error — you learn about it from a ranking drop weeks later.
- **Normalise, never rewrite, a job description.** `tidyDescription()` fixes spacing/case/punctuation only; a contractor prices the job off that text.
- Fixed-count grids use `repeat(N, minmax(0,1fr))` (`auto-fit` is **not** a drop-in); auto-fit uses `minmax(min(NNNpx,100%), 1fr)`; page padding is `clamp(1rem, 4vw, 1.5rem)`. `svg` is excluded from the injected `max-width` rule so `Ic` icons don't shrink.

## Authoring
- Avoid `${` inside template literals in generator scripts; for `$` amounts in JSX use `{"$" + x}`; embed CSS as `<style>{"...double-quoted css..."}</style>` (no backticks).
- In Python generator scripts, `%` inside a heredoc crashes `%`-formatting — use `.replace("__TOKEN__", value)`.
- The `Write` tool requires an explicit `Read` of an existing file first; having its contents in context does not satisfy the guard.
- `any` is used liberally; esbuild does no typecheck, so rely on `npm run typecheck`.
- **Prior sessions shipped features that were never documented. Before building anything, check whether it already exists in the repo/DB.**
- **An import-graph walk from `src/main.tsx` is the authority on reachability — not a grep, and not this file.** When a component is retired from its last mount, delete it in the same pass; a dead file a stale doc vouches for is worse than either alone.

## Security
- **`verify_jwt=true` is NOT authentication.** The anon key is a valid project-signed JWT and ships publicly in the JS bundle. Any edge function that must know *who* is calling checks in code: pull the bearer, `admin.auth.getUser(jwt)`, resolve role/identity from `profiles` — **never from the request body**.
- **DB→edge calls prove themselves with the internal-token primitive**, not a bearer. `issue_internal_token('edge-internal')` → `x-ff-internal` header → `consume_internal_token` in the function. **New kickers must mint a token**; `pg_proc.prosrc` is publicly readable on a public repo. The older kickers still carrying the anon bearer are a cleanup backlog, not a design.
- **Resolve the caller BEFORE reading the target row**, so 404-vs-403 can't be used to probe whether an id exists.
- **A gate fails CLOSED: any error resolving a credential is a refusal, never a send or a charge.** Conversely an **alert throttle fails OPEN** — a throttle that silences an alert on its own bug is worse than a duplicate.
- **A public bucket is not a listable bucket.** A public bucket serves `/object/public/...` without consulting RLS at all, so a blanket `select to public` policy buys only **enumeration** — and a folder name in `contractor-photos`/`portfolio-photos` IS the contractor's auth uid.
- **Tightening a read policy or an ACL is the dangerous direction** — prove no legitimate caller exists *before* applying, then prove it again with a rolled-back probe after. Getting it wrong on the contract gate makes every job unpayable with no error anywhere.
- **Objects cannot be deleted in SQL** (`storage.protect_delete()`). Removal needs the Storage API from a service-role edge function. Delete the **storage object first, the row second**.
- **`[].every(…)` is `true`** — aggregate results as `results.length > 0 && results.every(…) && missing.length === 0`.
- **Rate limiters return TRUE (allow) when they cannot identify the caller.** `auth.uid()` null means service_role or an internal writer.
- Repo is PUBLIC → the ranked findings live in `SECURITY-AUDIT-PRIVATE.md`, which is **gitignored**. Never commit a map of holes.

## Contracts — the fail-closed payment gate
**An e-signed Service Agreement is required on EVERY job.** `contract_required` is true for every job; **`contract_ready(p_job_id)`** returns NULL when ready or the plain-English reason, and its fifth reason requires `contractors.stripe_payouts_enabled` — so no client can ever be charged for a job whose contractor has nowhere to be paid.

`create-payment-intent`, `create-balance-payment`, `create-milestone-payment` and `create-recurring-prepayment` return **HTTP 428** on unsigned **or on any check error**. The frontend mirrors it: `contractBlocked` starts `true` and only clears on a positive `contract_signed`.

**This is the highest-risk surface on the platform.** A superset installer once dropped the `<ContractPanel/>` mounts and, because the gate fails closed, **every job became unpayable with no error anywhere**. `ContractPanel.tsx` has seven return branches and `CONTRACT_ANCHOR` is spread onto **all** of them, including loading.

A **frontend-only** gate (like the address confirmation before deposit) is deliberately not promoted to a fail-closed server check: the worst case there is a phone call, the worst case here is the whole platform unable to take money.

## Email & notifications
- **There is ONE pause switch**: `outbound_paused()` = `platform_mode() in ('paused','waitlist')`. `set_platform_mode('open')` re-arms everything. The real guarantee is `outbound_paused()` **inside** each emitter, not the cron list — if you add an outbound cron job, add it to `set_platform_mode`'s quiet list **and** gate its `kick_*` function.
- **The in-app 🔔 survives the pause** — only the email fan-out is suppressed. Gate placement matters: before the `message_email_log` upsert, before `reminder_log` stamps.
- **Not gated on purpose:** `enqueue_admin_alert`, `health_alert`, payment receipts, the money sweeps, GoTrue auth mail, both signup welcome emails, and `auth-rescue`. Silencing signup mail reproduces the Aug 2026 lockout exactly.
- **A Database Webhook fires on EVERY `public.notifications` INSERT.** A type that is *also* emailed by a richer dedicated function goes in **`EMAIL_HANDLED_ELSEWHERE`** in `send-notification`. **Before adding a type, verify it has exactly one emitter.** Genuinely transactional types are deliberately left out so they do email.
- **A duplicate emitter has to be found by reading the emitting function, not the type list.** `notify_user` double-sent all thirteen of its types via a raw post that `EMAIL_HANDLED_ELSEWHERE` could never have caught — and that post was invisible to `outbound_paused()`.
- **Auth mail and transactional mail now share one Resend domain, DKIM key and quota** (GoTrue over SMTP since 2026-08-30). A DKIM fault or a blown quota now locks people out as well as silencing receipts. **Watch the Resend quota as a platform-wide dependency.** An open emitter on this domain is the Aug 2026 lockout shape reached from the other end.
- **A 200 from GoTrue proves handoff, never delivery.** Only an inbox proves delivery. The permanent detection net is health check 7 `no_stuck_signups`; the remedy is `auth-rescue`.
- **A welcome email is never worth an account** — anything running inside the signup transaction gets its own exception block.
- Standing owner instruction: **don't send bulk email without asking.**
- `platform_health_check()` returns **7** named checks. Read `platform_settings.mode` / `outbound_paused()` rather than trusting a doc for what's armed.

## Matching
**`service_specialty_map` is the single source of truth** for all three matchers (`notify_contractors_new_request()`, `dispatch-job`, `list_open_jobs()`). Changing the DATA keeps all three in lockstep with zero code changes.
- **Unmapped labels pass through to everyone — but a label mapped to a specialty nobody holds reaches NOBODY**, with no error and no empty state. **`public.trade_reach(service)` is the one function that answers "how many pros would actually see this?"** Check it before assuming a trade is covered.
- Widen the map **FIRST**, then `refire_request` — the other order re-mails the same pros and burns the re-fire.
- `client_requests.dispatched_to` is a **permanent** "already told them" list, not a cooldown. A manual re-fire in raw SQL must bump `refire_count`.
- Compulsory trades, Cleaning, Solar and the vehicle labels are deliberately **not** widened. `service_compulsory` feeds the contract's permit section and gates nothing.
- Zone ranking is **never a filter** — out-of-zone jobs stay visible, just lower.
- **Both halves of the approximate-location string are load-bearing** (`"T3A 1B2 · NW Calgary"`): `mask_location()`, `list_open_jobs()` ranking and `dispatch-job`'s subject all read the raw text, and a postal code with no area token is still a non-empty string that passes a blank check while silently ranking out-of-zone everywhere.
- **`contractors` has no `updated_at`** — a deactivation window is invisible in the data after the fact.

## Operational reflexes
- `freddy-incident` — triage a production problem (signups, email, unpayable job, stuck payouts, red health check).
- `freddy-payment-change` — review gate before any money change.
- `freddy-money-test` — verify the payout guards after a change.
- `freddy-db-change` — discipline for migrations, RPCs, triggers, RLS, pg_cron.
- `freddy-weekly-review` — the end-to-end site audit.
- `ship` — deploy frontend changes and delete dead files.

---

# Open / queued

- **Prepaid-contracting licensing** (contractor licence + bond; whether the platform needs its own) — lawyer + Service Alberta. Blocking-risk item.
- **The dispute branch is still production-untested** — no job has ever reached `disputed`, so `resolve-dispute` has never executed against real money.
- **Card-on-file has never charged a real card**, only an empty candidate set. Treat it as unproven.
- **Two-step sign-in is opt-in and nobody is enrolled yet**, so `admin_guard()` behaves exactly like the old `is_admin()` check until the owner enrols.
- **`insurance_on_file` must gain an expiry test** once `insurance_expiry_date` is a real parsed date — showing "insurance on file" for a lapsed policy is worse than showing nothing.
- **Decide the social bot's fate — finish it or delete it whole.** All four `social_*` tables are at 0 rows; the human-approval half has no UI.
- Owner action, cosmetic: remove the four tombstoned edge functions (`send-reminder`, `send-welcome`, `remind-contractor`, `resend-domains`) in the Dashboard.
- Seed contractors Slone (`a01c49f7-0ba6-4e0a-bc81-aba53baebcb7`) and Justin (`44748517-72d6-440a-ab06-b13e2660cc80`) still have NULL `company_name` + vetting answers.
- `review-contractor` sometimes records `review_status='rejected'` with an empty `review_result={}`.
- Full list with reasoning: `docs/open-queued.md`.

# Privacy / safety
- Repo is PUBLIC → never commit secrets (service-role key, Stripe keys, Resend key) or user PII (real contractor/client emails, phones, names). Reference seed rows by UUID; look up details in the DB when needed.
- Business contacts only: admin `hello@freddyfixit.ca`, from `noreply@freddyfixit.ca`, newsletter `tips@freddyfixit.ca`.
- Consumer-facing wording: say **"held securely"**, never "escrow".

# Keeping the docs honest
When a feature lands, update the `docs/` file for its area **and** check whether it changes
a rule in this core. Add to this core **only** a rule that must hold on every turn — the
reasoning belongs in `docs/`. This file paid for itself once already by being too long.
