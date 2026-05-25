import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [tab, setTab] = useState<"requests"|"contractors"|"jobs">("requests");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setLocation("/login");
    });
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: reqs }, { data: cons }, { data: js }] = await Promise.all([
      supabase.from("client_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("contractors").select("*").order("created_at", { ascending: false }),
      supabase.from("jobs").select("*").order("created_at", { ascending: false }),
    ]);
    setRequests(reqs ?? []);
    setContractors(cons ?? []);
    setJobs(js ?? []);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  const s = { wrap: { minHeight:"100vh", background:"#1a2236", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" }, header: { background:"rgba(255,255,255,.03)", borderBottom:"1px solid rgba(255,255,255,.07)", padding:"1rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center" }, logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" }, content: { maxWidth:"1000px", margin:"0 auto", padding:"2rem 1.5rem" }, tabs: { display:"flex", gap:".5rem", marginBottom:"1.5rem" }, tab: { padding:".6rem 1.2rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px", color:"rgba(190,205,235,.6)", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem" }, activeTab: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.4)", color:"#f0f4ff" }, card: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"12px", padding:"1.25rem", marginBottom:"1rem" }, title: { fontSize:".95rem", fontWeight:500, color:"#f0f4ff", marginBottom:".35rem" }, meta: { fontSize:".78rem", color:"rgba(190,205,235,.5)", marginBottom:".2rem" }, badge: { fontSize:".75rem", fontWeight:500, color:"#ea6b14" }, btn: { padding:".5rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"6px", color:"rgba(190,205,235,.7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" } };

  if (loading) return <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>Loading…</div>;

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.header}>
        <div style={s.logo}>FREDDY <span style={{ color:"#ea6b14" }}>FIXIT</span> <span style={{ fontSize:".65rem", background:"#ea6b14", color:"#fff", borderRadius:"4px", padding:".1rem .4rem", verticalAlign:"middle" }}>ADMIN</span></div>
        <button style={s.btn} onClick={handleSignOut}>Sign Out</button>
      </div>

      <div style={s.content}>
        <div style={s.tabs}>
          {(["requests","contractors","jobs"] as const).map(t => (
            <button key={t} style={{ ...s.tab, ...(tab===t ? s.activeTab : {}) }} onClick={() => setTab(t)}>
              {t === "requests" ? `📋 Requests (${requests.length})` : t === "contractors" ? `🔧 Contractors (${contractors.length})` : `💼 Jobs (${jobs.length})`}
            </button>
          ))}
        </div>

        {tab === "requests" && (
          <div>
            {requests.length === 0 && <p style={{ color:"rgba(190,205,235,.45)" }}>No requests yet.</p>}
            {requests.map(r => (
              <div key={r.id} style={s.card}>
                <div style={s.title}>{r.service_needed}</div>
                <div style={s.meta}>👤 {r.first_name} {r.last_name} · 📞 {r.phone}</div>
                <div style={s.meta}>📍 {r.location} · ⏱ {r.preferred_schedule}</div>
                <div style={s.meta}>{r.job_description}</div>
                <div style={{ ...s.badge, marginTop:".5rem" }}>● {r.status}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "contractors" && (
          <div>
            {contractors.length === 0 && <p style={{ color:"rgba(190,205,235,.45)" }}>No contractors yet.</p>}
            {contractors.map(c => (
              <div key={c.id} style={s.card}>
                <div style={s.title}>{c.id}</div>
                <div style={s.meta}>Specialties: {(c.specialties ?? []).join(", ") || "—"}</div>
                <div style={s.meta}>Area: {(c.service_area ?? []).join(", ") || "—"}</div>
                <div style={{ ...s.badge, marginTop:".5rem" }}>● {c.status}</div>
                <div style={{ display:"flex", gap:".5rem", marginTop:".75rem" }}>
                  {c.status !== "active" && (
                    <button style={{ ...s.btn, color:"#86efac", borderColor:"rgba(34,197,94,.35)" }}
                      onClick={() => supabase.from("contractors").update({ status:"active" }).eq("id", c.id).then(loadAll)}>
                      Approve
                    </button>
                  )}
                  {c.status === "active" && (
                    <button style={{ ...s.btn, color:"#fca5a5", borderColor:"rgba(239,68,68,.3)" }}
                      onClick={() => supabase.from("contractors").update({ status:"inactive" }).eq("id", c.id).then(loadAll)}>
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
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
                {j.scheduled_date && <div style={s.meta}>Date: {j.scheduled_date}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
