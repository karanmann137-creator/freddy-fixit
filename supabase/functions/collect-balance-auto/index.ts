// Auto-collect the remaining 60% balance from the card the client saved at
// deposit checkout (Stripe setup_future_usage=off_session).
//
// This is the structural fix for the "ghost client": deposit held, work done and
// photographed, client never came back to pay the rest. Every payout guard then
// correctly refuses to release, so the contractor waits indefinitely.
// run_reminders() step 8 (24h/3d/7d) and escalate_unpaid_balances() (10d) tell
// the client and then the owner; this is what makes both rarely necessary.
//
// MONEY: touches NONE of the four payout guards.
//   1. confirm_job_completion() still raises with the exact balance owed.
//   2. auto_confirm_stale_jobs() still skips under-funded jobs.
//   3. release-payment still 409s on !fully_funded.
//   4. reconcile-payouts still filters .eq("fully_funded", true).
// It adds no new RECEIVING branch either: the charge is tagged
// metadata.kind='balance', so the EXISTING stripe-webhook balance branch is what
// increments funded_amount — with its existing extra_charge_intent_ids
// idempotency guard. Money collected here is HELD, not released; the client's
// confirmation step and the dispute window are unchanged.
//
// verify_jwt=false because the caller is Postgres and has no user JWT. Gated in
// code on the single-use x-ff-internal token (or a real admin JWT) — the anon
// key is itself a valid project-signed JWT and ships publicly in the bundle, so
// verify_jwt would buy nothing.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round(n * 100) / 100;

// Plain English for the client. A raw Stripe decline string ("Your card was
// declined.") is fine; a raw API error string is not.
function declineText(err: unknown): string {
  const e = err as { code?: string; decline_code?: string; message?: string; raw?: { message?: string; code?: string; decline_code?: string } };
  const code = e?.decline_code ?? e?.raw?.decline_code ?? e?.code ?? e?.raw?.code ?? "";
  if (code === "authentication_required")
    return "Your bank asked for extra confirmation, which we can't do on a saved card.";
  if (code === "insufficient_funds") return "There weren't enough funds on the card.";
  if (code === "expired_card")       return "The saved card has expired.";
  if (code === "card_declined")      return "The saved card was declined.";
  const m = e?.raw?.message ?? e?.message;
  return m && m.length < 200 ? m : "We couldn't charge the saved card.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // --- caller gate -----------------------------------------------------------
  let allowed = false;
  const internal = req.headers.get("x-ff-internal");
  if (internal) {
    try {
      const { data } = await admin.rpc("consume_internal_token", { p_token: internal, p_purpose: "edge-internal" });
      allowed = data === true;
    } catch (_) { allowed = false; }
  }
  if (!allowed) {
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (auth) {
      try {
        const { data: { user } } = await admin.auth.getUser(auth);
        if (user) {
          const { data: p } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
          allowed = p?.role === "admin";
        }
      } catch (_) { /* stays false */ }
    }
  }
  if (!allowed) return json({ error: "forbidden" }, 403);

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

    // jobs_due_for_autopay() is the ONE home for "which jobs should we try?".
    // Its predicate mirrors run_reminders() step 8 and create-balance-payment's
    // guards, so the manual path, the nudges and this can never disagree about
    // what "a balance is owed" means.
    const { data: due, error: dueErr } = await admin.rpc("jobs_due_for_autopay", { p_limit: 25 });
    if (dueErr) throw dueErr;

    let charged = 0, failed = 0, skipped = 0;

    for (const row of (due ?? []) as { job_id: string }[]) {
      // Re-read live. jobs_due_for_autopay is a snapshot and a client may have
      // paid, disputed or switched autopay off in between.
      const { data: job, error: jErr } = await admin.from("jobs")
        .select("id, client_id, contractor_id, amount, total_charged, funded_amount, payment_status, is_milestone, prepayment_id, price_change_pending, disputed_at, autopay_balance, autopay_attempts, stripe_customer_id, stripe_payment_method_id")
        .eq("id", row.job_id).maybeSingle();
      // A failed read is not an empty result — skip, never charge on a guess.
      if (jErr || !job) { skipped++; continue; }

      if (job.payment_status !== "held" || job.disputed_at || job.is_milestone ||
          job.prepayment_id || job.price_change_pending || job.autopay_balance !== true ||
          !job.stripe_customer_id || !job.stripe_payment_method_id) { skipped++; continue; }

      const balance = r2((Number(job.total_charged) || 0) - (Number(job.funded_amount) || 0));
      if (!(balance > 0.005)) { skipped++; continue; }

      // Same fail-CLOSED agreement gate as both manual checkout functions. A
      // price change can void a signed agreement after the deposit was taken,
      // and an unverifiable agreement must never be charged against.
      try {
        const { data: needs, error: needErr } = await admin.rpc("contract_required", { p_job_id: job.id });
        if (needErr) throw needErr;
        if (needs === true) {
          const { data: signed, error: signErr } = await admin.rpc("contract_signed", { p_job_id: job.id });
          if (signErr) throw signErr;
          if (signed !== true) { skipped++; continue; }
        }
      } catch (_) { skipped++; continue; }

      const attempt = (Number(job.autopay_attempts) || 0) + 1;

      // CLAIM BEFORE CHARGING. If this function dies mid-charge the job is
      // skipped for 24h rather than retried straight away against a card that
      // may already have been charged. An unsent charge costs a day; a double
      // charge costs trust.
      try { await admin.rpc("record_autopay_attempt", { p_job_id: job.id, p_error: null }); }
      catch (_) { skipped++; continue; }

      const { data: profile } = await admin.from("profiles").select("email").eq("id", job.client_id).maybeSingle();

      try {
        const pi = await stripe.paymentIntents.create({
          amount: Math.round(balance * 100),
          currency: "cad",
          customer: job.stripe_customer_id,
          payment_method: job.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `Freddy Fix It — balance on job ${job.id}`,
          receipt_email: profile?.email ?? undefined,
          // kind:'balance' is what routes this into the EXISTING webhook branch.
          // Do not invent a new kind — the catch-all alerts the owner and records
          // nothing, by design.
          metadata: { job_id: job.id, client_id: job.client_id, kind: "balance", source: "autopay" },
        }, {
          // Per-attempt key. Stripe caches ERRORS as well as successes for 24h,
          // so a fixed key would replay a decline forever.
          idempotencyKey: `autopay_${job.id}_${attempt}`,
        });

        if (pi.status === "succeeded") {
          charged++;
          // funded_amount is written by the webhook, not here — one receiving
          // branch, one idempotency guard.
          try {
            await admin.rpc("_notify", {
              p_user: job.client_id, p_type: "balance_autopaid",
              p_title: "We collected the rest of your payment",
              p_body: `The work on this job is finished, so the remaining $${balance.toFixed(2)} was charged to the card you saved when you paid your deposit. It's held securely — it only reaches your pro once you confirm the work is done. If something isn't right, open the job and report a problem instead of confirming.`,
              p_job: job.id,
            });
          } catch (_) { /* best-effort */ }
        } else {
          // requires_action / requires_payment_method on an off-session charge
          // is a failure from our side: there is nobody at the keyboard to
          // complete 3DS.
          failed++;
          const msg = pi.status === "requires_action"
            ? "Your bank asked for extra confirmation, which we can't do on a saved card."
            : "We couldn't charge the saved card.";
          try { await admin.rpc("record_autopay_attempt", { p_job_id: job.id, p_error: msg }); } catch (_) { /* noted */ }
          await notifyFailure(admin, job.id, job.client_id, balance, msg);
        }
      } catch (err) {
        failed++;
        const msg = declineText(err);
        try { await admin.rpc("record_autopay_attempt", { p_job_id: job.id, p_error: msg }); } catch (_) { /* noted */ }
        await notifyFailure(admin, job.id, job.client_id, balance, msg);
      }
    }

    return json({ ok: true, checked: (due ?? []).length, charged, failed, skipped });
  } catch (err) {
    console.error("collect-balance-auto:", String(err));
    return json({ error: String(err) }, 500);
  }
});

// The client is told exactly once per attempt, and always given the manual way
// out. Silence here would put us straight back in the ghost-client state the
// saved card exists to prevent.
async function notifyFailure(
  admin: ReturnType<typeof createClient>,
  jobId: string, clientId: string, balance: number, why: string,
) {
  try {
    await admin.rpc("_notify", {
      p_user: clientId, p_type: "balance_autopay_failed",
      p_title: "We couldn't collect the rest of your payment",
      p_body: `${why} The work on this job is finished and $${balance.toFixed(2)} is still owed. Open the job in your dashboard and pay the balance there — your pro can't be paid until it's in.`,
      p_job: jobId,
    });
  } catch (_) { /* best-effort */ }
}
