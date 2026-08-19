import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Platform mode — is the marketplace taking new client job requests right now?
 *
 *   open      normal operation
 *   waitlist  new requests are captured but NOT dispatched to contractors
 *   paused    new requests are refused outright
 *
 * The authoritative gate is the DB trigger `enforce_platform_pause` on
 * client_requests, NOT this module. Everything here is presentation: it decides
 * what copy a visitor sees, never whether a write is allowed.
 *
 * That is why this fails OPEN. If `platform_status()` errors (network blip, a
 * cold start, an old cached bundle) we render the normal site rather than a
 * "we're closed" screen. The server still refuses or waitlists the write, so a
 * failure here costs a confusing moment, while failing closed would take the
 * whole business offline on a transient error. This is a deliberate exception
 * to the usual "a failed read is not an empty result" rule.
 */

export type PlatformMode = "open" | "paused" | "waitlist";

export type PlatformNotice = {
  headline: string;
  body: string;
  cta: string;
  /**
   * Long-form "why are you paused?" copy, shown when someone presses the
   * site-wide strip. Markdown, rendered by MdBody — the SAME `## ` / `- ` /
   * `**bold**` rules the newsletter and blog already use, so there is one set of
   * formatting rules on the platform rather than two.
   *
   * Lives in the notice jsonb rather than in code on purpose: `platform_status()`
   * reads `platform_settings.pause_notice` as a free-form blob, so this needed no
   * migration and the owner can reword it from the admin Platform tab without a
   * deploy. Empty string is a valid answer — the strip stops being pressable and
   * goes back to being a plain strip.
   */
  details: string;
};

export type PlatformStatus = {
  mode: PlatformMode;
  notice: PlatformNotice;
};

export const DEFAULT_NOTICE: PlatformNotice = {
  headline: "We're rebuilding Freddy Fix It",
  body: "New job requests are paused for a short while as we make the site better. Leave your details and you'll be first to know the moment we reopen.",
  cta: "Join the waitlist",
  // Every claim below is one the platform can actually keep today. Note the
  // deliberate wording on vetting: ID is "verified" because Stripe had a
  // regulated third party check government photo ID, while insurance and WCB are
  // only ever "on file" — a statement about what we hold, not about whether the
  // document is current. Promoting an "on file" marker to "verified" is the one
  // change here that could push someone into an unsafe hire.
  details: [
    "## Why we're paused",
    "We'd rather fix things before you feel them. Freddy Fix It is being rebuilt around the parts that matter most — how you get quoted, how your money is handled, and who ends up at your door. Taking new jobs while that is half-finished would mean learning on somebody's kitchen.",
    "",
    "## What we're improving",
    "- **Your money, held safely.** Payment is held and only released to your pro once you confirm the work is actually done. If something goes wrong, you can raise it before anyone gets paid.",
    "- **Real checks on every pro.** Government photo ID verified through our payments provider, with insurance and WCB coverage on file before a contractor can take a dollar.",
    "- **A written agreement, every time.** A proper service agreement signed by both sides before work starts, emailed to you for your records.",
    "- **Quotes that come to you.** Local pros quote on your job, so you're not ringing round for callbacks that never come.",
    "",
    "## When we're back",
    "Soon — but we're not putting a date on it, because we'd rather be right than fast. Leave your details below and you'll be the first to know. We'll only email you about reopening, nothing else.",
  ].join("\n"),
};

export const OPEN_STATUS: PlatformStatus = { mode: "open", notice: DEFAULT_NOTICE };

// One fetch per session, shared by every component that asks. `inflight` means
// three components mounting at once still make a single request.
let cache: PlatformStatus | null = null;
let inflight: Promise<PlatformStatus> | null = null;

function coerce(raw: any): PlatformStatus {
  const mode = raw?.mode;
  const n = raw?.notice ?? {};
  return {
    mode: mode === "paused" || mode === "waitlist" ? mode : "open",
    notice: {
      headline: typeof n.headline === "string" && n.headline ? n.headline : DEFAULT_NOTICE.headline,
      body: typeof n.body === "string" && n.body ? n.body : DEFAULT_NOTICE.body,
      cta: typeof n.cta === "string" && n.cta ? n.cta : DEFAULT_NOTICE.cta,
      // Deliberately NOT the `&& n.details` test the other three use. Those
      // treat empty as "unset, use the default", which is right for a headline
      // that must always say something. Here an empty string is a real choice —
      // it's how the owner turns the detail panel off — so only a MISSING key
      // falls back. Without this distinction the panel could never be removed.
      details: typeof n.details === "string" ? n.details : DEFAULT_NOTICE.details,
    },
  };
}

export async function getPlatformStatus(force = false): Promise<PlatformStatus> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc("platform_status");
      if (error) throw error;
      cache = coerce(data);
    } catch {
      // Fail open — see the note at the top of this file.
      cache = OPEN_STATUS;
    } finally {
      inflight = null;
    }
    return cache as PlatformStatus;
  })();

  return inflight;
}

/** Drop the cached value so the next read hits the DB (used after an admin toggle). */
export function clearPlatformStatusCache() {
  cache = null;
  inflight = null;
}

/**
 * Read the platform status in a component.
 *
 * `ready` is false until the first read lands. Gate any "we're paused" UI on
 * `ready` so a normal open site never flashes a pause banner while loading.
 */
export function usePlatformStatus(): { status: PlatformStatus; ready: boolean; refresh: () => void } {
  const [status, setStatus] = useState<PlatformStatus>(cache ?? OPEN_STATUS);
  const [ready, setReady] = useState<boolean>(cache != null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getPlatformStatus(tick > 0).then(s => {
      if (!alive) return;
      setStatus(s);
      setReady(true);
    });
    return () => { alive = false; };
  }, [tick]);

  return { status, ready, refresh: () => { clearPlatformStatusCache(); setTick(t => t + 1); } };
}

/** True when clients can post a job request normally. */
export function acceptingRequests(mode: PlatformMode): boolean {
  return mode === "open";
}

/** True when we should show a waitlist capture form instead of the request form. */
export function capturingWaitlist(mode: PlatformMode): boolean {
  return mode === "waitlist";
}
