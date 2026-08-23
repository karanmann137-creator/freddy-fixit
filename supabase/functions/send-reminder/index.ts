import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// DECOMMISSIONED 2026-08-23. Returns 410 Gone; holds no secrets and sends nothing.
//
// This was an open mail relay. verify_jwt was false, and it took `email`,
// `subject`, `title` and `body` straight off the request and sent that HTML as
// "Freddy Fix It <noreply@freddyfixit.ca>" via Resend. Anyone who knew the URL
// could send arbitrary mail, to anyone, signed with the DKIM key that carries
// every transactional email the platform depends on. A DKIM fault has already
// taken all platform email down once; a spam complaint against this would have
// done the same, with no way to trace it.
//
// Its only caller was the `notify_user` DB helper, which ALSO wrote a
// notifications row -- and the `send-notification-email` webhook on that insert
// already emailed the same title and body. So every one of the thirteen types
// routed through notify_user sent two emails, and the direct post here also
// bypassed `outbound_paused()`, escaping a site pause meant to silence
// everything. Removing the post fixed both and left this with no callers.
//
// Do NOT revive this. If something ever needs to send mail from Postgres, use
// the internal-token pattern: the DB mints via issue_internal_token('edge-internal')
// and the function redeems the x-ff-internal header via consume_internal_token,
// as notify-message and notify-accepted do.
serve(() => new Response(JSON.stringify({ status: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
