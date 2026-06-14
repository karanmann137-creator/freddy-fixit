import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/supabase";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import ClientOnboarding from "@/pages/ClientOnboarding";
import ContractorOnboarding from "@/pages/ContractorOnboarding";
import ClientSuccess from "@/pages/ClientSuccess";
import ContractorSuccess from "@/pages/ContractorSuccess";
import ClientDashboard from "@/pages/ClientDashboard";
import ContractorDashboard from "@/pages/ContractorDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import UpdatePassword from "@/pages/UpdatePassword";
import TopNav from "@/components/TopNav";
import ChatWidget from "@/components/ChatWidget";
import BrowseContractors from "@/pages/BrowseContractors";
import ContractorProfile from "@/pages/ContractorProfile";
import UserAgreement from "@/pages/UserAgreement";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";

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
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setRedirectTo("/login"); setStatus("redirect"); return; }

      if (requiredRole) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (!profile || profile.role !== requiredRole) {
          const dest =
            profile?.role === "admin" ? "/admin-dashboard" :
            profile?.role === "contractor" ? "/contractor-dashboard" :
            "/client-dashboard";
          setRedirectTo(dest);
          setStatus("redirect");
          return;
        }
      }
      setStatus("ok");
    })();
  }, [requiredRole]);

  if (status === "loading") return (
    <div style={{ minHeight: "100vh", background: "#1a2236", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
      <TopNav />
      <ChatWidget />
      <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/update-password" component={UpdatePassword} />
      <Route path="/client-onboarding" component={ClientOnboarding} />
      <Route path="/contractor-onboarding" component={ContractorOnboarding} />
      <Route path="/contractors" component={BrowseContractors} />
      <Route path="/contractors/:id" component={ContractorProfile} />
      <Route path="/client-success" component={ClientSuccess} />
      <Route path="/contractor-success" component={ContractorSuccess} />
      <Route path="/user-agreement" component={UserAgreement} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />

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
    </>
  );
}
