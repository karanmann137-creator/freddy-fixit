// One place that turns an apply_referral_code refusal into plain English, and
// one place that applies a code during signup.
//
// The reason→English map used to live inline in ClientDashboard, and BOTH signup
// call sites (ClientOnboarding, AuthCallback) called the RPC fire-and-forget and
// threw the reason away. So a code that is perfectly real but retired or on hold
// failed silently at precisely the moment somebody was most likely to have typed
// it — during signup, off a code a friend read out to them.
//
// It lives here rather than being pasted a third time because that is exactly
// how `upsertMeta` ended up byte-identical across six SEO routes: a copy drifts
// without ever throwing an error, and you find out weeks later.

import { supabase } from "@/lib/supabase";

/** The code itself, stashed so it survives the email-confirmation hop. */
export const REF_CODE_KEY  = "ff_ref_code";
/** Why the last attempt was refused. Read once, by the dashboard. */
export const REF_ERROR_KEY = "ff_ref_error";

/**
 * Plain English for every reason `apply_referral_code` can return.
 *
 * `code_retired` and `code_in_use` are worded to say WHICH WAY the code is
 * unavailable. "Invalid code" would send someone hunting for a typo in a code
 * that is real, and make their friend look like they made it up.
 */
export function referralReasonText(reason: string): string {
  switch (reason) {
    case "self":             return "That's your own code — send it to a friend instead.";
    case "already_referred": return "This account has already used a referral code.";
    case "empty":            return "Enter a code first.";
    case "code_retired":     return "That code has already been used by a friend — each code is good for one person.";
    case "code_in_use":      return "Someone else is already using that code. If they don't book within 30 days it frees up, so it's worth asking your friend again later.";
    default:                 return "We don't recognise that code. Check it and try again.";
  }
}

/** localStorage can throw (private mode, disabled storage). Never let it. */
export function stashReferralCode(code: string): void {
  const c = (code || "").trim().toUpperCase();
  if (!c) return;
  try { localStorage.setItem(REF_CODE_KEY, c); } catch {}
}

export function stashedReferralCode(): string {
  try { return localStorage.getItem(REF_CODE_KEY) || ""; } catch { return ""; }
}

/** Read-and-clear. The message is shown once, next to the box that retries it. */
export function takeReferralError(): string {
  try {
    const v = localStorage.getItem(REF_ERROR_KEY);
    if (v) localStorage.removeItem(REF_ERROR_KEY);
    return v || "";
  } catch { return ""; }
}

/**
 * Apply a code during signup. Returns nothing and can never throw: this runs
 * inside account creation, and a referral code is never worth a signup.
 *
 * A refusal is stashed rather than shown, because neither caller has anywhere
 * to show it — ClientOnboarding is mid-submit and AuthCallback is a redirect
 * page with no UI. ClientDashboard reads the stash on its next load and prints
 * it directly above the manual entry box, so the explanation and the second
 * chance arrive together.
 *
 * An RPC/network error is OUR failure, not a bad code, so the code stays
 * stashed for the next sign-in to retry and nothing is said. A real refusal
 * clears the code: leaving it would re-fire the same message on every sign-in.
 */
export async function applyReferralAtSignup(code: string): Promise<void> {
  const c = (code || "").trim().toUpperCase();
  if (!c) return;
  try {
    const { data, error } = await supabase.rpc("apply_referral_code", { p_code: c });
    if (error) return;
    if ((data as any)?.ok !== true) {
      try { localStorage.setItem(REF_ERROR_KEY, referralReasonText(String((data as any)?.reason ?? ""))); } catch {}
    }
  } catch { return; }
  try { localStorage.removeItem(REF_CODE_KEY); } catch {}
}
