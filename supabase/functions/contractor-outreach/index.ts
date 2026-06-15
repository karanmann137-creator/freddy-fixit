import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Contractor outreach sender (queue-driven).
//
// Instead of a hardcoded recipient list, this reads contractors from the
// `contractor_outreach` table where status = 'pending', emails each one via
// Resend, and writes the result (sent / failed + Resend id) back to the row.
// Because it only ever touches 'pending' rows and flips them to 'sent', it can
// be run as many times as you like and will NEVER email the same contractor
// twice. Add more recipients by inserting 'pending' rows into the table.
//
// POST body options:
//   { "dryRun": true }            -> list who WOULD be emailed, send nothing
//   { "confirm": "SEND" }         -> actually send (required to send)
//   { "limit": 40 }               -> max recipients this run (default 40)
// ---------------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Karan Mann <hello@freddyfixit.ca>";

const ALLOWED_ORIGINS = new Set([
  "https://freddyfixit.ca",
  "https://www.freddyfixit.ca",
  "https://freddy-fixit.vercel.app",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://freddyfixit.ca";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function greeting(companyName: string, contactName?: string | null): string {
  if (contactName && contactName.trim()) return contactName.trim();
  return `${companyName} team`;
}

function buildEmail(companyName: string, contactName?: string | null): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.7;max-width:600px;margin:0 auto;padding:32px 24px">
<p>Hi ${greeting(companyName, contactName)},</p>
<p>My name is Karan, and I'm the founder of <strong>Freddy Fix It</strong> &mdash; a new Calgary-based platform that connects homeowners with vetted local contractors like yourself.</p>
<p>We're now opening up contractor onboarding, and based on your reputation in the city, we'd love to have you on board.</p>
<p><strong>Here's how it works:</strong></p>
<ul>
<li>Homeowners post a job on <a href="https://freddyfixit.ca">freddyfixit.ca</a></li>
<li>Our system dispatches leads to contractors matching the trade, location &amp; availability</li>
<li>You review the job and decide if you want it</li>
<li>Agree on price and schedule &mdash; get paid through the platform on completion</li>
</ul>
<p>No monthly fees, no subscriptions, no pay-to-play. We take a small service fee only on completed jobs.</p>
<p><strong>What you get:</strong></p>
<ul>
<li>&#10003; Steady local job leads sent directly to you</li>
<li>&#10003; No chasing clients &mdash; they come to you</li>
<li>&#10003; You set your own rates</li>
<li>&#10003; Verified profile page with reviews</li>
<li>&#10003; Fast payment on job completion</li>
<li>&#10003; Recurring scheduling for maintenance clients</li>
</ul>
<p>Takes about 5 minutes to apply:</p>
<p style="text-align:center;margin:28px 0"><a href="https://freddyfixit.ca/contractor-onboarding" style="background:#ea6b14;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">Apply to Join Freddy Fix It &rarr;</a></p>
<p>Feel free to reply with any questions &mdash; happy to jump on a quick call.</p>
<p><strong>Karan Mann</strong><br>Founder, Freddy Fix It<br><a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> | <a href="https://freddyfixit.ca">freddyfixit.ca</a><br>Calgary, AB</p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:12px;color:#999">Reply "unsubscribe" to opt out.</p>
</body></html>`;
}

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const limit = Math.min(Math.max(Number(body?.limit) || 40, 1), 100);

  // Guard: actually sending requires an explicit confirm token. A dry run is
  // always allowed. This prevents accidental or drive-by triggering.
  if (!dryRun && body?.confirm !== "SEND") {
    return new Response(
      JSON.stringify({ error: "Refusing to send. POST { \"confirm\": \"SEND\" } to send, or { \"dryRun\": true } to preview." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: pending, error: selErr } = await supabase
    .from("contractor_outreach")
    .select("id, company_name, contact_name, email")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const queue = pending ?? [];

  if (dryRun) {
    return new Response(JSON.stringify({
      dryRun: true,
      wouldSend: queue.length,
      recipients: queue.map((c) => ({ company_name: c.company_name, email: c.email })),
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const results: { email: string; status: string; id?: string; error?: string }[] = [];
  let sent = 0, failed = 0;

  for (const c of queue) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: c.email,
          subject: "We're launching in Calgary — and we want you on the platform",
          html: buildEmail(c.company_name, c.contact_name),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        await supabase.from("contractor_outreach")
          .update({ status: "sent", resend_id: data.id ?? null, sent_at: new Date().toISOString(), error: null })
          .eq("id", c.id);
        results.push({ email: c.email, status: "sent", id: data.id });
        sent++;
      } else {
        const msg = data?.message ?? `HTTP ${res.status}`;
        await supabase.from("contractor_outreach")
          .update({ status: "failed", error: msg })
          .eq("id", c.id);
        results.push({ email: c.email, status: "failed", error: msg });
        failed++;
      }
    } catch (err) {
      await supabase.from("contractor_outreach")
        .update({ status: "failed", error: String(err) })
        .eq("id", c.id);
      results.push({ email: c.email, status: "error", error: String(err) });
      failed++;
    }
    // Stay under Resend's rate limit (2 req/s).
    await new Promise((r) => setTimeout(r, 600));
  }

  // How many still queued after this batch?
  const { count: remaining } = await supabase
    .from("contractor_outreach")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return new Response(JSON.stringify({ sent, failed, processed: queue.length, remaining: remaining ?? 0, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
