/**
 * The one ask that fires when a client confirms a finished job.
 *
 * It used to be an either/or: the FIRST completed job got the referral-share
 * modal, every completion after it got the Google-review modal, and the comment
 * at that call site said plainly why — "stacking two 'please help us' prompts on
 * the same click would hurt both". That reasoning was right about the stacking
 * and wrong about the remedy. Two full-screen overlays on one click is bad; two
 * asks in ONE modal is just a complete sentence, and it is the sentence the
 * owner asked for: "Loved the service? Rate us on Google and give your friends a
 * discount." The review comes first because it is the ask that helps a
 * brand-new local business most, and because it costs the client nothing.
 *
 * So this module fires a SINGLE event carrying both halves, and
 * `CompletionThanksModal` renders whichever halves are live.
 *
 * IT OWNS NO STATE OF ITS OWN. Every "have we already asked, is the cooldown
 * up, did they opt out" question is answered by `reviewPrompt.ts` and
 * `referralPrompt.ts` through the predicates they export. A third set of
 * localStorage keys here would drift out of step with the two opt-outs that
 * already exist, and the way that failure surfaces is a client who pressed
 * "Don't ask again" being asked again — which is worse than never asking.
 *
 * The two halves are marked INDEPENDENTLY, so a review that could not be shown
 * (URL not ready, still inside its 21-day cooldown) does not burn its own
 * cooldown just because the referral half went out beside it.
 *
 * The other three moments are untouched and still use the standalone modals:
 * `signup` and `job_posted` ask for a review only, and `rehire` asks for a
 * referral only. This is deliberately the completion moment alone.
 */

import { reviewAskAllowed, markReviewAsked } from "@/lib/reviewPrompt";
import { referralAskAllowed, markReferralAsked } from "@/lib/referralPrompt";

export type CompletionThanks = { review: boolean; code: string | null };

export function requestCompletionThanks(opts: {
  jobId?: string;
  code?: string | null;
  codeStatus?: string | null;
  delayMs?: number;
}) {
  if (typeof window === "undefined") return;

  // `codeStatus` is the real source of truth for "is there anything to share",
  // not a UI flag: a code that a friend already holds (`in_use`) or has already
  // spent (`retired`) must never be offered, because sharing it is a dead end
  // the sharer cannot see.
  const shareable = () => !!opts.code && opts.codeStatus === "active" && referralAskAllowed("job_done");

  if (!reviewAskAllowed("job_done", opts.jobId) && !shareable()) return;

  const fire = () => {
    // Re-tested at fire time, exactly as both underlying prompts do — the delay
    // below means another surface could have asked in between.
    const wantReview = reviewAskAllowed("job_done", opts.jobId);
    const wantReferral = shareable();
    if (!wantReview && !wantReferral) return;
    if (wantReview) markReviewAsked("job_done", opts.jobId);
    if (wantReferral) markReferralAsked("job_done");
    window.dispatchEvent(new CustomEvent("ff:completion-thanks", {
      detail: { review: wantReview, code: wantReferral ? opts.code : null } as CompletionThanks,
    }));
  };

  const delay = opts.delayMs ?? 600;
  if (delay > 0) window.setTimeout(fire, delay); else fire();
}
