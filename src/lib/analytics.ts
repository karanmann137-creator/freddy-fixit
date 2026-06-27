// ── Google Analytics 4 (privacy-conscious, opt-in by ID) ─────────────────────
//
// Analytics only runs once you paste a real GA4 Measurement ID below. Until
// then every function here is a safe no-op, so the site ships clean with no
// tracking and no cookies.
//
// HOW TO TURN IT ON (non-technical, ~5 min):
//   1. Create a free GA4 property at https://analytics.google.com
//      → Admin → Data Streams → Web → add https://freddyfixit.ca
//   2. Copy the "Measurement ID" — it looks like  G-XXXXXXXXXX
//   3. Replace the placeholder on the next line with your real ID.
//   4. Re-run the latest apply-*.sh installer and hard-refresh.
// (Full walkthrough: Analytics-Setup-Guide.docx on your Desktop.)

export const GA_MEASUREMENT_ID = "G-XXXXXXXXXX"; // ← paste your real GA4 ID here

// True only when a real ID has been set (placeholder = disabled).
export const analyticsEnabled = (): boolean =>
  /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID) && GA_MEASUREMENT_ID !== "G-XXXXXXXXXX";

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

let started = false;

// Injects the gtag.js script and configures the property. Safe to call multiple
// times; only the first call does anything. No-op when analytics is disabled.
export function initAnalytics(): void {
  if (started || !analyticsEnabled() || typeof window === "undefined") return;
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
}

// Fire a virtual page_view on client-side route changes (SPA navigation).
export function trackPageView(path: string): void {
  if (!analyticsEnabled() || !window.gtag) return;
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
  if (!analyticsEnabled() || !window.gtag) return;
  window.gtag("event", name, params);
}
