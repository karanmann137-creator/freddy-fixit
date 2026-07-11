import { useState, useEffect } from "react";
import { Ic } from "@/components/Ic";
import { supabase } from "@/lib/supabase";

// Job time tracking. Contractor mode: start/stop a timer per visit (multiple
// sessions add up), see total tracked time live, and one-tap "Bill for tracked
// time" — pre-fills the existing price-change flow at hours × their hourly
// rate (the client still reviews and approves before anything is charged).
// Client mode: read-only tracked time + an explicit note that the work can be
// billed by the hour, so the hours are never a surprise.
// Reads job_time_logs via RLS (contractor own / client-of-job); writes via the
// start_job_timer / stop_job_timer RPCs.
export default function JobTimer({ job, role, hourlyRate, onBill, onError }: {
  job: any;
  role: "contractor" | "client";
  hourlyRate?: number | null;
  onBill?: (hours: number, amount: number | null, reason: string) => void;
  onError?: (msg: string) => void;
}) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0); // re-render each second while running

  useEffect(() => {
    let alive = true;
    supabase.from("job_time_logs").select("*").eq("job_id", job.id).order("started_at", { ascending: true })
      .then(({ data }) => { if (alive) { setLogs(data ?? []); setLoaded(true); } });
    return () => { alive = false; };
  }, [job.id]);

  const running = logs.find(l => !l.ended_at) ?? null;

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setTick(n => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running?.id]);

  const totalMs = logs.reduce((t, l) => {
    const start = new Date(l.started_at).getTime();
    const end = l.ended_at ? new Date(l.ended_at).getTime() : Date.now();
    return t + Math.max(0, end - start);
  }, 0);
  const hours = totalMs / 3600000;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? h + "h " + String(m).padStart(2, "0") + "m" : m + "m " + String(s % 60).padStart(2, "0") + "s";
  };
  const hoursText = () => {
    const h = Math.floor(totalMs / 3600000), m = Math.round((totalMs % 3600000) / 60000);
    return (h > 0 ? h + "h " : "") + m + "m";
  };

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("start_job_timer", { p_job_id: job.id });
    setBusy(false);
    if (error) { onError?.("Couldn't start the timer: " + error.message); return; }
    setLogs(prev => [...prev, { id: data, job_id: job.id, started_at: new Date().toISOString(), ended_at: null }]);
  };
  const stop = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("stop_job_timer", { p_job_id: job.id });
    setBusy(false);
    if (error) { onError?.("Couldn't stop the timer: " + error.message); return; }
    const now = new Date().toISOString();
    setLogs(prev => prev.map(l => l.ended_at ? l : { ...l, ended_at: now }));
  };

  const bill = () => {
    if (!onBill) return;
    const rate = hourlyRate != null ? Number(hourlyRate) : null;
    const roundedH = Math.round(hours * 4) / 4; // bill to the nearest 15 min
    const amount = rate != null ? Math.round(roundedH * rate * 100) / 100 : null;
    const reason = hoursText() + " on site" + (rate != null ? " × $" + rate + "/h" : " (tracked time)");
    onBill(roundedH, amount, reason);
  };

  // Client with no tracked time: nothing to show.
  if (role === "client" && (!loaded || logs.length === 0)) return null;

  const btn = (bg: string, color: string, border = "none") => ({ padding: ".45rem .9rem", background: bg, color, border, borderRadius: "8px", fontFamily: "inherit", fontSize: ".8rem", fontWeight: 600, cursor: "pointer" });

  return (
    <div style={{ padding: ".85rem .95rem", borderRadius: "12px", background: "rgba(var(--ff-fg), .03)", border: "1px solid " + (running ? "rgba(234,107,20,.4)" : "rgba(var(--ff-fg), .08)") }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".45rem", fontSize: ".72rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", fontWeight: 700 }}>
          <Ic name="timer" size={14} color="#ea6b14" />Time on site
        </div>
        <div style={{ fontSize: ".95rem", fontWeight: 700, color: running ? "#ea6b14" : "var(--ff-text)" }}>
          {totalMs > 0 || running ? fmt(totalMs) : "0m"}
          {running && <span style={{ fontSize: ".7rem", fontWeight: 600, marginLeft: ".45rem", color: "#ea6b14" }}>● tracking…</span>}
        </div>
        {role === "contractor" && (
          <div style={{ marginLeft: "auto", display: "flex", gap: ".5rem", flexWrap: "wrap" as const }}>
            {running ? (
              <button disabled={busy} onClick={stop} style={btn("rgba(239,68,68,.12)", "#ef4444", "1px solid rgba(239,68,68,.35)")}>{busy ? "…" : "■ Stop timer"}</button>
            ) : (
              <button disabled={busy} onClick={start} style={btn("rgba(34,197,94,.12)", "#22c55e", "1px solid rgba(34,197,94,.35)")}>{busy ? "…" : "▶ Start timer"}</button>
            )}
          </div>
        )}
      </div>

      {role === "contractor" && (
        <div style={{ marginTop: ".55rem", fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)", lineHeight: 1.5 }}>
          {hourlyRate != null
            ? <>At your rate of {"$" + hourlyRate + "/h"}, {hoursText()} tracked ≈ <b style={{ color: "var(--ff-text)" }}>{"$" + (Math.round((Math.round(hours * 4) / 4) * Number(hourlyRate) * 100) / 100).toFixed(2)}</b>. The client can see tracked time on their side.</>
            : <>Track your time on site — set an hourly rate in your Profile to bill from it. The client can see tracked time on their side.</>}
        </div>
      )}
      {role === "contractor" && !running && totalMs > 60000 && onBill && job.payment_status !== "released" && !job.is_milestone && (
        <button onClick={bill} style={{ ...btn("rgba(234,107,20,.12)", "#ea6b14", "1px solid rgba(234,107,20,.4)"), marginTop: ".6rem" }}>
          <Ic name="dollar" size={13} style={{ marginRight: 4 }} />Bill for tracked time{hourlyRate != null ? " (" + hoursText() + " × $" + hourlyRate + "/h)" : ""}
        </button>
      )}

      {role === "client" && (
        <div style={{ marginTop: ".55rem", fontSize: ".78rem", color: "rgba(var(--ff-muted), .6)", lineHeight: 1.5 }}>
          <Ic name="clock" size={12} style={{ marginRight: 4 }} />
          Your pro tracks time on site, and this work can be billed by the hour. If the price changes based on hours worked, you'll see the new price and approve it before anything extra is charged.
        </div>
      )}
    </div>
  );
}
