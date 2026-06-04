import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Self-service account deletion. Called by an authenticated user from their
// dashboard (DeleteAccount.tsx). A user can ONLY ever delete themselves: the
// id is taken from their JWT, never from the request body.
//
// What it does, in order:
//   1. Resolve the caller from their JWT (401 if not signed in).
//   2. Block deletion if they have a job still in progress (409).
//   3. If they are a contractor whose average review score is poor, write a
//      privacy-preserving tombstone (HASHES only, no plaintext) to
//      deleted_account_flags so a re-signup with the same details can be
//      flagged to the admin.
//   4. Scrub denormalized PII that the FK cascade would otherwise leave behind
//      (their own client_requests + the messages they authored).
//   5. Delete their profile row — the DB cascade removes contractors, bids,
//      portfolio_items, notifications and reviews, and nulls them out of jobs
//      (completed jobs are kept as anonymized records).
//   6. Best-effort: remove storage files stored under their user-id folder.
//   7. Delete their auth.users record so they can no longer log in.

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

// Review scores are on a 1–10 scale. Average below this (with >=1 review)
// marks a deleted contractor as "poor" for re-signup flagging. Tune freely.
const BAD_RATING_MAX = 6.0;

// Jobs in these states block deletion until finished or cancelled.
const BLOCKING_JOB_STATUSES = ["assigned", "scheduled", "in_progress", "pending_confirmation"];

// Storage buckets to sweep for files saved under a `${uid}/` prefix.
const STORAGE_BUCKETS = ["portfolio-photos", "completion-photos", "problem-photos"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// SHA-256 hex of a string. MUST stay byte-identical to the browser-side helper
// in AdminDashboard.tsx so hashes line up for matching.
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const normEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();
const normPhone = (p?: string | null) => (p ?? "").replace(/\D/g, "");
const normName  = (f?: string | null, l?: string | null) =>
  [f ?? "", l ?? ""].join(" ").trim().toLowerCase().replace(/\s+/g, " ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1. Who is calling?
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "You must be signed in to delete your account." }, 401);
    const uid = user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, email, first_name, last_name, phone")
      .eq("id", uid)
      .maybeSingle();

    // 2. Active-job guard.
    const { data: activeJobs } = await admin
      .from("jobs")
      .select("id, status")
      .or(`client_id.eq.${uid},contractor_id.eq.${uid}`)
      .in("status", BLOCKING_JOB_STATUSES);
    if (activeJobs && activeJobs.length > 0) {
      return json({
        error: "You still have a job in progress. Please finish or cancel it before deleting your account. " +
               "If you need a hand, email hello@freddyfixit.ca.",
      }, 409);
    }

    // 3. Tombstone a poorly-rated contractor (hashes only — no plaintext PII).
    const { data: contractor } = await admin
      .from("contractors").select("id").eq("id", uid).maybeSingle();
    if (contractor) {
      const { data: revs } = await admin
        .from("reviews")
        .select("price_score, experience_score, result_score")
        .eq("contractor_id", uid);
      if (revs && revs.length > 0) {
        const avg = revs.reduce(
          (sum, r) => sum + ((r.price_score + r.experience_score + r.result_score) / 3), 0,
        ) / revs.length;
        if (avg < BAD_RATING_MAX) {
          const email = normEmail(profile?.email);
          const phone = normPhone(profile?.phone);
          const name  = normName(profile?.first_name, profile?.last_name);
          await admin.from("deleted_account_flags").insert({
            email_hash:   email ? await sha256Hex(email) : null,
            phone_hash:   phone ? await sha256Hex(phone) : null,
            name_hash:    name  ? await sha256Hex(name)  : null,
            review_count: revs.length,
            avg_score:    Number(avg.toFixed(2)),
            was_poor:     true,
          });
        }
      }
    }

    // 4. Scrub denormalized PII the cascade would leave behind.
    //    (bids on these requests cascade-delete automatically.)
    await admin.from("messages").delete().eq("sender_id", uid);
    await admin.from("client_requests").delete().eq("user_id", uid);

    // 5. Delete the profile — cascades + SET NULLs handle the rest.
    const { error: profErr } = await admin.from("profiles").delete().eq("id", uid);
    if (profErr) return json({ error: "We couldn't delete your profile. Please try again, or email hello@freddyfixit.ca." }, 500);

    // 6. Best-effort storage sweep (only catches files stored under a `${uid}/` folder).
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
        if (files && files.length > 0) {
          await admin.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
        }
      } catch (_) { /* never block deletion on storage cleanup */ }
    }

    // 7. Remove the auth login (no FK from profiles, so this is a separate step).
    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (authErr) {
      return json({
        ok: true,
        warning: "Your data was deleted, but the login record couldn't be removed automatically. Email hello@freddyfixit.ca and we'll finish it.",
      }, 200);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
