import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, signOut } from "@/lib/supabase";
import type { Job, Client, Contractor, Earning } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, LogOut, Search, ChevronDown } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", matched: "#3b82f6",
  in_progress: "#8b5cf6", completed: "#10b981", cancelled: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", matched: "Matched",
  in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};
const JOB_STATUSES = ["pending", "matched", "in_progress", "completed", "cancelled"];

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing:border-box; }
  .ad-wrap { min-height:100vh; background:#111827; font-family:'DM Sans',sans-serif; color:#f0f4ff; }
  .ad-wrap::before { content:''; position:fixed; inset:0; pointer-events:none;
    background-image:repeating-linear-gradient(0deg,transparent,transparent 60px,rgba(255,255,255,0.01) 60px,rgba(255,255,255,0.01) 61px),
      repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(255,255,255,0.01) 60px,rgba(255,255,255,0.01) 61px); }

  /* Sidebar + layout */
  .ad-layout { display:flex; min-height:100vh; }
  .ad-sidebar { width:220px; flex-shrink:0; background:rgba(255,255,255,0.03); border-right:1px solid rgba(255,255,255,0.07);
    display:flex; flex-direction:column; position:sticky; top:0; height:100vh; }
  .ad-sidebar-brand { padding:1.5rem 1.25rem; border-bottom:1px solid rgba(255,255,255,0.07); }
  .ad-sidebar-brand-title { font-family:'Bebas Neue',sans-serif; font-size:1.2rem; letter-spacing:0.1em; }
  .ad-sidebar-brand-title span { color:#ea6b14; }
  .ad-sidebar-brand-sub { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.12em;
    color:rgba(190,205,235,0.3); margin-top:0.1rem; }
  .ad-nav { padding:1rem 0; flex:1; }
  .ad-nav-item { display:flex; align-items:center; gap:0.65rem; padding:0.65rem 1.25rem;
    cursor:pointer; transition:all 0.15s; font-size:0.88rem; color:rgba(190,205,235,0.6);
    border-left:3px solid transparent; }
  .ad-nav-item:hover { background:rgba(255,255,255,0.04); color:#f0f4ff; }
  .ad-nav-item.active { background:rgba(234,107,20,0.08); color:#f0f4ff; border-left-color:#ea6b14; }
  .ad-nav-icon { font-size:1rem; width:20px; text-align:center; }
  .ad-sidebar-footer { padding:1rem 1.25rem; border-top:1px solid rgba(255,255,255,0.07); }
  .ad-logout { display:flex; align-items:center; gap:0.5rem; background:none; border:none;
    color:rgba(190,205,235,0.45); font-family:'DM Sans',sans-serif; font-size:0.82rem;
    cursor:pointer; padding:0; transition:color 0.2s; }
  .ad-logout:hover { color:#ea6b14; }

  /* Main content */
  .ad-main { flex:1; padding:2rem; overflow:auto; position:relative; z-index:1; }
  .ad-page-title { font-family:'Bebas Neue',sans-serif; font-size:2rem; letter-spacing:0.06em; margin:0 0 1.75rem; }
  .ad-page-title span { color:#ea6b14; }

  /* Stats */
  .ad-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1rem; margin-bottom:2rem; }
  .ad-stat { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:1.25rem; }
  .ad-stat-label { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.1em;
    color:rgba(190,205,235,0.45); margin-bottom:0.5rem; }
  .ad-stat-value { font-family:'Bebas Neue',sans-serif; font-size:2.2rem; letter-spacing:0.04em; color:#f0f4ff; }
  .ad-stat-value.orange { color:#ea6b14; }
  .ad-stat-value.green { color:#10b981; }

  /* Toolbar */
  .ad-toolbar { display:flex; gap:0.75rem; margin-bottom:1.25rem; flex-wrap:wrap; align-items:center; }
  .ad-search { display:flex; align-items:center; gap:0.5rem; padding:0.55rem 0.9rem;
    background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; flex:1; max-width:320px; }
  .ad-search input { background:none; border:none; outline:none; color:#f0f4ff;
    font-family:'DM Sans',sans-serif; font-size:0.88rem; width:100%; }
  .ad-search input::placeholder { color:rgba(190,205,235,0.3); }
  .ad-filter-select { padding:0.55rem 0.9rem; background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#f0f4ff;
    font-family:'DM Sans',sans-serif; font-size:0.85rem; outline:none; cursor:pointer; }

  /* Table */
  .ad-table-wrap { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08);
    border-radius:14px; overflow:hidden; }
  .ad-table { width:100%; border-collapse:collapse; }
  .ad-table th { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.1em;
    color:rgba(190,205,235,0.4); font-weight:500; padding:0.75rem 1rem; text-align:left;
    border-bottom:1px solid rgba(255,255,255,0.07); background:rgba(255,255,255,0.02); white-space:nowrap; }
  .ad-table td { padding:1rem 1rem; font-size:0.88rem; border-bottom:1px solid rgba(255,255,255,0.05); vertical-align:middle; }
  .ad-table tr:last-child td { border-bottom:none; }
  .ad-table tr:hover td { background:rgba(255,255,255,0.02); }
  .ad-badge { padding:0.25rem 0.65rem; border-radius:99px; font-size:0.72rem; font-weight:500; white-space:nowrap; }
  .ad-approved { background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.25); }
  .ad-pending-badge { background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.25); }

  /* Inline status dropdown */
  .ad-status-select { padding:0.25rem 0.5rem; border-radius:6px; font-size:0.78rem; font-weight:500;
    border:none; cursor:pointer; font-family:'DM Sans',sans-serif; outline:none; }

  /* Expandable row detail */
  .ad-row-detail { padding:1rem 1rem 1.25rem 1rem; background:rgba(234,107,20,0.03);
    border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.83rem; color:rgba(190,205,235,0.65); }
  .ad-row-detail-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:0.75rem; }
  .ad-detail-item { }
  .ad-detail-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em;
    color:rgba(190,205,235,0.4); margin-bottom:0.2rem; }
  .ad-detail-val { color:#f0f4ff; font-size:0.85rem; }
  .ad-approve-btn { padding:0.35rem 0.85rem; border:none; border-radius:6px; font-size:0.78rem;
    font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; }
  .ad-approve-btn.approve { background:#ea6b14; color:#fff; }
  .ad-approve-btn.approve:hover { background:#f07a28; }
  .ad-approve-btn.revoke { background:rgba(239,68,68,0.12); color:#f87171; border:1px solid rgba(239,68,68,0.25); }
  .ad-approve-btn.revoke:hover { background:rgba(239,68,68,0.2); }

  .ad-loading { display:flex; align-items:center; justify-content:center; padding:4rem; color:rgba(190,205,235,0.4); gap:0.75rem; }
  .ad-empty { text-align:center; padding:3rem; color:rgba(190,205,235,0.35); font-size:0.9rem; }
`;

type AdminTab = "overview" | "jobs" | "clients" | "contractors";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }

      const [jobsRes, clientsRes, contractorsRes, earningsRes] = await Promise.all([
        supabase.from("jobs").select("*, clients(*), contractors(*)").order("created_at", { ascending: false }),
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase.from("contractors").select("*").order("created_at", { ascending: false }),
        supabase.from("earnings").select("*"),
      ]);

      setJobs(jobsRes.data ?? []);
      setClients(clientsRes.data ?? []);
      setContractors(contractorsRes.data ?? []);
      setEarnings(earningsRes.data ?? []);
      setLoading(false);
    })();

    // Realtime for jobs
    const sub = supabase.channel("admin-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        supabase.from("jobs").select("*, clients(*), contractors(*)").order("created_at", { ascending: false })
          .then(({ data }) => { if (data) setJobs(data); });
      }).subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  const updateJobStatus = async (jobId: string, status: string) => {
    const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
    if (!error) {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: status as any } : j));
      toast.success("Job status updated");
    }
  };

  const toggleApproval = async (contractor: Contractor) => {
    const { error } = await supabase.from("contractors").update({ is_approved: !contractor.is_approved }).eq("id", contractor.id);
    if (!error) {
      setContractors(prev => prev.map(c => c.id === contractor.id ? { ...c, is_approved: !c.is_approved } : c));
      toast.success(contractor.is_approved ? "Contractor revoked" : "Contractor approved!");
    }
  };

  const assignContractor = async (jobId: string, contractorId: string) => {
    const { error } = await supabase.from("jobs").update({ contractor_id: contractorId, status: "matched" }).eq("id", jobId);
    if (!error) {
      const contractor = contractors.find(c => c.id === contractorId);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, contractor_id: contractorId, status: "matched" as any, contractors: contractor } : j));
      toast.success("Contractor assigned!");
    }
  };

  const handleLogout = async () => { await signOut(); setLocation("/login"); };
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

  // Derived stats
  const totalRevenue = earnings.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);
  const pendingJobs = jobs.filter(j => j.status === "pending").length;
  const approvedContractors = contractors.filter(c => c.is_approved).length;

  // Filtered data
  const filteredJobs = jobs.filter(j => {
    const matchSearch = !search ||
      j.service_needed.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase()) ||
      (j.clients as any)?.first_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredClients = clients.filter(c =>
    !search || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredContractors = contractors.filter(c =>
    !search || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const navItems: { id: AdminTab; icon: string; label: string }[] = [
    { id: "overview", icon: "📊", label: "Overview" },
    { id: "jobs", icon: "🔧", label: "Jobs" },
    { id: "clients", icon: "🏠", label: "Clients" },
    { id: "contractors", icon: "👷", label: "Contractors" },
  ];

  return (
    <div className="ad-wrap">
      <style>{styles}</style>
      <div className="ad-layout">

        {/* Sidebar */}
        <div className="ad-sidebar">
          <div className="ad-sidebar-brand">
            <div className="ad-sidebar-brand-title">FREDDY <span>FIXIT</span></div>
            <div className="ad-sidebar-brand-sub">Admin Panel</div>
          </div>
          <nav className="ad-nav">
            {navItems.map(n => (
              <div key={n.id} className={`ad-nav-item${tab === n.id ? " active" : ""}`} onClick={() => { setTab(n.id); setExpandedRow(null); setSearch(""); }}>
                <span className="ad-nav-icon">{n.icon}</span> {n.label}
                {n.id === "jobs" && pendingJobs > 0 && (
                  <span style={{ marginLeft: "auto", background: "#ea6b14", color: "#fff", borderRadius: "99px", padding: "0.1rem 0.45rem", fontSize: "0.7rem", fontWeight: 600 }}>{pendingJobs}</span>
                )}
              </div>
            ))}
          </nav>
          <div className="ad-sidebar-footer">
            <button className="ad-logout" onClick={handleLogout}><LogOut size={13} /> Sign Out</button>
          </div>
        </div>

        {/* Main */}
        <main className="ad-main">
          {loading ? (
            <div className="ad-loading"><Loader2 size={22} className="animate-spin" /> Loading…</div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

                {/* ── OVERVIEW ── */}
                {tab === "overview" && (
                  <>
                    <p className="ad-page-title">Dashboard <span>Overview</span></p>
                    <div className="ad-stats">
                      <div className="ad-stat"><div className="ad-stat-label">Total Jobs</div><div className="ad-stat-value orange">{jobs.length}</div></div>
                      <div className="ad-stat"><div className="ad-stat-label">Pending Jobs</div><div className="ad-stat-value" style={{ color: "#f59e0b" }}>{pendingJobs}</div></div>
                      <div className="ad-stat"><div className="ad-stat-label">In Progress</div><div className="ad-stat-value" style={{ color: "#8b5cf6" }}>{jobs.filter(j => j.status === "in_progress").length}</div></div>
                      <div className="ad-stat"><div className="ad-stat-label">Completed</div><div className="ad-stat-value green">{jobs.filter(j => j.status === "completed").length}</div></div>
                      <div className="ad-stat"><div className="ad-stat-label">Total Clients</div><div className="ad-stat-value">{clients.length}</div></div>
                      <div className="ad-stat"><div className="ad-stat-label">Contractors</div><div className="ad-stat-value">{contractors.length}</div></div>
                      <div className="ad-stat"><div className="ad-stat-label">Approved Pros</div><div className="ad-stat-value orange">{approvedContractors}</div></div>
                      <div className="ad-stat"><div className="ad-stat-label">Revenue Paid</div><div className="ad-stat-value green">${totalRevenue.toFixed(2)}</div></div>
                    </div>

                    {/* Recent jobs */}
                    <p className="ad-page-title" style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Recent <span>Jobs</span></p>
                    <div className="ad-table-wrap">
                      <table className="ad-table">
                        <thead><tr><th>Service</th><th>Client</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>
                          {jobs.slice(0, 8).map(j => (
                            <tr key={j.id}>
                              <td style={{ color: "#f0f4ff", fontWeight: 500 }}>{j.service_needed}</td>
                              <td style={{ color: "rgba(190,205,235,0.7)" }}>{(j.clients as any)?.first_name} {(j.clients as any)?.last_name}</td>
                              <td><span className="ad-badge" style={{ background: `${STATUS_COLORS[j.status]}22`, color: STATUS_COLORS[j.status], border: `1px solid ${STATUS_COLORS[j.status]}44` }}>{STATUS_LABELS[j.status]}</span></td>
                              <td style={{ color: "rgba(190,205,235,0.5)" }}>{formatDate(j.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* ── JOBS ── */}
                {tab === "jobs" && (
                  <>
                    <p className="ad-page-title">All <span>Jobs</span></p>
                    <div className="ad-toolbar">
                      <div className="ad-search">
                        <Search size={14} style={{ color: "rgba(190,205,235,0.4)", flexShrink: 0 }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, clients, locations…" />
                      </div>
                      <select className="ad-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="all">All Statuses</option>
                        {JOB_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                    <div className="ad-table-wrap">
                      <table className="ad-table">
                        <thead><tr><th></th><th>Service</th><th>Client</th><th>Contractor</th><th>Status</th><th>Schedule</th><th>Submitted</th></tr></thead>
                        <tbody>
                          {filteredJobs.length === 0 && <tr><td colSpan={7} className="ad-empty">No jobs found</td></tr>}
                          {filteredJobs.map(j => (
                            <>
                              <tr key={j.id} style={{ cursor: "pointer" }} onClick={() => setExpandedRow(expandedRow === j.id ? null : j.id)}>
                                <td style={{ width: 32 }}>
                                  <ChevronDown size={14} style={{ color: "rgba(190,205,235,0.4)", transform: expandedRow === j.id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                                </td>
                                <td style={{ color: "#f0f4ff", fontWeight: 500 }}>{j.service_needed}</td>
                                <td style={{ color: "rgba(190,205,235,0.7)" }}>{(j.clients as any)?.first_name} {(j.clients as any)?.last_name}</td>
                                <td style={{ color: "rgba(190,205,235,0.7)" }}>
                                  {j.contractors ? `${(j.contractors as any).first_name} ${(j.contractors as any).last_name}` : (
                                    <select className="ad-filter-select" style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem" }}
                                      defaultValue=""
                                      onChange={e => { if (e.target.value) assignContractor(j.id, e.target.value); }}
                                      onClick={e => e.stopPropagation()}>
                                      <option value="" disabled>Assign…</option>
                                      {contractors.filter(c => c.is_approved).map(c => (
                                        <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td onClick={e => e.stopPropagation()}>
                                  <select className="ad-status-select"
                                    style={{ background: `${STATUS_COLORS[j.status]}22`, color: STATUS_COLORS[j.status] }}
                                    value={j.status}
                                    onChange={e => updateJobStatus(j.id, e.target.value)}>
                                    {JOB_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                  </select>
                                </td>
                                <td style={{ color: "rgba(190,205,235,0.55)" }}>{j.preferred_schedule}</td>
                                <td style={{ color: "rgba(190,205,235,0.5)", whiteSpace: "nowrap" }}>{formatDate(j.created_at)}</td>
                              </tr>
                              {expandedRow === j.id && (
                                <tr>
                                  <td colSpan={7} style={{ padding: 0 }}>
                                    <div className="ad-row-detail">
                                      <div className="ad-row-detail-grid">
                                        <div className="ad-detail-item"><div className="ad-detail-label">Location</div><div className="ad-detail-val">📍 {j.location}</div></div>
                                        <div className="ad-detail-item"><div className="ad-detail-label">Description</div><div className="ad-detail-val">{j.job_description}</div></div>
                                        <div className="ad-detail-item"><div className="ad-detail-label">Client Phone</div><div className="ad-detail-val">{(j.clients as any)?.phone ?? "—"}</div></div>
                                        <div className="ad-detail-item"><div className="ad-detail-label">Client Email</div><div className="ad-detail-val">{(j.clients as any)?.email ?? "—"}</div></div>
                                        {j.quoted_price && <div className="ad-detail-item"><div className="ad-detail-label">Quoted</div><div className="ad-detail-val">${j.quoted_price}</div></div>}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* ── CLIENTS ── */}
                {tab === "clients" && (
                  <>
                    <p className="ad-page-title">All <span>Clients</span></p>
                    <div className="ad-toolbar">
                      <div className="ad-search">
                        <Search size={14} style={{ color: "rgba(190,205,235,0.4)", flexShrink: 0 }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" />
                      </div>
                    </div>
                    <div className="ad-table-wrap">
                      <table className="ad-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Jobs</th><th>Joined</th></tr></thead>
                        <tbody>
                          {filteredClients.length === 0 && <tr><td colSpan={5} className="ad-empty">No clients found</td></tr>}
                          {filteredClients.map(c => {
                            const clientJobCount = jobs.filter(j => j.client_id === c.id).length;
                            return (
                              <tr key={c.id}>
                                <td style={{ color: "#f0f4ff", fontWeight: 500 }}>{c.first_name} {c.last_name}</td>
                                <td style={{ color: "rgba(190,205,235,0.65)" }}>{c.email}</td>
                                <td style={{ color: "rgba(190,205,235,0.65)" }}>{c.phone}</td>
                                <td>
                                  <span className="ad-badge" style={{ background: "rgba(234,107,20,0.1)", color: "#ea6b14", border: "1px solid rgba(234,107,20,0.25)" }}>
                                    {clientJobCount} job{clientJobCount !== 1 ? "s" : ""}
                                  </span>
                                </td>
                                <td style={{ color: "rgba(190,205,235,0.5)" }}>{formatDate(c.created_at)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* ── CONTRACTORS ── */}
                {tab === "contractors" && (
                  <>
                    <p className="ad-page-title">All <span>Contractors</span></p>
                    <div className="ad-toolbar">
                      <div className="ad-search">
                        <Search size={14} style={{ color: "rgba(190,205,235,0.4)", flexShrink: 0 }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" />
                      </div>
                    </div>
                    <div className="ad-table-wrap">
                      <table className="ad-table">
                        <thead><tr><th></th><th>Name</th><th>Email</th><th>Specialties</th><th>Areas</th><th>Exp</th><th>Rating</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>
                          {filteredContractors.length === 0 && <tr><td colSpan={9} className="ad-empty">No contractors found</td></tr>}
                          {filteredContractors.map(c => (
                            <>
                              <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setExpandedRow(expandedRow === c.id ? null : c.id)}>
                                <td style={{ width: 32 }}>
                                  <ChevronDown size={14} style={{ color: "rgba(190,205,235,0.4)", transform: expandedRow === c.id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                                </td>
                                <td style={{ color: "#f0f4ff", fontWeight: 500 }}>{c.first_name} {c.last_name}</td>
                                <td style={{ color: "rgba(190,205,235,0.65)" }}>{c.email}</td>
                                <td style={{ color: "rgba(190,205,235,0.65)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.specialties?.slice(0, 2).join(", ")}{c.specialties?.length > 2 ? ` +${c.specialties.length - 2}` : ""}
                                </td>
                                <td style={{ color: "rgba(190,205,235,0.65)" }}>{c.service_area?.length ?? 0} zone{c.service_area?.length !== 1 ? "s" : ""}</td>
                                <td style={{ color: "rgba(190,205,235,0.65)" }}>{c.years_of_experience}y</td>
                                <td style={{ color: "#ea6b14" }}>⭐ {c.rating?.toFixed(1) ?? "—"}</td>
                                <td onClick={e => e.stopPropagation()}>
                                  <span className={`ad-badge ${c.is_approved ? "ad-approved" : "ad-pending-badge"}`}>
                                    {c.is_approved ? "✓ Approved" : "⏳ Pending"}
                                  </span>
                                </td>
                                <td onClick={e => e.stopPropagation()}>
                                  <button className={`ad-approve-btn ${c.is_approved ? "revoke" : "approve"}`} onClick={() => toggleApproval(c)}>
                                    {c.is_approved ? "Revoke" : "Approve"}
                                  </button>
                                </td>
                              </tr>
                              {expandedRow === c.id && (
                                <tr>
                                  <td colSpan={9} style={{ padding: 0 }}>
                                    <div className="ad-row-detail">
                                      <div className="ad-row-detail-grid">
                                        <div className="ad-detail-item"><div className="ad-detail-label">Phone</div><div className="ad-detail-val">{c.phone}</div></div>
                                        <div className="ad-detail-item"><div className="ad-detail-label">All Specialties</div><div className="ad-detail-val">{c.specialties?.join(", ") || "—"}</div></div>
                                        <div className="ad-detail-item"><div className="ad-detail-label">Service Areas</div><div className="ad-detail-val">{c.service_area?.join(", ") || "—"}</div></div>
                                        <div className="ad-detail-item"><div className="ad-detail-label">Total Jobs</div><div className="ad-detail-val">{c.total_jobs}</div></div>
                                        <div className="ad-detail-item"><div className="ad-detail-label">Total Earnings</div><div className="ad-detail-val">${c.total_earnings?.toFixed(2)}</div></div>
                                        {c.photo_url && <div className="ad-detail-item"><div className="ad-detail-label">Photo</div><img src={c.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", marginTop: 4 }} /></div>}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}
