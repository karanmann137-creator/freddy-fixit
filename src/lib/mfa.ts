// Two-step sign-in (email OTP) — shared types and copy.
//
// This file exists so the reason→English map has exactly ONE copy. Two surfaces
// call the same RPCs (the Settings panel and the sign-in page), and a pasted
// second copy is how `upsertMeta` ended up byte-identical across six SEO routes
// and then drifted with nothing to show for it. A refusal message that is wrong
// on one surface and right on the other is the kind of bug nobody reports.

export type MfaStatus = {
  enabled: boolean;
  enrolled: boolean;
  recovery_left: number;
  recovery_used?: number;
  last_verified_at?: string | null;
  /** True when no code is currently owed — also true for anyone not enrolled. */
  verified_recently: boolean;
};

/**
 * Every `{ok:false, reason}` the mfa_* RPCs can return, in plain English.
 *
 * `left` is `attempts_left` from mfa_verify, which is only present on
 * `wrong_code`. The default is deliberately vague rather than echoing a raw
 * reason string: an unmapped code means we added one server-side and forgot
 * here, and a user should never be shown our internal vocabulary.
 */
export function mfaReason(r?: string, left?: number): string {
  switch (r) {
    case "rate_limited":      return "Too many codes requested. Wait an hour, or use a recovery code.";
    case "send_failed":       return "We couldn't send the email just now. Try again in a minute.";
    case "no_code":           return "That code has already been used. Send a new one.";
    case "expired":           return "That code expired. Send a new one.";
    case "too_many_attempts": return "Too many wrong tries. Send a new code.";
    case "wrong_code":        return typeof left === "number"
      ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
      : "That code isn't right.";
    case "empty":             return "Enter the code from your email.";
    case "verify_first":      return "Enter a code first, then you can turn it off.";
    case "not_enrolled":      return "Two-step sign-in isn't on for this account.";
    case "no_email":          return "We don't have an email address for this account. Contact hello@freddyfixit.ca.";
    case "not_signed_in":     return "You've been signed out. Sign in again.";
    default:                  return "That didn't work. Try again.";
  }
}
