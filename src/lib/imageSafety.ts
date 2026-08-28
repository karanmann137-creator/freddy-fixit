// imageSafety.ts — the browser half of the photo safety scan.
//
// One call: scanImage(bucket, path) -> { verdict, categories, detail }.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT FAILS OPEN, DELIBERATELY, AND IN TWO PLACES.
//
// The edge function returns verdict "unknown" for every condition it cannot
// resolve — no API key, a download error, a model timeout, an unreadable
// format — and it returns those as HTTP 200 so no caller can accidentally
// learn to read a status code as a rejection. This file is the second layer:
// anything that goes wrong on THIS side (network error, the function being
// unreachable, a body that doesn't parse) also comes back "unknown", and every
// caller treats "unknown" as "send it".
//
// That matters because of what these photos are. A completion photo is the
// thing that releases a contractor's money. A problem photo is what a client
// relies on if a job goes wrong. A request photo is what gets them an accurate
// estimate instead of a guess. Losing one of those to a scanner outage is a
// far worse failure than briefly letting through a photo we'd rather not have,
// which a human can still deal with afterwards. This is the same rule
// imageCompress.ts follows when every one of its failure paths returns the
// ORIGINAL file.
//
// THE TIMEOUT IS SHORTER THAN THE FUNCTION'S OWN. The function aborts its
// model call at 20s; we give up at 12s. The person on this side is holding a
// Send button, and a scan is never worth making a message feel broken. Giving
// up early is safe rather than wasteful: the function keeps running and writes
// its verdict to image_scans regardless, so the answer isn't lost — the next
// scan of the same object reads the stored row instead of paying for a second
// model call.
//
// WHAT A VERDICT MEANS:
//   "reject"  — sexual content, graphic injury/gore, or hate symbols. The ONLY
//               verdict that should stop an upload. Show REJECT_MESSAGE.
//   "flag"    — readable contact details are visible. NOT a block. It is
//               recorded for the admin Flagged chat queue, exactly like
//               chat_guard()'s text-side flags, because a photo of a furnace
//               label carrying the manufacturer's support number is innocent
//               and refusing it would be worse than the leak it prevents.
//   "ok"      — send it.
//   "unknown" — we couldn't tell. Send it.
//
// The scan is NOT a security boundary. It runs after the object is already in
// storage (it has to — the function reads the object to look at it), so a
// caller that skips it changes nothing about who can upload; storage RLS is
// what governs that. This is moderation, and it is advisory by construction.

import { supabase } from "@/lib/supabase";

export type ScanVerdict = "ok" | "flag" | "reject" | "unknown";

export interface ScanResult {
  verdict: ScanVerdict;
  categories: string[];
  detail: string;
}

const TIMEOUT_MS = 12_000;

const UNKNOWN: ScanResult = { verdict: "unknown", categories: [], detail: "" };

/**
 * The one copy of the rejection copy. It names what was found in plain words
 * and does not quote the model's own sentence back at the person — the detail
 * field is written for an admin reading the queue, not for the uploader.
 */
export function rejectMessage(r: ScanResult): string {
  const c = r.categories.map(x => x.toLowerCase());
  if (c.includes("sexual")) return "That image can't be sent here — this is a home-services platform and the photo looks like adult content. If that's wrong, please try a different photo.";
  if (c.includes("gore")) return "That image can't be sent here — it appears to show a serious injury. If someone is hurt, please call 911. For a job photo, please send a photo of the work area instead.";
  if (c.includes("hate")) return "That image can't be sent here — it appears to contain hate symbols.";
  return "That image can't be sent here. Please try a different photo.";
}

/**
 * True only for a verdict we actually got back that says stop.
 *
 * `evidence: true` marks a surface where the photo IS the remedy — a dispute
 * exhibit, or a completion photo that releases a contractor's money. On those,
 * a `gore` reject does NOT block, and the reason is specific rather than
 * squeamish: a claim can legitimately be about an injury the work caused, and a
 * finished-work photo is a payment gate. Refusing either would use a moderation
 * tool to destroy somebody's only route to being paid or made whole — a much
 * worse outcome than the photo landing in front of an admin who can act on it.
 * It is still SCANNED, so the verdict is recorded in image_scans either way.
 *
 * `sexual` and `hate` block on every surface without exception. Neither is ever
 * evidence of anything on a home-services platform.
 */
export function shouldBlock(r: ScanResult | null | undefined, opts?: { evidence?: boolean }): boolean {
  if (r?.verdict !== "reject") return false;
  if (!opts?.evidence) return true;
  const c = r.categories.map(x => x.toLowerCase());
  return c.includes("sexual") || c.includes("hate");
}

/**
 * Scan an object that is ALREADY UPLOADED.
 *
 * Never throws. Never rejects. Returns "unknown" on anything unexpected, so a
 * call site can be written as a plain `await` with no try/catch and still be
 * correct.
 */
export async function scanImage(bucket: string, path: string): Promise<ScanResult> {
  if (!bucket || !path) return UNKNOWN;

  try {
    // Promise.race rather than an AbortController: functions.invoke gives us no
    // signal to pass through, and abandoning the promise is exactly what we
    // want — the function is still running server-side and will still write its
    // verdict, we simply stop waiting on it.
    const timeout = new Promise<ScanResult>(res => setTimeout(() => res(UNKNOWN), TIMEOUT_MS));

    const call = supabase.functions
      .invoke("scan-image", { body: { bucket, path } })
      .then(({ data, error }) => {
        if (error || !data) return UNKNOWN;
        const v = String((data as any)?.verdict ?? "");
        if (v !== "ok" && v !== "flag" && v !== "reject" && v !== "unknown") return UNKNOWN;
        return {
          verdict: v as ScanVerdict,
          categories: Array.isArray((data as any)?.categories) ? (data as any).categories.map(String) : [],
          detail: String((data as any)?.detail ?? ""),
        };
      })
      .catch(() => UNKNOWN);

    return await Promise.race([call, timeout]);
  } catch {
    return UNKNOWN;
  }
}
