// Supabase Edge Function: send-notification  (v14)
//
// Fired by the `send-notification-email` Database Webhook on every
// public.notifications INSERT. Turns an in-app bell into an email.
//
// WHAT CHANGED IN v11 — de-duplication of the new-job alert.
// `notify_contractors_new_request()` writes a `job_in_field` bell to every
// matched contractor, and `dispatch-job` separately emails those same
// contractors about the same job. So each new job produced TWO emails per pro:
//   * this generic one   -> "New job in your field" + a dashboard link
//   * dispatch-job's one -> service, masked location, timing, details, bid CTA
// dispatch-job's is strictly richer AND it is the thing that maintains
// client_requests.dispatched_to + contractors.jobs_dispatched, so it wins.
// The in-app 🔔 is unaffected — the row is still written, we just don't email
// a second time. Every other notification type still emails exactly as before.
//
// WHAT CHANGED IN v12 — `contractor_guide` added to the same suppression set.
// The contractor onboarding guide is delivered as a dashboard notification now
// and as the Tue Aug 4 Pro Tips email later (via newsletter-send). Without this
// entry, inserting the bell rows would have emailed every contractor instantly.
//
// WHAT CHANGED IN v13 — `rehire_request` added too, same reason as job_in_field.
// `notify_preferred_contractor()` fires on the SAME client_requests insert that
// triggers dispatch-job, and inside the 48h reservation window dispatch-job
// emails that same pro — so a rehire produced two emails. dispatch-job v14
// detects the reservation and switches its copy to "a past client requested
// you", so the one remaining email says everything the suppressed one did.
//
// WHAT CHANGED IN v14 — the chat-scheduling and T-1h visit-reminder types are
// suppressed too. `chat_time_proposed` / `chat_time_agreed` are dashboard
// prompts, not something worth an email. `visit_reminder`'s email is built in
// the `visit-reminder` function and is gated behind visit_reminder_enabled(),
// which currently returns false — so nothing goes out until the owner flips it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FROM_EMAIL = "noreply@freddyfixit.ca";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Notification types that another function already emails about, or that are
// deliberately in-app only. The bell row is still created; we just don't send
// a second, thinner copy.
const EMAIL_HANDLED_ELSEWHERE = new Set([
  "job_in_field",     // dispatch-job sends the full new-job email
  "rehire_request",   // dispatch-job emails the reserved pro on the same insert
  "contractor_guide", // dashboard-only; the emailed copy goes out with Pro Tips
  // Chat scheduling + the T-1h visit reminder are in-app only for now. The
  // reminder's email lives in visit-reminder, behind visit_reminder_enabled().
  "chat_time_proposed",
  "chat_time_agreed",
  "visit_reminder",
]);

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

function dashboardFor(role: string | null): string {
  if (role === "admin") return "https://freddyfixit.ca/admin-dashboard";
  if (role === "contractor") return "https://freddyfixit.ca/contractor-dashboard";
  return "https://freddyfixit.ca/client-dashboard";
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const incoming = payload?.record ?? {};
    const notifId = incoming.id;
    if (!notifId) return new Response("no id", { status: 200 });

    // Re-read the notification from the DB so the email content is authentic
    // (a forged webhook body can't inject arbitrary recipients/content).
    const { data: n, error: nErr } = await admin
      .from("notifications")
      .select("id, user_id, type, title, body, job_id")
      .eq("id", notifId)
      .single();
    if (nErr || !n) {
      console.error("notification not found", notifId, nErr?.message);
      return new Response("not found", { status: 200 });
    }

    // Bell still shows in-app; the email for this type comes from elsewhere.
    if (EMAIL_HANDLED_ELSEWHERE.has(n.type)) {
      return new Response(JSON.stringify({ sent: false, skipped: n.type }), { status: 200 });
    }

    // Resolve recipient email + name + role
    let to: string | null = null;
    let firstName = "there";
    let role: string | null = null;
    const { data: profile } = await admin
      .from("profiles").select("email, first_name, role").eq("id", n.user_id).single();
    if (profile) {
      to = profile.email ?? null;
      role = profile.role ?? null;
      if (profile.first_name) firstName = profile.first_name;
    }
    if (!to) {
      const { data: u } = await admin.auth.admin.getUserById(n.user_id);
      to = u?.user?.email ?? null;
    }
    if (!to) {
      console.error("no email for user", n.user_id);
      return new Response("no recipient", { status: 200 });
    }

    const html = wrap(`
      <h1 style="font-size:1.6rem;color:#ea6b14;margin-bottom:1rem;">${n.title}</h1>
      <p style="line-height:1.6;">Hi ${firstName},</p>
      <p style="line-height:1.6;">${n.body ?? ""}</p>
      ${button(dashboardFor(role), "Open My Dashboard →")}
    `);
    const result = await sendEmail(to, n.title, html);
    return new Response(JSON.stringify({ sent: true, result }), { status: 200 });
  } catch (err) {
    console.error("send-notification fatal:", String(err));
    return new Response(String(err), { status: 500 });
  }
});
