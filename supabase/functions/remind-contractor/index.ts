import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// DECOMMISSIONED 2026-08-23. Returns 410 Gone; holds no secrets and sends nothing.
//
// v8 of this function emailed a contractor a "upload your documents" nudge from
// a contractor_id supplied in the request body, with verify_jwt=false — so
// anyone could make our sending domain nag any contractor they could name. It
// had no callers, and its copy was stale on top of that: it said "Step 6 of
// your profile" when contractor onboarding has been five steps since
// 2026-08-19.
//
// The live equivalent is the profile-gap nudge on the contractor dashboard
// (contractorGaps / ContractorProfileCompletion), which is in-app and needs no
// email at all. Documents are optional at signup by design; admin approval is
// what gates jobs.
//
// If a future DB->edge call needs to send mail, use the internal-token
// primitive: issue_internal_token('edge-internal') in Postgres, send it as the
// x-ff-internal header, and redeem it with consume_internal_token through the
// function's service-role client. Resolve the recipient from the database,
// never from the request body.

serve(() =>
  new Response(JSON.stringify({ status: "gone" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
