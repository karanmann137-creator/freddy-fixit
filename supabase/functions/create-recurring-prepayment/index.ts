// Prepay the next N occurrences of a recurring plan in one held charge.
// Client picks "prepay N ahead"; we charge N x (per-occurrence price + 3% service
// fee) onto the PLATFORM balance (separate charges & transfers) and HOLD it. As each
// recurring occurrence is completed & client-confirmed, release-payment (prepayment
// mode) transfers 93% of that occurrence to the contractor; the platform keeps 7%.
// Economics per occurrence are identical to charging each job once. Unreleased
// occurrences are refundable (refund-recurring-prepayment).
//
// A price only exists once the plan's first recurring quote has been approved, so
// this refuses to charge until get_recurring_prepay_quote reports priced=true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const SITE = "https://freddyfixit.ca";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { plan_request_id, occurrences } = await req.json();
    if (!plan_request_id) return json({ error: "Missing plan_request_id" }, 400);
    const occ = Math.max(1, Math.min(Number(occurrences) || 0, 12));

    // Plan must belong to the caller and be a recurring plan.
    const { data: plan } = await admin.from("client_requests")
      .select("id, user_id, recurring, service_needed, assigned_contractor_id, preferred_contractor_id")
      .eq("id", plan_request_id).maybeSingle();
    if (!plan) return json({ error: "Plan not found" }, 404);
    if (plan.user_id !== user.id) return json({ error: "Not your plan" }, 403);
    if (!plan.recurring) return json({ error: "That request is not a recurring plan" }, 409);

    // Don't stack pools: refuse if an active (held/pending) pool already exists.
    const { data: existing } = await admin.from("recurring_prepayments")
      .select("id").eq("plan_request_id", plan_request_id)
      .in("status", ["pending", "held", "partially_released"]).limit(1);
    if (existing && existing.length > 0)
      return json({ error: "You already have an active prepaid balance for this plan." }, 409);

    // Price comes from the plan's most recent approved/completed quote.
    const { data: q } = await admin.rpc("get_recurring_prepay_quote", { p_request: plan_request_id, p_count: occ });
    const quote = Array.isArray(q) ? q[0] : q;
    if (!quote || quote.priced !== true || !(Number(quote.base_per) > 0))
      return json({ error: "No agreed price yet — approve your first recurring quote before prepaying ahead." }, 409);

    const basePer = r2(Number(quote.base_per));
    const feePer = r2(Number(quote.fee_per));
    const payoutPer = r2(Number(quote.payout_per));
    const commissionPer = r2(Number(quote.commission_per));
    const perCharge = r2(basePer + feePer);
    const total = r2(perCharge * occ);
    const contractorId = plan.assigned_contractor_id || plan.preferred_contractor_id || null;

    // Record a pending pool up front; the webhook flips it to 'held' once paid.
    const { data: rp, error: rpErr } = await admin.from("recurring_prepayments").insert({
      plan_request_id, client_id: user.id, contractor_id: contractorId,
      occurrences_total: occ, amount_per_occurrence: basePer, client_fee_per: feePer,
      payout_per: payoutPer, commission_per: commissionPer, total_charged: total, status: "pending",
    }).select("id").single();
    if (rpErr || !rp) return json({ error: `Could not start prepayment: ${rpErr?.message ?? "unknown"}` }, 500);

    const { data: profile } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const receiptEmail = profile?.email ?? user.email ?? undefined;
    const svc = plan.service_needed ?? "service";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${SITE}/client?payment=success`,
      cancel_url: `${SITE}/client?payment=cancelled`,
      customer_email: receiptEmail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: Math.round(total * 100),
          product_data: {
            name: `Freddy Fix It — ${occ}x prepaid ${svc}`,
            description: `${occ} visits x ($${basePer.toFixed(2)} + 3% service fee $${feePer.toFixed(2)}). Held securely; each visit is released to your pro as it's completed.`,
          },
        },
      }],
      payment_intent_data: {
        description: `Freddy Fix It — recurring prepay ${occ}x (${svc}) plan ${plan_request_id}`,
        receipt_email: receiptEmail,
        metadata: { kind: "recurring_prepay", prepay_id: rp.id, plan_request_id, client_id: user.id },
      },
      metadata: { kind: "recurring_prepay", prepay_id: rp.id, plan_request_id },
    });

    return json({ url: session.url, prepay_id: rp.id, occurrences: occ, per_occurrence: perCharge, total });
  } catch (err) {
    console.error("create-recurring-prepayment:", String(err));
    return json({ error: String(err) }, 500);
  }
});
