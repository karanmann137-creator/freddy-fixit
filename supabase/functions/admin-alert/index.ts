// Supabase Edge Function: admin-alert
// Emails the platform admin (hello@freddyfixit.ca) when something worth knowing happens:
//   - new_contractor  → a contractor signed up (or finished their profile)
//   - new_job         → a client posted a new job request
// Fired fire-and-forget from Postgres triggers via net.http_post (anon bearer).
// verify_jwt = false (called by the DB, not an end user). No user data is trusted for auth;
// the function only reads (via service role) and emails a fixed internal address.
// Deploy: supabase functions deploy admin-alert --no-verify-jwt
// Secret needed: RESEND_API_KEY  (SUPABASE_URL / SERVICE_ROLE_KEY are auto-injected)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL       = "noreply@freddyfixit.ca";
const ADMIN_EMAIL      = "hello@freddyfixit.ca";
const SITE             = "https://freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const wrap = (inner: string) => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
    <h2 style="color:#ea6b14;margin:0 0 1rem;">Freddy Fix It</h2>
    ${inner}
    <a href="${SITE}/admin-dashboard" style="display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">Open the admin dashboard</a>
    <p style="margin-top:1.5rem;font-size:12px;color:#9aa4bf;">You're receiving this because you're the Freddy Fix It admin.</p>
  </div>
`;

const row = (label: string, val: unknown) =>
  val === null || val === undefined || val === "" ? "" :
  `<p style="margin:.25rem 0;"><strong style="color:#9aa4bf;">${esc(label)}:</strong> ${esc(val)}</p>`;

async function sendEmail(subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) console.error("Resend error:", JSON.stringify(data));
  return data;
}

async function lookupPerson(userId: string) {
  let email: string | null = null, name = "", phone: string | null = null;
  const { data: p } = await admin.from("profiles")
    .select("first_name,last_name,email,phone").eq("id", userId).maybeSingle();
  if (p) {
    name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    email = p.email ?? null;
    phone = p.phone ?? null;
  }
  if (!email || !phone) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    email = email || (u?.user?.email ?? null);
    phone = phone || ((u?.user?.user_metadata as any)?.phone ?? null);
    if (!name) name = ((u?.user?.user_metadata as any)?.first_name ?? "") + "";
  }
  return { email, name: name || "(name not set yet)", phone };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const event = String(body?.event || "");

    if (event === "new_contractor") {
      const id = String(body?.id || "");
      const person = id ? await lookupPerson(id) : { email: null, name: "", phone: null };
      const { data: c } = id
        ? await admin.from("contractors")
            .select("company_name,specialties,service_area,work_type")
            .eq("id", id).maybeSingle()
        : { data: null } as any;
      const specs = Array.isArray(c?.specialties) ? c!.specialties.join(", ") : "";
      const area = Array.isArray(c?.service_area) ? c!.service_area.join(", ") : "";
      const html = wrap(`
        <p style="font-size:16px;">A new <strong>contractor</strong> just signed up.</p>
        ${row("Name", person.name)}
        ${row("Company", c?.company_name)}
        ${row("Email", person.email)}
        ${row("Phone", person.phone)}
        ${row("Trade / work type", c?.work_type)}
        ${row("Specialties", specs)}
        ${row("Service area", area)}
        <p style="margin-top:1rem;color:#9aa4bf;">Review their vetting details and documents in the Accounts tab.</p>
      `);
      await sendEmail("New contractor signup — " + (person.name || "Freddy Fix It"), html);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (event === "new_job") {
      const id = String(body?.id || "");
      const { data: r } = id
        ? await admin.from("client_requests")
            .select("user_id,service_needed,location,job_description,preferred_schedule,recurring")
            .eq("id", id).maybeSingle()
        : { data: null } as any;
      const person = r?.user_id ? await lookupPerson(r.user_id) : { email: null, name: "", phone: null };
      const desc = String(r?.job_description || "");
      const html = wrap(`
        <p style="font-size:16px;">A client just posted a <strong>new job request</strong>.</p>
        ${row("Service", r?.service_needed)}
        ${row("Location", r?.location)}
        ${row("Preferred timing", r?.preferred_schedule)}
        ${row("Recurring", r?.recurring ? "Yes" : "")}
        ${row("Client", person.name)}
        ${row("Client email", person.email)}
        ${row("Client phone", person.phone)}
        ${desc ? `<p style="margin:.75rem 0 0;"><strong style="color:#9aa4bf;">Details:</strong><br>${esc(desc.slice(0, 600))}</p>` : ""}
      `);
      await sendEmail("New job posted — " + (r?.service_needed || "Freddy Fix It"), html);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, error: "unknown event" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("admin-alert error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
