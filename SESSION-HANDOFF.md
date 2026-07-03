# Session Handoff — 2026-07-03

Guardrails batch: typecheck CI + single-source service fee + daily money-path health-check. Plus two real product bug fixes surfaced while getting the typecheck baseline to zero.

## TL;DR for the owner
Re-run **`bash ~/Desktop/freddy-fixit/apply-google-review.sh`** → wait for `✅ … pushed` → hard-refresh (Cmd+Shift+R). The installer is self-healing now (see "Push rejection" below). One optional manual step remains: adding the GitHub Action via the website.

---

## What's already LIVE (applied via Supabase MCP — not in any installer)
- **`platform_fee_rate()`** — the ONE place the 3% service fee constant lives. `returns numeric`, immutable, granted anon/authenticated/service_role.
- **`get_job_fee(p_client, p_job_id)`** — SECURITY DEFINER, returns `(base_amount, fee_rate, fee_amount, total, waived)`; rate = 0 when the referral waiver applies, else `platform_fee_rate()`.
- **`create-payment-intent` edge fn — v14 deployed** (verify_jwt=true). Reads `platform_fee_rate()` with a hardcoded `0.03` kept ONLY as a never-block fallback.
- **`platform_health_check()`** — SECURITY DEFINER, returns 4 named checks:
  1. `fee_rate_sane` — 0 ≤ rate < 0.20
  2. `charged_fees_consistent` — no charged `client_fee` diverges from `amount * rate`
  3. `critical_rpcs_present` — platform_fee_rate, get_job_fee, referral_waiver_eligible, list_open_jobs, admin_rank_contractors, kick_reconcile_payouts all exist
  4. `no_stuck_payouts` — no completed+held+client-confirmed+un-disputed job stuck > 2h
- **`run_platform_health_check()`** — SECURITY DEFINER. Alerts every admin in-app (`_notify`) ONLY when a check fails, deduped ~20h; silent when healthy.
- **pg_cron `platform-health-check`** — `0 15 * * *` daily, active.

## What ships in the INSTALLER (frontend/config — owner runs the .sh)
- **`src/components/Ic.tsx`** — REAL BUG FIX: added `star` + `check` icons. They were referenced (rating stars, "My Rewind" buttons, reserved badge, checkmarks) but rendered **blank** because they weren't in the icon set.
- **`src/lib/supabase.ts`** — REAL BUG FIX: added `export type UserRole`. App.tsx imported it but it was never exported.
- **`src/pages/ClientDashboard.tsx`** — loads `platform_fee_rate()` into `feeRate` state so the displayed fee is exactly what Stripe charges; receipt shows the actual % applied (0% when waived).
- **`tsconfig.check.json`** (new) + **`package.json`** `npm run typecheck` — committed typecheck config. Adds the `@/` → `./src` path alias tsc was missing (via `paths` without `baseUrl`). Baseline is **0 errors** — any NEW type error shows up when you run typecheck.
- **`CLAUDE.md`** — new "Guardrails" entry documenting all of the above.
- Plus small Supabase loose-RPC-typing casts in servicePricing.ts / AdminDashboard.tsx / ContractorDashboard.tsx to reach the clean baseline.

---

## Push rejection — what happened & the fix
The first push was rejected:
> `! [remote rejected] main -> main (refusing to allow a Personal Access Token to create or update workflow .github/workflows/typecheck.yml without workflow scope)`

Cause: the owner's GitHub token lacks the `workflow` scope, so GitHub blocks any push that touches `.github/workflows/` — and it rejects the **whole** push atomically.

Fix applied to the installer:
- **Dropped** `.github/workflows/typecheck.yml` from the shipped file list.
- Added self-heal lines before writing files: `git fetch origin --quiet` + `git reset --hard origin/main --quiet` + `rm -f .github/workflows/typecheck.yml` (discards the rejected local commit + stray workflow file so a plain re-run succeeds).
- Updated commit message (no workflow mention).
Result: 33 files, `bash -n` OK. **Owner just re-runs the same command.**

## Optional / pending
- **Enable the GitHub Action manually** (bypasses the token restriction — the web editor isn't subject to it): GitHub repo → Add file → Create new file → path `.github/workflows/typecheck.yml` → paste the workflow contents → commit. Non-blocking CI that runs `npm run typecheck` on push/PR to main. (Ask me for the exact file contents.)
- **Seed contractors** (long-standing, awaiting owner data): Slone `a01c49f7-0ba6-4e0a-bc81-aba53baebcb7` + Justin `44748517-72d6-440a-ab06-b13e2660cc80` still have NULL `company_name` + vetting answers.

## Notes for the next session
- Clone lives at `/sessions/.../ff4` — **bash-only** (Read/Edit tools error on `/sessions`; edit via bash). Keep editing this cumulative clone; don't re-clone mid-project.
- Installer is **cumulative superset** — owner runs ONLY the newest. Generator: `/tmp/gen_installer.py`.
- DB/edge changes go live via Supabase MCP (project `kvypmjxbbaaknvddwwai`), NOT via installer.
- Build has no typecheck — rely on `npx vite build` for import/JSX errors, `npm run typecheck` for type errors.
