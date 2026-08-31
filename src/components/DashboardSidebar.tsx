import { useState, useEffect } from "react";
import { Ic, type IconName } from "@/components/Ic";

export type SidebarItem = { key: string; label: string; icon: IconName; badge?: number };

const COLLAPSE_KEY = "ff_sidebar_collapsed";

// Reusable Supabase-style left navigation for the dashboards.
// Desktop: a sticky column with icon + label rows (active row gets an orange
// left accent) that can be collapsed to a slim icon rail via a toggle at the
// bottom (remembered in localStorage). Narrow screens: collapses to a slim icon
// rail; tapping the ☰ menu button expands a labelled drawer that closes on
// selection.
//
// This is NAVIGATION ONLY, deliberately. It used to carry a footer of account
// actions plus the notification bell, and on a narrow screen the rail and the
// drawer render SIMULTANEOUSLY — so the bell mounted twice, opening two
// `supabase.channel("notif:"+userId)` subscriptions and two polls, with two
// independent `open` states. Account actions now live once, in the TopNav gear.
// Don't reintroduce a footer here.
export default function DashboardSidebar({
  items, active, onSelect, title,
}: {
  items: SidebarItem[];
  active: string;
  onSelect: (key: string) => void;
  title?: string;
}) {
  const [narrow, setNarrow] = useState<boolean>(typeof window !== "undefined" ? window.innerWidth < 780 : false);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(
    typeof window !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1"
  );
  // Fixed-position label shown when hovering an icon in a collapsed/narrow rail
  // (rendered fixed so the rail's overflow can't clip it).
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const showTip = (e: React.MouseEvent, label: string, labels: boolean) => {
    if (labels) return; // labels visible → no tooltip needed
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 8 });
  };
  const hideTip = () => setTip(null);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 780);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c;
    try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* noop */ }
    return next;
  });


  const rowBase = (labels: boolean): React.CSSProperties => ({
    position:"relative" as const,
    display:"flex", alignItems:"center", gap:".7rem", width:"100%", textAlign:"left" as const,
    padding: labels ? ".62rem .8rem" : ".62rem 0", justifyContent: labels ? "flex-start" : "center",
    border:"none", cursor:"pointer", borderRadius:"10px",
    fontFamily:"'DM Sans',sans-serif", fontSize:".9rem",
    transition:"background .15s, color .15s",
  });

  const itemBtn = (it: SidebarItem, labels: boolean) => {
    const on = it.key === active;
    return (
      <button
        key={it.key}
        title={it.label}
        onClick={() => { onSelect(it.key); if (narrow) setExpanded(false); }}
        style={{
          ...rowBase(labels),
          background: on ? "rgba(234,107,20,.13)" : "transparent",
          color: on ? "#ea6b14" : "rgba(var(--ff-muted), .8)",
          fontWeight: on ? 600 : 500,
          boxShadow: on ? "inset 3px 0 0 #ea6b14" : "none",
        }}
        onMouseEnter={e => { if (!on) e.currentTarget.style.background = "rgba(var(--ff-fg), .05)"; showTip(e, it.label, labels); }}
        onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; hideTip(); }}
      >
        <Ic name={it.icon} size={18} color={on ? "#ea6b14" : "currentColor"} />
        {labels && <span style={{ whiteSpace:"nowrap" as const, flex:1 }}>{it.label}</span>}
        {labels && it.badge ? (
          <span style={{ marginLeft:"auto", fontSize:".7rem", fontWeight:700, minWidth:"18px", textAlign:"center" as const, padding:".05rem .35rem", borderRadius:"999px", background: on ? "rgba(234,107,20,.25)" : "rgba(var(--ff-fg), .1)", color: on ? "#ea6b14" : "rgba(var(--ff-muted), .8)" }}>{it.badge}</span>
        ) : null}
        {/* Icon-only rail (mobile, and the collapsed desktop rail): there's no room
            for a label, but hiding the count entirely meant unread messages were
            invisible on a phone. Pin a small orange dot to the icon instead. */}
        {!labels && it.badge ? (
          <span
            aria-label={it.badge + " " + it.label}
            style={{
              position:"absolute" as const, top:".28rem", right:".5rem",
              minWidth:"16px", height:"16px", padding:"0 .22rem", boxSizing:"border-box" as const,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:".62rem", fontWeight:700, lineHeight:1,
              borderRadius:"999px", background:"#ea6b14", color:"#fff",
            }}
          >{Number(it.badge) > 9 ? "9+" : it.badge}</span>
        ) : null}
      </button>
    );
  };

  const renderFooter = (labels: boolean) => {
    return (
      <div style={{ marginTop:"auto", display:"flex", flexDirection:"column" as const, gap:".25rem", paddingTop:".5rem" }}>
        {/* Desktop-only collapse / expand toggle */}
        {!narrow && (
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ ...rowBase(labels), background:"transparent", color:"rgba(var(--ff-muted), .55)", fontWeight:500 }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--ff-fg), .05)"; showTip(e, collapsed ? "Expand sidebar" : "Collapse sidebar", labels); }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; hideTip(); }}
          >
            <span style={{ fontSize:"1.15rem", lineHeight:1, display:"inline-flex", width:18, justifyContent:"center" }}>{collapsed ? "»" : "«"}</span>
            {labels && <span style={{ whiteSpace:"nowrap" as const, flex:1 }}>Collapse</span>}
          </button>
        )}
      </div>
    );
  };

  const renderNav = (labels: boolean) => (
    <div style={{ display:"flex", flexDirection:"column" as const, minHeight:"100%", gap:".25rem" }}>
      {narrow && (
        <button
          onClick={() => setExpanded(e => !e)} aria-label="Toggle menu" title="Menu"
          style={{ display:"flex", alignItems:"center", justifyContent: labels ? "flex-start" : "center", gap:".7rem", padding: labels ? ".55rem .8rem" : ".55rem 0", background:"transparent", border:"none", cursor:"pointer", marginBottom:".35rem", color:"rgba(var(--ff-muted), .85)" }}
        >
          <Ic name="menu" size={18} />
          {labels && <span style={{ fontWeight:600 }}>Menu</span>}
        </button>
      )}
      {title && labels && (
        <div style={{ fontSize:".68rem", textTransform:"uppercase" as const, letterSpacing:".12em", color:"rgba(var(--ff-muted), .45)", padding:"0 .8rem", margin:".2rem 0 .5rem" }}>{title}</div>
      )}
      <div style={{ display:"flex", flexDirection:"column" as const, gap:".25rem" }}>
        {items.map(it => itemBtn(it, labels))}
      </div>
      {renderFooter(labels)}
    </div>
  );

  const asideBase: React.CSSProperties = {
    position:"sticky", top:"3.75rem", alignSelf:"flex-start", height:"calc(100vh - 3.75rem)",
    overflowY:"auto" as const, borderRight:"1px solid rgba(var(--ff-fg), .08)", background:"var(--ff-card-bg)",
    transition:"width .18s ease",
  };

  const tipEl = tip ? (
    <div style={{ position:"fixed", top:tip.top, left:tip.left, transform:"translateY(-50%)", zIndex:1000, background:"var(--ff-surface)", color:"var(--ff-text)", border:"1px solid rgba(var(--ff-fg), .14)", borderRadius:"8px", padding:".3rem .6rem", fontSize:".78rem", fontWeight:500, fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" as const, boxShadow:"0 8px 24px rgba(0,0,0,.35)", pointerEvents:"none" as const }}>
      {tip.label}
    </div>
  ) : null;

  if (!narrow) {
    const w = collapsed ? "64px" : "232px";
    return <>{tipEl}<aside style={{ ...asideBase, width:w, flex:`0 0 ${w}`, padding: collapsed ? "1.1rem .4rem" : "1.1rem .7rem" }}>{renderNav(!collapsed)}</aside></>;
  }

  return (
    <>
      {tipEl}
      <aside style={{ ...asideBase, width:"56px", flex:"0 0 56px", padding:"1.1rem .4rem" }}>{renderNav(false)}</aside>
      {expanded && (
        <>
          <div onClick={() => setExpanded(false)} style={{ position:"fixed", inset:0, top:"3.75rem", background:"rgba(8,12,22,.5)", zIndex:900 }} />
          <div style={{ position:"fixed", top:"3.75rem", left:0, bottom:0, width:"min(216px, 80vw)", zIndex:901, background:"var(--ff-surface)", borderRight:"1px solid rgba(var(--ff-fg), .12)", overflowY:"auto" as const, padding:"1.1rem .7rem", boxShadow:"6px 0 28px rgba(0,0,0,.35)" }}>
            {renderNav(true)}
          </div>
        </>
      )}
    </>
  );
}
