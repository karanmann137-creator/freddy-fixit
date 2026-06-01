import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

const NAV_LINKS: { label: string; to: string; accent?: boolean }[] = [];

export default function TopNav() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  // Track auth state ONLY here — never call other supabase methods inside the
  // onAuthStateChange callback (it holds the auth lock and would deadlock).
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user);
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Role lookup outside the auth callback.
  useEffect(() => {
    if (!userId) { setRole(null); return; }
    let cancelled = false;
    supabase.from("profiles").select("role").eq("id", userId).single()
      .then(({ data }) => { if (!cancelled) setRole(data?.role ?? null); });
    return () => { cancelled = true; };
  }, [userId]);

  // Notifications: initial fetch + realtime inserts.
  useEffect(() => {
    if (!userId) { setNotifs([]); setUnread(0); return; }
    let active = true;
    supabase.from("notifications").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(15)
      .then(({ data }) => {
        if (!active) return;
        setNotifs(data ?? []);
        setUnread((data ?? []).filter((n: any) => !n.read_at).length);
      });
    const channel = supabase.channel("notif:" + userId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + userId },
        (payload: any) => { setNotifs(prev => [payload.new, ...prev].slice(0, 30)); setUnread(u => u + 1); })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [userId]);

  const logOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  const dashboardPath =
    role === "admin" ? "/admin-dashboard" :
    role === "contractor" ? "/contractor-dashboard" :
    "/client-dashboard";

  const toggleBell = async () => {
    const next = !bellOpen;
    setBellOpen(next);
    if (next && unread > 0 && userId) {
      setUnread(0);
      setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("user_id", userId).is("read_at", null);
    }
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
        .ff-notif:hover { background: rgba(255,255,255,.06) !important; }
        @media (max-width: 560px) {
          .ff-nav-wrap { padding: .7rem .9rem !important; }
          .ff-brand { font-size: 1.4rem !important; }
          .ff-nav-btn { padding: .4rem .75rem !important; font-size: .72rem !important; }
        }
      `}</style>

      <div className="ff-brand" style={brand} onClick={() => setLocation("/")}>FREDDYFIXIT</div>

      <div style={right}>
        {NAV_LINKS.map(l => (
          <button key={l.to} onClick={() => setLocation(l.to)}
            className={`ff-nav-btn ${l.accent ? "ff-nav-btn-accent" : "ff-nav-btn-ghost"}`}
            style={{ ...btn, ...(l.accent ? accentBtn : ghostBtn) }}>
            {l.label}
          </button>
        ))}

        {authed && (
          <div style={{ position: "relative" }}>
            <button onClick={toggleBell} aria-label="Notifications"
              className="ff-nav-btn ff-nav-btn-ghost"
              style={{ ...btn, ...ghostBtn, padding: ".5rem .7rem", position: "relative" }}>
              🔔
              {unread > 0 && (
                <span style={{ position: "absolute", top: "-4px", right: "-4px", background: "#ef4444", color: "#fff", borderRadius: "999px", fontSize: ".62rem", fontWeight: 700, minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + .5rem)", width: "320px", maxHeight: "380px", overflowY: "auto", background: "#1f2940", border: "1px solid rgba(255,255,255,.12)", borderRadius: "12px", boxShadow: "0 12px 40px rgba(0,0,0,.45)", padding: ".4rem", zIndex: 200 }}>
                {notifs.length === 0 && (
                  <div style={{ padding: "1rem", fontSize: ".85rem", color: "rgba(190,205,235,.5)", textAlign: "center" }}>No notifications yet.</div>
                )}
                {notifs.map(n => (
                  <div key={n.id} className="ff-notif" onClick={() => { setBellOpen(false); setLocation(dashboardPath); }}
                    style={{ padding: ".7rem .8rem", borderRadius: "8px", cursor: "pointer", background: n.read_at ? "transparent" : "rgba(234,107,20,.08)" }}>
                    <div style={{ fontSize: ".85rem", fontWeight: 600, color: "#f0f4ff", marginBottom: ".15rem" }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: ".78rem", color: "rgba(190,205,235,.7)", lineHeight: 1.4 }}>{n.body}</div>}
                    <div style={{ fontSize: ".68rem", color: "rgba(190,205,235,.4)", marginTop: ".25rem" }}>{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {authed ? (
          <>
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
