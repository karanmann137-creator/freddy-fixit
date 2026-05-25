import { Switch, Route, Redirect } from "wouter";
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
          // Redirect to their correct dashboard
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
    <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/client-onboarding" component={ClientOnboarding} />
      <Route path="/contractor-onboarding" component={ContractorOnboarding} />
      <Route path="/client-success" component={ClientSuccess} />
      <Route path="/contractor-success" component={ContractorSuccess} />

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
  );
}
