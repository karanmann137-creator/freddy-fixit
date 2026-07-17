import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

// FinishSignupBanner — site-wide nudge for half-finished accounts.
// Google one-tap (and an abandoned signup) can create an auth login WITHOUT a
// profiles row, so the person is "signed in" but can't use any dashboard.
// This banner shows on every page for those accounts: "Finish setting up your
// account" → the right onboarding flow. Hidden on the onboarding routes
// themselves (they ARE the fix) and on auth/legal pages.
//
// Mounted once in App.tsx. Re-checks on route change (cheap: one profiles
// head-select, only when a session exists) so it disappears right after the
// person completes onboarding. Never queries inside onAuthStateChange
// (auth-lock deadlock rule) — route changes are the refresh trigger.

const HIDE_ON = [
  "/client-onboarding", "/contractor-onboarding",
  "/login", "/auth", "/update-password",
  "/client-success", "/contractor-success",
  "/user-agreement", "/privacy-policy", "/homeowner-protection-promise",
];

export default function FinishSignupBanner() {
  const [loc, setLocation] = useLocation();
  const [show, setShow] = useState(false);
  // What the signup metadata says they were trying to become (if we know).
  const [intent, setIntent] = useState<"client" | "contractor" | null>(null);

  const hidden = HIDE_ON.some(p => loc === p || loc.startsWith(p + "/"));

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) { if (alive) setShow(false); return; }
        const { data, error } = await supabase
          .from("profiles").select("id").eq("id", user.id).maybeSingle();
        if (!alive) return;
        if (!error && !data) {
          const meta: any = user.user_metadata || {};
          const r = meta.role === "contractor" || meta.user_type === "contractor" ? "contractor"
            : meta.role === "client" || meta.user_type === "client" ? "client" : null;
          setIntent(r);
          setShow(true);
        } else {
          setShow(false);
        }
      } catch { /* never block the page over a nudge */ }
    })();
    return () => { alive = false; };
  }, [loc, hidden]);

  if (hidden || !show) return null;

  const go = (path: string) => setLocation(path);

  return (
    <div style={bar} role="status">
      <style>{"@keyframes ffFsbIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}"}</style>
      <span style={{ fontWeight: 600 }}>Your account isn&rsquo;t finished yet.</span>
      <span style={{ opacity: .92 }}> Finish setting up — it takes about 2 minutes.</span>
      {intent ? (
        <button style={cta} onClick={() => go(intent === "contractor" ? "/contractor-onboarding" : "/client-onboarding")}>
          Finish setting up →
        </button>
      ) : (
        <span style={{ display: "inline-flex", gap: ".45rem", flexWrap: "wrap" }}>
          <button style={cta} onClick={() => go("/client-onboarding")}>I need a fix →</button>
          <button style={ctaGhost} onClick={() => go("/contractor-onboarding")}>I&rsquo;m a contractor →</button>
        </span>
      )}
    </div>
  );
}

const bar: React.CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 950,
  display: "flex", alignItems: "center", justifyContent: "center",
  gap: ".6rem", flexWrap: "wrap", textAlign: "center",
  padding: ".65rem .9rem",
  background: "linear-gradient(135deg,#ea6b14,#d95f0e)", color: "#fff",
  fontFamily: "'DM Sans',sans-serif", fontSize: ".85rem", lineHeight: 1.4,
  boxShadow: "0 -6px 24px rgba(0,0,0,.3)", animation: "ffFsbIn .3s ease",
};
const cta: React.CSSProperties = {
  padding: ".42rem .95rem", borderRadius: "999px", border: "none",
  background: "#fff", color: "#c2570d", fontWeight: 700, fontSize: ".8rem",
  fontFamily: "'DM Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap",
};
const ctaGhost: React.CSSProperties = {
  padding: ".42rem .95rem", borderRadius: "999px",
  border: "1px solid rgba(255,255,255,.75)", background: "transparent",
  color: "#fff", fontWeight: 600, fontSize: ".8rem",
  fontFamily: "'DM Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap",
};
