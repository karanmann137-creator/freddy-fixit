import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface ServicePrice {
  service: string;
  base_price: number | null;
  typical_low: number | null;
  typical_high: number | null;
  unit: string | null;
  // Present on get_service_price_stats(); absent on the older get_service_pricing().
  completed_count?: number | null;
  completed_avg?: number | null;
  benchmark?: number | null;
  benchmark_source?: "jobs" | "pricebook" | null;
}

let _cache: Promise<Record<string, ServicePrice>> | null = null;

// Fetch platform base prices once per session (public RPC, anon-readable).
// Uses get_service_price_stats(), which is get_service_pricing() plus the
// per-category benchmark (real completed-job average once a category has 5+
// of them, otherwise the midpoint of the curated price book).
export function loadServicePricing(): Promise<Record<string, ServicePrice>> {
  if (!_cache) {
    _cache = Promise.resolve(
      supabase
        .rpc("get_service_price_stats")
        .then(async ({ data, error }) => {
          // Fall back to the older RPC so price hints still render if the
          // stats function hasn't been deployed yet.
          let rows = !error && Array.isArray(data) ? (data as ServicePrice[]) : null;
          if (!rows || rows.length === 0) {
            const legacy = await supabase.rpc("get_service_pricing");
            rows = Array.isArray(legacy.data) ? (legacy.data as ServicePrice[]) : [];
          }
          const map: Record<string, ServicePrice> = {};
          for (const r of rows) map[r.service] = r;
          return map;
        }),
    ).catch(() => ({} as Record<string, ServicePrice>));
  }
  return _cache!;
}

export function useServicePricing(): Record<string, ServicePrice> {
  const [m, setM] = useState<Record<string, ServicePrice>>({});
  useEffect(() => {
    let ok = true;
    loadServicePricing().then(x => { if (ok) setM(x); });
    return () => { ok = false; };
  }, []);
  return m;
}

export function money(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "";
  return "$" + Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });
}

// "$150–$350" typical range, else "from $X".
export function rangeText(p?: ServicePrice | null): string {
  if (!p) return "";
  if (p.typical_low != null && p.typical_high != null) return money(p.typical_low) + "–" + money(p.typical_high);
  if (p.base_price != null) return "from " + money(p.base_price);
  return "";
}

export function fromText(p?: ServicePrice | null): string {
  if (!p || p.base_price == null) return "";
  return "from " + money(p.base_price);
}

/* ------------------------------------------------------------------ *
 * Category benchmarks + A+/A/A- price grades
 * ------------------------------------------------------------------ */

export type Grade = "A+" | "A" | "A-";

// service_needed can hold several comma-joined services ("Plumbing Repair,
// Electrical Work"). A two-trade job costs roughly the sum, so we add the
// benchmarks. Unknown services (e.g. "Other") contribute nothing; if none of
// the services are known we return null so callers can hide the comparison
// rather than grade against a number we made up.
export function benchmarkFor(
  serviceNeeded: string | null | undefined,
  pricing: Record<string, ServicePrice>,
): { benchmark: number; low: number; high: number; source: "jobs" | "pricebook" } | null {
  if (!serviceNeeded) return null;
  let benchmark = 0, low = 0, high = 0, hits = 0;
  let source: "jobs" | "pricebook" = "pricebook";
  for (const raw of serviceNeeded.split(",")) {
    const p = pricing[raw.trim()];
    if (!p) continue;
    const mid = p.benchmark != null
      ? Number(p.benchmark)
      : (p.typical_low != null && p.typical_high != null
          ? (Number(p.typical_low) + Number(p.typical_high)) / 2
          : (p.base_price != null ? Number(p.base_price) : null));
    if (mid == null || !isFinite(mid)) continue;
    benchmark += mid;
    low  += Number(p.typical_low ?? p.base_price ?? 0);
    high += Number(p.typical_high ?? p.base_price ?? 0);
    if (p.benchmark_source === "jobs") source = "jobs";
    hits++;
  }
  return hits > 0 && benchmark > 0 ? { benchmark, low, high, source } : null;
}

// Budget grade — shown to CONTRACTORS. Higher budget vs market = better grade.
// Mirrors public.budget_grade() in SQL; keep the thresholds in sync.
export function gradeBudget(budgetMid: number | null, benchmark: number | null): Grade | null {
  if (budgetMid == null || benchmark == null || benchmark <= 0) return null;
  if (budgetMid >= benchmark * 1.15) return "A+";
  if (budgetMid >= benchmark * 0.90) return "A";
  return "A-";
}

export function budgetMid(min: number | null | undefined, max: number | null | undefined): number | null {
  const lo = min == null ? null : Number(min);
  const hi = max == null ? null : Number(max);
  if (lo == null && hi == null) return null;
  return ((lo ?? hi)! + (hi ?? lo)!) / 2;
}

// What the grade means depends on who's reading it, so the copy is split.
// "budget" = contractor reading a job. "pro" = client reading a contractor.
export function gradeLabel(g: Grade | null, kind: "budget" | "pro"): string {
  if (!g) return "";
  if (kind === "budget") {
    return g === "A+" ? "Above market" : g === "A" ? "On market" : "Below market";
  }
  return g === "A+" ? "Great value" : g === "A" ? "Market rate" : "Premium";
}

export function gradeBlurb(g: Grade | null, kind: "budget" | "pro"): string {
  if (!g) return "";
  if (kind === "budget") {
    return g === "A+" ? "This client is budgeting above the typical price for this category."
         : g === "A"  ? "This budget is in line with the typical price for this category."
         :              "This budget is below the typical price for this category.";
  }
  return g === "A+" ? "Usually prices below the category average."
       : g === "A"  ? "Usually prices in line with the category average."
       :              "Usually prices above the category average.";
}

// A+ is good news in both directions, so the colour maps to the grade itself.
export function gradeColor(g: Grade | null): string {
  return g === "A+" ? "#22c55e" : g === "A" ? "#ea6b14" : "#f59e0b";
}
