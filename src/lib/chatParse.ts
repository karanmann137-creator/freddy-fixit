// Chat helpers shared by JobChat and both dashboards.
//
// TWO separate jobs live here, and it matters that they're different:
//
// 1. BLOCKED-MESSAGE COPY. The *rules* for blocking off-platform contact live
//    in Postgres (`public.chat_flag_reasons` + the `messages_chat_guard`
//    BEFORE INSERT trigger) — that is the single source of truth, and it is
//    deliberately NOT mirrored here. Duplicating regexes in the browser would
//    let the two drift, and a client-side check is trivially bypassed anyway.
//    All this file does is turn the `flag_reasons` the DB wrote back onto the
//    row into a sentence a person can actually act on.
//
// 2. DATE/TIME DETECTION. This one HAS to be client-side — Postgres can't
//    parse "thursday at 2pm" against the reader's local calendar. The parser
//    is deliberately conservative: it needs BOTH a day anchor AND a time of
//    day before it will fire, because a false positive pops a scheduling
//    prompt on the other person's dashboard. Missing a vague "how about 2?" is
//    a much smaller failure than inventing an appointment nobody agreed to.

/* ── 1. Blocked messages ─────────────────────────────────────────────── */

// Keys match the reason tokens returned by public.chat_flag_reasons().
const FLAG_LABELS: Record<string, string> = {
  phone: "a phone number",
  email: "an email address",
  messaging_app: "another messaging app",
  social: "a social media or classifieds account",
  payment: "paying outside Freddy",
  off_platform: "arranging the work outside Freddy",
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return items[0] + " and " + items[1];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

/** One friendly sentence explaining why a message wasn't delivered. */
export function blockedReason(reasons?: string[] | null): string {
  const labels = (reasons ?? []).map(r => FLAG_LABELS[r]).filter(Boolean);
  if (!labels.length) return "This message wasn't delivered.";
  return "Not delivered — it looked like it shared " + joinList(labels) + ".";
}

/** The standing explanation shown underneath the reason. */
export const BLOCKED_HELP =
  "Keep the conversation and the payment here. Freddy's payment protection, " +
  "the signed service agreement and the dispute process only cover work booked " +
  "through the platform.";

/* ── 2. Date + time detection ────────────────────────────────────────── */

export type ParsedTime = { at: Date; label: string };

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, weds: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sept: 8, sep: 8, october: 9, oct: 9,
  november: 10, nov: 10, december: 11, dec: 11,
};

const WEEKDAY_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

/**
 * Time of day. Requires am/pm, an explicit "noon"/"midnight", or a colon —
 * so a bare number (a price, a unit number, a gate code) can never be read as
 * a time.
 */
function findTime(t: string): { h: number; m: number } | null {
  if (/\bnoon\b/.test(t)) return { h: 12, m: 0 };
  if (/\bmidnight\b/.test(t)) return { h: 0, m: 0 };

  const ampm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (h < 1 || h > 12 || m > 59) return null;
    const pm = ampm[3].startsWith("p");
    if (h === 12) h = 0;
    return { h: pm ? h + 12 : h, m };
  }

  const colon = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colon) {
    const h = parseInt(colon[1], 10);
    const m = parseInt(colon[2], 10);
    if (h > 23 || m > 59) return null;
    return { h, m };
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Pick the year for a month/day with no year written. Anything more than ~45
 * days in the past is almost certainly next year ("book me for jan 8").
 */
function pickYear(month: number, day: number, now: Date): number {
  const thisYear = new Date(now.getFullYear(), month, day);
  if (thisYear.getTime() > now.getTime() - 45 * DAY_MS) return now.getFullYear();
  return now.getFullYear() + 1;
}

/**
 * A calendar day. `weekdayOnly` marks anchors that could legitimately roll to
 * next week (a bare weekday name), so the caller can push past a time that has
 * already gone by today.
 */
function findDay(t: string, now: Date): { date: Date; weekdayOnly: boolean } | null {
  // Most explicit first: 2026-08-05
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    if (!isNaN(d.getTime())) return { date: d, weekdayOnly: false };
  }

  // august 5 / aug 5th
  const md = t.match(new RegExp("\\b(" + MONTH_RE + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b"));
  if (md) {
    const mo = MONTHS[md[1]], day = +md[2];
    if (day >= 1 && day <= 31) return { date: new Date(pickYear(mo, day, now), mo, day), weekdayOnly: false };
  }

  // 5 august / 5th of august
  const dm = t.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(" + MONTH_RE + ")\\b"));
  if (dm) {
    const day = +dm[1], mo = MONTHS[dm[2]];
    if (day >= 1 && day <= 31) return { date: new Date(pickYear(mo, day, now), mo, day), weekdayOnly: false };
  }

  if (/\b(today|tonight|this\s+afternoon|this\s+evening|this\s+morning)\b/.test(t)) {
    return { date: midnight(now), weekdayOnly: false };
  }
  if (/\btomorrow\b/.test(t)) {
    return { date: new Date(midnight(now).getTime() + DAY_MS), weekdayOnly: false };
  }

  // monday / next monday / this monday
  const wd = t.match(new RegExp("\\b(next\\s+|this\\s+)?(" + WEEKDAY_RE + ")\\b"));
  if (wd) {
    const target = WEEKDAYS[wd[2]];
    const base = midnight(now);
    let delta = (target - base.getDay() + 7) % 7;      // 0 = today
    if (wd[1] && wd[1].trim() === "next" && delta < 7) delta += 7;
    return { date: new Date(base.getTime() + delta * DAY_MS), weekdayOnly: !wd[1] };
  }

  // 8/5 or 8/5/26 — read North American (month first), which is what Calgary
  // uses. Deliberately LAST, and guarded, because trade chat is full of
  // fractions: "3/4 inch coupling" must never become March 4th. Anything
  // followed by a measurement unit is a fraction, not a date.
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(["']|\b(?:in|inch|inches|ft|foot|feet|mm|cm|m|npt|hp|od|id)\b)?/);
  if (slash && !slash[4]) {
    const mo = +slash[1] - 1, day = +slash[2];
    if (mo >= 0 && mo <= 11 && day >= 1 && day <= 31) {
      let year: number;
      if (slash[3]) { const y = +slash[3]; year = y < 100 ? 2000 + y : y; }
      else year = pickYear(mo, day, now);
      return { date: new Date(year, mo, day), weekdayOnly: false };
    }
  }

  return null;
}

/**
 * Pull a concrete appointment out of a chat message, or null.
 * Needs a day AND a time — see the note at the top of this file.
 */
export function detectDateTime(raw: string, now: Date = new Date()): ParsedTime | null {
  const t = (raw || "").toLowerCase();
  if (!t.trim()) return null;

  const time = findTime(t);
  if (!time) return null;
  const day = findDay(t, now);
  if (!day) return null;

  const at = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), time.h, time.m, 0, 0);

  // "thursday at 9am" sent on a Thursday afternoon means next Thursday.
  if (day.weekdayOnly && at.getTime() < now.getTime()) at.setDate(at.getDate() + 7);

  // Never propose something in the past, and don't chase a stray year.
  if (at.getTime() < now.getTime() - 60_000) return null;
  if (at.getTime() > now.getTime() + 365 * DAY_MS) return null;

  return { at, label: formatWhen(at) };
}

/** "Thursday, Aug 6 at 2:00 PM" — the same shape used across the dashboards. */
export function formatWhen(d: Date | string): string {
  const at = typeof d === "string" ? new Date(d) : d;
  if (isNaN(at.getTime())) return "the agreed time";
  return at.toLocaleString(undefined, {
    weekday: "long", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
