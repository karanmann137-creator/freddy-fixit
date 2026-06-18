// Creates (or reuses) a Stripe Connect Express account for the signed-in
// contractor and returns a hosted onboarding link. Funds payouts later.
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
      .from("contractors").select("id, stripe_account_id, company_name").eq("id", user.id).maybeSingle();
    if (!contractor) return json({ error: "Not a contractor account" }, 403);

    let acctId = contractor.stripe_account_id as string | null;
    if (!acctId) {
      const { data: profile } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();
      const acct = await stripe.accounts.create({
        type: "express",
        country: "CA",
        email: profile?.email ?? user.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        business_profile: {
          name: contractor.company_name ?? undefined,
          product_description: "Home services performed via Freddy Fix It",
        },
        metadata: { contractor_id: user.id },
      });
      acctId = acct.id;
      await admin.from("contractors").update({ stripe_account_id: acctId }).eq("id", user.id);
    }

    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: `${SITE}/contractor?stripe=refresh`,
      return_url: `${SITE}/contractor?stripe=connected`,
      type: "account_onboarding",
    });
    return json({ url: link.url });
  } catch (err) {
    console.error("create-connect-account:", String(err));
    return json({ error: String(err) }, 500);
  }
});
