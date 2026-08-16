// send-bid-email — tells the client a pro has quoted, and gives them a
// ONE-TAP way to choose that pro.
//
// Why v11 exists. Four clients received estimates and not one of them ever
// picked anybody. v10 sent them to /client-dashboard, which means: remember
// you have an account, remember the password, find the request, then pick.
// Every step lost people and the first step lost the most. The email now
// links to /pick/<pick_token>, where the token IS the authorization — no
// login, no session, no password.
//
// v10 also had two other defects worth naming:
//   1. NO auth gate at all. Anyone who knew the URL could POST an arbitrary
//      to_email and get a DKIM-signed email from noreply@freddyfixit.ca.
//      That is an open relay wearing our domain's reputation. It is now
//      gated on the single-use internal token that place_bid mints, exactly
//      like notify-message v2.
//   2. It rendered a walkthrough bid as the literal text "a quote", because
//      those bids carry no `amount`. The client had a name and no number.
//      place_bid now REQUIRES a ballpark range on walkthrough bids, and this
//      renders it.
//
// verify_jwt stays FALSE on purpose: the caller is Postgres, which has no
// user JWT. verify_jwt=true would not have helped anyway — the anon key is
// itself a valid project-signed JWT and ships in the browser bundle.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FROM_EMAIL = "Freddy Fix It <noreply@freddyfixit.ca>";
const SITE       = "https://freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ff-internal",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const money = (n: unknown) => "$" + Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });

// Redeeming a single-use token minted by Postgres is what proves the caller
// is Postgres. A bearer anon key proves nothing — it is public.
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
  new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
    status: 403,
    headers: { ...cors, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!(await callerIsInternal(req))) return forbidden();

    const body = await req.json().catch(() => ({}));
    const {
      to_email,
      client_name,
      contractor_name,
      service,
      amount,          // null on a walkthrough-first bid
      price_low,
      price_high,
      walkthrough,
      pick_token,      // the whole point of v11
      bid_count,
    } = body ?? {};

    if (!to_email) {
      return new Response(JSON.stringify({ ok: false, error: "to_email required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // The price line the client actually compares pros on. A walkthrough bid
    // has no firm amount, so its ballpark range IS the number — never fall
    // back to vague words like "a quote", which is what v10 did.
    let priceLine: string;
    let priceNote = "";
    if (amount != null) {
      priceLine = money(amount);
    } else if (price_low != null && price_high != null) {
      priceLine = money(price_low) + "–" + money(price_high);
      priceNote = "Ballpark range — they'd like to see the space before giving a firm price.";
    } else {
      priceLine = "Estimate on request";
    }
    if (walkthrough && !priceNote) {
      priceNote = "They'd like to see the space before giving a firm price.";
    }

    // The token is the authorization, so the link goes straight to the pick
    // page. Only fall back to the login wall when there is no token at all.
    const ctaUrl = pick_token
      ? `${SITE}/pick/${encodeURIComponent(String(pick_token))}`
      : `${SITE}/client-dashboard`;

    const n = Number(bid_count);
    const countLine = Number.isFinite(n) && n > 1
      ? `You now have <strong>${n} estimates</strong> to compare.`
      : `This is your first estimate — more are usually on the way.`;

    const greeting = client_name ? `Hi ${esc(String(client_name).split(" ")[0])},` : "Hi,";

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0f1626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;">

    <div style="text-align:center;margin-bottom:22px;">
      <span style="font-size:1.35rem;font-weight:800;color:#ea6b14;letter-spacing:.5px;">FREDDY FIX IT</span>
    </div>

    <div style="background:#1a2236;border-radius:14px;padding:26px 24px;color:#f0f4ff;">

      <h1 style="margin:0 0 14px;font-size:1.45rem;line-height:1.25;color:#f0f4ff;">
        You've got an estimate for your ${esc(service || "job")}
      </h1>

      <p style="margin:0 0 18px;font-size:.98rem;line-height:1.6;color:rgba(240,244,255,.82);">
        ${greeting} ${countLine}
      </p>

      <div style="background:rgba(234,107,20,.1);border:1px solid rgba(234,107,20,.4);border-radius:10px;padding:18px;margin:0 0 20px;">
        <div style="font-size:1.05rem;font-weight:700;color:#f0f4ff;margin-bottom:4px;">
          ${esc(contractor_name || "A vetted pro")}
        </div>
        <div style="font-size:1.6rem;font-weight:800;color:#ea6b14;line-height:1.2;">
          ${esc(priceLine)}
        </div>
        ${priceNote ? `<div style="font-size:.84rem;color:rgba(240,244,255,.68);margin-top:6px;line-height:1.5;">${esc(priceNote)}</div>` : ""}
      </div>

      <a href="${ctaUrl}"
         style="display:block;text-align:center;background:#ea6b14;color:#fff;text-decoration:none;
                padding:15px 20px;border-radius:10px;font-weight:700;font-size:1.02rem;">
        See your estimates &amp; choose a pro &rarr;
      </a>

      <p style="margin:14px 0 0;font-size:.82rem;line-height:1.55;color:rgba(240,244,255,.6);text-align:center;">
        No password needed — this link opens straight to your estimates.
        Choosing a pro costs nothing, and your address is only shared with the
        pro you pick.
      </p>

    </div>

    <p style="margin:18px 0 0;font-size:.74rem;line-height:1.6;color:rgba(240,244,255,.42);text-align:center;">
      Freddy FixIt Contractors Inc. &middot; 20 Whiteram Mews NE, Calgary, AB<br/>
      Questions? Just reply to this email.
    </p>

  </div>
</body></html>`;

    const subject = amount != null
      ? `${money(amount)} estimate for your ${service || "job"} — choose your pro`
      : `New estimate for your ${service || "job"} — choose your pro`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to_email],
        reply_to: "hello@freddyfixit.ca",
        subject,
        html,
      }),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("resend failed", res.status, out);
      return new Response(JSON.stringify({ ok: false, error: "send failed", detail: out }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: out?.id ?? null, linked: !!pick_token }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-bid-email error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
