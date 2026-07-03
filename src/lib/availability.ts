// Shared availability model for contractors.
// Shape stored on contractors.availability:
//   { days: string[], start: "HH:MM", end: "HH:MM" }
// (Older rows may use { windows: [...] } or { Monday: [...] } — helpers below
// read those gracefully so nothing breaks during the transition.)

export const AVAIL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export const WEEKDAYS   = ["Monday","Tuesday","Wednesday","Thursday","Friday"];

// Selectable clock times, 6:00 AM → 10:00 PM on the half hour.
export const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let mins = 6 * 60; mins <= 22 * 60; mins += 30) {
    const h = Math.floor(mins / 60), m = mins % 60;
    const value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const label = h12 + (m ? ":" + String(m).padStart(2, "0") : "") + " " + ampm;
    out.push({ value, label });
  }
  return out;
})();

export const DEFAULT_START = "08:00";
export const DEFAULT_END   = "17:00";

export function timeLabel(v: string): string {
  return TIME_OPTIONS.find(t => t.value === v)?.label ?? v;
}

// Normalize whatever is stored into { days, start, end }.
export function readAvailability(a: any): { days: string[]; start: string; end: string } {
  if (a && Array.isArray(a.days)) {
    return { days: a.days, start: a.start || DEFAULT_START, end: a.end || DEFAULT_END };
  }
  // Legacy per-day-slots shape: { Monday: [...], ... }
  if (a && typeof a === "object" && !a.windows) {
    const days = AVAIL_DAYS.filter(d => Array.isArray(a[d]) && a[d].length > 0);
    if (days.length) return { days, start: DEFAULT_START, end: DEFAULT_END };
  }
  // Legacy windows shape or empty.
  const legacyDays = a && Array.isArray(a.windows) && a.windows.some((w: string) => /weekend/i.test(w))
    ? AVAIL_DAYS
    : (a && Array.isArray(a.windows) && a.windows.length ? WEEKDAYS : []);
  return { days: legacyDays, start: DEFAULT_START, end: DEFAULT_END };
}

// Human summary, e.g. "Mon–Fri, 8:00 AM – 5:00 PM".
export function availabilitySummary(a: any): string {
  const { days, start, end } = readAvailability(a);
  if (!days.length) return "Not set";
  const isWeekdays = days.length === 5 && WEEKDAYS.every(d => days.includes(d));
  const isEvery = days.length === 7;
  const dayText = isEvery ? "Every day" : isWeekdays ? "Mon–Fri" : days.map(d => d.slice(0, 3)).join(", ");
  return dayText + ", " + timeLabel(start) + " – " + timeLabel(end);
}
