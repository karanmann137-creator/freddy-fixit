import { Ic } from "@/components/Ic";
import { benchmarkFor, money, type ServicePrice } from "@/lib/servicePricing";

/**
 * What this kind of job usually costs. READ-ONLY — the client no longer names
 * a number at all.
 *
 * THE CLIENT WAS ASKED THE ONE QUESTION THEY CANNOT ANSWER (2026-09-11). This
 * started as two free-text money fields, then one. Both versions asked someone
 * who is on the form *because they don't know what the work costs* to tell us
 * what it costs, and a wrong guess didn't fail loudly — it failed silently. A
 * $40 ceiling on a job that starts at $150 reads to every contractor as a
 * client who will be unhappy with a real quote, so the request quietly drew no
 * bids and neither side ever learned why. Removing the last field removes that
 * failure by construction: there is no longer a number for the client to get
 * wrong.
 *
 * What is left is the one number we can actually stand behind — the category
 * BENCHMARK from `benchmarkFor`, which is the average of real completed jobs
 * once a category has 5+ of them and the midpoint of the curated Calgary price
 * book before that. It is shown as information, not as an input.
 *
 * The platform STARTING price is deliberately not shown here any more. Two
 * numbers side by side invited the client to anchor on the smaller one, which
 * is the same anchoring problem the max field had, just pointing the other way.
 * `floorFor()` is still computed by the PARENT and still written into
 * `client_requests.budget_min` — it is a fact about the work rather than a
 * preference of theirs, and the contractor side still reads it (see `targetBid`
 * in servicePricing.ts, which refuses to suggest anything below it).
 *
 * There is nothing to validate here, so this component takes no error props and
 * no change handlers. It stays a shared component rather than inline markup for
 * the reason it always was: it is mounted by BOTH ClientOnboarding and
 * NewRequest, and a pasted second copy is how two forms that must agree start
 * disagreeing with no error to show for it.
 */
export default function BudgetPicker({
  services,
  pricing,
}: {
  services: string[];
  pricing: Record<string, ServicePrice>;
}) {
  const bm = benchmarkFor(services.join(", "), pricing);

  // Nothing known about these services — say nothing rather than invent a
  // figure. A price we made up is worse than no price.
  if (!bm) return null;

  const label: React.CSSProperties = {
    fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".1em",
    color: "rgba(var(--ff-muted), .5)", marginBottom: ".5rem", fontWeight: 600,
  };

  return (
    <div style={{ marginTop: "1.75rem" }}>
      <p style={label}>What this usually costs</p>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: ".5rem",
        padding: ".7rem .8rem", borderRadius: "10px",
        background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.22)",
      }}>
        <Ic name="dollar" size={14} color="#ea6b14" style={{ marginTop: 3, flexShrink: 0 }} />
        <div style={{ fontSize: ".85rem", lineHeight: 1.5, color: "var(--ff-text)" }}>
          {services.length > 1 ? "Jobs like these come in around " : "Jobs like this come in around "}
          <strong>{money(Math.round(bm.benchmark))}</strong>
          <span style={{ color: "rgba(var(--ff-muted), .5)", display: "block", marginTop: "3px", fontSize: ".74rem" }}>
            {bm.source === "jobs"
              ? "Based on jobs completed on Freddy Fix It."
              : "Based on our Calgary price guide — updates as jobs complete."}
          </span>
        </div>
      </div>

      <p style={{ fontSize: ".74rem", color: "rgba(var(--ff-muted), .4)", marginTop: ".5rem", lineHeight: 1.5 }}>
        This is a guide, not a quote. Local pros will send you real estimates for your job, and you choose which one to accept.
      </p>
    </div>
  );
}
