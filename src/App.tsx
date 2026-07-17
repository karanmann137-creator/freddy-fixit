import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/supabase";
import { trackPageView } from "@/lib/analytics";

// Eager: tiny, always-needed shell + the landing/login pages.
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import UpdatePassword from "@/pages/UpdatePassword";
import AuthCallback from "@/pages/AuthCallback";
import TopNav from "@/components/TopNav";
import ChatWidget from "@/components/ChatWidget";
import IntroTips from "@/components/IntroTips";
import GoogleReviewModal from "@/components/GoogleReviewModal";
import FinishSignupBanner from "@/components/FinishSignupBanner";
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
const ServicesIndex        = lazy(() => import("@/pages/ServicesIndex"));
const ServiceLanding       = lazy(() => import("@/pages/ServiceLanding"));
const ForContractors       = lazy(() => import("@/pages/ForContractors"));

// Shown briefly while a lazily-loaded page chunk downloads.
function PageLoader() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--ff-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(234,107,20,0.2)", borderTopColor: "#ea6b14", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
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
      if (ref && !localStorage.getItem("ff_ref_code")) localStorage.setItem("ff_ref_code", ref.trim().toUpperCase());
    } catch {}
  }, [location]);
  return null;
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

  if (status === "loading") return (
    <div style={{ minHeight: "100vh", background: "var(--ff-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(234,107,20,0.2)", borderTopColor: "#ea6b14", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
      <IntroTips />
      <GoogleReviewModal />
      <FinishSignupBanner />
      <Suspense fallback={<PageLoader />}>
      <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/update-password" component={UpdatePassword} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/client-onboarding" component={ClientOnboarding} />
      <Route path="/get-a-quote" component={GetQuote} />
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
    <Footer />
    </>
  );
}
