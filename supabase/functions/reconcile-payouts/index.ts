// Reconcile payouts: releases funds that should have moved but didn't — e.g. a
// client-side release-payment call that failed/was interrupted, or an
// auto-confirmed job/stage (the auto-confirm logic marks work done but does not
// itself transfer funds). Runs on a schedule (pg_cron -> kick_reconcile_payouts)
// and is safe to run repeatedly: every payout is delegated to release-payment,
// which is idempotent (Stripe idempotencyKey).
//
// Covers BOTH:
//  1. Single-charge jobs: completed + held + client-confirmed + un-disputed.
//  2. Milestone stages: first auto-approves any completed stage past its 3-day
//     window (auto_approve_stale_milestones), then releases every completed +
//     client-approved + un-disputed stage.
// verify_jwt=false — no user context; guarded because it only releases work that
// already satisfies release-payment's own state checks.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function release(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/release-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (_) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 3-day per-stage auto-approve safety net (mirrors job auto-confirm).
    try { await admin.rpc("auto_approve_stale_milestones", { p_days: 3 }); }
    catch (_) { /* best-effort */ }

    let released = 0, failed = 0, checked = 0;

    // 1) Single-charge jobs the client confirmed but still holding funds.
    const { data: jobs, error: je } = await admin.from("jobs")
      .select("id")
      .eq("status", "completed")
      .eq("payment_status", "held")
      .is("prepayment_id", null)
      .not("client_confirmed_at", "is", null)
      .is("disputed_at", null)
      .limit(200);
    if (je) throw je;
    for (const j of jobs ?? []) {
      checked++;
      if (await release({ job_id: j.id })) released++; else failed++;
    }

    // 1b) Prepaid recurring jobs: funded from a held pool, confirmed, un-disputed.
    const { data: pjobs, error: pe } = await admin.from("jobs")
      .select("id, prepayment_id")
      .eq("status", "completed")
      .eq("payment_status", "held")
      .not("prepayment_id", "is", null)
      .not("client_confirmed_at", "is", null)
      .is("disputed_at", null)
      .limit(200);
    if (pe) throw pe;
    for (const j of pjobs ?? []) {
      checked++;
      if (await release({ prepayment_id: j.prepayment_id, job_id: j.id })) released++; else failed++;
    }

    // 2) Milestone stages: completed + client-approved (or auto-approved) + un-disputed.
    const { data: ms, error: me } = await admin.from("job_milestones")
      .select("id")
      .eq("status", "completed")
      .not("client_approved_at", "is", null)
      .is("disputed_at", null)
      .limit(200);
    if (me) throw me;
    for (const m of ms ?? []) {
      checked++;
      if (await release({ milestone_id: m.id })) released++; else failed++;
    }

    return new Response(JSON.stringify({ checked, released, failed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reconcile-payouts:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
