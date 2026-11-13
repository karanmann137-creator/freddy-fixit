// Module-level helpers shared by ClientDashboard.tsx and its tab components.
// Moved verbatim from src/pages/ClientDashboard.tsx on 2026-11-12.
import { type PillTone, type RowTone } from "@/components/ui";

/*
 * calcJobScore + VEHICLE_SERVICES were removed on 2026-08-28 along with the
 * "6/8 Good listing" chip they fed.
 *
 * The score was computed AFTER the request was already submitted, and the
 * dashboard offered no way to edit a description or add a location — so the
 * only actionable half of it was "add a photo", which RequestPhotoQuote
 * already prompts for directly underneath. What was left was a grade on
 * something the client can no longer change, sitting on the screen where they
 * are supposed to be choosing a contractor. If a listing-quality nudge comes
 * back it belongs on the REQUEST FORM, where the fields still exist.
 */

/**
 * `tone` was added 2026-10-30 so the status chips can render as the shared
 * <Pill>. `color` is kept because the switcher chips and a couple of inline
 * icons still read it directly; the pill reads `tone` only.
 *
 * ── Why in_progress is NOT accent, and matched is not blue ───────────────
 * The old chips were five different literal hexes, so every status on the page
 * shouted equally and none of them meant anything. The pill tones map to
 * MEANING, not to decoration, and the only two states that carry meaning here
 * are "settled" and "went wrong":
 *
 *   pending     → warn     we're still reviewing it; it is pending US
 *   matched     → neutral  a pro is attached. Nothing is on the client.
 *   in_progress → neutral  work is happening. Nothing is on the client either.
 *   completed   → good
 *   cancelled   → danger
 *
 * `in_progress` losing its orange is the deliberate, visible part. Orange is on
 * the same budget as the pass's state line — if the pass is already orange
 * because the client owes a balance, a second orange chip saying "Work In
 * Progress" spends a signal that was already spoken for, and if the pass is
 * NOT orange then the chip is claiming urgency the screen doesn't have. The
 * icon (link vs wrench) carries matched-vs-in_progress; it does not need colour
 * to do it. Don't promote either back to accent without a reason the client
 * would recognise as "this is on me".
 *
 * `matched`'s blue is dropped rather than re-homed because there is no blue in
 * the brand. There never was — the hex was ad-hoc.
 *
 * ── Why rowTone is a SECOND field and not derived from tone ──────────────
 * `RowTone` has no "danger" — a row is the frame around content, and a red
 * frame on a cancelled request states an error where there is only an ending.
 * So `cancelled` is `danger` as a pill (the word itself is the news) and
 * `neutral` as a row. Collapsing the two into one field would force that
 * disagreement to be resolved by whichever surface was written last.
 */
export const STATUS_META: Record<string, { icon: string; label: string; color: string; tone: PillTone; rowTone: RowTone }> = {
  pending:     { icon: "clock", label: "Pending Review",     color: "var(--ff-warn)", tone: "warn",    rowTone: "warn" },
  matched:     { icon: "link", label: "Contractor Matched", color: "var(--ff-info)", tone: "neutral", rowTone: "neutral" },
  in_progress: { icon: "wrench", label: "Work In Progress",   color: "var(--ff-c10)", tone: "neutral", rowTone: "neutral" },
  completed:   { icon: "check-circle", label: "Completed",          color: "var(--ff-success)", tone: "good",    rowTone: "good" },
  cancelled:   { icon: "x-circle", label: "Cancelled",          color: "var(--ff-danger)", tone: "danger",  rowTone: "neutral" },
};

// Can the client actually delete this request? `remove_client_request` is guarded
// server-side by `job_money_block()`, so on a paid job the button could only ever
// raise — and it was rendered on every request that wasn't already cancelled.
//
// A COMPLETED request is the sharp case and the reason this exists. The RPC's
// assigned branch skips completed jobs when it cancels them, but still writes
// `client_requests.status = 'cancelled'` — so on a finished job that was never
// charged, the button doesn't fail loudly, it quietly relabels a completed job in
// the client's own history as cancelled. Hiding it is the fix; the RPC is right to
// keep its guard.
//
// `job` is the loaded job for this request, or null where we don't have it (the
// history list). Status alone answers those rows.
export const canRemoveRequest = (r: any, job: any): boolean => {
  if (!r || r.status === "cancelled" || r.status === "completed") return false;
  if (!job) return true;
  if (["held", "released", "disputed", "processing"].includes(job.payment_status ?? "unpaid")) return false;
  if (job.is_milestone || job.prepayment_id) return false;
  return !["in_progress", "pending_confirmation", "completed"].includes(job.status);
};

/**
 * What a client can search their own requests by.
 *
 * The status LABEL is included rather than the raw enum, because "waiting on
 * estimates" is what the screen says and "pending" is what the column holds —
 * searching for the word you can see is the only behaviour that isn't a
 * surprise. The date is formatted for the same reason.
 *
 * Deliberately NO job code. The code is derived from the JOB's uuid, and this
 * dashboard only ever loads the job for the request currently selected, so a
 * code typed here could match at most one row and would silently miss every
 * other. Adding it would mean a job read per request on every load — a new
 * query for a search that is otherwise free. The contractor and admin
 * dashboards hold their jobs already, and match on the code there.
 */
export function reqSearchFields(r: any): (string | number | null | undefined)[] {
  return [
    r?.service_needed, r?.location, r?.preferred_schedule, r?.description,
    STATUS_META[r?.status]?.label ?? r?.status,
    r?.created_at ? new Date(r.created_at).toLocaleDateString() : null,
  ];
}

export type ClientTab = "requests" | "messages" | "pros" | "recurring" | "history" | "profile" | "settings";
