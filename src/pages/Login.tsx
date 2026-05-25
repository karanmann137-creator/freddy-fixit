import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setError(""); setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (profile?.role === "admin") setLocation("/admin-dashboard");
      else if (profile?.role === "contractor") setLocation("/contractor-dashboard");
      else setLocation("/client-dashboard");
    } catch (err: any) {
      setError(err.message ?? "Sign in failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#1a2236", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff", padding:"2rem" }}>
      <div style={{ maxWidth:"400px", width:"100%" }}>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.5rem", letterSpacing:"0.1em", textAlign:"center", marginBottom:"2rem" }}>
          FREDDY <span style={{ color:"#ea6b14" }}>FIXIT</span>
        </h1>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"14px", padding:"2rem" }}>
          <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:"0.06em", marginBottom:"1.5rem" }}>Sign In</h2>
          {error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:"8px", padding:"0.75rem 1rem", marginBottom:"1rem", fontSize:"0.85rem", color:"#fca5a5" }}>{error}</div>}
          <form onSubmit={handleSignIn}>
            <div style={{ marginBottom:"1rem" }}>
              <label style={{ display:"block", fontSize:"0.75rem", textTransform:"uppercase", letterSpacing:"0.1em", color:"rgba(190,205,235,0.6)", marginBottom:"0.5rem" }}>Email</label>
              <input style={{ width:"100%", padding:"0.75rem 1rem", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:"0.95rem", outline:"none", boxSizing:"border-box" }}
                type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={{ marginBottom:"1.5rem" }}>
              <label style={{ display:"block", fontSize:"0.75rem", textTransform:"uppercase", letterSpacing:"0.1em", color:"rgba(190,205,235,0.6)", marginBottom:"0.5rem" }}>Password</label>
              <input style={{ width:"100%", padding:"0.75rem 1rem", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:"0.95rem", outline:"none", boxSizing:"border-box" }}
                type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={loading}
              style={{ width:"100%", padding:"0.9rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontSize:"0.95rem", fontWeight:500, cursor:"pointer" }}>
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>
        </div>
        <p style={{ textAlign:"center", marginTop:"1.5rem", fontSize:"0.85rem", color:"rgba(190,205,235,0.45)" }}>
          New here? <a href="/" style={{ color:"#ea6b14", textDecoration:"none" }}>Get started on the home page</a>
        </p>
      </div>
    </div>
  );
}
