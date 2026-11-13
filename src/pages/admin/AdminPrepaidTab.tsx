// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { Group, Sheet, Row, Pill, Button } from "@/components/ui";

export default function AdminPrepaidTab(props: {
  prepaysFailed: boolean;
  loadAll: () => Promise<void>;
  prepays: any[];
  busyRefund: string | null;
  refundPrepay: (pp: any) => Promise<void>;
}) {
  const { prepaysFailed, loadAll, prepays, busyRefund, refundPrepay } = props;
  return (
    <div>
            {prepaysFailed && (
              <p style={{ color:"var(--ff-warn)", fontSize:".9rem" }}>
                Couldn&rsquo;t load the prepaid plans. Don&rsquo;t treat this as &ldquo;no money on file&rdquo;. <Button onClick={() => loadAll()}>Retry</Button>
              </p>
            )}
            {!prepaysFailed && prepays.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No prepaid recurring plans yet.</p>}
            {/* A genuine list of records with one control each, so a <Sheet> of
                <Row>s rather than N cards. The `right` slot carries either the
                refund Button or the reason there is nothing to refund — the two
                are mutually exclusive and answer the same question, so they
                belong in the same place rather than one above the other. */}
            {prepays.length > 0 && (
              <Group label={"PREPAID PLANS (" + prepays.length + ")"}>
                <Sheet>
                  {prepays.map(pp => {
                    const perOcc = Number(pp.amount_per_occurrence || 0) + Number(pp.client_fee_per || 0);
                    const refundable = Math.max(0, Number(pp.total_charged || 0) - Number(pp.occurrences_released || 0) * perOcc);
                    const canRefund = (pp.status === "held" || pp.status === "partially_released") && refundable > 0;
                    const who = pp.client ? `${pp.client.first_name ?? ""} ${pp.client.last_name ?? ""}`.trim() : "";
                    return (
                      <Row key={pp.id} icon="dollar" tone="neutral"
                        title={(pp.plan?.service_needed || "Recurring plan") + (who ? " · " + who : "")}
                        sub={
                          <>
                            {String(pp.status)}
                            {" · visits " + pp.occurrences_released + "/" + pp.occurrences_total + " released"}
                            {" · charged $" + Number(pp.total_charged || 0).toFixed(2)}
                            {" · refundable now $" + refundable.toFixed(2)}
                          </>
                        }
                        right={canRefund ? (
                          <Button variant="danger" disabled={busyRefund === pp.id} onClick={() => refundPrepay(pp)}>
                            {busyRefund === pp.id ? "…" : "Refund unreleased"}
                          </Button>
                        ) : (
                          <Pill tone="neutral">{pp.status === "refunded" ? "Refunded" : pp.status === "released" ? "Fully released" : "Nothing refundable"}</Pill>
                        )}
                      />
                    );
                  })}
                </Sheet>
              </Group>
            )}
          </div>
  );
}
