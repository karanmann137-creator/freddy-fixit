import { useLocation } from "wouter";

// Top-right navigation links. Add more clickable sections here later —
// each entry appears automatically. Set accent: true for the orange CTA style.
const NAV_LINKS: { label: string; to: string; accent?: boolean }[] = [
  { label: "Browse Contractors", to: "/contractors", accent: true },
  { label: "Sign In", to: "/login" },
];

export default function TopNav() {
  const [, setLocation] = useLocation();
  return (
    <div className="ff-nav-wrap" style={wrap}>
      <style>{`
        .ff-nav-btn { transition: background .2s ease, color .2s ease, border-color .2s ease; }
        .ff-nav-btn-ghost:hover { background: rgba(255,255,255,.12); color: #f0f4ff; }
        .ff-nav-btn-accent:hover { background: #f5781f; }
        @media (max-width: 520px) {
          .ff-nav-wrap { gap: .4rem !important; padding: .8rem !important; }
          .ff-nav-btn { padding: .45rem .8rem !important; font-size: .75rem !important; }
        }
      `}</style>
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
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed", top: 0, right: 0, zIndex: 100,
  display: "flex", gap: ".6rem", padding: "1.1rem 1.25rem",
  fontFamily: "'DM Sans', sans-serif",
};
const btn: React.CSSProperties = {
  padding: ".55rem 1.1rem", borderRadius: "999px", fontSize: ".85rem",
  fontWeight: 500, cursor: "pointer", border: "1px solid", fontFamily: "inherit",
};
const accentBtn: React.CSSProperties = { background: "#ea6b14", color: "#fff", borderColor: "#ea6b14" };
const ghostBtn: React.CSSProperties = { background: "rgba(255,255,255,.05)", color: "rgba(240,244,255,.8)", borderColor: "rgba(255,255,255,.12)" };
