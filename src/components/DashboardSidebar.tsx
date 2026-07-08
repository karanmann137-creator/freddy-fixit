import { useState, useEffect } from "react";
import { Ic, type IconName } from "@/components/Ic";

export type SidebarItem = { key: string; label: string; icon: IconName; badge?: number };
// Footer actions (Contact, Settings, Log out, …) — plain buttons, not tabs.
export type SidebarAction = { key: string; label: string; icon: IconName; onClick: () => void; danger?: boolean };

const COLLAPSE_KEY = "ff_sidebar_collapsed";

// Reusable Supabase-style left navigation for the dashboards.
// Desktop: a sticky column with icon + label rows (active row gets an orange
// left accent) that can be collapsed to a slim icon rail via a toggle at the
// bottom (remembered in localStorage). Narrow screens: collapses to a slim icon
// rail; tapping the ☰ menu button expands a labelled drawer that closes on
// selection. A footer holds account actions (notifications, settings, log out).
export default function DashboardSidebar({
  items, active, onSelect, title, actions, bell,
}: {
  items: SidebarItem[];
  active: string;
  onSelect: (key: string) => void;
  title?: string;
  actions?: SidebarAction[];
  bell?: React.ReactNode;
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

  const bar: React.CSSProperties = { display:"block", height:"2px", width:"100%", background:"currentColor", borderRadius:"2px" };

  const rowBase = (labels: boolean): React.CSSProperties => ({
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
      </button>
    );
  };

  const actionBtn = (a: SidebarAction, labels: boolean) => (
    <button
      key={a.key}
      title={a.label}
      onClick={() => { a.onClick(); if (narrow) setExpanded(false); }}
      style={{
        ...rowBase(labels),
        background:"transparent",
        color: a.danger ? "#ea6b14" : "rgba(var(--ff-muted), .8)",
        fontWeight: 500,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = a.danger ? "rgba(234,107,20,.1)" : "rgba(var(--ff-fg), .05)"; showTip(e, a.label, labels); }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; hideTip(); }}
    >
      <Ic name={a.icon} size={18} color={a.danger ? "#ea6b14" : "currentColor"} />
      {labels && <span style={{ whiteSpace:"nowrap" as const, flex:1 }}>{a.label}</span>}
    </button>
  );

  const renderFooter = (labels: boolean) => {
    const hasFooter = !!bell || !!(actions && actions.length);
    return (
      <div style={{ marginTop:"auto", display:"flex", flexDirection:"column" as const, gap:".25rem", paddingTop:".5rem" }}>
        {hasFooter && (
          <div style={{ display:"flex", flexDirection:"column" as const, gap:".25rem", borderTop:"1px solid rgba(var(--ff-fg), .08)", paddingTop:".5rem" }}>
            {bell && (
              <div style={{ display:"flex", alignItems:"center", gap:".7rem", padding: labels ? ".4rem .8rem" : ".4rem 0", justifyContent: labels ? "flex-start" : "center" }}>
                {bell}
                {labels && <span style={{ fontSize:".9rem", fontWeight:500, color:"rgba(var(--ff-muted), .8)" }}>Notifications</span>}
              </div>
            )}
            {actions?.map(a => actionBtn(a, labels))}
          </div>
        )}
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
          <span style={{ display:"inline-flex", flexDirection:"column" as const, gap:"3px", width:"18px" }}>
            <span style={bar} /><span style={bar} /><span style={bar} />
          </span>
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
    overflowY:"auto" as const, borderRight:"1px solid rgba(var(--ff-fg), .08)", background:"rgba(var(--ff-fg), .025)",
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
          <div style={{ position:"fixed", top:"3.75rem", left:0, bottom:0, width:"216px", zIndex:901, background:"var(--ff-surface)", borderRight:"1px solid rgba(var(--ff-fg), .12)", overflowY:"auto" as const, padding:"1.1rem .7rem", boxShadow:"6px 0 28px rgba(0,0,0,.35)" }}>
            {renderNav(true)}
          </div>
        </>
      )}
    </>
  );
}
