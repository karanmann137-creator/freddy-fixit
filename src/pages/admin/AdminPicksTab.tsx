// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { Group, Sheet, Row, Pill, Button } from "@/components/ui";
import { jobCode } from "@/lib/jobCode";

export default function AdminPicksTab(props: {
  tabNote: (key: string, text: string) => import("react/jsx-runtime").JSX.Element | null;
  picksFailed: boolean;
  loadAll: () => Promise<void>;
  picks: any[];
}) {
  const { tabNote, picksFailed, loadAll, picks } = props;
  return (
    <div>
            {tabNote("picks", "Every contractor a client has been matched with, newest first — who won, at what price, and how many bids they beat.")}
            {picksFailed && (
              <p style={{ color:"var(--ff-warn)", fontSize:".9rem" }}>
                Couldn&rsquo;t load the picks feed. <Button onClick={() => loadAll()}>Retry</Button>
              </p>
            )}
            {!picksFailed && picks.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No picks yet. This fills in as clients choose contractors.</p>}
            {/* ── A genuine LIST OF ROWS, so it is a <Sheet> and not a stack of
                cards. Each pick is one fact with no controls on it — the tab is
                a record, not a workspace — which is exactly the shape Row was
                written for. Four separately-padded card boxes per pick were
                four boxes saying one thing.

                `amount` carries the price because Row renders it in the numeral
                slot; `right` carries HOW the pick happened as a <Pill>, which
                replaced a hand-rolled chip whose colour came from a local
                `how.color` — including a raw --ff-c10 for "rehired", a second
                orange on a screen that has no action on it at all. */}
            {picks.length > 0 && (
              <Group label={"PICKS (" + picks.length + ")"}>
                <Sheet>
                  {picks.map((p: any) => {
                    const how = p.how === "client_pick" ? { label:"Client picked", tone:"good" as const }
                              : p.how === "rehire"      ? { label:"Rehired their pro", tone:"neutral" as const }
                              :                            { label:"Assigned by admin", tone:"neutral" as const };
                    const price = p.winning_amount ?? p.amount;
                    return (
                      <Row
                        key={p.job_id}
                        icon="star"
                        tone="neutral"
                        title={<>{p.service || "Job"} <span style={{ fontFamily:"monospace", fontSize:".8em", opacity:.7 }}>{jobCode(p.job_id)}</span></>}
                        sub={
                          <>
                            {(p.client_name || "Client") + " chose " + (p.contractor_name || p.company_name || "a contractor")}
                            {p.company_name && p.contractor_name ? " (" + p.company_name + ")" : ""}
                            {p.bid_count > 0 ? " · from " + p.bid_count + (p.bid_count === 1 ? " bid" : " bids") : " · no bids"}
                            {" · " + p.job_status}
                            {p.location ? " · " + p.location : ""}
                            {" · " + new Date(p.picked_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}
                          </>
                        }
                        amount={price != null ? "$" + price : undefined}
                        right={<Pill tone={how.tone}>{how.label}</Pill>}
                      />
                    );
                  })}
                </Sheet>
              </Group>
            )}
          </div>
  );
}
