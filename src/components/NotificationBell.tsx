import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import {
  noteTarget, targetToUrl, DASH_NAV_EVENT, type DashNavDetail,
} from "@/lib/notificationRoutes";

type Note = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  job_id: string | null;
  read_at: string | null;
  created_at: string;
};

// Bell + unread badge shown in the top nav for signed-in users.
// Reads the `notifications` table (RLS already scopes rows to the user).
export default function NotificationBell({ userId, dashboardPath }: { userId: string; dashboardPath: string }) {
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Where the dropdown renders. The bell lives in very different spots —
  // top-right in TopNav's menu, bottom of a left sidebar on desktop, bottom
  // of a narrow icon rail or a mobile drawer footer — but the panel used to
  // be hardcoded to top:64/right:10, which only matched the first of those.
  // Everywhere else it popped up disconnected from the button that opened
  // it and landed on top of whatever else was near that screen corner.
  // Computed fresh from the button's own position each time it opens.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>({
    top: 64, left: 10, maxHeight: 420,
  });

  const positionDropdown = () => {
    const el = wrapRef.current;
    if (!el) return;
    const margin = 10, gap = 8, panelW = 320;
    const r = el.getBoundingClientRect();
    let left = r.right - panelW;
    if (left < margin) left = margin;
    if (left + panelW + margin > window.innerWidth) left = window.innerWidth - panelW - margin;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    // Open upward when there isn't much room below (a sidebar-footer bell
    // sits near the bottom of the viewport) and there's more room above.
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    setPos(openUp
      ? { bottom: window.innerHeight - r.top + gap, left, maxHeight: Math.max(160, Math.min(420, spaceAbove - margin)) }
      : { top: r.bottom + gap, left, maxHeight: Math.max(160, Math.min(420, spaceBelow - margin)) });
  };

  // Keep the panel anchored to the button across resizes while it's open
  // (e.g. rotating a phone, or the sidebar collapsing/expanding).
  useEffect(() => {
    if (!open) return;
    const onResize = () => positionDropdown();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotes((data as Note[]) ?? []);
  };

  useEffect(() => {
    load();
    // Realtime: refresh the instant a notification is inserted/updated for me.
    const channel = supabase.channel("notif:" + userId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load())
      .subscribe();
    // Slow poll as a safety net if the socket drops. Skipped while the tab is
    // hidden: a backgrounded tab left open all day was firing this query every
    // two minutes forever, for a badge nobody was looking at, and a person with
    // several dashboard tabs open multiplied it. Nothing is lost, because a
    // dropped socket only matters once you can see the badge again — so
    // becoming visible triggers an immediate catch-up read.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 120000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as any)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const unread = notes.filter(n => !n.read_at).length;

  const markAllRead = async () => {
    const ids = notes.filter(n => !n.read_at).map(n => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setNotes(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  };

  const openNote = async (n: Note) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      setNotes(prev => prev.map(x => (x.id === n.id ? { ...x, read_at: now } : x)));
      await supabase.from("notifications").update({ read_at: now }).eq("id", n.id);
    }
    setOpen(false);

    // Where this notification actually lives — usually a tab (and sometimes a
    // specific job) on the viewer's dashboard, occasionally a dedicated page.
    const target = noteTarget(n.type, n.job_id, dashboardPath);

    // Wouter treats navigating to the path you're already on as a no-op, and the
    // bell usually sits on the very dashboard the notification points at. So when
    // we're already there, tell the page directly instead of navigating.
    if (window.location.pathname === target.path) {
      if (target.tab || target.jobId) {
        const detail: DashNavDetail = { tab: target.tab, jobId: target.jobId };
        window.dispatchEvent(new CustomEvent(DASH_NAV_EVENT, { detail }));
      } else {
        // Unknown types fall back to the dashboard root with no tab and no job, and
        // wouter no-ops on same-path navigation — so this used to be a dead tap that
        // only closed the dropdown. Scrolling to the top at least acknowledges it.
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    setLocation(targetToUrl(target));
  };

  const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24);
    return d + "d ago";
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => { const next = !open; setOpen(next); if (next) { load(); positionDropdown(); } }}
        aria-label="Notifications"
        style={{
          position: "relative", width: 40, height: 40, borderRadius: "999px",
          background: "rgba(var(--ff-fg), .05)", border: "1px solid rgba(var(--ff-fg), .12)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--ff-fg), .85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 4px",
            borderRadius: "999px", background: "#ea6b14", color: "#fff", fontSize: ".68rem",
            fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 0 2px var(--ff-bg)",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left,
          width: "min(320px, calc(100vw - 20px))",
          maxHeight: pos.maxHeight, overflowY: "auto",
          background: "var(--ff-surface)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: 14,
          boxShadow: "0 18px 50px rgba(0,0,0,.5)", zIndex: 200, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: ".8rem 1rem", borderBottom: "1px solid rgba(var(--ff-fg), .08)",
          }}>
            <span style={{ color: "var(--ff-text)", fontWeight: 600, fontSize: ".92rem" }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                background: "none", border: "none", color: "#ea6b14", cursor: "pointer",
                fontSize: ".78rem", fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              }}>Mark all read</button>
            )}
          </div>

          {notes.length === 0 ? (
            <div style={{ padding: "1.6rem 1rem", textAlign: "center", color: "rgba(var(--ff-fg), .5)", fontSize: ".85rem" }}>
              You're all caught up.
            </div>
          ) : (
            notes.map(n => (
              <button
                key={n.id}
                onClick={() => openNote(n)}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  padding: ".75rem 1rem", border: "none", borderBottom: "1px solid rgba(var(--ff-fg), .05)",
                  background: n.read_at ? "transparent" : "rgba(234,107,20,.08)",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                  {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: "999px", background: "#ea6b14", flexShrink: 0 }} />}
                  <span style={{ color: "var(--ff-text)", fontWeight: 600, fontSize: ".85rem", flex: 1 }}>{n.title ?? "Update"}</span>
                  <span style={{ color: "rgba(var(--ff-fg), .4)", fontSize: ".7rem", flexShrink: 0 }}>{timeAgo(n.created_at)}</span>
                </div>
                {n.body && <div style={{ color: "rgba(var(--ff-fg), .65)", fontSize: ".8rem", marginTop: ".25rem", lineHeight: 1.4 }}>{n.body}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
