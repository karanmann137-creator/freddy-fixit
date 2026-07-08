import { useState, useEffect } from "react";
import { Ic, type IconName } from "@/components/Ic";

export type SidebarItem = { key: string; label: string; icon: IconName; badge?: number };

// Reusable Supabase-style left navigation for the dashboards.
// Desktop: a sticky 232px column with icon + label rows (active row gets an
// orange left accent). Narrow screens: collapses to a slim icon rail; tapping
// the ☰ menu button expands a labelled drawer that closes on selection.
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

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 780);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const bar: React.CSSProperties = { display:"block", height:"2px", width:"100%", background:"currentColor", borderRadius:"2px" };

  const itemBtn = (it: SidebarItem, labels: boolean) => {
    const on = it.key === active;
    return (
      <button
        key={it.key}
        title={it.label}
        onClick={() => { onSelect(it.key); if (narrow) setExpanded(false); }}
        style={{
          display:"flex", alignItems:"center", gap:".7rem", width:"100%", textAlign:"left" as const,
          padding: labels ? ".62rem .8rem" : ".62rem 0", justifyContent: labels ? "flex-start" : "center",
          border:"none", cursor:"pointer", borderRadius:"10px",
          background: on ? "rgba(234,107,20,.13)" : "transparent",
          color: on ? "#ea6b14" : "rgba(var(--ff-muted), .8)",
          fontFamily:"'DM Sans',sans-serif", fontSize:".9rem", fontWeight: on ? 600 : 500,
          boxShadow: on ? "inset 3px 0 0 #ea6b14" : "none",
          transition:"background .15s, color .15s",
        }}
        onMouseEnter={e => { if (!on) e.currentTarget.style.background = "rgba(var(--ff-fg), .05)"; }}
        onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
      >
        <Ic name={it.icon} size={18} color={on ? "#ea6b14" : "currentColor"} />
        {labels && <span style={{ whiteSpace:"nowrap" as const, flex:1 }}>{it.label}</span>}
        {labels && it.badge ? (
          <span style={{ marginLeft:"auto", fontSize:".7rem", fontWeight:700, minWidth:"18px", textAlign:"center" as const, padding:".05rem .35rem", borderRadius:"999px", background: on ? "rgba(234,107,20,.25)" : "rgba(var(--ff-fg), .1)", color: on ? "#ea6b14" : "rgba(var(--ff-muted), .8)" }}>{it.badge}</span>
        ) : null}
      </button>
    );
  };

  const renderNav = (labels: boolean) => (
    <div style={{ display:"flex", flexDirection:"column" as const, gap:".25rem" }}>
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
      {items.map(it => itemBtn(it, labels))}
    </div>
  );

  const asideBase: React.CSSProperties = {
    position:"sticky", top:"3.75rem", alignSelf:"flex-start", height:"calc(100vh - 3.75rem)",
    overflowY:"auto" as const, borderRight:"1px solid rgba(var(--ff-fg), .08)", background:"rgba(var(--ff-fg), .025)",
  };

  if (!narrow) {
    return <aside style={{ ...asideBase, width:"232px", flex:"0 0 232px", padding:"1.1rem .7rem" }}>{renderNav(true)}</aside>;
  }

  return (
    <>
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
