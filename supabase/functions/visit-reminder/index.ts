// visit-reminder — one hour before a booked visit, remind both sides with the
// address, the time, the price and what they actually agreed in the chat.
//
// Called by pg_cron every 10 minutes (net.http_post, anon bearer) via
// public.kick_visit_reminders(). verify_jwt=false because the DB invokes it.
//
// SENDING IS OFF BY DEFAULT. public.visit_reminder_enabled() returns false, so
// this function still runs, still stamps hour_reminder_sent_at and still writes
// the in-app bell — it just skips Resend. To turn email on, one command:
//   create or replace function public.visit_reminder_enabled() returns boolean
//   language sql immutable as $$ select true $$;
//
// Idempotent: claims hour_reminder_sent_at (WHERE null) before doing anything,
// so a replay or a double cron tick can never send twice.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "Freddy Fix It <noreply@freddyfixit.ca>";
const REPLY_TO = "hello@freddyfixit.ca";

const jobCode = (id: string) => "FFX-" + id.replace(/-/g, "").slice(0, 5).toUpperCase();
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n: unknown) =>
  "$" + (Number(n) || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (iso?: string | null) =>
  new Date(iso || Date.now()).toLocaleString("en-CA", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton",
  });

function shell(heading: string, lead: string, rows: string, chat: string, cta: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0f1420">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">
    <div style="background:#1a2236;border:1px solid rgba(240,244,255,.08);border-radius:12px;overflow:hidden">
      <div style="background:#151d2e;padding:18px 24px;border-bottom:2px solid #ea6b14">
        <span style="color:#ea6b14;font-size:20px;font-weight:bold;letter-spacing:1px">FREDDY FIX IT</span>
      </div>
      <div style="padding:24px">
        <h1 style="color:#f0f4ff;font-size:19px;margin:0 0 8px">${heading}</h1>
        <p style="color:rgba(240,244,255,.7);font-size:14px;line-height:1.7;margin:0 0 16px">${lead}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
        ${chat}
        ${cta}
      </div>
      <div style="padding:14px 24px;background:#111827;color:rgba(240,244,255,.35);font-size:11px;line-height:1.7">
        Freddy FixIt Contractors Inc. &middot; 20 Whiteram Mews NE, Calgary, AB &middot; Questions? Reply to this email or write hello@freddyfixit.ca.
      </div>
    </div>
  </div></body></html>`;
}
const row = (label: string, value: string, orange = false) =>
  `<tr><td style="padding:7px 0;color:rgba(240,244,255,.6);border-bottom:1px solid rgba(240,244,255,.06);width:40%">${label}</td>
   <td style="padding:7px 0;border-bottom:1px solid rgba(240,244,255,.06);color:${orange ? "#ea6b14" : "#f0f4ff"};font-weight:${orange ? "bold" : "normal"}">${value}</td></tr>`;

const button = (href: string, label: string) =>
  `<p style="margin:20px 0 0"><a href="${href}" style="display:inline-block;background:#ea6b14;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;font-size:14px">${label}</a></p>`;

async function send(to: string, subject: string, html: string) {
  if (!RESEND_KEY) { console.log("visit-reminder: no RESEND_API_KEY, skipping", to); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }),
  });
  if (!r.ok) console.error("resend failed", to, r.status, await r.text());
}

async function emailOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data: p } = await SB.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (p?.email) return p.email;
  const { data: u } = await SB.auth.admin.getUserById(userId);
  return u?.user?.email ?? null;
}

/**
 * The last few messages, verbatim. No AI, no summarising, nothing invented —
 * blocked messages are excluded because they were never delivered.
 */
async function chatBlock(jobId: string, clientId: string | null, contractorId: string | null) {
  const { data } = await SB.from("messages")
    .select("content, sender_id, created_at, attachment_type")
    .eq("job_id", jobId).eq("blocked", false)
    .order("created_at", { ascending: false }).limit(8);
  const msgs = (data ?? []).reverse().filter((m: any) => (m.content ?? "").trim() || m.attachment_type);
  if (!msgs.length) return "";
  const lines = msgs.map((m: any) => {
    const who = m.sender_id === clientId ? "Client" : m.sender_id === contractorId ? "Pro" : "";
    const body = (m.content ?? "").trim() || (m.attachment_type?.startsWith("video") ? "(sent a video)" : "(sent a photo)");
    return `<div style="margin:0 0 8px"><span style="color:#ea6b14;font-weight:bold">${esc(who)}:</span>
      <span style="color:rgba(240,244,255,.85)">${esc(body)}</span></div>`;
  }).join("");
  return `<div style="margin:18px 0 0;padding:14px;background:rgba(240,244,255,.04);border-left:3px solid #ea6b14;border-radius:6px">
    <div style="color:rgba(240,244,255,.55);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px">What you discussed</div>
    <div style="font-size:13px;line-height:1.6">${lines}</div>
  </div>`;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({} as any));
    const dryRun = body?.dryRun === true;

    const { data: flag } = await SB.rpc("visit_reminder_enabled");
    const emailOn = flag === true && !dryRun;

    // 50-70 minute window: wide enough that a 10-minute cron never misses a job,
    // narrow enough that "one hour before" stays true. The claim below makes the
    // overlap harmless.
    const from = new Date(Date.now() + 50 * 60_000).toISOString();
    const to = new Date(Date.now() + 70 * 60_000).toISOString();

    const { data: due, error } = await SB.from("jobs")
      .select("id, request_id, client_id, contractor_id, amount, scheduled_at, notes, quote_assumptions")
      .eq("status", "scheduled")
      .is("hour_reminder_sent_at", null)
      .gte("scheduled_at", from).lte("scheduled_at", to);
    if (error) throw error;

    const results: any[] = [];

    for (const job of due ?? []) {
      // Claim first — a second cron tick will get zero rows back and skip.
      const { data: claimed } = await SB.from("jobs")
        .update({ hour_reminder_sent_at: new Date().toISOString() })
        .eq("id", job.id).is("hour_reminder_sent_at", null)
        .select("id");
      if (!claimed?.length) continue;

      const [{ data: reqRow }, { data: cp }, { data: kp }, { data: co }] = await Promise.all([
        SB.from("client_requests").select("service_needed, location, job_description").eq("id", job.request_id).maybeSingle(),
        SB.from("profiles").select("first_name, last_name, phone, email").eq("id", job.client_id).maybeSingle(),
        SB.from("profiles").select("first_name, last_name, phone, email").eq("id", job.contractor_id).maybeSingle(),
        SB.from("contractors").select("company_name").eq("id", job.contractor_id).maybeSingle(),
      ]);

      const service = reqRow?.service_needed || "Home service";
      const address = reqRow?.location || "See the job in your dashboard";
      const when = fmtTime(job.scheduled_at);
      const code = jobCode(job.id);
      const clientName = [cp?.first_name, cp?.last_name].filter(Boolean).join(" ") || "Your client";
      const proName = co?.company_name || [kp?.first_name, kp?.last_name].filter(Boolean).join(" ") || "Your pro";
      const chat = await chatBlock(job.id, job.client_id, job.contractor_id);

      // In-app bell always fires, email or not.
      const bells = await Promise.all([
        SB.rpc("_notify", {
          p_user: job.contractor_id,
          p_type: "visit_reminder",
          p_title: "Your job starts in about an hour",
          p_body: `${service} at ${address} — ${when}. Client: ${clientName}${cp?.phone ? " (" + cp.phone + ")" : ""}.`,
          p_job: job.id,
        }),
        SB.rpc("_notify", {
          p_user: job.client_id,
          p_type: "visit_reminder",
          p_title: "Your pro arrives in about an hour",
          p_body: `${proName} is booked for ${service} at ${when}.`,
          p_job: job.id,
        }),
      ]);
      for (const b of bells) if (b.error) console.error("visit-reminder notify failed", b.error);

      if (emailOn) {
        const proEmail = kp?.email || (await emailOf(job.contractor_id));
        const clientEmail = cp?.email || (await emailOf(job.client_id));

        if (proEmail) {
          const rows =
            row("Job", esc(service)) +
            row("Address", esc(address), true) +
            row("Time", esc(when), true) +
            row("Client", esc(clientName)) +
            (cp?.phone ? row("Client phone", esc(cp.phone)) : "") +
            row("Agreed price", money(job.amount)) +
            row("Job ID", code) +
            (reqRow?.job_description ? row("What they asked for", esc(String(reqRow.job_description).slice(0, 400))) : "") +
            (job.notes ? row("Your notes", esc(String(job.notes).slice(0, 400))) : "");
          await send(proEmail, `Starting in 1 hour — ${service} at ${address}`,
            shell("You're on in about an hour",
              "Here's everything you need for this visit. Remember to ask the client to confirm the job is done before you leave — that's what releases your payment.",
              rows, chat, button("https://freddyfixit.ca/contractor-dashboard?job=" + job.id, "Open the job")));
        }

        if (clientEmail) {
          const rows =
            row("Job", esc(service)) +
            row("Your pro", esc(proName), true) +
            row("Time", esc(when), true) +
            (kp?.phone ? row("Pro's phone", esc(kp.phone)) : "") +
            row("Address", esc(address)) +
            row("Agreed price", money(job.amount)) +
            row("Job ID", code);
          await send(clientEmail, `${proName} arrives in about an hour — ${service}`,
            shell("Your pro is on the way soon",
              "A quick reminder of what's booked. Once the work is finished, confirm it in your dashboard — that's what releases payment to your pro.",
              rows, chat, button("https://freddyfixit.ca/client-dashboard?job=" + job.id, "Open the job")));
        }
      }

      results.push({ job: job.id, emailed: emailOn });
    }

    return new Response(JSON.stringify({ ok: true, emailEnabled: emailOn, count: results.length, results }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("visit-reminder error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
