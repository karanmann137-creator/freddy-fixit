import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface ServicePrice {
  service: string;
  base_price: number | null;
  typical_low: number | null;
  typical_high: number | null;
  unit: string | null;
}

let _cache: Promise<Record<string, ServicePrice>> | null = null;

// Fetch platform base prices once per session (public RPC, anon-readable).
export function loadServicePricing(): Promise<Record<string, ServicePrice>> {
  if (!_cache) {
    _cache = supabase
      .rpc("get_service_pricing")
      .then(({ data, error }) => {
        const map: Record<string, ServicePrice> = {};
        if (!error && Array.isArray(data)) {
          for (const r of data as ServicePrice[]) map[r.service] = r;
        }
        return map;
      })
      .catch(() => ({} as Record<string, ServicePrice>));
  }
  return _cache;
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
