// Stripe webhook receiver. No JWT — authenticity is proven by the Stripe
// signature (STRIPE_WEBHOOK_SECRET). Keeps contractor onboarding state and
// job/milestone payment state in sync with Stripe.
//
// MONEY INVARIANT: jobs.total_charged is the FULL amount owed; jobs.funded_amount
// is how much has actually been collected. A job is only safe to pay out when
// payment_status='held' AND fully_funded (a generated column derived from those
// two). EVERY branch here that receives money must increment funded_amount, or
// the invariant silently desynchronises and a payout path will transfer 93% of a
// job we only partly collected.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const r2 = (n: number) => Math.round(n * 100) / 100;

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
          .select("id, client_id, contractor_id, occurrences_total, plan_request_id, fee_waived");
        const rp = prows?.[0];
        if (rp) {
          // Referral 3% waiver: create-recurring-prepayment already charged this
          // pool one fee short, so mark the reward spent now that the money has
          // actually landed. Doing it here rather than at checkout means an
          // abandoned session can't burn it, and doing it here rather than when
          // the first visit is linked closes the window where a client could
          // spend the same waiver again on a separate one-off job.
          if (rp.fee_waived) {
            try {
              const { data: pj } = await admin.from("jobs").select("id")
                .eq("request_id", rp.plan_request_id)
                .order("created_at", { ascending: true }).limit(1);
              const planJobId = pj?.[0]?.id;
              const clientId = pi.metadata?.client_id ?? rp.client_id;
              if (clientId && planJobId)
                await admin.rpc("consume_referral_waiver", { p_client: clientId, p_job_id: planJobId });
            } catch (_) { /* best-effort — the discount is already given either way */ }
          }
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
      } else if (pi.metadata?.kind === "price_topup" && jobId) {
        // Contractor proposed a HIGHER price on an already-held job; client approved and
        // paid the delta via a second charge. Apply the pending new breakdown now.
        const { data: job } = await admin.from("jobs")
          .select("id, contractor_id, amount, client_fee, price_change_pending, extra_charge_intent_ids, funded_amount")
          .eq("id", jobId).maybeSingle();
        if (job?.price_change_pending) {
          const pc = job.price_change_pending as Record<string, unknown>;
          const already = (job.extra_charge_intent_ids as string[] | null) ?? [];
          if (!already.includes(pi.id)) {
            const newAmount = Number(pc.amount);
            // Preserve the original client-fee rate (0 if referral-waived).
            const origRate = Number(job.amount) > 0 ? Number(job.client_fee) / Number(job.amount) : 0;
            const newClientFee = r2(newAmount * origRate);
            const newTotal = r2(newAmount + newClientFee);
            const newPlatformFee = r2(newAmount * 0.07);
            const newPayout = r2(newAmount * 0.93);
            await admin.from("jobs").update({
              amount: newAmount,
              labour_amount: pc.labour ?? null,
              parts_amount: pc.parts ?? null,
              callout_fee: pc.callout ?? null,
              subject_to_inspection: pc.subject === true,
              price_low: pc.price_low ?? null,
              price_high: pc.price_high ?? null,
              used_base_price: pc.used_base_price === true,
              client_fee: newClientFee,
              platform_fee: newPlatformFee,
              total_charged: newTotal,
              contractor_payout: newPayout,
              price_change_pending: null,
              price_change_proposed_at: null,
              extra_charge_intent_ids: [...already, pi.id],
              // The delta just collected counts towards what's been funded.
              funded_amount: r2((Number(job.funded_amount) || 0) + (pi.amount_received ?? 0) / 100),
            }).eq("id", jobId);
            try {
              await admin.rpc("_notify", {
                p_user: job.contractor_id, p_type: "price_change_approved",
                p_title: "Price change approved",
                p_body: "The client approved and paid your updated price. The new total is now in effect.",
                p_job: jobId,
              });
            } catch (_) { /* best-effort */ }
          }
        }
      } else if (pi.metadata?.kind === "balance" && jobId) {
        // SECOND charge on a two-stage job: the client paid the remaining balance
        // once the work was done. The deposit charge already put the job in 'held',
        // so all this does is record the money — which is what unlocks the payout
        // (release-payment refuses to transfer until fully_funded).
        const { data: job } = await admin.from("jobs")
          .select("id, contractor_id, funded_amount, total_charged, extra_charge_intent_ids")
          .eq("id", jobId).maybeSingle();
        if (job) {
          const already = (job.extra_charge_intent_ids as string[] | null) ?? [];
          // Same idempotency guard the price_topup branch uses: Stripe retries
          // webhooks, and double-counting here would mark a job fully funded that
          // isn't.
          if (!already.includes(pi.id)) {
            const paid = (pi.amount_received ?? 0) / 100;
            const funded = r2((Number(job.funded_amount) || 0) + paid);
            await admin.from("jobs").update({
              funded_amount: funded,
              extra_charge_intent_ids: [...already, pi.id],
            }).eq("id", jobId);
            if (job.contractor_id) {
              try {
                await admin.rpc("_notify", {
                  p_user: job.contractor_id, p_type: "balance_paid",
                  p_title: "The client paid the balance",
                  p_body: "The rest of the payment for this job is now held. It's released to you as soon as the client confirms the work is done.",
                  p_job: jobId,
                });
              } catch (_) { /* best-effort */ }
            }
          }
        }
      } else if (jobId && (!pi.metadata?.kind || pi.metadata.kind === "deposit")) {
        // FIRST charge on a job: the deposit (platform_deposit_rate(), currently
        // 40% of the quote) plus the full client service fee. A job charged in
        // full still comes through here — funded_amount then already equals
        // total_charged, so fully_funded flips true and nothing else changes.
        //
        // A PI with no `kind` is a pre-two-stage charge; treated as a deposit so
        // older in-flight checkouts still settle correctly.
        //
        // The processing -> held guard makes a webhook replay a no-op (0 rows),
        // so funded_amount can never be double-counted here.
        const { data: rows } = await admin.from("jobs")
          .update({
            payment_status: "held",
            paid_at: new Date().toISOString(),
            deposit_paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi.id,
            funded_amount: r2((pi.amount_received ?? 0) / 100),
          })
          .eq("id", jobId).eq("payment_status", "processing")
          .select("id");
        const clientId = pi.metadata?.client_id;
        if (clientId && rows?.length) {
          try { await admin.rpc("consume_referral_waiver", { p_client: clientId, p_job_id: jobId }); }
          catch (_) { /* best-effort */ }
        }
        if (!rows?.length) {
          // The processing -> held guard matched nothing. Two very different
          // things look identical here:
          //   * a webhook REPLAY of the charge we already recorded — ignore it,
          //     double-counting would mark a job fully funded that isn't;
          //   * a SECOND checkout that got paid, because nothing stopped the
          //     client opening one while the first was still open. That is real
          //     money, and it used to be recorded in no column at all, which
          //     made it invisible to the dashboard and unrefundable by
          //     adjust-payment and resolve-dispute (both of which walk
          //     extra_charge_intent_ids).
          // Telling them apart is just "have we seen this intent id before".
          const { data: j2 } = await admin.from("jobs")
            .select("id, funded_amount, stripe_payment_intent_id, extra_charge_intent_ids")
            .eq("id", jobId).maybeSingle();
          if (j2) {
            const already = (j2.extra_charge_intent_ids as string[] | null) ?? [];
            const seen = j2.stripe_payment_intent_id === pi.id || already.includes(pi.id);
            if (!seen) {
              const paid = (pi.amount_received ?? 0) / 100;
              await admin.from("jobs").update({
                funded_amount: r2((Number(j2.funded_amount) || 0) + paid),
                extra_charge_intent_ids: [...already, pi.id],
              }).eq("id", jobId);
              await alertAdmin(
                "Duplicate deposit charge — refund owed",
                `A second deposit charge succeeded on a job that was already paid. The money HAS been recorded against the job (so it is refundable), but the client has almost certainly paid twice and should be refunded.\n\nJob: ${jobId}\nPaymentIntent: ${pi.id}\nAmount: $${((pi.amount_received ?? 0) / 100).toFixed(2)}\n\nRefund this intent in Stripe, then reduce jobs.funded_amount by the same amount.`,
              );
            }
          }
        }
      } else if (jobId) {
        // A charge tagged with a `kind` we don't handle. Deliberately does NOT
        // touch payment_status — the old catch-all here would flip any such
        // charge to 'held', which on a two-stage job could mark a job paid that
        // we'd only partly collected. Tell the owner instead.
        await alertAdmin(
          "Unhandled Stripe charge kind",
          `A succeeded PaymentIntent carried a metadata.kind this webhook doesn't handle, so nothing was recorded against the job.\n\nJob: ${jobId}\nKind: ${pi.metadata?.kind}\nPaymentIntent: ${pi.id}\nAmount: $${((pi.amount_received ?? 0) / 100).toFixed(2)}`,
        );
      }
    } else if (event.type === "checkout.session.expired") {
      // The client opened checkout and never finished. Without this the job sat
      // in 'processing' with nothing to move it, which is a state the dashboard
      // has no words for. Guarded on 'processing' so it can never undo a job
      // that was actually paid, and only the deposit charge owns job-level
      // payment_status (a lapsed balance or milestone session must not touch it).
      //
      // Requires "checkout.session.expired" to be enabled on the Stripe webhook
      // destination. If it isn't, nothing breaks — sessions are created with a
      // 2h expiry and job_money_block() stops treating the job as mid-payment
      // after 3h regardless.
      const cs = event.data.object as Stripe.Checkout.Session;
      const jobId = cs.metadata?.job_id;
      const kind = cs.metadata?.kind;
      if (jobId && (!kind || kind === "deposit")) {
        await admin.from("jobs")
          .update({ payment_status: "unpaid", checkout_started_at: null })
          .eq("id", jobId).eq("payment_status", "processing");
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const jobId = pi.metadata?.job_id;
      // Only the DEPOSIT charge owns job-level payment_status. A failed milestone
      // charge leaves the stage 'pending' so the client can retry; a failed
      // balance or top-up charge must NOT undo the deposit that's already held —
      // the job stays 'held' and simply stays under-funded until they retry.
      const kind = pi.metadata?.kind;
      if (jobId && (!kind || kind === "deposit"))
        await admin.from("jobs").update({ payment_status: "failed" })
          .eq("id", jobId).eq("payment_status", "processing");
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
