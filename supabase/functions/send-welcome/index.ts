import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// DECOMMISSIONED 2026-08-23. Returns 410 Gone; holds no secrets and sends nothing.
//
// v10 of this function took an arbitrary `email` AND an arbitrary `phone`
// straight off the request body and sent a welcome email via Resend as
// noreply@freddyfixit.ca plus a paid SMS via Twilio. It ran with
// verify_jwt=false, and verify_jwt=true would not have helped anyway: the anon
// key is itself a valid project-signed JWT and ships publicly in the JS bundle.
// So anyone could send mail from our sending domain and spend our Twilio
// balance, to any address or number they chose.
//
// It had no callers. `contractor-welcome` v2 superseded it — that one is fired
// by the contractor_welcome_email AFTER INSERT trigger via
// send_contractor_welcome(), resolves the recipient from the database rather
// than the request body, and honours outbound_paused().
//
// If a future DB->edge call needs to send mail, use the internal-token
// primitive: issue_internal_token('edge-internal') in Postgres, send it as the
// x-ff-internal header, and redeem it with consume_internal_token through the
// function's service-role client. Redeeming is what proves the caller is
// Postgres. Never trust a recipient off the request body.

serve(() =>
  new Response(JSON.stringify({ status: "gone" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
