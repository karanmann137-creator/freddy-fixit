// Extracted from src/pages/ClientDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { Group, Sheet, Row, Pill, Button } from "@/components/ui";
import { freqLabel } from "@/lib/recurrence";
import { Ic } from "@/components/Ic";

export default function ClientRecurringTab(props: {
  plans: any[];
  busyPlan: string | null;
  prepayPlan: (plan: any, n: number) => Promise<void>;
  togglePlan: (plan: any) => Promise<void>;
}) {
  const { plans, busyPlan, prepayPlan, togglePlan } = props;
  return (
    (plans.length > 0 ? (
          /* ── Recurring plans ──────────────────────────────────────────────
             ⚠️ MONEY SURFACE, PRESENTATION-ONLY PORT. `prepayPlan(pl, n)` and
             `togglePlan(pl)` are called with identical arguments, and all four
             derivations below (`paused`, `cadence`, `hasPool`, `remaining`)
             are byte-identical to what they replaced. **Touches none of the
             four payout guards** — pool money lives on
             `recurring_prepayments`, never on `funded_amount`, so nothing here
             can move `fully_funded`. Verified by diffing the block against
             HEAD rather than by eye.

             ── Why ONE SHEET PER PLAN and not one sheet of plan rows ────────
             A plan carries up to three actions (Prepay 2, Prepay 3, Pause) and
             an optional prepaid-balance line. `.ffu-rr` is `white-space:nowrap`
             with no wrap, and the row grid is `gut / minmax(0,1fr) / auto` — so
             cramming three buttons into `right` crushes the service name to
             nothing on a 372px phone. A plan genuinely IS a card, so each gets
             its own Sheet: the win over v1 is not fewer boxes, it is that the
             box's inset, radius and hairline now come from the token scale
             instead of a hand-rolled `12px` + `1rem` + `.03` alpha per card.

             `ButtonRow` is deliberately NOT used — it is exactly two columns
             and there can be three buttons here.

             The subtitle keeps the consumer-facing wording "held securely" —
             CLAUDE.md names the banned alternative; don't reintroduce it, and
             don't write it into this file even as a comment, because a
             repo-wide grep for it is a real audit and a comment is a false
             positive in it. */
          <Group
            label="Recurring plans"
            action={<span style={{ opacity:.7 }}>{plans.length}</span>}
          >
            <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"var(--ff-s3)" }}>We&rsquo;ll line up each visit automatically. Prepay ahead to lock it in — held securely, released one visit at a time.</div>
            <div style={{ display:"flex", flexDirection:"column" as const, gap:"var(--ff-s3)" }}>
              {plans.map(pl => {
                const paused = pl.recurring_plan_status !== "active";
                const cadence = pl.recurring_frequency === "per_km"
                  ? (pl.recurring_interval_km ? `Every ~${Number(pl.recurring_interval_km).toLocaleString()} km` : "By distance")
                  : (freqLabel(pl.recurring_frequency) || "Recurring");
                const hasPool = pl.prepay_id && (pl.prepay_status === "held" || pl.prepay_status === "partially_released");
                const remaining = hasPool ? Math.max(0, Number(pl.prepay_total || 0) - Number(pl.prepay_released || 0)) : 0;
                return (
                  <Sheet key={pl.request_id}>
                    {/* tone follows the pill: warn when paused, good when
                        running. Neither is accent — a recurring plan ticking
                        along is the opposite of "this is on you". */}
                    <Row
                      icon="calendar"
                      tone={paused ? "warn" : "good"}
                      title={pl.service_needed}
                      sub={
                        <>
                          {cadence}{pl.contractor_company ? ` · ${pl.contractor_company}` : ""}{pl.next_due ? ` · next ${new Date(pl.next_due).toLocaleDateString()}` : ""}
                          {hasPool && (
                            <span style={{ display:"block", color:"var(--ff-success)", marginTop:".3rem" }}>
                              <Ic name="check-circle" size={12} style={{ marginRight:4 }} />
                              {remaining} of {pl.prepay_total} prepaid visit{Number(pl.prepay_total)===1?"":"s"} remaining.
                            </span>
                          )}
                        </>
                      }
                      right={<Pill tone={paused ? "warn" : "good"}>{paused ? "Paused" : "Active"}</Pill>}
                    />
                    {/* The strip sits outside the Row, inside the Sheet. It
                        gets the sheet's own inset (--ff-s4) so the buttons
                        line up with the row's text column above them, and a
                        hairline above it so it reads as the row's footer
                        rather than as a second, unexplained row. */}
                    <div style={{ display:"flex", gap:"var(--ff-s2)", flexWrap:"wrap" as const, padding:"var(--ff-s3) var(--ff-s4)", borderTop:"var(--ff-hair-w) solid var(--ff-hair)" }}>
                      {!hasPool && !paused && [2,3].map(n => (
                        <Button key={n} variant="primary" loading={busyPlan===pl.request_id} onClick={() => prepayPlan(pl, n)}>
                          Prepay {n} visits
                        </Button>
                      ))}
                      <Button disabled={busyPlan===pl.request_id} onClick={() => togglePlan(pl)}>
                        {paused ? "Resume plan" : "Pause plan"}
                      </Button>
                    </div>
                  </Sheet>
                );
              })}
            </div>
          </Group>
        ) : (
          <div style={{ textAlign:"center", padding:"3.5rem 2rem" }}>
            <div style={{ marginBottom:"1rem" }}><Ic name="repeat" size={44} color="var(--ff-c10)" /></div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".4rem" }}>No recurring plans</h2>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".9rem" }}>Book a job as recurring and we'll line up each visit automatically — you can manage and prepay them here.</p>
          </div>
        ))
  );
}
