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
    width: "min(230px, 76vw)",
    background: "#1a2236",
    border: "1px solid rgba(234,107,20,.55)",
    borderRadius: "12px",
    padding: "0.85rem 0.9rem 0.8rem",
    color: "#f0f4ff",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 12px 40px rgba(0,0,0,.5)",
    zIndex: 10000,
    animation: "ff-tip-in .35s ease both",
  };
  const closeBtn = {
    position: "absolute" as const, top: 4, right: 6, background: "none", border: "none",
    color: "rgba(240,244,255,.5)", fontSize: "1rem", lineHeight: 1, cursor: "pointer", padding: 2,
  };
  const title = { fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.05rem", letterSpacing: ".03em", margin: "0 0 .15rem", color: "#ea6b14" };
  const body = { margin: 0, fontSize: ".82rem", lineHeight: 1.35, color: "rgba(240,244,255,.85)" };
  const action = {
    marginTop: ".55rem", background: "linear-gradient(135deg, #ea6b14, #f09020)", border: "none",
    color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: ".8rem",
    padding: ".38rem .8rem", borderRadius: "7px", cursor: "pointer",
  };
  // Small triangle pointer toward the target element.
  const arrow = (extra: any) => ({
    position: "absolute" as const, width: 0, height: 0, ...extra,
  });

  return (
    <>
      {showSettings && (
        <div style={{ ...box, top: "4.3rem", right: "0.8rem" }} role="dialog" aria-label="Customize tip">
          {/* pointer up toward the gear */}
          <span style={arrow({ top: -8, right: 16, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "8px solid #1a2236" })} />
          <button aria-label="Dismiss" style={closeBtn} onClick={() => setShowSettings(false)}>×</button>
          <p style={title}>Customize</p>
          <p style={body}>Change the theme, text size and more from Settings — up here.</p>
          <button style={action} onClick={() => { emit("ff:open-settings"); setShowSettings(false); }}>Open settings</button>
        </div>
      )}

      {showChat && (
        <div style={{ ...box, bottom: "6rem", right: "1.5rem" }} role="dialog" aria-label="Chat tip">
          {/* pointer down toward the chat bubble */}
          <span style={arrow({ bottom: -8, right: 14, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "8px solid #1a2236" })} />
          <button aria-label="Dismiss" style={closeBtn} onClick={() => setShowChat(false)}>×</button>
          <p style={title}>Got a question?</p>
          <p style={body}>Chat with Freddy anytime — booking help, pricing, or anything else.</p>
          <button style={action} onClick={() => { emit("ff:open-chat"); setShowChat(false); }}>Ask a question</button>
        </div>
      )}

      <style>{"@keyframes ff-tip-in { from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: none; } }"}</style>
    </>
  );
}
