import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Finish-signup nudge. ADMIN ONLY.
//
// Finds "orphaned" auth users — accounts that authenticated (usually via
// Google one-tap) but never completed onboarding, so there is an
// auth.users row with NO matching public.profiles row — and emails each one
// a friendly "complete your registration" nudge. These people started an
// account themselves, so this is a relationship/transactional follow-up, not
// cold marketing; we still include a physical mailing address + opt-out to be
// safe under CASL.
//
// POST (requires a signed-in ADMIN's Authorization bearer):
//   { "dryRun": true }    -> list orphaned accounts, send nothing
//   { "confirm": "SEND" } -> actually email them
//   { "limit": 40 }       -> max recipients this run (default 40)
//
// Deployed verify_jwt=false; the POST path enforces admin auth itself.
// ---------------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Freddy Fix It <hello@freddyfixit.ca>";
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function buildEmail(role: string, firstName?: string | null): string {
  const hi = firstName && firstName.trim() ? firstName.trim() : "there";
  const link = role === "contractor"
    ? "https://freddyfixit.ca/contractor-onboarding"
    : "https://freddyfixit.ca/client-onboarding";
  const cta = role === "contractor" ? "Finish my contractor profile" : "Finish signing up";
  const line = role === "contractor"
    ? "It looks like you started signing up as a contractor on Freddy Fix It but didn't finish. You're only a few minutes away from being able to receive local job leads."
    : "It looks like you started signing up on Freddy Fix It but didn't finish. You're only a couple of minutes away from getting your first free estimate.";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.7;max-width:600px;margin:0 auto;padding:32px 24px">
<p>Hi ${hi},</p>
<p>${line}</p>
<p>Just pick up where you left off — it only takes a few minutes and everything you need is on one page.</p>
<p style="text-align:center;margin:28px 0"><a href="${link}" style="background:#ea6b14;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">${cta} &rarr;</a></p>
<p>If you didn't mean to sign up, you can safely ignore this email and your account won't be activated.</p>
<p>Questions? Just reply to this email.</p>
<p><strong>The Freddy Fix It team</strong><br><a href="mailto:hello@freddyfixit.ca">hello@freddyfixit.ca</a> | <a href="https://freddyfixit.ca">freddyfixit.ca</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:12px;color:#999">${MAILING_ADDRESS}<br>
You're receiving this because you started creating an account at freddyfixit.ca. Reply "unsubscribe" and we won't email you again.</p>
</body></html>`;
}

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Admin auth
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
  if (!dryRun && body?.confirm !== "SEND") {
    return new Response(JSON.stringify({ error: 'Refusing to send. POST { "confirm": "SEND" } to send, or { "dryRun": true } to preview.' }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Find orphaned auth users (no profile row). Uses the admin API to page users.
  const orphans: { id: string; email: string; role: string; firstName: string | null }[] = [];
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    const users = data?.users ?? [];
    if (users.length === 0) break;
    const ids = users.map((u) => u.id);
    const { data: profs } = await admin.from("profiles").select("id").in("id", ids);
    const haveProfile = new Set((profs ?? []).map((p) => p.id));
    for (const u of users) {
      if (!u.email) continue;
      if (haveProfile.has(u.id)) continue;
      const meta = (u.user_metadata ?? {}) as Record<string, any>;
      orphans.push({
        id: u.id,
        email: u.email,
        role: meta.role === "contractor" ? "contractor" : (meta.role === "client" ? "client" : "contractor"),
        firstName: meta.first_name ?? meta.given_name ?? meta.name ?? null,
      });
    }
    if (users.length < 200) break;
    page++;
  }

  const queue = orphans.slice(0, limit);

  if (dryRun) {
    return new Response(JSON.stringify({ dryRun: true, orphanCount: orphans.length, wouldSend: queue.length,
      recipients: queue.map((o) => ({ email: o.email, role: o.role })) }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const results: { email: string; status: string; id?: string; error?: string }[] = [];
  let sent = 0, failed = 0;
  for (const o of queue) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: o.email,
          subject: "Finish setting up your Freddy Fix It account",
          html: buildEmail(o.role, o.firstName),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { results.push({ email: o.email, status: "sent", id: data.id }); sent++; }
      else { results.push({ email: o.email, status: "failed", error: data?.message ?? `HTTP ${res.status}` }); failed++; }
    } catch (err) {
      results.push({ email: o.email, status: "error", error: String(err) }); failed++;
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  return new Response(JSON.stringify({ sent, failed, processed: queue.length, results }),
    { headers: { ...cors, "Content-Type": "application/json" } });
});
