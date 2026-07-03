// Releases held funds to the contractor once work is client-confirmed.
//
// TWO modes:
//  - Job-level (small/single-charge jobs): pass { job_id }. Transfers 93% of the
//    quote (contractor_payout); requires the job held + client-confirmed.
//  - Milestone (big jobs): pass { milestone_id }. Transfers 93% of THAT stage's
//    amount; requires the stage completed + client-approved (or auto-approved)
//    and not disputed. Idempotency key is per-milestone.
//
// Idempotent in both modes (Stripe idempotencyKey). Callable by the owning client,
// an admin, or internally (service-role bearer) by the reconcile-payouts cron.
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

// Fire-and-forget alert so a failed payout never goes unnoticed.
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

// Resolve a contractor's payout-enabled Connect account, self-healing the DB flag.
async function payoutAccount(admin: any, stripe: Stripe, contractorId: string): Promise<string | null> {
  const { data: contractor } = await admin.from("contractors")
    .select("stripe_account_id, stripe_payouts_enabled").eq("id", contractorId).maybeSingle();
  if (!contractor?.stripe_account_id) return null;
  if (contractor.stripe_payouts_enabled) return contractor.stripe_account_id;
  const acct = await stripe.accounts.retrieve(contractor.stripe_account_id);
  if (!acct.payouts_enabled) return null;
  await admin.from("contractors").update({
    stripe_charges_enabled: !!acct.charges_enabled,
    stripe_payouts_enabled: true,
    stripe_onboarded_at: new Date().toISOString(),
  }).eq("id", contractorId);
  return contractor.stripe_account_id;
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

    const internal =
      (req.headers.get("Authorization") ?? "") === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

    let userId: string | null = null;
    let meRole: string | null = null;
    if (!internal) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return json({ error: "Not signed in" }, 401);
      userId = user.id;
      const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      meRole = me?.role ?? null;
    }

    const { job_id, milestone_id } = await req.json();

    // ---------- MILESTONE MODE ----------
    if (milestone_id) {
      const { data: m } = await admin.from("job_milestones")
        .select("id, job_id, seq, contractor_payout, status, client_approved_at, disputed_at, stripe_transfer_id")
        .eq("id", milestone_id).maybeSingle();
      if (!m) return json({ error: "Milestone not found" }, 404);
      const { data: job } = await admin.from("jobs")
        .select("id, client_id, contractor_id").eq("id", m.job_id).maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);
      if (!internal && job.client_id !== userId && meRole !== "admin")
        return json({ error: "Not authorized" }, 403);
      if (m.status === "released") return json({ ok: true, already: true });
      if (m.disputed_at) return json({ error: "Stage is under dispute" }, 409);
      if (m.status !== "completed") return json({ error: "Stage is not in a releasable state" }, 409);
      if (!m.client_approved_at) return json({ error: "Stage is not approved yet" }, 409);

      const acctId = await payoutAccount(admin, stripe, job.contractor_id);
      if (!acctId) return json({ error: "Contractor has not finished payout setup" }, 409);

      const transfer = await stripe.transfers.create({
        amount: Math.round(Number(m.contractor_payout) * 100),
        currency: "cad",
        destination: acctId,
        transfer_group: job.id,
        metadata: { job_id: job.id, milestone_id: m.id },
      }, { idempotencyKey: `payout_${m.id}` });

      await admin.from("job_milestones").update({
        stripe_transfer_id: transfer.id, status: "released", released_at: new Date().toISOString(),
      }).eq("id", m.id);

      // Notify the contractor of the stage payout.
      try {
        await admin.rpc("_notify", {
          p_user: job.contractor_id, p_type: "milestone_released",
          p_title: "Stage payout released",
          p_body: "A milestone payment has been released to your account.",
          p_job: job.id,
        });
      } catch (_) { /* best-effort */ }

      // If every stage is now released, the job itself is complete.
      const { data: remaining } = await admin.from("job_milestones")
        .select("id").eq("job_id", job.id).neq("status", "released").limit(1);
      if (!remaining || remaining.length === 0) {
        await admin.from("jobs").update({
          status: "completed", payment_status: "released", released_at: new Date().toISOString(),
        }).eq("id", job.id).neq("status", "completed");
      }

      return json({ ok: true, transfer_id: transfer.id });
    }

    // ---------- JOB MODE (unchanged) ----------
    if (!job_id) return json({ error: "Missing job_id" }, 400);

    const { data: job } = await admin.from("jobs")
      .select("id, client_id, contractor_id, contractor_payout, payment_status, client_confirmed_at, stripe_transfer_id")
      .eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    if (!internal && job.client_id !== userId && meRole !== "admin")
      return json({ error: "Not authorized" }, 403);
    if (job.payment_status === "released") return json({ ok: true, already: true });
    if (job.payment_status !== "held") return json({ error: "Payment is not in a releasable (held) state" }, 409);
    if (!job.client_confirmed_at) return json({ error: "Job is not confirmed yet" }, 409);

    const acctId = await payoutAccount(admin, stripe, job.contractor_id);
    if (!acctId) return json({ error: "Contractor has not finished payout setup" }, 409);

    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(job.contractor_payout) * 100),
      currency: "cad",
      destination: acctId,
      transfer_group: job.id,
      metadata: { job_id: job.id },
    }, { idempotencyKey: `payout_${job.id}` });

    await admin.from("jobs").update({
      stripe_transfer_id: transfer.id, payment_status: "released", released_at: new Date().toISOString(),
    }).eq("id", job.id);

    return json({ ok: true, transfer_id: transfer.id });
  } catch (err) {
    console.error("release-payment:", String(err));
    await alertAdmin("Payout failed in release-payment", String(err));
    return json({ error: String(err) }, 500);
  }
});
