// Speed-to-lead helpers — format a contractor's median first-response time
// (from the contractor_response_stats RPC, in minutes).
//
// The scale STOPS at 24 hours, deliberately (2026-11-03). The badge used to
// read "about 3 days" on a bid card, which is a reason not to click rather
// than information — and the number is a median off a handful of samples, so
// the long tail was never trustworthy enough to publish. Past the ceiling the
// badge says "24+ hours": a slow pro reads as slow without the card quoting a
// precision it doesn't have.
//
// ONE ceiling, shared by both formatters, because they render the same stat —
// capping one alone would let the two disagree on the same contractor.
const RESP_CAP_HOURS = 24;

/** Hours, rounded up, clamped to the published ceiling. Returns the cap and whether we hit it. */
function respHours(mins: number): { h: number; capped: boolean } {
  const h = Math.ceil(mins / 60);
  return h > RESP_CAP_HOURS ? { h: RESP_CAP_HOURS, capped: true } : { h, capped: false };
}

export function respText(mins: number): string {
  if (mins < 60) return "under an hour";
  const { h, capped } = respHours(mins);
  if (capped) return h + "+ hours";
  return "about " + h + (h === 1 ? " hour" : " hours");
}

export function respShort(mins: number): string {
  if (mins < 60) return "<1h";
  const { h, capped } = respHours(mins);
  return capped ? h + "h+" : "~" + h + "h";
}
