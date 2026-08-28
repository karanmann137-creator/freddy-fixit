import { Ic } from "@/components/Ic";
import PriceGrade from "@/components/PriceGrade";
import {
  benchmarkFor, budgetMid, gradeBlurb, gradeBudget, money,
  type ServicePrice,
} from "@/lib/servicePricing";

/**
 * Budget input for the client's job request.
 *
 * THE MINIMUM IS OURS, NOT THEIRS (2026-08-28). The client used to type both a
 * min and a max. Two free-text money fields on a form is two decisions from
 * someone who by definition doesn't know what the work costs — that's why they
 * are asking us — and the number they most often got wrong was the minimum,
 * which is the one that decides whether any pro bids at all. A request with a
 * $40 floor on a job that starts at $150 reads to every contractor as a client
 * who will be unhappy with a real quote, so it quietly gets no bids and neither
 * side ever learns why.
 *
 * So the floor is now the platform's starting price for the selected services
 * (`floorFor` → `service_pricing.base_price`, computed by the PARENT and passed
 * in, so the number shown here is byte-identical to the one written into
 * `client_requests.budget_min`). The client picks one number: the most they
 * want to spend.
 *
 * The grade still runs on the MIDPOINT of floor and max, not on max alone —
 * `public.budget_grade()` grades the stored `budget_min`/`budget_max` the same
 * way, and a chip here that disagreed with the chip the contractor sees on the
 * same job would be worse than no chip.
 *
 * "I'm flexible" clears the max. The floor is still stored, because it is a
 * fact about the work rather than a preference of theirs, and it's the anchor
 * the contractor actually wants.
 */
export default function BudgetPicker({
  services,
  pricing,
  floor,
  max, flexible,
  onMax, onFlexible,
  error, errorId,
}: {
  services: string[];
  pricing: Record<string, ServicePrice>;
  /** Platform starting price from `floorFor()`. null = unknown service, hide it. */
  floor: number | null;
  max: string;
  flexible: boolean;
  onMax: (v: string) => void;
  onFlexible: (v: boolean) => void;
  error?: string;
  errorId?: string;
}) {
  const bm = benchmarkFor(services.join(", "), pricing);
  const hi = max.trim() === "" ? null : Number(max);
  const hiNum = hi != null && isFinite(hi) ? hi : null;
  const mid = budgetMid(floor, hiNum);
  const grade = flexible ? null : gradeBudget(mid, bm?.benchmark ?? null);
  const belowFloor = !flexible && floor != null && hiNum != null && hiNum < floor;

  const label: React.CSSProperties = {
    fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".1em",
    color: "rgba(var(--ff-muted), .5)", marginBottom: ".5rem", fontWeight: 600,
  };
  // One 140px input + the grade chip has to survive the ~276px dashboard column
  // on a phone, so it shares the row rather than forcing a width.
  const inp: React.CSSProperties = {
    flex: "1 1 110px", minWidth: 0, maxWidth: "160px", padding: ".6rem .7rem", background: "rgba(var(--ff-fg), .06)",
    border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px",
    color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ marginTop: "1.75rem" }}>
      <p style={label}>
        What's the most you'd like to spend?{" "}
        <span style={{ color: "rgba(var(--ff-muted), .4)", textTransform: "none", letterSpacing: 0 }}>
          (optional — pros can see this)
        </span>
      </p>

      {/* Our starting price. Read-only on purpose: it's what the work costs,
          not something to negotiate on a form. */}
      {floor != null && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: ".5rem",
          padding: ".6rem .7rem", marginBottom: ".7rem", borderRadius: "10px",
          background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.22)",
        }}>
          <Ic name="dollar" size={14} color="#ea6b14" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: ".8rem", lineHeight: 1.5, color: "var(--ff-text)" }}>
            {services.length > 1 ? "These services start at " : "This kind of job starts at "}
            <strong>{money(floor)}</strong>
            {bm && (
              <span style={{ color: "rgba(var(--ff-muted), .6)" }}>
                {" "}· most come in around {money(Math.round(bm.benchmark))}
              </span>
            )}
            <span style={{ color: "rgba(var(--ff-muted), .5)", display: "block", marginTop: "2px", fontSize: ".74rem" }}>
              {bm?.source === "jobs"
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
          onChange={e => { onFlexible(e.target.checked); if (e.target.checked) onMax(""); }}
          style={{ cursor: "pointer", accentColor: "#ea6b14" }}
        />
        I'm flexible — send me quotes
      </label>

      {!flexible && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: ".85rem", color: "rgba(var(--ff-muted), .6)" }}>Up to</span>
            <input
              type="number" min={0} step={10} inputMode="numeric" placeholder="Max $"
              value={max} onChange={e => onMax(e.target.value)} aria-label="Most you'd like to spend"
              style={inp}
            />
            {grade && !belowFloor && <PriceGrade grade={grade} kind="budget" />}
          </div>

          {/* Said as information, not as a rejection — the number isn't wrong,
              it's just below what anyone could do the work for, and they can
              only know that if we say it. */}
          {belowFloor && (
            <p style={{ fontSize: ".78rem", color: "var(--ff-warn, #f59e0b)", marginTop: ".5rem", lineHeight: 1.5 }}>
              That's under our {money(floor)} starting price for this work, so you probably won't get any estimates. Try {money(floor)} or more.
            </p>
          )}

          {grade && !belowFloor && (
            <p style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .6)", marginTop: ".5rem", lineHeight: 1.5 }}>
              {gradeBlurb(grade, "budget")}
              {grade === "A-" && " Pros can still bid, but a low budget usually means fewer bids."}
            </p>
          )}
        </>
      )}

      {error && <p id={errorId} style={{ color: "var(--ff-warn, #f59e0b)", fontSize: ".8rem", marginTop: ".4rem" }}>{error}</p>}

      <p style={{ fontSize: ".74rem", color: "rgba(var(--ff-muted), .4)", marginTop: ".5rem", lineHeight: 1.5 }}>
        Contractors see this when they view your job. You can change it any time before you accept a bid.
      </p>
    </div>
  );
}
