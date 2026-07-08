// Supabase Edge Function: support-request
// A signed-in user (currently the contractor "Request help" form) sends a
// support message to the platform admin (hello@freddyfixit.ca). We look the
// sender up by their user_id (service role) to attach their real name / email /
// phone and set Reply-To so the admin can reply straight to them.
// verify_jwt = true (only authenticated users may send).
// Deploy: supabase functions deploy support-request
// Secret needed: RESEND_API_KEY  (SUPABASE_URL / SERVICE_ROLE_KEY auto-injected)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL       = "noreply@freddyfixit.ca";
const ADMIN_EMAIL      = "hello@freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const row = (label: string, val: unknown) =>
  val === null || val === undefined || val === "" ? "" :
  `<p style="margin:.25rem 0;"><strong style="color:#9aa4bf;">${esc(label)}:</strong> ${esc(val)}</p>`;

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
  return { email, name: name || "(name not set)", phone };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const role     = String(body?.role || "user");
    const userId   = String(body?.user_id || "");
    const subject  = String(body?.subject || "Support request").slice(0, 160);
    const jobCode  = body?.job_code ? String(body.job_code).slice(0, 40) : null;
    const message  = String(body?.message || "").trim();

    if (!userId || !message) {
      return new Response(JSON.stringify({ ok: false, error: "missing user_id or message" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const person = await lookupPerson(userId);
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
        <h2 style="color:#ea6b14;margin:0 0 1rem;">Freddy Fix It — Support request</h2>
        <p style="font-size:16px;">A <strong>${esc(role)}</strong> asked for help.</p>
        ${row("Subject", subject)}
        ${row("From", person.name)}
        ${row("Email", person.email)}
        ${row("Phone", person.phone)}
        ${row("Job ID", jobCode)}
        <p style="margin:1rem 0 0;"><strong style="color:#9aa4bf;">Message:</strong><br>${esc(message).replace(/\n/g, "<br>")}</p>
        <p style="margin-top:1.5rem;font-size:12px;color:#9aa4bf;">Reply directly to this email to reach ${esc(person.name)}.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        reply_to: person.email || undefined,
        subject: `[Support · ${role}] ${subject}`,
        html,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Resend error:", JSON.stringify(data));
      return new Response(JSON.stringify({ ok: false, error: "send failed" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("support-request error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
