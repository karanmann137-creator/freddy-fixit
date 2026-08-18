// Where each notification actually lives.
//
// Every 🔔 in the app is a button, but until now every one of them dropped the
// user on the dashboard root and left them to hunt for whatever it was talking
// about. This maps a notification's `type` to the exact tab (and, when we know
// it, the exact job) so tapping one lands on the thing it mentions.
//
// The type list is the full set emitted by the DB functions (_notify /
// notify_user) plus the ones written by edge functions. Anything not listed
// falls back to the dashboard root — the old behaviour — so a new notification
// type can never break navigation.

export type DashRole = "contractor" | "client" | "admin";

export type NoteTarget = {
  /** Page to land on — usually the viewer's dashboard. */
  path: string;
  /** Dashboard tab to open, if the destination is a dashboard. */
  tab?: string;
  /** Job to expand and scroll to, when the notification carries one. */
  jobId?: string;
};

export function roleFromDashboardPath(dashboardPath: string): DashRole {
  if (dashboardPath.includes("contractor")) return "contractor";
  if (dashboardPath.includes("admin")) return "admin";
  return "client";
}

// Notifications that open a dedicated page instead of a dashboard tab.
const PAGE_BY_TYPE: Record<string, string> = {
  contractor_guide: "/contractor-guide",
};

// Contractor dashboard: jobs | available | calendar | earnings | reviews | profile
const CONTRACTOR_TAB: Record<string, string> = {
  // Work to go and win.
  job_in_field:      "available",
  rehire_request:    "available",
  recurring_reserved: "available",
  job_still_open:    "available",
  bid_declined:      "available",
  job_reopened:      "available",
  // Bid-stage chat: the thread hangs off a request, not a job, so it lives on
  // the Available Jobs card rather than the Messages inbox (which is per-job).
  bid_message:       "available",

  // Work already theirs.
  bid_accepted:          "jobs",
  job_assigned:          "jobs",
  schedule_confirmed:    "jobs",
  schedule_proposed:     "jobs",
  reschedule_requested:  "jobs",
  reschedule_accepted:   "jobs",
  visit_confirmed:       "jobs",
  visit_tomorrow:        "jobs",
  estimate_owed:         "jobs",
  proposal_waiting:      "jobs",
  price_change_waiting:  "jobs",
  price_change_declined: "jobs",
  completion_pending:    "jobs",
  walkthrough_approved:  "jobs",
  walkthrough_declined:  "jobs",
  dispute_opened:        "jobs",
  dispute_response:      "jobs",
  milestone_completed:   "jobs",
  milestone_disputed:    "jobs",
  milestone_schedule_approved: "jobs",
  contract_signature:    "jobs",
  visit_reminder:        "jobs",
  chat_time_proposed:    "jobs",
  chat_time_agreed:      "jobs",
  // The booked time was released because the job wasn't signed and paid in
  // time — the job is back to "needs a time", which lives on the jobs tab.
  visit_slot_released:   "jobs",

  // Money and reputation.
  job_confirmed:   "earnings",
  review_received: "reviews",

  // Account setup.
  application_approved: "profile",
  vetting_reminder:     "profile",
};

// Client dashboard: requests | pros | recurring | history | profile | settings
const CLIENT_TAB: Record<string, string> = {
  bid_received:        "requests",
  bids_waiting:        "requests",
  // A pro replied to a pre-hire question — the thread opens off the bid row.
  bid_message:         "requests",
  no_quotes_alert:     "requests",
  job_assigned:        "requests",
  schedule_proposed:   "requests",
  schedule_confirmed:  "requests",
  reschedule_accepted: "requests",
  on_my_way:           "requests",
  completion_pending:  "requests",
  price_change:        "requests",
  walkthrough_proposed: "requests",
  walkthrough_done:    "requests",
  milestone_completed: "requests",
  milestone_disputed:  "requests",
  dispute_response:    "requests",
  dispute_opened:      "requests",
  // The agreement lives on the job card, and the card lives under Requests.
  contract_signature:  "requests",
  visit_reminder:      "requests",
  chat_time_proposed:  "requests",
  chat_time_agreed:    "requests",
  visit_slot_released: "requests",
  seasonal:            "requests",
  recurring_due:       "requests",

  recurring_generated: "recurring",

  // Finished work has moved out of the active list by the time these land.
  job_confirmed:  "history",
  review_received: "history",
};

// Admin dashboard: health | requests | jobs | accounts | disputes | prepaid | leads
const ADMIN_TAB: Record<string, string> = {
  health_alert:       "health",
  dispute_opened:     "disputes",
  dispute_response:   "disputes",
  milestone_disputed: "disputes",
  bid_received:       "requests",
  job_in_field:       "requests",
  job_confirmed:      "jobs",
  completion_pending: "jobs",
};

const TAB_BY_ROLE: Record<DashRole, Record<string, string>> = {
  contractor: CONTRACTOR_TAB,
  client:     CLIENT_TAB,
  admin:      ADMIN_TAB,
};

/**
 * Resolve a notification to the place it's talking about.
 * Unknown types resolve to the dashboard root, which is what happened before.
 */
export function noteTarget(
  type: string | null,
  jobId: string | null,
  dashboardPath: string,
): NoteTarget {
  const t = type ?? "";
  const page = PAGE_BY_TYPE[t];
  if (page) return { path: page };

  const tab = TAB_BY_ROLE[roleFromDashboardPath(dashboardPath)][t];
  return { path: dashboardPath, tab, jobId: jobId ?? undefined };
}

/** The same target as a URL, for when we have to navigate across pages. */
export function targetToUrl(target: NoteTarget): string {
  const qs = new URLSearchParams();
  if (target.tab) qs.set("tab", target.tab);
  if (target.jobId) qs.set("job", target.jobId);
  const q = qs.toString();
  return q ? target.path + "?" + q : target.path;
}

/**
 * Fired when a notification is tapped while the user is already on the page it
 * points at. Wouter treats same-path navigation as a no-op, so the dashboards
 * listen for this instead of watching the query string.
 */
export const DASH_NAV_EVENT = "ff:dash-nav";

export type DashNavDetail = { tab?: string; jobId?: string };

/** Read a tab/job deep link off the current URL (used on first load). */
export function readDashNavFromUrl(): DashNavDetail {
  try {
    const q = new URLSearchParams(window.location.search);
    return { tab: q.get("tab") ?? undefined, jobId: q.get("job") ?? undefined };
  } catch {
    return {};
  }
}

/**
 * Drop the deep-link params once they've been applied, so a later refresh or
 * a manual tab change doesn't get yanked back to where the notification went.
 */
export function clearDashNavFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tab") && !url.searchParams.has("job")) return;
    url.searchParams.delete("tab");
    url.searchParams.delete("job");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {}
}
