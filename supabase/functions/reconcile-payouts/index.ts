// Reconcile payouts: releases any job that is client-confirmed + completed but
// whose held funds were never released — e.g. a client-side release-payment call
// that failed/was interrupted, or an auto-confirmed job (the auto-confirm cron
// marks jobs completed but does not itself transfer funds). Runs on a schedule
// (pg_cron -> kick_reconcile_payouts) and is safe to run repeatedly: it delegates
// each payout to release-payment, which is idempotent (Stripe idempotencyKey).
// verify_jwt=false — no user context; guarded because it only ever releases jobs
// that already satisfy release-payment's own state checks.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Jobs the client confirmed (or that were auto-confirmed) but still holding funds.
    const { data: jobs, error } = await admin.from("jobs")
      .select("id")
      .eq("status", "completed")
      .eq("payment_status", "held")
      .not("client_confirmed_at", "is", null)
      .is("disputed_at", null)
      .limit(200);
    if (error) throw error;

    let released = 0, failed = 0;
    for (const j of jobs ?? []) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/release-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ job_id: j.id }),
        });
        if (res.ok) released++; else failed++;
      } catch (_) { failed++; }
    }

    return new Response(JSON.stringify({ checked: (jobs ?? []).length, released, failed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reconcile-payouts:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
