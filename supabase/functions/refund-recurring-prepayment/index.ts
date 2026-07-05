// Admin-only: refund the UNUSED portion of a recurring prepayment pool.
// Covers the Alberta "refund of unreleased deposits on valid cancellation" duty for
// prepaid recurring visits. Refundable = total charged minus the value of visits
// already released to the contractor. Visits already released are NOT clawed back
// (the client received that service). Idempotent per pool.
//
// Body: { prepay_id: string }
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "admin") return json({ error: "Admins only" }, 403);

    const { prepay_id } = await req.json();
    if (!prepay_id) return json({ error: "prepay_id is required" }, 400);

    const { data: rp } = await admin.from("recurring_prepayments")
      .select("id, occurrences_total, occurrences_released, amount_per_occurrence, client_fee_per, total_charged, stripe_payment_intent, status, refunded_at")
      .eq("id", prepay_id).maybeSingle();
    if (!rp) return json({ error: "Prepayment not found" }, 404);
    if (rp.status === "refunded" || rp.status === "canceled" || rp.refunded_at)
      return json({ status: "already_refunded", prepay_id }, 200);
    if (rp.status === "released")
      return json({ error: "Every prepaid visit was already released; nothing is held to refund." }, 409);
    if (!rp.stripe_payment_intent)
      return json({ error: "This pool was never funded, so there is nothing to refund." }, 409);

    const perCharge = r2(Number(rp.amount_per_occurrence) + Number(rp.client_fee_per));
    const usedValue = r2(Number(rp.occurrences_released) * perCharge);
    const refundable = r2(Number(rp.total_charged) - usedValue);
    if (!(refundable > 0)) return json({ error: "Nothing left to refund." }, 409);

    const refund = await stripe.refunds.create(
      { payment_intent: rp.stripe_payment_intent, amount: Math.round(refundable * 100) },
      { idempotencyKey: `rprepay_refund_${rp.id}` },
    );

    const newStatus = Number(rp.occurrences_released) > 0 ? "refunded" : "canceled";
    const { error: upErr } = await admin.from("recurring_prepayments")
      .update({ status: newStatus, refunded_at: new Date().toISOString(), stripe_refund_id: refund.id })
      .eq("id", rp.id);
    if (upErr) return json({ error: `Refund succeeded on Stripe but DB update failed: ${upErr.message}`, stripe_refund_id: refund.id }, 500);

    return json({ status: newStatus, prepay_id, refund_dollars: refundable, stripe_refund_id: refund.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
