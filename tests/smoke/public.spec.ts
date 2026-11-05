/**
 * Nightly smoke test, anonymous half -- runs with no credentials and no secrets.
 *
 * WHY THIS EXISTS (2026-11-04). Every fault this platform has actually suffered
 * was discovered by the owner personally, in the course of using the product,
 * because he is also effectively all of its traffic. The database health check
 * cannot help with that class: it reads values that EXIST, and these faults are
 * all ABSENCES -- a chunk that built to nothing, a mount that got dropped, a
 * button that was reachable from nowhere. You cannot SQL-query a missing button,
 * but you can open a browser and look for it.
 *
 * THIS SUITE MUST NEVER WRITE. It signs nothing up, posts no request, sends no
 * email and leaves no row behind. Every test below is a read of a public page.
 * (The one test that signs in lives in signed-in.spec.ts and uses a pre-existing
 * account.) A smoke suite that litters the owner's own dashboard with test rows
 * is a suite he will switch off, and then the monitoring is gone again.
 */

import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES, SLUG_ROUTES, GUARDED_ROUTES } from "./routes";
import { watch, expectHealthy } from "./pagehealth";

/**
 * One test per distinct lazy chunk. Parallel is safe -- these are pure reads.
 */
for (const r of [...PUBLIC_ROUTES, ...SLUG_ROUTES]) {
  test("renders " + r.component + " (" + r.path + ")", async ({ page }) => {
    const w = watch(page);
    const res = await page.goto(r.path, { waitUntil: "domcontentloaded" });
    expect(res, r.path + " returned no response").not.toBeNull();
    expect(res!.status(), r.path + " returned HTTP " + res!.status()).toBeLessThan(400);

    await expectHealthy(page, w, r.component + " (" + r.path + ")", {
      h1: r.h1,
      must: r.must,
    });

    // A parameterised route whose slug has been removed does not 404 -- App.tsx's
    // last <Route> redirects to "/". Landing on the home page is therefore the
    // failure signature for a dead slug, and it is silent by construction.
    if (r.path !== "/") {
      expect(new URL(page.url()).pathname, r.path + " bounced to the home page")
        .not.toBe("/");
    }
  });
}

/**
 * The auth wall, from the outside. Red in either direction is a real finding:
 * stops redirecting and the dashboards are world-readable; starts redirecting a
 * signed-in owner and that is the 2026-11-04 lockout again.
 */
for (const path of GUARDED_ROUTES) {
  test("anonymous visit to " + path + " lands on /login", async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    // And the login form itself has to be usable, or the redirect is a dead end.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
}

/**
 * Sweep every URL in the sitemap and assert the app still routes it.
 *
 * This asks a DIFFERENT question from the per-chunk tests above: not "does the
 * component load" but "is the sitemap still telling Google the truth". A blog
 * post or service slug that is retired from the data table does not 404 and
 * throws nothing -- the 404 route redirects to "/" -- so the page quietly
 * becomes a soft-404 and the only symptom is a ranking drop weeks later, which
 * is the same way a wrong canonical hurts (`upsertMeta`, src/lib/seo.ts).
 *
 * Read from the LIVE sitemap, not the repo copy, because the live one is what
 * Google fetches. Runs as one test in one browser context, sequentially, so 60+
 * navigations cost one context instead of sixty.
 */
test("every sitemap URL still routes", async ({ page, request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status(), "sitemap.xml returned HTTP " + res.status()).toBe(200);
  const xml = await res.text();

  const paths = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g))
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => p !== "/");

  // A sitemap that suddenly lists almost nothing is itself the fault -- and an
  // empty list would otherwise pass this test, because [].every() is true.
  expect(paths.length, "sitemap listed only " + paths.length + " URLs").toBeGreaterThan(40);

  const soft404: string[] = [];
  const empty: string[] = [];

  for (const p of paths) {
    await page.goto(p, { waitUntil: "domcontentloaded" });
    // The redirect is client-side, so give wouter a moment to settle before
    // reading the path back.
    await page.waitForTimeout(400);
    if (new URL(page.url()).pathname === "/") { soft404.push(p); continue; }
    const text = await page.locator("#root").innerText().catch(() => "");
    if ((text || "").length < 300) empty.push(p);
  }

  expect(soft404, "sitemap URL(s) redirected to the home page -- dead slug, soft 404")
    .toEqual([]);
  expect(empty, "sitemap URL(s) rendered almost no content").toEqual([]);
});

/**
 * robots.txt and the sitemap reference each other. Cheap, and a broken pair is
 * another fault with no symptom until traffic moves.
 */
test("robots.txt points at the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect((await res.text()).toLowerCase()).toContain("sitemap");
});
