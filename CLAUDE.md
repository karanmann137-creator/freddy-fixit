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
| `docs/ux-laws.md` | The named UX laws (Fitts, Von Restorff, Doherty, Miller, Hick, Serial Position, Tesler, Postel…), where each is already enforced with file:line evidence, the ranked open violations, and the two checkers this repo wrongly believed it had |
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
| `docs/agents.md` | The agent team: cost discipline (model tiers, caps), what's a gate vs a detector, the declared roster, the harness contract |
| `docs/using-the-agents.md` | **Owner-facing, plain English**: what the agents are, the day-to-day loop in the Agents tab, what each button means, what it costs, the business case. Keep it non-technical — it is the one agent doc written for the owner rather than for an engineer |
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
- **A DB or edge change is not finished until its source is in the repo in the same ship.** Write the migration file first, apply that exact file, commit it; never apply SQL that exists only in the chat. `supabase/schema/` holds a generated snapshot of what production actually runs (every function, table, policy, trigger and cron job, taken 2026-11-12, because 80 of 239 live functions had no source in git). **Read a function there before changing it**, and regenerate the snapshot and `src/lib/database.types.ts` in the same ship as any DB change (`supabase/schema/snapshot.sql` is the query).
- **Every `net.http_post` kicker sets `timeout_milliseconds`.** pg_net's default is 5 s; `reconcile-payouts` averages 5.6 s and `visit-reminder` 5.0 s, so on 2026-11-11 29 of 69 responses were recorded as timeouts for calls that returned 200. `kick_newsletter` is the correct pattern.
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
CI: `.github/workflows/typecheck.yml` runs `npm run typecheck` **and `python3 tools/check_mounts.py`** on push/PR to main, plus nightly on a schedule. **This file claimed that workflow existed from before 2026-11-04, and it did not exist at all** — `.github/` was not in the repo, so the one check that catches the 0-byte-module class ran only when someone remembered to. Treat a documented check as absent until you have seen the file.
It is deliberately **not** a required status check: work ships by pushing straight to main from `tools/ship.py`, which runs both gates locally before it will push, so branch protection here would only risk blocking the owner's single route to production. CI exists to cover the pushes that *don't* come through `ship.py`.
**`tools/check_mounts.py` owns the critical-mount table — ONE copy, imported by `ship.py`.** It reads the **whole tree**, not just changed files: a mount dropped by a hand edit or a half-applied installer is invisible in the product, so "we'd have noticed" is not a backstop. Today it guards 31 needles across 12 files, including the `<VerifyCodeModal>` mounts, because dropping those re-opens the 2026-11-04 admin lockout — and the two `<DeadEnd>` branches, because **a render branch that returns nothing renders NOTHING**: React throws no error for a missing child, typecheck is happy, and the symptom is a blank page on the one screen whose entire job is to stop a blank page.

## Brand tokens and UX laws — in `docs/`, enforced by checkers
Navy `#1a2236` · section navy `#151d2e` · footer `#111827` · orange `#ea6b14` · text `#f0f4ff`.
Fonts: **Archivo** (headlines on pages you read), **Bebas Neue** (dashboards, onboarding, auth, forms, and all small labels/chips/numerals/buttons/logo), **DM Sans** (body).

- **Before touching any style, colour, spacing, motion or tap target, read `docs/brand-and-motion.md` and `docs/ux-laws.md`.** The rules that used to be summarised here (~39 KB) were moved to the end of those two files verbatim on 2026-11-11.
- **The rules are mechanical, not memorised:** `python3 tools/check_tokens.py && python3 tools/check_ux.py` must pass. `tools/ship.py` and CI both run them. If a checker fails, read its message and the matching doc section — do not weaken the checker to get a ship through.

# Product direction (owner, 2026-11-11)

The product has exactly two sides, and every piece of work must serve one of them:
1. **Customers** — finding them and keeping them satisfied (post a job, get estimates, pick, pay, review).
2. **Contractors** — recruiting them and keeping them satisfied (sign up, get matched, bid, do the job, get paid).

- **If a change serves neither side, do not build it.** Internal tooling, agents, dashboards-about-dashboards and speculative features need the owner to ask for them.
- **Simple beats complete.** Prefer removing a step, a field, a tab or an option over adding one. When a screen needs explaining, shorten the screen. Fewer files, fewer functions, fewer rules.
- **This will become a mobile app.** Build every screen phone-first (380 px wide, thumb reach, no hover-only actions, 48 px tap targets). Keep business logic in RPCs and edge functions, never in a page component, so an app can call the same backend. Do not add browser-only dependencies (anything that needs `window` at import time, desktop-only layouts, new routes that only work with a mouse).

# Scope discipline (2026-11-11 audit)

The audit found the platform at 39 accounts, 12 requests and 1 job, against 56 tables, 221 `SECURITY DEFINER` functions, 55 edge functions, 15 cron jobs and ~39 production deploys in 11 days. The breakage is change volume with no rehearsal, not load. These rules exist to stop adding surface faster than it is used.

- **One concern per ship.** A styling or polish pass never rides with a behaviour change, and never touches more than it names. `c12d446` (a mobile polish pass) dropped the chat widget's `position:fixed`; `e51cb23` had to restore it the next day.
- **No polish pass unless the owner asks for one by name.** Do not volunteer design, motion or UX-law work while there are open correctness items in `docs/open-queued.md`.
- **Do not build an agent, harness, registry row, cron or edge function ahead of use.** Seven of the eight roster agents have never run and `lead-response` has 9 proposals pending and 0 approved. No new agent work until the owner is working that queue. A feature whose table has 0 rows after a month is a candidate for removal, not extension.
- **A one-shot script is deleted in the ship that runs it.** Four `tools/migrate_*.py` (1,037 lines) outlived their single use by days and were removed 2026-11-11. The same goes for `.mcp.json` swarm configs: none belong in this repo.
- **Do not add a doc, checker or always-loaded rule for a single incident.** Fix the fault; put the write-up in the area's `docs/` file. This file is loaded every turn — it was 97 KB before 2026-11-11 and must not grow back. A new always-loaded rule replaces an old one.
- **The Supabase client is typed.** `src/lib/supabase.ts` uses the generated `Database` type, so a wrong table, column or RPC name, or a wrong RPC argument name, fails `npm run typecheck`. Do not cast around it with `as any` to get a ship through; regenerate the types instead.
- **Lint is a ratchet.** CI fails if `eslint` errors exceed the baseline in `.github/workflows/typecheck.yml`. Lower the baseline when you fix errors; never raise it.

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
- **Destroying a job must HAND THE REQUEST BACK, every time.** `client_requests` outlives its job, so a delete that stops at the job row leaves the request **stranded**: `'matched'`, assignee set, no job. That state is invisible from every surface at once — ClientDashboard reads bids only for `status='pending'`, so it shows no estimates, no job panel and **no error**; `run_reminders` step 4 filters `assigned_contractor_id IS NULL`, so no nudge fires either. `admin_delete_job` was missing the reset while its three siblings had it, and that one omission accounts for **five of the six requests that ever got an accepted bid** (fixed 2026-11-05). Any new destroy path resets `status='pending'`, clears `assigned_contractor_id`, and returns `accepted` bids to `pending` so the client sees the same estimate count they started with. The bid update is conditioned on `not waitlisted` — `block_bids_on_waitlisted` RAISES on a waitlisted parent, and a secondary tidy-up is never allowed to abort the delete it follows.
- **Never hardcode a rate.** `platform_fee_rate()` = 0.03, `platform_deposit_rate()` = 0.40, `platform_commission_rate()` = 0.07 (contractor receives `1 - this`). `get_job_fee(client, job)` returns the canonical `{base, rate, fee, total, waived}`. The five `0.07`/`0.93` literals under `supabase/functions/` are deliberate (reading a rate over the network inside the charge path would turn an unreadable constant into a blocked checkout) — grep `0\.07` and `0\.93` there if the commission ever changes. The frontend reads the rate via `src/lib/platformRates.ts`.
- **A transfer draws on the AVAILABLE balance and cannot exceed its `source_transaction` charge** — and a 40/60 job is funded by two charges, so a one-`source_transaction` payout is arithmetically impossible. `release-payment` splits into legs, reads the prior ledger **from Stripe** (not our columns), rethrows on a failed list read, and keys idempotently **per charge** because **Stripe caches errors as well as successes for 24h**.
- **`released` OR `refunded` are BOTH terminal** on a milestone stage.
- The deposit stays **HELD**, never advanced to the contractor.
- Card-on-file autopay has **never charged a real card** — treat it as unproven. The **dispute branch is still production-untested**.

## Postgres
- **Never use bare `to_char()` on a `timestamptz`** — session TimeZone is UTC, so it renders Calgary times 6–7h ahead. Use `public.ff_local_ts(ts)`. (`to_char()` on a `date` is fine.)
- **When an RPC gains a parameter, DROP the old signature first** or PostgREST hits overload ambiguity. An RPC returning a fixed `TABLE(...)` needs **DROP then CREATE** to add a column, and the grants must be re-issued.
- **`SECURITY DEFINER` + `set search_path = public` breaks pgcrypto** — it lives in `extensions`. Use `set search_path = public, extensions, pg_temp` and schema-qualify (`extensions.gen_random_bytes`). **This exact bug killed every signup for a month.**
- **A guard written `v_x <> auth.uid()` is silently broken.** In SQL that comparison is NULL when `auth.uid()` is NULL, and **a NULL `if` condition does not fire** — so an unauthenticated caller falls straight through. Always test `auth.uid() is null` **first**. An `is null` test is null-safe and does fire; **read the adjacent guard before assuming a broken one is reachable**. The family is now **twenty-six**: twenty on 2026-08-04, plus **six missed and found on 2026-11-03** (`accept_bid` — live and exploitable, an anon caller assigned a contractor to a stranger's job — and the five milestone functions, latent at 0 rows, `approve_milestone` among them). **The six were missed because the August sweep grepped for the SPELLING `<> auth.uid()`.** These two shapes don't match it:
  `if not public.is_admin() and auth.uid() <> v_job.client_id then` → `true AND NULL` = NULL, doesn't fire.
  `IF NOT (public.is_admin() OR v_client = auth.uid()) THEN` → `NOT (false OR NULL)` = NULL, doesn't fire.
  **Never sweep for a spelling of this bug — sweep for the PROPERTY:** anon-executable, compares against `auth.uid()`, and contains no null test. `public.admin_anon_reachable_guards()` is that sweep and is the standing detector. It is a **lead generator, not a verdict** — `where x = auth.uid()` and `exists(...)` are safe by construction, so every hit must be read and then proved reachable or not with a rolled-back probe.
- **`SECURITY DEFINER` removes RLS as the backstop** — the row lookup finds the row even for an anon caller, so a "not found" raise doesn't save you either.
- **Revoking from `anon` alone is a no-op** — the default function grant is to PUBLIC, so `revoke … from public` is required too. True-PUBLIC executability is `proacl is null OR (proacl)[1]::text like '=X/%'`; `proacl::text like '%=X/%'` is **wrong**. For "can this role call it", prefer `has_function_privilege('anon', oid, 'execute')` — harder to misread, and it catches the commoner case, which isn't PUBLIC at all but Supabase's **default grant to `anon` and `authenticated`**.
- **A grant block committed in a migration file is NOT evidence that it ran, and `drop function` + `create` RESETS the ACL to those defaults** (`create or replace` preserves it). Both bit on 2026-11-04: the agent-team migration's revokes were correct in the file, had never been applied live, and a later recreate would have undone them anyway — leaving `agent_propose_action` (`SECURITY DEFINER`, deliberately unguarded because "the only caller is a service_role harness") callable with the public anon key, and silently voiding the written justification for dropping its `kind` whitelist. **Verify execute privileges by reading `pg_proc.proacl`, never by reading the migration** — the same rule as the repo copy of an edge function — and **re-run the grant block after any recreate**.
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
- **⚠️ `getUser()` HAS THREE OUTCOMES REPORTED THROUGH TWO FIELDS, AND BOTH ONE-LINERS ARE WRONG (2026-11-09).** Signed in is `{user, error:null}`; signed **out** is `{user:null, error:AuthSessionMissingError}` — **the signed-out case carries an error** — and couldn't-tell is `{user:null, error:AuthRetryableFetchError}`. So `if (error) showRefresh()` tells a signed-out visitor to refresh forever, and `if (!user) redirect("/login")` bounces a signed-in person whose network blipped into an endless loop. **What separates them is whether the error is RETRYABLE** (`name === "AuthRetryableFetchError"`, or `status === 0` / 5xx), not whether one exists. `src/lib/authRead.ts` → `readAuthUser()` is the ONE answer, returning `{kind:"user"|"signedOut"|"unknown"}`; an unrecognised shape defaults to `signedOut`, because /login always offers a way forward. It carries `email` so a caller wanting it doesn't call `getUser()` again and get the branch wrong a second time — a missing email is **not** a failed read.
- **⚠️ A DEAD END IS A SCREEN, NOT A `return null` — `ui/DeadEnd` (2026-11-09).** When a surface cannot answer the question it was asked, it says so and offers a way out; staying in "loading" is the endless spinner and redirecting is the endless loop. **The action is not optional, which is why it is a component and not a style object** — `retry` defaults to true and `retry={false}` (a *settled* refusal, where "refresh to try again" would be a lie) is required to pass `alt`. There is deliberately no way to render it with neither. Three pages had hand-rolled the same screen; a hand-rolled copy is one that can be written without the way out.
- **The ONE role write from the browser is `setMyRole()` (`src/lib/roleWrite.ts`).** It asks `role_change_block` **before** attempting the write, so the reason shown and the reason enforced cannot drift and we never branch on a server error's wording. A read error is "we don't know", never "allowed"; it `.select("role")` so a zero-row update isn't reported as success; it `clearMyProfile()`s on success. It returns `{ok:false, reason, permanent}` — **`permanent` is what stops the UI telling someone to refresh past a settled refusal**, which is the endless loop reached by hand.
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
- **⚠️ NEVER TYPE A BACKTICK INSIDE A STYLESHEET STRING — INCLUDING INSIDE A CSS COMMENT.** `main.tsx`'s whole global sheet is ONE backtick template literal, as is `uiStyles.ts`'s `CSS` export; one backtick anywhere inside closes it and the remainder becomes JavaScript. **This has broken or nearly broken the build four times across three sessions**, always the same way: those files carry long explanatory comments, and the natural way to name a prop or a class in prose is to backtick it. The habit is right everywhere else and wrong only here. Write *the forceNavy prop*, never the backticked form. `npm run typecheck` catches it and its error points nowhere near the backtick.
- In Python generator scripts, `%` inside a heredoc crashes `%`-formatting — use `.replace("__TOKEN__", value)`.
- The `Write` tool requires an explicit `Read` of an existing file first; having its contents in context does not satisfy the guard.
- `any` is used liberally; esbuild does no typecheck, so rely on `npm run typecheck`.
- **Prior sessions shipped features that were never documented. Before building anything, check whether it already exists in the repo/DB.**
- **An import-graph walk from `src/main.tsx` is the authority on reachability — not a grep, and not this file.** When a component is retired from its last mount, delete it in the same pass; a dead file a stale doc vouches for is worse than either alone.

## Security
- **`verify_jwt=true` is NOT authentication.** The anon key is a valid project-signed JWT and ships publicly in the JS bundle. Any edge function that must know *who* is calling checks in code: pull the bearer, `admin.auth.getUser(jwt)`, resolve role/identity from `profiles` — **never from the request body**.
- **DB→edge calls prove themselves with the internal-token primitive**, not a bearer. `issue_internal_token('edge-internal')` → `x-ff-internal` header → `consume_internal_token` in the function. **New kickers must mint a token**; `pg_proc.prosrc` is publicly readable on a public repo. The older kickers still carrying the anon bearer are a cleanup backlog, not a design.
- **Resolve the caller BEFORE reading the target row**, so 404-vs-403 can't be used to probe whether an id exists.
- **⚠️ AN RLS-FILTERED READ ANSWERS "MAY I SEE THIS ROW?", WHICH IS NEVER "IS THIS ROW MINE?" (2026-11-09).** `PickPro` short-circuited a signed-in visitor to their dashboard on the strength of a `select … where pick_token = …` returning a row, with a comment asserting that RLS proved ownership. The `Admin full access to client_requests` policy is **`FOR ALL`**, so the probe matched for the admin against *every* token — he could never open a client's pick link, landing on `/client-dashboard` and then on the admin dashboard's default tab. **Compare the id.** Any policy that grants an oversight role broad visibility silently converts every visibility-as-ownership test into a wrong answer for exactly the person most likely to be testing it.
- **⚠️ AN IDENTITY PROVIDER THAT PICKS THE ACCOUNT FOR YOU IS A BUG IN OUR FLOW — `prompt=select_account` IS LOAD-BEARING (2026-11-09).** `signInWithOAuth` carried no `prompt`, so Google silently reused the browser's single existing session: the owner's personal Gmail, which also holds a real `client` account here. Every press of "Continue with Google" signed him into the client account and dropped him on `/client-dashboard`, reported as "I cannot sign in with Google as admin". **A successful sign-in to the wrong identity is indistinguishable from a failed one from the outside**, and nothing was broken — both accounts and both linked identities were correct. One human legitimately holding two accounts on one platform is the normal case for staff; ask every time.
- **⚠️ ONE EMAIL HOLDS ONE ACCOUNT TYPE, AND THE RULE LIVED ONLY IN REACT (2026-11-09).** `profiles`' "Users manage own profile" policy is **`FOR ALL`** on `auth.uid() = id`, so any signed-in visitor could PATCH their own `role` straight through PostgREST with the public anon key that ships in the bundle — and `prevent_role_escalation()` had no client↔contractor branch at all. **`public.role_change_block(p_user_id, p_new_role)` is the one answer** (NULL = allowed, else plain English, same shape as `job_money_block()`), raised by that trigger and asked by `setMyRole()` before the write. **The test is "has this account DONE anything", not "is the role changing"** — `profiles.role` is NOT NULL DEFAULT `'client'` and `handle_new_user()` has no role to read off an OAuth identity, so a brand-new Google signup already holds `'client'` before the person has said which they are; a flat refusal would break AuthCallback's `?role=contractor` funnel and its homeowner/contractor chooser. Activity is asked **direction-independently** across `client_requests`, `bids`, `jobs`, `reviews` and a *meaningful* `contractors` row — **a bare `ensure_profile()` row is NOT activity**, which is the whole reason that list is explicit (`company_name` / `specialties` / `stripe_account_id` / `total_earned` / `review_status in ('approved','rejected')`). `auth.uid() is null` is tested FIRST so service_role and internal callers pass, per the null-guard rule. **Generalise it: a uniqueness rule the frontend merely declines to offer is not enforced.** The sweep for siblings came back clean — one bid per contractor per request, one review per job, one milestone seq per job, one newsletter row per email+audience, unique referral code and pick token are all real `pg_index` entries, and Auth owns the unique email; the **role flip on a single auth account was the only gap.**
- **A `?role=` in an OAuth redirect is the INTENT OF A PAGE, never a claim about who someone is — so an established role wins, on EVERY branch.** `AuthCallback`'s `client` branch clamped for admin/contractor; its `contractor` sibling did not, so arriving from contractor onboarding unconditionally wrote `role:"contractor"` and would have demoted the admin account with nothing thrown. **Asymmetric guards between sibling branches are the bug shape to grep for**, not the individual miss.
- **A gate fails CLOSED: any error resolving a credential is a refusal, never a send or a charge.** Conversely an **alert throttle fails OPEN** — a throttle that silences an alert on its own bug is worse than a duplicate.
- **A public bucket is not a listable bucket.** A public bucket serves `/object/public/...` without consulting RLS at all, so a blanket `select to public` policy buys only **enumeration** — and a folder name in `contractor-photos`/`portfolio-photos` IS the contractor's auth uid.
- **Tightening a read policy or an ACL is the dangerous direction** — prove no legitimate caller exists *before* applying, then prove it again with a rolled-back probe after. Getting it wrong on the contract gate makes every job unpayable with no error anywhere.
- **Objects cannot be deleted in SQL** (`storage.protect_delete()`). Removal needs the Storage API from a service-role edge function. Delete the **storage object first, the row second**.
- **`[].every(…)` is `true`** — aggregate results as `results.length > 0 && results.every(…) && missing.length === 0`.
- **Rate limiters return TRUE (allow) when they cannot identify the caller.** `auth.uid()` null means service_role or an internal writer.
- **A break-glass function must never accept the caller's OWN id.** `admin_clear_mfa` did, and that made the entire two-step build bypassable from a stolen password alone: sign in (no code is owed until a *guarded* action is attempted), clear your own `user_mfa` row, and `mfa_ok()` goes true — because it returns true for anyone not enrolled, which is correct behaviour turned against itself. Fixed 2026-11-03 two independent ways (`admin_guard()` **and** an outright self-target refusal). The cost is deliberate: an enrolled admin's only routes out are the ten recovery codes or `delete from user_mfa` in the Supabase SQL editor, which needs the *project-owner* login, not the app login. **Generalise it — any "reset the protection" path that can target `auth.uid()` is not a protection.**
- **Irreversible admin writes carry the second factor; admin READS do not.** `admin_guard()` on the 13 destructive RPCs, and **`admin_action_allowed(p_user_id)`** — service_role-only, *returns* `{ok,reason}` instead of raising so a caller can turn it into an HTTP status — for the three admin edge functions, which hold a service-role client and so have no `auth.uid()` to evaluate `mfa_ok()` with. **Keep the two in lockstep: `admin_action_allowed` mirrors `mfa_ok()` deliberately, "not enrolled = ok" included.** Reads stay on plain `is_admin()` because the factor rides our own Resend mailer — the one whose silent failure locked three people out in Aug 2026 — and a mailer outage must never blind the admin dashboard. **Never swap `is_admin()` where it is one branch of a normal-user OR** (`accept_bid`, the five milestone fns, `get_job_contract`, `remove_client_request`, `set_quote`, …): that would demand a sign-in code from every client and contractor.
- **`admin_audit_log` is append-only and must stay that way.** SELECT policy only — no INSERT/UPDATE/DELETE policy exists at all — and writes go solely through `log_admin_action`, granted to `service_role`, which still works from inside the admin RPCs because a `SECURITY DEFINER` body runs with the owner's privileges. A forged direct call gets `permission denied`. It has **no foreign keys** and snapshots `actor_email` on purpose: the most important row it can hold is "the admin deleted this account", and an FK would either cascade that row away or block the delete it exists to record. **The log call sits immediately after the guard**, which buys "logged iff committed" for free — an RPC is one transaction, so a refused or failed action rolls its own log row back. Owner-visible in the dashboard's **Activity** tab (`admin_audit_tail`); there is no "clear" button and there must never be one.
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
- `platform_health_check()` returns **9** named checks (7 → 9 on 2026-11-04, adding `admin_can_act` and `no_jobs_blocked_on_payout_onboarding`; check 3's name list widened 6 → 15 to cover the gates and the doors). **The seven original checks all read values that EXIST, and every outage actually suffered here has been an ABSENCE** — which is why it sat 7/7 green while the owner was locked out of his own dashboard. You cannot SQL-query a missing button: that class lives in `tools/check_mounts.py`, not here. A new check must be **self-clearing** — a permanently-red check teaches the owner to ignore the whole report. Read `platform_settings.mode` / `outbound_paused()` rather than trusting a doc for what's armed.

## Matching
**`service_specialty_map` is the single source of truth** for all three matchers (`notify_contractors_new_request()`, `dispatch-job`, `list_open_jobs()`). Changing the DATA keeps all three in lockstep with zero code changes.
- **Unmapped labels pass through to everyone — but a label mapped to a specialty nobody holds reaches NOBODY**, with no error and no empty state. **`public.trade_reach(service)` is the one function that answers "how many pros would actually see this?"** Check it before assuming a trade is covered.
- Widen the map **FIRST**, then `refire_request` — the other order re-mails the same pros and burns the re-fire.
- `client_requests.dispatched_to` is a **permanent** "already told them" list, not a cooldown. A manual re-fire in raw SQL must bump `refire_count`.
- Compulsory trades, Cleaning, Solar and the vehicle labels are deliberately **not** widened. `service_compulsory` feeds the contract's permit section and gates nothing.
- Zone ranking is **never a filter** — out-of-zone jobs stay visible, just lower.
- **Both halves of the approximate-location string are load-bearing** (`"T3A 1B2 · NW Calgary"`): `mask_location()`, `list_open_jobs()` ranking and `dispatch-job`'s subject all read the raw text, and a postal code with no area token is still a non-empty string that passes a blank check while silently ranking out-of-zone everywhere.
- **`contractors` has no `updated_at`** — a deactivation window is invisible in the data after the fact.

## Monitoring — four layers, and what each one CANNOT see

Built 2026-11-04, after the owner asked why every fault on this platform is discovered by
him personally. The answer was structural, and it is worth keeping in front of you when
adding a check: **every outage here has been an ABSENCE** — a confirmation email that never
sent, a `<ContractPanel/>` mount that got dropped, a module that built to zero bytes, a
gate whose remedy was reachable from nowhere — and he is also effectively all of the
platform's traffic, so no crowd notices first. The layers are deliberately different
*shapes*, because a second check of the same shape buys nothing:

| layer | reads | blind to |
|---|---|---|
| `platform_health_check()` — 9 checks, pg_cron 15:00 UTC, emails every admin | the **data** | anything that isn't a row. A missing button is not a row |
| `.github/workflows/typecheck.yml` (`checks`) — push/PR + 14:40 UTC | the **tree** — `npm run typecheck` + `tools/check_mounts.py` | whether the tree that passed is the tree that got deployed |
| `.github/workflows/smoke.yml` (`smoke`) — 13:30 UTC, `tests/smoke/` | the **live site**, in a real browser | anything behind auth without the optional secrets, and any surface needing a job (ContractPanel) |
| `freddy-watchdog` skill — scheduled daily, read-only | **all three of the above, plus Vercel deploy state and real visitors' runtime errors** | nothing new — it exists because none of the three reports to anybody unless someone reads it |

- **`tools/check_mounts.py` is the ONE copy of the critical-mount table.** `tools/ship.py`
  imports it; CI runs it standalone on the whole tree with no regard for what changed. It
  used to live inside ship.py and fire only for files a given ship happened to touch — the
  wrong trigger, since a mount can be dropped by a hand edit or a bad merge. Membership
  test for a new entry: **its absence must be invisible at runtime.** Don't add a mount
  whose absence throws; the build already catches those.
  **⚠️ The test is the membership rule, NOT the word "mount" — the table now holds a
  positioning declaration (2026-11-08).** `c12d446` split ChatWidget's two style objects to
  add a comment above the home-indicator calc and dropped **`position: "fixed"`** from each
  in the process. **Everything downstream still LOOKED right**: `bottom`, `left` and
  `zIndex` were all still there, reading as if they were doing something — but on a static
  element all three are inert. The bubble rendered inline at the top of the document over
  the nav logo, and opening the panel **pushed the whole homepage down**. Typecheck passed,
  the build was clean, and **check (8) in `check_ux.py` was satisfied, because the `env()`
  inset it looks for was present and correct on a property that no longer applied** — a
  check can be green about a declaration that has stopped meaning anything. Hence also
  **`MIN_COUNTS`**: a plain `in` test passes while one of two identical declarations is
  gone, and these two were lost together. **When you split a style object to add a comment,
  diff the properties, not the look of the result.**
- **Neither workflow is a required status check, on purpose.** Work ships by pushing
  straight to `main` from `tools/ship.py`, which runs both gates locally first — so the
  deploy path is already gated, and branch protection would only risk blocking the owner's
  single route to production.
- **Every new check must be SELF-CLEARING.** A generic "feature table has 0 rows" sweep was
  designed and rejected: on a platform with 12 requests and 5 jobs almost every feature
  table is legitimately empty, so it would be red on day one and stay red. A gate that
  cries wolf is a gate someone learns to skip, and that undoes all four layers at once.
- **The watchdog is read-only by instruction.** It proposes and waits; it applies no
  migration and ships no code. Standing owner instruction is "ran without me needing to
  intervene, only approve".
- **A failed read is never a pass** — the frontend rule, applied to monitoring. An
  unreachable check reports "unknown", never green.
- **`tests/smoke/` is its own npm package** so Playwright never enters the app's
  dependency tree or lockfile (`checks` runs `npm ci`, which refuses on drift). Its report
  output is gitignored because a failure screenshot of a signed-in dashboard is real user
  data and this repo is PUBLIC.

## Operational reflexes
- `freddy-incident` — triage a production problem (signups, email, unpayable job, stuck payouts, red health check).
- `freddy-payment-change` — review gate before any money change.
- `freddy-money-test` — verify the payout guards after a change.
- `freddy-db-change` — discipline for migrations, RPCs, triggers, RLS, pg_cron.
- `freddy-weekly-review` — the end-to-end site audit.
- `freddy-watchdog` — the daily read-only sweep across all four monitoring layers.
- `ship` — deploy frontend changes and delete dead files.
- `emil-motion` — animation and interaction motion: curves, durations, springs, per-component recipes.
- `apple-design` — design and material review: fluid-interface feel, depth and materials, hit targets, the five HIG foundations, the severity-tagged report. **Palette and type are out of scope by decision** — log them as rejected candidates, not findings.

---

# Open / queued

- **Prepaid-contracting licensing** (contractor licence + bond; whether the platform needs its own) — lawyer + Service Alberta. Blocking-risk item.
- **The dispute branch is still production-untested** — no job has ever reached `disputed`, so `resolve-dispute` has never executed against real money.
- **Card-on-file has never charged a real card**, only an empty candidate set. Treat it as unproven.
- **The admin account IS enrolled in two-step as of 2026-11-03 21:48 UTC, so `admin_guard()` and `admin_action_allowed` are live and biting.** This line said the opposite until 2026-11-04, and the stale version was dangerous in both directions: it claimed the gates were no-ops when they were the thing refusing the owner's approvals. Two gated reads are still miscategorised — **`admin_dispatch_log` and `admin_anon_reachable_guards` carry `admin_guard()` but are READS**, which contradicts "irreversible admin writes carry the second factor; admin READS do not". Downgrade both to plain `is_admin()`, for the same reason the rest of the reads are: the factor rides our own Resend mailer, and a mailer outage must never blind the admin dashboard.
- **`insurance_on_file` must gain an expiry test** once `insurance_expiry_date` is a real parsed date — showing "insurance on file" for a lapsed policy is worse than showing nothing.
- **The agent team's approval half is built (2026-11-04); the workers are not.** `social_actions` was renamed and widened into **`agent_actions`**, plus `agent_runs` (run telemetry) and `agent_registry` (a *declared* roster, so an agent that has NEVER run is still visible — you cannot query an absence). Served by `agent_propose_action` / `admin_list_agent_actions` / `admin_agent_overview` / `admin_review_agent_action`, surfaced in the **Agents tab**, both halves of that mount guarded by `check_mounts.py`. The three original `social_*` RPCs survive as byte-identical wrappers, so the deployed `social-bot-brain` needed no redeploy. `enabled` means "a harness exists and this is expected to run", which is what keeps `stale` from going permanently red. Next step per agent: write the harness, then flip `enabled`. `outreach` stays list-only until CASL review clears, and it shares a Resend domain and quota with auth mail, so an agent burning quota locks people out of signup.
  **Cost discipline is on the roster and enforced, not in a doc (2026-11-05).** `agent_registry` carries `model` (the *ceiling* an agent may reach for: `none`/`haiku`/`sonnet`/`opus`, and six of eight are `none` because a query answers it), `max_model_calls_per_run`, `max_proposals_per_run` and `max_pending`. **The caps are GATES — checked inside `agent_propose_action`, the only write path into the queue — and the model choice is only a DETECTOR**, self-reported into `agent_runs.model_calls` and compared against the budget by `admin_agent_overview`. Keep that distinction when extending it. **A cap REFUSES rather than raises** (a raise rolls back the `agent_runs` row that is the only evidence it fired) and is checked *after* the dedupe-refresh branch, so a cap can never freeze a proposal the agent is keeping accurate. An agent **not on the roster is refused outright** — off-roster means uncapped and invisible. Budgets are per agent: if a draft is too thin, raise that row, don't move the policy. Full rationale and the harness contract in `docs/agents.md`.
  **The first harness is live (2026-11-05): `lead-response`, `enabled = true`, pg_cron `0 14 * * *`. The other seven remain `enabled = false`.** It is a **Postgres function, not an edge function** (`agent_lead_response_run()`), which makes the cost rule structural rather than advisory: **a harness with no network client cannot spend a token even by accident.** Prefer that shape whenever an agent's findings are a join. Four rules came out of building it and all four generalise: **`agent_run_start` must sit OUTSIDE any `begin…exception` block** — a plpgsql exception block is a subtransaction, so the run row, which is the only evidence the agent ran *and failed*, rolls back with the error; a harness's handler therefore calls `agent_run_finish(…,'error',…)` and **returns without re-raising** (`errors_7d` surfaces it). **A proposal past `expires_at` is still literally `'pending'`**, which is what `agent_propose_action` dedupes on — so expired rows were refreshed forever while the UI claimed approval "will be refused"; `agent_expire_stale_actions()` fixes it and is called **from `agent_run_start`, where no harness can forget it**. And **a finding the OWNER acts on terminates at `'sent'`, not `'approved'`**, or it sits looking like work nothing collected: `agent_kind_needs_harness(kind)` is the single predicate for that, driving the button label, the confirm text, the optimistic status and the status the RPC writes together, and returning TRUE for an unknown kind so a new kind fails safe toward visible-unhandled. **The lead payloads carry client name/email/phone — runtime PII that must never be pasted into a migration, a doc or a commit message.**
  **Where an agent's output is something a HUMAN sends, split the triggers: detection on the schedule, the model behind a click (2026-11-05).** `lead-response` finds leads for free on cron and drafts the actual message only when the owner presses "Draft a message" on one — `supabase/functions/agent-draft-lead`, one Haiku call, `draftLead(a)` guarded by `check_mounts.py`. A quiet day then costs zero and spend is proportional to work the owner chose. That required raising **one registry row** to `haiku`/1: `model` is a **ceiling, not a ban**, and a CHECK ties it to `max_model_calls_per_run`, so leaving it at `none`/0 would have made every draft a budget breach and `admin_agent_overview` permanently red — which the monitoring rules forbid. Drafting carries **no second factor** (reversible, sends nothing; the factor is for irreversible writes) but **is** rate-limited, because what a stolen session can do there is run up a token bill. A model string unproven against this project's key is tried from an ordered candidate list retried **on 404 only** — 401/429/5xx must fail loudly — and only successful calls count toward `model_calls`, so probing cannot inflate reported spend.
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
