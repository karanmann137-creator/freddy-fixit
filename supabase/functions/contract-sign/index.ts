// Supabase Edge Function: contract-sign
// Two-party e-signature for job contracts (milestone / recurring / big jobs).
//   action "contractor_sign" → the assigned contractor signs and SENDS the contract to the client.
//   action "client_sign"     → the client signs to accept; we build an immutable signed copy and email both parties.
// Both actions capture the signer's typed legal name + IP + timestamp into job_contracts (audit trail).
// Legally valid electronic signature under Alberta's Electronic Transactions Act + PIPEDA.
// Deploy: supabase functions deploy contract-sign  (verify_jwt = true — the signer must be authenticated)
// Secret needed: RESEND_API_KEY (SUPABASE_URL / SERVICE_ROLE_KEY auto-injected)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const FROM_EMAIL       = "noreply@freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function mdToHtml(md: string): string {
  const lines = esc(md).split("\n");
  let out = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^#\s+/.test(line))       { if (inList) { out += "</ul>"; inList = false; } out += `<h1 style="font-size:1.4rem;color:#ea6b14;margin:.2rem 0 .8rem;">${line.replace(/^#\s+/, "")}</h1>`; continue; }
    if (/^##\s+/.test(line))      { if (inList) { out += "</ul>"; inList = false; } out += `<h2 style="font-size:1.05rem;margin:1rem 0 .3rem;">${line.replace(/^##\s+/, "")}</h2>`; continue; }
    if (/^-\s+/.test(line))       { if (!inList) { out += `<ul style="margin:.2rem 0 .2rem 1.1rem;padding:0;">`; inList = true; } out += `<li style="margin:.1rem 0;">${line.replace(/^-\s+/, "")}</li>`; continue; }
    if (line.trim() === "")       { if (inList) { out += "</ul>"; inList = false; } continue; }
    if (inList) { out += "</ul>"; inList = false; }
    out += `<p style="line-height:1.55;margin:.35rem 0;">${line}</p>`;
  }
  if (inList) out += "</ul>";
  return out;
}

const wrap = (inner: string) => `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">${inner}</div>`;
const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-block;margin-top:1.25rem;padding:.7rem 1.4rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${label}</a>`;

async function sendEmail(to: string, subject: string, html: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) console.error("Resend error:", JSON.stringify(await res.json()));
  } catch (e) { console.error("Resend threw:", e); }
}

async function resolveRecipient(userId: string): Promise<{ email: string | null; firstName: string }> {
  let email: string | null = null;
  let firstName = "there";
  const { data: p } = await admin.from("profiles").select("email, first_name").eq("id", userId).maybeSingle();
  if (p) { email = p.email ?? null; if (p.first_name) firstName = p.first_name; }
  if (!email) { const { data: u } = await admin.auth.admin.getUserById(userId); email = u?.user?.email ?? null; }
  return { email, firstName };
}

function buildSignedHtml(c: any, code: string): string {
  const contractBody = c.source === "uploaded"
    ? `<p style="line-height:1.55;">This agreement incorporates a document supplied by the contractor (on file). The standard Freddy Fix It terms and the Alberta cancellation rights below also apply.</p>${mdToHtml(c.body_md || "")}`
    : mdToHtml(c.body_md || "");
  const custom = c.custom_clauses
    ? `<h2 style="font-size:1.05rem;margin:1rem 0 .3rem;">Additional terms (from the contractor)</h2>${mdToHtml(c.custom_clauses)}`
    : "";
  const fmt = (ts: string) => new Date(ts).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "long", timeStyle: "short" });
  const sigRow = (label: string, name: string, at: string, ip: string) => `
    <div style="flex:1;min-width:220px;border:1px solid rgba(240,244,255,.2);border-radius:10px;padding:.8rem 1rem;">
      <div style="font-size:.75rem;color:rgba(240,244,255,.6);text-transform:uppercase;letter-spacing:.05em;">${label}</div>
      <div style="font-family:'Brush Script MT',cursive;font-size:1.5rem;margin:.2rem 0;">${esc(name)}</div>
      <div style="font-size:.78rem;color:rgba(240,244,255,.7);">Signed ${at}</div>
      <div style="font-size:.7rem;color:rgba(240,244,255,.5);">IP ${esc(ip || "unknown")}</div>
    </div>`;
  return wrap(`
    <div style="text-align:center;margin-bottom:1rem;">
      <div style="font-size:1.2rem;font-weight:700;color:#ea6b14;">Freddy Fix It — Signed Service Agreement</div>
      <div style="font-size:.8rem;color:rgba(240,244,255,.6);">Job ${code} · fully executed</div>
    </div>
    <div style="background:#151d2e;border-radius:10px;padding:1.1rem 1.3rem;">${contractBody}${custom}</div>
    <h2 style="font-size:1.05rem;margin:1.4rem 0 .5rem;">Signatures</h2>
    <div style="display:flex;gap:.8rem;flex-wrap:wrap;">
      ${sigRow("Contractor", c.contractor_sig_name || "—", fmt(c.contractor_signed_at), c.contractor_sig_ip)}
      ${sigRow("Client", c.client_sig_name || "—", fmt(c.client_signed_at), c.client_sig_ip)}
    </div>
    <p style="font-size:.75rem;color:rgba(240,244,255,.55);margin-top:1.2rem;line-height:1.5;">
      Each party adopted the typed name above as their legal electronic signature and consented to sign electronically.
      This copy records the signers, timestamps and network addresses as a tamper-evident audit trail. Full terms: freddyfixit.ca/user-agreement.
    </p>`);
}

function jobCode(id: string): string { return "FFX-" + id.replace(/-/g, "").slice(0, 5).toUpperCase(); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { action, job_id, signer_name } = await req.json() as {
      action: "contractor_sign" | "client_sign"; job_id: string; signer_name: string;
    };
    if (!action || !job_id) return json({ error: "action and job_id are required" }, 400);
    if (!signer_name || signer_name.trim().length < 2) return json({ error: "A typed legal name is required to sign." }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Not authenticated" }, 401);

    const { data: job } = await admin.from("jobs").select("id, client_id, contractor_id").eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);

    const { data: contract } = await admin.from("job_contracts").select("*").eq("job_id", job_id).maybeSingle();
    if (!contract) return json({ error: "No contract prepared for this job yet." }, 409);

    const ip = clientIp(req);
    const now = new Date().toISOString();

    if (action === "contractor_sign") {
      if (user.id !== job.contractor_id) return json({ error: "Only the assigned contractor can sign here." }, 403);
      if (contract.status === "signed") return json({ error: "This contract is already fully signed." }, 409);
      if (contract.source === "uploaded" && !contract.uploaded_ack) return json({ error: "Accept the uploaded-document acknowledgment first." }, 400);
      const { error } = await admin.from("job_contracts").update({
        contractor_signed_at: now, contractor_sig_name: signer_name.trim(), contractor_sig_ip: ip, status: "sent",
      }).eq("job_id", job_id).neq("status", "signed");
      if (error) return json({ error: error.message }, 500);

      const r = await resolveRecipient(job.client_id);
      if (r.email) await sendEmail(r.email, "✍️ Please review & sign your job agreement",
        wrap(`<h1 style="font-size:1.5rem;color:#ea6b14;margin-bottom:1rem;">A contract is ready for your signature</h1>
          <p style="line-height:1.6;">Hi ${r.firstName}, your contractor has prepared and signed the agreement for job <strong>${jobCode(job_id)}</strong>. Please review it and add your signature — this is required before any payment is collected.</p>
          ${button("https://freddyfixit.ca/client-dashboard", "Review & Sign →")}`));
      return json({ ok: true, status: "sent" });
    }

    if (action === "client_sign") {
      if (user.id !== job.client_id) return json({ error: "Only the client can sign here." }, 403);
      if (contract.status === "signed") return json({ ok: true, status: "signed", note: "already signed" });
      if (contract.status !== "sent" || !contract.contractor_signed_at)
        return json({ error: "The contractor hasn't sent the contract yet." }, 409);

      const signedContract = { ...contract, client_signed_at: now, client_sig_name: signer_name.trim(), client_sig_ip: ip };
      const signedHtml = buildSignedHtml(signedContract, jobCode(job_id));

      const { error } = await admin.from("job_contracts").update({
        client_signed_at: now, client_sig_name: signer_name.trim(), client_sig_ip: ip,
        status: "signed", signed_at: now, signed_html: signedHtml,
      }).eq("job_id", job_id).eq("status", "sent");
      if (error) return json({ error: error.message }, 500);

      const [rc, rk] = await Promise.all([resolveRecipient(job.client_id), resolveRecipient(job.contractor_id)]);
      const subject = `✅ Signed agreement — job ${jobCode(job_id)}`;
      if (rc.email) await sendEmail(rc.email, subject, signedHtml);
      if (rk.email) await sendEmail(rk.email, subject, signedHtml);
      return json({ ok: true, status: "signed" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("contract-sign error:", e);
    return json({ error: String(e) }, 500);
  }
});
