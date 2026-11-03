// ─────────────────────────────────────────────────────────────────────────────
// src/lib/jobStage.ts — the ONE browser-side answer to "is this job live?"
//
// WHY THIS FILE EXISTS. The list `["assigned","scheduled","in_progress",
// "pending_confirmation"]` was written out THREE times, in two files, always
// meaning the same thing: a job the client has awarded and that hasn't closed
// yet, which is exactly the window where the contract and the payment gate
// matter.
//
//   ClientDashboard     the "sign the agreement" attention row
//   ContractorDashboard the "send the agreement" attention row
//   ContractorDashboard the payout-lock row (added 2026-11-03)
//
// Three copies of a four-element list is three chances to add a lifecycle stage
// and update two of them. The failure is silent in the worst direction: a row
// that should fire doesn't, so nobody is told the thing blocking their money.
// Same lesson as `jobFullyFunded`, `photosMissing` and `chatReadOnly` — one
// implementation, mounted everywhere.
//
// This is browser-side DISPLAY AND GATING ONLY. It touches none of the four
// payout guards, and the server's own gate (`contract_ready`) is unchanged and
// authoritative; this only decides what to show and which control to offer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The awarded, not-yet-closed stages, in lifecycle order.
 *
 * `pending_confirmation` is IN the set on purpose: the work is done but the
 * money hasn't settled, so the agreement and the payout destination still
 * matter. `completed` and `cancelled` are out, and so is everything before
 * `assigned` — a request with no contractor on it has no payout question.
 */
export const LIVE_JOB_STAGES = ["assigned", "scheduled", "in_progress", "pending_confirmation"] as const;

/**
 * True when a job has been awarded to a contractor and hasn't closed.
 *
 * ⚠️ Reads FALSE for a row with no status rather than guessing. A missing
 * status means "I couldn't tell", and the callers use this to decide whether to
 * LOCK something — so the unknown case must fail open, not lock a pro out of a
 * conversation on the strength of a failed read.
 */
export function jobIsLive(j: any): boolean {
  return !!j?.status && (LIVE_JOB_STAGES as readonly string[]).includes(j.status);
}
