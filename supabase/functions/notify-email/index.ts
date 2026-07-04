// Supabase Edge Function: notify-email
// Sends transactional emails (via Resend) tied to the job lifecycle.
//   - schedule_proposed         → emails the CLIENT that the contractor proposed a time/price
//   - job_completed_client      → emails the CLIENT that the contractor marked the job complete
//   - job_confirmed_contractor  → emails the CONTRACTOR that the client confirmed & released payment
//   - contract_copy             → emails the CLIENT a written contract copy when they approve the quote
//                                 (starts the Alberta 10-day cancellation clock; stamps jobs.contract_copy_sent_at)
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

type EventType = "schedule_proposed" | "job_completed_client" | "job_confirmed_contractor" | "contract_copy";

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
        is_milestone, total_charged, client_fee,
        request:client_requests!jobs_request_id_fkey(service_needed, job_description, location),
        contractor:profiles!jobs_contractor_id_fkey(first_name, last_name, company_name)
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

    if (event === "schedule_proposed") {
      const r = await resolveRecipient(job.client_id);
      to = r.email;
      const when = job.scheduled_at
        ? new Date(job.scheduled_at).toLocaleString("en-CA", { timeZone: "America/Edmonton", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : null;
      const amt = job.amount != null ? `$${Number(job.amount).toFixed(2)}` : null;
      subject = "🕒 Your contractor proposed a time";
      html = wrap(`
        <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">A time has been proposed</h1>
        <p style="line-height:1.6;">Hi ${r.firstName}, <strong>${contractorName}</strong> proposed a time for your <strong>${service}</strong> job${when ? `: <strong>${when}</strong>` : ""}.${amt ? ` The quoted price is <strong>${amt}</strong>.` : ""}</p>
        <p style="line-height:1.6;">Open your dashboard to approve the time and schedule the work.</p>
        ${button("https://freddyfixit.ca/client-dashboard", "Review & Approve →")}
      `);
    } else if (event === "job_completed_client") {
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
    } else if (event === "contract_copy") {
      const r = await resolveRecipient(job.client_id);
      to = r.email;
      const company = job.contractor?.company_name
        || [job.contractor?.first_name, job.contractor?.last_name].filter(Boolean).join(" ")
        || "your contractor";
      const address = job.request?.location || "the address on file";
      const desc = job.request?.job_description || service;
      const price = job.amount != null ? Number(job.amount) : 0;
      const total = job.total_charged != null ? Number(job.total_charged) : null;
      const fee = job.client_fee != null ? Number(job.client_fee) : null;
      const startWhen = job.scheduled_at
        ? new Date(job.scheduled_at).toLocaleString("en-CA", { timeZone: "America/Edmonton", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "the date you arrange with your contractor";

      // Payment schedule: staged plan for milestone jobs, single charge otherwise.
      let scheduleRows = "";
      if (job.is_milestone) {
        const { data: stages } = await admin
          .from("job_milestones")
          .select("seq, title, amount, client_fee, status")
          .eq("job_id", job.id).order("seq");
        const rows = (stages || []).map((st: any) => {
          const chg = Number(st.amount) + Number(st.client_fee ?? 0);
          return `<tr><td style="padding:4px 8px;border-bottom:1px solid rgba(240,244,255,.15);">Stage ${st.seq}: ${st.title}</td><td style="padding:4px 8px;border-bottom:1px solid rgba(240,244,255,.15);text-align:right;">$${chg.toFixed(2)}</td></tr>`;
        }).join("");
        scheduleRows = `<p style="line-height:1.6;margin-top:1rem;"><strong>Payment schedule (staged):</strong> you approve and fund each stage in order; nothing is charged until you fund a stage, and each stage is held until you approve the work.</p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-top:.5rem;">${rows}</table>`;
      } else {
        scheduleRows = `<p style="line-height:1.6;margin-top:1rem;"><strong>Payment:</strong> job price $${price.toFixed(2)}${fee != null ? ` + service fee $${fee.toFixed(2)}` : ""}${total != null ? ` = <strong>$${total.toFixed(2)}</strong>` : ""}. Your payment is held securely and only released to the contractor after you confirm the work is complete.</p>`;
      }

      subject = "📄 Your Freddy Fix It job agreement (please keep this copy)";
      html = wrap(`
        <h1 style="font-size:1.6rem;color:#ea6b14;margin-bottom:1rem;">Your job agreement</h1>
        <p style="line-height:1.6;">Hi ${r.firstName}, you approved the quote below. This email is your written copy of the agreement — please keep it.</p>
        <table style="width:100%;border-collapse:collapse;font-size:.92rem;margin:1rem 0;">
          <tr><td style="padding:4px 8px;color:rgba(240,244,255,.65);">Client</td><td style="padding:4px 8px;text-align:right;">${r.firstName}</td></tr>
          <tr><td style="padding:4px 8px;color:rgba(240,244,255,.65);">Contractor</td><td style="padding:4px 8px;text-align:right;">${company}</td></tr>
          <tr><td style="padding:4px 8px;color:rgba(240,244,255,.65);">Service</td><td style="padding:4px 8px;text-align:right;">${service}</td></tr>
          <tr><td style="padding:4px 8px;color:rgba(240,244,255,.65);">Where</td><td style="padding:4px 8px;text-align:right;">${address}</td></tr>
          <tr><td style="padding:4px 8px;color:rgba(240,244,255,.65);">Start</td><td style="padding:4px 8px;text-align:right;">${startWhen}</td></tr>
        </table>
        <p style="line-height:1.6;"><strong>Scope of work:</strong> ${desc}</p>
        <p style="line-height:1.6;color:rgba(240,244,255,.7);font-size:.85rem;">Completion: as scheduled with your contractor; if timing changes they'll message you to re-agree a date.</p>
        ${scheduleRows}
        <div style="margin-top:1.25rem;padding:.9rem 1rem;background:rgba(234,107,20,.08);border:1px solid rgba(234,107,20,.3);border-radius:10px;">
          <p style="line-height:1.55;margin:0 0 .4rem;font-weight:600;">Your cancellation rights (Alberta)</p>
          <p style="line-height:1.55;margin:0;font-size:.86rem;color:rgba(240,244,255,.85);">Because payment is collected before the work is finished, you may cancel this agreement without penalty within <strong>10 days</strong> of receiving this copy. If the work hasn't started within 30 days of the agreed date, you may cancel for up to one year. On a valid cancellation we refund any funds still held (not yet released to the contractor) within 15 days. To cancel, reply to this email or contact hello@freddyfixit.ca. These rights are in addition to, and do not waive, your rights under Alberta's Consumer Protection Act.</p>
        </div>
        <p style="line-height:1.6;font-size:.82rem;color:rgba(240,244,255,.6);margin-top:1rem;">Full terms: freddyfixit.ca/user-agreement</p>
        ${button("https://freddyfixit.ca/client-dashboard", "View in my dashboard →")}
      `);

      // Stamp when the copy was sent — this is what the 10-day clock runs from.
      await admin.from("jobs").update({ contract_copy_sent_at: new Date().toISOString() }).eq("id", job.id);
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
