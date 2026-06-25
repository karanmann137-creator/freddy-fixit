import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

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
    // Slow poll as a safety net if the socket drops.
    const t = setInterval(load, 120000);
    return () => { clearInterval(t); supabase.removeChannel(channel); };
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
    setLocation(dashboardPath);
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
        onClick={() => { const next = !open; setOpen(next); if (next) load(); }}
        aria-label="Notifications"
        style={{
          position: "relative", width: 40, height: 40, borderRadius: "999px",
          background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(240,244,255,.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 4px",
            borderRadius: "999px", background: "#ea6b14", color: "#fff", fontSize: ".68rem",
            fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 0 2px #1a2236",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 48, right: 0, width: 320, maxHeight: 420, overflowY: "auto",
          background: "#151d2e", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14,
          boxShadow: "0 18px 50px rgba(0,0,0,.5)", zIndex: 200, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: ".8rem 1rem", borderBottom: "1px solid rgba(255,255,255,.08)",
          }}>
            <span style={{ color: "#f0f4ff", fontWeight: 600, fontSize: ".92rem" }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                background: "none", border: "none", color: "#ea6b14", cursor: "pointer",
                fontSize: ".78rem", fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              }}>Mark all read</button>
            )}
          </div>

          {notes.length === 0 ? (
            <div style={{ padding: "1.6rem 1rem", textAlign: "center", color: "rgba(240,244,255,.5)", fontSize: ".85rem" }}>
              You're all caught up.
            </div>
          ) : (
            notes.map(n => (
              <button
                key={n.id}
                onClick={() => openNote(n)}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  padding: ".75rem 1rem", border: "none", borderBottom: "1px solid rgba(255,255,255,.05)",
                  background: n.read_at ? "transparent" : "rgba(234,107,20,.08)",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                  {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: "999px", background: "#ea6b14", flexShrink: 0 }} />}
                  <span style={{ color: "#f0f4ff", fontWeight: 600, fontSize: ".85rem", flex: 1 }}>{n.title ?? "Update"}</span>
                  <span style={{ color: "rgba(240,244,255,.4)", fontSize: ".7rem", flexShrink: 0 }}>{timeAgo(n.created_at)}</span>
                </div>
                {n.body && <div style={{ color: "rgba(240,244,255,.65)", fontSize: ".8rem", marginTop: ".25rem", lineHeight: 1.4 }}>{n.body}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
