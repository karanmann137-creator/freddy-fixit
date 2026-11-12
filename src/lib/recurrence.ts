// Category-aware recurrence options for the booking flow.
// The DB `freq_interval()` understands: weekly, biweekly, monthly, quarterly,
// seasonal, semiannual, annual. `per_km` is a mileage-interval reminder that the
// generator treats as a conservative ~4-month time nudge (odometers can't be
// auto-read), see DB `recurrence_interval()`.

export type Freq =
  | "weekly" | "biweekly" | "monthly" | "quarterly"
  | "seasonal" | "semiannual" | "annual" | "per_km";

export const FREQ_LABELS: Record<Freq, string> = {
  weekly:     "Every Week",
  biweekly:   "Every 2 Weeks",
  monthly:    "Once a Month",
  quarterly:  "Every 3 Months",
  seasonal:   "Seasonal",
  semiannual: "Twice a Year",
  annual:     "Once a Year",
  per_km:     "Per Distance (km)",
};

// Vehicle categories where a mileage interval makes sense.
const VEHICLE_SERVICES = new Set<string>([
  "Oil Change",
  "Tire Swap / Rotation",
  "Battery / Brakes",
  "Vehicle Maintenance",
]);

export function isPerKmService(service: string): boolean {
  return VEHICLE_SERVICES.has(service);
}

// Per-service cadence menus. Anything not listed falls back to DEFAULT_OPTIONS.
const OPTION_MAP: Record<string, Freq[]> = {
  // Vehicle — mileage OR time based.
  "Oil Change":            ["per_km", "quarterly", "semiannual", "annual"],
  "Tire Swap / Rotation":  ["seasonal", "per_km", "semiannual", "annual"],
  "Battery / Brakes":      ["per_km", "semiannual", "annual"],
  "Vehicle Maintenance":   ["per_km", "quarterly", "semiannual", "annual"],
  // Seasonal / weather-driven.
  "Snow Removal":          ["weekly", "biweekly", "seasonal"],
  "Landscaping":           ["weekly", "biweekly", "monthly", "seasonal"],
  "Gutters":               ["quarterly", "seasonal", "semiannual", "annual"],
  "Air Conditioning":      ["seasonal", "semiannual", "annual"],
  "HVAC Maintenance":      ["quarterly", "seasonal", "semiannual", "annual"],
  // Frequent household upkeep.
  "Cleaning Services":     ["weekly", "biweekly", "monthly", "quarterly"],
  "General Handyman":      ["monthly", "quarterly", "semiannual", "annual"],
  "Solar":                 ["seasonal", "semiannual", "annual"],
};

const DEFAULT_OPTIONS: Freq[] = [
  "weekly", "biweekly", "monthly", "quarterly", "seasonal", "semiannual", "annual",
];

// ── Slider cadence (1 week → 3 months) ───────────────────────────────────────
// The booking picker is a slider whose stops step weekly, then monthly. These
// tokens are understood by the DB `freq_interval()` (every_N_weeks / every_N_months).
export const SLIDER_STOPS = [
  "weekly", "biweekly", "every_3_weeks", "monthly", "every_2_months", "quarterly",
] as const;

// Compact tick labels shown under the slider.
export const SLIDER_SHORT: Record<string, string> = {
  weekly: "1 wk",
  biweekly: "2 wk",
  every_3_weeks: "3 wk",
  monthly: "1 mo",
  every_2_months: "2 mo",
  quarterly: "3 mo",
};

// Human-friendly label for ANY cadence token, including every_N_weeks / every_N_months.
export function freqLabel(token?: string | null): string {
  if (!token) return "";
  const known = (FREQ_LABELS as Record<string, string>)[token];
  if (known) return known;
  let m = /^every_(\d+)_weeks?$/.exec(token);
  if (m) { const n = +m[1]; return n === 1 ? "Every Week" : `Every ${n} Weeks`; }
  m = /^every_(\d+)_months?$/.exec(token);
  if (m) { const n = +m[1]; return n === 1 ? "Once a Month" : `Every ${n} Months`; }
  return token;
}
