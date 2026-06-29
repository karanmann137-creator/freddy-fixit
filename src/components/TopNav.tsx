import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import NotificationBell from "@/components/NotificationBell";

const CONTACT_EMAIL = "hello@freddyfixit.ca";

// Right-side links shown to everyone. Add more here later — each appears automatically.
const NAV_LINKS: { label: string; to: string; accent?: boolean }[] = [
  { label: "Blog", to: "/blog" },
];

export default function TopNav() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = async (userId: string | null) => {
      setUid(userId);
      if (!userId) { setAuthed(false); setRole(null); return; }
      setAuthed(true);
      const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
      setRole(data?.role ?? null);
    };
    supabase.auth.getUser().then(({ data }) => sync(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      // CRITICAL: never call Supabase queries directly inside this callback.
      // The callback runs while the auth lock is held; a query here waits for
      // that same lock and deadlocks every later getUser/getSession/signOut
      // (symptom: dashboards spin forever, log out does nothing). Defer with
      // setTimeout so the callback returns and releases the lock first.
      const uid = session?.user?.id ?? null;
      setTimeout(() => { sync(uid); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Close the menu when clicking/tapping outside of it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const logOut = async () => {
    // Clear local auth state and navigate first so the UI always responds,
    // even if the network signOut is slow or the session is already wedged.
    setMenuOpen(false);
    setAuthed(false);
    setRole(null);
    setLocation("/");
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.error("signOut failed:", err);
    }
  };

  const dashboardPath =
    role === "admin" ? "/admin-dashboard" :
    role === "contractor" ? "/contractor-dashboard" :
    "/client-dashboard";

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
        .ff-menu-item:hover { background: rgba(255,255,255,.06); }
        @media (max-width: 560px) {
          .ff-nav-wrap { padding: .7rem .9rem !important; }
          .ff-brand { font-size: 1.4rem !important; }
          .ff-nav-btn { padding: .4rem .75rem !important; font-size: .72rem !important; }
        }
      `}</style>

      <div className="ff-brand" style={brand} onClick={() => setLocation("/")}>FREDDYFIXIT</div>

      <div style={right}>
        {/* Blog stays visible outside the menu on every screen size. */}
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

        {authed ? (
          // Logged in: collapse account actions into a menu button.
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
              className="ff-nav-btn ff-nav-btn-accent"
              style={{ ...btn, ...accentBtn, display: "inline-flex", alignItems: "center", gap: ".45rem" }}
            >
              <span style={{ display: "inline-flex", flexDirection: "column", gap: "3px" }}>
                <span style={hbar} /><span style={hbar} /><span style={hbar} />
              </span>
              Menu
            </button>
            {menuOpen && (
              <div style={menuPanel}>
                {/* Notifications — the real bell, so its dropdown actually opens. */}
                {uid && (
                  <div style={menuRow}>
                    <NotificationBell userId={uid} dashboardPath={dashboardPath} />
                    <span style={{ color: "rgba(240,244,255,.85)", fontSize: ".9rem" }}>Notifications</span>
                  </div>
                )}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="ff-menu-item"
                  style={menuItem}
                  onClick={() => setMenuOpen(false)}
                >
                  Contact us
                </a>
                <button
                  onClick={logOut}
                  className="ff-menu-item"
                  style={{ ...menuItem, color: "#ff9a6b" }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          // Logged out: simple two-button header, no menu.
          <button onClick={() => setLocation("/login")} className="ff-nav-btn ff-nav-btn-ghost" style={{ ...btn, ...ghostBtn }}>Sign In</button>
        )}
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
const hbar: React.CSSProperties = { width: "16px", height: "2px", borderRadius: "2px", background: "currentColor", display: "block" };
const menuPanel: React.CSSProperties = {
  position: "absolute", top: "calc(100% + .5rem)", right: 0, minWidth: "200px",
  background: "#151d2e", border: "1px solid rgba(255,255,255,.12)", borderRadius: "14px",
  padding: ".4rem", boxShadow: "0 14px 40px rgba(0,0,0,.45)", zIndex: 200,
  display: "flex", flexDirection: "column", gap: ".15rem",
};
const menuRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: ".5rem",
  padding: ".35rem .5rem", borderRadius: "10px",
};
const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: ".6rem .7rem", borderRadius: "10px", border: "none",
  background: "transparent", color: "rgba(240,244,255,.85)",
  fontSize: ".9rem", fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
  textDecoration: "none", boxSizing: "border-box",
};
