import { useState, useEffect } from "react";

type Props = { value: string; onChange: (v: string) => void };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["S","M","T","W","T","F","S"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function ScheduleField({ value, onChange }: Props) {
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [d, setD] = useState<number | null>(null);
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<"AM" | "PM">("AM");

  // Hydrate from an incoming value (editing an existing proposal, or a reset to "").
  useEffect(() => {
    if (value) {
      const dt = new Date(value);
      if (!isNaN(dt.getTime())) {
        setY(dt.getFullYear()); setM(dt.getMonth()); setD(dt.getDate());
        const h = dt.getHours();
        setAmpm(h >= 12 ? "PM" : "AM");
        setHour12(h % 12 === 0 ? 12 : h % 12);
        setMinute(dt.getMinutes());
        return;
      }
    }
    setY(now.getFullYear()); setM(now.getMonth()); setD(null);
    setHour12(9); setMinute(0); setAmpm("AM");
  }, [value]);

  const emit = (o: { y?: number; m?: number; d?: number | null; hour12?: number; minute?: number; ampm?: "AM" | "PM" }) => {
    const Y = o.y ?? y, M = o.m ?? m;
    const D = o.d === undefined ? d : o.d;
    const H = o.hour12 ?? hour12, MIN = o.minute ?? minute, AP = o.ampm ?? ampm;
    if (D == null) return; // no date chosen yet — nothing to propose
    let h24 = H % 12;
    if (AP === "PM") h24 += 12;
    onChange(`${Y}-${pad(M + 1)}-${pad(D)}T${pad(h24)}:${pad(MIN)}`);
  };

  const isCurYear = y === now.getFullYear();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDow = new Date(y, m, 1).getDay();
  const isPast = (day: number) => new Date(y, m, day) < today0;

  const changeMonth = (nm: number) => {
    let yy = y, mm = nm;
    if (yy === now.getFullYear() && mm < now.getMonth()) mm = now.getMonth();
    setM(mm); setD(null); // reselect a day within the new month
  };
  const changeYear = (raw: string) => {
    let yy = parseInt(raw, 10);
    if (isNaN(yy)) return;
    if (yy < now.getFullYear()) yy = now.getFullYear();
    let mm = m;
    if (yy === now.getFullYear() && mm < now.getMonth()) mm = now.getMonth();
    setY(yy); setM(mm); setD(null);
  };

  const wrap: React.CSSProperties = { background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "10px", padding: ".85rem" };
  const lbl: React.CSSProperties = { fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", marginBottom: ".5rem" };
  const fieldBg = "rgba(var(--ff-fg), .06)";

  const monthsDisabledBefore = isCurYear ? now.getMonth() : 0;
  const selectedLabel = d != null
    ? `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(y, m, d).getDay()]}, ${MONTHS[m].slice(0,3)} ${d}, ${y} · ${hour12}:${pad(minute)} ${ampm}`
    : "Pick a day below";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
      {/* Summary */}
      <div style={{ fontSize: ".85rem", fontWeight: 500, color: d != null ? "var(--ff-text)" : "rgba(var(--ff-muted), .5)" }}>
        {selectedLabel}
      </div>

      {/* DATE */}
      <div style={wrap}>
        <div style={lbl}>Date</div>
        <div style={{ display: "flex", gap: ".5rem", marginBottom: ".6rem" }}>
          <select value={m} onChange={e => changeMonth(Number(e.target.value))}
            style={{ flex: "1 1 auto", padding: ".5rem .6rem", background: fieldBg, border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".85rem" }}>
            {MONTHS.map((name, i) => (
              <option key={name} value={i} disabled={i < monthsDisabledBefore} style={{ color: "#1a2236" }}>{name}</option>
            ))}
          </select>
          <input type="number" value={y} min={now.getFullYear()} onChange={e => changeYear(e.target.value)}
            style={{ width: "84px", padding: ".5rem .6rem", background: fieldBg, border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".85rem", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px" }}>
          {DOW.map((dn, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: ".62rem", color: "rgba(var(--ff-muted), .4)", padding: ".2rem 0" }}>{dn}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => <div key={"b" + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const past = isPast(day);
            const selected = d === day;
            const isToday = isCurYear && m === now.getMonth() && day === now.getDate();
            return (
              <button key={day} type="button" disabled={past}
                onClick={() => { setD(day); emit({ d: day }); }}
                style={{
                  aspectRatio: "1 / 1", border: selected ? "none" : isToday ? "1px solid #ea6b14" : "1px solid transparent",
                  borderRadius: "7px", fontFamily: "inherit", fontSize: ".8rem",
                  background: selected ? "#ea6b14" : past ? "transparent" : "rgba(var(--ff-fg), .05)",
                  color: selected ? "#fff" : past ? "rgba(var(--ff-muted), .2)" : "var(--ff-text)",
                  cursor: past ? "not-allowed" : "pointer", transition: "background .15s",
                }}>
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* TIME */}
      <div style={wrap}>
        <div style={lbl}>Time</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: ".6rem" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.8rem", letterSpacing: ".04em", color: "#ea6b14" }}>
            {hour12}:{pad(minute)} {ampm}
          </div>
          <div style={{ display: "flex", gap: ".3rem" }}>
            {(["AM", "PM"] as const).map(p => (
              <button key={p} type="button" onClick={() => { setAmpm(p); emit({ ampm: p }); }}
                style={{ padding: ".35rem .7rem", borderRadius: "7px", fontFamily: "inherit", fontSize: ".8rem", fontWeight: 600, cursor: "pointer",
                  border: ampm === p ? "none" : "1px solid rgba(var(--ff-fg), .15)",
                  background: ampm === p ? "#ea6b14" : "transparent", color: ampm === p ? "#fff" : "rgba(var(--ff-muted), .7)" }}>{p}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: "rgba(var(--ff-muted), .4)", marginBottom: ".15rem" }}>
          <span>Hour</span><span>{hour12}</span>
        </div>
        <input type="range" min={1} max={12} step={1} value={hour12}
          onChange={e => { const v = Number(e.target.value); setHour12(v); emit({ hour12: v }); }}
          style={{ width: "100%", accentColor: "#ea6b14", marginBottom: ".7rem" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: "rgba(var(--ff-muted), .4)", marginBottom: ".15rem" }}>
          <span>Minutes</span><span>{pad(minute)}</span>
        </div>
        <input type="range" min={0} max={45} step={15} value={minute}
          onChange={e => { const v = Number(e.target.value); setMinute(v); emit({ minute: v }); }}
          style={{ width: "100%", accentColor: "#ea6b14" }} />
      </div>
    </div>
  );
}
