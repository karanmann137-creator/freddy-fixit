/**
 * Nightly smoke test, signed-in half -- SKIPS ITSELF unless credentials are set.
 *
 * WHY A SECOND SPEC. The anonymous suite cannot see the three biggest files in
 * the repo. `ProtectedRoute` in src/App.tsx redirects BEFORE rendering, so an
 * anonymous browser never fetches the ClientDashboard / ContractorDashboard /
 * AdminDashboard chunks at all -- which means the one page that white-screened
 * every client in b1361b6 is the one page the anonymous suite proves nothing
 * about. Signing in is the only way to load that chunk in a real browser.
 *
 * SKIPS RATHER THAN FAILS when FF_SMOKE_EMAIL / FF_SMOKE_PASSWORD are absent.
 * The repo is PUBLIC, so the credentials can only live in GitHub Secrets and
 * cannot be committed; a hard failure here would paint the nightly run red for
 * a reason that is not a fault, and a suite that is always red is a suite that
 * gets muted. The run summary says plainly when this half was skipped.
 *
 * WHAT THE TEST ACCOUNT MUST BE:
 *   - role = client. The admin account is MFA-enrolled and its password does
 *     not belong in CI on a public repo; a contractor account would need an
 *     approved profile to render anything.
 *   - NOT enrolled in two-step. src/pages/Login.tsx only calls
 *     `mfa_request_code` when `mfa_status()` reports enabled, so a non-enrolled
 *     account sends NO email on sign-in. If the account ever gets enrolled this
 *     test fails fast with that exact message instead of timing out on a code
 *     it can never read.
 *
 * THIS TEST STILL WRITES NOTHING OF ITS OWN -- it posts no request, starts no
 * job and sends no mail. It does sign in, so it moves `auth.users.last_sign_in_at`
 * on that one account, which is the point: health check 7 `no_stuck_signups`
 * keys on exactly that column, so a test account that signs in nightly can
 * never masquerade as a stranded signup.
 */

import { test, expect } from "@playwright/test";
import { watch, expectHealthy } from "./pagehealth";

const EMAIL = process.env.FF_SMOKE_EMAIL || "";
const PASSWORD = process.env.FF_SMOKE_PASSWORD || "";
const CONFIGURED = Boolean(EMAIL && PASSWORD);

test.describe("signed in as a test client", () => {
  test.skip(
    !CONFIGURED,
    "FF_SMOKE_EMAIL / FF_SMOKE_PASSWORD are not set -- see .github/workflows/smoke.yml",
  );

  // One sign-in, serially, so a retry cannot stack concurrent logins against
  // the account's rate limiter.
  test.describe.configure({ mode: "serial" });

  test("client dashboard loads and renders", async ({ page }) => {
    const w = watch(page);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[autocomplete="current-password"]').first().fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Two-step would park us on a code we cannot read. Say so in one line
    // rather than burning a 30s timeout on an unexplained hang.
    const otp = page.getByText(/emailed a 6-digit code/i);
    await Promise.race([
      page.waitForURL(/\/client-dashboard/, { timeout: 45_000 }).catch(() => {}),
      otp.waitFor({ timeout: 45_000 }).catch(() => {}),
    ]);
    if (await otp.isVisible().catch(() => false)) {
      throw new Error(
        "The smoke test account is enrolled in two-step sign-in, so CI cannot " +
        "complete the login. Use a client account that is NOT enrolled, or " +
        "clear its user_mfa row.",
      );
    }

    await expect(page, "sign-in did not reach /client-dashboard")
      .toHaveURL(/\/client-dashboard/, { timeout: 20_000 });

    // The dashboard fetches before it paints, so wait for its own content
    // rather than for a network idle that a polling dashboard never reaches.
    await page.waitForTimeout(3_000);

    await expectHealthy(page, w, "ClientDashboard (/client-dashboard)", {
      // The dashboard's headings are Bebas panel labels, not an <h1>.
      h1: false,
    });

    // KNOWN GAP, stated here so nobody mistakes a green run for more than it is:
    // <ContractPanel/> only mounts for a job at the agreement stage, and this
    // account deliberately has no jobs, so this test does NOT prove the pay
    // surface exists. That is what `tools/check_mounts.py` is for -- it reads
    // the tree and refuses a push where the mount has been dropped, which is
    // the fa5e2b5 fault that made every job on the platform unpayable.
  });

  test("the dashboard is not stuck on its skeleton", async ({ page }) => {
    // ProtectedRoute shows DashboardSkeleton while it resolves the role, and
    // `getMyProfile` returning ok:false is a failed read, not an empty one --
    // so a dashboard that never leaves the skeleton means the role lookup is
    // broken, which is invisible as an error anywhere.
    const w = watch(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[autocomplete="current-password"]').first().fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/client-dashboard/, { timeout: 45_000 });
    await page.waitForTimeout(5_000);

    const text = (await page.locator("#root").innerText().catch(() => "")) || "";
    expect(w.pageErrors, "client dashboard threw during render").toEqual([]);
    expect(w.chunkErrors, "client dashboard failed to load a chunk").toEqual([]);
    expect(text.length, "client dashboard still looks like a skeleton after 5s")
      .toBeGreaterThan(600);
  });
});
