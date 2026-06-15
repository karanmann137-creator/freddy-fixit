import { Ic } from "@/components/Ic";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";

// Re-signup flagging. These MUST stay byte-identical to the helpers in the
// delete-account edge function so the hashes line up.
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
const normEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();
const normPhone = (p?: string | null) => (p ?? "").replace(/\D/g, "");
const normName  = (f?: string | null, l?: string | null) =>
  [f ?? "", l ?? ""].join(" ").trim().toLowerCase().replace(/\s+/g, " ");

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [tab, setTab] = useState<"requests"|"contractors"|"jobs">("requests");
  const [loading, setLoading] = useState(true);
  const [activeContractors, setActiveContractors] = useState<any[]>([]);
  const [assignSel, setAssignSel] = useState<Record<string,string>>({});
  const [busyAssign, setBusyAssign] = useState(false);
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
    const [{ data: reqs, count: reqCount }, { data: cons, count: conCount }, { data: js, count: jobCount }, { data: dir }, { data: bids }, { data: flags }] = await Promise.all([
      supabase.from("client_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(rRange[0], rRange[1]),
      supabase.from("contractors").select("*, profile:profiles!contractors_id_fkey(first_name,last_name,email,phone)", { count: "exact" }).order("created_at", { ascending: false }).range(cRange[0], cRange[1]),
      supabase.from("jobs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(jRange[0], jRange[1]),
      supabase.from("contractor_directory").select("id, first_name, last_name, specialties"),
      supabase.from("bids").select("*").eq("status", "pending").order("amount", { ascending: true }),
      supabase.from("deleted_account_flags").select("*").eq("was_poor", true),
    ]);
    setRequests(reqs ?? []);
    setContractors(cons ?? []);
    setJobs(js ?? []);
    setCounts({ requests: reqCount ?? 0, contractors: conCount ?? 0, jobs: jobCount ?? 0 });
    setActiveContractors(dir ?? []);
    const bb: Record<string, any[]> = {};
    (bids ?? []).forEach((b: any) => { if (!bb[b.request_id]) bb[b.request_id] = []; bb[b.request_id].push(b); });
    setBidsBy(bb);

    // Match current contractors against tombstones of deleted, poorly-rated
    // accounts (by hashed email / phone / name) to surface likely re-signups.
    const poorFlags = flags ?? [];
    const fm: Record<string, { fields: string[]; avg: number; count: number; date: string }> = {};
    if (poorFlags.length > 0) {
      for (const c of (cons ?? [])) {
        const eh = normEmail(c.profile?.email) ? await sha256Hex(normEmail(c.profile?.email)) : null;
        const ph = normPhone(c.profile?.phone) ? await sha256Hex(normPhone(c.profile?.phone)) : null;
        const nh = normName(c.profile?.first_name, c.profile?.last_name) ? await sha256Hex(normName(c.profile?.first_name, c.profile?.last_name)) : null;
        for (const f of poorFlags) {
          const fields: string[] = [];
          if (eh && f.email_hash === eh) fields.push("email");
          if (ph && f.phone_hash === ph) fields.push("phone");
          if (nh && f.name_hash === nh) fields.push("name");
          if (fields.length > 0) {
            fm[c.id] = { fields, avg: f.avg_score, count: f.review_count, date: f.deleted_at };
            break;
          }
        }
      }
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
        <span style={{ color:"rgba(190,205,235,.6)", fontSize:".82rem" }}>Page {page[which] + 1} of {pageCount(which)}</span>
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
    setBusyAssign(true);
    const { error } = await supabase.rpc("assign_job", { p_request_id: requestId, p_contractor_id: cid });
    setBusyAssign(false);
    if (error) { alert("Couldn't assign: " + error.message); return; }
    await loadAll();
  };
  const acceptBid = async (bidId: string) => {
    if (!window.confirm("Accept this bid and assign this contractor?")) return;
    setBusyAcceptBid(bidId);
    const { error } = await supabase.rpc("accept_bid", { p_bid_id: bidId });
    setBusyAcceptBid(null);
    if (error) { alert("Couldn't accept bid: " + error.message); return; }
    await loadAll();
  };

  const s = { wrap: { minHeight:"100vh", background:"#1a2236", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" }, header: { background:"rgba(255,255,255,.03)", borderBottom:"1px solid rgba(255,255,255,.07)", padding:"1rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center" }, logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" }, content: { maxWidth:"1000px", margin:"0 auto", padding:"2rem 1.5rem" }, tabs: { display:"flex", gap:".5rem", marginBottom:"1.5rem" }, tab: { padding:".6rem 1.2rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px", color:"rgba(190,205,235,.6)", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem" }, activeTab: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.4)", color:"#f0f4ff" }, card: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"12px", padding:"1.25rem", marginBottom:"1rem" }, title: { fontSize:".95rem", fontWeight:500, color:"#f0f4ff", marginBottom:".35rem" }, meta: { fontSize:".78rem", color:"rgba(190,205,235,.5)", marginBottom:".2rem" }, badge: { fontSize:".75rem", fontWeight:500, color:"#ea6b14" }, btn: { padding:".5rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"6px", color:"rgba(190,205,235,.7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" } };

  if (loading) return <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>Loading…</div>;

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ height: "3.75rem" }} />
      <div style={s.header}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:".08em", color:"#f0f4ff" }}>ADMIN <span style={{ fontSize:".6rem", background:"#ea6b14", color:"#fff", borderRadius:"4px", padding:".15rem .45rem", verticalAlign:"middle", letterSpacing:".05em" }}>DASHBOARD</span></div>
      </div>

      <div style={s.content}>
        <div style={s.tabs}>
          {(["requests","contractors","jobs"] as const).map(t => (
            <button key={t} style={{ ...s.tab, ...(tab===t ? s.activeTab : {}) }} onClick={() => setTab(t)}>
              {t === "requests" ? `Requests (${counts.requests})` : t === "contractors" ? `Contractors (${counts.contractors})` : `Jobs (${counts.jobs})`}
            </button>
          ))}
        </div>

        {tab === "requests" && (
          <div>
            {requests.length === 0 && <p style={{ color:"rgba(190,205,235,.45)" }}>No requests yet.</p>}
            {requests.map(r => (
              <div key={r.id} style={s.card}>
                <div style={s.title}>{r.service_needed}</div>
                <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{r.first_name} {r.last_name} · <Ic name="phone" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.phone}</div>
                <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location} · <Ic name="timer" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.preferred_schedule}</div>
                <div style={s.meta}>{r.job_description}</div>
                <div style={{ ...s.badge, marginTop:".5rem" }}>● {r.status}</div>
                {r.status === "pending" && (bidsBy[r.id]?.length ?? 0) > 0 && (
                  <div style={{ marginTop:".75rem" }}>
                    <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.45)", marginBottom:".4rem" }}>Bids ({bidsBy[r.id].length}/3)</div>
                    {bidsBy[r.id].map((b: any) => {
                      const con = activeContractors.find(c => c.id === b.contractor_id);
                      const nm = con ? ((con.first_name ?? "") + " " + (con.last_name ? con.last_name[0] + "." : "")).trim() : "Contractor";
                      return (
                        <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".5rem", padding:".5rem .6rem", marginBottom:".4rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px", flexWrap:"wrap" as const }}>
                          <div style={{ flex:"1 1 160px" }}>
                            <div style={{ fontSize:".85rem", color:"#f0f4ff" }}>{nm}{b.amount != null ? " — $" + b.amount : ""}</div>
                            {b.message && <div style={{ fontSize:".75rem", color:"rgba(190,205,235,.6)" }}>{b.message}</div>}
                          </div>
                          <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none" }} disabled={busyAcceptBid === b.id} onClick={() => acceptBid(b.id)}>{busyAcceptBid === b.id ? "…" : "Accept"}</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {r.status === "pending" && (
                  <div style={{ display:"flex", gap:".5rem", marginTop:".75rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                    <select value={assignSel[r.id] ?? ""} onChange={e => setAssignSel(p => ({ ...p, [r.id]: e.target.value }))}
                      style={{ padding:".5rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"6px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".82rem" }}>
                      <option value="">Select contractor…</option>
                      {activeContractors.map(c => (
                        <option key={c.id} value={c.id}>{c.first_name} {c.last_name ? c.last_name[0] + "." : ""}{(c.specialties && c.specialties.length) ? " — " + c.specialties[0] : ""}</option>
                      ))}
                    </select>
                    <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyAssign} onClick={() => assignContractor(r.id)}>{busyAssign ? "Assigning…" : "Assign"}</button>
                  </div>
                )}
                {r.status !== "pending" && r.assigned_contractor_id && (
                  <div style={{ ...s.meta, marginTop:".5rem", color:"#86efac" }}>Assigned ✓</div>
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
            {contractors.length === 0 && <p style={{ color:"rgba(190,205,235,.45)" }}>No contractors yet.</p>}
            {contractors.map(c => (
              <div key={c.id} style={s.card}>
                <div style={s.title}>{c.company_name || [c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(" ") || "Unnamed contractor"}</div>
                {flagMatches[c.id] && (
                  <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.4)", borderRadius:"8px", color:"#fca5a5", fontSize:".8rem", lineHeight:1.45 }}>
                    {"Possible re-signup — matches a previously deleted account that had poor reviews (avg "}
                    {flagMatches[c.id].avg}{"/10 over "}{flagMatches[c.id].count}{" review"}{flagMatches[c.id].count === 1 ? "" : "s"}{", deleted "}
                    {new Date(flagMatches[c.id].date).toLocaleDateString()}{"). Matched on "}{flagMatches[c.id].fields.join(", ")}{"."}
                  </div>
                )}
                {c.company_name && [c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(" ") ? <div style={s.meta}>{[c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(" ")}</div> : null}
                {(c.profile?.email || c.profile?.phone) && <div style={s.meta}>{[c.profile?.email, c.profile?.phone].filter(Boolean).join(" · ")}</div>}
                <div style={s.meta}>Specialties: {(c.specialties ?? []).join(", ") || "—"}</div>
                <div style={s.meta}>Area: {(c.service_area ?? []).join(", ") || "—"}</div>
                <div style={{ ...s.meta, marginTop:".4rem", color:"rgba(190,205,235,.55)" }}>
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
                    <button style={{ ...s.btn, color:"#86efac", borderColor:"rgba(34,197,94,.35)" }}
                      onClick={() => supabase.rpc("admin_set_contractor_status", { p_id: c.id, p_status: "active" }).then(loadAll)}>
                      Approve
                    </button>
                  )}
                  {c.status === "active" && (
                    <button style={{ ...s.btn, color:"#fca5a5", borderColor:"rgba(239,68,68,.3)" }}
                      onClick={() => supabase.rpc("admin_set_contractor_status", { p_id: c.id, p_status: "inactive" }).then(loadAll)}>
                      Deactivate
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
            {jobs.length === 0 && <p style={{ color:"rgba(190,205,235,.45)" }}>No jobs yet.</p>}
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
      </div>
    </div>
  );
}
