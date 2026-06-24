// loadtest-freddyfixit.js — gentle reliability/load test for freddyfixit.ca
// Run from your Mac (the test cannot run from Claude's sandbox — it can't reach your site).
//
// One-time install (Terminal):   brew install k6
// Run the test:                  k6 run ~/Desktop/freddy-fixit/loadtest-freddyfixit.js
//
// This is a GENTLE test: it ramps up to 10 simulated visitors, holds, then ramps down.
// It only hits PUBLIC pages (no login, no payments) so it won't touch real user data.
// To push harder later, raise the `target` numbers in `stages` below.

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const errors = new Rate("page_errors");
const ttfb = new Trend("time_to_first_byte", true);

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // ramp up to 10 virtual users
    { duration: "1m",  target: 10 }, // hold steady at 10
    { duration: "20s", target: 0 },  // ramp back down
  ],
  thresholds: {
    http_req_failed:   ["rate<0.01"],   // < 1% of requests may fail
    http_req_duration: ["p(95)<1500"],  // 95% of requests under 1.5s
    page_errors:       ["rate<0.01"],
  },
};

const BASE = "https://freddyfixit.ca";

// Public pages a real visitor lands on before logging in.
const PAGES = [
  "/",
  "/blog",
  "/login",
  "/protection-promise",
];

export default function () {
  group("public pages", function () {
    for (const path of PAGES) {
      const res = http.get(BASE + path, { tags: { name: path } });
      ttfb.add(res.timings.waiting);
      const ok = check(res, {
        "status is 200": (r) => r.status === 200,
        "body not empty": (r) => r.body && r.body.length > 0,
        "served fast (<2s)": (r) => r.timings.duration < 2000,
      });
      errors.add(!ok);
      sleep(1); // pace requests like a real user, ~1s between page views
    }
  });
}

export function handleSummary(data) {
  const m = data.metrics;
  const line = (k) => (m[k] ? m[k].values : {});
  const dur = line("http_req_duration");
  const failed = line("http_req_failed");
  const reqs = line("http_reqs");
  const summary =
`
================ Freddy Fix It — k6 reliability summary ================
Total requests:      ${reqs.count ?? "?"}
Requests/sec:        ${(reqs.rate ?? 0).toFixed(2)}
Failed request rate: ${(((failed.rate ?? 0) * 100)).toFixed(2)}%   (target < 1%)
Latency  avg:        ${(dur.avg ?? 0).toFixed(0)} ms
Latency  p95:        ${(dur["p(95)"] ?? 0).toFixed(0)} ms   (target < 1500 ms)
Latency  max:        ${(dur.max ?? 0).toFixed(0)} ms
=======================================================================
PASS = both targets met. If failed-rate or p95 are over target, the site
struggled under load — tell Claude the numbers and we'll dig in.
`;
  return {
    stdout: summary,
    "loadtest-summary.json": JSON.stringify(data, null, 2),
  };
}
