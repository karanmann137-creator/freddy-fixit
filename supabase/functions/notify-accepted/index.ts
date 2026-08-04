import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM           = "noreply@freddyfixit.ca";
const BID_CAP        = 7;
const admin          = createClient(SUPABASE_URL, SERVICE_KEY);
const cors           = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// Every value below is interpolated straight into email HTML. Escape it.
// This fn is called only by accept_bid / place_bid, but the body still arrives
// over HTTP, so treat it as untrusted input regardless.
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// AUTH: verify_jwt is NOT authentication here — the anon key is a valid
// project-signed JWT that ships in the public JS bundle. accept_bid/place_bid
// mint a single-use token via public.issue_internal_token and send it as
// x-ff-internal; redeeming it is what proves the caller is Postgres.
async function callerIsInternal(req: Request): Promise<boolean> {
  const t = req.headers.get("x-ff-internal") ?? "";
  if (!t) return false;
  const { data, error } = await admin.rpc("consume_internal_token", {
    p_token: t,
    p_purpose: "edge-internal",
  });
  return !error && data === true;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: `Freddy Fix It <${FROM}>`, to, subject, html }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── First-won-job email: celebrate + coach + require payout setup ──────────────
// Sent instead of the standard "bid accepted" email the very first time a
// contractor wins a job. Detected by counting their rows in `jobs` (accept_bid
// inserts the job row BEFORE calling this fn, so first job => count <= 1).
function firstJobHtml(opts: {
  name: string; service: string; location: string; client_name: string;
  amount: number | null; payoutsReady: boolean;
}) {
  // Escape once here so every interpolation in the template below is safe.
  const payoutsReady = opts.payoutsReady;
  const name        = esc(opts.name);
  const service     = esc(opts.service);
  const location    = esc(opts.location);
  const client_name = esc(opts.client_name);
  const amount      = opts.amount != null && Number.isFinite(Number(opts.amount))
    ? Number(opts.amount) : null;
  const tip = (n: string, title: string, body: string) => `
    <tr>
      <td style="vertical-align:top;padding:.55rem .75rem .55rem 0;width:34px;">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(234,107,20,.15);color:#ea6b14;font-weight:700;text-align:center;line-height:28px;font-size:.9rem;">${n}</div>
      </td>
      <td style="vertical-align:top;padding:.55rem 0;font-size:.92rem;line-height:1.5;">
        <strong style="color:#f0f4ff;">${title}</strong><br>
        <span style="color:rgba(190,205,235,.75);">${body}</span>
      </td>
    </tr>`;

  const payoutBox = payoutsReady
    ? `<div style="background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);border-radius:8px;padding:.9rem 1.1rem;margin:1.5rem 0;">
         <span style="color:#22c55e;font-weight:700;">✓ Payouts ready</span>
         <p style="margin:.4rem 0 0;font-size:.9rem;color:rgba(190,205,235,.8);">Your payout account is connected, so you'll get paid automatically once the client confirms the completed work.</p>
       </div>`
    : `<div style="background:rgba(234,107,20,.12);border:1px solid rgba(234,107,20,.45);border-radius:8px;padding:.9rem 1.1rem;margin:1.5rem 0;">
         <span style="color:#ea6b14;font-weight:700;">⚠ Set up your payouts first</span>
         <p style="margin:.4rem 0 .75rem;font-size:.9rem;color:rgba(190,205,235,.85);">You need to connect your payout account before you can complete the job and get paid. It only takes a couple of minutes — do it now so nothing holds up your money later.</p>
         <a href="https://freddyfixit.ca/contractor-dashboard" style="display:inline-block;padding:.6rem 1.25rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:.9rem;">Set up payouts →</a>
       </div>`;

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
    <div style="text-align:center;font-size:2rem;margin-bottom:.25rem;">🎉</div>
    <h2 style="color:#ea6b14;margin:0 0 .5rem;text-align:center;">Congrats — you won your first job!</h2>
    <p style="text-align:center;color:rgba(190,205,235,.8);margin:0 0 1.5rem;">Hi ${name}, <strong>${client_name}</strong> picked your bid${amount ? " of <strong>$" + amount + "</strong>" : ""}. This is a big one — welcome to Freddy Fix It.</p>

    <table style="width:100%;border-collapse:collapse;margin:0 0 .5rem;">
      <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;width:110px;">SERVICE</td><td style="padding:.5rem 0;font-weight:500;">${service}</td></tr>
      <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">LOCATION</td><td style="padding:.5rem 0;">${location}</td></tr>
      ${amount ? `<tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">YOUR BID</td><td style="padding:.5rem 0;color:#22c55e;font-weight:600;">$${amount}</td></tr>` : ""}
    </table>

    ${payoutBox}

    <h3 style="color:#f0f4ff;margin:1.5rem 0 .25rem;font-size:1.05rem;">Tips for your first job</h3>
    <table style="width:100%;border-collapse:collapse;">
      ${tip("1", "Respond and schedule fast", "Log in and propose a time and price right away. Contractors who reply quickly win more repeat clients.")}
      ${tip("2", "Confirm the details before you go", "Re-read the job description, double-check the address and parking, and bring the right tools and materials.")}
      ${tip("3", "Keep it professional on site", "Show up on time, keep the workspace tidy, and message the client through the in-app chat so everything's documented.")}
      ${tip("4", "Take before-and-after photos", "You'll upload a completion photo to mark the job done — good photos also build your profile and earn better reviews.")}
    </table>

    <div style="text-align:center;margin:1.75rem 0 .5rem;">
      <a href="https://freddyfixit.ca/contractor-dashboard" style="display:inline-block;padding:.85rem 1.75rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;">Open your dashboard →</a>
    </div>

    <p style="margin-top:1.5rem;font-size:.78rem;color:rgba(190,205,235,.4);text-align:center;">Questions? hello@freddyfixit.ca or WhatsApp +1 (825) 561-8331</p>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!(await callerIsInternal(req))) {
    return new Response(JSON.stringify({ error: "forbidden" }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const json = await req.json();
  const { event } = json;

  try {

    // ── bid_won: email to winning contractor ────────────────────────────────
    if (event === "bid_won") {
      const { contractor_id } = json;
      // Raw values are kept for firstJobHtml (which escapes internally); the
      // e* copies are the escaped ones used by the plain template below.
      const service = json.service, location = json.location;
      const client_name = json.client_name, amount = json.amount;
      const eService = esc(service), eLocation = esc(location), eClient = esc(client_name);
      const eAmount = amount != null && Number.isFinite(Number(amount)) ? Number(amount) : null;
      const { data: p } = await admin.from("profiles").select("first_name, email").eq("id", contractor_id).maybeSingle();
      if (!p?.email) return ok({ status: "skipped" });
      const name = esc(p.first_name ?? "there");

      // First job? accept_bid inserts the job row before this fn runs, so count<=1 => first.
      let isFirst = false;
      try {
        const { count } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("contractor_id", contractor_id);
        isFirst = (count ?? 0) <= 1;
      } catch (_e) { /* fall through to standard email */ }

      if (isFirst) {
        let payoutsReady = false;
        try {
          const { data: c } = await admin.from("contractors").select("stripe_payouts_enabled").eq("id", contractor_id).maybeSingle();
          payoutsReady = !!c?.stripe_payouts_enabled;
        } catch (_e) { /* assume not ready */ }
        const html = firstJobHtml({ name, service, location, client_name, amount: amount ?? null, payoutsReady });
        await sendEmail(p.email, `🎉 Congrats — you won your first job on Freddy Fix It!`, html);
        return ok({ status: "sent", first: true, to: p.email });
      }

      const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
        <div style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:.75rem 1rem;margin-bottom:1.5rem;">
          <span style="color:#f87171;font-weight:700;font-size:1rem;letter-spacing:.05em;">⚡ URGENT — ACTION REQUIRED</span>
        </div>
        <h2 style="color:#ea6b14;margin-top:0;">Your bid was accepted!</h2>
        <p>Hi ${name}, <strong>${eClient}</strong> accepted your bid${eAmount ? " of <strong>$" + eAmount + "</strong>" : ""}. Contact them and schedule the job as soon as possible.</p>
        <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;width:110px;">SERVICE</td><td style="padding:.5rem 0;font-weight:500;">${eService}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">LOCATION</td><td style="padding:.5rem 0;">${eLocation}</td></tr>
          ${eAmount ? `<tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">YOUR BID</td><td style="padding:.5rem 0;color:#22c55e;font-weight:600;">$${eAmount}</td></tr>` : ""}
        </table>
        <p style="color:rgba(190,205,235,.7);font-size:.9rem;">Log in now to propose a time. Clients expect a response quickly — contractors who respond fast get more jobs.</p>
        <a href="https://freddyfixit.ca/contractor-dashboard" style="display:inline-block;margin-top:.5rem;padding:.85rem 1.75rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;">Schedule Now →</a>
        <p style="margin-top:1.5rem;font-size:.78rem;color:rgba(190,205,235,.35);">Questions? hello@freddyfixit.ca or WhatsApp +1 (825) 561-8331</p>
      </div>`;
      await sendEmail(p.email, `⚡ URGENT — Your bid was accepted: ${String(service ?? "")} in ${String(location ?? "").split(",")[0]}`, html);
      return ok({ status: "sent", to: p.email });
    }

    // ── three_bids: "choose now" to client + "job closed" to non-bidding contractors ───────
    // (event key kept as 'three_bids' for backwards-compat; fires when the job reaches BID_CAP bids)
    if (event === "three_bids") {
      const { client_id, service, request_id } = json;
      const eService = esc(service);
      const results: string[] = [];

      // 1. Email the client
      const { data: cp } = await admin.from("profiles").select("first_name, email").eq("id", client_id).maybeSingle();
      if (cp?.email) {
        const name = esc(cp.first_name ?? "there");
        const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
          <h2 style="color:#ea6b14;">You have ${BID_CAP} bids — ready to choose! 🔨</h2>
          <p>Hi ${name}, your <strong>${eService}</strong> job has received ${BID_CAP} bids. That's the maximum — the job is now closed to new contractors.</p>
          <p>Log in to review each bid, compare prices, and accept the one that works best for you.</p>
          <a href="https://freddyfixit.ca/client-dashboard" style="display:inline-block;margin-top:1rem;padding:.85rem 1.75rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;">Review Bids Now →</a>
          <p style="margin-top:1.5rem;font-size:.82rem;color:rgba(190,205,235,.45);">Questions? Reply to this email or WhatsApp us at +1 (825) 561-8331.</p>
        </div>`;
        await sendEmail(cp.email, `${BID_CAP} bids in — choose your contractor for your ${service} job`, html);
        results.push("client:" + cp.email);
      }

      // 2. Email contractors who were notified but did NOT place a bid
      if (request_id) {
        const { data: request } = await admin
          .from("client_requests")
          .select("dispatched_to, location")
          .eq("id", request_id).maybeSingle();

        const dispatched: string[] = request?.dispatched_to ?? [];

        if (dispatched.length) {
          // Find who DID bid
          const { data: bids } = await admin
            .from("bids")
            .select("contractor_id")
            .eq("request_id", request_id);
          const bidderIds = new Set((bids ?? []).map((b: any) => b.contractor_id));

          // Non-bidders who were notified
          const nonBidders = dispatched.filter(id => !bidderIds.has(id));

          if (nonBidders.length) {
            const { data: profiles } = await admin
              .from("profiles")
              .select("id, first_name, email")
              .in("id", nonBidders);

            const eArea = esc(String(request?.location ?? "").split(",")[0]);
            for (const p of profiles ?? []) {
              if (!p.email) continue;
              const name = esc(p.first_name ?? "there");
              const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
                <h2 style="color:#ea6b14;">Job filled 🔒</h2>
                <p>Hi ${name}, the <strong>${eService}</strong> job in <strong>${eArea}</strong> has received ${BID_CAP} bids and is now closed.</p>
                <p>We'll send you the next matching job as soon as it comes in. Keep an eye on your dashboard for open requests.</p>
                <a href="https://freddyfixit.ca/contractor-dashboard" style="display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;background:rgba(255,255,255,.08);color:#f0f4ff;border-radius:8px;text-decoration:none;font-weight:600;border:1px solid rgba(255,255,255,.15);">View Available Jobs →</a>
              </div>`;
              await sendEmail(p.email, `Job filled — ${String(service ?? "")} in ${String(request?.location ?? "").split(",")[0]}`, html);
              results.push("contractor:" + p.email);
            }
          }
        }
      }

      return ok({ status: "sent", results });
    }

    return new Response(JSON.stringify({ error: "unknown event" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  function ok(body: object) {
    return new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });
  }
});
