// Extracted from src/pages/ContractorDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { Ic } from "@/components/Ic";
import { DashCard, Pill } from "@/components/ui";
import { scoreTone } from "./shared";

export default function ContractorReviewsTab(props: {
  myReviews: any[];
  s: { jobCard: { background: string; border: string; borderRadius: string; padding: string; marginBottom: string; cursor: string; }; btn: { minHeight: string; padding: string; background: string; border: string; borderRadius: string; color: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; primaryBtn: { minHeight: string; padding: string; background: string; color: string; border: string; borderRadius: string; boxShadow: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; earnCard: { background: string; border: string; borderRadius: string; padding: string; textAlign: "center"; }; chip: { padding: string; background: string; border: string; borderRadius: string; fontSize: string; color: string; display: string; margin: string; }; };
}) {
  const { myReviews, s } = props;
  return (
    (
          <div>
            {myReviews.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="star" size={48} color="var(--ff-c10)" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".5rem" }}>No Reviews Yet</h2>
                <p style={{ color:"rgba(var(--ff-muted), .5)" }}>Reviews from clients appear here after jobs are completed.</p>
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(130px, 100%), 1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
                  {[
                    ["Price", myReviews.reduce((a,r)=>a+(r.price_score??0),0)/myReviews.length || 0],
                    ["Experience", myReviews.reduce((a,r)=>a+(r.experience_score??0),0)/myReviews.length || 0],
                    ["Results", myReviews.reduce((a,r)=>a+(r.result_score??0),0)/myReviews.length || 0],
                  ].map(([label, avg]) => (
                    <div key={String(label)} style={s.earnCard}>
                      {/* Same rule as the per-review chips, and the same reason:
                          the raw `#ea6b14` here is both a hardcoded hex (so it
                          never answered to light mode) and a value-blind one. The
                          tokens below each carry a light override and an
                          `.ff-on-dark` literal, so this now survives both themes. */}
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.7rem", lineHeight:1.1, color: (avg as number) >= 8 ? "var(--ff-success)" : (avg as number) >= 5 ? "var(--ff-text)" : "var(--ff-warn)", marginBottom: "var(--ff-s1)" }}>{(avg as number).toFixed(1)}<span style={{ fontSize:"1rem", color:"rgba(var(--ff-muted), .4)" }}>/10</span></div>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)" }}>{label}</div>
                    </div>
                  ))}
                </div>
                {myReviews.map(r => (
                  <DashCard key={r.id} style={{ marginBottom:"1rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:".75rem" }}>
                      <div style={{ fontWeight:500, color:"var(--ff-text)" }}>{r.client?.first_name ?? "Client"}</div>
                      <div style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)" }}>{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display:"flex", gap:".5rem", marginBottom:".75rem", flexWrap:"wrap" as const }}>
                      {[["Price", r.price_score], ["Experience", r.experience_score], ["Results", r.result_score]].map(([l, v]) => v != null && (
                        <Pill key={String(l)} tone={scoreTone(Number(v))}>{l}: {v}/10</Pill>
                      ))}
                    </div>
                    {r.comment && <p style={{ fontSize:".88rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6, margin:0 }}>{r.comment}</p>}
                  </DashCard>
                ))}
              </>
            )}
          </div>
        )
  );
}
