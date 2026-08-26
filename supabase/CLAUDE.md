# supabase/ — Backend (CLAUDE.md)

Project ref: `kvypmjxbbaaknvddwwai` · URL `https://kvypmjxbbaaknvddwwai.supabase.co`.
Apply DB changes **live via Supabase MCP tools** (migrations / `execute_sql` / `deploy_edge_function`) — never via the frontend installers. Commit edge-function source to the repo for VCS, but deploying is a separate step. Never put the service-role key anywhere in the repo.

## Schema (public)
`profiles(id,email,first_name,last_name,phone,role)` — `id` equals `auth.users.id` **by convention only (NO FK)**, so deleting one does not cascade to the other.
→ `contractors(id=profiles.id, specialties[], service_area[], years_of_experience, availability, photo_url, rating, total_jobs, total_earned, status, company_name, licensed, license_number, has_liability_insurance, insurance_provider, insurance_expiry, has_wcb, work_references, rating_* , rating_count, google_reviews_url)`
→ `client_requests(id,user_id,service_needed,preferred_schedule,location,job_description,status,assigned_contractor_id,photo_path,estimated_quote,quote_notes,first_name,last_name,email,phone,client_type,business_name,business_type,locations,recurring,billing_preference)` — note contact fields are **denormalized** here (survive a profile delete as SET NULL).
→ `bids(id,request_id,contractor_id,amount,message,status, UNIQUE(request_id,contractor_id))`
→ `jobs(id,request_id,contractor_id,client_id,status,amount,notes,scheduled_at,schedule_proposed_at,client_approved_at,contractor_completed_at,client_confirmed_at,completion_photo_path)`
→ `messages`, `reviews(id,job_id UNIQUE,contractor_id,client_id,price_score,experience_score,result_score,comment)`, `notifications`, `portfolio_items`.
Directory: `get_contractor_directory()` + `get_contractor_profile(uuid)` SECURITY DEFINER functions (replaced the old contractor_directory view; expose active contractors only, contact-free columns; admins see any status via get_contractor_profile).
Tombstone: `deleted_account_flags(email_hash,phone_hash,name_hash,review_count,avg_score,was_poor,deleted_at)` — privacy-preserving (hashes only).

Verified FK names: `jobs_client_id_fkey`, `jobs_contractor_id_fkey`, `jobs_request_id_fkey`, `contractors_id_fkey` (→profiles).
On profile delete: CASCADE → contractors, bids, portfolio_items, notifications, reviews; SET NULL → jobs.client_id/contractor_id, messages.sender_id, client_requests.user_id/assigned_contractor_id.

CHECK constraints: `jobs.status` ∈ assigned/scheduled/in_progress/pending_confirmation/completed/cancelled; `client_requests.status` ∈ pending/matched/in_progress/completed/cancelled.

## RLS conventions
RLS on all user tables. Always wrap `auth.uid()` as `(select auth.uid())` (initplan perf) and scope policies `to authenticated` — an unscoped policy is evaluated for `anon` too. Admin policies use `(select profiles.role from profiles where id=(select auth.uid())) = 'admin'`. Service-role (edge fns) bypasses RLS.

**Function ACLs: `revoke … from anon` is a no-op on its own.** The default grant is to `PUBLIC` (`proacl` shows `=X/postgres`), so `revoke … from public` is required too. Internal/cron functions are `{postgres, service_role}` only.

**Every `public` function needs a pinned `search_path`** — `public, extensions, pg_temp`. `extensions` is not optional: pgcrypto lives there, and an unqualified `gen_random_bytes` inside a `SECURITY DEFINER` function killed every signup for a month.

## RPCs (SECURITY DEFINER)
- `place_bid(...)` — cap is **7 distinct contractors** per request (`v_cap`), taken under `pg_advisory_xact_lock(hashtext(request_id))` to close the check-then-insert race. Re-quoting your own bid is never blocked. Customer-facing marketing says 5 (deliberate under-promise). Mints the `x-ff-internal` token that `send-bid-email` redeems.
- `accept_bid(p_bid_id)` — client/admin accept.
- `admin_set_contractor_status(p_id,p_status)` — admin-only; status ∈ active/inactive/pending (replaces inline Approve/Deactivate).
- `recompute_contractor_stats(p_contractor)` — recomputes `total_jobs`/`total_earned` from completed jobs.
- Plus job-lifecycle RPCs (assign / propose schedule+price / approve / complete / confirm). Inspect with `select proname from pg_proc where pronamespace='public'::regnamespace`.

## Triggers
- `jobs_stats_aiud` on `jobs` (AFTER ins/upd/del) → `recompute_contractor_stats`. **Earnings single source of truth = completed jobs**; nothing else writes `total_earned`/`total_jobs`.
- Field-match notify trigger (new request → notifies contractors whose specialties match).
- `notifications` INSERT webhook → email edge function.

## Edge functions
Full inventory and per-function notes live in the root `CLAUDE.md`. Highlights:
- `notify-admin` (v17), `send-notification` (v17) — notification/email (Resend). Webhook-triggered (verify_jwt off).
- `admin-delete-portfolio-item` (v1, verify_jwt on) — admin JWT **or** `x-ff-internal`; storage object first, row second; `MAX_ITEMS = 25`.
- `compress-images` (v3) — backfill re-encoder, fed by `admin_oversized_objects(bucket, floor, after, limit)`.
- `mfa-code` (v1) — two-step sign-in codes; gated on `x-ff-internal`.
- **Four tombstones** returning `410 {"status":"gone"}`: `send-reminder`, `send-welcome`, `remind-contractor`, `resend-domains`. Three of them were open mail relays on our sending domain. The MCP has no delete-function tool, so they stay as tombstones.
- `delete-account` — **verify_jwt ON**. Auth-gated (caller id from JWT; users can only delete themselves). Steps: block if active job (409); if contractor avg review < `BAD_RATING_MAX` (=6.0, scores are 1–10) insert a hashed `deleted_account_flags` row; delete caller's `client_requests` + authored `messages`; delete profile (cascade); best-effort remove Storage files under `${uid}/`; `admin.auth.admin.deleteUser`. SHA-256 hashing of normalized email/phone/name must match `AdminDashboard.tsx`.

## Storage buckets
`completion-photos` (private), `portfolio-photos` (public), `problem-photos` (private), `message-media` (private), `contracts` (private), `contractor-docs` (private), `contractor-photos` (public). Files keyed under `${userId}/...` or `${jobId}/...`; storage RLS is keyed on `split_part(name,'/',1)`.

**You cannot delete objects in SQL.** `storage.protect_delete()` raises `42501: Direct deletion from storage tables is not allowed. Use the Storage API instead.` — it prevents an orphaned S3 blob behind a tidily-deleted index row. Removal needs a service-role edge function calling `storage.from(b).remove([...])`; delete the **object first, the row second**. See `admin-delete-portfolio-item`.

Uploads are rate-limited by the `ff_upload_rate_guard` BEFORE INSERT trigger on `storage.objects` (60/hour per authenticated user); `auth.uid()` null = service_role, let through.

## Security / rate limiting
- `rate_limit_hits(bucket,key,window_start,count)` + **`rl_hit_key(bucket,key,limit,window_secs)`** — one rolling-window upsert. `rl_hit(bucket,…)` is the IP-keyed wrapper. **Returns TRUE when the caller can't be identified** — failing closed there would block internal writers. Pruned nightly by `prune-rate-limits`.
- `user_mfa` + `mfa_challenges` — two-step sign-in (email OTP via Resend, **not** GoTrue). `mfa_ok()` answers "is a code owed?" and is **TRUE for anyone not enrolled**; `admin_guard()` = admin role AND `mfa_ok()`, raising in plain English.
- `internal_tokens` + `issue_internal_token('edge-internal')` / `consume_internal_token(...)` — single-use 10-minute `x-ff-internal` header. **Redeeming it is what proves the caller is Postgres**; a bearer anon key proves nothing, since the anon key ships publicly in the browser bundle. `verify_jwt=true` is not authentication.

## Key IDs (non-PII)
Admin profile `f8da9f51-b63d-4961-8f71-8a24ad7b68b5`. Test client (first_name "woo") `61fbcfd2-d0cc-4c04-94f8-c4d0bc4b70fb`.
Two seed contractors exist (statuses pending / inactive) with null company_name + vetting fields — must be set `status='active'` to appear in directory/assign/bidding. Look up their rows in the DB; their personal contact details are intentionally not stored here (public repo).

## CLI one-liners the owner runs
`supabase db dump --schema public -f supabase/schema.sql` (baseline) · `supabase gen types typescript --linked > src/lib/database.types.ts`.
