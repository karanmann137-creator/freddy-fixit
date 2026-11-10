import { supabase } from "@/lib/supabase";

/*
 * THE ONE ANSWER TO "IS THIS PERSON SIGNED IN?", AND WHY A BOOLEAN WAS NEVER
 * ENOUGH (2026-11-09).
 *
 * `supabase.auth.getUser()` has THREE outcomes and reports them through two
 * fields, which is how every caller in this codebase got it wrong in one
 * direction or the other:
 *
 *   signed in      -> { user, error: null }
 *   signed out     -> { user: null, error: AuthSessionMissingError }   <-- !!
 *   couldn't tell  -> { user: null, error: AuthRetryableFetchError }
 *
 * ⚠️ THE SIGNED-OUT CASE CARRIES AN ERROR. There is no path in auth-js that
 * returns `{ user: null, error: null }` — `_getUser` constructs an
 * `AuthSessionMissingError` the moment there is no access token
 * (`GoTrueClient.js:2496`), and an expired refresh token comes back as an
 * `AuthApiError` with status 400. So:
 *
 *   - `if (error) { ...it's a network problem... }` tells a plainly signed-out
 *     visitor "you are still signed in, refresh to try again", and the refresh
 *     can never work. This was written and caught in review the same day.
 *   - `if (!user) redirect("/login")` is the opposite mistake and is the bug
 *     the owner actually reported: a transient fault bounces a signed-in person
 *     to /login, whose own mount reads the session, finds it valid, and sends
 *     them back — endlessly, with nothing ever shown.
 *
 * WHAT ACTUALLY SEPARATES THEM IS WHETHER THE ERROR IS RETRYABLE, not whether
 * one exists. auth-js models that explicitly: a transport failure is an
 * `AuthRetryableFetchError` (status 0 for a dead connection, 5xx for an
 * outage), and `_removeSession()` is deliberately NOT called for it, because
 * the library itself does not treat it as a sign-out. Everything else that
 * leaves us with no user — missing session, invalid/expired refresh token — is
 * a sign-out, and auth-js has already cleared local storage by the time we see
 * it.
 *
 * NOTE THIS IS NOT "BRANCHING ON A SERVER ERROR'S WORDING", which CLAUDE.md
 * forbids. We read `status` and the library's own `name`, which are structured
 * identity; we never match the message text, and the default for an
 * unrecognised shape is stated below rather than inferred.
 *
 * AND THE DEFAULT DIRECTION IS DELIBERATE: an unrecognised error resolves to
 * "signedOut", i.e. toward /login, which always offers a way forward. The
 * `unknown` dead end is reserved for the one shape we can positively identify
 * as transient. Guessing "transient" wrongly strands somebody on a page that
 * tells them to refresh forever; guessing "signed out" wrongly costs one
 * sign-in. Fail toward the recoverable mistake.
 */

// `email` rides along because it is part of the identity this call just read,
// and the alternative was every caller that wants it calling getUser() a second
// time — which is a second chance to get the three-outcome branch wrong. It is
// NULLABLE and a missing one is not a failed read: an account can legitimately
// hold no email, so callers fall back rather than refusing.
export type AuthRead =
  | { kind: "user"; userId: string; email: string | null }
  | { kind: "signedOut" }
  | { kind: "unknown" };

// Retryable = the connection, not the credential.
function isTransient(err: any): boolean {
  if (!err) return false;
  if (err.name === "AuthRetryableFetchError") return true;
  const s = Number(err.status);
  // status 0 is a dead connection; 5xx is their end. A 400/401/403 is an
  // answer about the credential and means signed out.
  return s === 0 || (s >= 500 && s <= 599);
}

export async function readAuthUser(): Promise<AuthRead> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (data?.user) return { kind: "user", userId: data.user.id, email: data.user.email ?? null };
    if (isTransient(error)) return { kind: "unknown" };
    return { kind: "signedOut" };
  } catch (e) {
    // getUser() normally resolves rather than throwing, so a throw here is the
    // genuinely unknown case — but see the default-direction note above: only
    // a positively transient shape earns the dead end.
    return isTransient(e) ? { kind: "unknown" } : { kind: "signedOut" };
  }
}
