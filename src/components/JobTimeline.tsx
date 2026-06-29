import { Ic } from "@/components/Ic";

// Shared live progress tracker for a job. Derives each step's done/active state
// from the job's timestamp fields so it stays in sync no matter who's looking.
// Renders the same on the client and contractor dashboards.

type Step = { key: string; label: string; icon: string; at: string | null; done: boolean };

function fmt(ts: string | null): string | null {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return null; }
}

export default function JobTimeline({ job }: { job: any }) {
  if (!job) return null;

  const paid = job.payment_status === "held" || job.payment_status === "released" || !!job.paid_at;
  const disputed = job.payment_status === "disputed";

  const steps: Step[] = [
    { key: "matched",   label: "Contractor matched", icon: "user-check",   at: job.created_at ?? null,             done: true },
    { key: "scheduled", label: "Time scheduled",     icon: "calendar",     at: job.client_approved_at ?? null,     done: !!job.client_approved_at },
    { key: "paid",      label: "Payment secured",    icon: "check-circle", at: job.paid_at ?? null,                done: paid },
    { key: "onway",     label: "Contractor on the way", icon: "map-pin",   at: job.on_my_way_at ?? null,           done: !!job.on_my_way_at },
    { key: "done",      label: "Work completed",     icon: "wrench",       at: job.contractor_completed_at ?? null, done: !!job.contractor_completed_at },
    { key: "confirmed", label: "Confirmed & released", icon: "check-circle", at: job.client_confirmed_at ?? null,  done: !!job.client_confirmed_at },
  ];

  // The "active" step is the first not-yet-done step.
  const activeIdx = steps.findIndex(s => !s.done);

  return (
    <div style={{ marginTop: ".25rem" }}>
      {steps.map((s, i) => {
        const isActive = !disputed && i === activeIdx;
        const isDone = s.done;
        const color = isDone ? "#22c55e" : isActive ? "#ea6b14" : "rgba(var(--ff-muted), .3)";
        const lineColor = steps[i + 1]?.done ? "#22c55e" : "rgba(var(--ff-fg), .12)";
        const when = fmt(s.at);
        return (
          <div key={s.key} style={{ display: "flex", gap: ".7rem", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch" }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: isDone ? "rgba(34,197,94,.15)" : isActive ? "rgba(234,107,20,.15)" : "rgba(var(--ff-fg), .04)",
                border: `1.5px solid ${color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Ic name={(isDone ? "check-circle" : s.icon) as any} size={13} color={color} />
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 14, background: lineColor, marginTop: 2, marginBottom: 2 }} />
              )}
            </div>
            <div style={{ paddingBottom: i < steps.length - 1 ? ".7rem" : 0, paddingTop: 2 }}>
              <div style={{ fontSize: ".85rem", fontWeight: isActive ? 600 : 500, color: isDone ? "var(--ff-text)" : isActive ? "var(--ff-text)" : "rgba(var(--ff-muted), .45)" }}>
                {s.label}{isActive && <span style={{ color: "#ea6b14", fontSize: ".72rem", fontWeight: 600, marginLeft: ".5rem" }}>NOW</span>}
              </div>
              {when && isDone && <div style={{ fontSize: ".74rem", color: "rgba(var(--ff-muted), .5)", marginTop: ".1rem" }}>{when}</div>}
            </div>
          </div>
        );
      })}
      {disputed && (
        <div style={{ marginTop: ".5rem", fontSize: ".78rem", color: "var(--ff-warn)" }}>
          <Ic name="alert-triangle" size={12} style={{ marginRight: 4 }} />Paused — a problem was reported and is under review.
        </div>
      )}
    </div>
  );
}
