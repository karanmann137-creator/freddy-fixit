// Per-account dismissal store for dashboard banners and attention rows.
//
// Backed by public.ui_dismissals (own-row RLS, PK on (user_id, key)). Keys are
// plain strings owned by the frontend, so a new dismissible surface needs no
// migration.
//
// THE GOVERNING RULE: a failed read resolves to "nothing dismissed", so the
// banner SHOWS. A failed read is not an empty result, and every other module
// on this platform errs the same way -- `.maybeSingle()` over `.single()`,
// `contractsFailed` suppressing a nudge rather than asserting one, jobLoadFailed
// keeping the last-known job on screen. Hiding a prompt because a query blipped
// is the worst direction to fail in here, because some of these rows are the
// only place a client is told they still owe money.
//
// Caching follows src/lib/myProfile.ts: the in-flight PROMISE is cached, not
// just the resolved value, because several surfaces mount on the same
// navigation and caching only the value still lets all of them fire. A FAILED
// read is never cached -- it heals on its own, and re-asking costs nothing.

import { supabase } from "@/lib/supabase";

export type DismissalSet = {
  /** false when the read failed. Callers must treat this as "show everything". */
  ok: boolean;
  /** Every dismissed key. Empty when the read failed, per the rule above. */
  keys: string[];
  has: (key: string) => boolean;
};

const EMPTY: DismissalSet = { ok: false, keys: [], has: () => false };

let cachedUser: string | null = null;
let cached: Promise<DismissalSet> | null = null;
let keys: Set<string> | null = null;

/** Call anywhere the signed-in user changes. Synchronous assignment, never a query. */
export function clearDismissals() {
  cachedUser = null;
  cached = null;
  keys = null;
}

async function read(userId: string): Promise<DismissalSet> {
  const { data, error } = await supabase
    .from("ui_dismissals")
    .select("key")
    .eq("user_id", userId);
  if (error) {
    // Do not cache a failure -- drop it so the next caller retries.
    if (cachedUser === userId) { cached = null; keys = null; }
    return EMPTY;
  }
  const set = new Set<string>((data ?? []).map((r: any) => String(r.key)));
  keys = set;
  return { ok: true, keys: Array.from(set), has: (k: string) => set.has(k) };
}

export function getDismissals(userId: string | null | undefined): Promise<DismissalSet> {
  if (!userId) return Promise.resolve(EMPTY);
  if (cached && cachedUser === userId) return cached;
  cachedUser = userId;
  keys = null;
  cached = read(userId);
  return cached;
}

/**
 * Record a dismissal. Optimistic: the in-memory set is updated first so the
 * row disappears immediately, and the write is fire-and-forget because a
 * failed write only means the banner returns on the next load -- which is the
 * safe direction, and exactly what the read rule above already promises.
 *
 * `on conflict do nothing` (ignoreDuplicates) is why the table needs no UPDATE
 * grant: re-dismissing is a no-op rather than a rewrite.
 */
export function dismiss(userId: string | null | undefined, key: string) {
  if (!userId || !key) return;
  if (keys) keys.add(key);
  void supabase
    .from("ui_dismissals")
    .upsert({ user_id: userId, key }, { onConflict: "user_id,key", ignoreDuplicates: true })
    .then(() => undefined, () => undefined);
}

// Any auth transition drops the cache, exactly as myProfile.ts does. This is a
// synchronous assignment, NOT a query -- the auth-lock deadlock rule forbids
// querying inside this callback, and nothing here touches the network.
supabase.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id ?? null;
  if (uid !== cachedUser) clearDismissals();
});

/** Undo a dismissal (used by the "show these again" control in Settings). */
export async function undismiss(userId: string | null | undefined, prefix: string): Promise<boolean> {
  if (!userId) return false;
  const { error } = await supabase
    .from("ui_dismissals")
    .delete()
    .eq("user_id", userId)
    .like("key", prefix + "%");
  if (error) return false;
  if (keys) for (const k of Array.from(keys)) if (k.startsWith(prefix)) keys.delete(k);
  return true;
}
