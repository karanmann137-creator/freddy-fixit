import { Ic } from "@/components/Ic";
import { Group, Sheet, Stepper, type Step as UiStep, type StepState } from "@/components/ui";
import { jobFullyFunded } from "@/lib/jobFunding";

// Shared live progress tracker for a job. Derives each step's done/active state
// from the job's timestamp fields so it stays in sync no matter who's looking.
// Renders the same on the client and contractor dashboards — ONE mount each, so
// a change here lands on both at once. That is the reason this file exists and
// the reason not to inline a copy into either page.
//
// ── Ported onto <Stepper> on 2026-10-30 ──────────────────────────────────
// The derivations below are UNCHANGED, deliberately and verifiably — only the
// rendering moved. v1 hand-rolled the rail: a 26px circle per step with a 13px
// glyph inside it, and a connector drawn as a flex child whose height depended
// on the text beside it, so a two-line label broke the line and a one-line
// label left a gap. The primitive pins its connector top:34px/bottom:-10px off
// the dot centre, which cannot drift no matter how a label wraps.
//
// WHAT WAS DELIBERATELY DROPPED, so nobody re-adds it as a "fix":
//
//   · The per-step icon. Every icon restated its own label — a map-pin beside
//     "Contractor on the way", a wrench beside "Work completed" — at 13px,
//     where it read as a smudge rather than as information. The dot now carries
//     STATE (done / now / under review / not yet) and the label carries
//     meaning, which is the one job each is good at.
//   · The literal "NOW" badge. `.ffu-now` paints the dot accent with a 4px
//     halo, which is unmistakable without a second orange thing beside it.
//
// ── On the orange rule ───────────────────────────────────────────────────
// CLAUDE.md: orange appears exactly once per screen, and only when the answer
// is "you". The active dot is orange and is NOT a call to action — it is a
// position marker, and a progress rail without one is unreadable. This is the
// same narrow relaxation <JobSwitcher> takes. Note that it is strictly LESS
// orange than what it replaced: v1 painted the dot, its 1.5px ring, its 15%
// background tint AND a bold "NOW" caption, all in the same accent. If the
// budget ever has to be spent elsewhere, the lever is this dot, not the pass.
type Step = { key: string; label: string; at: string | null; done: boolean };

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

  // Jobs are collected in two charges — a deposit at booking, the balance when the
  // work is done — so "paid" is no longer one moment. A job whose deposit rate is
  // below 100% gets its own balance step; anything charged in full (older jobs, or
  // a future 100% rate) keeps the single "Payment secured" line it always had.
  //
  // `fullyFunded` USED to be a second, looser copy of the predicate — the file
  // carried its own inline expression, ClientDashboard carried a third with a
  // different epsilon, and all three read a NULL `total_charged` as zero, so an
  // uncharged job rendered "Balance paid". That hoist is done: src/lib/jobFunding
  // is now the one implementation, mirroring the generated column exactly. Do not
  // re-inline it here "to avoid an import" — the drift is how it started.
  const depRate = Number(job.deposit_rate);
  const split = depRate > 0 && depRate < 1;
  const balancePaid = paid && jobFullyFunded(job);

  const steps: Step[] = [
    { key: "matched",   label: "Contractor matched", at: job.created_at ?? null,             done: true },
    { key: "scheduled", label: "Time scheduled",     at: job.client_approved_at ?? null,     done: !!job.client_approved_at },
    { key: "paid",      label: split ? "Deposit secured" : "Payment secured", at: job.deposit_paid_at ?? job.paid_at ?? null, done: paid },
    { key: "onway",     label: "Contractor on the way", at: job.on_my_way_at ?? null,        done: !!job.on_my_way_at },
    { key: "done",      label: "Work completed",     at: job.contractor_completed_at ?? null, done: !!job.contractor_completed_at },
    ...(split ? [{ key: "balance", label: "Balance paid", at: null, done: balancePaid } as Step] : []),
    { key: "confirmed", label: "Confirmed & released", at: job.client_confirmed_at ?? null,  done: !!job.client_confirmed_at },
  ];

  // The "active" step is the first not-yet-done step.
  const activeIdx = steps.findIndex(s => !s.done);

  // A disputed job now paints its active step AMBER rather than painting nothing
  // at all. v1 suppressed the active marker entirely when disputed, so the rail
  // went uniformly grey and the only thing saying why was one line of text under
  // it — the step the dispute is actually parked on was unmarked. `review` is
  // precisely the state for "we are looking at it", which is what a dispute is.
  const stepState = (s: Step, i: number): StepState =>
    s.done ? "done"
    : i !== activeIdx ? "todo"
    : disputed ? "review"
    : "now";

  const uiSteps: UiStep[] = steps.map((s, i) => ({
    title: s.label,
    // The timestamp shows on DONE steps only. On a step that has not happened
    // there is no time to show, and on the active one the time would be the
    // moment the previous step finished — which reads as a promise about when
    // this one will.
    sub: s.done ? (fmt(s.at) ?? undefined) : undefined,
    state: stepState(s, i),
  }));

  // The "Job progress" caption and the box around it USED TO LIVE AT BOTH CALL
  // SITES, byte-identical — a hand-rolled 12px/1rem/.03-alpha panel with an
  // uppercase caption, copy-pasted into ClientDashboard and ContractorDashboard.
  // It is in here now so the two cannot drift, which is the same argument that
  // put the steps themselves in this file. Both callers are now just
  // `<JobTimeline job={...} />`; neither carries a margin, because `.ffu-grp`
  // owns the rhythm above a group and a bespoke margin per caller is how two
  // identical panels end up 4px apart.
  return (
    <Group label="Job progress">
      <Sheet>
        <Stepper steps={uiSteps} />
        {/* Inside the sheet, under a hairline, so it reads as the rail's
            footnote rather than as an unexplained orphan line below the box.
            Amber, matching the `review` dot the dispute just painted. */}
        {disputed && (
          <div style={{ padding: "var(--ff-s3) var(--ff-s4)", borderTop: "1px solid var(--ff-hair)", fontSize: ".78rem", color: "var(--ff-warn)" }}>
            <Ic name="alert-triangle" size={12} style={{ marginRight: 4 }} />Paused — a problem was reported and is under review.
          </div>
        )}
      </Sheet>
    </Group>
  );
}
