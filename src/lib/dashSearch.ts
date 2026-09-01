// Dashboard search — a CLIENT-SIDE filter over rows the dashboard has already
// loaded. There is deliberately no query, no RPC and no new RLS surface: every
// dashboard already holds its requests and jobs in state, so searching them
// costs nothing and can never show a row the server wouldn't have sent.
//
// TOKENISING BOTH SIDES THE SAME WAY IS THE WHOLE TRICK. A job code is
// `FFX-2A1B` (src/lib/jobCode.ts) and people type it as "ffx2a1b", "FFX 2A1B"
// or just "2a1b". Stripping every non-alphanumeric from the haystack AND the
// needle makes all four spellings match without a special case, and it does the
// same favour for phone-ish and address-ish text.
//
// AND ACROSS TOKENS, not OR: "plumbing nw" should mean both, which is how
// anyone narrowing a list expects a search box to behave. Each token is matched
// independently, so word order never matters.
//
// AN EMPTY QUERY MATCHES EVERYTHING. Callers can pass the raw input straight
// through without guarding, and a search box that is being cleared never blinks
// an empty state on its way back to showing the full list.

/** Fold a string to lowercase alphanumerics. `"FFX-2A1B"` -> `"ffx2a1b"`. */
function fold(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Split a query into folded tokens. Whitespace separates tokens; everything
 * else is stripped inside them.
 */
export function searchTokens(q: string | null | undefined): string[] {
  if (!q) return [];
  return q.split(/\s+/).map(fold).filter(Boolean);
}

/**
 * True when every token appears somewhere in the row's searchable fields.
 *
 * `fields` takes anything — nulls, numbers, undefined — so call sites can spread
 * a row's columns in without pre-cleaning them.
 */
export function matchesSearch(tokens: string[], fields: (string | number | null | undefined)[]): boolean {
  if (tokens.length === 0) return true;
  const hay = fold(fields.filter(v => v !== null && v !== undefined && v !== "").join(" "));
  if (!hay) return false;
  return tokens.every(t => hay.includes(t));
}
