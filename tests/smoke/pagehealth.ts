/**
 * ONE definition of "did this page actually come up" -- shared by every spec.
 *
 * WHY A SHARED PREDICATE. The house rule is one predicate per question, mounted
 * everywhere, so a gate and a hint can never disagree. The same applies here for
 * a duller reason: a page-health check that is pasted per spec drifts, and a
 * smoke suite that is green because its weakest copy of the check is green is
 * worse than no suite at all.
 *
 * WHAT IT WATCHES FOR, and why each one is on the list rather than being the
 * obvious `expect(response.ok())`:
 *
 *   - `pageerror`     an uncaught exception during render. This is the b1361b6
 *                     signature: a chunk that built to 0 bytes throws inside
 *                     React.lazy, the HTTP response was a perfectly fine 200,
 *                     and the visitor sees white.
 *   - chunk failures  "Failed to fetch dynamically imported module" is the other
 *                     half of the same fault, reported as a console error rather
 *                     than a throw depending on where Suspense catches it.
 *   - asset 404s      a stale index.html pointing at a hashed chunk that no
 *                     longer exists -- the classic mid-deploy fault, invisible
 *                     to anything that only reads the HTML.
 *   - error boundary  `src/components/ErrorBoundary.tsx` renders "Something went
 *                     wrong" and then returns HTTP 200 for the rest of time. The
 *                     boundary is correct behaviour; silently shipping it is not.
 *   - real content    #root with under ~300 characters of text is a shell, not a
 *                     page. This is the assertion that catches a white screen
 *                     that throws nothing at all.
 *
 * DELIBERATELY NOT WATCHED: console warnings, and console errors in general.
 * Third-party scripts (analytics, Stripe, the consent layer) log errors on a
 * perfectly healthy page, and a suite that goes red on someone else's warning
 * is a suite that gets muted. Only the two chunk-failure wordings are matched.
 */

import { expect, type Page } from "@playwright/test";

/** Console/page-error text that always means OUR bundle is broken. */
const FATAL_CONSOLE = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
];

export type Watcher = {
  /** Uncaught exceptions thrown during render. */
  pageErrors: string[];
  /** Console errors matching FATAL_CONSOLE only. */
  chunkErrors: string[];
  /** Same-origin .js/.css requests that did not return 2xx/3xx. */
  deadAssets: string[];
};

/**
 * Attach before the first navigation. Listeners must be wired BEFORE goto or the
 * very errors we care about -- the ones thrown during initial render -- land
 * before anything is listening and the test passes on an empty list.
 */
export function watch(page: Page): Watcher {
  const w: Watcher = { pageErrors: [], chunkErrors: [], deadAssets: [] };

  page.on("pageerror", (err) => {
    w.pageErrors.push(String(err && err.message ? err.message : err));
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text().toLowerCase();
    if (FATAL_CONSOLE.some((f) => t.includes(f))) w.chunkErrors.push(msg.text());
  });

  page.on("response", (res) => {
    const url = res.url();
    if (!/\.(js|mjs|css)(\?|$)/i.test(url)) return;
    // Only our own assets. A third party's dead script is their problem and
    // must not be able to fail this suite.
    if (!url.includes("freddyfixit.ca") && !url.includes("vercel.app")) return;
    if (res.status() >= 400) w.deadAssets.push(res.status() + " " + url);
  });

  return w;
}

/** The text the ErrorBoundary renders. Keep in step with ErrorBoundary.tsx. */
export const BOUNDARY_TEXT = "something went wrong";

/** Minimum #root text length for a page to count as rendered, not shelled. */
export const MIN_TEXT = 300;

/**
 * Assert the page is healthy. `where` is only used to make the failure message
 * say which route broke -- a smoke failure the owner cannot act on is a smoke
 * failure that gets ignored.
 */
export async function expectHealthy(
  page: Page,
  w: Watcher,
  where: string,
  opts: { h1?: boolean; must?: string[] } = {},
) {
  const rootText = (await page.locator("#root").innerText().catch(() => "")) || "";
  const lower = rootText.toLowerCase();

  expect(w.pageErrors, where + " threw during render").toEqual([]);
  expect(w.chunkErrors, where + " failed to load a lazy chunk").toEqual([]);
  expect(w.deadAssets, where + " requested an asset that 404d").toEqual([]);

  expect(lower, where + " rendered the error boundary").not.toContain(BOUNDARY_TEXT);
  expect(
    rootText.length,
    where + " rendered only " + rootText.length + " chars -- shell, not a page",
  ).toBeGreaterThan(MIN_TEXT);

  // A blank <title> is how a wrong canonical starts. seo.ts sets one per route.
  const title = await page.title();
  expect(title.trim().length, where + " has an empty <title>").toBeGreaterThan(0);

  if (opts.h1 !== false) {
    const h1 = page.locator("#root h1").first();
    await expect(h1, where + " has no <h1>").toBeVisible({ timeout: 10_000 });
    expect((await h1.innerText()).trim().length, where + " has an empty <h1>")
      .toBeGreaterThan(0);
  }

  for (const needle of opts.must || []) {
    expect(lower, where + ' is missing the text "' + needle + '"').toContain(needle);
  }
}
