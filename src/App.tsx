import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/supabase";
import { trackPageView } from "@/lib/analytics";
import { REF_CODE_KEY } from "@/lib/referralCode";

// Eager: tiny, always-needed shell + the landing/login pages.
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import UpdatePassword from "@/pages/UpdatePassword";
import AuthCallback from "@/pages/AuthCallback";
import TopNav from "@/components/TopNav";
import { DashboardSkeleton, PageSkeleton } from "@/components/Skeleton";
import ChatWidget from "@/components/ChatWidget";
import GoogleReviewModal from "@/components/GoogleReviewModal";
import ReferralShareModal from "@/components/ReferralShareModal";
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
  const [status, setStatus] = useState<"loading" | "ok" | "redirect">("loading");
  const [redirectTo, setRedirectTo] = useState("/login");

  useEffect(() => {
    let settled = false;
    // Safety net: if any auth call ever hangs (e.g. an auth-lock deadlock),
    // don't spin forever — give up after 8s and send the user to login.
    const timeout = setTimeout(() => {
      if (!settled) { setRedirectTo("/login"); setStatus("redirect"); }
    }, 8000);
    (async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) { setRedirectTo("/login"); setStatus("redirect"); return; }

        if (requiredRole) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

          // No profile row yet (half-finished signup, e.g. Google one-tap) —
          // let the dashboard through; it repairs the account via ensure_profile
          // and walks the user through completing their info.
          if (profile && profile.role !== requiredRole) {
            const dest =
              profile.role === "admin" ? "/admin-dashboard" :
              profile.role === "contractor" ? "/contractor-dashboard" :
              "/client-dashboard";
            setRedirectTo(dest);
            setStatus("redirect");
            return;
          }
        }
        setStatus("ok");
      } catch (err) {
        // Never leave the route stuck on the loading spinner — on any
        // unexpected error (network failure, auth throw, etc.) send to login.
        console.error("ProtectedRoute auth check failed:", err);
        setRedirectTo("/login");
        setStatus("redirect");
      } finally {
        settled = true;
        clearTimeout(timeout);
      }
    })();
    return () => clearTimeout(timeout);
  }, [requiredRole]);

  // Every ProtectedRoute gates a dashboard, so the auth check shows the SAME
  // shell the dashboard itself shows while it loads. The two phases then read
  // as one continuous load instead of a spinner handing off to a skeleton.
  if (status === "loading") return (
    <div style={{ minHeight: "100vh", background: "var(--ff-bg)" }}>
      <DashboardSkeleton />
    </div>
  );

  if (status === "redirect") return <Redirect to={redirectTo} />;
  return <Component />;
}

export default function App() {
  return (
    <>
      <RecoveryRedirect />
      <ScrollToTop />
      <TopNav />
      <ChatWidget />
      <GoogleReviewModal />
      <ReferralShareModal />
      <FinishSignupBanner />
      <CookieConsent />
      <OverhaulNotice />
      <RouteFade>
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
    </RouteFade>
    <Footer />
    </>
  );
}
