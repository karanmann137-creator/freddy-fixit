/**
 * Approximate location — the ONE place that decides what "roughly where" means.
 *
 * Until a client picks a pro, nobody on the platform needs their street address.
 * A postal code plus a quadrant is enough to dispatch, rank and price a job, and
 * it is the most we can hand to seven strangers bidding on somebody's house.
 * The full address is confirmed later, once, immediately before the deposit
 * (see `confirm_job_address` and the ClientDashboard gate).
 *
 * ⚠️ THE STORED STRING MUST CARRY BOTH A POSTAL CODE AND AN AREA TOKEN.
 *
 * `client_requests.location` is read by three server-side things that predate
 * this file and were NOT changed for it:
 *
 *   - `public.mask_location(text)` pulls a postal code AND a zone out of the raw
 *     string. A zone is `(Airdrie|Cochrane|Chestermere|Okotoks|Strathmore)`, else
 *     `\m(NW|NE|SW|SE)\M` rendered as "X Calgary", else `(downtown|beltline)`.
 *     With neither present it returns the bare string "Calgary area".
 *   - `list_open_jobs()` regexes the RAW location for those same quadrant / town
 *     tokens to rank in-zone jobs above out-of-zone ones. Ranking is never a
 *     filter, so a missing token throws no error and shows no empty state — it
 *     just quietly makes every new request out-of-zone for every contractor.
 *     That is the `trade_reach` / Locksmith failure shape: silent, and invisible
 *     in the data.
 *   - `dispatch-job`'s subject line ("new {service} job in {area}").
 *
 * So `formatApproxLocation` emits "T3A 1B2 · NW Calgary" — a value `mask_location`
 * maps to ITSELF, which is the property we actually want: there is nothing left
 * to hide from a bidding pro because we never collected it in the first place.
 * Change the separator or drop the area token and in-zone ranking dies quietly.
 *
 * The FSA→area map is a frontend PRE-TICK CONVENIENCE and nothing more. It only
 * ever suggests, the client can always correct it, and an unknown FSA suggests
 * nothing rather than guessing. That is deliberate: it lives here, correctable
 * without a migration, precisely because a postal-code map is the kind of data
 * that is 95% right and stays that way.
 */

export const AREAS = [
  "NW",
  "NE",
  "SW",
  "SE",
  "Downtown / Beltline",
  "Airdrie",
  "Cochrane",
  "Chestermere",
];

/** A full Canadian postal code, with or without the middle space/hyphen. */
export const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export function isPostalCode(v: string): boolean {
  return POSTAL_RE.test((v || "").trim());
}

/** "t3a1b2" / "T3A-1B2" -> "T3A 1B2". Returns "" when it isn't a full postal code. */
export function normalizePostal(v: string): string {
  const raw = (v || "").trim();
  if (!POSTAL_RE.test(raw)) return "";
  const c = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return c.slice(0, 3) + " " + c.slice(3, 6);
}

/** The forward sortation area — the first three characters. "" when unreadable. */
export function fsaOf(v: string): string {
  const c = (v || "").trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-Z]\d[A-Z]/.test(c) ? c.slice(0, 3) : "";
}

/**
 * FSA -> area. Broad-brush on purpose; several Calgary FSAs straddle a quadrant
 * boundary, and the client gets the last word either way.
 */
const FSA_AREA: Record<string, string> = {
  // Northwest
  T2K: "NW", T2L: "NW", T2M: "NW", T2N: "NW",
  T3A: "NW", T3B: "NW", T3G: "NW", T3K: "NW", T3L: "NW", T3P: "NW", T3R: "NW",
  // Northeast
  T1Y: "NE", T2E: "NE", T3J: "NE", T3N: "NE",
  // Southwest
  T2S: "SW", T2T: "SW", T2V: "SW", T2W: "SW", T2X: "SW", T2Y: "SW",
  T3C: "SW", T3E: "SW", T3H: "SW", T3Z: "SW",
  // Southeast
  T2A: "SE", T2B: "SE", T2C: "SE", T2G: "SE", T2H: "SE", T2J: "SE",
  T2Z: "SE", T3M: "SE", T3S: "SE",
  // Central
  T2P: "Downtown / Beltline", T2R: "Downtown / Beltline",
  // Surrounding towns we serve
  T4A: "Airdrie", T4B: "Airdrie",
  T4C: "Cochrane",
  T1X: "Chestermere",
};

/** The area a postal code suggests, or [] when we don't recognise it. */
export function areasFromPostal(v: string): string[] {
  const a = FSA_AREA[fsaOf(v)];
  return a ? [a] : [];
}

/**
 * Areas mentioned in free text. Moved here from ContractorOnboarding's local
 * `zonesFromAddress` so the client and contractor sides can't drift — they have
 * to agree, because one is matched against the other.
 */
export function areasFromText(text: string): string[] {
  const t = (text || "").toUpperCase();
  const out: string[] = [];
  if (/\bNW\b|NORTHWEST/.test(t)) out.push("NW");
  if (/\bNE\b|NORTHEAST/.test(t)) out.push("NE");
  if (/\bSW\b|SOUTHWEST/.test(t)) out.push("SW");
  if (/\bSE\b|SOUTHEAST/.test(t)) out.push("SE");
  if (/DOWNTOWN|BELTLINE/.test(t)) out.push("Downtown / Beltline");
  if (/AIRDRIE/.test(t)) out.push("Airdrie");
  if (/COCHRANE/.test(t)) out.push("Cochrane");
  if (/CHESTERMERE/.test(t)) out.push("Chestermere");
  return out;
}

/**
 * The token `mask_location` and `list_open_jobs` actually look for. A quadrant
 * has to be spelled "NW Calgary" rather than bare "NW" so the masked value and
 * the stored value are the same string.
 */
export function areaToken(area: string): string {
  const a = (area || "").trim();
  if (a === "NW" || a === "NE" || a === "SW" || a === "SE") return a + " Calgary";
  if (a === "Downtown / Beltline") return "Downtown";
  if (a === "Airdrie" || a === "Cochrane" || a === "Chestermere") return a;
  return "";
}

/**
 * The value written to `client_requests.location`. Both halves matter — see the
 * warning at the top of this file.
 */
export function formatApproxLocation(postal: string, area: string): string {
  const pc = normalizePostal(postal);
  const token = areaToken(area);
  return [pc, token].filter(Boolean).join(" · ");
}

/** Plain-English label for a stored approximate location, for read-only display. */
export function approxLabel(v: string): string {
  const s = (v || "").trim();
  return s || "Calgary area";
}

/**
 * Read an approximate location back OUT of a stored string.
 *
 * Two callers, two different inputs, and the second is the reason this is
 * tolerant rather than an exact inverse of `formatApproxLocation`:
 *
 *   - a value this file wrote ("T3A 1B2 · NW Calgary"), which round-trips; and
 *   - a LEGACY `client_requests.location`, which is a full street address,
 *     because that is what the form collected before 2026-09-08.
 *
 * So it hunts for a postal code anywhere in the text and reads the area with the
 * same `areasFromText` the contractor side uses. Either half may come back
 * empty, and the caller decides what an incomplete answer is worth — NewRequest
 * only offers "same as last time" when BOTH halves are present, because half an
 * approximate location is exactly the silent in-zone-ranking failure the warning
 * at the top of this file is about.
 *
 * It deliberately returns the postal code and NOTHING else out of a street
 * address. Re-deriving an address from an address is not the job; dropping it is.
 */
export function parseApproxLocation(text: string): { postal: string; area: string } {
  const s = (text || "").trim();
  const m = s.match(/[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d/);
  const postal = m ? normalizePostal(m[0]) : "";
  const area = areasFromText(s)[0] || areasFromPostal(postal)[0] || "";
  return { postal, area };
}
