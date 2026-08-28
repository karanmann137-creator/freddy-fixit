import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { getMyProfile } from "@/lib/myProfile";

// FinishSignupBanner — site-wide nudge for half-finished accounts.
// Google one-tap (and an abandoned signup) can create an auth login WITHOUT a
// profiles row, so the person is "signed in" but can't use any dashboard.
// This banner shows on every page for those accounts: "Finish setting up your
// account" → the right onboarding flow. Hidden on the onboarding routes
// themselves (they ARE the fix) and on auth/legal pages.
//
// Mounted once in App.tsx. Re-checks on route change, but the profiles read
// goes through the shared session cache in src/lib/myProfile.ts, so a person
// clicking around the site no longer pays a query per navigation for an answer
// that flips exactly once. Never queries inside onAuthStateChange (auth-lock
// deadlock rule) — route changes are the refresh trigger.

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
  const barRef = useRef<HTMLDivElement>(null);

  const hidden = HIDE_ON.some(p => loc === p || loc.startsWith(p + "/"));

  // This bar pins to the very bottom of every page it's not hidden on —
  // including both dashboards and any page the chat bubble is open on. Other
  // fixed-to-bottom UI (ChatWidget's bubble/panel, the dashboards' toast)
  // used to assume nothing else lived down there, so when both were visible
  // at once the higher-zIndex element visually cut into this bar's orange
  // strip — the exact "overlapping button" look reported for the notification
  // bell. Publishing the bar's real height as a CSS var lets that UI shift up
  // to clear it instead. Re-measured on show/hide and on resize (the text
  // wraps to two lines on narrow screens, which changes the height).
  useEffect(() => {
    const setH = () => {
      document.documentElement.style.setProperty(
        "--ff-fsb-h", show && barRef.current ? barRef.current.offsetHeight + "px" : "0px"
      );
    };
    setH();
    if (!show) return;
    window.addEventListener("resize", setH);
    return () => window.removeEventListener("resize", setH);
  }, [show]);

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) { if (alive) setShow(false); return; }
        // Shared session-scoped read (src/lib/myProfile.ts). This fired on
        // EVERY route change to ask a question whose answer only ever flips
        // once, at the moment onboarding completes — and that path signs the
        // cache out from under itself, so the banner still disappears on time.
        const p = await getMyProfile(user.id);
        if (!alive) return;
        if (p.ok && !p.exists) {
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
    <div ref={barRef} style={bar} role="status">
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
