// ─────────────────────────────────────────────────────────────────────────────
// src/lib/jobFunding.ts — the ONE browser-side answer to "has this job been
// paid for in full, and if not, how much is outstanding?"
//
// WHY THIS FILE EXISTS. Until 2026-10-30 that question had THREE separate
// implementations and they did not agree:
//
//   ClientDashboard.jobFullyFunded   jobBalance(j) <= 0.005, where jobBalance
//                                    fell back to amount * (1 + feeRate) when
//                                    total_charged was null
//   JobTimeline (inline)             funded_amount >= total_charged - 0.01
//   ContractorDashboard.jobBalanceDue  total_charged - funded_amount, clamped
//
// Three columns' worth of disagreement, two different epsilons, and — the part
// that actually mattered — all three treated a NULL `total_charged` as ZERO,
// so a job that had not been charged yet read as FULLY FUNDED. That is the
// looser direction on a money predicate, which CLAUDE.md forbids outright:
// browser-side money predicates are deliberately stricter than the server and
// are widened TOWARD it, never past it.
//
// ── The server is the spec, and this file mirrors it exactly ──────────────
// `jobs.fully_funded` is a GENERATED STORED column:
//
//     total_charged is not null and funded_amount >= total_charged - 0.01
//
// `jobFullyFunded` below is that expression, including the `is not null`
// clause the three old copies all dropped. So the browser no longer disagrees
// with the server in EITHER direction — not looser (the null case now reads
// false, as the server reads it) and not stricter (the epsilon is the server's
// 0.01, not the old 0.005).
//
// The old 0.005 was "stricter", which sounds safer and was not: it could claim
// a half-cent balance the server considers settled, and a Pay Balance button
// for $0.004 is a control that can never succeed — worse than no control.
//
// ── What this file is NOT ────────────────────────────────────────────────
// It is NOT a pre-checkout estimate. Before a job is charged `total_charged`
// is null by design, and the client still has to be shown "due now / due when
// the work is done" — that arithmetic needs the live fee and deposit rates and
// stays in ClientDashboard (`jobTotal`, `jobDueNow`, `jobBalance`), which is a
// genuinely different question from "what is outstanding on a charged job".
// Do not collapse the two; the distinction is the reason the null case is
// answerable at all.
//
// ── Guards ───────────────────────────────────────────────────────────────
// This is browser-side DISPLAY AND GATING ONLY. It touches NONE of the four
// payout guards, all four of which are server-side and unchanged:
//   1. confirm_job_completion()      (Postgres)
//   2. auto_confirm_stale_jobs()     (Postgres)
//   3. release-payment               (edge, 409 on !fully_funded)
//   4. reconcile-payouts             (edge, .eq("fully_funded", true))
// No migration, no RPC, no edge function is touched by this change. Nothing
// here can move `funded_amount`, and nothing here authorises a transfer — the
// browser cannot; it can only decide what to show and which button to dim.
// ─────────────────────────────────────────────────────────────────────────────

/** Round to cents the same way every other money path in the app does. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The server's epsilon, from the generated column. Do not localise it. */
export const FUNDING_EPSILON = 0.01;

/**
 * True when the job has received everything owed on it.
 *
 * Prefers `jobs.fully_funded` — the generated column IS the truth, and a
 * `select("*")` on jobs always carries it, so this is the path that actually
 * runs. The fallback exists only for a row selected with an explicit column
 * list that omitted it, and mirrors the column's own expression.
 *
 * ⚠️ A row that does not carry enough information to answer reads FALSE, not
 * true. "I cannot tell" and "yes" are different answers, and on a payout
 * question the difference is the whole platform's money.
 */
export function jobFullyFunded(j: any): boolean {
  if (typeof j?.fully_funded === "boolean") return j.fully_funded;
  if (j?.total_charged == null) return false;
  return Number(j.funded_amount ?? 0) >= Number(j.total_charged) - FUNDING_EPSILON;
}

/**
 * What is still outstanding on a CHARGED job, in dollars. 0 when nothing is
 * owed and 0 when the answer is unknowable — a job with no `total_charged` has
 * not been charged yet, so there is no balance to chase, only an estimate, and
 * the estimate is not this function's job (see the header).
 *
 * Read alongside `jobFullyFunded`, never instead of it: a job can be fully
 * funded with a sub-cent residue, and this returning 0.004 is not a balance.
 * Gate on the predicate; show the number.
 */
export function jobBalanceDue(j: any): number {
  if (jobFullyFunded(j)) return 0;
  if (j?.total_charged == null) return 0;
  return Math.max(r2(Number(j.total_charged) - Number(j.funded_amount ?? 0)), 0);
}

/**
 * True when a job is sitting at `held` with money still outstanding — the
 * state where the client owes a balance and the contractor cannot be paid.
 *
 * Milestone jobs are excluded BY CONSTRUCTION, not by preference: stage money
 * lives on `job_milestones` and never increments `funded_amount`, so
 * `fully_funded` is false for every milestone job and this would fire on all
 * of them forever.
 *
 * ⚠️ The last clause is `jobBalanceDue(j) > 0`, NOT just `!jobFullyFunded(j)`,
 * and dropping it is a real bug rather than a simplification. Both call sites
 * render the dollar figure inside the sentence this predicate gates — "the
 * client still owes $X" — so a job that is not fully funded but whose balance
 * is UNKNOWABLE (a `held` row with a null `total_charged`) would print "still
 * owes $0.00". CLAUDE.md: an explanatory note is keyed on the thing it claims.
 * This one claims an amount, so it waits for an amount.
 *
 * That clause is also exactly the old `> 0.005` test it replaces: jobBalanceDue
 * rounds to cents, so its only possible values are 0, 0.01, 0.02 … and there is
 * nothing in the half-open gap for the two tests to disagree about.
 */
export function jobAwaitingBalance(j: any): boolean {
  return j?.payment_status === "held" && !j?.is_milestone && jobBalanceDue(j) > 0;
}
