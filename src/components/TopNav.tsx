import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

// Right-side links. Add more clickable sections here later — each appears automatically.
const NAV_LINKS: { label: string; to: string; accent?: boolean }[] = [
  { label: "Browse Contractors", to: "/contractors", accent: true },
];

export default function TopNav() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const logOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  return (
    <div className="ff-nav-wrap" style={wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        .ff-nav-wrap { pointer-events: none; }
        .ff-nav-wrap > * { pointer-events: auto; }
        .ff-brand { transition: transform .18s ease; }
        .ff-brand:hover { transform: scale(1.08); }
        .ff-nav-btn { transition: background .2s ease, color .2s ease, border-color .2s ease; }
        .ff-nav-btn-ghost:hover { background: rgba(255,255,255,.12); color: #f0f4ff; }
        .ff-nav-btn-accent:hover { background: #f5781f; }
        @media (max-width: 560px) {
          .ff-nav-wrap { padding: .7rem .9rem !important; }
          .ff-brand { font-size: 1.4rem !important; }
          .ff-nav-btn { padding: .4rem .75rem !important; font-size: .72rem !important; }
        }
      `}</style>

      <div className="ff-brand" style={brand} onClick={() => setLocation("/")}>FREDDYFIXIT</div>

      <div style={right}>
        {NAV_LINKS.map(l => (
          <button
            key={l.to}
            onClick={() => setLocation(l.to)}
            className={`ff-nav-btn ${l.accent ? "ff-nav-btn-accent" : "ff-nav-btn-ghost"}`}
            style={{ ...btn, ...(l.accent ? accentBtn : ghostBtn) }}
          >
            {l.label}
          </button>
        ))}
        {authed
          ? <button onClick={logOut} className="ff-nav-btn ff-nav-btn-ghost" style={{ ...btn, ...ghostBtn }}>Log out</button>
          : <button onClick={() => setLocation("/login")} className="ff-nav-btn ff-nav-btn-ghost" style={{ ...btn, ...ghostBtn }}>Sign In</button>}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "1rem 1.5rem", fontFamily: "'DM Sans', sans-serif",
};
const brand: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.75rem", letterSpacing: ".04em",
  color: "#ea6b14", cursor: "pointer", lineHeight: 1, userSelect: "none",
  textShadow: "0 0 18px rgba(234,107,20,.4)",
};
const right: React.CSSProperties = { display: "flex", gap: ".6rem", alignItems: "center" };
const btn: React.CSSProperties = {
  padding: ".55rem 1.1rem", borderRadius: "999px", fontSize: ".85rem",
  fontWeight: 500, cursor: "pointer", border: "1px solid", fontFamily: "'DM Sans', sans-serif",
};
const accentBtn: React.CSSProperties = { background: "#ea6b14", color: "#fff", borderColor: "#ea6b14" };
const ghostBtn: React.CSSProperties = { background: "rgba(255,255,255,.05)", color: "rgba(240,244,255,.8)", borderColor: "rgba(255,255,255,.12)" };
