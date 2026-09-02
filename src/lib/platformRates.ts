// The platform's commission rate, read from the database rather than hardcoded.
//
// `platform_commission_rate()` is the single source of truth for what the
// platform keeps out of the contractor's side; the contractor receives
// `1 - rate`. There are exactly FIVE deliberate hardcoded copies of 0.07/0.93
// on this platform, all inside edge functions on the CHARGE path, where reading
// a rate over the network would turn an unreadable constant into a blocked
// checkout — a new failure mode bought for no benefit. A dashboard label is not
// the charge path: the worst case here is a missing number, so this reads the
// real rate and there is no sixth copy.
//
// It caches the in-flight PROMISE, not just the resolved value — several cards
// can ask on the same render pass, and caching only the value still lets all of
// them fire before any of them answers. Same reasoning as `myProfile.ts`.
//
// A FAILED read is never cached. It heals on its own, asking again costs one
// round trip, and pinning a failure for the whole session would suppress every
// payout estimate until the tab is reloaded.

import { supabase } from "@/lib/supabase";

export type CommissionRate = { ok: true; rate: number } | { ok: false };

let inflight: Promise<CommissionRate> | null = null;
let cached: CommissionRate | null = null;

/** Drop the cached rate. Only needed if the platform rate is changed mid-session. */
export function clearPlatformRates() { inflight = null; cached = null; }

export async function getCommissionRate(): Promise<CommissionRate> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async (): Promise<CommissionRate> => {
    try {
      const { data, error } = await supabase.rpc("platform_commission_rate");
      const n = Number(data);
      // A value outside (0, 1) is not a rate. Refuse it rather than render a
      // payout computed from nonsense — the caller shows nothing instead.
      if (error || !Number.isFinite(n) || n <= 0 || n >= 1) { inflight = null; return { ok: false }; }
      cached = { ok: true, rate: n };
      inflight = null;
      return cached;
    } catch (_) {
      inflight = null;
      return { ok: false };
    }
  })();
  return inflight;
}
