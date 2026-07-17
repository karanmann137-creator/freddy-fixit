import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";

export default function ContractorProfile() {
  const [, params]    = useRoute("/contractors/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const [contractor, setContractor] = useState<any>(null);
  const [portfolio,  setPortfolio]  = useState<any[]>([]);
  const [reviews,    setReviews]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [myRole,     setMyRole]     = useState<string | null>(null);
  const [admin,      setAdmin]      = useState<any>(null); // full detail, admin viewers only
  const [busyStatus, setBusyStatus] = useState(false);
  const [adminMsg,   setAdminMsg]   = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      // Ensure the auth session is hydrated from storage BEFORE we query. On a
      // fresh tab (e.g. admin clicking "View Profile ↗" which opens a new tab)
      // the RPC could otherwise fire before the JWT is attached, so is_admin()
      // would be false and a pending/inactive contractor would look "not found".
      const { data: { session } } = await supabase.auth.getSession();

      // Know who's viewing so "← Back" can return to THEIR dashboard when this
      // page was opened in a fresh tab (no history to go back to) — and so an
      // admin gets the full review panel with everything needed to approve.
      if (session?.user) {
        const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
        setMyRole(me?.role ?? null);
        if (me?.role === "admin") {
          supabase.rpc("admin_get_contractor_detail", { p_id: id })
            .then(({ data }) => setAdmin(data ?? null));
        }
      }

      // RPC instead of the contractor_directory view: returns the same
      // contact-free columns, but lets admins preview contractors of any
      // status (pending/inactive) while the public still only sees active ones.
      const { data: con } = await supabase
        .rpc("get_contractor_profile", { p_id: id })
        .maybeSingle();
      setContractor(con);

      const { data: pf } = await supabase
        .from("portfolio_items")
        .select("*")
        .eq("contractor_id", id)
        .order("created_at", { ascending: false });
      setPortfolio(pf ?? []);

      // RPC (SECURITY DEFINER) so logged-out visitors get the reviewer's first
      // name too — profiles has no public read policy, so a direct join would
      // show "Client" for everyone. The fn returns only the first name + scores.
      const { data: revs } = await supabase
        .rpc("get_contractor_reviews", { p_id: id });
      setReviews(revs ?? []);

      setLoading(false);
    })();
  }, [id]);

  // "Back" returns to the previous page when there's real history (in-app nav).
  // When this page was opened in a NEW tab (e.g. admin "View Profile ↗") there is
  // no history, so send signed-in users to their own dashboard instead of home.
  const goBack = () => {
    if (window.history.length > 1) { window.history.back(); return; }
    if (myRole === "admin") setLocation("/admin-dashboard");
    else if (myRole === "contractor") setLocation("/contractor-dashboard");
    else if (myRole === "client") setLocation("/client-dashboard");
    else setLocation("/");
  };

  const pfUrl = (path: string) =>
    supabase.storage.from("portfolio-photos").getPublicUrl(path).data.publicUrl;
  const avatarUrl = (path: string) =>
    supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;

  // ── Admin-only helpers ────────────────────────────────────────────────────
  const DOC_LABELS: Record<string, string> = {
    gov_id: "Government ID", insurance: "Insurance certificate",
    wcb: "WCB clearance", certification: "Trade certification",
  };

  // Docs live in the PRIVATE contractor-docs bucket — open via signed URL.
  const openDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("contractor-docs").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { setAdminMsg("Couldn't open that document — try again."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const setStatus = async (status: "active" | "inactive") => {
    if (!id || busyStatus) return;
    setBusyStatus(true); setAdminMsg("");
    const { error } = await supabase.rpc("admin_set_contractor_status", { p_id: id, p_status: status });
    setBusyStatus(false);
    if (error) { setAdminMsg("Couldn't update status: " + error.message); return; }
    setAdmin((a: any) => a ? { ...a, status } : a);
    setAdminMsg(status === "active" ? "✓ Contractor approved — they can now bid on jobs." : "Contractor deactivated.");
  };

  const avgScore = (key: string) => {
    const vals = reviews.map((r: any) => r[key]).filter((v: any) => v != null);
    return vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(1) : null;
  };

  const s = {
    wrap:  { minHeight:"100vh", background:"var(--ff-bg)", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    inner: { maxWidth:"860px", margin:"0 auto", padding:"2rem 1.5rem" },
    card:  { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"1.75rem", marginBottom:"1.5rem" },
    chip:  { padding:".3rem .75rem", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.25)", borderRadius:"99px", fontSize:".78rem", color:"rgba(var(--ff-muted), .8)", display:"inline-block", margin:".2rem" },
    btn:   { padding:".65rem 1.4rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:600, cursor:"pointer" },
    scoreCard: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"12px", padding:"1.25rem", textAlign:"center" as const },
  };

  if (loading) return (
    <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:32, height:32, border:"3px solid rgba(234,107,20,.2)", borderTopColor:"#ea6b14", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!contractor) return (
    <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <p style={{ color:"rgba(var(--ff-muted), .5)" }}>Contractor not found.</p>
        <button style={s.btn} onClick={goBack}>← Back</button>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ height:"3.75rem" }} />
      <div style={s.inner}>

        {/* Back */}
        <button onClick={goBack} style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", marginBottom:"1.25rem", padding:0 }}>
          ← Back
        </button>

        {/* Admin review panel — everything needed to vet + approve, right here */}
        {myRole === "admin" && admin && (
          <div style={{ ...s.card, border:"1px solid rgba(234,107,20,.45)", background:"rgba(234,107,20,.06)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".75rem", marginBottom:"1rem" }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", color:"#ea6b14" }}>
                Admin Review
                <span style={{ ...s.chip, marginLeft:".6rem", verticalAlign:"middle",
                  background: admin.status === "active" ? "rgba(34,197,94,.12)" : admin.status === "inactive" ? "rgba(239,68,68,.12)" : "rgba(245,158,11,.12)",
                  border: "1px solid " + (admin.status === "active" ? "rgba(34,197,94,.4)" : admin.status === "inactive" ? "rgba(239,68,68,.4)" : "rgba(245,158,11,.4)"),
                  color: admin.status === "active" ? "#22c55e" : admin.status === "inactive" ? "#ef4444" : "#f59e0b" }}>
                  {admin.status ?? "pending"}
                </span>
              </div>
              <div style={{ display:"flex", gap:".6rem" }}>
                {admin.status !== "active" && (
                  <button style={{ ...s.btn, background:"#22c55e", opacity: busyStatus ? .6 : 1 }} disabled={busyStatus} onClick={() => setStatus("active")}>
                    {busyStatus ? "Saving…" : "✓ Approve"}
                  </button>
                )}
                {admin.status === "active" && (
                  <button style={{ ...s.btn, background:"rgba(239,68,68,.85)", opacity: busyStatus ? .6 : 1 }} disabled={busyStatus} onClick={() => setStatus("inactive")}>
                    {busyStatus ? "Saving…" : "Deactivate"}
                  </button>
                )}
              </div>
            </div>
            {adminMsg && <div style={{ fontSize:".85rem", color:"#ea6b14", marginBottom:".9rem" }}>{adminMsg}</div>}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:".9rem", fontSize:".85rem", lineHeight:1.65 }}>
              <div>
                <div style={{ fontWeight:600, marginBottom:".2rem" }}>Contact</div>
                <div style={{ color:"rgba(var(--ff-muted), .75)" }}>
                  {admin.email ?? "No email"}<br />
                  {admin.phone ?? "No phone"}<br />
                  Joined {admin.created_at ? new Date(admin.created_at).toLocaleDateString() : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontWeight:600, marginBottom:".2rem" }}>Trade & experience</div>
                <div style={{ color:"rgba(var(--ff-muted), .75)" }}>
                  {admin.work_type ?? "Not set"}{admin.years_of_experience != null ? " · " + admin.years_of_experience + " yrs" : ""}<br />
                  {admin.availability?.days?.length
                    ? "Available: " + admin.availability.days.join(", ") + (admin.availability.start ? " · " + admin.availability.start + "–" + (admin.availability.end ?? "") : "")
                    : "Availability not set"}
                </div>
              </div>
              <div>
                <div style={{ fontWeight:600, marginBottom:".2rem" }}>Credentials</div>
                <div style={{ color:"rgba(var(--ff-muted), .75)" }}>
                  Licensed: {admin.licensed ? "Yes" + (admin.license_number ? " (#" + admin.license_number + ")" : "") : "No"}<br />
                  Insurance: {admin.has_liability_insurance ? "Yes" + (admin.insurance_provider ? " — " + admin.insurance_provider : "") + (admin.insurance_expiry ? ", expires " + admin.insurance_expiry : "") : "No"}<br />
                  WCB: {admin.has_wcb ? "Yes" : "No"}
                </div>
              </div>
              <div>
                <div style={{ fontWeight:600, marginBottom:".2rem" }}>Pricing & payouts</div>
                <div style={{ color:"rgba(var(--ff-muted), .75)" }}>
                  {admin.hourly_rate != null ? "$" + admin.hourly_rate + "/hr" : "No hourly rate"}
                  {admin.min_callout != null ? " · min callout $" + admin.min_callout : ""}<br />
                  Payouts: {admin.stripe_payouts_enabled ? "✓ Ready" : "Not set up"}<br />
                  {admin.total_jobs != null && ("Jobs: " + admin.total_jobs + " · Earned: $" + Number(admin.total_earned ?? 0).toLocaleString())}
                </div>
              </div>
            </div>

            {admin.work_references && (
              <div style={{ marginTop:".9rem", fontSize:".85rem" }}>
                <span style={{ fontWeight:600 }}>References: </span>
                <span style={{ color:"rgba(var(--ff-muted), .75)" }}>{admin.work_references}</span>
              </div>
            )}

            {admin.review_status && (
              <div style={{ marginTop:".9rem", fontSize:".85rem" }}>
                <span style={{ fontWeight:600 }}>AI doc review ({admin.review_status}): </span>
                <span style={{ color:"rgba(var(--ff-muted), .75)" }}>
                  {(typeof admin.review_result === "string" ? admin.review_result : JSON.stringify(admin.review_result ?? "")).slice(0, 300)}
                </span>
              </div>
            )}

            <div style={{ marginTop:"1rem" }}>
              <div style={{ fontWeight:600, fontSize:".85rem", marginBottom:".45rem" }}>Documents</div>
              {admin.doc_urls && Object.keys(admin.doc_urls).some(k => admin.doc_urls[k]) ? (
                <div style={{ display:"flex", gap:".55rem", flexWrap:"wrap" as const }}>
                  {Object.entries(admin.doc_urls as Record<string, string | null>).map(([k, path]) => path ? (
                    <button key={k} onClick={() => openDoc(path)}
                      style={{ padding:".45rem .9rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".8rem", cursor:"pointer" }}>
                      <Ic name="download" size={13} style={{ marginRight:5 }} />{DOC_LABELS[k] ?? k}
                    </button>
                  ) : null)}
                </div>
              ) : (
                <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)" }}>No documents uploaded yet.</div>
              )}
            </div>
          </div>
        )}

        {/* Header card */}
        <div style={{ ...s.card, display:"flex", gap:"1.5rem", alignItems:"flex-start", flexWrap:"wrap" as const }}>
          <div style={{ width:80, height:80, borderRadius:"50%", overflow:"hidden", background:"rgba(234,107,20,.1)", border:"2px solid rgba(234,107,20,.25)", flexShrink:0 }}>
            {contractor.photo_url
              ? <img src={contractor.photo_url} alt={contractor.first_name} style={{ width:"100%", height:"100%", objectFit:"cover" as const }} />
              : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2rem" }}>🔧</div>
            }
          </div>
          <div style={{ flex:1, minWidth:"200px" }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:".06em", marginBottom:".2rem" }}>
              {contractor.first_name} {contractor.last_name}
            </div>
            {contractor.company_name && (
              <div style={{ fontSize:".9rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".4rem" }}>{contractor.company_name}</div>
            )}
            <div style={{ display:"flex", gap:"1rem", flexWrap:"wrap" as const, fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginBottom:".75rem" }}>
              {contractor.years_of_experience != null && (
                <span><Ic name="briefcase" size={13} style={{ marginRight:4 }} />{contractor.years_of_experience} yrs exp</span>
              )}
              {contractor.rating != null && (
                <span>⭐ {contractor.rating} rating</span>
              )}
              {reviews.length > 0 && (
                <span><Ic name="message-square" size={13} style={{ marginRight:4 }} />{reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            {(contractor.specialties?.length ?? 0) > 0 && (
              <div style={{ marginBottom:".75rem" }}>
                {contractor.specialties.map((sp: string) => <span key={sp} style={s.chip}>{sp}</span>)}
              </div>
            )}
            {(contractor.service_area?.length ?? 0) > 0 && (
              <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .5)" }}>
                <Ic name="map-pin" size={13} style={{ marginRight:4 }} />
                {contractor.service_area.join(" · ")}
              </div>
            )}
          </div>
          <div style={{ display:"flex", flexDirection:"column" as const, gap:".6rem", alignSelf:"flex-start" }}>
            <button style={s.btn} onClick={() => setLocation("/client-onboarding")}>Book This Contractor →</button>
            {contractor.google_reviews_url && (
              <a href={contractor.google_reviews_url} target="_blank" rel="noopener noreferrer"
                style={{ padding:".5rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"8px", color:"rgba(var(--ff-muted), .7)", fontSize:".82rem", textAlign:"center" as const, textDecoration:"none" }}>
                Google Reviews ↗
              </a>
            )}
          </div>
        </div>

        {/* Review scores */}
        {reviews.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
            {[["Price", "price_score"], ["Experience", "experience_score"], ["Results", "result_score"]].map(([label, key]) => {
              const avg = avgScore(key);
              return avg ? (
                <div key={key} style={s.scoreCard}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"#ea6b14", marginBottom:".2rem" }}>
                    {avg}<span style={{ fontSize:"1rem", color:"rgba(var(--ff-muted), .4)" }}>/10</span>
                  </div>
                  <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)" }}>{label}</div>
                </div>
              ) : null;
            })}
          </div>
        )}

        {/* Portfolio */}
        {portfolio.length > 0 && (
          <div style={s.card}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", color:"#ea6b14", marginBottom:"1.25rem" }}>Past Work</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:".75rem" }}>
              {portfolio.map((item: any) => (
                <div key={item.id} style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", overflow:"hidden" }}>
                  {item.photo_path && <img src={pfUrl(item.photo_path)} alt={item.title || "Past job"} style={{ width:"100%", height:"110px", objectFit:"cover" as const, display:"block" }} />}
                  {(item.title || item.description) && (
                    <div style={{ padding:".5rem .6rem" }}>
                      {item.title && <div style={{ fontSize:".8rem", fontWeight:600 }}>{item.title}</div>}
                      {item.description && <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .55)", marginTop:".1rem" }}>{item.description}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <div style={s.card}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", color:"#ea6b14", marginBottom:"1.25rem" }}>Client Reviews</div>
            {reviews.map((r: any) => (
              <div key={r.id} style={{ padding:"1rem 0", borderBottom:"1px solid rgba(var(--ff-fg), .06)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".5rem" }}>
                  <span style={{ fontWeight:500 }}>{r.reviewer_first_name ?? "Client"}</span>
                  <span style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)" }}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginBottom:".5rem" }}>
                  {[["Price", r.price_score], ["Experience", r.experience_score], ["Results", r.result_score]].map(([l, v]) => v != null && (
                    <span key={String(l)} style={{ ...s.chip, fontSize:".74rem", background:"rgba(234,107,20,.08)" }}>
                      {l}: <strong style={{ color:"#ea6b14" }}>{v}/10</strong>
                    </span>
                  ))}
                </div>
                {r.comment && <p style={{ fontSize:".88rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, margin:0 }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
