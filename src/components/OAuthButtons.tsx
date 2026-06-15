import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Google + Apple sign-in buttons.
// `role` is the intent of the page the user started from:
//   - contractor onboarding -> role="contractor"
//   - client onboarding      -> role="client"
//   - the form-less Login    -> role omitted (AuthCallback will ask them to choose)
// The role is carried through the OAuth round-trip in the redirect URL so the
// callback page knows where to send a brand-new account.
export default function OAuthButtons({ role, label = "or continue with" }: { role?: "client" | "contractor"; label?: string }) {
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [err, setErr] = useState("");

  const signIn = async (provider: "google" | "apple") => {
    setErr(""); setBusy(provider);
    try {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      const qs = params.toString();
      const redirectTo = `${window.location.origin}/auth/callback${qs ? "?" + qs : ""}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw error;
      // On success the browser is redirected away; nothing else to do here.
    } catch (e: any) {
      setErr(e?.message ?? "Could not start sign-in. Please try again.");
      setBusy(null);
    }
  };

  const wrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: ".6rem" };
  const divider: React.CSSProperties = { display: "flex", alignItems: "center", gap: ".75rem", margin: "1.25rem 0" };
  const line: React.CSSProperties = { flex: 1, height: "1px", background: "rgba(255,255,255,.08)" };
  const lbl: React.CSSProperties = { fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(190,205,235,.4)" };
  const btn: React.CSSProperties = {
    width: "100%", padding: ".8rem 1rem", borderRadius: "8px", cursor: "pointer",
    fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, display: "flex",
    alignItems: "center", justifyContent: "center", gap: ".6rem", border: "1px solid",
    boxSizing: "border-box",
  };

  return (
    <div>
      <div style={divider}><div style={line} /><span style={lbl}>{label}</span><div style={line} /></div>
      {err && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "8px", padding: ".6rem .85rem", fontSize: ".8rem", color: "#fca5a5", marginBottom: ".6rem" }}>{err}</div>}
      <div style={wrap}>
        <button type="button" onClick={() => signIn("google")} disabled={busy !== null}
          style={{ ...btn, background: "#fff", color: "#1f2937", borderColor: "#fff", opacity: busy && busy !== "google" ? .6 : 1 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.06l3.01-2.34z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </button>
        <button type="button" onClick={() => signIn("apple")} disabled={busy !== null}
          style={{ ...btn, background: "#000", color: "#fff", borderColor: "#000", opacity: busy && busy !== "apple" ? .6 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 384 512" fill="#fff" aria-hidden="true">
            <path d="M318.7 268c-.3-37 16.4-65 50.1-85.6-18.9-27-47.4-41.9-85-44.8-35.6-2.8-74.5 20.8-88.7 20.8-15 0-49.4-19.8-76.4-19.8C72.4 139.1 16 184.6 16 277c0 27.3 5 55.5 15 84.6 13.3 38.2 61.2 132 111.2 130.5 26.1-.6 44.6-18.5 78.6-18.5 33 0 50.1 18.5 78.7 18.5 50.4-.7 93.8-86 106.5-124.3-67.7-31.9-65.3-93.5-65.3-95.8zM262.4 80.6c27.2-32.3 24.7-61.7 23.9-72.3-23.9 1.4-51.6 16.3-67.4 34.6-17.4 19.6-27.6 43.8-25.4 71.7 25.8 2 49.3-11.2 68.9-34z"/>
          </svg>
          {busy === "apple" ? "Redirecting…" : "Continue with Apple"}
        </button>
      </div>
    </div>
  );
}
