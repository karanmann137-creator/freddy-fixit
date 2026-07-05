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
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: calc(100% * var(--ff-font-scale, 1)); }
  html, body { margin: 0; padding: 0; background: var(--ff-bg); }
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
