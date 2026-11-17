import { supabase } from "@/lib/supabase";

// terms — ONE answer to "has this account accepted the terms that are currently
// published, and if not, how do we ask?".
//
// WHY THIS EXISTS. Until 2026-11-16 the acceptance checkbox in every signup flow
// was a `useState(false)` validated in the browser and then thrown away. The
// platform could not answer "prove this person agreed, and to which version",
// which is the question UA §12 (14-day amendment notice) and PIPA both
// eventually ask. The third-party disclosure shipped 2026-11-16 is the first
// amendment that materially changes the terms, so the record starts there.
// `supabase/migrations/20261116_terms_acceptance.sql` holds the server half and
// the reasoning for the table shape.
//
// THE BROWSER NEVER SUPPLIES THE VERSION. `accept_terms(p_surface)` takes no
// version — it stamps `current_terms_version()` server-side — so a tampered
// client cannot claim to have accepted a version that was never published, nor
// pre-accept a future one. `p_surface` is a label for WHERE the acceptance
// happened and is descriptive only; nothing may ever read it as a permission.
//
// ⚠️ THIS GATE FAILS **OPEN**, DELIBERATELY, AND THAT IS NOT THE USUAL RULE.
// Everywhere else on this platform an unreadable answer is a refusal — the
// contract gate returns 428 on any check error, and `getMyProfile` reports
// `ok:false` rather than an empty result. Here the asymmetry runs the other
// way, and it is the same reasoning that keeps the address confirmation a
// frontend-only gate: the worst case of failing OPEN is one session's worth of
// activity under the previous terms, which is recoverable and which every
// platform on earth lives with; the worst case of failing CLOSED is that a
// Supabase blip makes the whole platform unusable for everybody at once. A
// fail-closed payment gate has already taken every job on this platform
// unpayable twice. Do not "harden" this into a refusal.
//
// WHAT IS SAFE TO CACHE. Only "which version did this account accept", which
// for a signed-in session changes exactly once — when they accept. The promise
// is cached rather than the value, for the same reason `myProfile` does it: the
// first consequential action on a dashboard can fire several reads at once. A
// FAILED read is never cached, so a blip costs one session one unasked
// question rather than a whole session of wrong answers. In memory only, never
// localStorage: a cached "already accepted" that outlives a sign-out on a
// shared computer would answer for the next person to use the browser.

export type TermsStatus = {
  ok: boolean;                     // false = the read failed; `needed` is then meaningless
  version: string | null;          // what is currently published, e.g. "2026-11-16"
  acceptedVersion: string | null;  // what this account last accepted
  needed: boolean;                 // true = an acceptance is owed
};

/** The read failed. `needed` is false so every caller fails OPEN — see the header. */
const UNKNOWN: TermsStatus = { ok: false, version: null, acceptedVersion: null, needed: false };

const EVENT = "ff:terms-gate";

let cachedUid: string | null = null;
let inflight: Promise<TermsStatus> | null = null;
let cached: TermsStatus | null = null;

/** Drop everything. Called on any auth transition, and after an acceptance lands. */
export function clearTermsStatus() {
  cachedUid = null;
  inflight = null;
  cached = null;
}

/**
 * What does this account owe? Resolves the session first, so a signed-out
 * visitor gets `needed:false` without a round-trip — nobody who isn't signed in
 * can accept anything, and the server agrees (`terms_status()` tests
 * `auth.uid() is null` first and returns `needed:false`).
 */
export async function termsStatus(): Promise<TermsStatus> {
  let uid: string | null = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    uid = session?.user?.id ?? null;
  } catch {
    return UNKNOWN; // couldn't resolve the session — fail open
  }
  if (!uid) return { ok: true, version: null, acceptedVersion: null, needed: false };

  if (cachedUid !== uid) clearTermsStatus();
  if (cached) return cached;
  if (inflight) return inflight;

  cachedUid = uid;
  inflight = (async (): Promise<TermsStatus> => {
    const { data, error } = await supabase.rpc("terms_status");
    if (error || !data || typeof data !== "object") {
      clearTermsStatus(); // never cache a failure
      return UNKNOWN;
    }
    const d = data as Record<string, unknown>;
    const val: TermsStatus = {
      ok: true,
      version: typeof d.version === "string" ? d.version : null,
      acceptedVersion: typeof d.accepted_version === "string" ? d.accepted_version : null,
      needed: d.needed === true,
    };
    if (cachedUid === uid) { cached = val; inflight = null; }
    return val;
  })();

  return inflight;
}

/**
 * Record an acceptance. Returns false when the write could not be confirmed —
 * callers must NOT report success on a false, because the only thing this
 * function exists to produce is evidence.
 *
 * Re-accepting the same version is idempotent server-side (`on conflict do
 * nothing` against a unique index on `(user_id, version)`), so a double-tap
 * cannot fail and cannot create a second row.
 *
 * @param surface where it happened — 'signup-client', 'signup-contractor',
 *        'new-request', 'bid', 'pay', 'sign-contract', 'reaccept'.
 */
export async function acceptTerms(surface: string): Promise<boolean> {
  const { error } = await supabase.rpc("accept_terms", { p_surface: surface });
  if (error) return false;
  clearTermsStatus(); // the next reader must see the new acceptance
  return true;
}

// ── surviving the email-confirmation detour ────────────────────────────────
//
// `accept_terms()` needs `auth.uid()`, and a signup in email-confirmation mode
// has NO SESSION yet (`ClientOnboarding` returns early on `!authData.session`).
// So the tick has to survive the hop and be redeemed after they click the link,
// exactly as a typed referral code does — `stashReferralCode` is the pattern.
//
// ⚠️ `AuthCallback` MUST NOT RECORD UNCONDITIONALLY. It also runs for Google
// sign-ins, where no checkbox was ever shown; recording there would be forging
// consent nobody gave. It records ONLY what this stash says was actually
// ticked, which is why the surface is stored alongside it.
//
// The expiry exists because the stash is the weakest link in the chain: it is
// per-browser, so a confirmation link opened on a different device loses it.
// That is not a bug — the person then meets the blocking gate at their first
// consequential action, which is the designed fallback. An old stash, though,
// would record a fresh acceptance for a tick from weeks ago, so it is dropped.

const PENDING_KEY = "ff_terms_pending";
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Remember that a checkbox was ticked, for redemption after email confirmation. */
export function stashTermsConsent(surface: string): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ surface, at: Date.now() }));
  } catch { /* storage can be unavailable (private mode); best effort */ }
}

export function clearStashedTermsConsent(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* see above */ }
}

/**
 * Record a stashed acceptance, if there is one and it hasn't gone stale.
 * Safe to call on every auth callback: with no stash it does nothing at all.
 * Cleared on success AND on expiry; left in place on a failed write so the next
 * callback can retry rather than losing evidence to a blip.
 */
export async function redeemStashedTermsConsent(): Promise<void> {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PENDING_KEY); } catch { return; }
  if (!raw) return;
  let surface = "signup";
  try {
    const d = JSON.parse(raw) as { surface?: unknown; at?: unknown };
    if (typeof d.at !== "number" || Date.now() - d.at > PENDING_TTL_MS) { clearStashedTermsConsent(); return; }
    if (typeof d.surface === "string" && d.surface) surface = d.surface;
  } catch { clearStashedTermsConsent(); return; }
  if (await acceptTerms(surface)) clearStashedTermsConsent();
}

// ── the blocking gate ──────────────────────────────────────────────────────
//
// ⚠️ A GATE WITH NO SHEET MOUNTED MUST FAIL OPEN, NOT HANG. `askConfirm` is
// the cautionary tale here: it only ever settles when `<ConfirmDialog/>`
// closes, so a page that builds the helper and forgets the mount hangs its
// button forever with no error anywhere. This gate refuses to inherit that.
// `<TermsSheet/>` registers itself on mount; with nothing listening,
// `ensureTermsAccepted` returns true immediately and the action proceeds.
//
// That makes a dropped mount SILENT, which is exactly the membership rule for
// `tools/check_mounts.py` — its absence is invisible at runtime. The mount is
// guarded there. Do not remove it from that table.

let sheetMounted = 0;

/** Called by `<TermsSheet/>` only. Counted, not boolean, so a remount during a
 *  React StrictMode double-invoke can't leave the gate thinking it is alone. */
export function termsSheetMounted(on: boolean) {
  sheetMounted = Math.max(0, sheetMounted + (on ? 1 : -1));
}

/**
 * Ask before a consequential action. Resolves true when the caller may
 * proceed — either because nothing was owed, or because they just accepted.
 * Resolves false ONLY when the person was asked and chose not to accept, in
 * which case the caller abandons the action quietly: they have already seen
 * the sheet, so an error message on top of it would be noise.
 *
 * Call it AFTER the action's own validation, so somebody who is going to be
 * told "enter your bid amount" isn't handed a terms sheet first.
 */
export function ensureTermsAccepted(surface: string): Promise<boolean> {
  return (async () => {
    const st = await termsStatus();
    if (!st.needed) return true;          // includes every failed read — fail open
    if (sheetMounted < 1) return true;    // no sheet to ask with — fail open
    return new Promise<boolean>(resolve => {
      window.dispatchEvent(new CustomEvent(EVENT, {
        detail: { surface, version: st.version, resolve },
      }));
    });
  })();
}

export const TERMS_GATE_EVENT = EVENT;

// Any auth transition invalidates the cache. A synchronous assignment only —
// the auth-lock deadlock rule forbids querying inside this callback.
supabase.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id ?? null;
  if (uid !== cachedUid) clearTermsStatus();
});
