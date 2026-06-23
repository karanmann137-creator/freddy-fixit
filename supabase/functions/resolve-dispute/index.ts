// Admin-only: resolve a job dispute by refunding the client, partially
// refunding (and still paying the contractor), or releasing the held funds to
// the contractor (dispute not upheld). All Stripe calls use idempotency keys so
// a retry can never double-move money.
//
// Body: { dispute_id: string, action: "refund_full" | "refund_partial" | "release",
//         refund_amount?: number (dollars, required for refund_partial),
//         note?: string }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function alertAdmin(subject: string, detail: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "noreply@freddyfixit.ca", to: "hello@freddyfixit.ca",
        subject: `⚠️ ${subject}`,
        html: `<pre style="font-family:monospace;white-space:pre-wrap;">${detail}</pre>`,
      }),
    });
  } catch (_) { /* never let alerting break the request */ }
}

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
    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "admin") return json({ error: "Admins only" }, 403);

    const { dispute_id, action, refund_amount, note } = await req.json();
    if (!dispute_id || !action) return json({ error: "dispute_id and action are required" }, 400);
    if (!["refund_full", "refund_partial", "release"].includes(action))
      return json({ error: "invalid action" }, 400);

    const { data: dispute } = await admin.from("disputes")
      .select("id, job_id, client_id, contractor_id, status").eq("id", dispute_id).maybeSingle();
    if (!dispute) return json({ error: "Dispute not found" }, 404);
    if (dispute.status !== "open") return json({ error: "Dispute is already resolved" }, 409);

    const { data: job } = await admin.from("jobs")
      .select("id, contractor_id, contractor_payout, total_charged, amount, payment_status, stripe_payment_intent_id, request_id")
      .eq("id", dispute.job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);

    const chargedDollars = Number(job.total_charged ?? job.amount ?? 0);
    let stripeRefundId: string | null = null;
    let stripeTransferId: string | null = null;
    let newDisputeStatus = "";
    let newPaymentStatus = "";
    let refundDollars: number | null = null;

    const doRefund = async (dollars: number, keySuffix: string) => {
      if (!job.stripe_payment_intent_id) throw new Error("No payment intent on job to refund");
      const r = await stripe.refunds.create(
        { payment_intent: job.stripe_payment_intent_id, amount: Math.round(dollars * 100) },
        { idempotencyKey: `refund_${job.id}_${keySuffix}` },
      );
      return r.id;
    };
    const doRelease = async () => {
      const { data: contractor } = await admin.from("contractors")
        .select("stripe_account_id").eq("id", job.contractor_id).maybeSingle();
      if (!contractor?.stripe_account_id) throw new Error("Contractor has no connected payout account");
      const t = await stripe.transfers.create(
        {
          amount: Math.round(Number(job.contractor_payout) * 100),
          currency: "cad", destination: contractor.stripe_account_id,
          transfer_group: job.id, metadata: { job_id: job.id, dispute_id },
        },
        { idempotencyKey: `payout_${job.id}` },
      );
      return t.id;
    };

    if (action === "refund_full") {
      refundDollars = chargedDollars;
      stripeRefundId = await doRefund(refundDollars, "full");
      newDisputeStatus = "resolved_refund";
      newPaymentStatus = "refunded";
    } else if (action === "refund_partial") {
      const amt = Number(refund_amount);
      if (!amt || amt <= 0 || amt > chargedDollars)
        return json({ error: "refund_amount must be between 0 and the amount charged" }, 400);
      refundDollars = amt;
      stripeRefundId = await doRefund(amt, "partial");
      stripeTransferId = await doRelease(); // contractor still paid their payout
      newDisputeStatus = "resolved_partial";
      newPaymentStatus = "released";
    } else { // release
      stripeTransferId = await doRelease();
      newDisputeStatus = "resolved_released";
      newPaymentStatus = "released";
    }

    const jobUpdate: Record<string, unknown> = { payment_status: newPaymentStatus };
    if (newPaymentStatus === "released") jobUpdate.released_at = new Date().toISOString();
    if (stripeTransferId) jobUpdate.stripe_transfer_id = stripeTransferId;
    await admin.from("jobs").update(jobUpdate).eq("id", job.id);

    await admin.from("disputes").update({
      status: newDisputeStatus,
      refund_amount: refundDollars,
      resolution_note: note ?? null,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    }).eq("id", dispute_id);

    // in-app notifications
    const note_c = newPaymentStatus === "refunded"
      ? "Your dispute was resolved with a refund."
      : (newDisputeStatus === "resolved_partial"
          ? "Your dispute was resolved with a partial refund."
          : "Your dispute was reviewed and the payment was released to the contractor.");
    await admin.rpc("_notify", {
      p_user: dispute.client_id, p_type: "dispute_resolved",
      p_title: "Dispute resolved", p_body: note_c, p_job: job.id,
    }).catch(() => {});
    await admin.rpc("_notify", {
      p_user: dispute.contractor_id, p_type: "dispute_resolved",
      p_title: "Dispute resolved",
      p_body: newPaymentStatus === "released" ? "A disputed job was resolved and your payout was released." : "A disputed job was resolved in the client's favour.",
      p_job: job.id,
    }).catch(() => {});

    return json({ ok: true, refund_id: stripeRefundId, transfer_id: stripeTransferId, dispute_status: newDisputeStatus });
  } catch (err) {
    console.error("resolve-dispute:", String(err));
    await alertAdmin("Dispute resolution failed", String(err));
    return json({ error: String(err) }, 500);
  }
});
