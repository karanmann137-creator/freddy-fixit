// Releases held funds to the contractor once the job is client-confirmed.
// Transfers 93% of the quote (contractor_payout) to the contractor's Connect
// account. Idempotent: safe to call more than once. Callable by the owning
// client or an admin; the job must already be confirmed and in 'held' state.
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

    const { job_id } = await req.json();
    if (!job_id) return json({ error: "Missing job_id" }, 400);

    const { data: job } = await admin.from("jobs")
      .select("id, client_id, contractor_id, contractor_payout, payment_status, client_confirmed_at, stripe_transfer_id")
      .eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    if (job.client_id !== user.id && me?.role !== "admin")
      return json({ error: "Not authorized" }, 403);
    if (job.payment_status === "released") return json({ ok: true, already: true });
    if (job.payment_status !== "held") return json({ error: "Payment is not in a releasable (held) state" }, 409);
    if (!job.client_confirmed_at) return json({ error: "Job is not confirmed yet" }, 409);

    const { data: contractor } = await admin.from("contractors")
      .select("stripe_account_id, stripe_payouts_enabled").eq("id", job.contractor_id).maybeSingle();
    if (!contractor?.stripe_account_id)
      return json({ error: "Contractor has not started payout setup" }, 409);
    // Self-heal: if DB doesn't show payouts enabled yet, check Stripe live before refusing.
    let payoutsOk = !!contractor.stripe_payouts_enabled;
    if (!payoutsOk) {
      const acct = await stripe.accounts.retrieve(contractor.stripe_account_id);
      payoutsOk = !!acct.payouts_enabled;
      if (payoutsOk) {
        await admin.from("contractors").update({
          stripe_charges_enabled: !!acct.charges_enabled,
          stripe_payouts_enabled: true,
          stripe_onboarded_at: new Date().toISOString(),
        }).eq("id", job.contractor_id);
      }
    }
    if (!payoutsOk)
      return json({ error: "Contractor has not finished payout setup" }, 409);

    // idempotencyKey keyed on the job guarantees Stripe creates at most ONE
    // transfer per job even if this function runs twice concurrently
    // (double-click, retry, or the auto-confirm cron overlapping a manual call).
    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(job.contractor_payout) * 100),
      currency: "cad",
      destination: contractor.stripe_account_id,
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
