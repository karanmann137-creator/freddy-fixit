# Freddy Fix It — Session Handoff

Context dump so a new chat can pick up cleanly. Project = Calgary home-services marketplace.
Stack: React 19 + TS + Vite + Wouter, Supabase (project `kvypmjxbbaaknvddwwai`), Vercel auto-deploy from GitHub `main`, Resend email.
Owner is non-technical; ships by running `bash ~/Desktop/Website/apply-aesthetic.sh` (cumulative superset installer), then hard-refresh (Cmd+Shift+R).

## Deploy model (important)
- Frontend changes: edited in a clone, base64-packed into the ONE superset installer `apply-aesthetic.sh` (in `~/Desktop/Website/`). Owner runs the newest only.
- DB changes (functions, triggers, RPCs): applied LIVE via Supabase, NOT in the installer.
- Edge function deploys: separate Supabase step; source also committed via installer for version control.

## What was done this session

### 1. Stripe Connect (contractor payout half) — DONE earlier, verified working
- Separate charges & transfers, Express, hosted onboarding. Platform liable (`controller.losses.payments = "application"`).
- Edge fns: `create-connect-account` v9, `refresh-connect-status` v7 (clean).
- Currently in **TEST mode** (Supabase `STRIPE_SECRET_KEY` = test key `sk_test_...`). Contractor charges + payouts enabled and confirmed.

### 2. Anti-circumvention cleanup (frontend) — in installer, NEEDS owner to run installer
- Removed green "Accept via WhatsApp" button from each job card in `ContractorDashboard.tsx`.
- `ContractorSuccess.tsx`: removed "We coordinate most jobs over WhatsApp or phone…" copy (now points to dashboard), removed "Say hi on WhatsApp" link, removed WhatsApp mention in onboarding steps.
- Left intact: platform support WhatsApp links on Home + ClientSuccess (own support number, not party-to-party).
- Contact info already locked down (contractor phone/email admin-only; no browse-by-contractor page).

### 3. Fixed "null value in column url of relation http_request_queue" on request submit — DONE LIVE
- Root cause: trigger `trg_dispatch_new_request` on `client_requests` built its URL from DB setting `app.supabase_url`, which was never set → NULL URL → not-null violation rolled back the insert.
- Fix (live migration): hardcoded URL fallback `https://kvypmjxbbaaknvddwwai.supabase.co`, made the http_post crash-proof (won't block inserts).

### 4. Notifications wired ON — DONE LIVE (no installer needed)
- All notify edge functions are `verify_jwt=false`; wired triggers using the PUBLIC anon key (safe to embed), not the service-role key.
- `trg_dispatch_new_request` → `dispatch-job`: emails **approved + trade-matched** contractors on each new request.
  - "Approved" = `contractors.status = 'active'` (set by admin "Approve" button via `admin_set_contractor_status`).
  - Matching (trade keywords + service-area ranking) already lived in the `dispatch-job` edge fn — unchanged.
  - All 4 current contractors are still `pending`, so nothing fires until admin approves them.
- `notify_client_sms` (triggers `trg_jobs_notify_client`, `trg_bids_notify_client`) → `notify-client`: emails client on **job booked** (schedule proposed) and **job completed**.
- Note: client **bid** emails were ALREADY working via `place_bid` (in-app notify + `send-bid-email`, plus `notify-accepted` "choose now" email on 3rd bid). Verified live.

### 5. Contractor "propose date/time" UI redesign — in installer, NEEDS owner to run installer
- New component `src/components/ScheduleField.tsx`, wired into `ContractorDashboard.tsx` propose form.
- Date: month dropdown + editable year (defaults to current year, can't pick past month/year) + tap-to-pick calendar grid (past days disabled, today outlined).
- Time: separate section — big readout, AM/PM toggle, hour slider (1–12), minutes slider (00/15/30/45).
- Emits `YYYY-MM-DDTHH:mm` local string (same format the old `datetime-local` used; `propose_job_schedule` RPC unchanged).
- Build validated (`npx vite build`).

## Pending / open
- **Owner action:** run `bash ~/Desktop/Website/apply-aesthetic.sh` to ship items 2 & 5 (and earlier dashboard cleanups: removed "93%" copy, WhatsApp intro line, bigger "No Open Jobs" empty state w/ icon, DeleteAccount only on My Profile tab).
- **Test client payment half (not done):** client pays via Stripe Checkout (test card `4242 4242 4242 4242`) → `payment_status` = held → confirm job → release 93% to contractor. Verify `STRIPE_WEBHOOK_SECRET` in Supabase is the TEST-mode signing secret matching the test key, else `payment_intent.succeeded` won't mark jobs held.
- Going live later: swap Supabase `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to live values; re-onboard contractor payout in live mode.
- Pricing decisions (recorded, not all live): 7% platform fee; 3% client service fee added at confirmation.
- Not built: User Agreement + Privacy Policy were referenced in code; confirm they're complete for Alberta/PIPEDA.

## Useful facts
- Brand: navy `#1a2236`, orange `#ea6b14`, text `#f0f4ff`; Bebas Neue (headings) + DM Sans (body).
- Anon key (public, embeddable): role `anon` JWT for `kvypmjxbbaaknvddwwai`.
- Repo is PUBLIC — never commit secrets or user PII.
- Build has NO typecheck; rely on `npx vite build` for real errors.
