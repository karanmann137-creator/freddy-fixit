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
- **`admin_clear_mfa` could clear the CALLER'S OWN factor until 2026-11-03, and that
  made this entire section bypassable from a stolen password.** It checked only an
  inline `exists(... id = auth.uid() and role='admin')` and accepted any user id.
  The attack: sign in with the password (no code is owed yet — `mfa_ok()` is only
  consulted when a *guarded* action is attempted), call `admin_clear_mfa(<own id>)`,
  the `user_mfa` row is deleted, `mfa_ok()` now returns **true** because it returns
  true for anyone not enrolled, and every `admin_guard()` function is open. Fixed
  two independent ways: the function now demands `admin_guard()`, and
  self-targeting raises outright. **The consequence is intended** — once enrolled,
  the admin's only routes out of a lost factor are the ten recovery codes or
  `delete from public.user_mfa` in the Supabase SQL editor, which needs the
  *project-owner* login rather than the app login. A session that can strip its own
  second factor does not have one.
- **`admin_action_allowed(p_user_id)` is `mfa_ok()` for callers that have no
  `auth.uid()`.** An edge function holds a service-role client plus the caller's
  JWT, so it cannot evaluate `mfa_ok()` at all. This mirrors `mfa_ok()` exactly —
  "not enrolled = ok" included — but takes a **named** user id and **returns**
  `{ok, reason}` rather than raising, so the function can turn it into an HTTP
  status with plain-English copy. service_role-only. **Diverge the two and the edge
  functions start disagreeing with the RPCs about whether a code is owed.**
- Codes are 6 digits from `extensions.gen_random_bytes` (pinned `search_path`,
  per the pgcrypto incident), hashed with `mfa_hash(code, user)` — never stored
  plain — expire in **10 minutes**, allow **5 attempts**, and a new request
  **supersedes** any outstanding code for that purpose so an older email can't
  be used afterwards. Enrolling mints **10 single-use recovery codes**, returned
  once and only as hashes thereafter.

### 2026-11-04 — the gate with no door: a refusal whose remedy was unreachable

The day after enrolling, the owner could not approve a pending contractor. The
dashboard said **"Couldn't update contractor: Verify your sign-in code first,
then try again."** and there was nowhere in the product to do that.

Nothing was broken. `platform_health_check()` was **7/7 green** and there were
zero failed cron runs in 36h; the red badge on the Health tab was `admin_health`
reporting `awaiting_approval=1` / `pending_contractors=1` — and the pending
contractor *was* the one he couldn't approve. The health alarm and the lockout
were the same event seen twice, which is exactly how a one-fault incident gets
triaged as two.

The fault: `last_verified_at` was stamped at enrolment on 2026-11-03 21:48 UTC
and **only `mfa_verify(p_purpose='login')` refreshes it**. The sole caller of
that RPC was `handleSignIn` in `Login.tsx` — the **password** form. The admin has
both `email` and `google` identities in `auth.identities`, `AuthCallback.tsx` had
**no MFA handling whatsoever**, and `mfa_challenges` held one Nov-3 *enroll* row
and zero *login* rows. So he came in through Google, walked straight past the
second factor, aged out of the 12-hour window, and then met a refusal naming a
code he had no route to request. `TwoStepPanel.tsx` only does enroll/disable.

Two distinct bugs wearing one error message:

1. **The OAuth route never challenged the factor at all** — an enrolled account
   signing in with Google was never asked, which is a security hole, not just an
   ergonomic one.
2. **No surface could refresh a lapsed window** except the one form that route
   skips, which is what turned the hole into a lockout.

Fixed frontend-only:

- **`mfaOwed()` in `src/lib/mfa.ts`** is the one predicate behind every "you need
  to verify" surface, and it asks `mfa_status()` — the **server's state** —
  rather than matching `admin_guard()`'s raise text. Matching the wording would
  be the `"fund"`-substring mistake again: the wording is not the state, and
  `verified_recently` is computed by the same 12-hour rule `mfa_ok()` uses, so
  the predicate and the gate cannot disagree. It **fails OPEN** on a read error —
  a network blip must not conjure a prompt in front of a valid window, and the
  server gate is the one that actually holds.
- **`src/components/VerifyCodeModal.tsx`** requests a `login`-purpose code and
  verifies it in place. It signs nobody out and weakens nothing: the session was
  always valid; what lapsed was the factor. The `requested` **ref** guard is
  load-bearing — React 18 double-runs effects in dev, and a second code
  supersedes the first, which reads to the user as "the code doesn't work".
- **Refusal recovery in `AdminDashboard.tsx`**: every write path calls
  `offerVerify(what, retry)`, which opens the modal **and resumes the refused
  action by itself** on success. The `what` string names what is on hold so the
  ask never feels random. Each gated handler took a `confirmed = false`
  parameter so the retry does **not** re-show its `window.confirm` — a second
  prompt reads as the app having forgotten, and teaches the owner to click
  through confirmations on the exact buttons where that is most dangerous. The
  modal is mounted **once**; `askConfirm`'s lesson applies — a missing mount
  leaves a button that silently does nothing.
- **`AuthCallback.tsx`** now runs the same prompt. All post-sign-in work moved
  into a `proceed(user)` closure so the modal can park it and resume it verbatim
  — the routing must not run twice and must not be skipped when it does run.
  Note `setAfterVerify(() => () => …)`: the extra arrow is what *stores* the
  continuation instead of `setState` calling it. Backing out signs out and
  returns to `/login` rather than landing on a dashboard the factor isn't
  cleared for.

**The generalisable rule, which is already in the core as "a control that can
never succeed is worse than no control": a guard must ship with its door.** When
you add a check that refuses with "do X first", find every route into the
product and prove X is reachable from each one. A refusal that names an
impossible remedy is indistinguishable from a broken product, and the owner will
(correctly) report it as one.

Still outstanding from this incident: **`admin_dispatch_log` and
`admin_anon_reachable_guards` are READS gated by `admin_guard()`**, against the
rule that only irreversible writes carry the factor. Reads stay on `is_admin()`
because the factor rides our own Resend mailer and a mailer outage must never
blind the dashboard.

## Admin action audit log — `admin_audit_log` (2026-11-03)

Built because the 2026-11-03 admin audit found that **nothing anywhere recorded what
an admin had done**, while 38 admin-trusting RLS policies across 30 tables let the
account read every client address, every private chat and every contractor licence
document without leaving a trace.

`public.admin_audit_log(id, created_at, actor_id, actor_email, action, target_table,
target_id, detail jsonb, via)`. Read with `admin_audit_tail(p_limit)` — `is_admin()`
only, deliberately not `admin_guard()`, so a mailer outage can't blind the log. The
dashboard's **Activity** tab renders it.

Load-bearing details:

- **Append-only by construction.** A SELECT policy exists; **no INSERT, UPDATE or
  DELETE policy exists at all**, and `log_admin_action` is granted to `service_role`
  alone. Writes still work from inside the admin RPCs because a `SECURITY DEFINER`
  body executes with the owner's privileges, not the caller's — while a direct call
  from a user JWT gets `permission denied for function log_admin_action`. That
  asymmetry is the whole design: **a log a compromised admin session can edit is not
  a log.** There is no clear button in the UI and there must never be one.
- **No foreign keys, and `actor_email` is snapshotted.** The single most important
  row this table can hold is "the admin deleted this account". An FK to `auth.users`
  would either cascade that row away at exactly the moment it matters or block the
  delete it exists to record. Six months later a bare uuid answers nothing.
- **The log call sits immediately after the guard**, which buys "logged iff
  committed" for free: an RPC is one transaction, so a refused or failed action rolls
  its own log row back, and nothing can act without logging because the log is
  upstream of the work.
- **`p_actor` exists for the edge callers**, which have no `auth.uid()` to fall back
  on. `via` distinguishes `'rpc'` from `'edge'`.
- Order differs by function, on purpose. `admin-delete-account` logs **before** it
  deletes (afterwards it could only record a uuid — the profile row carrying the
  email and name is gone). `admin-update-email` logs **after**, recording both
  addresses, because the entry's purpose is answering "what was this login before?"
  once the old address is nowhere in the database. `admin-message` logs **one entry
  per batch**, not per recipient — `admin_messages` already holds the per-recipient
  rows and 200 entries would drown every other action; `batch_id` is the join back.
- In the edge functions the log is **not awaited into the result** and its error is
  swallowed to the console: the mail has gone, the email has changed, the account is
  wiped. A logging failure must never turn a completed action into an error.

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

