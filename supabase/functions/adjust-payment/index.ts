// Client APPROVES a contractor's proposed price change on a HELD job.
// Reconciles the already-held funds against the new price:
//   * increase  -> returns a Stripe Checkout URL for the difference (a top-up).
//                  The new price is applied by stripe-webhook once that succeeds.
//   * decrease  -> partially refunds the difference on the original charge NOW
//                  and applies the new price immediately.
//   * no change -> applies the (re-itemised) breakdown immediately.
// Economics are unchanged: client pays quote + same fee rate as the original
// charge; contractor is paid 93% of the FINAL amount; platform keeps 7%.
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

    const { job_id } = await req.json();
    if (!job_id) return json({ error: "Missing job_id" }, 400);

    const { data: job } = await admin.from("jobs")
      .select("id, client_id, contractor_id, amount, client_fee, platform_fee, total_charged, contractor_payout, payment_status, stripe_payment_intent_id, price_change_pending")
      .eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);

    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const isAdmin = me?.role === "admin";
    if (job.client_id !== user.id && !isAdmin) return json({ error: "Not your job" }, 403);
    if (job.payment_status !== "held") return json({ error: "This job's funds are not in a held state." }, 409);
    if (!job.price_change_pending) return json({ error: "There is no pending price change to approve." }, 409);

    const pend = job.price_change_pending as Record<string, unknown>;
    const newAmount = Number(pend.amount);
    if (!(newAmount > 0)) return json({ error: "Proposed price is invalid." }, 400);

    const oldAmount = Number(job.amount) || 0;
    const oldTotal = Number(job.total_charged) || 0;
    // Preserve whatever fee rate was applied on the original charge (0 if waived).
    const origRate = oldAmount > 0 ? r2((Number(job.client_fee) || 0) / oldAmount) : 0.03;
    const newClientFee = r2(newAmount * origRate);
    const newTotal = r2(newAmount + newClientFee);
    const newPlatformFee = r2(newAmount * 0.07);
    const newPayout = r2(newAmount - newPlatformFee);
    const delta = r2(newTotal - oldTotal);

    // ---- INCREASE: collect the difference via a top-up Checkout. ----
    if (delta > 0.005) {
      const { data: profile } = await admin.from("profiles").select("email").eq("id", job.client_id).maybeSingle();
      const receiptEmail = profile?.email ?? undefined;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${SITE}/client?payment=success`,
        cancel_url: `${SITE}/client?payment=cancelled`,
        customer_email: receiptEmail,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: Math.round(delta * 100),
            product_data: {
              name: "Freddy Fix It — updated price (difference)",
              description: `Additional amount for your job's revised price of $${newAmount.toFixed(2)}.`,
            },
          },
        }],
        payment_intent_data: {
          description: `Freddy Fix It — price top-up for job ${job.id}`,
          receipt_email: receiptEmail,
          metadata: { job_id: job.id, client_id: job.client_id, kind: "price_topup" },
        },
        metadata: { job_id: job.id, kind: "price_topup" },
      });
      return json({ mode: "topup", url: session.url, delta });
    }

    // ---- DECREASE: refund the difference on the original charge now. ----
    if (delta < -0.005) {
      if (job.stripe_payment_intent_id) {
        await stripe.refunds.create({
          payment_intent: job.stripe_payment_intent_id,
          amount: Math.round(Math.abs(delta) * 100),
          metadata: { job_id: job.id, reason: "price_decrease" },
        }, { idempotencyKey: `padj_${job.id}_${String(pend.reason ?? "").slice(0, 12)}_${Math.round(Math.abs(delta) * 100)}` });
      }
    }

    // ---- DECREASE or NO-CHANGE: apply the new price immediately. ----
    await admin.from("jobs").update({
      amount: newAmount,
      labour_amount: pend.labour ?? null,
      parts_amount: pend.parts ?? null,
      callout_fee: pend.callout ?? null,
      subject_to_inspection: pend.subject === true,
      price_low: pend.price_low ?? null,
      price_high: pend.price_high ?? null,
      used_base_price: pend.used_base_price === true,
      client_fee: newClientFee,
      platform_fee: newPlatformFee,
      total_charged: newTotal,
      contractor_payout: newPayout,
      price_change_pending: null,
      price_change_proposed_at: null,
    }).eq("id", job.id);

    try {
      await admin.rpc("_notify", {
        p_user: job.contractor_id, p_type: "price_change_approved",
        p_title: "Price change approved",
        p_body: `The client approved your updated price of $${newAmount.toFixed(2)}.`,
        p_job: job.id,
      });
    } catch (_) { /* best-effort */ }

    return json({ mode: delta < -0.005 ? "refunded" : "applied", refunded: delta < -0.005 ? Math.abs(delta) : 0, new_amount: newAmount });
  } catch (err) {
    console.error("adjust-payment:", String(err));
    return json({ error: String(err) }, 500);
  }
});
