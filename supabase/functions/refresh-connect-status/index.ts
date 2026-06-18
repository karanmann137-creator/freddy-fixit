// Fetches the signed-in contractor's Stripe Connect account live and syncs
// charges_enabled / payouts_enabled into the DB. Lets the dashboard show an
// up-to-date "connected" state without relying on the account.updated webhook
// (which would require a separate Connected-accounts destination + secret).
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

    const { data: contractor } = await admin
      .from("contractors").select("id, stripe_account_id, stripe_payouts_enabled").eq("id", user.id).maybeSingle();
    if (!contractor) return json({ error: "Not a contractor account" }, 403);
    if (!contractor.stripe_account_id) return json({ charges_enabled: false, payouts_enabled: false });

    const acct = await stripe.accounts.retrieve(contractor.stripe_account_id as string);
    const charges = !!acct.charges_enabled;
    const payouts = !!acct.payouts_enabled;

    const update: Record<string, unknown> = {
      stripe_charges_enabled: charges,
      stripe_payouts_enabled: payouts,
    };
    if (payouts && !contractor.stripe_payouts_enabled) update.stripe_onboarded_at = new Date().toISOString();
    await admin.from("contractors").update(update).eq("id", user.id);

    return json({ charges_enabled: charges, payouts_enabled: payouts });
  } catch (err) {
    console.error("refresh-connect-status:", String(err));
    return json({ error: String(err) }, 500);
  }
});
