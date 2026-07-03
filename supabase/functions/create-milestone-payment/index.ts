// Fund ONE milestone of a big (milestone) job via Stripe-hosted Checkout.
// Mirrors create-payment-intent but charges a single stage's amount + 3% service
// fee onto the PLATFORM balance (separate charges & transfers). Funds are HELD
// until the client approves that stage, then release-payment transfers 93% of the
// stage amount to the contractor and the platform keeps 7%. Summed across stages
// this is identical economics to charging the whole job once.
//
// Guards: the schedule must be client-approved; stages fund strictly IN ORDER
// (stage N+1 can't be funded until stage N is released); a disputed stage pauses
// the whole schedule. The 3% referral waiver applies to the FIRST stage only.
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

    const { milestone_id } = await req.json();
    if (!milestone_id) return json({ error: "Missing milestone_id" }, 400);

    const { data: m } = await admin.from("job_milestones")
      .select("id, job_id, seq, title, amount, status").eq("id", milestone_id).maybeSingle();
    if (!m) return json({ error: "Milestone not found" }, 404);

    const { data: job } = await admin.from("jobs")
      .select("id, client_id, amount, is_milestone, milestone_schedule_status").eq("id", m.job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    if (job.client_id !== user.id) return json({ error: "Not your job" }, 403);
    if (!job.is_milestone || job.milestone_schedule_status !== "approved")
      return json({ error: "The milestone plan is not approved yet" }, 409);
    if (m.status !== "pending")
      return json({ error: "This stage is already funded" }, 409);

    // A disputed stage pauses the whole schedule.
    const { data: disputed } = await admin.from("job_milestones")
      .select("id").eq("job_id", m.job_id).eq("status", "disputed").limit(1);
    if (disputed && disputed.length > 0)
      return json({ error: "A stage is under dispute — funding is paused until it is resolved" }, 409);

    // Strict order: every earlier stage must already be released.
    const { data: earlier } = await admin.from("job_milestones")
      .select("id, seq, status").eq("job_id", m.job_id).lt("seq", m.seq).neq("status", "released");
    if (earlier && earlier.length > 0)
      return json({ error: "Fund the earlier stages first" }, 409);

    const amount = Number(m.amount);
    // 3% service fee, waived only on the FIRST stage of a referred client's job.
    let waived = false;
    if (m.seq === 1) {
      try {
        const { data: elig } = await admin.rpc("referral_waiver_eligible", { p_client: user.id, p_job_id: job.id });
        waived = elig === true;
      } catch (_) { /* best-effort */ }
    }
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
            name: `Freddy Fix It — ${m.title}`,
            description: waived
              ? `Stage \"${m.title}\" $${amount.toFixed(2)} — 3% service fee waived (referral reward \u{1F389})`
              : `Stage \"${m.title}\" $${amount.toFixed(2)} + 3% service fee $${clientFee.toFixed(2)}`,
          },
        },
      }],
      payment_intent_data: {
        description: `Freddy Fix It — job ${job.id} / stage ${m.seq} (${m.title})`,
        receipt_email: receiptEmail,
        metadata: { kind: "milestone", milestone_id: m.id, job_id: job.id, client_id: user.id },
      },
      metadata: { kind: "milestone", milestone_id: m.id, job_id: job.id },
    });

    // Record the fee actually being charged + the session; the webhook flips the
    // stage to 'funded' once the charge succeeds.
    await admin.from("job_milestones").update({
      client_fee: clientFee, platform_fee: platformFee, contractor_payout: payout,
      stripe_session_id: session.id,
    }).eq("id", m.id);

    return json({ url: session.url, amount: total, client_fee: clientFee, stage: amount, fee_waived: waived });
  } catch (err) {
    console.error("create-milestone-payment:", String(err));
    return json({ error: String(err) }, 500);
  }
});
