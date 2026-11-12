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

export async function getCommissionRate(): Promise<CommissionRate> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = read("platform_commission_rate", r => { cached = r; });
  return inflight;
}

// ---------------------------------------------------------------------------
// The CLIENT-side service-fee rate — `platform_fee_rate()`, 0.03 today.
//
// Added 2026-11-07 for the contractor's price-change preview. The pro proposing
// a new price has to be able to tell the client what the client will actually
// be asked for, which is price + service fee, so the pro's screen needs the
// same rate the client's does. Two surfaces (`ClientDashboard`, `MilestonePanel`)
// still read this RPC inline with their own `useState(0.03)`; those default to
// 0.03 before the read lands, which is fine for them because they only ever
// render the client's own total. This reader refuses rather than guesses, for
// the same reason `getCommissionRate` does — a wrong fee on a price change is
// the number a dispute gets argued over.
// ---------------------------------------------------------------------------
let feeInflight: Promise<CommissionRate> | null = null;
let feeCached: CommissionRate | null = null;

export async function getFeeRate(): Promise<CommissionRate> {
  if (feeCached) return feeCached;
  if (feeInflight) return feeInflight;
  feeInflight = read("platform_fee_rate", r => { feeCached = r; });
  return feeInflight;
}

/** Shared body: read an RPC that returns a rate, validate it, cache only success. */
async function read(fn: "platform_commission_rate" | "platform_fee_rate", store: (r: CommissionRate) => void): Promise<CommissionRate> {
  try {
    const { data, error } = await supabase.rpc(fn);
    const n = Number(data);
    // A value outside (0, 1) is not a rate. Refuse it rather than render a
    // payout computed from nonsense — the caller shows nothing instead.
    if (error || !Number.isFinite(n) || n <= 0 || n >= 1) return { ok: false };
    const ok: CommissionRate = { ok: true, rate: n };
    store(ok);
    return ok;
  } catch (_) {
    return { ok: false };
  } finally {
    if (fn === "platform_commission_rate") inflight = null; else feeInflight = null;
  }
}
