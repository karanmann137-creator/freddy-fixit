# Infrastructure & ops

**pg_cron jobs:** `daily-reminders` (16:30 UTC → `run_reminders()`), `reconcile-payouts` (every 15 min), `platform-health-check` (15:00 UTC), `visit-reminders` (every 10 min), `release_unconfirmed_visits` (every 15 min), `newsletter-contractor` (Tue 16:00), `newsletter-client` (Thu 16:00), `prune-rate-limits` (04:17 UTC daily → `prune_rate_limit_hits()`), `rescue-stuck-signups` (`37 * * * *`), **`meta-lead-scout` (jobid 16, `43 */2 * * *` → `kick_meta_lead_scout()`, added 2026-09-03)**, plus auto-confirm. **As of 2026-09-03 the site is `open` and all 14 cron jobs are armed.** (This line previously said the site was in `waitlist` with six stood down — that was stale. Read `platform_settings.mode` / `outbound_paused()` rather than trusting a doc.) `set_platform_mode('paused'|'waitlist')` stands six of them down and `set_platform_mode('open')` re-arms them; the real guarantee is `outbound_paused()` **inside** each emitter, not the cron list. DB→edge calls go through `net.http_post`, wrapped in an exception guard (pattern: `kick_reconcile_payouts()`). **New kickers must mint `issue_internal_token('edge-internal')` and send it as `x-ff-internal`, not carry the anon bearer** — the bearer proves nothing and sits in publicly-readable `pg_proc.prosrc` on a public repo. `notify_email()` and `kick_meta_lead_scout()` follow the token pattern; the older kickers still carry the bearer and are a cleanup backlog, not a design.

`run_reminders()` steps: 0 recurring generation · 1 recurring-due nudges · 2 seasonal nudges (one per engaged client per season, `reminder_log` dedupe) · 3 day-before visit confirm · 4–7 48h stall nudges (bids waiting / approval owed / price change pending / contractor estimate owed) · 8 balance owed after completion (24h → 3d → 7d, then stops).

**Storage buckets:** `contractor-docs` (private; admin SELECT via `contractor_docs_admin_select`), `completion-photos` (private, job-party), `problem-photos` (private, dispute parties), `message-media` (private, job-party), `contracts` (private, job-party), `contractor-photos` + `portfolio-photos` (public objects, **but no longer listable** — see Security model). Every upload is rate-limited by the `ff_upload_rate_guard` trigger, and **objects cannot be deleted in SQL** (`storage.protect_delete()`) — removal needs the Storage API from a service-role edge function.

**Auth deadlock rule: never call a supabase query inside `onAuthStateChange`.** Do it on route change instead.

**Responsive:** fixed-count grids use `repeat(N, minmax(0,1fr))` (`auto-fit` is NOT a drop-in — it silently changes column count); auto-fit grids use `minmax(min(NNNpx,100%), 1fr)`; page padding is `clamp(1rem, 4vw, 1.5rem)`; `main.tsx` injects `img,video,canvas` and `input,select,textarea { max-width:100% }` (**`svg` excluded** — `Ic` icons must not shrink). Verified: no fixed `width`/`minWidth` ≥300px anywhere in `src`.

**`src/lib/jobCode.ts`** — `jobCode(id)` = `FFX-` + first 5 hex of the job UUID, uppercased; `codeMatches()` for tolerant lookup. **No DB column.** Shown on client, contractor and admin cards and in the claim picker.

---

