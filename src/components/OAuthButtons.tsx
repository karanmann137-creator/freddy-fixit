import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Google sign-in button.
// `role` is the intent of the page the user started from:
//   - contractor onboarding -> role="contractor"
//   - client onboarding      -> role="client"
//   - the form-less Login    -> role omitted (AuthCallback will ask them to choose)
// The role is carried through the OAuth round-trip in the redirect URL so the
// callback page knows where to send a brand-new account.
export default function OAuthButtons({ role, label = "or continue with" }: { role?: "client" | "contractor"; label?: string }) {
  const [busy, setBusy] = useState<"google" | null>(null);
  const [err, setErr] = useState("");

  const signIn = async (provider: "google") => {
    setErr(""); setBusy(provider);
    try {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      const qs = params.toString();
      const redirectTo = `${window.location.origin}/auth/callback${qs ? "?" + qs : ""}`;
      /*
       * ⚠️ `prompt=select_account` IS LOAD-BEARING ON THE SIGN-IN SURFACE, AND
       * IS DELIBERATELY NOT SET ON THE TWO SIGNUP FUNNELS (2026-11-09).
       *
       * Without it Google silently reuses whatever account the browser is
       * already signed into when there is exactly one — no chooser, no
       * indication, no error. That is not a hypothetical: the owner's browser
       * sits on a personal Gmail that ALSO has a `client` account on this
       * platform, so every press of "Continue with Google" signed him into the
       * client account instead of the admin one and dropped him on
       * /client-dashboard. The report that came back was "I cannot sign in
       * using the Google sign-in for admin", because from the outside a
       * successful sign-in to the wrong identity is indistinguishable from a
       * failed one. Both accounts are real, both Google identities are linked
       * correctly, and nothing anywhere was broken.
       *
       * GENERALISE IT: when one human legitimately holds two accounts on the
       * same platform, an identity provider that picks for them is a bug in our
       * flow, not a convenience.
       *
       * WHY IT IS KEYED ON `!role` RATHER THAN ON A NEW PROP. "No role" is
       * already this component's definition of the sign-in surface (see the
       * docblock above): the two onboarding funnels always pass one, Login
       * never does. So the question "is this a sign-in or a signup?" is
       * answered by data the component already has, and a future role-less
       * surface gets the right behaviour without anyone remembering a flag.
       *
       * AND WHY THE FUNNELS ARE LEFT ALONE: on /login you are ASSERTING an
       * identity you already have, so which one is the whole question. On a
       * signup funnel you are CREATING one, and whichever Google account the
       * browser is in is a perfectly good answer — so a chooser there is pure
       * friction on the two highest-value conversion paths we have, inserted to
       * fix a bug that cannot occur there. The asymmetry is the point; it is
       * not an oversight to be tidied up later.
       */
      const options: Record<string, any> = { redirectTo };
      if (!role) options.queryParams = { prompt: "select_account" };
      const { error } = await supabase.auth.signInWithOAuth({ provider, options });
      if (error) throw error;
      // On success the browser is redirected away; nothing else to do here.
    } catch (e: any) {
      setErr(e?.message ?? "Could not start sign-in. Please try again.");
      setBusy(null);
    }
  };

  const wrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: ".6rem" };
  const divider: React.CSSProperties = { display: "flex", alignItems: "center", gap: ".75rem", margin: "1.25rem 0" };
  const line: React.CSSProperties = { flex: 1, height: "1px", background: "rgba(var(--ff-fg), .08)" };
  const lbl: React.CSSProperties = { fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(var(--ff-muted), .4)" };
  const btn: React.CSSProperties = {
    width: "100%", padding: ".8rem 1rem", borderRadius: "8px", cursor: "pointer",
    fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, display: "flex",
    alignItems: "center", justifyContent: "center", gap: ".6rem", border: "1px solid",
    boxSizing: "border-box",
  };

  return (
    <div>
      <div style={divider}><div style={line} /><span style={lbl}>{label}</span><div style={line} /></div>
      {err && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "8px", padding: ".6rem .85rem", fontSize: ".8rem", color: "var(--ff-danger)", marginBottom: ".6rem" }}>{err}</div>}
      <div style={wrap}>
        <button type="button" onClick={() => signIn("google")} disabled={busy !== null}
          style={{ ...btn, background: "#fff", color: "#1f2937", borderColor: "#fff", opacity: busy && busy !== "google" ? .6 : 1 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.06l3.01-2.34z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          {busy === "google" ? <><span className="ff-btn-spin" aria-hidden="true" />Redirecting…</> : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}
