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

