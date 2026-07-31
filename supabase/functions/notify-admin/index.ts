// Supabase Edge Function: notify-admin  (v17)
//
// WHAT THIS IS NOW: the client's "we've received your request" confirmation email.
// Nothing else. Called by the `notify-admin-client ` webhook trigger on
// public.client_requests INSERT (note the trailing space in the trigger name).
//
// WHAT CHANGED IN v17 — de-duplication.
// This function used to also email hello@ on every new job AND handle contractor
// signups (admin alert + "application received" to the pro). Newer, richer
// functions took both of those over:
//   * admin-alert         -> the hello@ alert for new jobs and new contractors
//   * contractor-welcome  -> the pro's welcome email
// The legacy `notify-admin-contractor` trigger has been dropped, and the admin
// branch is removed here, so each event now produces exactly one email per
// recipient instead of two.
//
// The client confirmation copy was also stale: it promised "we'll match you with
// a trusted local contractor and reach out to confirm scheduling", which is the
// old concierge flow. Clients now receive estimates and pick a pro themselves.
//
// verify_jwt = false: called by a database webhook, not an end user.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const FROM_EMAIL = "noreply@freddyfixit.ca";
const WHATSAPP   = "18255618331";

// Same navy/orange shell every Freddy email uses.
const wrap = (inner: string) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
    ${inner}
  </div>
`;

const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">${label}</a>
`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) console.error(`Resend error sending to ${to}:`, JSON.stringify(data));
  return data;
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const { table, record } = payload ?? {};

    // Contractor signups are handled entirely by contractor-welcome + admin-alert.
    // Anything that isn't a new client request is a no-op.
    if (table !== "client_requests" || !record) {
      return new Response("ignored", { status: 200 });
    }

    const to = record.email;
    if (!to) {
      console.error("client_requests row had no email; skipped confirmation", record.id);
      return new Response(JSON.stringify({ skipped: "no email" }), { status: 200 });
    }

    const firstName = esc(record.first_name || "there");
    const service   = esc(record.service_needed);

    const result = await sendEmail(
      to,
      "We've received your request — Freddy Fix It",
      wrap(`
        <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">Thanks, ${firstName}!</h1>
        <p style="line-height:1.6;">We've received your request for <strong>${service}</strong> and it's now live with our vetted Calgary pros.</p>
        <p style="line-height:1.6;"><strong>What happens next:</strong> pros in your area will send you estimates over the next little while. You'll get an email each time one arrives. When you're ready, open your dashboard to compare them and pick the pro you want — you're never obligated to accept any of them.</p>
        <p style="line-height:1.6;color:rgba(190,205,235,.7);">Need us sooner? Message us on WhatsApp at +${WHATSAPP}.</p>
        ${button("https://freddyfixit.ca/client-dashboard", "View My Request →")}
      `),
    );

    return new Response(JSON.stringify({ client: result }), { status: 200 });
  } catch (err) {
    console.error("notify-admin fatal:", String(err));
    return new Response(String(err), { status: 500 });
  }
});
