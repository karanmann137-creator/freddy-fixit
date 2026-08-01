// Fetches the signed-in contractor's Stripe Connect account live and syncs
// charges_enabled / payouts_enabled into the DB. Lets the dashboard show an
// up-to-date "connected" state without relying on the account.updated webhook
// (which would require a separate Connected-accounts destination + secret).
//
// v11 also returns Stripe's OUTSTANDING REQUIREMENTS. Without this the dashboard
// could only say "your bank connection isn't finished" — true but useless, since
// the contractor had no way to learn whether Stripe wants a bank account, a photo
// ID, or a business number. The frontend turns these codes into plain English
// (src/lib/stripeRequirements.ts) so the copy can be reworded without a redeploy.
// An admin may also pass { contractor_id } to inspect someone else's account.
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

const EMPTY = { requirements: [], past_due: [], pending_verification: [], disabled_reason: null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    // Everyone reads their own account; only an admin may name someone else.
    let targetId = user.id;
    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    if (body?.contractor_id && body.contractor_id !== user.id) {
      const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (me?.role !== "admin") return json({ error: "Not allowed" }, 403);
      targetId = String(body.contractor_id);
    }

    const { data: contractor } = await admin
      .from("contractors").select("id, stripe_account_id, stripe_payouts_enabled").eq("id", targetId).maybeSingle();
    if (!contractor) return json({ error: "Not a contractor account" }, 403);
    if (!contractor.stripe_account_id) {
      return json({ charges_enabled: false, payouts_enabled: false, ...EMPTY });
    }

    const acct = await stripe.accounts.retrieve(contractor.stripe_account_id as string);
    const charges = !!acct.charges_enabled;
    const payouts = !!acct.payouts_enabled;

    // What Stripe is still waiting on. `currently_due` is the actionable list;
    // `eventually_due` is deliberately excluded so we never nag about things
    // that aren't blocking payouts yet.
    const rq: any = acct.requirements ?? {};
    const currently: string[] = Array.isArray(rq.currently_due) ? rq.currently_due : [];
    const pastDue: string[] = Array.isArray(rq.past_due) ? rq.past_due : [];
    const pending: string[] = Array.isArray(rq.pending_verification) ? rq.pending_verification : [];
    // past_due is a subset of currently_due, so union then de-dupe.
    const needs = Array.from(new Set([...currently, ...pastDue]));

    const update: Record<string, unknown> = {
      stripe_charges_enabled: charges,
      stripe_payouts_enabled: payouts,
    };
    if (payouts && !contractor.stripe_payouts_enabled) update.stripe_onboarded_at = new Date().toISOString();
    await admin.from("contractors").update(update).eq("id", targetId);

    return json({
      charges_enabled: charges,
      payouts_enabled: payouts,
      requirements: needs,
      past_due: pastDue,
      pending_verification: pending,
      disabled_reason: rq.disabled_reason ?? null,
    });
  } catch (err) {
    console.error("refresh-connect-status:", String(err));
    return json({ error: String(err) }, 500);
  }
});
