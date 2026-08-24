// Referral-share prompt — asks a client to send their code to a friend at two
// peak-goodwill moments: their first-ever completed job, and (only if the
// code is still unused by then) the moment they rehire a past pro.
//
// Deliberately mirrors reviewPrompt.ts: a window CustomEvent the modal
// listens for, localStorage-deduped so each reason fires at most once ever,
// plus a shared cooldown and opt-out. Kept as a SEPARATE module (own keys,
// own event name) rather than folded into reviewPrompt.ts, so the two asks
// never fire off each other's cooldown by accident.

export type ReferralPromptReason = "job_done" | "rehire";

const LS = {
  optOut: "ff_referral_optout",
  lastShown: "ff_referral_last_shown",
  jobDoneAsked: "ff_referral_jobdone_asked",
  rehireAsked: "ff_referral_rehire_asked",
};

// Same 21-day don't-nag window the review prompt uses.
const COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000;

function ls(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function alreadyHandled(reason: ReferralPromptReason): boolean {
  const store = ls();
  if (!store) return false;
  if (store.getItem(LS.optOut) === "1") return true;
  const last = Number(store.getItem(LS.lastShown) || 0);
  if (last && Date.now() - last < COOLDOWN_MS) return true;
  if (reason === "job_done" && store.getItem(LS.jobDoneAsked) === "1") return true;
  if (reason === "rehire" && store.getItem(LS.rehireAsked) === "1") return true;
  return false;
}

function markHandled(reason: ReferralPromptReason) {
  const store = ls();
  if (!store) return;
  store.setItem(LS.lastShown, String(Date.now()));
  if (reason === "job_done") store.setItem(LS.jobDoneAsked, "1");
  if (reason === "rehire") store.setItem(LS.rehireAsked, "1");
}

export function referralPromptOptOut() {
  const store = ls();
  if (store) store.setItem(LS.optOut, "1");
}

/**
 * Ask a client to share their referral code. Fires a window CustomEvent the
 * modal listens for. No-ops if there's nothing to share (no code, or the
 * code is already `in_use`/`retired`), the user opted out, the cooldown is
 * active, or this exact reason already fired once.
 *
 * `codeStatus` is the real source of truth for "did they already use it" --
 * not a UI flag. If a friend applied the code between the job-done ask and
 * the rehire moment, codeStatus flips to `in_use`/`retired` and this
 * silently stops asking, which is exactly the "if they don't use it there,
 * then put it in when they rehire" fallback.
 */
export function requestReferralShare(
  reason: ReferralPromptReason,
  opts: { code: string | null | undefined; codeStatus: string | null | undefined; delayMs?: number },
) {
  if (typeof window === "undefined") return;
  if (!opts.code || opts.codeStatus !== "active") return;
  if (alreadyHandled(reason)) return;
  const fire = () => {
    if (alreadyHandled(reason)) return;
    markHandled(reason);
    window.dispatchEvent(new CustomEvent("ff:referral-share", { detail: { reason, code: opts.code } }));
  };
  const delay = opts.delayMs ?? 600;
  if (delay > 0) window.setTimeout(fire, delay); else fire();
}
