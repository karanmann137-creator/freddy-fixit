import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL    = "hello@freddyfixit.ca";
const FROM_EMAIL     = "noreply@freddyfixit.ca";

serve(async (req) => {
  try {
    const payload = await req.json();
    const { type, table, record } = payload;

    let subject = "";
    let html    = "";

    if (table === "client_requests") {
      subject = `🏠 New Job Request — ${record.service_needed}`;
      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
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
          <a href="https://freddyfixit.ca/admin-dashboard" style="display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">View in Dashboard →</a>
        </div>
      `;
    } else if (table === "contractors") {
      subject = `🔧 New Contractor Application`;
      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
          <h1 style="font-size:1.8rem;color:#ea6b14;margin-bottom:1rem;">New Contractor Application</h1>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);width:140px;">Specialties</td><td style="padding:.5rem 0;">${(record.specialties ?? []).join(", ")}</td></tr>
            <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Service Area</td><td style="padding:.5rem 0;">${(record.service_area ?? []).join(", ")}</td></tr>
            <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.6);">Experience</td><td style="padding:.5rem 0;">${record.years_of_experience} years</td></tr>
          </table>
          <a href="https://freddyfixit.ca/admin-dashboard" style="display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">Review Application →</a>
        </div>
      `;
    }

    if (!subject) return new Response("ignored", { status: 200 });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject, html }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});
