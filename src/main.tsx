import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initAnalytics } from "./lib/analytics";

// Global CSS reset — removes browser default margin/padding that causes white borders
const style = document.createElement("style");
style.textContent = `*, *::before, *::after { box-sizing: border-box; } html, body { margin: 0; padding: 0; background: #1a2236; }`;
document.head.appendChild(style);

// Initialize analytics (no-op until a real GA4 ID is set in src/lib/analytics.ts).
initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
