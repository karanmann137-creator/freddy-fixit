// Client pays for a job via Stripe-hosted Checkout. Charges the contractor's
// quote + a 3% client service fee onto the PLATFORM balance (separate charges &
// transfers) — funds are HELD until the client confirms the work, at which
// point release-payment transfers 93% of the quote to the contractor and the
// platform retains the 7% fee. Returns a Checkout URL to redirect the client to.
//
// NOTE: Clients pay a standard 3% service fee, EXCEPT a referred client's very
// first job, where the 3% is waived (referral reward). Eligibility is checked
// read-only here; stripe-webhook consumes the reward only on a successful charge.
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
      .select("id, client_id, amount, payment_status").eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    if (job.client_id !== user.id) return json({ error: "Not your job" }, 403);
    if (!job.amount || Number(job.amount) <= 0) return json({ error: "Job has no agreed price yet" }, 400);
    if (job.payment_status === "held" || job.payment_status === "released")
      return json({ error: "This job is already paid" }, 409);

    // Every job requires a signed service agreement before any money is collected.
    // Fail-CLOSED: if we can't confirm the agreement is signed (unsigned OR a check
    // error), block checkout and ask the client to refresh — never charge for a job
    // that isn't legally bound by a signed contract.
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

    const amount = Number(job.amount);
    // Standard 3% service fee — waived on a referred client's FIRST job.
    // Eligibility is checked read-only here; stripe-webhook consumes the reward
    // only once the charge actually succeeds (so an abandoned checkout keeps it).
    let waived = false;
    try {
      const { data: elig } = await admin.rpc("referral_waiver_eligible", { p_client: user.id, p_job_id: job.id });
      waived = elig === true;
    } catch (_) { /* fee waiver is best-effort; never block checkout */ }
    // Base service-fee rate lives in ONE place: the platform_fee_rate() DB fn.
    // Read it here so the charge can never drift from what the dashboard shows;
    // fall back to 0.03 only if the read fails, and never block checkout.
    let baseRate = 0.03;
    try {
      const { data: pr } = await admin.rpc("platform_fee_rate");
      if (typeof pr === "number" && pr >= 0 && pr < 0.2) baseRate = Number(pr);
    } catch (_) { /* keep fallback */ }
    const feeRate = waived ? 0 : baseRate;
    const clientFee = r2(amount * feeRate);
    const total = r2(amount + clientFee);
    const platformFee = r2(amount * 0.07);
    const payout = r2(amount - platformFee);

    const { data: profile } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const receiptEmail = profile?.email ?? user.email ?? undefined;

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
            name: "Freddy Fix It — service payment",
            description: waived
              ? `Service $${amount.toFixed(2)} — 3% service fee waived (referral reward \u{1F389})`
              : `Service $${amount.toFixed(2)} + 3% service fee $${clientFee.toFixed(2)}`,
          },
        },
      }],
      payment_intent_data: {
        description: `Freddy Fix It — job ${job.id}`,
        // Stripe emails an automatic receipt to this address on a successful
        // live charge (in addition to the in-app downloadable receipt).
        receipt_email: receiptEmail,
        metadata: { job_id: job.id, client_id: user.id },
      },
      metadata: { job_id: job.id },
    });

    await admin.from("jobs").update({
      client_fee: clientFee, platform_fee: platformFee, total_charged: total,
      contractor_payout: payout, payment_status: "processing",
    }).eq("id", job.id);

    return json({ url: session.url, amount: total, client_fee: clientFee, quote: amount, fee_waived: waived });
  } catch (err) {
    console.error("create-payment-intent:", String(err));
    return json({ error: String(err) }, 500);
  }
});
