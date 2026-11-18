// Admin-only: resolve a job dispute by refunding the client, partially
// refunding (and still paying the contractor a REDUCED payout), or releasing
// the held funds to the contractor (dispute not upheld).
//
// Body: { dispute_id: string, action: "refund_full" | "refund_partial" | "release",
//         refund_amount?: number (dollars, required for refund_partial),
//         note?: string }
//
// -- v6 (2026-09-01) ----------------------------------------------------------
// Three defects fixed, all of which could only ever have fired on a real
// dispute -- and no job has ever reached 'disputed', so none of them had.
//
// 1. THE PAYOUT COULD NOT SUCCEED. It was a single bare transfer with no
//    `source_transaction` and a fixed `payout_<job>` idempotency key. A transfer
//    draws on the platform's AVAILABLE balance while card money sits PENDING
//    until it settles, so this is the exact failure that broke the platform's
//    first real payout on 2026-08-30. Worse, Stripe caches ERRORS as well as
//    successes for 24h, so the fixed key would have returned that first
//    "Insufficient funds" answer for a whole day no matter what was fixed in
//    between. This now uses release-payment v18's proven pattern: read Stripe's
//    own transfer ledger for the group, pay only the SHORTFALL, split it across
//    the charges that funded the job, and key each leg per charge.
//
// 2. THE PARTIAL REFUND PAID THE CONTRACTOR IN FULL. `doRefund` ran first, then
//    `doRelease` tested `job.fully_funded` off the row read at the top of the
//    handler -- a value that was already stale -- and transferred the FULL
//    `contractor_payout`. So refunding a client $50 on a $100 job still paid the
//    contractor $93, and only afterwards was `funded_amount` written down. The
//    platform covered the difference out of its own balance, silently.
//
//    The policy now: THE REFUND COMES OFF THE JOB PRICE, AND THE CONTRACTOR IS
//    PAID THEIR SAME SHARE OF WHAT REMAINS. On a $100 job (client paid $103)
//    with a $50 refund the client gets $50 back, the contractor is paid $46.50
//    (93% of the remaining $50 instead of 93% of $100), and the platform keeps
//    $6.50. Nobody pays out of pocket and the books reconcile exactly.
//
//    The ratio is taken from the job's OWN `contractor_payout / amount`, never
//    from a rate constant, so a job settles at the rate that was applied to it
//    even if the platform rate has changed since -- the same reasoning that
//    makes adjust-payment reconstruct `origRate` from `client_fee / amount`.
//    That is also why this function still contains no hardcoded 0.07 / 0.93:
//    the five deliberate literals in the edge functions stay five.
//
//    A hard cap sits underneath the arithmetic: the payout can NEVER exceed
//    what is still held at Stripe after the refund. If it would, the function
//    refuses rather than transferring, because a transfer larger than the
//    remaining charges is the platform paying out money it does not hold.
//
// 3. IT REFUNDED THE OLDEST CHARGE FIRST. The comment said newest-first and the
//    code did the opposite. Newest-first is required (CLAUDE.md), and it now
//    also composes with the payout: refunds come off the newest charge while
//    `planLegs` draws the payout from the oldest, so the deposit -- the charge
//    most likely to have settled -- stays maximally drawable.
//
// MONEY: touches NONE of the four payout guards. `confirm_job_completion()`,
// `auto_confirm_stale_jobs()`, `release-payment`'s !fully_funded 409 and
// `reconcile-payouts`' fully_funded filter are all unmodified. This function is
// downstream of every one of them -- it only runs on a job an admin has already
// taken into dispute, and `funded_amount` is now written down BEFORE any
// transfer is attempted, so those four read a truthful number even if the
// transfer then fails.
//
// -- v7 (2026-11-17) ----------------------------------------------------------
// RECORD THE REFUND ON THE JOB, not only on the dispute. This function already
// wrote `disputes.refund_amount`, `resolution_note` and `resolved_at`, so this
// path was recoverable -- but only from a different table, with a different
// shape, reachable only through the dispute. `adjust-payment` (the other refund
// path) recorded nothing at all. A credit note that had to read both would be
// two code paths that can disagree about the same job's refunded balance.
//
// `bankRefund` now also accumulates `jobs.refunded_total` and stamps
// `last_refund_at` / `last_refund_reason`, in the SAME update that writes
// `funded_amount` down -- so the record and the money can never be one write
// apart. It accumulates because a job can be refunded more than once (a price
// decrease through adjust-payment, then a dispute). See
// supabase/migrations/20261117_job_refund_record.sql for why that is three
// columns on the job rather than a job_refunds table.
//
// This repo copy had also fallen BADLY behind the deployed function -- it was
// pre-v6, so it was missing all three money fixes above, and anyone reading the
// repo copy would have read dangerously wrong code. It has been rewritten from
// the deployed v12 source. CLAUDE.md is right that the deployed one is the truth.
//
// MONEY: STILL TOUCHES NONE OF THE FOUR PAYOUT GUARDS. The `funded_amount`
// arithmetic in `bankRefund` is byte-for-byte what v6 did, both refund branches
// call it with exactly the dollars they called it with before, and no guard
// reads the three new columns. They are a record of money that has already
// moved, never an input to a decision about moving it.
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

async function alertAdmin(subject: string, detail: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "noreply@freddyfixit.ca", to: "hello@freddyfixit.ca",
        subject: `WARNING: ${subject}`,
        html: `<pre style="font-family:monospace;white-space:pre-wrap;">${detail}</pre>`,
      }),
    });
  } catch (_) { /* never let alerting break the request */ }
}

// Resolve a contractor's payout-enabled Connect account, self-healing the DB
// flag. Stricter than v5, which only checked that an account id existed and
// would happily have attempted a transfer to an account with payouts disabled.
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

// The charges that actually funded this job, oldest first, each with the amount
// still drawable from it. Refunds are already netted off by Stripe, so calling
// this AFTER a refund gives the correct post-refund drawable figures -- which is
// exactly why the order below is refund, then re-read, then transfer.
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
// succeeded at Stripe but whose DB write did not land -- and it also means that
// if release-payment already paid this job, this function transfers nothing.
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
// already given up. Any remainder no charge can cover falls back to a plain
// balance transfer, so this can never be LESS capable than what it replaced.
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
  let whichJob: string | null = null;
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
      .select("id, contractor_id, contractor_payout, total_charged, amount, payment_status, stripe_payment_intent_id, extra_charge_intent_ids, stripe_transfer_id, stripe_transfer_ids, funded_amount, fully_funded, request_id, refunded_total")
      .eq("id", dispute.job_id).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    whichJob = job.id;

    // A job is collected across MORE THAN ONE charge: the 40% deposit, the
    // balance, and any approved price top-up. Only refund what we actually
    // hold -- refunding total_charged on a job where the client only ever paid
    // the deposit would hand back money that was never collected.
    const intentIds = [
      job.stripe_payment_intent_id,
      ...((job.extra_charge_intent_ids as string[] | null) ?? []),
    ].filter((x): x is string => !!x);

    // NEWEST FIRST. A partial refund comes out of the most recent money, which
    // leaves the deposit -- the oldest charge, and the one most likely to have
    // settled -- intact for the payout to draw on via source_transaction.
    // v5 had this comment but iterated oldest-first.
    const available: { id: string; cents: number }[] = [];
    for (const id of [...intentIds].reverse()) {
      try {
        const pi = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
        const ch = pi.latest_charge as Stripe.Charge | null;
        const left = ch ? (ch.amount_captured ?? 0) - (ch.amount_refunded ?? 0) : 0;
        if (left > 0) available.push({ id, cents: left });
      } catch (_) { /* an intent we can't read simply isn't refundable here */ }
    }
    const collectedCents = available.reduce((s, a) => s + a.cents, 0);
    const collectedDollars = Math.round(collectedCents) / 100;

    let stripeRefundId: string | null = null;
    let transferIds: string[] = [];
    let newDisputeStatus = "";
    let newPaymentStatus = "";
    let refundDollars: number | null = null;
    let payoutDollars: number | null = null;

    // Walks every charge on the job, newest first, until the amount is refunded.
    const doRefund = async (dollars: number, keySuffix: string) => {
      if (!available.length) throw new Error("No payment on this job to refund");
      let remaining = Math.round(dollars * 100);
      let firstId: string | null = null;
      for (const a of available) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, a.cents);
        const r = await stripe.refunds.create(
          { payment_intent: a.id, amount: take },
          { idempotencyKey: `refund_${job.id}_${keySuffix}_${a.id}` },
        );
        firstId = firstId ?? r.id;
        remaining -= take;
      }
      if (remaining > 0)
        throw new Error(`Only $${((Math.round(dollars * 100) - remaining) / 100).toFixed(2)} could be refunded`);
      return firstId;
    };

    // Pay `owedCents` to the contractor, split across the charges that funded
    // the job and netted against anything already transferred for this group.
    const doPayout = async (owedCents: number) => {
      const acctId = await payoutAccount(admin, stripe, job.contractor_id);
      if (!acctId) throw new Error("Contractor has not finished payout setup");
      // Re-read AFTER any refund, so refunded money is not treated as drawable.
      const funds = await fundingCharges(stripe, [
        job.stripe_payment_intent_id,
        ...((job.extra_charge_intent_ids ?? []) as string[]),
      ]);
      const { drawn, total: already, ids: priorIds } = await priorTransfers(stripe, job.id, acctId);
      const remaining = owedCents - already;
      if (remaining <= 0) return priorIds;
      const newIds = await runLegs(stripe, planLegs(remaining, funds, drawn), {
        destination: acctId, transferGroup: job.id,
        metadata: { job_id: job.id, dispute_id },
        keyPrefix: `payout_${job.id}`,
      });
      return [...priorIds, ...newIds];
    };

    // Write funded_amount down the moment a refund succeeds, BEFORE any
    // transfer is attempted. v5 wrote it at the very end, so a transfer that
    // threw left every payout guard reading a funded_amount that included money
    // Stripe had already given back.
    //
    // v7: the same update also RECORDS the refund. One write, so the money
    // moving and the record of it moving cannot end up one failure apart --
    // which is the state adjust-payment was in until today. `refunded_total`
    // accumulates: a job can be refunded by a price decrease and then again by
    // a dispute, and a credit note is about the running total.
    const bankRefund = async (dollars: number, reason: string) => {
      await admin.from("jobs").update({
        funded_amount: Math.max(r2((Number(job.funded_amount) || 0) - dollars), 0),
        refunded_total: r2((Number(job.refunded_total) || 0) + dollars),
        last_refund_at: new Date().toISOString(),
        last_refund_reason: reason,
      }).eq("id", job.id);
    };

    // The admin's own resolution note is the truest reason we have, so it wins.
    // The fallbacks are deliberately plain English: this string is printed on
    // the client's credit note, not read by code.
    const adminNote = String(note ?? "").trim();

    if (action === "refund_full") {
      // "Full" = everything actually held, which on a deposit-only job is the
      // deposit rather than the full quote.
      refundDollars = collectedDollars;
      if (!(refundDollars > 0)) return json({ error: "Nothing has been collected on this job to refund" }, 409);
      stripeRefundId = await doRefund(refundDollars, "full");
      await bankRefund(refundDollars, adminNote || "Dispute resolved in the client's favour — full refund of what was held");
      newDisputeStatus = "resolved_refund";
      newPaymentStatus = "refunded";

    } else if (action === "refund_partial") {
      const amt = Number(refund_amount);
      if (!amt || amt <= 0 || amt > collectedDollars)
        return json({ error: `refund_amount must be between 0 and the $${collectedDollars.toFixed(2)} collected on this job` }, 400);

      // The refund comes off the JOB PRICE, and the contractor keeps the same
      // share of what remains. The ratio is the job's own payout-to-amount
      // ratio, so this settles at the rate that was actually applied to this
      // job rather than at whatever the platform rate happens to be today.
      const amountDollars = Number(job.amount) || 0;
      const fullPayout = Number(job.contractor_payout) || 0;
      const reducedAmount = Math.max(r2(amountDollars - amt), 0);
      const payout = amountDollars > 0 ? r2(fullPayout * (reducedAmount / amountDollars)) : 0;

      // HARD CAP: never transfer more than is still held at Stripe after the
      // refund. If the arithmetic ever disagrees with reality, refuse rather
      // than pay the difference out of the platform's own balance -- which is
      // precisely what v5 did on every partial refund.
      const remainingHeldCents = collectedCents - Math.round(amt * 100);
      const payoutCents = Math.round(payout * 100);
      if (payoutCents > remainingHeldCents)
        return json({
          error: `That refund would leave $${(remainingHeldCents / 100).toFixed(2)} held but owe the contractor $${payout.toFixed(2)}. Refund a smaller amount, or refund in full and settle with the contractor separately.`,
        }, 409);

      refundDollars = amt;
      payoutDollars = payout;
      stripeRefundId = await doRefund(amt, "partial");
      await bankRefund(amt, adminNote || "Dispute resolved with a partial refund");
      transferIds = payoutCents > 0 ? await doPayout(payoutCents) : [];
      newDisputeStatus = "resolved_partial";
      newPaymentStatus = "released";

    } else { // release -- dispute not upheld, contractor paid in full
      // The payout is the contractor's share of the WHOLE quote, so it can only
      // be paid once the whole quote has been collected. On an under-funded job
      // the right outcome is a refund of what's held, not a payout of money we
      // never took. Unchanged from v5, and deliberately not loosened.
      if (!job.fully_funded)
        return json({
          error: `This job isn't paid in full — only $${collectedDollars.toFixed(2)} of $${Number(job.total_charged ?? 0).toFixed(2)} was collected. Refund what's held instead of releasing.`,
        }, 409);
      payoutDollars = Number(job.contractor_payout) || 0;
      transferIds = await doPayout(Math.round(payoutDollars * 100));
      newDisputeStatus = "resolved_released";
      newPaymentStatus = "released";
    }

    const jobUpdate: Record<string, unknown> = { payment_status: newPaymentStatus };
    if (newPaymentStatus === "released") jobUpdate.released_at = new Date().toISOString();
    if (transferIds.length) {
      jobUpdate.stripe_transfer_id = transferIds[0];
      jobUpdate.stripe_transfer_ids = transferIds;
    }
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
          ? `Your dispute was resolved with a partial refund of $${(refundDollars ?? 0).toFixed(2)}.`
          : "Your dispute was reviewed and the payment was released to the contractor.");
    await admin.rpc("_notify", {
      p_user: dispute.client_id, p_type: "dispute_resolved",
      p_title: "Dispute resolved", p_body: note_c, p_job: job.id,
    }).catch(() => {});
    await admin.rpc("_notify", {
      p_user: dispute.contractor_id, p_type: "dispute_resolved",
      p_title: "Dispute resolved",
      p_body: newDisputeStatus === "resolved_partial"
        ? `A disputed job was resolved with a partial refund to the client. Your payout for it is $${(payoutDollars ?? 0).toFixed(2)}.`
        : (newPaymentStatus === "released"
            ? "A disputed job was resolved and your payout was released."
            : "A disputed job was resolved in the client's favour."),
      p_job: job.id,
    }).catch(() => {});

    return json({
      ok: true,
      refund_id: stripeRefundId,
      refund_amount: refundDollars,
      payout_amount: payoutDollars,
      transfer_id: transferIds[0] ?? null,
      transfer_ids: transferIds,
      dispute_status: newDisputeStatus,
    });
  } catch (err) {
    console.error("resolve-dispute:", String(err));
    await alertAdmin(
      `Dispute resolution failed${whichJob ? ` on job ${whichJob.slice(0, 8).toUpperCase()}` : ""}`,
      `A dispute could not be resolved.\n\nJob: ${whichJob ?? "n/a"}\n\n${String(err)}\n\nIf a refund succeeded but the payout failed, funded_amount has ALREADY been written down, so the job is safe to retry — the Stripe transfer ledger is re-read on every attempt and only the shortfall is paid.`,
    );
    return json({ error: String(err) }, 500);
  }
});
