// send-bid-email — tells the client a new estimate has landed, shows ALL
// current estimates as comparable cards, and gives them a one-tap way to
// choose any pro directly from the email.
//
// Why v12 exists. v11 fixed the login-wall problem (link goes to /pick/<token>
// rather than /client-dashboard) and fixed the open-relay hole. But it still
// showed only the newly-arrived bid. Four clients received estimates and never
// came back to choose — likely because each email felt like a notification,
// not a decision surface. v12 fetches all bids via get_bids_by_token (the same
// RPC PickPro uses) and renders them as comparable cards IN THE RPC'S OWN ORDER
// — priced bids cheapest-first, walkthrough-first offers after them — so the
// email and /pick/<token> list the same pros in the same sequence. The
// just-arrived bid gets a "New" chip wherever it happens to land. The email IS
// the shortlist.
//
// Fallback safety: if the sibling-bid fetch fails for any reason, we fall back
// to the single-bid card that v11 rendered. A bid notification that fails to
// send is worse than a thin one.
//
// Auth model is unchanged from v11:
//   - verify_jwt stays FALSE (the caller is Postgres, which has no user JWT)
//   - gated on the single-use x-ff-internal token that place_bid mints
//   - NO service-role key is embedded inline (pg_proc.prosrc is public)
//   - the service-role client reads SUPABASE_SERVICE_ROLE_KEY from env,
//     which is how it can call get_bids_by_token as a privileged reader
//
// Why v11 existed. v10 had no auth gate (open relay) and rendered a walkthrough
// bid as the literal text "a quote". v11 fixed both; v12 extends, not replaces.

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

// The price line the client actually compares pros on. Mirrors PickPro's
// priceLine() helper exactly so the email and the pick page agree.
function bidPriceLine(b: { amount?: number | null; price_low?: number | null; price_high?: number | null }): string {
  if (b.amount != null) return money(b.amount);
  if (b.price_low != null && b.price_high != null) return money(b.price_low) + "&ndash;" + money(b.price_high);
  return "Estimate on request";
}

// Initials from a display name (up to 2 chars), matching PickPro's avatar fallback.
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
}

// Render one bid as a table-based card.
// isNew = true marks the newly-arrived bid with a "New" chip.
// Table layout throughout — Gmail and Outlook strip <style> blocks and flexbox.
//
// THE CARD BUTTON DOES NOT ACCEPT THE BID, and its wording must never imply it
// does. Two reasons, and the second is the hard one:
//   1. Honesty — it links to the pick page, where the real Choose button lives.
//   2. Safety — a link that accepts a bid on GET would be fired by every email
//      scanner, corporate link-prefetcher and Gmail image proxy that touches the
//      message. That would silently award the job to whichever pro happened to
//      be in the first card, with no human involved. Accepting stays a POST from
//      a real tap on /pick/<token> (accept_bid_by_token), where it already is.
// The `?bid=` hint only scrolls to and highlights that pro's card.
function renderBidCard(b: any, ctaUrl: string, isNew: boolean): string {
  const who   = b.company || b.name || "Your pro";
  const price = bidPriceLine(b);
  const ini   = initials(who);

  // Chips — inline-block spans work in most email clients.
  const ratingChip = (b.rating != null && Number(b.rating_count) > 0)
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(234,107,20,.18);color:#ea6b14;margin-right:4px;">&#9733; ${Number(b.rating).toFixed(1)}/10 (${b.rating_count})</span>`
    : "";

  const jobsChip = Number(b.total_jobs) > 0
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(240,244,255,.09);color:rgba(240,244,255,.72);margin-right:4px;">${b.total_jobs} job${Number(b.total_jobs) === 1 ? "" : "s"} done</span>`
    : "";

  const yearsChip = Number(b.years) > 0
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(240,244,255,.09);color:rgba(240,244,255,.72);margin-right:4px;">${b.years} yr${Number(b.years) === 1 ? "" : "s"} exp</span>`
    : "";

  const vettedChip = `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(34,197,94,.13);color:#22c55e;">&#10003; Vetted</span>`;

  const newChip = isNew
    ? `&nbsp;<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;background:#ea6b14;color:#fff;">New</span>`
    : "";

  // Walkthrough note — mirrors PickPro wording verbatim.
  const walkthroughRow = b.walkthrough
    ? `<tr><td colspan="2" style="padding-top:5px;font-size:12px;color:rgba(240,244,255,.62);line-height:1.5;">Wants to see the space before giving a firm price. The range above is their ballpark &mdash; the visit is free, and you approve the exact price afterwards.</td></tr>`
    : "";

  const messageRow = b.message
    ? `<tr><td colspan="2" style="padding-top:4px;font-size:13px;color:rgba(240,244,255,.7);line-height:1.5;font-style:italic;">"${esc(b.message)}"</td></tr>`
    : "";

  // Orange highlight for the new bid, subdued border for existing ones.
  const borderColor = isNew ? "rgba(234,107,20,.55)" : "rgba(240,244,255,.1)";
  const bgColor     = isNew ? "rgba(234,107,20,.07)" : "rgba(240,244,255,.04)";

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10px;background:${bgColor};border:1px solid ${borderColor};border-radius:12px;">
  <tr>
    <td style="padding:16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td width="48" valign="top" style="padding-right:12px;">
            <div style="width:48px;height:48px;border-radius:50%;background:rgba(234,107,20,.18);border:1px solid rgba(240,244,255,.12);text-align:center;line-height:48px;font-size:15px;font-weight:700;color:#ea6b14;">${esc(ini)}</div>
          </td>
          <td valign="top">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td style="font-size:15px;font-weight:700;color:#f0f4ff;line-height:1.3;">${esc(who)}${newChip}</td>
                <td align="right" style="font-size:17px;font-weight:800;color:#ea6b14;white-space:nowrap;padding-left:8px;">${price}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:6px;">${ratingChip}${jobsChip}${yearsChip}${vettedChip}</td>
              </tr>
              ${walkthroughRow}
              ${messageRow}
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
        <tr>
          <td>
            <a href="${ctaUrl}" style="display:block;text-align:center;background:#22c55e;color:#06210f;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700;font-size:14px;">Review &amp; choose ${esc(who)} &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!(await callerIsInternal(req))) return forbidden();

    const body = await req.json().catch(() => ({}));
    const {
      to_email,
      client_name,
      contractor_name,   // the pro who just bid — used for "New" chip matching
      service,
      amount,            // null on a walkthrough-first bid
      price_low,
      price_high,
      walkthrough,
      pick_token,        // the whole point of v11; still the whole point here
      bid_count,
    } = body ?? {};

    if (!to_email) {
      return new Response(JSON.stringify({ ok: false, error: "to_email required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // The token is the authorization — link goes straight to the pick page.
    // Only fall back to the login wall when there is no token at all.
    const ctaUrl = pick_token
      ? `${SITE}/pick/${encodeURIComponent(String(pick_token))}`
      : `${SITE}/client-dashboard`;

    const greeting = client_name ? `Hi ${esc(String(client_name).split(" ")[0])},` : "Hi,";

    // --- Fetch all bids via get_bids_by_token (same RPC PickPro uses) ------
    // On any failure we fall back to the single-bid rendering rather than
    // blocking the send — a thin notification beats a missing one.
    let allBids: any[] | null = null;
    let fetchedService = service;
    if (pick_token) {
      try {
        const { data: tokenData, error: tokenErr } = await admin.rpc("get_bids_by_token", { p_token: pick_token });
        if (!tokenErr && tokenData?.found && Array.isArray(tokenData.bids) && tokenData.bids.length > 0) {
          allBids = tokenData.bids;
          if (tokenData.service) fetchedService = tokenData.service;
        }
      } catch (fetchErr) {
        console.warn("send-bid-email: sibling-bid fetch failed, using fallback", fetchErr);
      }
    }

    // Total bid count: authoritative from fetched bids, else from caller's bid_count.
    const totalBids    = allBids ? allBids.length : (Number.isFinite(Number(bid_count)) ? Number(bid_count) : 1);
    const svcLabel     = esc(fetchedService || "job");
    const svcLabelRaw  = fetchedService || "job";

    // Subject line reflects the count.
    const subject = totalBids === 1
      ? `Your first estimate for your ${svcLabelRaw}`
      : `${totalBids} estimates for your ${svcLabelRaw}`;

    // --- Build the bid cards -------------------------------------------
    let cardsHtml: string;
    let introLine: string;

    if (allBids && allBids.length > 0) {
      // ORDER COMES FROM THE RPC AND IS NOT TOUCHED. get_bids_by_token sorts on
      // its own `sort_key`: priced bids first, cheapest to dearest, with
      // walkthrough-first offers after them. That is NOT insertion order, so
      // reversing it does not surface the newest bid — it puts the most
      // EXPENSIVE pro at the top of the email, which is the opposite of useful.
      // Keeping the RPC's order is also what makes the email and /pick/<token>
      // list the same pros in the same sequence; a client who compares the two
      // and finds them shuffled has no reason to trust either.
      const sorted = allBids;

      // Which one just arrived? By created_at, not by name.
      //
      // place_bid sends `contractor_name` as "first last" from profiles, while
      // the RPC returns `name` = first_name only and `company` = company_name,
      // so a string match between them fails on essentially every real bid and
      // silently mislabels whichever card happens to be first. The bid that was
      // just written has created_at = now(), so the newest timestamp is the
      // answer and it needs no name matching at all. Ties and unparseable dates
      // fall through to -1, which marks nothing "New" — a missing chip is a far
      // smaller lie than a chip on the wrong pro.
      const ts = (b: any) => { const t = Date.parse(b?.created_at ?? ""); return Number.isFinite(t) ? t : -1; };
      let newBidIndex = -1, newest = -1;
      sorted.forEach((b, i) => { const t = ts(b); if (t > newest) { newest = t; newBidIndex = i; } });

      // Per-card link carries ?bid= so the pick page can scroll to and highlight
      // that pro. It does NOT accept the bid — see renderBidCard.
      const cardUrl = (b: any) =>
        b?.bid_id ? `${ctaUrl}?bid=${encodeURIComponent(String(b.bid_id))}` : ctaUrl;

      cardsHtml = sorted.map((b, i) => renderBidCard(b, cardUrl(b), i === newBidIndex)).join("\n");

      introLine = totalBids === 1
        ? `This is your first estimate &mdash; more are usually on the way.`
        : `You now have <strong>${totalBids} estimates</strong> to compare, cheapest first. Tap any pro to open your estimates and book them in &mdash; no password needed.`;
    } else {
      // Fallback: single-bid card built from body fields (v11 behaviour).
      const fallbackBid = {
        company: contractor_name,
        name: contractor_name,
        amount,
        price_low,
        price_high,
        walkthrough,
        message: null,
        rating: null,
        rating_count: null,
        total_jobs: null,
        years: null,
      };
      cardsHtml = renderBidCard(fallbackBid, ctaUrl, true);

      const n = Number(bid_count);
      introLine = Number.isFinite(n) && n > 1
        ? `You now have <strong>${n} estimates</strong> to compare.`
        : `This is your first estimate &mdash; more are usually on the way.`;
    }

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0f1626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f1626;">
    <tr>
      <td align="center" style="padding:28px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:22px;">
              <span style="font-size:22px;font-weight:800;color:#ea6b14;letter-spacing:.5px;">FREDDY FIX IT</span>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#1a2236;border-radius:14px;padding:26px 24px;color:#f0f4ff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">

                <!-- Heading -->
                <tr>
                  <td style="padding-bottom:14px;">
                    <span style="font-size:23px;font-weight:800;line-height:1.25;color:#f0f4ff;">Estimates for your ${svcLabel}</span>
                  </td>
                </tr>

                <!-- Greeting + intro -->
                <tr>
                  <td style="padding-bottom:20px;font-size:15px;line-height:1.6;color:rgba(240,244,255,.82);">
                    ${greeting} ${introLine}
                  </td>
                </tr>

                <!-- Bid cards (one per estimate) -->
                <tr>
                  <td>
                    ${cardsHtml}
                  </td>
                </tr>

                <!-- Primary CTA button -->
                <tr>
                  <td style="padding-top:10px;">
                    <a href="${ctaUrl}" style="display:block;text-align:center;background:#ea6b14;color:#fff;text-decoration:none;padding:15px 20px;border-radius:10px;font-weight:700;font-size:16px;">See all estimates &amp; choose a pro &rarr;</a>
                  </td>
                </tr>

                <!-- Reassurance note -->
                <tr>
                  <td style="padding-top:14px;font-size:12px;line-height:1.55;color:rgba(240,244,255,.52);text-align:center;">
                    No password needed &mdash; this link opens straight to your estimates.<br/>
                    Choosing a pro costs nothing. Your address is only shared with the pro you pick.
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer — CASL required: company name + mailing address -->
          <tr>
            <td style="padding-top:18px;font-size:11px;line-height:1.6;color:rgba(240,244,255,.38);text-align:center;">
              Freddy FixIt Contractors Inc. &middot; 20 Whiteram Mews NE, Calgary, AB<br/>
              Questions? Just reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body></html>`;

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

    return new Response(
      JSON.stringify({ ok: true, id: out?.id ?? null, linked: !!pick_token, bid_cards: allBids?.length ?? 1 }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-bid-email error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
