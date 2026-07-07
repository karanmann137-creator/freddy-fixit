import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Admin-only full account wipe. Called from AdminDashboard.tsx.
//
// Unlike the self-service delete-account fn, this:
//   - is gated to admins only (caller's profiles.role must be 'admin'),
//   - takes the target user id from the request body,
//   - deletes EVERYTHING tied to the target (jobs, requests, disputes,
//     milestones, messages, reviews, prepayments, storage, auth login) with
//     no active-job guard and no rating tombstone. A true "make it gone".
//
// Order matters because of the FK rules:
//   disputes.(client_id|contractor_id) -> profiles  is NO ACTION (would block
//   the profile delete), and jobs/client_requests/messages -> profiles are
//   SET NULL (so they survive a profile delete). We therefore delete those
//   rows explicitly before removing the profile.

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

// Every bucket that may hold files under a `${uid}/` prefix.
const STORAGE_BUCKETS = [
  "portfolio-photos", "completion-photos", "problem-photos",
  "message-media", "contractor-photos", "contractor-docs",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1. Caller must be a signed-in admin.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "You must be signed in." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: me } = await admin
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!me || me.role !== "admin") return json({ error: "Not authorized." }, 403);

    // 2. Target.
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* ignore */ }
    const uid: string = (body?.user_id ?? "").trim();
    if (!uid) return json({ error: "Missing user_id." }, 400);
    if (uid === user.id) return json({ error: "You can't delete your own admin account here." }, 400);

    // 3. Delete disputes involving this user (NO ACTION FK would otherwise
    //    block the profile delete; job-owned disputes also cascade in step 4).
    await admin.from("disputes").delete().or(`client_id.eq.${uid},contractor_id.eq.${uid}`);

    // 4. Delete every job they're a party to. Cascades job_milestones,
    //    messages, reviews and any remaining disputes on those jobs.
    await admin.from("jobs").delete().or(`client_id.eq.${uid},contractor_id.eq.${uid}`);

    // 5. Delete their requests. Cascades bids, hidden_jobs and
    //    recurring_prepayments tied to the request.
    await admin.from("client_requests").delete().eq("user_id", uid);

    // 6. Any prepayment pools they own as the client.
    await admin.from("recurring_prepayments").delete().eq("client_id", uid);

    // 7. Messages they authored anywhere else.
    await admin.from("messages").delete().eq("sender_id", uid);

    // 8. Delete the profile — cascades contractors, notifications,
    //    portfolio_items and reviews.
    const { error: profErr } = await admin.from("profiles").delete().eq("id", uid);
    if (profErr) return json({ error: "Couldn't delete the profile: " + profErr.message }, 500);

    // 9. Best-effort storage sweep.
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
        if (files && files.length > 0) {
          await admin.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
        }
      } catch (_) { /* never block on storage cleanup */ }
    }

    // 10. Remove the auth login.
    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (authErr) {
      return json({
        ok: true,
        warning: "Data deleted, but the login record couldn't be removed. Error: " + authErr.message,
      }, 200);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
