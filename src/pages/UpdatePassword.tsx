import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function UpdatePassword() {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let settled = false;
    const ready = () => { if (!settled) { settled = true; setPhase("ready"); } };

    // If Supabase redirected back with an explicit error in the URL (e.g. the link
    // truly expired), don't make the user wait — show invalid right away.
    const hash = window.location.hash || "";
    if (/error=|error_code=/.test(hash)) { setPhase("invalid"); return; }

    supabase.auth.getSession().then(({ data }) => { if (data.session) ready(); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) ready();
    });
    // Give the recovery token time to be parsed (slow connections / cold loads).
    const t = setTimeout(() => { if (!settled) setPhase("invalid"); }, 10000);
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const submit = async () => {
    setError("");
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setError("Passwords do not match."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) { setError(error.message || "Could not update password. The link may have expired."); return; }
    setPhase("done");
    await supabase.auth.signOut();
  };

  return (
    <div style={s.wrap}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={s.logo}>FREDDY FIX IT</div>
        <div style={s.card}>
          {phase === "checking" && (
            <p style={{ color: "rgba(190,205,235,.7)", textAlign: "center" }}>Verifying your reset link...</p>
          )}

          {phase === "invalid" && (
            <div style={{ textAlign: "center" }}>
              <div style={s.heading}>Link expired</div>
              <p style={{ color: "rgba(190,205,235,.7)", fontSize: ".9rem", margin: ".5rem 0 1.25rem" }}>
                This password reset link is invalid or has expired. Request a new one from the login page.
              </p>
              <button style={s.btn} onClick={() => setLocation("/login")}>Back to login</button>
            </div>
          )}

          {phase === "ready" && (
            <div>
              <div style={s.heading}>Set a new password</div>
              <p style={{ color: "rgba(190,205,235,.6)", fontSize: ".85rem", marginBottom: "1.25rem" }}>
                Enter a new password for your account.
              </p>
              {error && <div style={s.err}>{error}</div>}
              <input type="password" placeholder="New password" value={pw} onChange={e => setPw(e.target.value)} style={{ ...inp, marginBottom: ".75rem" }} />
              <input type="password" placeholder="Confirm new password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} style={{ ...inp, marginBottom: "1.25rem" }} />
              <button style={s.btn} onClick={submit} disabled={saving}>{saving ? "Updating..." : "Update password"}</button>
            </div>
          )}

          {phase === "done" && (
            <div style={{ textAlign: "center" }}>
              <div style={s.heading}>Password updated</div>
              <p style={{ color: "rgba(190,205,235,.7)", fontSize: ".9rem", margin: ".5rem 0 1.25rem" }}>
                Your password has been changed. You can now sign in with your new password.
              </p>
              <button style={s.btn} onClick={() => setLocation("/login")}>Go to login</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: ".75rem 1rem", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "8px", color: "#f0f4ff", fontFamily: "inherit", fontSize: ".95rem", outline: "none", boxSizing: "border-box" };
const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", background: "#1a2236", backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "'DM Sans',sans-serif", color: "#f0f4ff" },
  logo: { fontFamily: "'Bebas Neue',sans-serif", fontSize: "2.2rem", letterSpacing: ".1em", textAlign: "center", marginBottom: "2rem", color: "#ea6b14" },
  card: { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: "14px", padding: "2rem" },
  heading: { fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.8rem", letterSpacing: ".06em", marginBottom: ".25rem" },
  err: { background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "8px", padding: ".75rem 1rem", fontSize: ".83rem", color: "#fca5a5", marginBottom: "1rem" },
  btn: { width: "100%", padding: ".9rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".95rem", fontWeight: 500, cursor: "pointer", boxSizing: "border-box" },
};
