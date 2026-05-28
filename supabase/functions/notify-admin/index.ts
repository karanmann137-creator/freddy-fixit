import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
// These three are injected into every Supabase Edge Function automatically.
// You do NOT need to add them as secrets.
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ADMIN_EMAIL = "hello@freddyfixit.ca";
const FROM_EMAIL  = "noreply@freddyfixit.ca";
const WHATSAPP    = "18255618331";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---- shared layout so every email looks identical to your admin emails ----
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

serve(async (req) => {
  const results: Record<string, unknown> = {};
  try {
    const payload = await req.json();
    const { table, record } = payload;

    // =====================================================================
    // 1. ADMIN NOTIFICATION  (unchanged behaviour from before)
    // =====================================================================
    let adminSubject = "";
    let adminHtml    = "";

    if (table === "client_requests") {
      adminSubject = `🏠 New Job Request — ${record.service_needed}`;
      adminHtml = wrap(`
        <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">New Job Request</h1>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);width:140px;">Name</td><td style="padding:.5rem 0;">${record.first_name} ${record.last_name}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Phone</td><td style="padding:.5rem 0;">${record.phone}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Email</td><td style="padding:.5rem 0;">${record.email}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Service</td><td style="padding:.5rem 0;">${record.service_needed}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Schedule</td><td style="padding:.5rem 0;">${record.preferred_schedule}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Location</td><td style="padding:.5rem 0;">${record.location}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);vertical-align:top;">Description</td><td style="padding:.5rem 0;">${record.job_description}</td></tr>
        </table>
        ${button("https://freddyfixit.ca/admin-dashboard", "View in Dashboard →")}
      `);
    } else if (table === "contractors") {
      adminSubject = `🔧 New Contractor Application`;
      adminHtml = wrap(`
        <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">New Contractor Application</h1>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);width:140px;">Specialties</td><td style="padding:.5rem 0;">${(record.specialties ?? []).join(", ")}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Service Area</td><td style="padding:.5rem 0;">${(record.service_area ?? []).join(", ")}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Experience</td><td style="padding:.5rem 0;">${record.years_of_experience} years</td></tr>
        </table>
        ${button("https://freddyfixit.ca/admin-dashboard", "Review Application →")}
      `);
    }

    if (adminSubject) {
      results.admin = await sendEmail(ADMIN_EMAIL, adminSubject, adminHtml);
    }

    // =====================================================================
    // 2. CONFIRMATION EMAIL TO THE USER  (the new part)
    //    Each block resolves the recipient's email + first name, then sends.
    //    Wrapped independently so a failure here never blocks the admin mail.
    // =====================================================================
    try {
      if (table === "client_requests") {
        // Client's email is right on the request record.
        const to        = record.email;
        const firstName = record.first_name || "there";
        if (to) {
          results.client = await sendEmail(
            to,
            "✅ We've received your request — Freddy Fix It",
            wrap(`
              <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">Thanks, ${firstName}!</h1>
              <p style="line-height:1.6;">We've received your request for <strong>${record.service_needed}</strong> and our team is already on it.</p>
              <p style="line-height:1.6;">Here's what happens next: we'll match you with a trusted local contractor and reach out to confirm scheduling. You can follow your request anytime from your dashboard.</p>
              <p style="line-height:1.6;color:rgba(190,205,235,.7);">Need us sooner? Message us on WhatsApp at +${WHATSAPP}.</p>
              ${button("https://freddyfixit.ca/client-dashboard", "View My Request →")}
            `),
          );
        } else {
          console.error("client_requests row had no email; skipped confirmation", record.id);
        }
      } else if (table === "contractors") {
        // Contractor row has NO email — look it up from profiles (id is shared),
        // and fall back to the auth user record if profiles.email is empty.
        let to: string | null = null;
        let firstName = "there";

        const { data: profile } = await admin
          .from("profiles")
          .select("email, first_name")
          .eq("id", record.id)
          .single();

        if (profile) {
          to = profile.email ?? null;
          if (profile.first_name) firstName = profile.first_name;
        }
        if (!to) {
          const { data: u } = await admin.auth.admin.getUserById(record.id);
          to = u?.user?.email ?? null;
        }

        if (to) {
          results.contractor = await sendEmail(
            to,
            "✅ Application received — Freddy Fix It",
            wrap(`
              <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">Welcome aboard, ${firstName}!</h1>
              <p style="line-height:1.6;">Thanks for applying to join the Freddy Fix It contractor network. We've received your application and our team is reviewing it now.</p>
              <p style="line-height:1.6;">Once you're approved, jobs in your service area will start showing up in your dashboard. We'll email you the moment your account is active.</p>
              <p style="line-height:1.6;color:rgba(190,205,235,.7);">Questions in the meantime? Reach us on WhatsApp at +${WHATSAPP}.</p>
              ${button("https://freddyfixit.ca/contractor-dashboard", "Go to My Dashboard →")}
            `),
          );
        } else {
          console.error("could not resolve contractor email for", record.id);
        }
      }
    } catch (userErr) {
      // Confirmation failed, but we don't want to fail the whole webhook.
      console.error("confirmation email error:", String(userErr));
      results.confirmationError = String(userErr);
    }

    if (!adminSubject && Object.keys(results).length === 0) {
      return new Response("ignored", { status: 200 });
    }
    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    console.error("notify-admin fatal:", String(err));
    return new Response(String(err), { status: 500 });
  }
});
