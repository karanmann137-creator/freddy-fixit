// ── Analytics (consent-gated: NOTHING runs until the visitor says yes) ───────
//
// Freddy Fix It uses two analytics tools — Google Analytics 4 (traffic) and
// PostHog (product analytics + session replay). Both set cookies, so both are
// OPT-IN: no script is downloaded, no cookie is written and no event is
// recorded until the visitor clicks "Accept" on the cookie banner.
//
// This is deliberately stricter than the legal floor. Under PIPEDA and
// Alberta's PIPA, the consent you need scales with how sensitive the data is,
// and session replay — which records what someone does on the page — sits at
// the invasive end. Opt-in is the defensible posture. It costs us analytics
// volume; that trade was made on purpose.
//
// HOW TO CHANGE THE GA4 PROPERTY (non-technical):
//   1. Create a free GA4 property at https://analytics.google.com
//      → Admin → Data Streams → Web → add https://freddyfixit.ca
//   2. Copy the "Measurement ID" — it looks like  G-XXXXXXXXXX
//   3. Replace the value on the GA_MEASUREMENT_ID line below.
//   4. Re-run the latest apply-*.sh installer and hard-refresh.
// (Full walkthrough: Analytics-Setup-Guide.docx on your Desktop.)

export const GA_MEASUREMENT_ID: string = "G-WFMM73FJVL"; // real GA4 ID — analytics ON (set 2026-07-11)

// ── PostHog (product analytics + session replay) ─────────────────────────────
// Project API key (public by design — it can only ingest events, not read data).
export const POSTHOG_KEY: string = "phc_xwvezYRnqsiHBtnLKgTjktxYsQqrdsKhEG6wy4kzixW2";

// True only when a real ID has been set (placeholder = disabled).
export const analyticsEnabled = (): boolean =>
  /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID) && GA_MEASUREMENT_ID !== "G-XXXXXXXXXX";

// ── Consent ──────────────────────────────────────────────────────────────────
// Stored in localStorage so the choice survives a refresh. Three states:
//   "granted" — analytics may run
//   "denied"  — analytics must not run
//   null      — not asked yet (banner shows, nothing runs)

export type ConsentChoice = "granted" | "denied";

export const CONSENT_KEY = "ff_cookie_consent";
/** Fired on the window whenever the choice changes, so mounted UI can react. */
export const CONSENT_EVENT = "ff:cookie-consent";

export function getConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    // Private browsing with storage blocked reads as "not asked", which means
    // nothing tracks. Failing closed is the safe direction here.
    return null;
  }
}

/** True only when the visitor has explicitly accepted. */
export const consentGranted = (): boolean => getConsent() === "granted";

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

let started = false;

// Best-effort removal of the cookies GA4 and PostHog set, used when someone
// declines or withdraws. We can only clear cookies on our own domain, and a
// script already in memory keeps running until the page reloads — which is why
// withdrawing consent in Settings triggers a reload.
function clearAnalyticsCookies(): void {
  if (typeof document === "undefined") return;
  try {
    const host = window.location.hostname;
    // freddyfixit.ca and .freddyfixit.ca are distinct cookie scopes.
    const domains = ["", host, "." + host, "." + host.split(".").slice(-2).join(".")];
    for (const raw of document.cookie.split(";")) {
      const name = raw.split("=")[0].trim();
      if (!name) continue;
      const isAnalytics =
        name === "_ga" || name.startsWith("_ga_") || name === "_gid" || name === "_gat" ||
        name.startsWith("_gac_") || name.indexOf("posthog") !== -1 || name.startsWith("ph_");
      if (!isAnalytics) continue;
      for (const d of domains) {
        document.cookie =
          name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + (d ? "; domain=" + d : "");
      }
    }
  } catch { /* nothing more we can do; the reload is the real cleanup */ }
}

/**
 * Record the visitor's choice. Accepting starts analytics immediately (no
 * reload needed); declining clears whatever cookies exist. Callers that need
 * to react should listen for CONSENT_EVENT.
 */
export function setConsent(choice: ConsentChoice): void {
  try { localStorage.setItem(CONSENT_KEY, choice); } catch { /* storage blocked */ }
  if (choice === "granted") {
    initAnalytics();
    // They've already landed on a page by the time they accept, so record it —
    // otherwise the first page of every accepted session is lost.
    try { trackPageView(window.location.pathname + window.location.search); } catch {}
  } else {
    clearAnalyticsCookies();
  }
  try { window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice })); } catch {}
}

/** Wipe the stored choice so the banner asks again (used by Settings). */
export function resetConsent(): void {
  try { localStorage.removeItem(CONSENT_KEY); } catch {}
  clearAnalyticsCookies();
  try { window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null })); } catch {}
}

// Injects the gtag.js + PostHog scripts and configures them. Safe to call
// multiple times; only the first call does anything. No-op when analytics is
// disabled OR the visitor hasn't accepted cookies.
export function initAnalytics(): void {
  if (started || !analyticsEnabled() || typeof window === "undefined") return;
  if (!consentGranted()) return; // ← the gate: no consent, no scripts, no cookies
  started = true;

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  // IP anonymization on; we send page_view manually on route change (SPA).
  window.gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: false,
  });

  // PostHog: load the client, then init. "defaults: 2025-05-24" auto-captures
  // SPA route changes as pageviews, so we don't fire those manually here.
  const ph = document.createElement("script");
  ph.async = true;
  ph.src = "https://us-assets.i.posthog.com/static/array.js";
  ph.onload = () => {
    (window as any).posthog?.init(POSTHOG_KEY, {
      api_host: "https://us.i.posthog.com",
      defaults: "2025-05-24",
      person_profiles: "identified_only",
      session_recording: { maskAllInputs: true },
    });
  };
  document.head.appendChild(ph);
}

// Fire a virtual page_view on client-side route changes (SPA navigation).
export function trackPageView(path: string): void {
  if (!consentGranted() || !analyticsEnabled() || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}

// Fire a named conversion / interaction event. Examples:
//   trackEvent("generate_lead")           — quote request submitted
//   trackEvent("post_job_start")          — client started posting a job
//   trackEvent("sign_up", { method: "contractor" })
export function trackEvent(name: string, params: Record<string, any> = {}): void {
  if (!consentGranted() || !analyticsEnabled()) return;
  if (window.gtag) window.gtag("event", name, params);
  (window as any).posthog?.capture?.(name, params); // mirror to PostHog
}
