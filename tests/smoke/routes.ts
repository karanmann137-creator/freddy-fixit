/**
 * The route table for the nightly smoke test -- ONE copy, read by every spec.
 *
 * WHY THESE ROUTES AND NOT ALL 64 IN THE SITEMAP. `src/App.tsx` loads 23 of its
 * pages through `React.lazy`, so each page is a separate chunk that is fetched
 * only when someone navigates to it. A chunk that built to zero bytes, or whose
 * default export went missing, is therefore invisible until a real visitor
 * arrives -- which is exactly how b1361b6 reached production and white-screened
 * every client on /client-dashboard while `vite build` reported success.
 *
 * One URL per distinct page COMPONENT is what proves every chunk resolves. The
 * other ~50 sitemap URLs are additional slugs rendered by three components that
 * are already covered here (BlogPost, ServiceLanding, AreaLanding), so loading
 * them again buys nothing about chunk integrity -- they are swept separately and
 * more cheaply by the sitemap test, which asks a different question ("does this
 * slug still exist", i.e. is the sitemap lying to Google).
 *
 * `h1: false` is for the pages that legitimately have no <h1> — Login is a form
 * and the dashboards head their panels with Bebas labels. Every content page
 * has one, and asserting its PRESENCE rather than its wording is deliberate: a
 * copy change must never turn this suite red, or it becomes a suite someone
 * learns to ignore.
 */

export type SmokeRoute = {
  path: string;
  /** What this entry exists to prove -- printed in the test name. */
  component: string;
  /** Set false only for a page that genuinely renders no <h1>. */
  h1?: boolean;
  /** Lowercase substrings that must appear in the rendered text, if any. */
  must?: string[];
};

export const PUBLIC_ROUTES: SmokeRoute[] = [
  { path: "/",                              component: "Home" },
  { path: "/login",                         component: "Login", h1: false, must: ["sign in"] },
  { path: "/get-a-quote",                   component: "GetQuote", must: ["estimate"] },
  { path: "/client-onboarding",             component: "ClientOnboarding" },
  { path: "/contractor-onboarding",         component: "ContractorOnboarding" },
  { path: "/client-success",                component: "ClientSuccess" },
  { path: "/contractor-success",            component: "ContractorSuccess" },
  { path: "/user-agreement",                component: "UserAgreement", must: ["user agreement"] },
  { path: "/privacy-policy",                component: "PrivacyPolicy", must: ["privacy policy"] },
  { path: "/homeowner-protection-promise",  component: "ProtectionPromise", must: ["protection promise"] },
  { path: "/blog",                          component: "Blog" },
  { path: "/services",                      component: "ServicesIndex", must: ["services"] },
  { path: "/for-contractors",               component: "ForContractors" },
  { path: "/about",                         component: "About" },
  { path: "/contractor-guide",              component: "ContractorGuide" },
  { path: "/areas",                         component: "AreasIndex", must: ["service areas"] },
];

// `/ui-lab` is deliberately NOT in the list. It is a dev swatch sheet, not a
// product surface — a break there costs a visitor nothing, while a false red on
// a page of colour chips would cost the suite exactly the trust it needs to be
// worth running. A gate that cries wolf is a gate someone learns to skip.

/**
 * One slug per parameterised route, to cover the three remaining lazy chunks.
 * These slugs must EXIST -- the 404 route redirects to "/", so a dead slug shows
 * up here as a bounce to the home page rather than as an error, which is the
 * same silent shape the sitemap test is built to catch.
 */
export const SLUG_ROUTES: SmokeRoute[] = [
  { path: "/blog/the-calgary-fall-checklist-six-cheap-fixes-that-prevent-expensive-winters",
    component: "BlogPost" },
  { path: "/services/plumbing",  component: "ServiceLanding" },
  { path: "/areas/calgary-nw",   component: "AreaLanding" },
];

/**
 * The auth wall, asserted from the OUTSIDE. Every one of these is a
 * `ProtectedRoute`, and an anonymous visit must land on /login.
 *
 * This is the one assertion here that can go red in BOTH directions, and both
 * matter: if it stops redirecting, the dashboards are open to the world; if it
 * starts redirecting a signed-in owner, that is the 2026-11-04 lockout shape.
 * The signed-in half lives in signed-in.spec.ts.
 *
 * Note what this does NOT prove: because the guard redirects BEFORE rendering,
 * the three dashboard chunks are never fetched by an anonymous browser, so this
 * suite cannot tell whether ClientDashboard.tsx built correctly. That gap is
 * covered two other ways -- `tools/check_mounts.py` reads the tree for the
 * mounts whose absence is invisible, and signed-in.spec.ts actually loads the
 * client dashboard when credentials are configured.
 */
export const GUARDED_ROUTES = [
  "/client-dashboard",
  "/contractor-dashboard",
  "/admin-dashboard",
];
