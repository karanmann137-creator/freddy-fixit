import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initAnalytics } from "./lib/analytics";
import { initPrefs } from "./lib/theme";

// Global CSS: theme variables (dark default), light overrides, text-size scaling, reset.
// Dark values are EXACTLY the original hard-coded colors, so dark mode is unchanged.
const style = document.createElement("style");
style.textContent = `
  :root {
    --ff-font-scale: 1.1;
    --ff-fg: 255,255,255;        /* foreground "ink" used in rgba overlays/text */
    --ff-muted: 190,205,235;     /* muted secondary text */
    --ff-text: #f0f4ff;          /* solid primary text */
    --ff-bg: #1a2236;            /* app background */
    --ff-bg-rgb: 26,34,54;
    --ff-surface: #151d2e;       /* section / card */
    --ff-surface-141: #141d2e;
    --ff-surface-2: #111827;     /* footer / deep */
    --ff-surface-0e: #0e1422;
    --ff-surface-1f: #1f2937;
    --ff-success: #86efac;
    --ff-warn: #fbbf24;
    --ff-danger: #f87171;
    --ff-info: #93c5fd;

    /* ── 60 / 30 / 10 ──────────────────────────────────────────────
       The palette is unchanged; what's new is the RATIO discipline and
       the names to enforce it with. The failure mode this fixes is not
       the colours themselves, it's that orange was doing everything —
       headings, dividers, icons, links, stat numbers, background
       glows — so nothing read as important because everything did.

       60%  --ff-c60  page and section ground. Navy, near-monochrome.
       30%  --ff-c30  raised surfaces, cards, hairlines, secondary text.
       10%  --ff-c10  accent. Reserved for ONE action per view plus the
                      few marks that certify trust. If you are reaching
                      for orange a third time in a section, the answer
                      is --ff-c30.

       Use the ramp rather than a raw hex: 600 is the pressed state, 500
       the brand orange, 400 the hover, and -soft/-line are the tinted
       fill and border that used to be written out as rgba literals in
       twenty places. */
    --ff-c60: var(--ff-bg);
    --ff-c30: var(--ff-surface);
    --ff-c10: #ea6b14;
    --ff-accent-600: #c9560c;
    --ff-accent-500: #ea6b14;
    --ff-accent-400: #f78b3d;
    --ff-accent-soft: rgba(234,107,20,0.12);
    --ff-accent-line: rgba(234,107,20,0.32);
    /* Ink ramp — four steps instead of ad-hoc rgba(var(--ff-muted), .N).
       Hierarchy is the point: a page should use at most three of these. */
    --ff-ink-1: var(--ff-text);
    --ff-ink-2: rgba(var(--ff-fg), 0.82);
    --ff-ink-3: rgba(var(--ff-muted), 0.68);
    --ff-ink-4: rgba(var(--ff-muted), 0.45);
    --ff-hair: rgba(var(--ff-fg), 0.09);
    /* One shadow scale, so "raised" means the same thing everywhere. */
    --ff-lift-1: 0 1px 2px rgba(0,0,0,0.18);
    --ff-lift-2: 0 8px 28px rgba(0,0,0,0.28);
    --ff-lift-3: 0 22px 60px rgba(0,0,0,0.42);
  }
  :root[data-theme="light"] {
    --ff-fg: 30,41,59;           /* slate ink replaces white */
    --ff-muted: 71,85,105;
    --ff-text: #0f172a;
    --ff-bg: #eef1f8;
    --ff-bg-rgb: 238,241,248;
    --ff-surface: #ffffff;
    --ff-surface-141: #ffffff;
    --ff-surface-2: #e4e9f2;
    --ff-surface-0e: #dfe5f0;
    --ff-surface-1f: #ffffff;
    --ff-success: #15803d;
    --ff-warn: #b45309;
    --ff-danger: #dc2626;
    --ff-info: #2563eb;
    --ff-accent-600: #b8500b;
    --ff-accent-500: #d65f10;
    --ff-accent-400: #ea6b14;
    --ff-accent-soft: rgba(214,95,16,0.10);
    --ff-accent-line: rgba(214,95,16,0.28);
    --ff-c10: #d65f10;
    --ff-ink-2: rgba(var(--ff-fg), 0.86);
    --ff-ink-3: rgba(var(--ff-muted), 0.78);
    --ff-ink-4: rgba(var(--ff-muted), 0.58);
    --ff-hair: rgba(var(--ff-fg), 0.12);
    --ff-lift-1: 0 1px 2px rgba(15,23,42,0.06);
    --ff-lift-2: 0 8px 28px rgba(15,23,42,0.10);
    --ff-lift-3: 0 22px 60px rgba(15,23,42,0.16);
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: calc(100% * var(--ff-font-scale, 1)); }
  html, body { margin: 0; padding: 0; background: var(--ff-bg); }
  /* Responsive safety net. Inline styles beat this stylesheet, so a fixed inline
     width still applies — these only bite when the container is genuinely
     narrower than the element, i.e. the phone case. svg is left out on purpose —
     Ic renders sized icons that must not shrink in flex rows. */
  img, video, canvas { max-width: 100%; }
  input, select, textarea { max-width: 100%; }

  /* Horizontal scroll, killed at the root.
     This is overflow-x: CLIP, not hidden, and the difference is the whole
     reason it is safe to put here. 'hidden' makes the element a scroll
     container, which silently kills every position:sticky inside it — the
     dashboard sidebar depends on sticky, so 'hidden' here would break it.
     'clip' does not create a scroll container: sticky keeps working and the
     overflow simply cannot be scrolled to. Applied to both html and body
     because a stray wide child can escape either one. */
  html, body { overflow-x: clip; max-width: 100%; }
  /* The other half of the problem is content that cannot wrap: a pasted URL,
     a long email address, a job code. break-word only breaks when a word
     genuinely cannot fit, so ordinary prose is untouched. */
  body { overflow-wrap: break-word; }
  /* Tables and preformatted text are the two elements that will happily push
     a page wider than the phone rather than wrap. */
  table, pre { max-width: 100%; }
  pre { overflow-x: auto; }

  /* Thumb targets. Apple and Google both land on ~44px as the smallest
     control a thumb hits reliably; a lot of our chips and icon buttons sit
     nearer 30. Scoped to coarse pointers so a mouse-driven desktop layout
     is untouched, and it's min-height only — forcing min-width too would
     blow tight button rows off the side of the screen, which is the exact
     bug the block above exists to prevent. */
  @media (pointer: coarse) {
    button, [role="button"], a.ff-tap, label.ff-tap, select { min-height: 44px; }
    /* Opt-out for anything genuinely inline, e.g. a link styled as a word
       inside a sentence that must not become a 44px-tall gap. */
    button.ff-tap-auto, [role="button"].ff-tap-auto { min-height: 0; }
  }

  /* One honest global respect for reduced motion. Individual components still
     opt out where they need to; this catches everything that forgot. */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
`;
document.head.appendChild(style);

// Apply saved theme + text size before first paint to avoid a flash.
initPrefs();

// Initialize analytics (no-op until a real GA4 ID is set in src/lib/analytics.ts).
initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
