// Supabase Edge Function: admin-message
// The platform admin sends a custom email to one or many contractors straight
// from the dashboard. Admin-gated (the caller's JWT must belong to a profile
// with role='admin'). Recipient emails are looked up SERVER-SIDE from the
// recipient user ids (never trusted from the client). Each send is logged to
// public.admin_messages (shared batch_id per compose). Sent from noreply@ with
// Reply-To hello@ so replies land in the shared inbox.
// verify_jwt = true.  Secret needed: RESEND_API_KEY (URL / SERVICE_ROLE auto).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const FROM_EMAIL       = "noreply@freddyfixit.ca";
const REPLY_TO         = "hello@freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

async function lookupRecipient(userId: string) {
  let email: string | null = null, name = "";
  const { data: p } = await admin.from("profiles")
    .select("first_name,last_name,email").eq("id", userId).maybeSingle();
  if (p) {
    name  = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    email = p.email ?? null;
  }
  if (!email) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    email = u?.user?.email ?? null;
    if (!name) name = ((u?.user?.user_metadata as any)?.first_name ?? "") + "";
  }
  return { email, name: name.trim() };
}

function buildHtml(name: string, subject: string, bodyText: string) {
  const greeting = name ? `Hi ${esc(name.split(" ")[0])},` : "Hi there,";
  const bodyHtml = esc(bodyText).replace(/\n/g, "<br>");
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
    <div style="font-family:'Bebas Neue',Arial,sans-serif;font-size:1.6rem;letter-spacing:.04em;color:#ea6b14;margin-bottom:1rem;">Freddy Fix It</div>
    <p style="font-size:15px;margin:0 0 1rem;">${greeting}</p>
    <div style="font-size:15px;line-height:1.6;">${bodyHtml}</div>
    <p style="margin-top:1.75rem;font-size:12px;color:#9aa4bf;">Sent by the Freddy Fix It team. Reply to this email to reach us at ${esc(REPLY_TO)}.</p>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // ── Admin gate ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ ok: false, error: "missing auth" }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await asUser.auth.getUser();
    const uid = ures?.user?.id;
    if (!uid) return json({ ok: false, error: "not signed in" }, 401);
    const { data: me } = await admin.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (me?.role !== "admin") return json({ ok: false, error: "not authorized" }, 403);

    // ── Payload ─────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.recipient_ids)
      ? [...new Set(body.recipient_ids.map((x: unknown) => String(x)).filter(Boolean))] : [];
    const subject = String(body?.subject || "").trim().slice(0, 200);
    const message = String(body?.body || "").trim();
    if (!ids.length)  return json({ ok: false, error: "no recipients" }, 400);
    if (!subject)     return json({ ok: false, error: "subject is required" }, 400);
    if (!message)     return json({ ok: false, error: "message is required" }, 400);
    if (ids.length > 200) return json({ ok: false, error: "too many recipients (max 200)" }, 400);

    const batchId = crypto.randomUUID();
    const results: Array<{ id: string; ok: boolean; email?: string; error?: string }> = [];

    for (const rid of ids) {
      const { email, name } = await lookupRecipient(rid);
      if (!email) {
        await admin.from("admin_messages").insert({
          batch_id: batchId, sender_id: uid, recipient_id: rid, recipient_email: "(unknown)",
          recipient_name: name || null, subject, body: message, status: "failed", error: "no email on file",
        });
        results.push({ id: rid, ok: false, error: "no email on file" });
        continue;
      }
      let sent = false, errMsg: string | null = null;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL, to: email, reply_to: REPLY_TO,
            subject, html: buildHtml(name, subject, message),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) sent = true; else errMsg = (data?.message ? String(data.message) : `send failed (${res.status})`);
      } catch (e) { errMsg = String(e); }

      await admin.from("admin_messages").insert({
        batch_id: batchId, sender_id: uid, recipient_id: rid, recipient_email: email,
        recipient_name: name || null, subject, body: message,
        status: sent ? "sent" : "failed", error: sent ? null : errMsg,
      });
      results.push({ id: rid, ok: sent, email, error: sent ? undefined : (errMsg || undefined) });
    }

    const sentCount = results.filter((r) => r.ok).length;
    return json({ ok: true, batch_id: batchId, sent: sentCount, failed: results.length - sentCount, results });
  } catch (e) {
    console.error("admin-message error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
