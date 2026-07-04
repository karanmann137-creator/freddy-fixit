// Admin-only: refund a milestone stage whose funds are still HELD (not yet released).
// Covers the Alberta 15-day "refund of unreleased deposits on valid cancellation"
// requirement for staged (milestone) jobs. A funded / completed / disputed stage
// still has its money held on the Stripe PaymentIntent, so we refund it there and
// mark the stage 'refunded'. A stage that is already 'released' or 'refunded' is
// rejected (nothing is held to give back). All Stripe calls are idempotent.
//
// Body: { milestone_id: string, refund_amount?: number (dollars; default = full stage charge) }
// Deploy: supabase functions deploy refund-milestone
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

    const { milestone_id, refund_amount } = await req.json();
    if (!milestone_id) return json({ error: "milestone_id is required" }, 400);

    const { data: m, error: mErr } = await admin.from("job_milestones")
      .select("id, job_id, seq, title, amount, client_fee, status, stripe_payment_intent, refunded_at")
      .eq("id", milestone_id).maybeSingle();
    if (mErr || !m) return json({ error: "Milestone not found" }, 404);

    if (m.status === "released")
      return json({ error: "This stage was already paid out to the contractor; nothing is held to refund." }, 409);
    if (m.status === "refunded" || m.refunded_at)
      return json({ status: "already_refunded", milestone_id }, 200);
    if (!m.stripe_payment_intent)
      return json({ error: "This stage was never funded, so there is nothing to refund." }, 409);

    // Full stage charge = amount + client fee (what the client actually paid for the stage).
    const fullCharge = Math.round((Number(m.amount) + Number(m.client_fee ?? 0)) * 100) / 100;
    let refundDollars = fullCharge;
    if (refund_amount != null) {
      const amt = Number(refund_amount);
      if (!(amt > 0) || amt > fullCharge)
        return json({ error: `refund_amount must be between 0 and ${fullCharge}` }, 400);
      refundDollars = amt;
    }

    const refund = await stripe.refunds.create(
      { payment_intent: m.stripe_payment_intent, amount: Math.round(refundDollars * 100) },
      { idempotencyKey: `mrefund_${m.id}` },
    );

    const { error: upErr } = await admin.from("job_milestones")
      .update({ status: "refunded", refunded_at: new Date().toISOString(), stripe_refund_id: refund.id })
      .eq("id", m.id);
    if (upErr) return json({ error: `Refund succeeded on Stripe but DB update failed: ${upErr.message}`, stripe_refund_id: refund.id }, 500);

    return json({ status: "refunded", milestone_id, refund_dollars: refundDollars, stripe_refund_id: refund.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
