import { useState } from "react";
import ReportProblem from "@/components/ReportProblem";
import { jobCode } from "@/lib/jobCode";

export type ClaimJob = { id: string; service?: string | null; status?: string | null };

// Client-facing "File a claim" launcher. Claims are always tied to a specific
// job, so we first let the client pick which job (each shown with its Job ID),
// then hand off to the existing ReportProblem form for that job.
export default function FileClaimModal({
  jobs,
  userId,
  onClose,
  onSubmitted,
}: {
  jobs: ClaimJob[];
  userId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [selected, setSelected] = useState<ClaimJob | null>(null);

  if (selected) {
    return (
      <ReportProblem
        jobId={selected.id}
        userId={userId}
        onClose={onClose}
        onSubmitted={() => { onSubmitted?.(); onClose(); }}
      />
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "'DM Sans',sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "460px", maxHeight: "90vh", overflowY: "auto", background: "var(--ff-bg)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "16px", padding: "1.5rem", color: "var(--ff-text)", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.4rem", letterSpacing: ".05em", color: "#ea6b14", marginBottom: ".4rem" }}>
          File a Claim
        </div>
        <div style={{ fontSize: ".84rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
          Which job is this about? Pick it below — your payment stays held and protected while we review the claim.
        </div>

        {jobs.length === 0 ? (
          <div style={{ fontSize: ".88rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.6, background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: "10px", padding: "1rem" }}>
            You don't have any active jobs to file a claim against right now. Claims can be filed once a job has been booked and paid. If you need help, reach us at <a href="mailto:hello@freddyfixit.ca" style={{ color: "#ea6b14", textDecoration: "none" }}>hello@freddyfixit.ca</a>.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
            {jobs.map(j => (
              <button
                key={j.id}
                onClick={() => setSelected(j)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", textAlign: "left", padding: ".8rem .9rem", background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .1)", borderRadius: "10px", cursor: "pointer", fontFamily: "inherit", color: "var(--ff-text)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(234,107,20,.45)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(var(--ff-fg), .1)"; }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: ".92rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.service || "Job"}</div>
                  <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)", marginTop: ".2rem" }}>
                    <span style={{ fontFamily: "monospace", color: "#ea6b14" }}>{jobCode(j.id)}</span>{j.status ? ` · ${j.status.replace(/_/g, " ")}` : ""}
                  </div>
                </div>
                <span style={{ color: "rgba(var(--ff-muted), .5)", fontSize: "1.1rem", flex: "0 0 auto" }}>›</span>
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", marginTop: "1.1rem", padding: ".7rem 1rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)", borderRadius: "8px", color: "rgba(var(--ff-muted), .7)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
