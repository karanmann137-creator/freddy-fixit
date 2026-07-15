// payment-receipt — emails a branded client receipt + contractor payout statement
// when funds are released. Called by DB triggers (net.http_post, anon bearer):
//   { event: 'job_released',       id: <job uuid> }        — single-charge & prepaid jobs
//   { event: 'milestone_released', id: <milestone uuid> }  — one escrow stage
// verify_jwt=false (DB-invoked). Idempotent: claims receipt_sent_at (WHERE null)
// before sending, so replays/anon calls can never send twice.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "Freddy Fix It <noreply@freddyfixit.ca>";
const REPLY_TO = "hello@freddyfixit.ca";

const money = (n: number | null | undefined) =>
  "$" + (Number(n) || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jobCode = (id: string) => "FFX-" + id.replace(/-/g, "").slice(0, 5).toUpperCase();
const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (iso?: string | null) =>
  new Date(iso || Date.now()).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Edmonton" });

function shell(title: string, rows: string, note: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0f1420">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">
    <div style="background:#1a2236;border:1px solid rgba(240,244,255,.08);border-radius:12px;overflow:hidden">
      <div style="background:#151d2e;padding:18px 24px;border-bottom:2px solid #ea6b14">
        <span style="color:#ea6b14;font-size:20px;font-weight:bold;letter-spacing:1px">FREDDY FIX IT</span>
      </div>
      <div style="padding:24px">
        <h1 style="color:#f0f4ff;font-size:19px;margin:0 0 14px">${title}</h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
        <p style="color:rgba(240,244,255,.55);font-size:12px;line-height:1.7;margin:18px 0 0">${note}</p>
      </div>
      <div style="padding:14px 24px;background:#111827;color:rgba(240,244,255,.35);font-size:11px;line-height:1.7">
        Freddy FixIt Contractors Inc. &middot; Calgary, AB &middot; Questions? Reply to this email or write hello@freddyfixit.ca.<br>
        Keep this receipt for your records.
      </div>
    </div>
  </div></body></html>`;
}
const row = (label: string, value: string, opts?: { strong?: boolean; orange?: boolean }) =>
  `<tr><td style="padding:7px 0;color:rgba(240,244,255,.6);border-bottom:1px solid rgba(240,244,255,.06)">${label}</td>
   <td style="padding:7px 0;text-align:right;border-bottom:1px solid rgba(240,244,255,.06);color:${opts?.orange ? "#ea6b14" : "#f0f4ff"};font-weight:${opts?.strong ? "bold" : "normal"}">${value}</td></tr>`;

async function send(to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }),
  });
  if (!r.ok) console.error("resend failed", to, r.status, await r.text());
}

async function emailOf(userId: string): Promise<string | null> {
  const { data: p } = await SB.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (p?.email) return p.email;
  const { data: u } = await SB.auth.admin.getUserById(userId);
  return u?.user?.email ?? null;
}

async function parties(job: any) {
  const [{ data: req }, { data: cp }, { data: kp }, { data: co }] = await Promise.all([
    SB.from("client_requests").select("service_needed, location").eq("id", job.request_id).maybeSingle(),
    SB.from("profiles").select("first_name, email").eq("id", job.client_id).maybeSingle(),
    SB.from("profiles").select("first_name, email").eq("id", job.contractor_id).maybeSingle(),
    SB.from("contractors").select("company_name").eq("id", job.contractor_id).maybeSingle(),
  ]);
  return {
    service: req?.service_needed || "Home service",
    clientName: cp?.first_name || "there",
    clientEmail: cp?.email || (await emailOf(job.client_id)),
    proName: co?.company_name || kp?.first_name || "Your pro",
    proEmail: kp?.email || (await emailOf(job.contractor_id)),
  };
}

Deno.serve(async (req) => {
  try {
    const { event, id } = await req.json().catch(() => ({}));
    if (!event || !id) return new Response(JSON.stringify({ ok: false, error: "bad payload" }), { status: 400 });

    if (event === "job_released") {
      // Claim the receipt (idempotent) — only rows actually released & un-receipted.
      const { data: claimed } = await SB.from("jobs")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", id).eq("payment_status", "released").is("receipt_sent_at", null)
        .select("id, request_id, client_id, contractor_id, amount, client_fee, contractor_payout, platform_fee, released_at, prepayment_id, prepayment_seq, is_milestone");
      const job = claimed?.[0];
      if (!job) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
      if (job.is_milestone) return new Response(JSON.stringify({ ok: true, skipped: "milestone job — stage receipts sent per release" }), { status: 200 });

      const p = await parties(job);
      const code = jobCode(job.id);
      const amount = Number(job.amount) || 0;
      const fee = Number(job.client_fee) || 0;
      const payout = Number(job.contractor_payout) || Math.round(amount * 93) / 100;
      const commission = Math.round((amount - payout) * 100) / 100;
      const prepaid = !!job.prepayment_id;

      if (p.clientEmail) {
        const rows =
          row("Job", esc(p.service)) + row("Job ID", code) + row("Pro", esc(p.proName)) +
          row("Date completed", fmtDate(job.released_at)) +
          row("Service amount", money(amount)) +
          row("Service fee", fee > 0 ? money(fee) : "$0.00 (waived)") +
          row("Total paid", money(amount + fee), { strong: true, orange: true });
        const note = prepaid
          ? `This visit (#${job.prepayment_seq ?? ""}) was covered by your prepaid plan — no new charge was made. Payment for this visit has now been released to your pro.`
          : "Your payment was held securely and has now been released to your pro. No further action is needed.";
        await send(p.clientEmail, `Receipt — ${p.service} (${code})`, shell("Payment receipt", rows, note));
      }
      if (p.proEmail) {
        const rows =
          row("Job", esc(p.service)) + row("Job ID", code) + row("Client", esc(p.clientName)) +
          row("Released on", fmtDate(job.released_at)) +
          row("Job amount", money(amount)) +
          row("Platform commission (7%)", "&minus;" + money(commission)) +
          row("Your payout", money(payout), { strong: true, orange: true });
        await send(p.proEmail, `Payout statement — ${p.service} (${code})`, shell("Payout statement",
          rows, "Your payout is on its way to your connected payout account (arrives in 1&ndash;3 business days). Keep this statement for your tax records."));
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (event === "milestone_released") {
      const { data: claimed } = await SB.from("job_milestones")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", id).eq("status", "released").is("receipt_sent_at", null)
        .select("id, job_id, seq, title, amount, client_fee, contractor_payout, released_at");
      const ms = claimed?.[0];
      if (!ms) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });

      const { data: job } = await SB.from("jobs")
        .select("id, request_id, client_id, contractor_id").eq("id", ms.job_id).maybeSingle();
      if (!job) return new Response(JSON.stringify({ ok: true, skipped: "no job" }), { status: 200 });

      const p = await parties(job);
      const code = jobCode(job.id);
      const amount = Number(ms.amount) || 0;
      const fee = Number(ms.client_fee) || 0;
      const payout = Number(ms.contractor_payout) || Math.round(amount * 93) / 100;
      const commission = Math.round((amount - payout) * 100) / 100;
      const stage = `Stage ${ms.seq}${ms.title ? " — " + esc(ms.title) : ""}`;

      if (p.clientEmail) {
        const rows =
          row("Job", esc(p.service)) + row("Job ID", code) + row("Stage", stage) +
          row("Pro", esc(p.proName)) + row("Date", fmtDate(ms.released_at)) +
          row("Stage amount", money(amount)) +
          row("Service fee", fee > 0 ? money(fee) : "$0.00 (waived)") +
          row("Total paid this stage", money(amount + fee), { strong: true, orange: true });
        await send(p.clientEmail, `Receipt — ${p.service}, ${stage.replace(/&mdash;|&#8212;/g, "-")} (${code})`,
          shell("Stage payment receipt", rows, "You approved this stage and its payment has been released to your pro. Later stages are only charged when you fund them."));
      }
      if (p.proEmail) {
        const rows =
          row("Job", esc(p.service)) + row("Job ID", code) + row("Stage", stage) +
          row("Client", esc(p.clientName)) + row("Released on", fmtDate(ms.released_at)) +
          row("Stage amount", money(amount)) +
          row("Platform commission (7%)", "&minus;" + money(commission)) +
          row("Your payout", money(payout), { strong: true, orange: true });
        await send(p.proEmail, `Payout statement — ${p.service}, Stage ${ms.seq} (${code})`,
          shell("Stage payout statement", rows, "Your payout is on its way to your connected payout account (arrives in 1&ndash;3 business days). Keep this statement for your tax records."));
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: false, error: "unknown event" }), { status: 400 });
  } catch (e) {
    console.error("payment-receipt error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
