import { supabase } from "@/lib/supabase";

// myProfile — ONE answer to "who is signed in and what are they?", shared by
// every surface that asks.
//
// WHY THIS EXISTS. Three components each read `profiles` independently, and
// all three re-read on EVERY route change: ProtectedRoute (App.tsx) gates the
// dashboards, TopNav decides which menu to draw, and FinishSignupBanner asks
// whether a profile row exists at all. TopNav additionally re-read on every
// onAuthStateChange, which includes the periodic TOKEN_REFRESHED. So a single
// navigation cost three round-trips for an answer that had not changed, and a
// user clicking around a dashboard generated a steady drip of identical
// queries. On the free plan those are billable egress and connection slots.
//
// WHAT IS SAFE TO CACHE, AND WHAT IS NOT. Only identity is cached here: the
// role, and whether a profile row exists. Both are effectively immutable for a
// signed-in session — `profiles.role` is written exactly twice in the whole
// app (AuthCallback, ContractorOnboarding), both during signup, and a row
// once created is never deleted except by full account deletion, which signs
// you out. NOTHING to do with money, contracts, jobs or milestones belongs in
// here: a stale read on those surfaces is worse than a slow one.
//
// THE PROMISE IS CACHED, NOT JUST THE VALUE. ProtectedRoute, TopNav and
// FinishSignupBanner mount together on the same navigation, so caching only
// the resolved value would still let all three fire before any of them
// answered. Storing the in-flight promise collapses that burst into one query.
//
// IN MEMORY ONLY, NEVER localStorage. A cached role that outlives the tab is
// a cached role that can outlive a sign-out on a shared computer, and the
// consequence of a stale role here is being sent to the wrong dashboard. A
// hard refresh re-verifies against the server, which is the behaviour we want.
//
// A FAILED READ IS NOT AN EMPTY RESULT. On any error the result is NOT
// cached and `ok` comes back false, so callers can tell "no profile row"
// (ok: true, exists: false — the half-finished-signup case) apart from
// "couldn't ask" (ok: false), exactly as they could when they queried
// directly. Caching a failure would turn one bad moment into a whole session
// of wrong answers.

export type MyProfile = {
  ok: boolean;          // false = the read failed; role/exists are not to be trusted
  exists: boolean;      // a profiles row exists for this user
  role: string | null;  // 'client' | 'contractor' | 'admin', or null when unknown
};

const FAILED: MyProfile = { ok: false, exists: false, role: null };

let cachedUid: string | null = null;
let inflight: Promise<MyProfile> | null = null;
let cached: MyProfile | null = null;

/** Drop everything. Called on any auth transition, and after a role is written. */
export function clearMyProfile() {
  cachedUid = null;
  inflight = null;
  cached = null;
}

/**
 * Read this user's profile identity, at most once per session per user.
 * Pass the user id you already have; callers that don't have one should use
 * `loadMyProfile()` instead, which resolves the session first.
 */
export function getMyProfile(userId: string): Promise<MyProfile> {
  if (cachedUid !== userId) clearMyProfile();
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  cachedUid = userId;
  inflight = (async (): Promise<MyProfile> => {
    // maybeSingle(): an orphaned account has no profile row, and single()
    // would return an error object rather than simply no row.
    const { data, error } = await supabase
      .from("profiles").select("role").eq("id", userId).maybeSingle();
    if (error) {
      // Do not cache a failure — let the next caller try again.
      clearMyProfile();
      return FAILED;
    }
    const val: MyProfile = { ok: true, exists: !!data, role: (data as any)?.role ?? null };
    // ABSENCE IS NEVER CACHED. A missing profile row is the half-finished
    // signup case, and it is the one answer here that heals on its own — the
    // dashboards call ensure_profile, and the trigger can land a beat after a
    // fresh signup. Caching "no row" for the session would pin the
    // finish-signup banner on screen for somebody whose account had already
    // been repaired. Orphans are rare, so re-asking costs almost nothing.
    if (val.exists && cachedUid === userId) { cached = val; }
    if (cachedUid === userId) inflight = null;
    return val;
  })();

  return inflight;
}

/**
 * Resolve the session, then the profile. Returns `null` for the user id when
 * nobody is signed in (in which case the profile fields are all empty).
 */
export async function loadMyProfile(): Promise<{ userId: string | null } & MyProfile> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return { userId: null, ok: true, exists: false, role: null };
  const p = await getMyProfile(userId);
  return { userId, ...p };
}

// Any auth transition invalidates the cache. This is a synchronous assignment,
// NOT a query — the auth-lock deadlock rule forbids querying inside this
// callback, and nothing here touches the network.
supabase.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id ?? null;
  if (uid !== cachedUid) clearMyProfile();
});
