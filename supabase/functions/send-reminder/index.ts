// Generic transactional reminder/nudge email (seasonal, recurring, referral).
// Called from Postgres (net.http_post) with a user_id; looks up the email with
// the service-role key and sends a brand-styled message via Resend.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const FROM = "Freddy Fix It <noreply@freddyfixit.ca>";

function wrap(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string) {
  const button = ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:1.2rem;background:#ea6b14;color:#fff;text-decoration:none;padding:.8rem 1.6rem;border-radius:10px;font-weight:700;">${ctaLabel || "Open Freddy Fix It →"}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0f1420;padding:24px;font-family:'Segoe UI',Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#1a2236;border-radius:16px;padding:32px;color:#f0f4ff;">
      <div style="font-size:1.4rem;font-weight:800;color:#ea6b14;letter-spacing:.5px;margin-bottom:1.2rem;">FREDDY FIX IT</div>
      <h1 style="font-size:1.6rem;color:#f0f4ff;margin:0 0 1rem;">${title}</h1>
      <div style="line-height:1.6;color:#c9d4ef;font-size:1rem;">${bodyHtml}</div>
      ${button}
      <p style="margin-top:2rem;font-size:.8rem;color:#7f8db0;">Freddy FixIt Contractors Inc. · Calgary, AB · <a href="https://freddyfixit.ca" style="color:#7f8db0;">freddyfixit.ca</a></p>
    </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "no resend key" }, 500);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { user_id, email, subject, title, body, cta_url, cta_label } = await req.json();

    let to: string | null = email ?? null;
    if (!to && user_id) {
      const { data } = await admin.from("profiles").select("email").eq("id", user_id).maybeSingle();
      to = data?.email ?? null;
    }
    if (!to) return json({ status: "skipped", reason: "no recipient" });

    const html = wrap(title || subject || "Freddy Fix It", body || "", cta_url, cta_label);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: subject || title, html }),
    });
    return json({ status: "sent", to, result: await r.json() });
  } catch (e) {
    console.error("send-reminder:", String(e));
    return json({ error: String(e) }, 500);
  }
});
