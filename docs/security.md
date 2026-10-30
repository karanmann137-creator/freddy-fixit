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

