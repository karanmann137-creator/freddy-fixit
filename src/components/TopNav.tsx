import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import NotificationBell from "@/components/NotificationBell";

// Right-side links shown to everyone. Add more here later — each appears automatically.
const NAV_LINKS: { label: string; to: string; accent?: boolean }[] = [
  { label: "Blog", to: "/blog" },
];

export default function TopNav() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

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

  const logOut = async () => {
    // Clear local auth state and navigate first so the UI always responds,
    // even if the network signOut is slow or the session is already wedged.
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
        {authed ? (
          <>
            {uid && <NotificationBell userId={uid} dashboardPath={dashboardPath} />}
            <button onClick={() => setLocation(dashboardPath)} className="ff-nav-btn ff-nav-btn-accent" style={{ ...btn, ...accentBtn }}>My Dashboard</button>
            <button onClick={logOut} className="ff-nav-btn ff-nav-btn-ghost" style={{ ...btn, ...ghostBtn }}>Log out</button>
          </>
        ) : (
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
