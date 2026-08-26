import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { getMyProfile } from "@/lib/myProfile";
import NotificationBell from "@/components/NotificationBell";
import SettingsModal from "@/components/SettingsModal";
import { Ic } from "@/components/Ic";

const CONTACT_EMAIL = "hello@freddyfixit.ca";

// Right-side links shown to everyone. Add more here later — each appears automatically.
//
// `small: false` drops a link on narrow phones. The header is a fixed row with
// the wordmark on one side and everything else on the other, so every link
// added here eats width that Sign In needs. About us earns its place — it is
// the page a first-time visitor goes looking for before they trust us with
// their address — and Blog is one scroll away in the footer, so Blog is the
// one that steps aside.
const NAV_LINKS: { label: string; to: string; accent?: boolean; small?: boolean }[] = [
  { label: "About us", to: "/about" },
  { label: "Blog", to: "/blog", small: false },
];

export default function TopNav() {
  const [loc, setLocation] = useLocation();
  // On the client/contractor dashboards the account actions live in the left
  // sidebar, so hide the top-right Menu there (SettingsModal stays mounted so
  // the sidebar's Settings action can still open it via ff:open-settings).
  const onSidebarDash = loc === "/client-dashboard" || loc === "/contractor-dashboard" || loc === "/admin-dashboard";
  // During onboarding, keep people focused: logo only — no Blog link, no Sign In,
  // no Menu (SettingsModal stays mounted for ff:open-settings).
  const onOnboarding = ["/client-onboarding", "/contractor-onboarding"].some(p => loc === p || loc.startsWith(p + "/"));
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener("ff:open-settings", open);
    return () => window.removeEventListener("ff:open-settings", open);
  }, []);

  // Scroll state. Home makes the bar transparent while it sits over the hero
  // (a solid bar there cuts a hard seam across the hero's radial glow), so the
  // nav needs to know when it has left the top. Run once on mount too — a
  // refresh restores scroll position without ever firing a scroll event.
  const [lifted, setLifted] = useState(false);
  // On the dashboards only, the bar also hides itself on scroll-down and
  // reappears on scroll-up — dashboards are long lists (jobs, messages,
  // earnings) where the logo/About us/Blog row is the least useful thing on
  // screen once you're scrolling through content, and the left sidebar
  // already carries the account actions. Elsewhere (marketing pages) the bar
  // stays put the whole time, since it's the primary way to navigate the site.
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setLifted(y > 12);
      if (onSidebarDash) {
        const dy = y - lastScrollY.current;
        if (y < 40) setNavHidden(false);
        else if (dy > 4) setNavHidden(true);
        else if (dy < -4) setNavHidden(false);
      } else {
        setNavHidden(false);
      }
      lastScrollY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onSidebarDash]);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = async (userId: string | null) => {
      setUid(userId);
      if (!userId) { setAuthed(false); setRole(null); return; }
      setAuthed(true);
      // Shared session-scoped read (src/lib/myProfile.ts). This used to be a
      // direct profiles query, which re-ran on every onAuthStateChange —
      // including the periodic TOKEN_REFRESHED — for an answer that never
      // changes while you stay signed in. An orphaned account has no profile
      // row and a failed read leaves role null, which the nav already handles.
      const p = await getMyProfile(userId);
      setRole(p.role);
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
    // ff-on-dark: navy in dark mode (unchanged), off-white in light mode
    // (2026-08-24 — the class's forced-navy values are now dark-mode-only in
    // main.tsx, so in light mode this is a no-op and the bar just paints
    // var(--ff-bg), matching the page ground). Kept on the wrapper anyway so
    // dark mode's cascade is untouched and nothing has to change here.
    <>
    <div className={`ff-nav-wrap ff-on-dark${lifted ? " ff-nav-lifted" : ""}${navHidden ? " ff-nav-hidden" : ""}`} style={wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        .ff-nav-wrap { pointer-events: none; }
        .ff-nav-wrap > * { pointer-events: auto; }
        /* Once lifted the bar is an opaque slab over real body content, so it
           has to swallow clicks — otherwise a tap on the navy lands on a link
           the user cannot see. Unlifted it is transparent (Home), where
           passing clicks through is exactly right. 0,2,0 beats the rule above
           regardless of sheet order. */
        .ff-nav-wrap.ff-nav-lifted { pointer-events: auto; }
        .ff-brand { transition: transform .18s ease; }
        .ff-brand:hover { transform: scale(1.08); }
        .ff-nav-btn { transition: background .2s ease, color .2s ease, border-color .2s ease; }
        .ff-nav-btn-ghost:hover { background: rgba(var(--ff-fg), .12); color: var(--ff-text); }
        .ff-nav-btn-accent:hover { background: #f5781f; }
        .ff-menu-item:hover { background: rgba(var(--ff-fg), .06); }
        @media (max-width: 560px) {
          .ff-nav-wrap { padding: .7rem .9rem !important; }
          .ff-brand { font-size: 1.4rem !important; }
          .ff-nav-btn { padding: .4rem .75rem !important; font-size: .72rem !important; }
        }
        @media (max-width: 460px) { .ff-nav-small-hide { display: none !important; } }
      `}</style>

      <div className="ff-brand" style={brand} onClick={() => setLocation("/")}>FREDDYFIXIT</div>

      <div style={right}>
        {/* Public links sit outside the menu, so they're one tap rather than two
            (hidden during onboarding, where the whole point is to keep people
            moving forward). Blog collapses under 460px — see NAV_LINKS. */}
        {!onOnboarding && NAV_LINKS.map(l => (
          <button
            key={l.to}
            onClick={() => setLocation(l.to)}
            className={`ff-nav-btn ${l.accent ? "ff-nav-btn-accent" : "ff-nav-btn-ghost"}${l.small === false ? " ff-nav-small-hide" : ""}`}
            style={{ ...btn, ...(l.accent ? accentBtn : ghostBtn) }}
          >
            {l.label}
          </button>
        ))}

        {onOnboarding ? (
          // Onboarding: no account controls — just the settings gear (theme/text size).
          <button aria-label="Settings" onClick={() => setSettingsOpen(true)} className="ff-nav-btn ff-nav-btn-ghost" style={{ ...btn, ...ghostBtn, padding:".5rem", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        ) : authed && onSidebarDash ? (
          // Dashboard: account actions live in the left sidebar — no top-right Menu.
          null
        ) : authed ? (
          // Logged in: collapse account actions into a menu button.
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
              className="ff-nav-btn ff-nav-btn-accent"
              style={{ ...btn, ...accentBtn, display: "inline-flex", alignItems: "center", gap: ".45rem" }}
            >
              <Ic name="menu" size={16} />
              Menu
            </button>
            {menuOpen && (
              <div style={menuPanel}>
                {/* Notifications — the real bell, so its dropdown actually opens. */}
                {uid && (
                  <div style={menuRow}>
                    <NotificationBell userId={uid} dashboardPath={dashboardPath} />
                    <span style={{ color: "rgba(var(--ff-fg), .85)", fontSize: ".9rem" }}>Notifications</span>
                  </div>
                )}
                <button
                  onClick={() => { setMenuOpen(false); setLocation(dashboardPath); }}
                  className="ff-menu-item"
                  style={menuItem}
                >
                  My Dashboard
                </button>
                {/* No "Call us" row here any more. The number still lives in
                    the footer on every page, so nobody loses the phone line —
                    it just stops being the loudest thing in the header. */}
                <button
                  onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("ff:open-chat")); }}
                  className="ff-menu-item"
                  style={menuItem}
                >
                  Chat with us
                </button>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="ff-menu-item"
                  style={menuItem}
                  onClick={() => setMenuOpen(false)}
                >
                  Email us
                </a>
                <button
                  onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
                  className="ff-menu-item"
                  style={menuItem}
                >
                  Settings
                </button>
                <button
                  onClick={logOut}
                  className="ff-menu-item"
                  style={{ ...menuItem, color: "#ea6b14" }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          // Logged out: simple header — gear + Sign In.
          <>
            <button aria-label="Settings" onClick={() => setSettingsOpen(true)} className="ff-nav-btn ff-nav-btn-ghost" style={{ ...btn, ...ghostBtn, padding:".5rem", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button onClick={() => setLocation("/login")} className="ff-nav-btn ff-nav-btn-ghost" style={{ ...btn, ...ghostBtn }}>Sign In</button>
          </>
        )}
      </div>

    </div>

    {/* Deliberately OUTSIDE ff-on-dark. It lives in the nav only because the
        gear that opens it does; it is a full-screen page-level modal, and
        inheriting the nav's dark tokens would render it navy while the rest
        of the page is light. The dropdown menu above stays inside on purpose
        — that one really is nav chrome. */}
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} role={(authed ? (role as any) : null)} />
    </>
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
};
const right: React.CSSProperties = { display: "flex", gap: ".6rem", alignItems: "center" };
const btn: React.CSSProperties = {
  padding: ".55rem 1.1rem", borderRadius: "999px", fontSize: ".85rem",
  fontWeight: 500, cursor: "pointer", border: "1px solid", fontFamily: "'DM Sans', sans-serif",
};
const accentBtn: React.CSSProperties = { background: "#ea6b14", color: "#fff", borderColor: "#ea6b14" };
const ghostBtn: React.CSSProperties = { background: "rgba(var(--ff-fg), .05)", color: "rgba(var(--ff-fg), .8)", borderColor: "rgba(var(--ff-fg), .12)" };
const menuPanel: React.CSSProperties = {
  position: "absolute", top: "calc(100% + .5rem)", right: 0, minWidth: "200px",
  background: "var(--ff-surface)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "14px",
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
  background: "transparent", color: "rgba(var(--ff-fg), .85)",
  fontSize: ".9rem", fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
  textDecoration: "none", boxSizing: "border-box",
};
