import { supabase } from "./supabase";
import { detectServices } from "./serviceTags";

// ---------------------------------------------------------------------------
// Multi-trade job split detection
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS. A client posted "Job number 1 — install a couple of TVs,
// the mount goes into tiled walls. Number 2 — set a stone pathway at the side
// of the house." That is a carpentry/handyman job and a masonry job sharing one
// request row, and a request row holds exactly ONE service_needed, one budget
// floor, one set of dispatched pros and one eventual job. So one of the two
// trades was never going to see it, the estimate could only cover one half, and
// whichever pro won was going to be asked to do work they do not do.
//
// WHY AT INTAKE, AND NOWHERE ELSE. `client_requests.dispatched_to` is a
// PERMANENT "already told them" list, not a cooldown. Once a request has been
// dispatched, splitting it after the fact cannot un-tell the wrong trade, and
// re-firing the two halves needs a manual refire_count bump in raw SQL. The
// only moment a split is free is before the row is inserted — which is also the
// only moment the person who knows the answer is still on the screen.
//
// WHY IT REUSES detectServices() INSTEAD OF A NEW KEYWORD TABLE. src/lib/
// serviceTags.ts already holds a tuned 36-label keyword scorer with weak-word
// handling and a runner-up cutoff, and it is the vocabulary the post-a-job form
// already shows the client. A second copy of that vocabulary — in Postgres or
// here — would drift, and the drift would be invisible: a split suggested on a
// label the picker no longer offers throws nothing, it just proposes a part the
// client cannot file. One vocabulary, one place.
//
// THE SHAPE: LIBERAL SEGMENTING, STRICT PROPOSING. Postel's law, applied. We
// cut on anything that looks like a list marker, including a bare "and also",
// because missing a real multi-trade job is the expensive direction. We then
// refuse to PROPOSE unless the parts land on services whose contractor
// specialty sets are genuinely DISJOINT. That is what keeps the dialog quiet:
// "unclog the sink and also check the other drain" segments into two pieces and
// proposes nothing, because both pieces are Plumbing.
//
// AN UNMAPPED SERVICE CAN NEVER BE SPLIT OUT, AND THAT IS NOT A GAP. A label
// missing from service_specialty_map reaches EVERY contractor by design
// ("Other" genuinely means "we don't know the trade"). It therefore overlaps
// every other label, so the disjointness test refuses it. Splitting it out
// would buy nothing — both halves would reach the same everyone.
//
// THIS WHOLE MODULE FAILS OPEN. It sits in the submit path of the one form that
// is the top of the funnel. A detector that can block a post is worse than no
// detector, so every failure path returns null and the request posts unsplit:
// the map read failing, the text being unparseable, the segmenting finding
// nothing. Null means "no suggestion", never "wait".

export type SplitPart = {
  /** The client's own words for this part, marker text stripped. Editable. */
  description: string;
  /** The service label this part detected, from SERVICE_KEYWORDS. */
  service: string;
  /** Contractor specialties this part would reach. Non-empty by construction. */
  specialties: string[];
};

export type ServiceMap = Record<string, string[]>;

/** At most this many parts. */
const MAX_PARTS = 4;

/** A piece shorter than this is continuation text, not a job. */
const MIN_SEG_CHARS = 20;

type Cut = {
  /** Index of the marker itself — where the previous segment's body ends. */
  at: number;
  /** Index after the marker and its trailing punctuation — where the body starts. */
  bodyAt: number;
};

// Numeric and explicit list markers. These need a STRONG left boundary — start
// of text, a line break, the end of a sentence, or a dash used as a separator —
// because a bare space in front of a digit is how measurements are written, and
// `4-inch pipe` must not read as list item 4.
const NUMBERED = new RegExp(
  "(^|[\\n\\r]+|[.!?;:,]+\\s+|\\s+[-–—]+\\s+)" +
    "(" +
    "job\\s*(?:number|num|no\\.?|#)?\\s*\\d{1,2}" +
    "|(?:number|num|item|task|part|step)\\s*\\d{1,2}" +
    "|#\\s*\\d{1,2}" +
    "|\\(\\d{1,2}\\)" +
    "|\\d{1,2}\\s*[.)\\]:–—-]" +
    ")" +
    "([\\s:.)\\]–—-]*)",
  "gi",
);

// Word markers. A plain space is enough of a boundary here — "and also the
// driveway" is exactly how a second job gets tacked on, and no measurement or
// price looks like this.
const WORDED = new RegExp(
  "(^|[\\n\\r]+|[.!?;:,]+\\s+|\\s+)" +
    "((?:and\\s+)?(?:also|additionally|separately|as\\s+well\\s+as|on\\s+top\\s+of\\s+that|" +
    "secondly|second|thirdly|third|fourthly|fourth|lastly|finally)\\b)" +
    "([\\s:,.)–—-]*)",
  "gi",
);

function collectCuts(text: string): Cut[] {
  const cuts: Cut[] = [];
  for (const re of [NUMBERED, WORDED]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const at = m.index + m[1].length;
      const bodyAt = at + m[2].length + (m[3] ?? "").length;
      cuts.push({ at, bodyAt });
      // A zero-width boundary (start of text) would spin forever otherwise.
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  cuts.sort((a, b) => a.at - b.at);
  // Two patterns can land on the same spot ("2. Also paint the fence"). Keep the
  // first and let its bodyAt swallow the rest.
  const out: Cut[] = [];
  for (const c of cuts) {
    const prev = out[out.length - 1];
    if (prev && c.at < prev.bodyAt) continue;
    out.push(c);
  }
  return out;
}

/**
 * Cut a description into the pieces a list marker separates. Returns the
 * lead-in text (before the first marker) and the pieces after it.
 */
export function segmentDescription(text: string): { leadIn: string; pieces: string[] } {
  const src = String(text || "");
  const cuts = collectCuts(src);
  if (!cuts.length) return { leadIn: "", pieces: [src.trim()].filter(Boolean) };

  const leadIn = src.slice(0, cuts[0].at).trim();
  const pieces: string[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const end = i + 1 < cuts.length ? cuts[i + 1].at : src.length;
    const body = src.slice(cuts[i].bodyAt, end).trim();
    if (body) pieces.push(body);
  }
  return { leadIn, pieces };
}

/**
 * The 23-row service → specialties map, read straight from the publicly
 * readable table. Returns null on a failed read — a failed read is not an empty
 * map, and an empty map here would mean "nothing is splittable", which happens
 * to be the safe answer but would be the right answer by accident.
 */
export async function fetchServiceMap(): Promise<ServiceMap | null> {
  try {
    const { data, error } = await supabase
      .from("service_specialty_map")
      .select("service, specialties");
    if (error || !data) return null;
    const map: ServiceMap = {};
    for (const r of data as any[]) {
      if (r?.service && Array.isArray(r.specialties)) map[r.service] = r.specialties;
    }
    return Object.keys(map).length ? map : null;
  } catch {
    return null;
  }
}

// ⚠️ THE TEST IS "NEITHER SET CONTAINS THE OTHER", NOT "THE SETS ARE DISJOINT",
// AND THE DIFFERENCE IS WHY THE JOB THAT PROMPTED THIS MODULE WOULD HAVE BEEN
// MISSED. It was written as strict disjointness first and tested against the
// real description: a TV mount into tiled walls detects General Handyman
// (General Repairs, Carpentry, Painting, Drywall, Flooring / Tile) and a stone
// pathway detects Concrete / Masonry (Concrete / Masonry, General Repairs).
// Those sets INTERSECT — on General Repairs, which is a catch-all that appears
// in several map rows precisely so a generalist sees generalist work — so strict
// disjointness answered "same trade" for a carpentry job and a masonry job.
//
// Containment is the question actually being asked. Two parts are different jobs
// when neither one's pros are a subset of the other's: a Painting part inside a
// General Handyman part is not a second job, because every painter the split
// would reach was already going to see the request. One shared catch-all does
// not make a bricklayer a TV installer.
function distinctTrades(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const aInB = a.every(x => b.includes(x));
  const bInA = b.every(x => a.includes(x));
  return !aInB && !bInA;
}

/**
 * Does this description describe work for more than one trade? Pure and
 * synchronous — hand it the map from fetchServiceMap().
 *
 * Returns null for "no suggestion", which is every ambiguous case: no map, one
 * piece, pieces that detect nothing, pieces whose trades overlap, or a service
 * that isn't mapped (and so already reaches everyone).
 */
export function suggestSplit(description: string, map: ServiceMap | null): SplitPart[] | null {
  if (!map) return null;
  const { leadIn, pieces } = segmentDescription(description);

  // A lead-in that names no trade is shared context ("I have two things that
  // need doing"), so it rides along on every part rather than being dropped —
  // the client wrote it and may be relying on it. A lead-in that DOES name a
  // trade is a piece in its own right.
  //
  // ⚠️ This is decided BEFORE the "fewer than two pieces" bail-out, and the
  // order is load-bearing: "the furnace isn't heating and also the driveway
  // concrete is cracked" leaves ONE piece after the marker, with the first trade
  // sitting entirely in the lead-in. Bailing on pieces.length < 2 first threw
  // that case away — the commonest shape there is, since a second job tacked on
  // with "and also" never carries a marker for the first one.
  const leadInIsOwnPiece = leadIn.length >= MIN_SEG_CHARS && detectServices(leadIn, 1).length > 0;
  const prefix = leadInIsOwnPiece ? "" : leadIn;
  const all = leadInIsOwnPiece ? [leadIn, ...pieces] : pieces;
  if (all.length < 2) return null;

  // Collapse to parts: a piece that names no trade, or names the same trade as
  // the part before it, is continuation text and gets appended to that part.
  const parts: SplitPart[] = [];
  for (const piece of all) {
    const service = piece.length >= MIN_SEG_CHARS ? (detectServices(piece, 1)[0] ?? "") : "";
    const last = parts[parts.length - 1];
    if (!service || (last && last.service === service)) {
      if (last) last.description += "\n" + piece;
      // A leading piece that names nothing has nothing to attach to; it becomes
      // shared context, same as the lead-in.
      continue;
    }
    const specialties = map[service];
    // Unmapped: reaches everyone, so it can never be disjoint from anything.
    // Bail out entirely rather than silently proposing a 1-part "split".
    if (!specialties || !specialties.length) return null;
    parts.push({ description: piece, service, specialties });
  }

  if (parts.length < 2 || parts.length > MAX_PARTS) return null;

  // Every pair must be a genuinely different trade. One comparable pair and the
  // whole suggestion is dropped: a part-way split is a request the client has to
  // reason about, and the question we are asking is "are these different jobs?",
  // which only has a clean answer if all of them are.
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      if (!distinctTrades(parts[i].specialties, parts[j].specialties)) return null;

  if (prefix) {
    for (const p of parts) p.description = prefix + "\n\n" + p.description;
  }
  return parts;
}

/**
 * The one call a form makes. Reads the map and returns a suggestion, or null.
 * Never throws and never blocks: a caller that gets null posts the request
 * exactly as it would have before this module existed.
 */
export async function detectJobSplit(description: string): Promise<SplitPart[] | null> {
  try {
    if (!description || description.trim().length < MIN_SEG_CHARS * 2) return null;
    const map = await fetchServiceMap();
    return suggestSplit(description, map);
  } catch {
    return null;
  }
}
