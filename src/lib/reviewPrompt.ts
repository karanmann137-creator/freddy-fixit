// Google review prompt — triggers a brand modal at three moments:
// account created, job posted, and a job marked done.
//
// HOW TO TURN IT ON: paste the platform's Google Business Profile review link
// below (looks like https://g.page/r/XXXXXXXX/review or a Place-ID review URL).
// While it stays the placeholder, the popup never shows.
export const GOOGLE_REVIEW_URL = "https://g.page/r/CYvpOy2pJh_YEAI/review";

export function reviewUrlReady(): boolean {
  return /^https?:\/\//.test(GOOGLE_REVIEW_URL) && !GOOGLE_REVIEW_URL.includes("REPLACE_WITH");
}

export type ReviewReason = "signup" | "job_posted" | "job_done";

const LS = {
  optOut: "ff_review_optout",
  lastShown: "ff_review_last_shown",
  signupAsked: "ff_review_signup_asked",
  postAsked: "ff_review_post_asked",
  jobDonePrefix: "ff_review_jobdone_",
};

// don't nag: once they've seen any prompt, wait ~21 days before another.
const COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000;

function ls(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function alreadyHandled(reason: ReviewReason, jobId?: string): boolean {
  const store = ls();
  if (!store) return false;
  if (store.getItem(LS.optOut) === "1") return true;
  const last = Number(store.getItem(LS.lastShown) || 0);
  if (last && Date.now() - last < COOLDOWN_MS) return true;
  if (reason === "signup" && store.getItem(LS.signupAsked) === "1") return true;
  if (reason === "job_posted" && store.getItem(LS.postAsked) === "1") return true;
  if (reason === "job_done" && jobId && store.getItem(LS.jobDonePrefix + jobId) === "1") return true;
  return false;
}

function markHandled(reason: ReviewReason, jobId?: string) {
  const store = ls();
  if (!store) return;
  store.setItem(LS.lastShown, String(Date.now()));
  if (reason === "signup") store.setItem(LS.signupAsked, "1");
  if (reason === "job_posted") store.setItem(LS.postAsked, "1");
  if (reason === "job_done" && jobId) store.setItem(LS.jobDonePrefix + jobId, "1");
}

export function reviewOptOut() {
  const store = ls();
  if (store) store.setItem(LS.optOut, "1");
}

/**
 * Ask for a Google review. Fires a window CustomEvent the modal listens for.
 * No-ops if the URL is still a placeholder, the user opted out, the cooldown
 * is active, or this exact reason/job was already prompted.
 */
export function requestGoogleReview(reason: ReviewReason, opts?: { jobId?: string; delayMs?: number }) {
  if (typeof window === "undefined") return;
  if (!reviewUrlReady()) return;
  if (alreadyHandled(reason, opts?.jobId)) return;
  const fire = () => {
    if (alreadyHandled(reason, opts?.jobId)) return;
    markHandled(reason, opts?.jobId);
    window.dispatchEvent(new CustomEvent("ff:google-review", { detail: { reason } }));
  };
  const delay = opts?.delayMs ?? 600;
  if (delay > 0) window.setTimeout(fire, delay); else fire();
}
