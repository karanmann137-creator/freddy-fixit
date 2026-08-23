import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL     = "noreply@freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { contractor_id } = await req.json();
    if (!contractor_id) return new Response(JSON.stringify({ error: "contractor_id required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: profile } = await admin.from("profiles").select("first_name, email").eq("id", contractor_id).single();
    if (!profile?.email) return new Response(JSON.stringify({ error: "no email" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    const name = profile.first_name || "there";
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
      <h2 style="color:#ea6b14;">Complete your Freddy Fix It profile 🔧</h2>
      <p>Hi ${name}, thanks for signing up! To get approved and start receiving job requests, we need a few documents from you:</p>
      <ul style="line-height:2;color:rgba(190,205,235,.85);">
        <li><strong>Liability Insurance Certificate</strong> (min $1M coverage)</li>
        <li><strong>WCB / Workers Compensation Certificate</strong></li>
        <li><strong>Trade Certification</strong> (if applicable)</li>
        <li><strong>Government-issued Photo ID</strong></li>
      </ul>
      <p>Log in and go to <strong>Step 6 of your profile</strong> to upload them. Our system will review them automatically — most approvals happen within minutes.</p>
      <a href="https://freddyfixit.ca/login" style="display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Upload Documents →</a>
      <p style="margin-top:1.5rem;font-size:.82rem;color:rgba(190,205,235,.45);">Questions? Reply to this email or WhatsApp us at +1 (825) 561-8331.</p>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: `Freddy Fix It <${FROM_EMAIL}>`, to: profile.email, subject: "Action required: upload your documents to get approved", html }),
    });

    if (!res.ok) throw new Error(await res.text());
    return new Response(JSON.stringify({ status: "sent", to: profile.email }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
