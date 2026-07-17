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

  useEffect(() => {
    if (!id) return;
    (async () => {
      // Ensure the auth session is hydrated from storage BEFORE we query. On a
      // fresh tab (e.g. admin clicking "View Profile ↗" which opens a new tab)
      // the RPC could otherwise fire before the JWT is attached, so is_admin()
      // would be false and a pending/inactive contractor would look "not found".
      const { data: { session } } = await supabase.auth.getSession();

      // Know who's viewing so "← Back" can return to THEIR dashboard when this
      // page was opened in a fresh tab (no history to go back to).
      if (session?.user) {
        supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle()
          .then(({ data }) => setMyRole(data?.role ?? null));
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
