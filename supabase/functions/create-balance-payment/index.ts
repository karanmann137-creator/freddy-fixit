// Client pays the REMAINING BALANCE on a job whose deposit is already held.
//
// Jobs are collected in two charges: create-payment-intent takes the deposit
// (platform_deposit_rate(), currently 40%) plus the full service fee at booking;
// this collects the rest once the work is done. Both charges sit HELD on the
// platform balance — nothing reaches the contractor until the client confirms
// the work AND jobs.fully_funded is true.
//
// The balance is derived, never passed in by the caller:
//     balance = jobs.total_charged - jobs.funded_amount
// stripe-webhook increments funded_amount when this charge succeeds.
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
      .select("id, client_id, amount, total_charged, funded_amount, payment_status, is_milestone, prepayment_id, price_change_pending, disputed_at")
      .eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    if (job.client_id !== user.id) return json({ error: "Not your job" }, 403);

    if (job.is_milestone) return json({ error: "Staged jobs are funded one stage at a time." }, 409);
    if (job.prepayment_id) return json({ error: "This visit is covered by your prepaid plan." }, 409);
    if (job.disputed_at || job.payment_status === "disputed")
      return json({ error: "This job is under review. Nothing more will be charged until it's resolved." }, 409);
    if (job.payment_status === "released") return json({ error: "This job is already paid in full." }, 409);
    if (job.payment_status !== "held")
      return json({ error: "Pay the deposit on this job first." }, 409);
    if (job.price_change_pending)
      return json({ error: "Please approve or decline your pro's proposed price change first." }, 409);

    const total = Number(job.total_charged) || 0;
    const funded = Number(job.funded_amount) || 0;
    const balance = r2(total - funded);
    if (!(balance > 0.005)) return json({ error: "This job is already paid in full." }, 409);

    // Same fail-CLOSED agreement gate as the deposit charge: a price change can
    // void a signed agreement after the deposit was taken, so re-check here.
    // If we can't confirm it's signed, refuse rather than charge.
    try {
      const { data: needs, error: needErr } = await admin.rpc("contract_required", { p_job_id: job.id });
      if (needErr) throw needErr;
      if (needs === true) {
        const { data: signed, error: signErr } = await admin.rpc("contract_signed", { p_job_id: job.id });
        if (signErr) throw signErr;
        if (signed !== true)
          return json({ error: "Please sign the service agreement for this job before paying." }, 428);
      }
    } catch (_) {
      return json({ error: "We couldn't verify the signed service agreement for this job. Please refresh the page and try again." }, 428);
    }

    const { data: profile } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const receiptEmail = profile?.email ?? user.email ?? undefined;
    const quote = Number(job.amount) || 0;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${SITE}/client?payment=success`,
      cancel_url: `${SITE}/client?payment=cancelled`,
      customer_email: receiptEmail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: Math.round(balance * 100),
          product_data: {
            name: "Freddy Fix It — remaining balance",
            description: `Balance on your $${quote.toFixed(2)} job. Your deposit of $${funded.toFixed(2)} is already held.`,
          },
        },
      }],
      payment_intent_data: {
        description: `Freddy Fix It — balance on job ${job.id}`,
        receipt_email: receiptEmail,
        metadata: { job_id: job.id, client_id: user.id, kind: "balance" },
      },
      metadata: { job_id: job.id, kind: "balance" },
    });

    return json({ url: session.url, balance_due: balance, total, funded });
  } catch (err) {
    console.error("create-balance-payment:", String(err));
    return json({ error: String(err) }, 500);
  }
});
