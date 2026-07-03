import { Ic } from "@/components/Ic";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import ProfileBar from "@/components/ProfileBar";

// Re-signup flagging is now computed server-side by the admin_resignup_matches()
// RPC (hashes built in SQL via pgcrypto, joined against deleted_account_flags),
// replacing the old O(contractors * flags) client-side SHA-256 loop.

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [tab, setTab] = useState<"health"|"requests"|"contractors"|"jobs"|"disputes"|"leads">("requests");
  const [disputes, setDisputes] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [busyLead, setBusyLead] = useState<string|null>(null);
  const [health, setHealth] = useState<any>(null);
  const [disputePhotos, setDisputePhotos] = useState<Record<string, string[]>>({});
  const [disputeRespPhotos, setDisputeRespPhotos] = useState<Record<string, string[]>>({});
  const [busyResolve, setBusyResolve] = useState<string|null>(null);
  const [partialAmt, setPartialAmt] = useState<Record<string, string>>({});
  const [resolveNote, setResolveNote] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeContractors, setActiveContractors] = useState<any[]>([]);
  const [assignSel, setAssignSel] = useState<Record<string,string>>({});
  const [busyAssign, setBusyAssign] = useState<string|null>(null); // request id being assigned
  const [busyStatus, setBusyStatus] = useState<string|null>(null); // contractor id whose status is toggling
  const [rankedBy, setRankedBy] = useState<Record<string, any[]>>({}); // best-fit contractors per pending request
  const [busyDelete, setBusyDelete] = useState(false);
  const [bidsBy, setBidsBy] = useState<Record<string, any[]>>({});
  const [busyAcceptBid, setBusyAcceptBid] = useState<string|null>(null);
  const [flagMatches, setFlagMatches] = useState<Record<string, { fields: string[]; avg: number; count: number; date: string }>>({});
  const PAGE_SIZE = 20;
  const [page, setPage] = useState<{ requests: number; contractors: number; jobs: number }>({ requests: 0, contractors: 0, jobs: 0 });
  const [counts, setCounts] = useState<{ requests: number; contractors: number; jobs: number }>({ requests: 0, contractors: 0, jobs: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setLocation("/login");
    });
  }, []);

  // Reload whenever any tab's page changes (also fires once on mount).
  useEffect(() => { loadAll(); }, [page]);

  const loadAll = async () => {
    setLoading(true);
    try {
    const rRange: [number, number] = [page.requests * PAGE_SIZE, page.requests * PAGE_SIZE + PAGE_SIZE - 1];
    const cRange: [number, number] = [page.contractors * PAGE_SIZE, page.contractors * PAGE_SIZE + PAGE_SIZE - 1];
    const jRange: [number, number] = [page.jobs * PAGE_SIZE, page.jobs * PAGE_SIZE + PAGE_SIZE - 1];
    const [{ data: reqs, count: reqCount }, { data: cons, count: conCount }, { data: js, count: jobCount }, { data: dir }, { data: bids }, { data: resignup }, { data: disp }, { data: leadsData }, { data: healthData }] = await Promise.all([
      supabase.from("client_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(rRange[0], rRange[1]),
      supabase.from("contractors").select("*, profile:profiles!contractors_id_fkey(first_name,last_name,email,phone)", { count: "exact" }).order("created_at", { ascending: false }).range(cRange[0], cRange[1]),
      supabase.from("jobs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(jRange[0], jRange[1]),
      supabase.rpc("get_contractor_directory").select("id, first_name, last_name, specialties"),
      supabase.from("bids").select("*").eq("status", "pending").order("amount", { ascending: true }),
      supabase.rpc("admin_resignup_matches"),
      supabase.from("disputes").select("*, job:jobs(id, amount, total_charged, contractor_payout, status, payment_status, stripe_payment_intent_id)").order("created_at", { ascending: false }),
      supabase.from("quote_leads").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("admin_health"),
    ]);
    setRequests(reqs ?? []);
    setContractors(cons ?? []);
    setJobs(js ?? []);
    setDisputes(disp ?? []);
    setLeads(leadsData ?? []);
    setHealth(healthData ?? null);
    // Resolve signed URLs for all dispute photos (problem-photos is private). Both
    // the claim photos and the contractor-response photos are signed in a single
    // parallel pass instead of two sequential per-dispute loops.
    const sign = (paths: string[]) => Promise.all((paths ?? []).map((pp: string) =>
      supabase.storage.from("problem-photos").createSignedUrl(pp, 3600)
        .then(({ data }) => data?.signedUrl).catch(() => null)));
    const dp: Record<string, string[]> = {};
    const rp: Record<string, string[]> = {};
    await Promise.all((disp ?? []).flatMap((d: any) => [
      (d.photo_paths?.length ? sign(d.photo_paths).then(u => { dp[d.id] = u.filter(Boolean) as string[]; }) : Promise.resolve()),
      (d.contractor_response_photos?.length ? sign(d.contractor_response_photos).then(u => { rp[d.id] = u.filter(Boolean) as string[]; }) : Promise.resolve()),
    ]));
    setDisputePhotos(dp);
    setDisputeRespPhotos(rp);
    setCounts({ requests: reqCount ?? 0, contractors: conCount ?? 0, jobs: jobCount ?? 0 });
    setActiveContractors((dir ?? []) as any[]);
    // Best-fit ranking for each pending request (specialty + zone, same map as the
    // contractor feed). Fetched in parallel so the assign dropdown leads with the
    // right pros instead of a flat alphabetical list.
    const pendingReqs = (reqs ?? []).filter((r: any) => r.status === "pending");
    Promise.all(pendingReqs.map((r: any) =>
      Promise.resolve(
        supabase.rpc("admin_rank_contractors", { p_request_id: r.id })
          .then(({ data }) => [r.id, data ?? []] as [string, any[]]),
      ).catch(() => [r.id, []] as [string, any[]])
    )).then(pairs => setRankedBy(Object.fromEntries(pairs)));
    const bb: Record<string, any[]> = {};
    (bids ?? []).forEach((b: any) => { if (!bb[b.request_id]) bb[b.request_id] = []; bb[b.request_id].push(b); });
    setBidsBy(bb);

    // Likely re-signups of deleted, poorly-rated accounts — matched server-side
    // by admin_resignup_matches() (hashes built and joined in SQL).
    const fm: Record<string, { fields: string[]; avg: number; count: number; date: string }> = {};
    for (const r of (resignup ?? [])) {
      fm[r.contractor_id] = { fields: r.fields ?? [], avg: r.avg_score, count: r.review_count, date: r.deleted_at };
    }
    setFlagMatches(fm);
    } catch (e) {
      console.error("AdminDashboard loadAll error:", e);
    } finally {
      setLoading(false);
    }
  };

  const pageCount = (which: "requests"|"contractors"|"jobs") => Math.max(1, Math.ceil((counts[which] || 0) / PAGE_SIZE));
  const pager = (which: "requests"|"contractors"|"jobs") => (
    counts[which] > PAGE_SIZE ? (
      <div style={{ display:"flex", gap:".75rem", alignItems:"center", justifyContent:"center", marginTop:"1.25rem" }}>
        <button style={{ ...s.btn, opacity: page[which] <= 0 ? .4 : 1 }} disabled={page[which] <= 0}
          onClick={() => setPage(p => ({ ...p, [which]: Math.max(0, p[which] - 1) }))}>← Prev</button>
        <span style={{ color:"rgba(var(--ff-muted), .6)", fontSize:".82rem" }}>Page {page[which] + 1} of {pageCount(which)}</span>
        <button style={{ ...s.btn, opacity: page[which] >= pageCount(which) - 1 ? .4 : 1 }} disabled={page[which] >= pageCount(which) - 1}
          onClick={() => setPage(p => ({ ...p, [which]: p[which] + 1 }))}>Next →</button>
      </div>
    ) : null
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  const deleteRequest = async (r: any) => {
    if (!window.confirm("Delete this request permanently? This also removes any assigned job and its messages.")) return;
    setBusyDelete(true);
    const { error } = await supabase.rpc("admin_delete_request", { p_request_id: r.id });
    setBusyDelete(false);
    if (error) { alert("Couldn't delete: " + error.message); return; }
    setRequests(prev => prev.filter(x => x.id !== r.id));
  };
  const assignContractor = async (requestId: string) => {
    const cid = assignSel[requestId];
    if (!cid) { alert("Pick a contractor first."); return; }
    setBusyAssign(requestId);
    const { error } = await supabase.rpc("assign_job", { p_request_id: requestId, p_contractor_id: cid });
    setBusyAssign(null);
    if (error) { alert("Couldn't assign: " + error.message); return; }
    // Patch just this row rather than reloading the whole dashboard.
    setRequests(prev => prev.map(x => x.id === requestId ? { ...x, status: "matched", assigned_contractor_id: cid } : x));
    setAssignSel(p => { const n = { ...p }; delete n[requestId]; return n; });
    setRankedBy(p => { const n = { ...p }; delete n[requestId]; return n; });
  };
  const acceptBid = async (bidId: string) => {
    if (!window.confirm("Accept this bid and assign this contractor?")) return;
    setBusyAcceptBid(bidId);
    const { error } = await supabase.rpc("accept_bid", { p_bid_id: bidId });
    setBusyAcceptBid(null);
    if (error) { alert("Couldn't accept bid: " + error.message); return; }
    await loadAll();
  };

  const setContractorStatus = async (contractorId: string, status: "active"|"inactive") => {
    setBusyStatus(contractorId);
    const { error } = await supabase.rpc("admin_set_contractor_status", { p_id: contractorId, p_status: status });
    setBusyStatus(null);
    if (error) { alert("Couldn't update contractor: " + error.message); return; }
    setContractors(prev => prev.map(c => c.id === contractorId ? { ...c, status } : c));
  };

  const markLeadContacted = async (leadId: string) => {
    setBusyLead(leadId);
    const { error } = await supabase.from("quote_leads").update({ status: "contacted" }).eq("id", leadId);
    setBusyLead(null);
    if (error) { alert("Couldn't update lead: " + error.message); return; }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: "contacted" } : l));
  };

  const resolveDispute = async (d: any, action: "refund_full"|"refund_partial"|"release") => {
    let refund_amount: number | undefined;
    if (action === "refund_partial") {
      refund_amount = Number(partialAmt[d.id]);
      if (!refund_amount || refund_amount <= 0) { alert("Enter a partial refund amount first."); return; }
    }
    const labels: Record<string, string> = {
      refund_full: "Refund the client in full",
      refund_partial: `Refund $${refund_amount} to the client (contractor still gets paid)`,
      release: "Release the held payment to the contractor (dispute not upheld)",
    };
    if (!window.confirm(`${labels[action]}?\n\nThis moves real money and can't be undone.`)) return;
    setBusyResolve(d.id);
    const { data, error } = await supabase.functions.invoke("resolve-dispute", {
      body: { dispute_id: d.id, action, refund_amount, note: resolveNote[d.id] || undefined },
    });
    setBusyResolve(null);
    if (error || data?.error) {
      let msg = error?.message || data?.error || "Unknown error";
      try { if (error?.context?.json) { const b = await error.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Couldn't resolve dispute: " + msg);
      return;
    }
    await loadAll();
  };

  const s = { wrap: { minHeight:"100vh", background:"var(--ff-bg)", backgroundImage:"radial-gradient(ellipse 60% 30% at 80% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), radial-gradient(rgba(var(--ff-fg), 0.025) 1px, transparent 1px)", backgroundSize:"auto, 22px 22px", backgroundAttachment:"fixed", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" }, header: { background:"rgba(var(--ff-fg), .03)", borderBottom:"1px solid rgba(var(--ff-fg), .07)", padding:"1rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center" }, logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" }, content: { maxWidth:"1000px", margin:"0 auto", padding:"2rem 1.5rem" }, tabs: { display:"flex", gap:".5rem", marginBottom:"1.5rem", flexWrap:"wrap" as const }, tab: { padding:".6rem 1.2rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px", color:"rgba(var(--ff-muted), .6)", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem" }, activeTab: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.4)", color:"var(--ff-text)" }, card: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"12px", padding:"1.25rem", marginBottom:"1rem" }, title: { fontSize:".95rem", fontWeight:500, color:"var(--ff-text)", marginBottom:".35rem" }, meta: { fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginBottom:".2rem" }, badge: { fontSize:".75rem", fontWeight:500, color:"#ea6b14" }, btn: { padding:".5rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"6px", color:"rgba(var(--ff-muted), .7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" } };

  if (loading) return <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>Loading…</div>;

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ height: "3.75rem" }} />
      <div style={s.header}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:".08em", color:"var(--ff-text)" }}>ADMIN <span style={{ fontSize:".6rem", background:"#ea6b14", color:"#fff", borderRadius:"4px", padding:".15rem .45rem", verticalAlign:"middle", letterSpacing:".05em" }}>DASHBOARD</span></div>
      </div>

      <div style={s.content}>
        <ProfileBar role="admin" />
        <div style={s.tabs}>
          {(["health","requests","contractors","jobs","disputes","leads"] as const).map(t => {
            const openDisputes = disputes.filter(d => d.status === "open").length;
            const newLeads = leads.filter(l => l.status === "new").length;
            const healthAlerts = health ? ((health.no_bid_count||0) + (health.awaiting_confirm_count||0) + (health.awaiting_approval_count||0) + (health.stale_disputes_count||0)) : 0;
            const label = t === "health" ? `Health${healthAlerts > 0 ? ` (${healthAlerts})` : ""}`
              : t === "requests" ? `Requests (${counts.requests})`
              : t === "contractors" ? `Contractors (${counts.contractors})`
              : t === "jobs" ? `Jobs (${counts.jobs})`
              : t === "disputes" ? `Disputes (${openDisputes})`
              : `Leads (${newLeads})`;
            return (
              <button key={t} style={{ ...s.tab, ...(tab===t ? s.activeTab : {}), ...(t === "health" && healthAlerts > 0 ? { borderColor:"rgba(251,191,36,.5)", color:"var(--ff-warn)" } : {}), ...(t === "disputes" && openDisputes > 0 ? { borderColor:"rgba(251,191,36,.5)", color:"var(--ff-warn)" } : {}), ...(t === "leads" && newLeads > 0 ? { borderColor:"rgba(234,107,20,.5)", color:"#ea6b14" } : {}) }} onClick={() => setTab(t)}>
                {label}
              </button>
            );
          })}
        </div>

        {tab === "requests" && (
          <div>
            {requests.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No requests yet.</p>}
            {requests.map(r => (
              <div key={r.id} style={s.card}>
                <div style={s.title}>{r.service_needed}</div>
                <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{r.first_name} {r.last_name} · <Ic name="phone" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.phone}</div>
                <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location} · <Ic name="timer" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.preferred_schedule}</div>
                <div style={s.meta}>{r.job_description}</div>
                <div style={{ ...s.badge, marginTop:".5rem" }}>● {r.status}</div>
                {r.status === "pending" && (bidsBy[r.id]?.length ?? 0) > 0 && (
                  <div style={{ marginTop:".75rem" }}>
                    <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)", marginBottom:".4rem" }}>Bids ({bidsBy[r.id].length}/3)</div>
                    {bidsBy[r.id].map((b: any) => {
                      const con = activeContractors.find(c => c.id === b.contractor_id);
                      const nm = con ? ((con.first_name ?? "") + " " + (con.last_name ? con.last_name[0] + "." : "")).trim() : "Contractor";
                      return (
                        <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".5rem", padding:".5rem .6rem", marginBottom:".4rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px", flexWrap:"wrap" as const }}>
                          <div style={{ flex:"1 1 160px" }}>
                            <div style={{ fontSize:".85rem", color:"var(--ff-text)" }}>{nm}{b.amount != null ? " — $" + b.amount : ""}</div>
                            {b.message && <div style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .6)" }}>{b.message}</div>}
                          </div>
                          <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none" }} disabled={busyAcceptBid === b.id} onClick={() => acceptBid(b.id)}>{busyAcceptBid === b.id ? "…" : "Accept"}</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {r.status === "pending" && (
                  <div style={{ display:"flex", gap:".5rem", marginTop:".75rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                    {(() => {
                      const ranked = rankedBy[r.id];
                      const label = (c: any) => `${c.first_name} ${c.last_name ? c.last_name[0] + "." : ""}${(c.specialties && c.specialties.length) ? " — " + c.specialties[0] : ""}`;
                      // Lead with the pros the matcher ranked best (right trade + in the
                      // client's zone); fall back to the flat directory until ranking loads.
                      const best = (ranked ?? []).filter((c: any) => c.is_match);
                      const others = (ranked ?? []).filter((c: any) => !c.is_match);
                      return (
                        <select value={assignSel[r.id] ?? ""} onChange={e => setAssignSel(p => ({ ...p, [r.id]: e.target.value }))}
                          style={{ padding:".5rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem" }}>
                          <option value="">Select contractor…</option>
                          {ranked ? (
                            <>
                              {best.length > 0 && (
                                <optgroup label="Best matches">
                                  {best.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.in_zone ? "★ " : ""}{label(c)}</option>
                                  ))}
                                </optgroup>
                              )}
                              {others.length > 0 && (
                                <optgroup label="Other contractors">
                                  {others.map((c: any) => (<option key={c.id} value={c.id}>{label(c)}</option>))}
                                </optgroup>
                              )}
                            </>
                          ) : (
                            activeContractors.map(c => (<option key={c.id} value={c.id}>{label(c)}</option>))
                          )}
                        </select>
                      );
                    })()}
                    <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyAssign === r.id} onClick={() => assignContractor(r.id)}>{busyAssign === r.id ? "Assigning…" : "Assign"}</button>
                  </div>
                )}
                {r.status !== "pending" && r.assigned_contractor_id && (
                  <div style={{ ...s.meta, marginTop:".5rem", color:"var(--ff-success)" }}>Assigned ✓</div>
                )}
                <RequestPhotoQuote requestId={r.id} photoPath={r.photo_path} estimatedQuote={r.estimated_quote} quoteNotes={r.quote_notes} canQuote />
                <div style={{ marginTop:".75rem" }}>
                  <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyDelete} onClick={() => deleteRequest(r)}><Ic name="trash" size={13} style={{ marginRight:4 }} />Delete request</button>
                </div>
              </div>
            ))}
            {pager("requests")}
          </div>
        )}

        {tab === "contractors" && (
          <div>
            {contractors.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No contractors yet.</p>}
            {contractors.map(c => (
              <div key={c.id} style={s.card}>
                <div style={s.title}>{c.company_name || [c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(" ") || "Unnamed contractor"}</div>
                {flagMatches[c.id] && (
                  <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.4)", borderRadius:"8px", color:"var(--ff-danger)", fontSize:".8rem", lineHeight:1.45 }}>
                    {"Possible re-signup — matches a previously deleted account that had poor reviews (avg "}
                    {flagMatches[c.id].avg}{"/10 over "}{flagMatches[c.id].count}{" review"}{flagMatches[c.id].count === 1 ? "" : "s"}{", deleted "}
                    {new Date(flagMatches[c.id].date).toLocaleDateString()}{"). Matched on "}{flagMatches[c.id].fields.join(", ")}{"."}
                  </div>
                )}
                {c.company_name && [c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(" ") ? <div style={s.meta}>{[c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(" ")}</div> : null}
                {(c.profile?.email || c.profile?.phone) && <div style={s.meta}>{[c.profile?.email, c.profile?.phone].filter(Boolean).join(" · ")}</div>}
                <div style={s.meta}>Specialties: {(c.specialties ?? []).join(", ") || "—"}</div>
                <div style={s.meta}>Area: {(c.service_area ?? []).join(", ") || "—"}</div>
                <div style={{ ...s.meta, marginTop:".4rem", color:"rgba(var(--ff-muted), .55)" }}>
                  {"Licensed: "}{c.licensed === true ? ("Yes" + (c.license_number ? " (#" + c.license_number + ")" : "")) : c.licensed === false ? "No" : "—"}
                  {"  ·  Insurance: "}{c.has_liability_insurance === true ? ("Yes" + (c.insurance_provider ? " (" + c.insurance_provider + (c.insurance_expiry ? ", exp " + c.insurance_expiry : "") + ")" : "")) : c.has_liability_insurance === false ? "No" : "—"}
                  {"  ·  WCB: "}{c.has_wcb === true ? "Yes" : c.has_wcb === false ? "No" : "—"}
                </div>
                {c.work_references ? <div style={s.meta}>References: {c.work_references}</div> : null}
                <div style={{ ...s.badge, marginTop:".5rem" }}>● {c.status}</div>
                <div style={{ display:"flex", gap:".5rem", marginTop:".75rem", flexWrap:"wrap" as const }}>
                  <button style={s.btn} onClick={() => window.open("/contractors/" + c.id, "_blank")}>
                    View Profile ↗
                  </button>
                  {c.status !== "active" && (
                    <button style={{ ...s.btn, color:"var(--ff-success)", borderColor:"rgba(34,197,94,.35)" }}
                      disabled={busyStatus === c.id} onClick={() => setContractorStatus(c.id, "active")}>
                      {busyStatus === c.id ? "…" : "Approve"}
                    </button>
                  )}
                  {c.status === "active" && (
                    <button style={{ ...s.btn, color:"var(--ff-danger)", borderColor:"rgba(239,68,68,.3)" }}
                      disabled={busyStatus === c.id} onClick={() => setContractorStatus(c.id, "inactive")}>
                      {busyStatus === c.id ? "…" : "Deactivate"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {pager("contractors")}
          </div>
        )}

        {tab === "jobs" && (
          <div>
            {jobs.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No jobs yet.</p>}
            {jobs.map(j => (
              <div key={j.id} style={s.card}>
                <div style={s.title}>Job {j.id.slice(0,8)}</div>
                <div style={s.meta}>Status: {j.status}</div>
                {j.amount && <div style={s.meta}>Amount: ${j.amount}</div>}
                {j.scheduled_at && <div style={s.meta}>Date: {new Date(j.scheduled_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</div>}
              </div>
            ))}
            {pager("jobs")}
          </div>
        )}

        {tab === "disputes" && (
          <div>
            {disputes.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No disputes yet.</p>}
            {disputes.map(d => {
              const job = d.job ?? {};
              const charged = Number(job.total_charged ?? job.amount ?? 0);
              const payout = Number(job.contractor_payout ?? 0);
              const resolved = d.status !== "open";
              const statusLabel: Record<string, string> = {
                open: "Open — needs review",
                resolved_refund: "Resolved — full refund",
                resolved_partial: "Resolved — partial refund",
                resolved_released: "Resolved — released to contractor",
                rejected: "Rejected",
              };
              const statusColor = d.status === "open" ? "var(--ff-warn)" : "var(--ff-success)";
              return (
                <div key={d.id} style={{ ...s.card, ...(d.status === "open" ? { borderColor:"rgba(251,191,36,.4)" } : {}) }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                    <div style={s.title}>{d.reason}</div>
                    <div style={{ fontSize:".78rem", fontWeight:500, color: statusColor }}>● {statusLabel[d.status] ?? d.status}</div>
                  </div>
                  <div style={s.meta}>Job {String(d.job_id).slice(0,8)} · Charged ${charged.toFixed(2)} · Contractor payout ${payout.toFixed(2)}</div>
                  <div style={s.meta}>Reported {new Date(d.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>
                  {d.description && (
                    <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>{d.description}</div>
                  )}
                  {(disputePhotos[d.id]?.length ?? 0) > 0 && (
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginTop:".6rem" }}>
                      {disputePhotos[d.id].map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={"Evidence " + (i+1)} style={{ width:"110px", height:"110px", objectFit:"cover", borderRadius:"8px", border:"1px solid rgba(var(--ff-fg), .12)" }} />
                        </a>
                      ))}
                    </div>
                  )}

                  {(d.agreed_scope || d.requested_remedy || d.service_date || d.amount_in_dispute != null || d.declarant_name) && (
                    <div style={{ marginTop:".6rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .02)", border:"1px solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".8rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6 }}>
                      {d.service_date && <div>Date of service: <strong style={{ color:"rgba(var(--ff-fg), .9)" }}>{d.service_date}</strong></div>}
                      {d.agreed_scope && <div>What was agreed: {d.agreed_scope}</div>}
                      {d.requested_remedy && <div>Requested outcome: <strong style={{ color:"rgba(var(--ff-fg), .9)" }}>{d.requested_remedy}</strong></div>}
                      {d.amount_in_dispute != null && <div>Amount in dispute: ${Number(d.amount_in_dispute).toFixed(2)}</div>}
                      {d.declarant_name && <div style={{ marginTop:".3rem", fontStyle:"italic" as const, color:"rgba(var(--ff-muted), .6)" }}>Declared true &amp; signed by {d.declarant_name}</div>}
                    </div>
                  )}

                  <div style={{ marginTop:".6rem", padding:".6rem .8rem", background: d.contractor_responded_at ? "rgba(59,130,246,.07)" : "rgba(251,191,36,.06)", border: "1px solid " + (d.contractor_responded_at ? "rgba(59,130,246,.3)" : "rgba(251,191,36,.25)"), borderRadius:"8px", fontSize:".82rem", lineHeight:1.5 }}>
                    {d.contractor_responded_at ? (
                      <>
                        <div style={{ fontWeight:600, color:"var(--ff-info)", marginBottom:".3rem" }}>Contractor responded</div>
                        <div style={{ color:"rgba(var(--ff-muted), .85)" }}>{d.contractor_response}</div>
                        {(disputeRespPhotos[d.id]?.length ?? 0) > 0 && (
                          <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginTop:".5rem" }}>
                            {disputeRespPhotos[d.id].map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt={"Response " + (i+1)} style={{ width:"90px", height:"90px", objectFit:"cover" as const, borderRadius:"8px", border:"1px solid rgba(var(--ff-fg), .12)" }} />
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
                    <div style={{ marginTop:".9rem", borderTop:"1px solid rgba(var(--ff-fg), .07)", paddingTop:".9rem" }}>
                      <textarea value={resolveNote[d.id] ?? ""} rows={2} placeholder="Resolution note (optional, shared internally)"
                        onChange={e => setResolveNote(p => ({ ...p, [d.id]: e.target.value }))}
                        style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem", boxSizing:"border-box" as const, resize:"vertical" as const, marginBottom:".7rem" }} />
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                        <button style={{ ...s.btn, background:"#ef4444", color:"#fff", border:"none" }} disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "refund_full")}>{busyResolve === d.id ? "…" : "Refund client in full"}</button>
                        <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none" }} disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "release")}>Release to contractor</button>
                      </div>
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center", marginTop:".6rem" }}>
                        <input type="number" min={0} max={charged} step="0.01" value={partialAmt[d.id] ?? ""} placeholder="Partial $"
                          onChange={e => setPartialAmt(p => ({ ...p, [d.id]: e.target.value }))}
                          style={{ width:"110px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem" }} />
                        <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "refund_partial")}>Partial refund + pay contractor</button>
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
                </div>
              );
            })}
          </div>
        )}

        {tab === "leads" && (
          <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Quote requests from visitors who haven't signed up. Reach out, then mark them contacted.
            </p>
            {leads.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No quote leads yet.</p>}
            {leads.map(l => (
              <div key={l.id} style={{ ...s.card, ...(l.status === "new" ? { borderColor:"rgba(234,107,20,.4)" } : {}) }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                  <div style={s.title}>{l.service_needed || "General enquiry"}</div>
                  <div style={{ fontSize:".78rem", fontWeight:500, color: l.status === "new" ? "#ea6b14" : "var(--ff-success)" }}>● {l.status === "new" ? "New" : "Contacted"}</div>
                </div>
                <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{l.name || "—"}</div>
                <div style={s.meta}>
                  {l.email ? <a href={"mailto:" + l.email} style={{ color:"#ea6b14", textDecoration:"none" }}>{l.email}</a> : null}
                  {l.email && l.phone ? " · " : ""}
                  {l.phone ? <a href={"tel:" + l.phone} style={{ color:"#ea6b14", textDecoration:"none" }}>{l.phone}</a> : null}
                </div>
                {l.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{l.location}</div>}
                {l.details && (
                  <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>{l.details}</div>
                )}
                <div style={{ ...s.meta, marginTop:".4rem", color:"rgba(var(--ff-muted), .45)" }}>Received {new Date(l.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>
                {l.status === "new" && (
                  <div style={{ marginTop:".75rem" }}>
                    <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none" }} disabled={busyLead === l.id} onClick={() => markLeadContacted(l.id)}>{busyLead === l.id ? "…" : "Mark contacted"}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "health" && (
          <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Things that may need your attention. Buckets only show items that have been waiting too long.
            </p>
            {!health && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>Loading…</p>}
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
                    <div style={{ ...s.card, flex:"1 1 180px", margin:0, textAlign:"center" as const }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"#ea6b14", lineHeight:1 }}>{health.new_leads_count ?? 0}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:".35rem" }}>New quote leads</div>
                    </div>
                    <div style={{ ...s.card, flex:"1 1 180px", margin:0, textAlign:"center" as const }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"var(--ff-warn)", lineHeight:1 }}>{health.pending_contractors_count ?? 0}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:".35rem" }}>Contractors awaiting review</div>
                    </div>
                  </div>
                  {allClear && <p style={{ color:"var(--ff-success)", fontSize:".9rem" }}>● All clear — nothing is overdue right now.</p>}
                  {buckets.map(b => b.count > 0 && (
                    <div key={b.key} style={{ marginBottom:"1.5rem" }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:".04em", color:"var(--ff-warn)" }}>{b.title} ({b.count})</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginBottom:".6rem" }}>{b.hint}</div>
                      {b.items.map((it:any) => (
                        <div key={it.id} style={{ ...s.card, borderColor:"rgba(251,191,36,.25)" }}>
                          <div style={s.title}>{it.service_needed || it.service || it.reason || "Item"}</div>
                          {(it.first_name || it.last_name || it.client_name) && (
                            <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{it.client_name || `${it.first_name||""} ${it.last_name||""}`.trim()}</div>
                          )}
                          {it.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{it.location}</div>}
                          {(it.created_at || it.since) && <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>Since {new Date(it.created_at || it.since).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
