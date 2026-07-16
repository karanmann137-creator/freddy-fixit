import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

// First-visit coach marks for logged-OUT visitors only. Two small boxes that
// point at (1) the Settings gear in the top-right nav and (2) the chat bubble
// in the bottom-right. Shown once ever (localStorage), never for signed-in users.
const SEEN_KEY = "ff_seen_intro_tips";

// Don't distract on auth / onboarding / dashboard routes — just marketing pages.
const HIDE_ON = [
  "/login", "/auth", "/update-password", "/get-a-quote",
  "/client-onboarding", "/contractor-onboarding",
  "/client-dashboard", "/contractor-dashboard", "/admin-dashboard",
];

export default function IntroTips() {
  const [location] = useLocation();
  const [show, setShow] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [showChat, setShowChat] = useState(true);

  const routeHidden = HIDE_ON.some(p => location === p || location.startsWith(p + "/"));

  useEffect(() => {
    let mounted = true;
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch {}
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) return;                 // signed in → never show
      setShow(true);
      try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  if (!show || routeHidden) return null;

  const emit = (name: string) => { try { window.dispatchEvent(new CustomEvent(name)); } catch {} };

  const box = {
    position: "fixed" as const,
    width: "min(180px, 64vw)",
    background: "#1a2236",
    border: "1px solid rgba(234,107,20,.55)",
    borderRadius: "11px",
    padding: "0.65rem 0.7rem 0.6rem",
    color: "#f0f4ff",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 10px 32px rgba(0,0,0,.5)",
    zIndex: 10000,
  };
  const closeBtn = {
    position: "absolute" as const, top: 3, right: 5, background: "none", border: "none",
    color: "rgba(240,244,255,.5)", fontSize: ".9rem", lineHeight: 1, cursor: "pointer", padding: 2,
  };
  const title = { fontFamily: "'Bebas Neue', sans-serif", fontSize: ".95rem", letterSpacing: ".03em", margin: "0 0 .1rem", color: "#ea6b14" };
  const body = { margin: 0, fontSize: ".73rem", lineHeight: 1.35, color: "rgba(240,244,255,.85)" };
  const action = {
    marginTop: ".45rem", background: "linear-gradient(135deg, #ea6b14, #f09020)", border: "none",
    color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: ".72rem",
    padding: ".3rem .65rem", borderRadius: "7px", cursor: "pointer",
  };
  // Small triangle pointer toward the target element.
  const arrow = (extra: any) => ({
    position: "absolute" as const, width: 0, height: 0, ...extra,
  });

  return (
    <>
      {showSettings && (
        <div className="ff-tip ff-tip-a" style={{ ...box, top: "4.3rem", right: "0.8rem" }} role="dialog" aria-label="Customize tip">
          {/* pointer up toward the gear */}
          <span style={arrow({ top: -8, right: 16, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "8px solid #1a2236" })} />
          <button aria-label="Dismiss" style={closeBtn} onClick={() => setShowSettings(false)}>×</button>
          <p style={title}>Customize</p>
          <p style={body}>Change the theme, text size and more from Settings — up here.</p>
          <button style={action} onClick={() => { emit("ff:open-settings"); setShowSettings(false); }}>Open settings</button>
        </div>
      )}

      {showChat && (
        <div className="ff-tip ff-tip-b" style={{ ...box, bottom: "6rem", right: "1.5rem" }} role="dialog" aria-label="Chat tip">
          {/* pointer down toward the chat bubble */}
          <span style={arrow({ bottom: -8, right: 14, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "8px solid #1a2236" })} />
          <button aria-label="Dismiss" style={closeBtn} onClick={() => setShowChat(false)}>×</button>
          <p style={title}>Got a question?</p>
          <p style={body}>Chat with Freddy anytime — booking help, pricing, or anything else.</p>
          <button style={action} onClick={() => { emit("ff:open-chat"); setShowChat(false); }}>Ask a question</button>
        </div>
      )}

      <style>{
        ".ff-tip { animation: ff-tip-pop .55s cubic-bezier(.34,1.56,.64,1) both, ff-tip-bob 3.2s ease-in-out 1.4s infinite; }" +
        ".ff-tip-b { animation-delay: .55s, 2s; }" +
        "@keyframes ff-tip-pop { 0% { opacity: 0; transform: translateY(16px) scale(.6); } 65% { opacity: 1; transform: translateY(-4px) scale(1.04); } 100% { opacity: 1; transform: none; } }" +
        "@keyframes ff-tip-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }" +
        "@media (prefers-reduced-motion: reduce) { .ff-tip { animation: ff-tip-fade .3s ease both; } }" +
        "@keyframes ff-tip-fade { from { opacity: 0; } to { opacity: 1; } }"
      }</style>
    </>
  );
}
