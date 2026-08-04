// Supabase Edge Function: notify-message
// Emails the OTHER party in a job when a new dashboard chat message arrives, so
// clients and contractors get notified off-platform. Called by the DB trigger
// notify_new_message() (which already enforces a ~15-min-per-(job,recipient)
// throttle via message_email_log), so this fn just renders + sends.
// verify_jwt = false (invoked server-side by Postgres).
//
// AUTH: verify_jwt is NOT authentication on this project — the anon key is
// itself a valid project-signed JWT and ships publicly in the browser bundle,
// so "Bearer <anon>" proves nothing. The DB now mints a single-use token
// (public.issue_internal_token) and sends it as x-ff-internal; we redeem it
// here. Without this, anyone could POST a message_id and make the platform
// send a DKIM-signed email to that job's other party.
// Secret needed: RESEND_API_KEY  (SUPABASE_URL / SERVICE_ROLE_KEY auto-injected)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL       = "noreply@freddyfixit.ca";
const SITE             = "https://freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const jobCode = (id: string) => "FFX-" + String(id).replace(/-/g, "").slice(0, 5).toUpperCase();

// Single-use token minted by the database. Redeeming it is what proves the
// caller is Postgres and not the open internet.
async function callerIsInternal(req: Request): Promise<boolean> {
  const t = req.headers.get("x-ff-internal") ?? "";
  if (!t) return false;
  const { data, error } = await admin.rpc("consume_internal_token", {
    p_token: t,
    p_purpose: "edge-internal",
  });
  return !error && data === true;
}

const forbidden = () =>
  new Response(JSON.stringify({ ok: false, error: "forbidden" }),
    { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

async function lookupPerson(userId: string) {
  let email: string | null = null, name = "";
  const { data: p } = await admin.from("profiles")
    .select("first_name,last_name,email").eq("id", userId).maybeSingle();
  if (p) {
    name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    email = p.email ?? null;
  }
  if (!email || !name) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    email = email || (u?.user?.email ?? null);
    if (!name) name = ((u?.user?.user_metadata as any)?.first_name ?? "") + "";
  }
  return { email, name: (name || "there").trim() };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await callerIsInternal(req))) return forbidden();

    const body = await req.json().catch(() => ({}));
    const messageId   = String(body?.message_id || "");
    let   recipientId = body?.recipient_id ? String(body.recipient_id) : "";
    if (!messageId) {
      return new Response(JSON.stringify({ ok: false, error: "missing message_id" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: msg } = await admin.from("messages")
      .select("id,job_id,sender_id,content,attachment_type").eq("id", messageId).maybeSingle();
    if (!msg) {
      return new Response(JSON.stringify({ ok: false, error: "message not found" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: job } = await admin.from("jobs")
      .select("id,client_id,contractor_id").eq("id", msg.job_id).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ ok: false, error: "job not found" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Resolve recipient = the party who did NOT send (if not supplied).
    if (!recipientId) {
      if (msg.sender_id === job.client_id) recipientId = job.contractor_id;
      else if (msg.sender_id === job.contractor_id) recipientId = job.client_id;
    }
    if (!recipientId || recipientId === msg.sender_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no recipient" }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // recipient_id arrives in the body, so never take it on trust: it must be
    // one of the two parties on THIS job. Otherwise a caller could name any
    // user id and have that person emailed someone else's message content.
    if (recipientId !== job.client_id && recipientId !== job.contractor_id) {
      console.warn("notify-message: recipient not a party to job", msg.job_id);
      return new Response(JSON.stringify({ ok: true, skipped: "recipient not a job party" }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const recipient = await lookupPerson(recipientId);
    if (!recipient.email) {
      return new Response(JSON.stringify({ ok: true, skipped: "no recipient email" }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const sender = await lookupPerson(msg.sender_id);

    const isClient   = recipientId === job.client_id;
    const dashPath   = isClient ? "/client-dashboard" : "/contractor-dashboard";
    const senderRole = recipientId === job.client_id ? "your contractor" : "your client";

    const raw = String(msg.content || "").trim();
    const snippet = raw
      ? esc(raw.length > 220 ? raw.slice(0, 220) + "…" : raw)
      : (msg.attachment_type
          ? `Sent you ${String(msg.attachment_type).startsWith("video") ? "a video" : "a photo"}.`
          : "Sent you a message.");

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
        <h2 style="color:#ea6b14;margin:0 0 .75rem;">New message on Freddy Fix It</h2>
        <p style="font-size:16px;margin:0 0 1rem;">Hi ${esc(recipient.name)}, ${esc(sender.name)} (${esc(senderRole)}) sent you a message about job <strong>${esc(jobCode(job.id))}</strong>:</p>
        <div style="background:rgba(255,255,255,.06);border-left:3px solid #ea6b14;border-radius:8px;padding:1rem 1.1rem;margin:0 0 1.25rem;font-size:15px;line-height:1.5;">${snippet}</div>
        <a href="${SITE}${dashPath}" style="display:inline-block;background:#ea6b14;color:#fff;text-decoration:none;font-weight:600;padding:.7rem 1.4rem;border-radius:8px;">Open your dashboard to reply</a>
        <p style="margin-top:1.5rem;font-size:12px;color:#9aa4bf;">Please reply inside your dashboard so everything stays on your job record. You won't get an email for every message — at most one every 15 minutes per job.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipient.email,
        subject: `New message about job ${jobCode(job.id)}`,
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
    console.error("notify-message error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
