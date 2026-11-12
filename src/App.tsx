import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { getMyProfile, clearMyProfile, dashboardFor } from "@/lib/myProfile";
import { readAuthUser } from "@/lib/authRead";
import type { UserRole } from "@/lib/supabase";
import { trackPageView } from "@/lib/analytics";
import { REF_CODE_KEY } from "@/lib/referralCode";

// Eager: tiny, always-needed shell + the landing/login pages.
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import UpdatePassword from "@/pages/UpdatePassword";
import AuthCallback from "@/pages/AuthCallback";
import TopNav from "@/components/TopNav";
// Eager on purpose: it wraps <Suspense>, so it must exist before any lazy
// chunk resolves — and a boundary that arrives late is no boundary at all.
import ErrorBoundary from "@/components/ErrorBoundary";
import { DashboardSkeleton, PageSkeleton } from "@/components/Skeleton";
import ChatWidget from "@/components/ChatWidget";
import GoogleReviewModal from "@/components/GoogleReviewModal";
import ReferralShareModal from "@/components/ReferralShareModal";
import CompletionThanksModal from "@/components/CompletionThanksModal";
import FinishSignupBanner from "@/components/FinishSignupBanner";
import CookieConsent from "@/components/CookieConsent";
import OverhaulNotice from "@/components/OverhaulNotice";
import Footer from "@/components/Footer";

// Lazy: heavy pages are split into their own chunks and fetched on demand,
// so the initial bundle (what every first-time visitor downloads) stays small.
const ClientOnboarding     = lazy(() => import("@/pages/ClientOnboarding"));
const ContractorOnboarding = lazy(() => import("@/pages/ContractorOnboarding"));
const ClientSuccess        = lazy(() => import("@/pages/ClientSuccess"));
const ContractorSuccess    = lazy(() => import("@/pages/ContractorSuccess"));
const ClientDashboard      = lazy(() => import("@/pages/ClientDashboard"));
const ContractorDashboard  = lazy(() => import("@/pages/ContractorDashboard"));
const AdminDashboard       = lazy(() => import("@/pages/AdminDashboard"));
const ContractorProfile    = lazy(() => import("@/pages/ContractorProfile"));
const UserAgreement        = lazy(() => import("@/pages/UserAgreement"));
const PrivacyPolicy        = lazy(() => import("@/pages/PrivacyPolicy"));
const ProtectionPromise    = lazy(() => import("@/pages/ProtectionPromise"));
const Blog                 = lazy(() => import("@/pages/Blog"));
const BlogPost             = lazy(() => import("@/pages/BlogPost"));
const GetQuote             = lazy(() => import("@/pages/GetQuote"));
const PickPro              = lazy(() => import("@/pages/PickPro"));
const ServicesIndex        = lazy(() => import("@/pages/ServicesIndex"));
const ServiceLanding       = lazy(() => import("@/pages/ServiceLanding"));
const ForContractors       = lazy(() => import("@/pages/ForContractors"));
const About                = lazy(() => import("@/pages/About"));
const ContractorGuide      = lazy(() => import("@/pages/ContractorGuide"));
const AreasIndex           = lazy(() => import("@/pages/AreaLanding").then(m => ({ default: m.AreasIndex })));
const AreaLanding          = lazy(() => import("@/pages/AreaLanding"));
// Internal design review surface for src/components/ui. Unlinked and noindexed
// (see the page's own header), lazy so it is never in the main bundle. Delete
// the page and this line together once the three dashboards are ported.
const UiLab                = import.meta.env.DEV ? lazy(() => import("@/pages/UiLab")) : null;

// Shown briefly while a lazily-loaded page chunk downloads. PageSkeleton paints
// nothing for its first 120ms, so a cached chunk -- which is most of them after
// the first visit -- still resolves with no interstitial at all.
function PageLoader() {
  return <PageSkeleton />;
}

// When Supabase detects a password-recovery session (fired as the
// PASSWORD_RECOVERY auth event, or visible as a recovery token in the URL
// hash), always send the user to the password-reset form — even if the email
// link dropped them on the home page or anywhere else.
function RecoveryRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (
      window.location.hash.includes("type=recovery") &&
      window.location.pathname !== "/update-password"
    ) {
      setLocation("/update-password");
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setLocation("/update-password");
    });
    return () => subscription.unsubscribe();
  }, [setLocation]);
  return null;
}

// Reset scroll to the top whenever the route changes. Single-page apps keep the
// previous scroll position on navigation, which makes clicking the logo/home
// from far down another page land you mid-page instead of at the top. We skip
// this when the URL has a hash so in-page anchor links still work.
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
    trackPageView(location);
    // Capture a referral code from any inbound link (?ref=CODE) and stash it
    // until the visitor signs up. Persist so it survives the email-confirm hop.
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && !localStorage.getItem(REF_CODE_KEY)) localStorage.setItem(REF_CODE_KEY, ref.trim().toUpperCase());
    } catch {}
  }, [location]);
  return null;
}

/**
 * A 220ms cross-page fade.
 *
 * Keyed on the PATH ONLY, deliberately. The dashboards drive their tabs off
 * `?tab=`, so keying on the full URL would remount an entire dashboard --
 * losing its loaded data -- every time somebody clicked a tab.
 *
 * Opacity only, no rise. A whole page sliding up on every navigation is the
 * kind of motion that stops reading as polish after the third click, and an
 * animating `transform` on an ancestor would re-anchor any `position: fixed`
 * child inside it for the duration.
 *
 * Enter only, no exit -- there is nothing to fade OUT to, since wouter has
 * already swapped the component. An exit animation here would mean holding
 * stale content on screen after the URL says it is gone.
 */
function RouteFade({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <div key={location} className="ff-fade">{children}</div>;
}

// Protect routes that require auth + a specific role
function ProtectedRoute({
  component: Component,
  requiredRole,
}: {
  component: React.ComponentType;
  requiredRole?: UserRole;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "redirect" | "unverified">("loading");
  const [redirectTo, setRedirectTo] = useState("/login");
  const [attempt, setAttempt] = useState(0);
  // The `unverified` dead end used to exist for exactly one case (admin, profile
  // unreadable) and hardcoded that wording. It now serves every "we could not
  // TELL" path, so the copy travels with the state instead of being baked into
  // the markup. One rendered block, several reasons — which is also why the
  // spacing literals below are not duplicated per case.
  const [stuck, setStuck] = useState<{ title: string; body: string }>({ title: "", body: "" });

  useEffect(() => {
    let settled = false;
    /*
     * ⚠️ A HANG IS NOT A SIGN-OUT, AND NEITHER IS A FAILED READ (2026-11-09).
     *
     * All three failure paths in this effect — this timeout, a `userError` from
     * getUser(), and the catch at the bottom — used to `Redirect to="/login"`.
     * That is the endless loop the owner reported: /login's own mount reads the
     * session, finds it perfectly valid, and sends you back to the dashboard,
     * which fails the same read again. Nothing is ever shown to the person, and
     * no amount of waiting breaks the cycle because the page never admits that
     * anything went wrong.
     *
     * THE DISTINCTION THAT DECIDES THE BRANCH is "no session" versus "no
     * answer" — and ⚠️ IT IS NOT THE PRESENCE OF AN ERROR. A signed-out
     * `getUser()` resolves WITH an error (`AuthSessionMissingError`), so
     * `if (error) → "connection problem"` tells a plainly signed-out visitor
     * they are still signed in and offers a refresh that can never work. That
     * version of this fix was written and caught in review the same day;
     * `readAuthUser()` exists so the three-way answer has one implementation
     * rather than three call sites each guessing. Full reasoning in
     * src/lib/authRead.ts.
     *
     * A timeout and a throw genuinely are "no answer", so they land on an
     * honest dead end with a Try again button — the same treatment the admin
     * branch below already got, generalised, for the same reason it was
     * written: a failed read is not an empty result.
     */
    const timeout = setTimeout(() => {
      if (!settled) {
        setStuck({
          title: "This is taking longer than it should",
          body: "We couldn't finish checking your sign-in. You are still signed in and nothing has been lost — refresh the page to try again.",
        });
        setStatus("unverified");
      }
    }, 8000);
    (async () => {
      try {
        /*
         * THREE OUTCOMES, NOT TWO. `readAuthUser()` is the one place that
         * separates "signed out" from "couldn't tell" — see src/lib/authRead.ts
         * for why `if (error)` and `if (!user)` are BOTH wrong on their own.
         * Signed out still redirects to /login, because /login is a way
         * forward; only an identifiably transient fault earns the dead end.
         */
        const who = await readAuthUser();
        if (who.kind === "signedOut") { setRedirectTo("/login"); setStatus("redirect"); return; }
        if (who.kind === "unknown") {
          setStuck({
            title: "We couldn't reach the server",
            body: "Your sign-in is fine — the check just couldn't get through. Refresh the page to try again.",
          });
          setStatus("unverified");
          return;
        }
        const user = { id: who.userId };

        if (requiredRole) {
          // Shared, session-scoped read — TopNav and FinishSignupBanner mount
          // on this same navigation and ask the same question; getMyProfile
          // collapses all three into one query. See src/lib/myProfile.ts.
          const profile = await getMyProfile(user.id);

          // No profile row yet (half-finished signup, e.g. Google one-tap) —
          // let the dashboard through; it repairs the account via ensure_profile
          // and walks the user through completing their info. A FAILED read
          // (ok:false) is treated the same way it was when this queried
          // directly: pass through rather than redirect on bad information.
          if (profile.ok && profile.exists && profile.role !== requiredRole) {
            setRedirectTo(dashboardFor(profile.role));
            setStatus("redirect");
            return;
          }

          /*
           * ⚠️ THE PASS-THROUGH ABOVE IS CORRECT FOR THE TWO REPAIRABLE
           * DASHBOARDS AND WRONG FOR THE ADMIN ONE (2026-11-09).
           *
           * Its justification is that the dashboard being entered calls
           * `ensure_profile` and walks a half-finished signup through — true of
           * the client and contractor dashboards, and false of the admin one,
           * which nothing can repair you INTO. So on an unreadable or absent
           * profile the admin route let a session RLS will give nothing to
           * render the whole dashboard, and the result is the screen the owner
           * reported: REQUESTS 0 / JOBS 0 / ACCOUNTS 0, "No requests yet", and
           * a red banner naming accounts / re-signup flags / health.
           *
           * THAT BANNER WAS THE DIAGNOSIS SITTING IN PLAIN SIGHT AND IT READ AS
           * A BUG LIST. Under a non-admin session PostgREST table selects come
           * back `[]` with NO error, while an `is_admin()`-gated RPC raises —
           * so "the counts are zero and exactly the three RPCs failed" is the
           * signature of a wrong session, not of eight broken queries. All
           * three RPCs were verified working for the real admin. A page that
           * renders half of itself and blames its own data is worse than one
           * that says who you are signed in as.
           *
           * So the admin route demands a POSITIVE `role === 'admin'`:
           *   - couldn't read the profile (ok:false) → "unverified" + Retry.
           *     NOT a redirect to /login: a network blip is not a sign-out, and
           *     bouncing the owner to a password form over one would be a lie
           *     about his session. A failed read is not an empty result.
           *   - no profile row (ok, !exists) → /client-dashboard, where
           *     ensure_profile actually repairs it.
           */
          if (requiredRole === "admin" && profile.role !== "admin") {
            if (!profile.ok) {
              setStuck({
                title: "We couldn't confirm your admin access",
                body: "You're signed in, but the check that reads your role didn't answer — so this is a connection problem, not a sign-out. Nothing is wrong with your account. Refresh the page to try again.",
              });
              setStatus("unverified");
              return;
            }
            setRedirectTo("/client-dashboard");
            setStatus("redirect");
            return;
          }
        }
        setStatus("ok");
      } catch (err) {
        // Never leave the route stuck on the loading spinner — but an
        // unexpected error says nothing about whether the session is valid, so
        // this is a dead end with a way out, not a bounce to /login.
        console.error("ProtectedRoute auth check failed:", err);
        setStuck({
          title: "Something interrupted the sign-in check",
          body: "You are still signed in and nothing has been lost. Refresh the page to try again.",
        });
        setStatus("unverified");
      } finally {
        settled = true;
        clearTimeout(timeout);
      }
    })();
    return () => clearTimeout(timeout);
  }, [requiredRole, attempt]);

  // Every ProtectedRoute gates a dashboard, so the auth check shows the SAME
  // shell the dashboard itself shows while it loads. The two phases then read
  // as one continuous load instead of a spinner handing off to a skeleton.
  if (status === "loading") return (
    <div style={{ minHeight: "100vh", background: "var(--ff-bg)" }}>
      <DashboardSkeleton />
    </div>
  );

  /*
   * EVERY "WE COULD NOT TELL" PATH LANDS HERE — the 8s hang, a getUser()
   * transport error, an unreadable admin profile, and any throw. An honest dead
   * end beats a dashboard that renders zeros and then blames its own queries,
   * and it beats a redirect to /login, which would claim the session had ended
   * when it has not (and which /login then bounces straight back, which is the
   * endless loop this replaced).
   *
   * Retry clears the shared cache first; `getMyProfile` does not cache
   * failures, but saying so here means the next person does not have to check.
   * The button bumps `attempt` rather than reloading the tab, so a retry costs
   * one query instead of a whole bundle — the copy still says "refresh"
   * because that is the instruction that works whichever way the person takes
   * it, and a full browser refresh reaches the same code.
   */
  if (status === "unverified") return (
    <div style={{ minHeight: "100vh", background: "var(--ff-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(1rem, 4vw, 1.5rem)" }}>
      <div style={{ maxWidth: 420, textAlign: "center", color: "var(--ff-text)", fontFamily: "'DM Sans',sans-serif" }}>
        <h1 style={{ fontFamily: "var(--ff-font-display)", fontWeight: "var(--ff-display-wght)" as any, fontSize: "1.6rem", lineHeight: 1.04, letterSpacing: "-0.028em", marginBottom: "var(--ff-s2)" }}>
          {stuck.title || "We couldn't finish checking your sign-in"}
        </h1>
        <p style={{ fontSize: ".92rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .7)", marginBottom: "var(--ff-s6)" }}>
          {stuck.body || "This is a connection problem, not a sign-out. Nothing is wrong with your account — refresh the page to try again."}
        </p>
        {/* TWO WAYS OUT, because we are here precisely because we do not know
            which one is needed. Try again is primary (the likely cause is
            transient), and "Sign in instead" is the escape hatch for the case
            where our reading of the error was wrong — without it this screen
            would be the dead end it exists to replace. AuthCallback's blocked
            phase pairs its buttons the same way. */}
        <div style={{ display: "flex", gap: "var(--ff-s3)", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => { clearMyProfile(); setStatus("loading"); setAttempt(a => a + 1); }}
            style={{ minHeight: "var(--ff-h-ctl)", padding: "0 1.25rem", borderRadius: 10, border: "1px solid var(--ff-c10)", background: "var(--ff-c10)", color: "var(--ff-bg)", fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
          <button
            onClick={() => { setRedirectTo("/login"); setStatus("redirect"); }}
            style={{ minHeight: "var(--ff-h-ctl)", padding: "0 1.25rem", borderRadius: 10, border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .18)", background: "transparent", color: "rgba(var(--ff-muted), .85)", fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            Sign in instead
          </button>
        </div>
      </div>
    </div>
  );

  if (status === "redirect") return <Redirect to={redirectTo} />;
  return <Component />;
}

export default function App() {
  // Keyed on the path so navigating away from a broken route clears the error
  // instead of stranding the user on the fallback panel.
  const [appLoc] = useLocation();
  return (
    <>
      <RecoveryRedirect />
      <ScrollToTop />
      <TopNav />
      <ChatWidget />
      <GoogleReviewModal />
      <ReferralShareModal />
      {/* The completion moment asks for a review AND a referral in one modal.
          The two above still serve their other moments — signup / job posted,
          and the rehire fallback — so all three are mounted. Only one can ever
          be open at a time: each fires on its own event, and no two of those
          events are dispatched from the same click. */}
      <CompletionThanksModal />
      <FinishSignupBanner />
      <CookieConsent />
      <OverhaulNotice />
      <RouteFade>
      <ErrorBoundary label="this page" resetKey={appLoc}>
      <Suspense fallback={<PageLoader />}>
      <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/update-password" component={UpdatePassword} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/client-onboarding" component={ClientOnboarding} />
      <Route path="/get-a-quote" component={GetQuote} />
      {/* Pick-your-pro straight from the estimate email. The token in the URL is
          the authorization, so this route must stay PUBLIC — a login wall here is
          exactly what stopped the first four clients from ever choosing anyone. */}
      <Route path="/pick/:token" component={PickPro} />
      <Route path="/contractor-onboarding" component={ContractorOnboarding} />
      <Route path="/contractors/:id" component={ContractorProfile} />
      <Route path="/client-success" component={ClientSuccess} />
      <Route path="/contractor-success" component={ContractorSuccess} />
      <Route path="/user-agreement" component={UserAgreement} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/homeowner-protection-promise" component={ProtectionPromise} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/services" component={ServicesIndex} />
      <Route path="/services/:slug" component={ServiceLanding} />
      <Route path="/for-contractors" component={ForContractors} />
      <Route path="/about" component={About} />
      <Route path="/contractor-guide" component={ContractorGuide} />
      <Route path="/areas" component={AreasIndex} />
      <Route path="/areas/:slug" component={AreaLanding} />
      {/* Dev-only swatch sheet for the shared UI primitives; not served in production. */}
      {UiLab && <Route path="/ui-lab" component={UiLab} />}

      {/* Protected */}
      <Route path="/client-dashboard">
        {() => <ProtectedRoute component={ClientDashboard} requiredRole="client" />}
      </Route>
      <Route path="/contractor-dashboard">
        {() => <ProtectedRoute component={ContractorDashboard} requiredRole="contractor" />}
      </Route>
      <Route path="/admin-dashboard">
        {() => <ProtectedRoute component={AdminDashboard} requiredRole="admin" />}
      </Route>

      {/* 404 */}
      <Route>
        {() => <Redirect to="/" />}
      </Route>
    </Switch>
    </Suspense>
    </ErrorBoundary>
    </RouteFade>
    <Footer />
    </>
  );
}
