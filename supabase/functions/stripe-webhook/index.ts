// Stripe webhook receiver. No JWT — authenticity is proven by the Stripe
// signature (STRIPE_WEBHOOK_SECRET). Keeps contractor onboarding state and
// job payment state in sync with Stripe.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

// Fire-and-forget owner alert so a payment problem never goes unnoticed.
async function alertAdmin(subject: string, detail: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "noreply@freddyfixit.ca",
        to: "hello@freddyfixit.ca",
        subject: `⚠️ ${subject}`,
        html: `<pre style="font-family:monospace;white-space:pre-wrap;">${detail}</pre>`,
      }),
    });
  } catch (_) { /* never let alerting break the request */ }
}

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch (err) {
    return new Response(`Bad signature: ${String(err)}`, { status: 400 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (event.type === "account.updated") {
      const a = event.data.object as Stripe.Account;
      await admin.from("contractors").update({
        stripe_charges_enabled: a.charges_enabled,
        stripe_payouts_enabled: a.payouts_enabled,
        stripe_onboarded_at: a.details_submitted ? new Date().toISOString() : null,
      }).eq("stripe_account_id", a.id);
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const jobId = pi.metadata?.job_id;
      if (jobId) {
        // Store the PaymentIntent id on the job — REQUIRED so disputes can be
        // refunded later (resolve-dispute refunds against this id).
        await admin.from("jobs")
          .update({ payment_status: "held", paid_at: new Date().toISOString(), stripe_payment_intent_id: pi.id })
          .eq("id", jobId).eq("payment_status", "processing");
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const jobId = pi.metadata?.job_id;
      if (jobId) await admin.from("jobs").update({ payment_status: "failed" }).eq("id", jobId);
      const reason = pi.last_payment_error?.message ?? "unknown reason";
      await alertAdmin(
        "Client payment failed",
        `A client charge failed.\n\nJob: ${jobId ?? "unknown"}\nPaymentIntent: ${pi.id}\nAmount: $${((pi.amount ?? 0) / 100).toFixed(2)} ${(pi.currency ?? "cad").toUpperCase()}\nReason: ${reason}\n\nThe job is marked "failed" — the client can retry payment from their dashboard.`,
      );
    }
  } catch (err) {
    console.error("stripe-webhook handler:", String(err));
    await alertAdmin("stripe-webhook handler error", `Event: ${event.type}\n\n${String(err)}`);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
