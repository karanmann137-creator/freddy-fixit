// Supabase Edge Function: admin-delete-portfolio-item
//
// Removes one or more portfolio items — the storage object AND the
// portfolio_items row — on behalf of the platform owner.
//
// WHY THIS EXISTS. Postgres refuses `delete from storage.objects` outright
// (`storage.protect_delete()` raises 42501, "Use the Storage API instead"),
// precisely so nobody leaves an orphaned blob behind in S3 with a tidy-looking
// index row deleted in front of it. That is the right guard, and it means the
// only correct way to remove a photo is through the Storage API with a
// service-role client — which is what this function is. Before it existed the
// owner's only tool for a bad portfolio photo was deleting the contractor's
// entire account.
//
// ORDER IS DELIBERATE: storage object FIRST, row SECOND. If the storage delete
// fails we stop and keep the row, because a row pointing at a real file is a
// recoverable state and can simply be retried. The reverse — row gone, file
// still billed and unreachable — is the orphan the database guard exists to
// prevent, and nothing would ever find it again.
//
// AUTH — two accepted callers, and verify_jwt is NOT one of them. The anon key
// is itself a valid project-signed JWT and ships publicly in the browser
// bundle, so "Bearer <anon>" proves nothing:
//   1. a real admin JWT (for a future dashboard button), resolved by asking
//      auth.getUser() and then reading `role` from profiles — never from the
//      request body;
//   2. a single-use x-ff-internal token minted by the database
//      (public.issue_internal_token), for owner tooling run from SQL.
// This mirrors newsletter-send v2, which accepts the same two.
//
// Secrets: SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY are auto-injected. A
// service-role key is NEVER written into a function body or a pg_proc source —
// pg_proc.prosrc is publicly readable and the repo is public.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ff-internal",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// A cap, not a paging scheme. This is a moderation tool used a handful of
// items at a time; anything larger is a mistake worth refusing.
const MAX_ITEMS = 25;

async function callerIsInternal(req: Request): Promise<boolean> {
  const t = req.headers.get("x-ff-internal") ?? "";
  if (!t) return false;
  const { data, error } = await admin.rpc("consume_internal_token", {
    p_token: t, p_purpose: "edge-internal",
  });
  return !error && data === true;
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return false;
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ures } = await asUser.auth.getUser();
  const uid = ures?.user?.id;
  if (!uid) return false;
  const { data: me } = await admin.from("profiles").select("role").eq("id", uid).maybeSingle();
  return me?.role === "admin";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await callerIsInternal(req)) && !(await callerIsAdmin(req))) {
      return json({ ok: false, error: "not authorized" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.item_ids)
      ? [...new Set(body.item_ids.map((x: unknown) => String(x)).filter(Boolean))]
      : [];
    if (!ids.length)          return json({ ok: false, error: "no item_ids" }, 400);
    if (ids.length > MAX_ITEMS) return json({ ok: false, error: `at most ${MAX_ITEMS} items per call` }, 400);

    const { data: items, error: readErr } = await admin
      .from("portfolio_items")
      .select("id, contractor_id, title, photo_path")
      .in("id", ids);
    // A failed read is not an empty result — do not report "0 found" for it.
    if (readErr) return json({ ok: false, error: "could not read portfolio items" }, 500);

    const results: any[] = [];
    for (const it of items ?? []) {
      if (it.photo_path) {
        const { error: rmErr } = await admin.storage.from("portfolio-photos").remove([it.photo_path]);
        if (rmErr) {
          // Leave the row alone; see the ORDER note above.
          results.push({ id: it.id, ok: false, stage: "storage", error: rmErr.message });
          continue;
        }
      }
      const { error: delErr } = await admin.from("portfolio_items").delete().eq("id", it.id);
      results.push(delErr
        ? { id: it.id, ok: false, stage: "row", error: delErr.message }
        : { id: it.id, ok: true, title: it.title, photo_path: it.photo_path });
    }

    const missing = ids.filter((i) => !(items ?? []).some((it: any) => it.id === i));
    // `every` on an empty array is true, so a call that matched nothing at all
    // would otherwise report success. Require that something was actually
    // deleted and that nothing was left behind.
    return json({
      ok: results.length > 0 && results.every((r) => r.ok) && missing.length === 0,
      deleted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
      not_found: missing,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
