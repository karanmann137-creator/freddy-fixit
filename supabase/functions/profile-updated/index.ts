import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
// Injected automatically into every Supabase Edge Function — no secrets needed.
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

const FROM_EMAIL = "noreply@freddyfixit.ca";
const WHATSAPP   = "18255618331";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// CORS so the browser can invoke this directly from the dashboards.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- shared layout so this matches every other Freddy Fix It email ----
const wrap = (inner: string) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
    ${inner}
  </div>
`;

const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">${label}</a>
`;

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

// Turn the list of changed areas into a friendly sentence fragment.
const LABELS: Record<string, string> = {
  name: "your name",
  phone: "your phone number",
  company: "your company name",
  trade: "your primary trade",
};
function describeChanges(changed: string[]): string {
  const parts = changed.map(c => LABELS[c] ?? c).filter(Boolean);
  if (parts.length === 0) return "your profile details";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // ---- Authenticate the caller from their JWT (no trusting the body) ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "missing auth" }), { status: 401, headers: cors });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "invalid auth" }), { status: 401, headers: cors });
    }

    const body = await req.json().catch(() => ({}));
    const changed: string[] = Array.isArray(body?.changed) ? body.changed : [];

    // ---- Resolve recipient email + first name (service role) ----
    let to: string | null = null;
    let firstName = "there";

    const { data: profile } = await admin
      .from("profiles")
      .select("email, first_name")
      .eq("id", user.id)
      .single();

    if (profile) {
      to = profile.email ?? null;
      if (profile.first_name) firstName = profile.first_name;
    }
    if (!to) to = user.email ?? null;

    if (!to) {
      console.error("profile-updated: could not resolve email for", user.id);
      return new Response(JSON.stringify({ error: "no recipient" }), { status: 200, headers: cors });
    }

    const summary = describeChanges(changed);
    const result = await sendEmail(
      to,
      "✅ Your profile was updated — Freddy Fix It",
      wrap(`
        <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">Profile updated</h1>
        <p style="line-height:1.6;">Hi ${firstName}, this is a quick confirmation that we just updated ${summary} on your Freddy Fix It account.</p>
        <p style="line-height:1.6;color:rgba(190,205,235,.7);">If you made this change, no action is needed. If this wasn't you, please reach us right away on WhatsApp at +${WHATSAPP} so we can secure your account.</p>
        ${button("https://freddyfixit.ca", "Open Freddy Fix It →")}
      `),
    );

    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: cors });
  } catch (err) {
    console.error("profile-updated fatal:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
