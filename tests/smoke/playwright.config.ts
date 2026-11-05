/**
 * Playwright config for the nightly production smoke test.
 *
 * Deliberately points at the LIVE site and starts no local server. The whole
 * point is to test what visitors actually get -- a local dev server would
 * happily pass while a bad deploy sat on Vercel, which is the exact gap this
 * suite exists to close.
 *
 * Override the target with FF_SMOKE_BASE_URL to test a Vercel preview URL
 * before promoting it.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // 60s per test: the sitemap sweep walks 60+ URLs in one test and the
  // dashboard waits out its own fetches.
  timeout: 3 * 60 * 1000,
  expect: { timeout: 15_000 },

  // One retry, because this suite crosses the real internet. A fault that
  // reproduces twice is a fault; a fault that clears on retry was the network,
  // and reporting that as a site outage is how an alert loses its meaning.
  retries: 1,

  // Modest parallelism -- this is the owner's production site, not a load test.
  workers: 3,
  fullyParallel: true,

  // Never allow a committed `test.only` to silently shrink the suite.
  forbidOnly: true,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "smoke-results.json" }],
  ],

  use: {
    baseURL: process.env.FF_SMOKE_BASE_URL || "https://freddyfixit.ca",
    // Named so the owner can recognise it in Vercel analytics and allowlist it
    // if the firewall ever starts challenging automated traffic.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FreddyFixItSmoke/1.0",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // Desktop first. A mobile pass is a separate concern and would double the
    // run for a class of fault (layout) that this suite does not check.
    ...devices["Desktop Chrome"],
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
