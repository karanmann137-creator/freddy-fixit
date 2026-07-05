// Stripe webhook receiver. No JWT — authenticity is proven by the Stripe
// signature (STRIPE_WEBHOOK_SECRET). Keeps contractor onboarding state and
// job/milestone payment state in sync with Stripe.
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
      const milestoneId = pi.metadata?.milestone_id;
      const jobId = pi.metadata?.job_id;

      if (pi.metadata?.kind === "milestone" && milestoneId) {
        // Milestone stage funded: flip pending -> funded and notify the contractor.
        const { data: mrows } = await admin.from("job_milestones")
          .update({ status: "funded", funded_at: new Date().toISOString(), stripe_payment_intent: pi.id })
          .eq("id", milestoneId).eq("status", "pending").select("id, seq, title, job_id");
        const m = mrows?.[0];
        if (m) {
          const { data: job } = await admin.from("jobs").select("contractor_id").eq("id", m.job_id).maybeSingle();
          if (job?.contractor_id) {
            try {
              await admin.rpc("_notify", {
                p_user: job.contractor_id, p_type: "milestone_funded",
                p_title: `Stage funded: ${m.title}`,
                p_body: "The client funded this stage. You can start the work and mark it complete when done.",
                p_job: m.job_id,
              });
            } catch (_) { /* best-effort */ }
          }
          // Referral 3% waiver applies to the FIRST stage only.
          const clientId = pi.metadata?.client_id;
          if (clientId && m.seq === 1) {
            try { await admin.rpc("consume_referral_waiver", { p_client: clientId, p_job_id: m.job_id }); }
            catch (_) { /* best-effort */ }
          }
        }
      } else if (pi.metadata?.kind === "recurring_prepay" && pi.metadata?.prepay_id) {
        // Recurring prepay pool funded: pending -> held. Notify client + reserved pro.
        const { data: prows } = await admin.from("recurring_prepayments")
          .update({ status: "held", stripe_payment_intent: pi.id })
          .eq("id", pi.metadata.prepay_id).eq("status", "pending")
          .select("id, client_id, contractor_id, occurrences_total, plan_request_id");
        const rp = prows?.[0];
        if (rp) {
          try {
            await admin.rpc("_notify", {
              p_user: rp.client_id, p_type: "prepay_funded",
              p_title: "Prepaid visits confirmed",
              p_body: `You've prepaid ${rp.occurrences_total} recurring visit(s). Each is held securely and released to your pro as it's completed.`,
              p_job: null,
            });
          } catch (_) { /* best-effort */ }
          if (rp.contractor_id) {
            try {
              await admin.rpc("_notify", {
                p_user: rp.contractor_id, p_type: "prepay_funded",
                p_title: "A client prepaid ahead",
                p_body: `A client prepaid ${rp.occurrences_total} recurring visit(s). You'll be paid for each as it's completed and confirmed.`,
                p_job: null,
              });
            } catch (_) { /* best-effort */ }
          }
        }
      } else if (jobId) {
        // Single-charge job (unchanged path).
        await admin.from("jobs")
          .update({ payment_status: "held", paid_at: new Date().toISOString(), stripe_payment_intent_id: pi.id })
          .eq("id", jobId).eq("payment_status", "processing");
        const clientId = pi.metadata?.client_id;
        if (clientId) {
          try { await admin.rpc("consume_referral_waiver", { p_client: clientId, p_job_id: jobId }); }
          catch (_) { /* best-effort */ }
        }
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const jobId = pi.metadata?.job_id;
      // Only single-charge jobs carry job-level payment_status; a failed milestone
      // charge simply leaves the stage 'pending' so the client can retry.
      if (jobId && pi.metadata?.kind !== "milestone")
        await admin.from("jobs").update({ payment_status: "failed" }).eq("id", jobId);
      const reason = pi.last_payment_error?.message ?? "unknown reason";
      await alertAdmin(
        "Client payment failed",
        `A client charge failed.\n\nJob: ${jobId ?? "unknown"}\nStage: ${pi.metadata?.milestone_id ?? "n/a"}\nPaymentIntent: ${pi.id}\nAmount: $${((pi.amount ?? 0) / 100).toFixed(2)} ${(pi.currency ?? "cad").toUpperCase()}\nReason: ${reason}\n\nThe client can retry payment from their dashboard.`,
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
