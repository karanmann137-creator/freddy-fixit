import { useEffect, useState } from "react";

// GuideBubble — "Freddy walks you through it".
// A friendly assistant speech bubble shown at the top of each onboarding / job-posting
// step. It reframes the step in plain language, one thing at a time, and tells the
// person *why* we ask — so signing up feels like being talked through it, while the
// underlying form still collects every piece of information. Scripted (no AI, no cost).
//
// Props:
//   step / total  → shows a subtle "Step X of Y" line
//   message       → the main, plain-language ask for this step
//   why           → the "Why we ask" reassurance line (optional)
//   tip           → an optional extra tip
//   name          → assistant name (default "Freddy")

export default function GuideBubble({
  step, total, message, why, tip, name = "Freddy",
}: {
  step: number; total: number; message: string; why?: string; tip?: string; name?: string;
}) {
  // Re-trigger the entrance animation whenever the step changes.
  const [k, setK] = useState(0);
  useEffect(() => { setK(x => x + 1); }, [step]);

  return (
    <div key={k} style={wrap}>
      <style>{"@keyframes ffGuideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}"}</style>
      <div style={avatar} aria-hidden="true">F</div>
      <div style={bubble}>
        <div style={nameRow}>
          <span style={{ fontWeight: 600, color: "var(--ff-text)" }}>{name}</span>
          {total > 1 && <span style={stepPill}>Step {step} of {total}</span>}
        </div>
        <p style={msg}>{message}</p>
        {why && (
          <p style={whyLine}>
            <span style={{ color: "#ea6b14", fontWeight: 600 }}>Why we ask: </span>{why}
          </p>
        )}
        {tip && <p style={tipLine}>{tip}</p>}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: "flex", gap: ".7rem", alignItems: "flex-start",
  margin: ".75rem 0 1.25rem", animation: "ffGuideIn .28s ease",
};
const avatar: React.CSSProperties = {
  flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
  background: "linear-gradient(135deg,#ea6b14,#f59e42)", color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.35rem", letterSpacing: ".04em",
  boxShadow: "0 2px 10px rgba(234,107,20,.35)", marginTop: 2,
};
const bubble: React.CSSProperties = {
  // Opaque: theme background with an orange tint layered on top, so the bubble
  // stays readable over hero photos and in the light theme (was a transparent tint).
  flex: 1,
  background: "linear-gradient(rgba(234,107,20,.08), rgba(234,107,20,.08)), var(--ff-bg)",
  border: "1px solid rgba(234,107,20,.28)",
  borderRadius: "4px 14px 14px 14px", padding: ".8rem 1rem", lineHeight: 1.5,
};
const nameRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".35rem", flexWrap: "wrap",
};
const stepPill: React.CSSProperties = {
  fontSize: ".64rem", textTransform: "uppercase", letterSpacing: ".12em",
  color: "#ea6b14", background: "rgba(234,107,20,.14)",
  padding: ".12rem .5rem", borderRadius: "99px", fontWeight: 600,
};
const msg: React.CSSProperties = { margin: 0, color: "var(--ff-text)", fontSize: ".92rem" };
const whyLine: React.CSSProperties = {
  margin: ".5rem 0 0", color: "rgba(var(--ff-muted), .85)", fontSize: ".8rem",
};
const tipLine: React.CSSProperties = {
  margin: ".35rem 0 0", color: "rgba(var(--ff-muted), .7)", fontSize: ".78rem", fontStyle: "italic",
};
