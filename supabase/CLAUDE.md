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
RLS on all user tables. Always wrap `auth.uid()` as `(select auth.uid())` (initplan perf). Admin policies use `(select profiles.role from profiles where id=(select auth.uid())) = 'admin'`. Service-role (edge fns) bypasses RLS.

## RPCs (SECURITY DEFINER)
- `place_bid(p_request_id,p_amount,p_message)` — enforces max 3 bids.
- `accept_bid(p_bid_id)` — client/admin accept.
- `admin_set_contractor_status(p_id,p_status)` — admin-only; status ∈ active/inactive/pending (replaces inline Approve/Deactivate).
- `recompute_contractor_stats(p_contractor)` — recomputes `total_jobs`/`total_earned` from completed jobs.
- Plus job-lifecycle RPCs (assign / propose schedule+price / approve / complete / confirm). Inspect with `select proname from pg_proc where pronamespace='public'::regnamespace`.

## Triggers
- `jobs_stats_aiud` on `jobs` (AFTER ins/upd/del) → `recompute_contractor_stats`. **Earnings single source of truth = completed jobs**; nothing else writes `total_earned`/`total_jobs`.
- Field-match notify trigger (new request → notifies contractors whose specialties match).
- `notifications` INSERT webhook → email edge function.

## Edge functions
- `notify-admin`, `send-notification` — notification/email (Resend). Webhook-triggered (verify_jwt off).
- `delete-account` — **verify_jwt ON**. Auth-gated (caller id from JWT; users can only delete themselves). Steps: block if active job (409); if contractor avg review < `BAD_RATING_MAX` (=6.0, scores are 1–10) insert a hashed `deleted_account_flags` row; delete caller's `client_requests` + authored `messages`; delete profile (cascade); best-effort remove Storage files under `${uid}/`; `admin.auth.admin.deleteUser`. SHA-256 hashing of normalized email/phone/name must match `AdminDashboard.tsx`.

## Storage buckets
`completion-photos` (private), `portfolio-photos` (public), `problem-photos`. Files keyed under `${userId}/...`.

## Key IDs (non-PII)
Admin profile `f8da9f51-b63d-4961-8f71-8a24ad7b68b5`. Test client (first_name "woo") `61fbcfd2-d0cc-4c04-94f8-c4d0bc4b70fb`.
Two seed contractors exist (statuses pending / inactive) with null company_name + vetting fields — must be set `status='active'` to appear in directory/assign/bidding. Look up their rows in the DB; their personal contact details are intentionally not stored here (public repo).

## CLI one-liners the owner runs
`supabase db dump --schema public -f supabase/schema.sql` (baseline) · `supabase gen types typescript --linked > src/lib/database.types.ts`.
