// Supabase Edge Function: admin-update-email
// The platform admin changes a user's LOGIN (auth) email straight from the
// dashboard, and keeps public.profiles.email in sync. Admin-gated (the caller's
// JWT must belong to a profile with role='admin'). The new email is validated
// and checked for duplicates (auth.users + profiles) before anything changes.
// verify_jwt = true.  Secrets: SUPABASE_URL / SERVICE_ROLE / ANON auto.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // ── Admin gate ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ ok: false, error: "missing auth" }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await asUser.auth.getUser();
    const uid = ures?.user?.id;
    if (!uid) return json({ ok: false, error: "not signed in" }, 401);
    const { data: me } = await admin.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (me?.role !== "admin") return json({ ok: false, error: "not authorized" }, 403);

    // ── Second factor ───────────────────────────────────────────────────────
    // Changing someone's LOGIN email is an account-takeover primitive: do it to
    // a contractor and the next password reset lands in the new inbox. The DB
    // RPCs that do irreversible things go through admin_guard(), which is
    // role + mfa_ok(); an edge function has no auth.uid() of its own and so
    // cannot call mfa_ok(), hence admin_action_allowed(uid), which answers the
    // same question for a named user.
    //
    // FAILS CLOSED. Any error resolving the gate is a refusal, never a change —
    // the same rule the contract gate follows. Note this is a no-op until the
    // admin account actually enrols in two-step: admin_action_allowed mirrors
    // mfa_ok() and returns ok for anyone not enrolled, so nobody is locked out
    // by the mere existence of this check.
    const { data: gate, error: gErr } = await admin.rpc("admin_action_allowed", { p_user_id: uid });
    if (gErr || !(gate as any)?.ok) {
      return json({ ok: false, error: (gate as any)?.reason || "Could not verify your sign-in. Try again." }, 403);
    }

    // ── Payload ─────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const userId   = String(body?.user_id || "").trim();
    const newEmail = String(body?.new_email || "").trim().toLowerCase();
    if (!userId)              return json({ ok: false, error: "user_id is required" }, 400);
    if (!newEmail)            return json({ ok: false, error: "new_email is required" }, 400);
    if (!EMAIL_RE.test(newEmail)) return json({ ok: false, error: "that doesn't look like a valid email" }, 400);

    // ── Confirm the target user exists ──────────────────────────────────────
    const { data: target, error: tErr } = await admin.auth.admin.getUserById(userId);
    if (tErr || !target?.user) return json({ ok: false, error: "user not found" }, 404);
    const currentEmail = (target.user.email ?? "").toLowerCase();
    if (currentEmail === newEmail) {
      // No-op change; still keep profiles.email in sync just in case.
      await admin.from("profiles").update({ email: newEmail }).eq("id", userId);
      return json({ ok: true, unchanged: true, email: newEmail });
    }

    // ── Duplicate check (auth.users + profiles), excluding this user ────────
    const { data: pDup } = await admin.from("profiles")
      .select("id").eq("email", newEmail).neq("id", userId).maybeSingle();
    if (pDup) return json({ ok: false, error: "another account already uses that email" }, 409);

    // Scan auth users for a matching email (paged; small marketplace).
    for (let page = 1; page <= 20; page++) {
      const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (lErr) break;
      const rows = list?.users ?? [];
      const clash = rows.find((u) => (u.email ?? "").toLowerCase() === newEmail && u.id !== userId);
      if (clash) return json({ ok: false, error: "another account already uses that email" }, 409);
      if (rows.length < 200) break;
    }

    // ── Apply: auth login email (confirmed) + profiles.email in sync ────────
    const { error: uErr } = await admin.auth.admin.updateUserById(userId, {
      email: newEmail, email_confirm: true,
    });
    if (uErr) return json({ ok: false, error: String(uErr.message || uErr) }, 400);

    const { error: pErr } = await admin.from("profiles").update({ email: newEmail }).eq("id", userId);
    if (pErr) {
      // Auth email changed but the profile row failed — report so the admin can retry.
      return json({ ok: false, error: "login email updated but profile sync failed: " + String(pErr.message || pErr) }, 500);
    }

    // Logged AFTER the change, and both emails are recorded: the whole point of
    // the entry is to be able to answer "what was this account's login before?"
    // once the original address is no longer anywhere in the database.
    // A logging failure must never undo a change that already happened, so this
    // is not awaited into the result and its error is swallowed deliberately.
    admin.rpc("log_admin_action", {
      p_action: "admin-update-email",
      p_target_table: "auth.users",
      p_target_id: userId,
      p_detail: { from: currentEmail, to: newEmail },
      p_actor: uid,
      p_via: "edge",
    }).then(({ error }) => { if (error) console.error("audit log failed:", error.message); });

    return json({ ok: true, email: newEmail });
  } catch (e) {
    console.error("admin-update-email error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
