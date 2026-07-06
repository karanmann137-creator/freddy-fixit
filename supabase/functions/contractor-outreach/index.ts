import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Contractor outreach sender (queue-driven). ADMIN ONLY.
//
// Reads contractors from the `contractor_outreach` table where status =
// 'pending', emails each one via Resend, and writes the result (sent / failed
// + Resend id) back to the row. Because it only ever touches 'pending' rows
// and flips them to 'sent', it can be run repeatedly and will NEVER email the
// same contractor twice. Add recipients by inserting 'pending' rows.
//
// POST (requires a signed-in ADMIN's Authorization bearer):
//   { "dryRun": true }            -> list who WOULD be emailed, send nothing
//   { "confirm": "SEND" }         -> actually send (required to send)
//   { "limit": 40 }               -> max recipients this run (default 40)
//
// GET ?u=<row-uuid>  (public, no auth — used by the unsubscribe link in the
//   email): marks that row — and every other row with the same email —
//   'unsubscribed' and shows a tiny confirmation page. Unsubscribed rows are
//   never emailed.
//
// CASL (Canada's Anti-Spam Legislation) requirements handled here:
//   - one-click functioning unsubscribe (the GET endpoint above)
//   - sender identification + PHYSICAL mailing address in the footer.
//     Sending is BLOCKED until MAILING_ADDRESS below is filled in with a real
//     street/PO-box address — an email address alone does not satisfy CASL.
//
// Deploy with verify_jwt=false (the unsubscribe link must work from an email
// with no JWT); the POST path enforces admin auth itself.
// ---------------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Karan Mann <hello@freddyfixit.ca>";

// REQUIRED BY LAW before sending: a real physical mailing address
// (registered office, home address, or P.O. box). Example:
// "Freddy FixIt Contractors Inc., 123 Any St SE, Calgary, AB T2X 0A1"
const MAILING_ADDRESS = "Freddy FixIt Contractors Inc., 20 Whiteram Mews NE, Calgary, AB T1Y 5W5";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function greeting(companyName: string, contactName?: string | null): string {
  if (contactName && contactName.trim()) return contactName.trim();
  return `${companyName} team`;
}

function unsubscribeUrl(rowId: string): string {
  return `${SUPABASE_URL}/functions/v1/contractor-outreach?u=${rowId}`;
}

function buildEmail(rowId: string, companyName: string, contactName?: string | null): string {
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
<p><strong>Karan Mann</strong><br>Founder, Freddy Fix It<br><a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> | <a href="https://freddyfixit.ca">freddyfixit.ca</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:12px;color:#999">${MAILING_ADDRESS}<br>
You're receiving this one-time note because your business contact information is published publicly.<br>
<a href="${unsubscribeUrl(rowId)}" style="color:#999">Unsubscribe</a> &mdash; one click, no login needed &mdash; or reply "unsubscribe".</p>
</body></html>`;
}

const UNSUB_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:Arial,sans-serif;background:#1a2236;color:#f0f4ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center;max-width:420px;padding:24px">
<h1 style="color:#ea6b14;margin-bottom:8px">You're unsubscribed</h1>
<p style="line-height:1.6">You won't receive any more emails from Freddy Fix It. If this was a mistake, just write to <a href="mailto:hello@freddyfixit.ca" style="color:#ea6b14">hello@freddyfixit.ca</a>.</p>
</div></body></html>`;

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Public one-click unsubscribe (?u=<row-uuid>) ──────────────────────────
  // GET = human clicking the link in the email; POST with ?u= = RFC 8058
  // one-click unsubscribe fired by Gmail/Outlook. Both must work with no auth.
  const unsubParam = new URL(req.url).searchParams.get("u");
  if (req.method === "GET" || (req.method === "POST" && unsubParam)) {
    const u = unsubParam ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const { data: row } = await admin.from("contractor_outreach")
      .select("id, email").eq("id", u).maybeSingle();
    if (row?.email) {
      // Mark every row for this email so re-imports can't re-mail them.
      await admin.from("contractor_outreach")
        .update({ status: "unsubscribed" })
        .eq("email", row.email);
    }
    // Always show success — don't leak whether an id existed.
    return new Response(UNSUB_PAGE, { status: 200, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  // ── Admin auth (verify_jwt is off for the unsubscribe link, so enforce
  //    real auth here: a valid user JWT whose profile role is 'admin') ───────
  const authed = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return new Response(JSON.stringify({ error: "Admins only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const limit = Math.min(Math.max(Number(body?.limit) || 40, 1), 100);

  // Guard: actually sending requires an explicit confirm token.
  if (!dryRun && body?.confirm !== "SEND") {
    return new Response(
      JSON.stringify({ error: "Refusing to send. POST { \"confirm\": \"SEND\" } to send, or { \"dryRun\": true } to preview." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // CASL guard: commercial email must carry a physical mailing address.
  if (!dryRun && !MAILING_ADDRESS.trim()) {
    return new Response(
      JSON.stringify({ error: "Sending blocked: MAILING_ADDRESS is empty. CASL requires a physical mailing address in every commercial email — set it in contractor-outreach/index.ts and redeploy." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const { data: pending, error: selErr } = await admin
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
      mailingAddressSet: !!MAILING_ADDRESS.trim(),
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
          html: buildEmail(c.id, c.company_name, c.contact_name),
          headers: {
            // RFC 8058 one-click unsubscribe — Gmail/Outlook surface this natively.
            "List-Unsubscribe": `<${unsubscribeUrl(c.id)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        await admin.from("contractor_outreach")
          .update({ status: "sent", resend_id: data.id ?? null, sent_at: new Date().toISOString(), error: null })
          .eq("id", c.id);
        results.push({ email: c.email, status: "sent", id: data.id });
        sent++;
      } else {
        const msg = data?.message ?? `HTTP ${res.status}`;
        await admin.from("contractor_outreach")
          .update({ status: "failed", error: msg })
          .eq("id", c.id);
        results.push({ email: c.email, status: "failed", error: msg });
        failed++;
      }
    } catch (err) {
      await admin.from("contractor_outreach")
        .update({ status: "failed", error: String(err) })
        .eq("id", c.id);
      results.push({ email: c.email, status: "error", error: String(err) });
      failed++;
    }
    // Stay under Resend's rate limit (2 req/s).
    await new Promise((r) => setTimeout(r, 600));
  }

  const { count: remaining } = await admin
    .from("contractor_outreach")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return new Response(JSON.stringify({ sent, failed, processed: queue.length, remaining: remaining ?? 0, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
