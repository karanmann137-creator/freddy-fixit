import { useState } from "react";
import ReportProblem from "@/components/ReportProblem";
import { jobCode } from "@/lib/jobCode";
import { ensureUiStyles } from "./ui/uiStyles";

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
  ensureUiStyles();
  const [selected, setSelected] = useState<ClaimJob | null>(null);

  // NOT nested — this REPLACES itself with ReportProblem rather than rendering
  // it inside the card, so there is no .ffu-modal containing-block trap here
  // (see the ⚠️ note in DeleteAccount.tsx for when there is).
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
    <div onClick={onClose} className="ffu-scrim">
      <div
        onClick={e => e.stopPropagation()}
        className="ffu-modal"
        role="dialog"
        aria-modal="true"
        style={{ ["--ffu-modal-w" as any]: "460px" }}
      >
        <span className="ffu-grab" aria-hidden="true" />
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.4rem", letterSpacing: ".05em", color: "var(--ff-c10)", marginBottom: ".4rem" }}>
          File a Claim
        </div>
        <div style={{ fontSize: ".84rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
          Which job is this about? Pick it below — your payment stays held and protected while we review the claim.
        </div>

        {jobs.length === 0 ? (
          <div style={{ fontSize: ".88rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.6, background: "rgba(var(--ff-fg), .04)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius: "10px", padding: "1rem" }}>
            You don't have any active jobs to file a claim against right now. Claims can be filed once a job has been booked and paid. If you need help, reach us at <a href="mailto:hello@freddyfixit.ca" style={{ color: "var(--ff-c10)", textDecoration: "none" }}>hello@freddyfixit.ca</a>.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
            {jobs.map(j => (
              <button
                key={j.id}
                onClick={() => setSelected(j)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", textAlign: "left", padding: ".8rem .9rem", background: "rgba(var(--ff-fg), .04)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .1)", borderRadius: "10px", cursor: "pointer", fontFamily: "inherit", color: "var(--ff-text)" }}
                // The var() is safe in an imperative style assignment — it is a real
                // CSS declaration, which the onMouseLeave line has always proved by
                // setting rgba(var(--ff-fg), .1) the same way. .45 is neither
                // --ff-accent-soft (.12) nor --ff-accent-line (.32), so this is one of
                // the sites --ff-accent-rgb exists for.
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(var(--ff-accent-rgb), .45)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(var(--ff-fg), .1)"; }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: ".92rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.service || "Job"}</div>
                  <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)", marginTop: "var(--ff-s1)" }}>
                    <span style={{ fontFamily: "monospace", color: "var(--ff-c10)" }}>{jobCode(j.id)}</span>{j.status ? ` · ${j.status.replace(/_/g, " ")}` : ""}
                  </div>
                </div>
                <span style={{ color: "rgba(var(--ff-muted), .5)", fontSize: "1.1rem", flex: "0 0 auto" }}>›</span>
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", marginTop: "1.1rem", padding: ".7rem 1rem", background: "rgba(var(--ff-fg), .06)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .1)", borderRadius: "8px", color: "rgba(var(--ff-muted), .7)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
