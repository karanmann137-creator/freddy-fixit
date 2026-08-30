// Releases held funds to the contractor once work is client-confirmed.
//
// THREE modes:
//  - Job-level: pass { job_id }. Transfers 93% of the quote (contractor_payout);
//    requires the job held + client-confirmed + FULLY FUNDED. Jobs are collected
//    in two charges (40% deposit at booking, the balance when the work is done),
//    so 'held' alone no longer means paid in full.
//  - Milestone (big jobs): pass { milestone_id }. Transfers 93% of THAT stage's
//    amount; requires the stage completed + client-approved (or auto-approved)
//    and not disputed.
//  - Recurring prepay pool: pass { prepayment_id, job_id }.
//
// -- source_transaction (2026-08-30) -───────────────────────────────────────────
// A transfer draws on the platform's AVAILABLE balance. Card money sits in
// PENDING until it settles (about 7 days for a new Canadian account's first
// payout, ~2 business days after), so a payout attempted the same day the client
// paid failed with "Insufficient funds in Stripe account" -- with the client's
// money sitting right there, fully collected. That is exactly what happened on
// the platform's first real job.
//
// Stripe's remedy is `source_transaction`: the transfer is drawn from a SPECIFIC
// charge and is accepted immediately regardless of available balance, then
// executes when that charge settles. Two constraints shape the code below:
//
//   1. It references exactly ONE charge and the transfer cannot exceed it. A job
//      is funded by TWO charges (deposit + balance) while the payout is 93% of
//      the WHOLE quote, so a single transfer is arithmetically impossible -- the
//      payout has to be SPLIT across the charges that funded it.
//   2. Several transfers may draw on one charge as long as they sum to no more
//      than it, which is what makes the split legal.
//
// Idempotency is belt AND braces, because a partial success is now possible:
// Stripe's own transfer ledger for this transfer_group is read first and only
// the SHORTFALL is transferred, and each leg additionally carries a per-charge
// idempotency key. A replay therefore cannot double-pay even if the DB write
// after a successful transfer was the thing that failed.
//
// MONEY INVARIANT: payment_status flips to 'released' only after EVERY leg has
// been accepted by Stripe. A partial payout leaves the job 'held', which is what
// lets reconcile-payouts finish it on the next pass.
//
// Callable by the owning client, an admin, or internally (service-role bearer)
// by the reconcile-payouts cron.
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
const r2 = (n: number) => Math.round(n * 100) / 100;

// Fire-and-forget alert so a failed payout never goes unnoticed.
//
// THROTTLED (2026-08-30). reconcile-payouts retries every 15 minutes, so one
// stuck payout sent ~96 identical emails a day -- which is how a real alert gets
// filtered into a folder nobody opens. alert_should_send() is keyed on the job
// AND the error text, so a genuinely NEW failure still lands immediately; only
// the same failure repeating is held back, for 6h. It fails OPEN: any problem
// with the throttle itself sends the email anyway.
async function alertAdmin(admin: any, throttleKey: string, subject: string, detail: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  let hits = 1;
  try {
    const { data, error } = await admin.rpc("alert_should_send", {
      p_key: throttleKey,
      p_cooldown_mins: 360,
    });
    if (!error && data && data.send === false) return;
    if (!error && data && typeof data.hits === "number") hits = data.hits;
  } catch (_) { /* fail open -- send it */ }
  const repeat = hits > 1
    ? `\n\nThis failure has now happened ${hits} times. You are only emailed about it once every 6 hours.`
    : "";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "noreply@freddyfixit.ca",
        to: "hello@freddyfixit.ca",
        subject: `WARNING: ${subject}`,
        html: `<pre style="font-family:monospace;white-space:pre-wrap;">${detail}${repeat}</pre>`,
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

type Fund = { charge: string; cents: number };

// The charges that actually funded something, oldest first, each with the amount
// still drawable from it. A payment intent we cannot read is SKIPPED rather than
// fatal -- the worst case is a leg without source_transaction, which is exactly
// the behaviour this function replaced.
async function fundingCharges(stripe: Stripe, intentIds: (string | null | undefined)[]): Promise<Fund[]> {
  const out: Fund[] = [];
  for (const pi of intentIds) {
    if (!pi) continue;
    try {
      const intent: any = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
      const ch: any = intent?.latest_charge;
      if (!ch || typeof ch === "string") continue;
      if (ch.status !== "succeeded") continue;
      const cents = Number(ch.amount ?? 0) - Number(ch.amount_refunded ?? 0);
      if (cents > 0) out.push({ charge: ch.id, cents });
    } catch (_) { /* unreadable intent -- skip it, don't fail the payout */ }
  }
  return out;
}

// What has ALREADY been transferred for this job, read from Stripe rather than
// from our own columns. This is what makes a replay safe after a transfer that
// succeeded at Stripe but whose DB write did not land.
async function priorTransfers(stripe: Stripe, transferGroup: string, destination: string) {
  const drawn = new Map<string, number>();
  let total = 0;
  const ids: string[] = [];
  try {
    const list: any = await stripe.transfers.list({ transfer_group: transferGroup, limit: 100 });
    for (const t of (list?.data ?? [])) {
      const dest = typeof t.destination === "string" ? t.destination : t.destination?.id;
      if (dest !== destination) continue;
      const net = Number(t.amount ?? 0) - Number(t.amount_reversed ?? 0);
      if (net <= 0) continue;
      total += net;
      ids.push(t.id);
      const src = typeof t.source_transaction === "string" ? t.source_transaction : t.source_transaction?.id;
      if (src) drawn.set(src, (drawn.get(src) ?? 0) + net);
    }
  } catch (_) {
    // A failed read is not an empty result. Rethrow so the caller alerts and
    // retries rather than paying a second time on the assumption of zero.
    throw new Error("Could not read existing Stripe transfers for this job; not paying again until that read succeeds.");
  }
  return { drawn, total, ids };
}

// Split `owedCents` across the funding charges, honouring what each charge has
// already given up. Any remainder that no charge can cover falls back to a plain
// balance transfer -- the pre-2026-08-30 behaviour, kept so this can never be
// LESS capable than what it replaced.
function planLegs(owedCents: number, funds: Fund[], drawn: Map<string, number>) {
  const legs: { charge: string | null; cents: number }[] = [];
  let remaining = owedCents;
  for (const f of funds) {
    if (remaining <= 0) break;
    const free = f.cents - (drawn.get(f.charge) ?? 0);
    if (free <= 0) continue;
    const take = Math.min(remaining, free);
    legs.push({ charge: f.charge, cents: take });
    remaining -= take;
  }
  if (remaining > 0) legs.push({ charge: null, cents: remaining });
  return legs;
}

async function runLegs(
  stripe: Stripe,
  legs: { charge: string | null; cents: number }[],
  opts: { destination: string; transferGroup: string; metadata: Record<string, string>; keyPrefix: string },
) {
  const ids: string[] = [];
  for (const leg of legs) {
    const t = await stripe.transfers.create({
      amount: leg.cents,
      currency: "cad",
      destination: opts.destination,
      transfer_group: opts.transferGroup,
      ...(leg.charge ? { source_transaction: leg.charge } : {}),
      metadata: { ...opts.metadata, ...(leg.charge ? { source_charge: leg.charge } : {}) },
    }, { idempotencyKey: leg.charge ? `${opts.keyPrefix}_${leg.charge}` : `${opts.keyPrefix}_balance` });
    ids.push(t.id);
  }
  return ids;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Kept outside the try so a failure alert can name what it failed on. The
  // alert used to be a bare String(err) with no identifiers at all.
  let whichJob: string | null = null;
  let whichStage: string | null = null;
  let whichPool: string | null = null;
  let adminClient: any = null;
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    adminClient = admin;

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

    const { job_id, milestone_id, prepayment_id } = await req.json();
    whichJob = job_id ?? null;
    whichStage = milestone_id ?? null;
    whichPool = prepayment_id ?? null;

    // ---------- MILESTONE MODE ----------
    if (milestone_id) {
      const { data: m } = await admin.from("job_milestones")
        .select("id, job_id, seq, contractor_payout, status, client_approved_at, disputed_at, stripe_transfer_id, stripe_payment_intent")
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

      // A stage is funded by exactly ONE charge, so no split is possible here --
      // but the same settlement-delay problem applies, so it still needs
      // source_transaction. The stage payout is 93% of the stage, and the charge
      // is the stage plus fee, so one leg always covers it.
      const owed = Math.round(Number(m.contractor_payout) * 100);
      const funds = await fundingCharges(stripe, [m.stripe_payment_intent]);
      const group = `ms_${m.id}`;
      const { drawn, total: already } = await priorTransfers(stripe, group, acctId);
      const remaining = owed - already;
      const ids = remaining <= 0
        ? []
        : await runLegs(stripe, planLegs(remaining, funds, drawn), {
            destination: acctId, transferGroup: group,
            metadata: { job_id: job.id, milestone_id: m.id },
            keyPrefix: `payout_${m.id}`,
          });

      await admin.from("job_milestones").update({
        stripe_transfer_id: ids[0] ?? m.stripe_transfer_id ?? null,
        status: "released", released_at: new Date().toISOString(),
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

      // If every stage is now terminal (released or refunded), the job is complete.
      const { data: remainingStages } = await admin.from("job_milestones")
        .select("id").eq("job_id", job.id).not("status", "in", "(released,refunded)").limit(1);
      if (!remainingStages || remainingStages.length === 0) {
        await admin.from("jobs").update({
          status: "completed", payment_status: "released", released_at: new Date().toISOString(),
        }).eq("id", job.id).neq("status", "completed");
      }

      return json({ ok: true, transfer_id: ids[0] ?? null, transfer_ids: ids });
    }

    // ---------- RECURRING PREPAYMENT MODE ----------
    // Draw down one prepaid occurrence: transfer 93% of that occurrence to the
    // contractor once the linked recurring job is completed + client-confirmed.
    if (prepayment_id && job_id) {
      const { data: rp } = await admin.from("recurring_prepayments")
        .select("id, contractor_id, payout_per, occurrences_total, occurrences_released, status, stripe_payment_intent")
        .eq("id", prepayment_id).maybeSingle();
      if (!rp) return json({ error: "Prepayment not found" }, 404);
      const { data: job } = await admin.from("jobs")
        .select("id, client_id, contractor_id, status, client_confirmed_at, disputed_at, payment_status, prepayment_id, stripe_transfer_id")
        .eq("id", job_id).maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);
      if (!internal && job.client_id !== userId && meRole !== "admin")
        return json({ error: "Not authorized" }, 403);
      if (job.prepayment_id !== prepayment_id)
        return json({ error: "Job is not funded by this prepayment" }, 409);
      if (job.payment_status === "released") return json({ ok: true, already: true });
      if (job.disputed_at) return json({ error: "Job is under dispute" }, 409);
      if (job.status !== "completed" || !job.client_confirmed_at)
        return json({ error: "Job is not confirmed yet" }, 409);
      if (!(rp.status === "held" || rp.status === "partially_released"))
        return json({ error: "Prepayment is not in a releasable state" }, 409);

      const acctId = await payoutAccount(admin, stripe, job.contractor_id);
      if (!acctId) return json({ error: "Contractor has not finished payout setup" }, 409);

      // Every occurrence in a pool draws on the SAME charge, so the per-job
      // transfer_group keeps each occurrence's ledger separate while the pool's
      // charge is what each one is sourced from. Sum of occurrences is 93% of the
      // pool, which is always under the charge.
      const owed = Math.round(Number(rp.payout_per) * 100);
      const funds = await fundingCharges(stripe, [rp.stripe_payment_intent]);
      const { drawn, total: already } = await priorTransfers(stripe, job.id, acctId);
      const remaining = owed - already;
      const ids = remaining <= 0
        ? []
        : await runLegs(stripe, planLegs(remaining, funds, drawn), {
            destination: acctId, transferGroup: job.id,
            metadata: { job_id: job.id, prepayment_id: rp.id },
            keyPrefix: `rprepay_${job.id}`,
          });

      await admin.from("jobs").update({
        stripe_transfer_id: ids[0] ?? job.stripe_transfer_id ?? null,
        stripe_transfer_ids: ids.length ? ids : null,
        payment_status: "released",
        status: "completed", released_at: new Date().toISOString(),
      }).eq("id", job.id);

      const released = Number(rp.occurrences_released) + 1;
      await admin.from("recurring_prepayments").update({
        occurrences_released: released,
        status: released >= Number(rp.occurrences_total) ? "released" : "partially_released",
      }).eq("id", rp.id);

      try {
        await admin.rpc("_notify", {
          p_user: job.contractor_id, p_type: "prepay_released",
          p_title: "Prepaid visit released",
          p_body: "A prepaid recurring visit has been released to your account.",
          p_job: job.id,
        });
      } catch (_) { /* best-effort */ }

      return json({ ok: true, transfer_id: ids[0] ?? null, transfer_ids: ids, occurrences_released: released });
    }

    // ---------- JOB MODE ----------
    if (!job_id) return json({ error: "Missing job_id" }, 400);

    const { data: job } = await admin.from("jobs")
      .select("id, client_id, contractor_id, contractor_payout, payment_status, client_confirmed_at, stripe_transfer_id, stripe_transfer_ids, price_change_pending, funded_amount, total_charged, fully_funded, stripe_payment_intent_id, extra_charge_intent_ids")
      .eq("id", job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    if (!internal && job.client_id !== userId && meRole !== "admin")
      return json({ error: "Not authorized" }, 403);
    if (job.payment_status === "released") return json({ ok: true, already: true });
    if (job.price_change_pending)
      return json({ error: "A price change is pending client approval. Resolve it before releasing payment." }, 409);
    if (job.payment_status !== "held") return json({ error: "Payment is not in a releasable (held) state" }, 409);
    if (!job.client_confirmed_at) return json({ error: "Job is not confirmed yet" }, 409);

    // Jobs are collected in two charges (deposit + balance). 'held' now only
    // means "some money is held" -- it does NOT mean paid in full. The payout is
    // 93% of the WHOLE quote, so releasing an under-funded job would pay the
    // contractor money we never collected. This is the last line of defence:
    // confirm_job_completion and auto_confirm_stale_jobs both guard too.
    if (!job.fully_funded) {
      const owing = Math.max(
        r2((Number(job.total_charged) || 0) - (Number(job.funded_amount) || 0)),
        0,
      );
      return json({
        error: `The remaining balance of $${owing.toFixed(2)} hasn't been paid yet, so this job can't be released.`,
        balance_due: owing,
      }, 409);
    }

    const acctId = await payoutAccount(admin, stripe, job.contractor_id);
    if (!acctId) return json({ error: "Contractor has not finished payout setup" }, 409);

    // Oldest charge first: the deposit settles before the balance, so drawing on
    // it first gets the contractor the earlier half of their money soonest.
    const owed = Math.round(Number(job.contractor_payout) * 100);
    const funds = await fundingCharges(stripe, [
      job.stripe_payment_intent_id,
      ...((job.extra_charge_intent_ids ?? []) as string[]),
    ]);
    const { drawn, total: already, ids: priorIds } = await priorTransfers(stripe, job.id, acctId);
    const remaining = owed - already;

    const newIds = remaining <= 0
      ? []
      : await runLegs(stripe, planLegs(remaining, funds, drawn), {
          destination: acctId, transferGroup: job.id,
          metadata: { job_id: job.id },
          keyPrefix: `payout_${job.id}`,
        });

    // Only now, with every leg accepted by Stripe, does the job become released.
    const allIds = [...priorIds, ...newIds];
    await admin.from("jobs").update({
      stripe_transfer_id: allIds[0] ?? job.stripe_transfer_id ?? null,
      stripe_transfer_ids: allIds.length ? allIds : null,
      payment_status: "released",
      released_at: new Date().toISOString(),
    }).eq("id", job.id);

    return json({ ok: true, transfer_id: allIds[0] ?? null, transfer_ids: allIds, legs: newIds.length });
  } catch (err) {
    console.error("release-payment:", String(err));
    // Key the throttle on WHAT failed and WHY, so the same stuck payout is quiet
    // after the first email but a different job -- or a different cause on the
    // same job -- still gets through straight away.
    const what = whichStage ?? whichPool ?? whichJob ?? "unknown";
    const why = String(err).replace(/\b[0-9a-f]{8,}\b/gi, "#").slice(0, 80);
    await alertAdmin(
      adminClient,
      `release-payment|${what}|${why}`,
      `Payout failed${whichJob ? ` on job ${whichJob.slice(0, 8).toUpperCase()}` : ""}`,
      `A payout could not be completed.\n\nJob: ${whichJob ?? "n/a"}\nStage: ${whichStage ?? "n/a"}\nPrepay pool: ${whichPool ?? "n/a"}\n\n${String(err)}\n\nreconcile-payouts retries every 15 minutes, so this will keep being retried until the cause is fixed. The most common cause is the contractor not having finished payout setup.`,
    );
    return json({ error: String(err) }, 500);
  }
});
