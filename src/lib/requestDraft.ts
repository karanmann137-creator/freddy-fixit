import { useEffect, useRef, useState } from "react";

/**
 * Remembering a half-finished job request.
 *
 * The problem this solves is small and expensive: someone types out what's
 * broken, gets three screens in, taps the logo to check something on the
 * homepage, comes back and the form is blank. There is nothing to recover
 * because nothing was ever kept, so the only way forward is to type it all
 * again — and the description, which is the single most valuable field on the
 * platform because every matcher and every bid reads it, is the longest thing
 * to retype and the first thing people give up on.
 *
 * SESSION STORAGE, NOT LOCAL STORAGE. This is a deliberate difference from the
 * contractor onboarding draft (`ff_contractor_draft`, localStorage), and the
 * reason is that the two drafts are not the same kind of thing. A contractor
 * signup is a filing exercise — insurance certificates, WCB numbers, references
 * — that somebody legitimately abandons on Monday and finishes on Thursday. A
 * job request is a description of something that is broken RIGHT NOW; a week
 * later it has usually been fixed, or the urgency has changed, and re-offering
 * it is worse than a blank form. sessionStorage also disappears when the tab
 * closes, which is what makes this safe on a shared or family computer: the
 * draft holds an address, a phone number and a description of the inside of
 * someone's house, and none of that should survive the browsing session.
 *
 * THREE THINGS ARE NEVER SAVED, and each for its own reason:
 *   - the PASSWORD. Same rule the contractor draft follows. A password in
 *     storage is readable by any script on the origin and by anyone who opens
 *     devtools on a shared machine, and it buys the user nothing: retyping a
 *     password you just chose is trivial next to retyping a job description.
 *   - the PHOTO. A `File` is a live handle to something on disk; it does not
 *     survive JSON, and a stringified one restores as `{}`, which is worse than
 *     nothing because the UI would then claim a photo is attached when the
 *     submit path has no bytes to upload.
 *   - anything TRANSIENT — validation errors, loading and submit flags. Those
 *     describe a moment, not an intention. Restoring `loading: true` would show
 *     a spinner over a form that isn't submitting anything.
 *
 * Writes are debounced because these forms have per-keystroke state and
 * sessionStorage writes are synchronous on the main thread.
 */

/** One key per form. They hold different shapes and must never cross-restore. */
export const ONBOARDING_DRAFT_KEY = "ff_req_draft_signup";
export const NEWREQUEST_DRAFT_KEY = "ff_req_draft_return";

/** Bump when a saved shape stops being readable by the current form. */
const DRAFT_VERSION = 1;

/**
 * How long a draft stays offerable, in hours.
 *
 * Belt and braces over sessionStorage's own lifetime: a tab left open
 * overnight is a real thing people do, and being offered yesterday's emergency
 * plumbing description this morning is unsettling rather than helpful.
 */
const MAX_AGE_H = 12;

type Stored = { v: number; at: number; data: Record<string, unknown> };

function keysOf(o: Record<string, unknown>): string[] {
  return Object.keys(o);
}

/** Read a draft, or null. Never throws — storage can be disabled or full. */
export function readDraft(key: string): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Stored;
    if (!p || p.v !== DRAFT_VERSION || !p.data || typeof p.data !== "object") return null;
    if (!Number.isFinite(p.at) || Date.now() - p.at > MAX_AGE_H * 3600_000) { clearDraft(key); return null; }
    return p.data;
  } catch { return null; }
}

export function clearDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* storage disabled */ }
}

function writeDraft(key: string, data: Record<string, unknown>) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ v: DRAFT_VERSION, at: Date.now(), data } as Stored));
  } catch { /* quota or disabled — a lost draft must never break the form */ }
}

/**
 * Is there enough in this draft to be worth offering back?
 *
 * A banner that appears because somebody clicked one service chip and left is
 * noise, and noise trains people to dismiss the banner that actually matters.
 * The bar is: a description worth having, or a service picked plus something
 * else filled in.
 */
export function draftWorthOffering(d: Record<string, unknown> | null): boolean {
  if (!d) return false;
  const desc = String(d.description ?? d.jobDescription ?? "").trim();
  if (desc.length >= 15) return true;
  const svc = Array.isArray(d.selectedServices) ? d.selectedServices.length : 0;
  if (!svc) return false;
  return keysOf(d).some(k => {
    if (k === "selectedServices" || k === "step") return false;
    const v = d[k];
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return false;
  });
}

/**
 * Debounced autosave.
 *
 * `enabled` is what stops a draft being re-written during and after submit —
 * the caller flips it false the moment the request is actually created, so the
 * clearDraft() that follows can't be raced by a pending timer and resurrect a
 * request that already exists.
 */
export function useDraftAutosave(key: string, data: Record<string, unknown>, enabled: boolean) {
  const latest = useRef(data);
  latest.current = data;
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => writeDraft(key, latest.current), 600);
    return () => clearTimeout(t);
  }, [key, enabled, JSON.stringify(data)]);
}

/**
 * Read the draft ONCE, on first render, before any effect can overwrite it.
 *
 * Reading it into state rather than calling readDraft() inline matters: the
 * autosave effect runs on mount too, so a later read would see the
 * freshly-written empty form and hand back nothing.
 *
 * The draft is RESTORED, not offered. A "we found a draft, restore it?" prompt
 * is a decision about a thing you can't see yet, asked of someone who has just
 * come back to finish a job — so the form fills itself in, says so, and gives
 * one obvious way out. That's the same shape as the contractor draft banner,
 * which is deliberate: two different recovery idioms on two signup forms is a
 * thing only the person who built them would find consistent.
 *
 * `startOver` clears BOTH the banner and the stored copy, so the wipe is real
 * and a refresh doesn't bring it back.
 */
export function useStoredDraft(key: string) {
  const [draft] = useState<Record<string, unknown> | null>(() => readDraft(key));
  const [shown, setShown] = useState(true);
  return {
    /** Restored values for the form's useState initializers. May be null. */
    draft,
    /** Show the "we saved your progress" banner. */
    restored: shown && draftWorthOffering(draft),
    startOver: () => { setShown(false); clearDraft(key); },
  };
}

/** Pull one string field out of a draft with a safe default. */
export function dStr(d: Record<string, unknown> | null, k: string, fb = ""): string {
  const v = d?.[k];
  return typeof v === "string" ? v : fb;
}

/** Pull one string-array field out of a draft with a safe default. */
export function dArr(d: Record<string, unknown> | null, k: string): string[] {
  const v = d?.[k];
  return Array.isArray(v) ? v.filter(x => typeof x === "string") as string[] : [];
}

/** Pull one number field, clamped to a range the caller still controls. */
export function dNum(d: Record<string, unknown> | null, k: string, fb: number, min: number, max: number): number {
  const v = Number(d?.[k]);
  if (!Number.isFinite(v)) return fb;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Pull one boolean field. */
export function dBool(d: Record<string, unknown> | null, k: string, fb = false): boolean {
  const v = d?.[k];
  return typeof v === "boolean" ? v : fb;
}
