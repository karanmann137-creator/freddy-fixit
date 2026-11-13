// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { DashCard, Pill, Button } from "@/components/ui";
import FadeImg from "@/components/FadeImg";

export default function AdminDisputesTab(props: {
  disputes: any[];
  s: { title: { fontSize: string; fontWeight: number; color: string; marginBottom: string; }; meta: { fontSize: string; color: string; marginBottom: string; }; };
  disputePhotos: Record<string, string[]>;
  disputeRespPhotos: Record<string, string[]>;
  resolveNote: Record<string, string>;
  setResolveNote: import("react").Dispatch<import("react").SetStateAction<Record<string, string>>>;
  busyResolve: string | null;
  resolveDispute: (d: any, action: "refund_full" | "refund_partial" | "release") => Promise<void>;
  partialAmt: Record<string, string>;
  setPartialAmt: import("react").Dispatch<import("react").SetStateAction<Record<string, string>>>;
}) {
  const { disputes, s, disputePhotos, disputeRespPhotos, resolveNote, setResolveNote, busyResolve, resolveDispute, partialAmt, setPartialAmt } = props;
  return (
    <div>
            {disputes.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No disputes yet.</p>}
            {disputes.map(d => {
              const job = d.job ?? {};
              const charged = Number(job.total_charged ?? job.amount ?? 0);
              const payout = Number(job.contractor_payout ?? 0);
              const statusLabel: Record<string, string> = {
                open: "Open — needs review",
                resolved_refund: "Resolved — full refund",
                resolved_partial: "Resolved — partial refund",
                resolved_released: "Resolved — released to contractor",
                rejected: "Rejected",
              };
              return (
                /* A <DashCard>, not a <Row>: a dispute carries evidence photos,
                   a quoted declaration, the contractor's response and a
                   three-way resolution form. The open-state `borderColor` is a
                   longhand so the class's hairline WIDTH survives. */
                <DashCard key={d.id} style={d.status === "open" ? { borderColor:"rgba(251,191,36,.4)" } : undefined}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                    <div style={s.title}>{d.reason}</div>
                    <Pill tone={d.status === "open" ? "warn" : "good"}>{statusLabel[d.status] ?? d.status}</Pill>
                  </div>
                  <div style={s.meta}>Job {String(d.job_id).slice(0,8)} · Charged ${charged.toFixed(2)} · Contractor payout ${payout.toFixed(2)}</div>
                  <div style={s.meta}>Reported {new Date(d.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>
                  {d.description && (
                    <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>{d.description}</div>
                  )}
                  {(disputePhotos[d.id]?.length ?? 0) > 0 && (
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginTop:".6rem" }}>
                      {disputePhotos[d.id].map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <FadeImg src={url} alt={"Evidence " + (i+1)} style={{ width:"110px", height:"110px", objectFit:"cover", borderRadius:"8px", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)" }} />
                        </a>
                      ))}
                    </div>
                  )}

                  {(d.agreed_scope || d.requested_remedy || d.service_date || d.amount_in_dispute != null || d.declarant_name) && (
                    <div style={{ marginTop:".6rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .02)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".8rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6 }}>
                      {d.service_date && <div>Date of service: <strong style={{ color:"rgba(var(--ff-fg), .9)" }}>{d.service_date}</strong></div>}
                      {d.agreed_scope && <div>What was agreed: {d.agreed_scope}</div>}
                      {d.requested_remedy && <div>Requested outcome: <strong style={{ color:"rgba(var(--ff-fg), .9)" }}>{d.requested_remedy}</strong></div>}
                      {d.amount_in_dispute != null && <div>Amount in dispute: ${Number(d.amount_in_dispute).toFixed(2)}</div>}
                      {d.declarant_name && <div style={{ marginTop:".3rem", fontStyle:"italic" as const, color:"rgba(var(--ff-muted), .6)" }}>Declared true &amp; signed by {d.declarant_name}</div>}
                    </div>
                  )}

                  <div style={{ marginTop:".6rem", padding:".6rem .8rem", background: d.contractor_responded_at ? "rgba(var(--ff-info-rgb), .07)" : "rgba(251,191,36,.06)", border: "1px solid " + (d.contractor_responded_at ? "rgba(var(--ff-info-rgb), .3)" : "rgba(251,191,36,.25)"), borderRadius:"8px", fontSize:".82rem", lineHeight:1.5 }}>
                    {d.contractor_responded_at ? (
                      <>
                        <div style={{ fontWeight:600, color:"var(--ff-info)", marginBottom:".3rem" }}>Contractor responded</div>
                        <div style={{ color:"rgba(var(--ff-muted), .85)" }}>{d.contractor_response}</div>
                        {(disputeRespPhotos[d.id]?.length ?? 0) > 0 && (
                          <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginTop:".5rem" }}>
                            {disputeRespPhotos[d.id].map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer">
                                <FadeImg src={url} alt={"Response " + (i+1)} style={{ width:"90px", height:"90px", objectFit:"cover" as const, borderRadius:"8px", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)" }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ color:"var(--ff-warn)" }}>
                        Awaiting contractor response{d.response_deadline ? " — due " + new Date(d.response_deadline).toLocaleDateString("en-CA", { dateStyle:"medium" }) : ""}.
                      </div>
                    )}
                  </div>

                  {d.status === "open" ? (
                    <div style={{ marginTop: "var(--ff-s4)", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .07)", paddingTop: "var(--ff-s4)" }}>
                      <textarea value={resolveNote[d.id] ?? ""} rows={2} placeholder="Resolution note (optional, shared internally)"
                        onChange={e => setResolveNote(p => ({ ...p, [d.id]: e.target.value }))}
                        style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem", boxSizing:"border-box" as const, resize:"vertical" as const, marginBottom: "var(--ff-s3)" }} />
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                        {/* ⚠️ NONE of the three resolutions is `primary`, and that
                            is a decision rather than an oversight. They are
                            mutually exclusive ways to move real money and the
                            platform has no view on which is right — an orange
                            button here would read as a recommendation we cannot
                            make. The full refund is `danger` because it reverses
                            a charge; the other two are plain. */}
                        <Button variant="danger" disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "refund_full")}>{busyResolve === d.id ? "…" : "Refund client in full"}</Button>
                        <Button disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "release")}>Release to contractor</Button>
                      </div>
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center", marginTop:".6rem" }}>
                        <input type="number" min={0} max={charged} step="0.01" value={partialAmt[d.id] ?? ""} placeholder="Partial $"
                          onChange={e => setPartialAmt(p => ({ ...p, [d.id]: e.target.value }))}
                          style={{ width:"110px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem" }} />
                        <Button disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "refund_partial")}>Partial refund + pay contractor</Button>
                      </div>
                      <div style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .45)", marginTop:".55rem", lineHeight:1.45 }}>Full refund returns the whole charge to the client and pays nothing out. Partial refund returns part to the client and still pays the contractor their payout. Release pays the contractor and keeps the charge.</div>
                    </div>
                  ) : (
                    <div style={{ ...s.meta, marginTop:".6rem", color:"var(--ff-success)" }}>
                      {d.refund_amount != null ? `Refunded $${Number(d.refund_amount).toFixed(2)}. ` : ""}
                      {d.resolved_at ? "Resolved " + new Date(d.resolved_at).toLocaleDateString() : ""}
                      {d.resolution_note ? ` — ${d.resolution_note}` : ""}
                    </div>
                  )}
                </DashCard>
              );
            })}
          </div>
  );
}
