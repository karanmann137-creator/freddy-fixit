// Supabase Edge Function: notify-email
// Sends transactional emails (via Resend) tied to the job lifecycle.
//   - job_completed_client      → emails the CLIENT that the contractor marked the job complete
//   - job_confirmed_contractor  → emails the CONTRACTOR that the client confirmed & released payment
// Deploy: supabase functions deploy notify-email --no-verify-jwt
// Secret needed: RESEND_API_KEY  (SUPABASE_URL / SERVICE_ROLE_KEY are auto-injected)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL       = "noreply@freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType = "job_completed_client" | "job_confirmed_contractor";

// Shared layout so these emails match the rest of your branded mail.
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

// Resolve an email + first name from profiles, falling back to the auth user record.
async function resolveRecipient(userId: string): Promise<{ email: string | null; firstName: string }> {
  let email: string | null = null;
  let firstName = "there";
  const { data: profile } = await admin.from("profiles").select("email, first_name").eq("id", userId).single();
  if (profile) {
    email = profile.email ?? null;
    if (profile.first_name) firstName = profile.first_name;
  }
  if (!email) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    email = u?.user?.email ?? null;
  }
  return { email, firstName };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { event, job_id } = await req.json() as { event: EventType; job_id: string };
    if (!event || !job_id) {
      return new Response(JSON.stringify({ error: "event and job_id are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select(`
        id, client_id, contractor_id, amount, contractor_payout, scheduled_at,
        request:client_requests!jobs_request_id_fkey(service_needed),
        contractor:profiles!jobs_contractor_id_fkey(first_name, last_name)
      `)
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const service = job.request?.service_needed ?? "your job";
    const contractorName = [job.contractor?.first_name, job.contractor?.last_name].filter(Boolean).join(" ") || "your contractor";

    let to: string | null = null;
    let subject = "";
    let html = "";

    if (event === "job_completed_client") {
      const r = await resolveRecipient(job.client_id);
      to = r.email;
      subject = "✅ Your job is marked complete — confirm to release payment";
      html = wrap(`
        <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">Nice — the work is done!</h1>
        <p style="line-height:1.6;">Hi ${r.firstName}, <strong>${contractorName}</strong> has marked your <strong>${service}</strong> job complete.</p>
        <p style="line-height:1.6;">Please take a look and confirm the work in your dashboard. Confirming releases your held payment to the contractor. If you don't, it auto-confirms in a few days.</p>
        ${button("https://freddyfixit.ca/client-dashboard", "Review & Confirm →")}
      `);
    } else if (event === "job_confirmed_contractor") {
      const r = await resolveRecipient(job.contractor_id);
      to = r.email;
      const payout = job.contractor_payout != null
        ? Number(job.contractor_payout)
        : Math.round(Number(job.amount ?? 0) * 0.93 * 100) / 100;
      subject = "💸 Payment released — your job is confirmed";
      html = wrap(`
        <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">You've been paid!</h1>
        <p style="line-height:1.6;">Hi ${r.firstName}, the client confirmed your <strong>${service}</strong> job is complete.</p>
        <p style="line-height:1.6;">Your payout of <strong>$${payout.toFixed(2)}</strong> is on its way to your connected account.</p>
        <p style="line-height:1.6;color:rgba(190,205,235,.7);">Thanks for the great work — keep it up!</p>
        ${button("https://freddyfixit.ca/contractor-dashboard", "View My Earnings →")}
      `);
    } else {
      return new Response(JSON.stringify({ status: "ignored", reason: "unknown event" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!to) {
      return new Response(JSON.stringify({ status: "skipped", reason: "no recipient email" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const result = await sendEmail(to, subject, html);
    return new Response(JSON.stringify({ status: "sent", to, result }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-email fatal:", String(e));
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
