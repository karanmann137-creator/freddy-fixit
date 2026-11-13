// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { DashCard, Group, Sheet, Row, Button } from "@/components/ui";
import { Sk } from "@/components/Skeleton";

export default function AdminHealthTab(props: {
  health: any;
  healthFailed: boolean;
  loadAll: () => Promise<void>;
}) {
  const { health, healthFailed, loadAll } = props;
  return (
    <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Things that may need your attention. Buckets only show items that have been waiting too long.
            </p>
            {!health && (healthFailed
              ? <p style={{ color:"var(--ff-warn)" }}>Couldn&rsquo;t load the health checks. <Button onClick={() => loadAll()}>Retry</Button></p>
              : <div aria-busy="true" style={{ display:"grid", gap:".75rem" }}>
                  <span className="ff-sr-only">Loading the health checks</span>
                  <Sk h={54} r={10} /><Sk h={54} r={10} /><Sk h={54} r={10} />
                </div>)}
            {health && (() => {
              const buckets: { key:string; title:string; hint:string; count:number; items:any[] }[] = [
                { key:"no_bid", title:"Requests with no bids", hint:"Pending & unassigned for over 24h — may need a contractor invited.", count: health.no_bid_count||0, items: health.no_bid||[] },
                { key:"awaiting_approval", title:"Waiting on client approval", hint:"Contractor proposed a time over 2 days ago, client hasn't approved.", count: health.awaiting_approval_count||0, items: health.awaiting_approval||[] },
                { key:"awaiting_confirm", title:"Waiting on client confirmation", hint:"Job completed over 2 days ago, client hasn't confirmed (auto-confirms at 3 days).", count: health.awaiting_confirm_count||0, items: health.awaiting_confirm||[] },
                { key:"stale_disputes", title:"Stale open disputes", hint:"Disputes open for over 3 days.", count: health.stale_disputes_count||0, items: health.stale_disputes||[] },
              ];
              const allClear = buckets.every(b => b.count === 0);
              return (
                <>
                  <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const, marginBottom:"1.25rem" }}>
                    {/* `flex` and `margin:0` are the only overrides, and both are
                        position-in-a-row rather than look — the card's own
                        radius, padding, ground and hairline all survive. */}
                    <DashCard style={{ flex:"1 1 180px", margin:0, textAlign:"center" as const }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"var(--ff-c10)", lineHeight:1 }}>{health.new_leads_count ?? 0}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:".35rem" }}>New estimate leads</div>
                    </DashCard>
                    <DashCard style={{ flex:"1 1 180px", margin:0, textAlign:"center" as const }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"var(--ff-warn)", lineHeight:1 }}>{health.pending_contractors_count ?? 0}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:".35rem" }}>Contractors awaiting review</div>
                    </DashCard>
                  </div>
                  {allClear && <p style={{ color:"var(--ff-success)", fontSize:".9rem" }}>● All clear — nothing is overdue right now.</p>}
                  {/* Each bucket is a <Group> of <Row>s: four stacked facts and no
                      control is a row, not a card. The buckets' hand-rolled
                      Bebas heading was `var(--ff-warn)` amber; the Group label is
                      the neutral shared caption and the URGENCY moved onto the
                      rows themselves as `tone="warn"`, which is where it belongs
                      — the heading says what the bucket IS, the rows say that
                      each item is overdue. */}
                  {buckets.map(b => b.count > 0 && (
                    <Group key={b.key} label={b.title.toUpperCase() + " (" + b.count + ")"}>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginBottom:".6rem", padding:"0 var(--ff-s3)" }}>{b.hint}</div>
                      <Sheet>
                        {b.items.map((it:any) => (
                          <Row key={it.id} icon="alert-triangle" tone="warn"
                            title={it.service_needed || it.service || it.reason || "Item"}
                            sub={
                              <>
                                {(it.first_name || it.last_name || it.client_name)
                                  ? (it.client_name || `${it.first_name||""} ${it.last_name||""}`.trim())
                                  : ""}
                                {it.location ? " · " + it.location : ""}
                                {(it.created_at || it.since)
                                  ? " · since " + new Date(it.created_at || it.since).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })
                                  : ""}
                              </>
                            }
                          />
                        ))}
                      </Sheet>
                    </Group>
                  ))}
                </>
              );
            })()}
          </div>
  );
}
