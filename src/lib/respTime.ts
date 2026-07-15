// Speed-to-lead helpers — format a contractor's median first-response time
// (from the contractor_response_stats RPC, in minutes).
export function respText(mins: number): string {
  if (mins < 60) return "under an hour";
  const h = Math.ceil(mins / 60);
  if (h <= 48) return "about " + h + (h === 1 ? " hour" : " hours");
  return "about " + Math.ceil(h / 24) + " days";
}

export function respShort(mins: number): string {
  if (mins < 60) return "<1h";
  const h = Math.ceil(mins / 60);
  if (h <= 48) return "~" + h + "h";
  return "~" + Math.ceil(h / 24) + "d";
}
