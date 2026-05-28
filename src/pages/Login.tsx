cat > src/pages/Login.tsx << 'ENDOFFILE'
import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [mode, setMode]         = useState<"signin"|"forgot">("signin");
  const [resetSent, setResetSent] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setError(""); setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
      if (profile?.role === "admin")           setLocation("/admin-dashboard");
      else if (profile?.role === "contractor") setLocation("/contractor-dashboard");
      else                                     setLocation("/client-dashboard");
    } catch (err: any) {
      setError(err.message ?? "Sign in failed. Please check your credentials.");
    } finally { setLoading(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError("Please enter your email address."); return; }
    setError(""); setLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (resetErr) throw resetErr;
      setResetSent(true);
    } catch (err: any) {
      setError(err.message ?? "Could not send reset email.");
    } finally { setLoading(false); }
  };

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".95rem", outline:"none", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"#1a2236", backgroundImage:"radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%)", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", padding:"2rem 1rem", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" },
    inner: { maxWidth:"420px", width:"100%" },
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.2rem", letterSpacing:".1em", textAlign:"center" as const, marginBottom:"2rem" },
    card: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"14px", padding:"2rem" },
    heading: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:".06em", marginBottom:".25rem" },
    sub: { fontSize:".85rem", color:"rgba(190,205,235,.5)", fontWeight:300, marginBottom:"1.75rem" },
    label: { display:"block", fontSize:".75rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.55)", marginBottom:".5rem" },
    err: { background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"#fca5a5", marginBottom:"1rem" },
    btn: { width:"100%", padding:".9rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontSize:".95rem", fontWeight:500, cursor:"pointer", transition:"all .2s", boxSizing:"border-box" as const },
    textBtn: { background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem", color:"#ea6b14", padding:0 },
    footer: { textAlign:"center" as const, marginTop:"1.5rem", fontSize:".83rem", color:"rgba(190,205,235,.45)" },
  };

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <div style={s.logo}>FREDDY <span style={{ color:"#ea6b14" }}>FIXIT</span></div>

        <div style={s.card}>
          {resetSent ? (
            <div style={{ textAlign:"center", padding:"1.5rem 0" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>📬</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.6rem", letterSpacing:".06em", marginBottom:".5rem" }}>Check Your Email</div>
              <p style={{ fontSize:".85rem", color:"rgba(190,205,235,.6)", fontWeight:300, lineHeight:1.6 }}>
                We sent a reset link to <strong>{email}</strong>. Check your inbox and follow the link to set a new password.
              </p>
              <button style={{ ...s.textBtn, marginTop:"1.5rem" }} onClick={() => { setMode("signin"); setResetSent(false); }}>
                ← Back to sign in
              </button>
            </div>
          ) : mode === "signin" ? (
            <>
              <div style={s.heading}>Welcome Back</div>
              <p style={s.sub}>Sign in to your Freddy Fix It account</p>
              {error && <div style={s.err}>{error}</div>}
              <form onSubmit={handleSignIn}>
                <div style={{ marginBottom:"1rem" }}>
                  <label style={s.label}>Email</label>
                  <input style={inp} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div style={{ marginBottom:".75rem" }}>
                  <label style={s.label}>Password</label>
                  <input style={inp} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <div style={{ textAlign:"right", marginBottom:"1.25rem" }}>
                  <button type="button" style={s.textBtn} onClick={() => { setMode("forgot"); setError(""); }}>
                    Forgot password?
                  </button>
                </div>
                <button style={s.btn} type="submit" disabled={loading}>
                  {loading ? "Signing in…" : "Sign In →"}
                </button>
              </form>
              <div style={{ display:"flex", alignItems:"center", gap:".75rem", margin:"1.5rem 0" }}>
                <div style={{ flex:1, height:"1px", background:"rgba(255,255,255,.08)" }} />
                <span style={{ fontSize:".75rem", color:"rgba(190,205,235,.35)" }}>No account yet?</span>
                <div style={{ flex:1, height:"1px", background:"rgba(255,255,255,.08)" }} />
              </div>
              <button style={{ ...s.btn, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", color:"rgba(190,205,235,.8)" }} onClick={() => setLocation("/")}>
                Get Started on Home Page
              </button>
            </>
          ) : (
            <>
              <div style={s.heading}>Reset Password</div>
              <p style={s.sub}>We'll email you a link to set a new password</p>
              {error && <div style={s.err}>{error}</div>}
              <form onSubmit={handleReset}>
                <div style={{ marginBottom:"1.5rem" }}>
                  <label style={s.label}>Email</label>
                  <input style={inp} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <button style={s.btn} type="submit" disabled={loading}>
                  {loading ? "Sending…" : "Send Reset Link →"}
                </button>
              </form>
              <div style={{ textAlign:"center", marginTop:"1.25rem" }}>
                <button style={s.textBtn} onClick={() => { setMode("signin"); setError(""); }}>← Back to sign in</button>
              </div>
            </>
          )}
        </div>

        <p style={s.footer}>
          Questions? <a href="mailto:hello@freddyfixit.ca" style={{ color:"#ea6b14", textDecoration:"none" }}>hello@freddyfixit.ca</a>
        </p>
      </div>
    </div>
  );
}
ENDOFFILE