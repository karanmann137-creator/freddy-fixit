// A short, human-readable ID for a job that clients can quote when filing a
// claim or contacting support. Derived deterministically from the job's UUID —
// no DB column needed. Example: "3f9a1c2d-…" -> "FFX-3F9A1".
export function jobCode(id?: string | null): string {
  if (!id) return "";
  const hex = id.replace(/[^a-f0-9]/gi, "").slice(0, 5).toUpperCase();
  return hex ? `FFX-${hex}` : "";
}

// True when a typed code loosely matches a job id (case/format tolerant).
export function codeMatches(code: string, id?: string | null): boolean {
  if (!id) return false;
  const want = code.replace(/[^a-z0-9]/gi, "").toUpperCase().replace(/^FFX/, "");
  const have = id.replace(/[^a-f0-9]/gi, "").slice(0, 5).toUpperCase();
  return want.length >= 4 && have.startsWith(want.slice(0, 5));
}
