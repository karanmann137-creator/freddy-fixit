// Presentation-only tidy-up for client-written job descriptions.
//
// The text arrives as free typing from someone describing a broken thing on a
// phone, and `composedDescription()` in NewRequest joins several parts with
// blank lines ("what they wrote" + an answer summary + "Details: a, b").
// Every reader then rendered it inside a plain <div>, which collapses those
// blank lines — so the sentence, the summary and the tag list ran together
// into one unpunctuated wall. That is most of what reads as "bad grammar";
// the rest is missing capitals and missing full stops.
//
// The rule this file follows: NORMALISE, NEVER REWRITE. Fixing spacing, case
// and terminal punctuation is safe because the meaning cannot change. Actually
// rewriting a client's words would put invented detail in front of a
// contractor who is about to price the job off it, and in front of the client
// in their own dashboard — so we do not paraphrase, reorder, expand
// abbreviations or "correct" a trade term we might be wrong about.

/** Words that must not be lowercased or sentence-capped away. */
const KEEP_CASE = /^(?:[A-Z0-9][A-Z0-9&/.'-]*)$/; // ALLCAPS / model numbers / "A/C"

function tidyParagraph(p: string): string {
  // Collapse runs of spaces and stray spaces before punctuation.
  let t = p.replace(/[ \t ]+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  if (!t) return "";

  // Space after sentence punctuation when the writer forgot ("done.next is").
  t = t.replace(/([.!?,;:])(?=[^\s\d)\]"'])/g, "$1 ");

  // Capitalise the first letter of each sentence. An all-caps token is left
  // alone — "A/C", "GFCI" and model numbers are not shouting, they're names.
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_m, lead, ch) => lead + ch.toUpperCase());
  t = t.replace(/\bi\b/g, "I");

  // Terminal punctuation — but NOT on a label-prefixed list line. The composed
  // description ends with "Details: fridge, freezer", and a full stop on a
  // comma list reads like a sentence that lost its verb.
  const isList = /^[A-Z][A-Za-z ]{0,24}:/.test(t);
  if (!isList && !/[.!?:,)]$/.test(t) && t.split(" ").length > 2 && !KEEP_CASE.test(t)) t += ".";
  return t;
}

/**
 * Returns the description as tidied paragraphs. Empty/whitespace input gives an
 * empty array so callers can decide what "no description" looks like rather
 * than being handed a blank string that renders as an invisible gap.
 */
export function tidyDescription(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}|\n(?=Details:)/)
    .map(p => tidyParagraph(p.replace(/\n/g, " ")))
    .filter(Boolean);
}

/** Single-line form, for snippets and card subtitles. */
export function tidyOneLine(raw: string | null | undefined, max = 140): string {
  const t = tidyDescription(raw).join(" ");
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
