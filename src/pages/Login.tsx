import { Ic } from "@/components/Ic";
import PasswordField from "@/components/PasswordField";
import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import OAuthButtons from "@/components/OAuthButtons";
import { mfaReason, type MfaStatus } from "@/lib/mfa";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [mode, setMode]         = useState<"signin"|"forgot">("signin");
  const [resetSent, setResetSent] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resendNote, setResendNote] = useState("");

  // Two-step sign-in stage. Reached only after the password has been accepted,
  // so a session already exists by the time this shows — see cancelOtp.
  const [otpStage, setOtpStage] = useState(false);
  const [otpCode, setOtpCode]   = useState("");
  const [otpErr, setOtpErr]     = useState("");
  const [otpNote, setOtpNote]   = useState("");
  const [otpBusy, setOtpBusy]   = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [dest, setDest]         = useState("/client-dashboard");

  const resendConfirmation = async () => {
    if (!email) { setError("Enter your email above first."); return; }
    setResendNote(""); setLoading(true);
    try {
      const { error: rErr } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (rErr) throw rErr;
      setResendNote("Confirmation email sent — check your inbox.");
    } catch (err: any) {
      setError(err.message ?? "Could not resend the confirmation email.");
    } finally { setLoading(false); }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setError(""); setNeedsConfirm(false); setResendNote(""); setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      const to = profile?.role === "admin"      ? "/admin-dashboard"
               : profile?.role === "contractor" ? "/contractor-dashboard"
               :                                  "/client-dashboard";
      setDest(to);

      // Two-step sign-in. Supabase issues the session the moment the password is
      // accepted, so this prompt gates the UI, not the API — which is exactly why
      // mfa_ok() also sits inside admin_guard(), on the RPCs that do irreversible
      // things. Fail OPEN on a read error: failing closed would lock people out
      // over a network blip and would buy nothing, because the server-side gate
      // is the one that actually holds.
      const { data: st, error: stErr } = await supabase.rpc("mfa_status");
      const mfa = st as MfaStatus | null;
      if (!stErr && mfa?.enabled && !mfa.verified_recently) {
        setOtpCode(""); setOtpErr(""); setOtpNote(""); setRecoveryMode(false);
        setOtpStage(true);
        sendLoginCode();
        return;
      }
      setLocation(to);
    } catch (err: any) {
      const m = (err?.message ?? "").toLowerCase();
      if (m.includes("not confirmed") || m.includes("email_not_confirmed") || err?.code === "email_not_confirmed") {
        setNeedsConfirm(true);
        setError("Please confirm your email before signing in. Check your inbox for the verification link.");
      } else {
        setError(err.message ?? "Sign in failed. Please check your credentials.");
      }
    } finally { setLoading(false); }
  };

  const sendLoginCode = async () => {
    setOtpErr(""); setOtpNote(""); setOtpBusy(true);
    try {
      const { data, error: rErr } = await supabase.rpc("mfa_request_code", { p_purpose: "login" });
      if (rErr) throw rErr;
      if (!(data as any)?.ok) { setOtpErr(mfaReason((data as any)?.reason)); return; }
      setOtpNote("Code sent \u2014 check your email.");
    } catch (err: any) {
      setOtpErr(err?.message ?? "Couldn't send the code. Try again in a moment.");
    } finally { setOtpBusy(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpErr(""); setOtpNote(""); setOtpBusy(true);
    try {
      const { data, error: vErr } = recoveryMode
        ? await supabase.rpc("mfa_use_recovery", { p_code: otpCode.trim() })
        : await supabase.rpc("mfa_verify", { p_code: otpCode, p_purpose: "login" });
      if (vErr) throw vErr;
      const d = data as any;
      if (!d?.ok) { setOtpErr(mfaReason(d?.reason, d?.attempts_left)); return; }
      setLocation(dest);
    } catch (err: any) {
      setOtpErr(err?.message ?? "Couldn't check that code.");
    } finally { setOtpBusy(false); }
  };

  // Backing out has to actually end the session. The password was already
  // accepted, so simply hiding this screen would leave a signed-in session
  // sitting in the browser behind a page that says you are not signed in.
  const cancelOtp = async () => {
    setOtpBusy(true);
    try { await supabase.auth.signOut(); } catch { /* nothing useful to show */ }
    setOtpStage(false); setOtpCode(""); setOtpErr(""); setOtpNote("");
    setRecoveryMode(false); setPassword(""); setOtpBusy(false);
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

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".95rem", outline:"none", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"var(--ff-bg)", backgroundImage:"radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%)", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", padding:"2rem 1rem", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    inner: { maxWidth:"420px", width:"100%" },
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.2rem", letterSpacing:".1em", textAlign:"center" as const, marginBottom:"2rem" },
    card: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"2rem" },
    heading: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:".06em", marginBottom:".25rem" },
    sub: { fontSize:".85rem", color:"rgba(var(--ff-muted), .5)", fontWeight:300, marginBottom:"1.75rem" },
    label: { display:"block", fontSize:".75rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .55)", marginBottom:".5rem" },
    err: { background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginBottom:"1rem" },
    btn: { width:"100%", padding:".9rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontSize:".95rem", fontWeight:500, cursor:"pointer", transition:"all .2s", boxSizing:"border-box" as const },
    textBtn: { background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem", color:"#ea6b14", padding:0 },
    // This page is outside the dashboards' scoped `.ffdash` stylesheet, so
    // :disabled styling has to be applied inline or a busy button looks live.
    dim: (on: boolean) => ({ opacity: on ? .6 : 1, cursor: on ? "not-allowed" : "pointer" }),
    footer: { textAlign:"center" as const, marginTop:"1.5rem", fontSize:".83rem", color:"rgba(var(--ff-muted), .45)" },
  };

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <div style={s.logo}>FREDDY <span style={{ color:"#ea6b14" }}>FIXIT</span></div>

        <div style={s.card}>
          {resetSent ? (
            <div style={{ textAlign:"center", padding:"1.5rem 0" }}>
              <div style={{ marginBottom:"1rem" }}><Ic name="mail" size={48} color="#ea6b14" /></div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.6rem", letterSpacing:".06em", marginBottom:".5rem" }}>Check Your Email</div>
              <p style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .6)", fontWeight:300, lineHeight:1.6 }}>
                We sent a reset link to <strong>{email}</strong>. Check your inbox and follow the link to set a new password.
              </p>
              <button style={{ ...s.textBtn, marginTop:"1.5rem" }} onClick={() => { setMode("signin"); setResetSent(false); }}>
                ← Back to sign in
              </button>
            </div>
          ) : otpStage ? (
            <>
              <div style={s.heading}>One More Step</div>
              <p style={s.sub}>
                {recoveryMode
                  ? "Enter one of the recovery codes you saved"
                  : "We emailed a 6-digit code to " + email}
              </p>
              {otpErr && <div style={s.err}>{otpErr}</div>}
              {otpNote && !recoveryMode && (
                <p style={{ fontSize:".82rem", color:"#22c55e", marginBottom:"1rem" }}>{otpNote}</p>
              )}
              <form onSubmit={verifyOtp}>
                <div style={{ marginBottom:"1.25rem" }}>
                  <label style={s.label}>{recoveryMode ? "Recovery code" : "6-digit code"}</label>
                  <input
                    style={{ ...inp, fontFamily:"'SFMono-Regular',Menlo,Consolas,monospace", fontSize:"1.2rem", letterSpacing: recoveryMode ? ".14em" : ".35em", textAlign:"center" }}
                    value={otpCode}
                    onChange={e => setOtpCode(recoveryMode
                      ? e.target.value.replace(/[^0-9a-zA-Z]/g, "").slice(0, 10).toUpperCase()
                      : e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={recoveryMode ? "A1B2C3D4E5" : "000000"}
                    inputMode={recoveryMode ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    autoFocus
                    aria-label={recoveryMode ? "Recovery code" : "6-digit code"}
                  />
                  {!recoveryMode && (
                    <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .45)", marginTop:".5rem" }}>
                      It expires in 10 minutes. Check your spam folder if it hasn't arrived.
                    </p>
                  )}
                </div>
                <button style={{ ...s.btn, ...s.dim(otpBusy || otpCode.length < (recoveryMode ? 10 : 6)) }}
                        type="submit" disabled={otpBusy || otpCode.length < (recoveryMode ? 10 : 6)}>
                  {otpBusy ? <><span className="ff-btn-spin" aria-hidden="true" />Checking…</> : "Verify →"}
                </button>
              </form>
              <div style={{ display:"flex", justifyContent:"space-between", gap:".75rem", marginTop:"1.25rem" }}>
                {recoveryMode ? (
                  <button type="button" style={s.textBtn} onClick={() => { setRecoveryMode(false); setOtpCode(""); setOtpErr(""); }}>
                    ← Use an emailed code
                  </button>
                ) : (
                  <>
                    <button type="button" style={{ ...s.textBtn, ...s.dim(otpBusy) }} onClick={sendLoginCode} disabled={otpBusy}>
                      Resend code
                    </button>
                    <button type="button" style={s.textBtn} onClick={() => { setRecoveryMode(true); setOtpCode(""); setOtpErr(""); setOtpNote(""); }}>
                      Use a recovery code
                    </button>
                  </>
                )}
              </div>
              <div style={{ textAlign:"center", marginTop:"1.5rem" }}>
                <button type="button" style={{ ...s.textBtn, color:"rgba(var(--ff-muted), .5)", ...s.dim(otpBusy) }} onClick={cancelOtp} disabled={otpBusy}>
                  Cancel and sign out
                </button>
              </div>
              <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .4)", textAlign:"center", marginTop:"1rem", lineHeight:1.5 }}>
                Locked out of both? Email{" "}
                <a href="mailto:hello@freddyfixit.ca" style={{ color:"#ea6b14", textDecoration:"none" }}>hello@freddyfixit.ca</a>{" "}
                and we can switch two-step off for you.
              </p>
            </>
          ) : mode === "signin" ? (
            <>
              <div style={s.heading}>Welcome Back</div>
              <p style={s.sub}>Sign in to your Freddy Fix It account</p>
              {error && <div style={s.err}>{error}</div>}
              {needsConfirm && (
                <div style={{ marginBottom:"1rem" }}>
                  <button type="button" onClick={resendConfirmation} disabled={loading}
                    style={{ ...s.btn, background:"rgba(234,107,20,.12)", border:"1px solid rgba(234,107,20,.4)", color:"#ea6b14", ...s.dim(loading) }}>
                    {loading ? <><span className="ff-btn-spin" aria-hidden="true" />Sending…</> : "Resend confirmation email"}
                  </button>
                  {resendNote && <p style={{ fontSize:".8rem", color:"#22c55e", marginTop:".5rem", textAlign:"center" }}>{resendNote}</p>}
                </div>
              )}
              <form onSubmit={handleSignIn}>
                <div style={{ marginBottom:"1rem" }}>
                  <label style={s.label}>Email</label>
                  <input style={inp} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div style={{ marginBottom:".75rem" }}>
                  <label style={s.label}>Password</label>
                  <PasswordField style={inp} placeholder="••••••••" value={password} onChange={setPassword} autoComplete="current-password" />
                </div>
                <div style={{ textAlign:"right", marginBottom:"1.25rem" }}>
                  <button type="button" style={s.textBtn} onClick={() => { setMode("forgot"); setError(""); }}>
                    Forgot password?
                  </button>
                </div>
                <button style={{ ...s.btn, ...s.dim(loading) }} type="submit" disabled={loading}>
                  {loading ? <><span className="ff-btn-spin" aria-hidden="true" />Signing in…</> : "Sign In →"}
                </button>
              </form>
              <OAuthButtons />
              <div style={{ display:"flex", alignItems:"center", gap:".75rem", margin:"1.5rem 0" }}>
                <div style={{ flex:1, height:"1px", background:"rgba(var(--ff-fg), .08)" }} />
                <span style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .35)" }}>No account yet?</span>
                <div style={{ flex:1, height:"1px", background:"rgba(var(--ff-fg), .08)" }} />
              </div>
              <button style={{ ...s.btn, background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", color:"rgba(var(--ff-muted), .8)" }} onClick={() => setLocation("/")}>
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
                <button style={{ ...s.btn, ...s.dim(loading) }} type="submit" disabled={loading}>
                  {loading ? <><span className="ff-btn-spin" aria-hidden="true" />Sending…</> : "Send Reset Link →"}
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
