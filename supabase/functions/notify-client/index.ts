// RETIRED 2026-08-14.
//
// This function used to accept { event, job_id } with NO authentication
// (verify_jwt=false, no in-code caller check), load the job with the service
// role, email the client, and then return that client's email address in the
// response body. Any contractor holding a job id could read the client's email
// and make mail go out from noreply@freddyfixit.ca -- which defeats the chat
// guard, the off-platform-poaching rule and the commission.
//
// Both DB callers were removed in migration `kill_notify_client_leak`:
//   * trg_bids_notify_client never actually fired (it looked up a job row that
//     does not exist until accept_bid runs).
//   * the job_scheduled email duplicated the `schedule_proposed` notification,
//     which send-notification already sends.
//
// The repo copy of this file was a DIFFERENT, never-deployed Twilio variant that
// returned the client's PHONE number. Do not deploy it. Do not revive this
// function -- if a client-facing email is ever needed here, add a type to the
// notifications table and let send-notification fan it out, or gate a new
// function with the internal-token primitive (issue_internal_token /
// consume_internal_token, header x-ff-internal, purpose 'edge-internal').

Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "notify-client has been retired" }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
