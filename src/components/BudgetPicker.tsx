import { Ic } from "@/components/Ic";
import PriceGrade from "@/components/PriceGrade";
import {
  benchmarkFor, budgetMid, gradeBlurb, gradeBudget, money,
  type ServicePrice,
} from "@/lib/servicePricing";

/**
 * Budget input for the client's job request.
 *
 * Shows the typical price for whatever services are selected so the client
 * has an anchor before they type a number, then grades what they entered
 * against that same benchmark — the identical A+/A/A- the contractor will see
 * on the job card, so there are no surprises about how the job reads.
 *
 * "I'm flexible" clears the numbers; contractors then see only the category
 * average and quote from scratch.
 */
export default function BudgetPicker({
  services,
  pricing,
  min, max, flexible,
  onMin, onMax, onFlexible,
  error, errorId,
}: {
  services: string[];
  pricing: Record<string, ServicePrice>;
  min: string;
  max: string;
  flexible: boolean;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  onFlexible: (v: boolean) => void;
  error?: string;
  errorId?: string;
}) {
  const bm = benchmarkFor(services.join(", "), pricing);
  const lo = min.trim() === "" ? null : Number(min);
  const hi = max.trim() === "" ? null : Number(max);
  const mid = budgetMid(
    lo != null && isFinite(lo) ? lo : null,
    hi != null && isFinite(hi) ? hi : null,
  );
  const grade = flexible ? null : gradeBudget(mid, bm?.benchmark ?? null);

  const label: React.CSSProperties = {
    fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".1em",
    color: "rgba(var(--ff-muted), .5)", marginBottom: ".5rem", fontWeight: 600,
  };
  // Two 120px inputs + a "to" + the grade chip overflowed the ~276px dashboard
  // column on a phone; let them share the row instead of forcing a width.
  const inp: React.CSSProperties = {
    flex: "1 1 90px", minWidth: 0, maxWidth: "140px", padding: ".6rem .7rem", background: "rgba(var(--ff-fg), .06)",
    border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px",
    color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ marginTop: "1.75rem" }}>
      <p style={label}>
        What's your budget?{" "}
        <span style={{ color: "rgba(var(--ff-muted), .4)", textTransform: "none", letterSpacing: 0 }}>
          (optional — pros can see this)
        </span>
      </p>

      {/* Anchor: what this kind of job usually runs. */}
      {bm && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: ".5rem",
          padding: ".6rem .7rem", marginBottom: ".7rem", borderRadius: "10px",
          background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.22)",
        }}>
          <Ic name="dollar" size={14} color="#ea6b14" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: ".8rem", lineHeight: 1.5, color: "var(--ff-text)" }}>
            {services.length > 1 ? "These services together average " : "Jobs like this average "}
            <strong>{money(Math.round(bm.benchmark))}</strong>
            {bm.low > 0 && bm.high > 0 && (
              <span style={{ color: "rgba(var(--ff-muted), .6)" }}>
                {" "}· typically {money(bm.low)}–{money(bm.high)}
              </span>
            )}
            <span style={{ color: "rgba(var(--ff-muted), .5)", display: "block", marginTop: "2px", fontSize: ".74rem" }}>
              {bm.source === "jobs"
                ? "Based on jobs completed on Freddy Fix It."
                : "Based on our Calgary price guide — updates as jobs complete."}
            </span>
          </div>
        </div>
      )}

      <label style={{
        display: "flex", alignItems: "center", gap: ".5rem", cursor: "pointer",
        marginBottom: ".7rem", fontSize: ".85rem", color: "var(--ff-text)",
      }}>
        <input
          type="checkbox"
          checked={flexible}
          onChange={e => { onFlexible(e.target.checked); if (e.target.checked) { onMin(""); onMax(""); } }}
          style={{ cursor: "pointer", accentColor: "#ea6b14" }}
        />
        I'm flexible — send me quotes
      </label>

      {!flexible && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
            <input
              type="number" min={0} step={10} inputMode="numeric" placeholder="Min $"
              value={min} onChange={e => onMin(e.target.value)} aria-label="Budget minimum"
              style={inp}
            />
            <span style={{ color: "rgba(var(--ff-muted), .45)" }}>to</span>
            <input
              type="number" min={0} step={10} inputMode="numeric" placeholder="Max $"
              value={max} onChange={e => onMax(e.target.value)} aria-label="Budget maximum"
              style={inp}
            />
            {grade && <PriceGrade grade={grade} kind="budget" />}
          </div>

          {grade && (
            <p style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .6)", marginTop: ".5rem", lineHeight: 1.5 }}>
              {gradeBlurb(grade, "budget")}
              {grade === "A-" && " Pros can still bid, but a low budget usually means fewer bids."}
            </p>
          )}
        </>
      )}

      {error && <p id={errorId} style={{ color: "var(--ff-warn, #f59e0b)", fontSize: ".8rem", marginTop: ".4rem" }}>{error}</p>}

      <p style={{ fontSize: ".74rem", color: "rgba(var(--ff-muted), .4)", marginTop: ".5rem", lineHeight: 1.5 }}>
        Contractors see your budget when they view this job. You can change it any time before you accept a bid.
      </p>
    </div>
  );
}
