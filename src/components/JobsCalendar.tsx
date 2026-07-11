import { useState } from "react";
import { Ic } from "@/components/Ic";

// Month-grid calendar of the contractor's booked jobs (Jobber-style Schedule view).
// Self-contained: takes the already-loaded myJobs array, plots anything with a
// scheduled_at onto its LOCAL day, and lets the pro click a day to see that day's
// visits + jump to the job card ("Open job" → onOpen, which the dashboard wires
// to its existing goJob helper). No DB reads of its own.
export default function JobsCalendar({ jobs, statusColors, onOpen }: {
  jobs: any[];
  statusColors: Record<string, string>;
  onOpen: (job: any) => void;
}) {
  const today = new Date();
  const [cur, setCur] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<string>(dayKey(today));

  function dayKey(d: Date) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Bucket jobs by local calendar day (only live/finished jobs with a booked time).
  const byDay: Record<string, any[]> = {};
  for (const j of jobs) {
    if (!j.scheduled_at || j.status === "cancelled") continue;
    const d = new Date(j.scheduled_at);
    if (isNaN(d.getTime())) continue;
    const k = dayKey(d);
    (byDay[k] = byDay[k] || []).push(j);
  }
  for (const k of Object.keys(byDay)) {
    byDay[k].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }

  const unscheduled = jobs.filter(j => !j.scheduled_at && (j.status === "assigned" || j.status === "in_progress")).length;

  // Build the month grid (weeks start Sunday, matching Calgary convention).
  const startDow = new Date(cur.y, cur.m, 1).getDay();
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cur.y, cur.m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(cur.y, cur.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = dayKey(today);
  const move = (delta: number) => {
    const d = new Date(cur.y, cur.m + delta, 1);
    setCur({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => { setCur({ y: today.getFullYear(), m: today.getMonth() }); setSelected(todayKey); };

  const color = (j: any) => statusColors[j.status] ?? "#94a3b8";
  const timeOf = (j: any) => new Date(j.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  // Which statuses actually appear this month → legend only shows what's on screen.
  const monthPrefix = cur.y + "-" + String(cur.m + 1).padStart(2, "0");
  const monthStatuses = Array.from(new Set(
    Object.keys(byDay).filter(k => k.startsWith(monthPrefix)).flatMap(k => byDay[k].map((j: any) => j.status))
  ));

  const selJobs = byDay[selected] ?? [];
  const selDate = new Date(selected + "T12:00:00");
  const selLabel = isNaN(selDate.getTime()) ? "" : selDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const navBtn: React.CSSProperties = { padding: ".4rem .8rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".82rem", cursor: "pointer" };

  return (
    <div>
      {/* Header: month + prev/today/next */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: ".6rem", marginBottom: "1rem" }}>
        <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.5rem", letterSpacing: ".03em", lineHeight: 1.1, margin: 0 }}>{monthName}</h2>
        <div style={{ display: "flex", gap: ".4rem" }}>
          <button style={navBtn} aria-label="Previous month" onClick={() => move(-1)}>‹</button>
          <button style={navBtn} onClick={goToday}>Today</button>
          <button style={navBtn} aria-label="Next month" onClick={() => move(1)}>›</button>
        </div>
      </div>

      {unscheduled > 0 && (
        <div style={{ fontSize: ".8rem", color: "rgba(var(--ff-muted), .65)", marginBottom: ".8rem" }}>
          <Ic name="alert-triangle" size={13} color="#f59e0b" style={{ marginRight: 5 }} />
          {unscheduled === 1 ? "1 active job has" : unscheduled + " active jobs have"} no booked time yet — propose a time from My Jobs to see {unscheduled === 1 ? "it" : "them"} here.
        </div>
      )}

      {/* Weekday header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "4px" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} style={{ textAlign: "center" as const, fontSize: ".68rem", textTransform: "uppercase" as const, letterSpacing: ".08em", color: "rgba(var(--ff-muted), .45)", padding: ".25rem 0" }}>{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
        {cells.map((d, i) => {
          if (!d) return <div key={"e" + i} style={{ minHeight: "68px", borderRadius: "10px", background: "rgba(var(--ff-fg), .015)" }} />;
          const k = dayKey(d);
          const dj = byDay[k] ?? [];
          const isToday = k === todayKey;
          const isSel = k === selected;
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              style={{
                minHeight: "68px", padding: "4px", textAlign: "left" as const, display: "flex", flexDirection: "column" as const, gap: "2px",
                borderRadius: "10px", cursor: "pointer", fontFamily: "inherit", overflow: "hidden",
                background: isSel ? "rgba(234,107,20,.1)" : "rgba(var(--ff-fg), .035)",
                border: isToday ? "1px solid #ea6b14" : isSel ? "1px solid rgba(234,107,20,.5)" : "1px solid rgba(var(--ff-fg), .05)",
              }}
            >
              <span style={{ fontSize: ".72rem", fontWeight: isToday ? 700 : 500, color: isToday ? "#ea6b14" : "rgba(var(--ff-muted), .6)" }}>{d.getDate()}</span>
              {dj.slice(0, 2).map((j: any) => (
                <span key={j.id} style={{ fontSize: ".62rem", lineHeight: 1.3, padding: "1px 4px", borderRadius: "4px", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", background: "rgba(var(--ff-fg), .06)", color: "var(--ff-text)", borderLeft: "3px solid " + color(j) }}>
                  {j.request?.service_needed ?? "Job"}
                </span>
              ))}
              {dj.length > 2 && <span style={{ fontSize: ".6rem", color: "rgba(var(--ff-muted), .55)" }}>+{dj.length - 2} more</span>}
            </button>
          );
        })}
      </div>

      {/* Legend — only statuses visible this month */}
      {monthStatuses.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: ".8rem", marginTop: ".7rem" }}>
          {monthStatuses.map(st => (
            <span key={st} style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", fontSize: ".7rem", color: "rgba(var(--ff-muted), .6)" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: statusColors[st] ?? "#94a3b8", display: "inline-block" }} />
              {st.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {/* Selected day detail */}
      <div style={{ marginTop: "1.25rem", background: "rgba(var(--ff-fg), .055)", border: "1px solid rgba(var(--ff-fg), .05)", borderRadius: "14px", padding: "1.25rem" }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.1rem", letterSpacing: ".05em", lineHeight: 1.1, color: "#ea6b14", marginBottom: ".8rem" }}>
          <Ic name="calendar" size={15} style={{ marginRight: 6 }} />{selLabel}
        </div>
        {selJobs.length === 0 ? (
          <div style={{ fontSize: ".85rem", color: "rgba(var(--ff-muted), .5)" }}>Nothing booked this day.</div>
        ) : selJobs.map((j: any) => (
          <div key={j.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" as const, padding: ".65rem 0", borderTop: "1px solid rgba(var(--ff-fg), .06)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: ".88rem", fontWeight: 500 }}>
                <span style={{ color: color(j), marginRight: 6 }}>●</span>
                {timeOf(j)} — {j.request?.service_needed ?? "Job"}
              </div>
              <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)", marginTop: "2px" }}>
                {(j.client?.first_name ? j.client.first_name + " · " : "") + (j.request?.location ?? "")}
                {j.amount ? " · $" + j.amount : ""}
                <span style={{ marginLeft: 6, color: color(j) }}>{String(j.status).replace(/_/g, " ")}</span>
              </div>
            </div>
            <button
              onClick={() => onOpen(j)}
              style={{ padding: ".45rem .9rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".8rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
            >
              Open job
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
