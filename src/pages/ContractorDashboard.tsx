import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, signOut } from "@/lib/supabase";
import type { Job, Message, Contractor, Earning } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Send, LogOut, CheckCircle, Clock } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", matched: "#3b82f6",
  in_progress: "#8b5cf6", completed: "#10b981", cancelled: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", matched: "Matched",
  in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing:border-box; }
  .ff-wrap { min-height:100vh; background:#1a2236; font-family:'DM Sans',sans-serif; color:#f0f4ff; }
  .ff-wrap::before { content:''; position:fixed; inset:0; pointer-events:none;
    background-image:repeating-linear-gradient(0deg,transparent,transparent 60px,rgba(255,255,255,0.012) 60px,rgba(255,255,255,0.012) 61px),
      repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(255,255,255,0.012) 60px,rgba(255,255,255,0.012) 61px); }

  .ff-nav { display:flex; align-items:center; justify-content:space-between;
    padding:1rem 2rem; border-bottom:1px solid rgba(255,255,255,0.07);
    background:rgba(26,34,54,0.95); position:sticky; top:0; z-index:100; backdrop-filter:blur(8px); }
  .ff-nav-brand { font-family:'Bebas Neue',sans-serif; font-size:1.4rem; letter-spacing:0.1em; }
  .ff-nav-brand span { color:#ea6b14; }
  .ff-nav-right { display:flex; align-items:center; gap:1rem; }
  .ff-nav-btn { display:flex; align-items:center; gap:0.4rem; padding:0.45rem 0.9rem;
    border-radius:7px; font-size:0.82rem; font-weight:500; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.2s; }
  .ff-nav-btn-ghost { background:none; color:rgba(190,205,235,0.6); border:1px solid rgba(255,255,255,0.1); }
  .ff-nav-btn-ghost:hover { color:#f0f4ff; border-color:rgba(255,255,255,0.25); }
  .ff-approval-badge { padding:0.35rem 0.8rem; border-radius:99px; font-size:0.75rem; font-weight:500; }

  .ff-body { max-width:1100px; margin:0 auto; padding:2rem 1.5rem; position:relative; z-index:1; }

  /* Stats row */
  .ff-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1rem; margin-bottom:2rem; }
  .ff-stat { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
    border-radius:12px; padding:1.25rem; }
  .ff-stat-label { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em;
    color:rgba(190,205,235,0.5); margin-bottom:0.5rem; }
  .ff-stat-value { font-family:'Bebas Neue',sans-serif; font-size:2rem; letter-spacing:0.04em; color:#f0f4ff; }
  .ff-stat-value.orange { color:#ea6b14; }

  /* Tabs */
  .ff-tabs { display:flex; gap:4px; margin-bottom:2rem;
    background:rgba(255,255,255,0.04); border-radius:9px; padding:4px; width:fit-content; }
  .ff-tab { padding:0.5rem 1.2rem; border:none; border-radius:6px; background:none;
    font-family:'DM Sans',sans-serif; font-size:0.85rem; font-weight:500;
    color:rgba(190,205,235,0.5); cursor:pointer; transition:all 0.2s; }
  .ff-tab.active { background:#ea6b14; color:#fff; box-shadow:0 2px 10px rgba(234,107,20,0.3); }

  /* Cards */
  .ff-card { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
    border-radius:14px; padding:1.5rem; margin-bottom:1rem; }
  .ff-card-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:0.75rem; gap:1rem; }
  .ff-card-title { font-size:1rem; font-weight:500; color:#f0f4ff; margin:0 0 0.2rem; }
  .ff-card-sub { font-size:0.8rem; color:rgba(190,205,235,0.5); margin:0; font-weight:300; }
  .ff-status-badge { padding:0.3rem 0.7rem; border-radius:99px; font-size:0.75rem; font-weight:500;
    letter-spacing:0.05em; white-space:nowrap; flex-shrink:0; }
  .ff-card-meta { display:flex; flex-wrap:wrap; gap:1rem; margin-top:0.75rem; }
  .ff-meta-item { font-size:0.82rem; color:rgba(190,205,235,0.55); display:flex; align-items:center; gap:0.35rem; }
  .ff-card-actions { display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap; }
  .ff-action-btn { padding:0.5rem 1rem; border-radius:7px; font-family:'DM Sans',sans-serif;
    font-size:0.82rem; font-weight:500; cursor:pointer; border:none; transition:all 0.2s;
    display:flex; align-items:center; gap:0.4rem; }
  .ff-action-accept { background:#ea6b14; color:#fff; }
  .ff-action-accept:hover { background:#f07a28; }
  .ff-action-complete { background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); }
  .ff-action-complete:hover { background:rgba(16,185,129,0.25); }
  .ff-action-decline { background:rgba(255,255,255,0.05); color:rgba(190,205,235,0.6); border:1px solid rgba(255,255,255,0.1); }
  .ff-action-decline:hover { background:rgba(255,255,255,0.1); }

  /* Profile section */
  .ff-profile-grid { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }
  @media (max-width:640px) { .ff-profile-grid { grid-template-columns:1fr; } }
  .ff-profile-avatar { width:72px; height:72px; border-radius:50%; background:rgba(234,107,20,0.15);
    border:2px solid rgba(234,107,20,0.3); display:flex; align-items:center; justify-content:center;
    font-size:2rem; margin-bottom:1rem; overflow:hidden; }
  .ff-profile-avatar img { width:100%; height:100%; object-fit:cover; }
  .ff-profile-name { font-family:'Bebas Neue',sans-serif; font-size:1.8rem; letter-spacing:0.05em; margin:0 0 0.25rem; }
  .ff-profile-email { font-size:0.85rem; color:rgba(190,205,235,0.55); margin-bottom:1rem; }
  .ff-tag-list { display:flex; flex-wrap:wrap; gap:0.4rem; }
  .ff-tag { padding:0.3rem 0.65rem; background:rgba(234,107,20,0.1); border:1px solid rgba(234,107,20,0.25);
    border-radius:99px; font-size:0.75rem; color:#ea6b14; }
  .ff-section-label { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em;
    color:rgba(190,205,235,0.4); margin-bottom:0.75rem; }
  .ff-avail-day { margin-bottom:0.9rem; }
  .ff-avail-day-name { font-size:0.8rem; color:rgba(190,205,235,0.55); margin-bottom:0.4rem; }
  .ff-avail-slots { display:flex; flex-wrap:wrap; gap:0.4rem; }
  .ff-avail-slot { padding:0.3rem 0.75rem; border-radius:99px; font-size:0.75rem;
    background:rgba(234,107,20,0.1); border:1px solid rgba(234,107,20,0.25); color:#ea6b14; }

  /* Earnings */
  .ff-earnings-table { width:100%; border-collapse:collapse; }
  .ff-earnings-table th { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.1em;
    color:rgba(190,205,235,0.4); font-weight:500; padding:0.5rem 0.75rem; text-align:left;
    border-bottom:1px solid rgba(255,255,255,0.07); }
  .ff-earnings-table td { padding:0.85rem 0.75rem; font-size:0.88rem; border-bottom:1px solid rgba(255,255,255,0.05); }
  .ff-earnings-table tr:last-child td { border-bottom:none; }
  .ff-pay-badge { padding:0.25rem 0.6rem; border-radius:99px; font-size:0.72rem; font-weight:500; }
  .ff-pay-paid { background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.25); }
  .ff-pay-pending { background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.25); }
  .ff-pay-processing { background:rgba(59,130,246,0.12); color:#3b82f6; border:1px solid rgba(59,130,246,0.25); }

  /* Chat */
  .ff-chat-wrap { display:flex; flex-direction:column; height:480px; }
  .ff-chat-header { padding:1rem 1.25rem; border-bottom:1px solid rgba(255,255,255,0.07);
    font-size:0.9rem; font-weight:500; }
  .ff-chat-messages { flex:1; overflow-y:auto; padding:1.25rem; display:flex; flex-direction:column; gap:0.75rem; }
  .ff-chat-messages::-webkit-scrollbar { width:4px; }
  .ff-chat-messages::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:4px; }
  .ff-msg { max-width:75%; }
  .ff-msg.mine { align-self:flex-end; }
  .ff-msg.theirs { align-self:flex-start; }
  .ff-msg-bubble { padding:0.65rem 0.9rem; border-radius:12px; font-size:0.9rem; line-height:1.45; }
  .ff-msg.mine .ff-msg-bubble { background:#ea6b14; color:#fff; border-radius:12px 12px 3px 12px; }
  .ff-msg.theirs .ff-msg-bubble { background:rgba(255,255,255,0.07); color:#f0f4ff; border-radius:12px 12px 12px 3px; }
  .ff-msg-time { font-size:0.7rem; color:rgba(190,205,235,0.4); margin-top:0.3rem; padding:0 0.25rem; }
  .ff-msg.mine .ff-msg-time { text-align:right; }
  .ff-chat-input { display:flex; gap:0.5rem; padding:1rem 1.25rem; border-top:1px solid rgba(255,255,255,0.07); }
  .ff-chat-input input { flex:1; padding:0.65rem 1rem; background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#f0f4ff;
    font-family:'DM Sans',sans-serif; font-size:0.9rem; outline:none; }
  .ff-chat-input input:focus { border-color:rgba(234,107,20,0.4); }
  .ff-chat-input input::placeholder { color:rgba(190,205,235,0.3); }
  .ff-send-btn { padding:0.65rem 1rem; background:#ea6b14; color:#fff; border:none;
    border-radius:8px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; }
  .ff-send-btn:hover { background:#f07a28; }
  .ff-send-btn:disabled { opacity:0.5; cursor:not-allowed; }

  .ff-empty { text-align:center; padding:3rem 1rem; color:rgba(190,205,235,0.4); }
  .ff-empty-icon { font-size:2.5rem; margin-bottom:1rem; }
  .ff-empty-title { font-size:1rem; font-weight:500; color:rgba(190,205,235,0.6); margin-bottom:0.5rem; }
  .ff-loading { display:flex; align-items:center; justify-content:center; padding:3rem; color:rgba(190,205,235,0.5); gap:0.75rem; }
`;

type DashTab = "available" | "assigned" | "profile" | "earnings";

export default function ContractorDashboard() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<DashTab>("available");
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [assignedJobs, setAssignedJobs] = useState<Job[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [chatJob, setChatJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }
      setUserId(user.id);

      const { data: c } = await supabase.from("contractors").select("*").eq("user_id", user.id).single();
      if (c) {
        setContractor(c);

        // Available jobs: pending, in their service area
        const { data: avail } = await supabase
          .from("jobs")
          .select("*, clients(*)")
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        setAvailableJobs(avail ?? []);

        // Assigned jobs
        const { data: assigned } = await supabase
          .from("jobs")
          .select("*, clients(*)")
          .eq("contractor_id", c.id)
          .order("created_at", { ascending: false });
        setAssignedJobs(assigned ?? []);

        // Earnings
        const { data: earn } = await supabase
          .from("earnings")
          .select("*, jobs(service_needed, completed_at)")
          .eq("contractor_id", c.id)
          .order("created_at", { ascending: false });
        setEarnings(earn ?? []);
      }
      setLoading(false);
    })();
  }, []);

  // Chat subscription
  useEffect(() => {
    if (!chatJob) return;
    supabase.from("messages").select("*").eq("job_id", chatJob.id).order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));

    const sub = supabase.channel(`messages:${chatJob.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${chatJob.id}` },
        payload => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [chatJob?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const acceptJob = async (job: Job) => {
    if (!contractor) return;
    const { error } = await supabase.from("jobs").update({ status: "matched", contractor_id: contractor.id }).eq("id", job.id);
    if (!error) {
      setAvailableJobs(prev => prev.filter(j => j.id !== job.id));
      setAssignedJobs(prev => [{ ...job, status: "matched", contractor_id: contractor.id }, ...prev]);
      toast.success("Job accepted! The client has been notified.");
      setTab("assigned");
    }
  };

  const markInProgress = async (job: Job) => {
    const { error } = await supabase.from("jobs").update({ status: "in_progress" }).eq("id", job.id);
    if (!error) setAssignedJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "in_progress" } : j));
  };

  const markComplete = async (job: Job) => {
    const { error } = await supabase.from("jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
    if (!error) {
      setAssignedJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "completed" } : j));
      toast.success("Job marked complete!");
    }
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !chatJob || !userId) return;
    setSendingMsg(true);
    const { error } = await supabase.from("messages").insert({
      job_id: chatJob.id, sender_id: userId, sender_role: "contractor", content: msgInput.trim(),
    });
    if (!error) setMsgInput("");
    setSendingMsg(false);
  };

  const handleLogout = async () => { await signOut(); setLocation("/login"); };

  const totalPaid = earnings.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);
  const totalPending = earnings.filter(e => e.status !== "paid").reduce((s, e) => s + e.amount, 0);
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#1a2236", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: "#ea6b14" }} />
    </div>
  );

  return (
    <div className="ff-wrap">
      <style>{styles}</style>

      <nav className="ff-nav">
        <div className="ff-nav-brand">FREDDY <span>FIXIT</span> <span style={{ fontSize: "0.75rem", color: "rgba(190,205,235,0.4)", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.05em", fontWeight: 400 }}>CONTRACTOR</span></div>
        <div className="ff-nav-right">
          {contractor && (
            <span className="ff-approval-badge" style={
              contractor.is_approved
                ? { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }
                : { background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }
            }>
              {contractor.is_approved ? "✓ Approved" : "⏳ Pending Approval"}
            </span>
          )}
          <button className="ff-nav-btn ff-nav-btn-ghost" onClick={handleLogout}><LogOut size={14} /> Sign Out</button>
        </div>
      </nav>

      <div className="ff-body">
        {/* Stats */}
        <div className="ff-stats">
          <div className="ff-stat">
            <div className="ff-stat-label">Total Jobs</div>
            <div className="ff-stat-value orange">{contractor?.total_jobs ?? 0}</div>
          </div>
          <div className="ff-stat">
            <div className="ff-stat-label">Paid Out</div>
            <div className="ff-stat-value">${totalPaid.toFixed(2)}</div>
          </div>
          <div className="ff-stat">
            <div className="ff-stat-label">Pending Pay</div>
            <div className="ff-stat-value">${totalPending.toFixed(2)}</div>
          </div>
          <div className="ff-stat">
            <div className="ff-stat-label">Rating</div>
            <div className="ff-stat-value orange">⭐ {contractor?.rating?.toFixed(1) ?? "—"}</div>
          </div>
          <div className="ff-stat">
            <div className="ff-stat-label">Available Jobs</div>
            <div className="ff-stat-value">{availableJobs.length}</div>
          </div>
        </div>

        <div className="ff-tabs">
          {(["available", "assigned", "profile", "earnings"] as DashTab[]).map(t => (
            <button key={t} className={`ff-tab${tab === t ? " active" : ""}`} onClick={() => { setTab(t); setChatJob(null); }}>
              {t === "available" ? `Available (${availableJobs.length})` : t === "assigned" ? "My Jobs" : t === "profile" ? "Profile" : "Earnings"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

            {/* ── AVAILABLE JOBS ── */}
            {tab === "available" && (
              !contractor?.is_approved ? (
                <div className="ff-card" style={{ textAlign: "center", padding: "2.5rem" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
                  <p style={{ fontWeight: 500, marginBottom: "0.5rem" }}>Profile Under Review</p>
                  <p style={{ fontSize: "0.85rem", color: "rgba(190,205,235,0.5)", fontWeight: 300 }}>
                    Your profile is being reviewed by the Freddy Fix It team. Once approved, you'll see available jobs here.
                  </p>
                </div>
              ) : availableJobs.length === 0 ? (
                <div className="ff-empty"><div className="ff-empty-icon">🔍</div><div className="ff-empty-title">No open jobs right now</div><p style={{ fontSize: "0.85rem", fontWeight: 300 }}>Check back soon — new requests come in regularly.</p></div>
              ) : (
                availableJobs.map(job => (
                  <div key={job.id} className="ff-card">
                    <div className="ff-card-head">
                      <div>
                        <p className="ff-card-title">{job.service_needed}</p>
                        <p className="ff-card-sub">📍 {job.location}</p>
                      </div>
                      <span className="ff-status-badge" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>New Request</span>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "rgba(190,205,235,0.65)", margin: "0 0 0.5rem", fontWeight: 300 }}>{job.job_description}</p>
                    <div className="ff-card-meta">
                      <span className="ff-meta-item">📅 {job.preferred_schedule}</span>
                      <span className="ff-meta-item">🕐 {formatDate(job.created_at)}</span>
                    </div>
                    <div className="ff-card-actions">
                      <button className="ff-action-btn ff-action-accept" onClick={() => acceptJob(job)}>✓ Accept Job</button>
                    </div>
                  </div>
                ))
              )
            )}

            {/* ── ASSIGNED JOBS ── */}
            {tab === "assigned" && (
              chatJob ? (
                <div className="ff-card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="ff-chat-wrap">
                    <div className="ff-chat-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>💬 {chatJob.service_needed}</span>
                      <button onClick={() => setChatJob(null)} style={{ background: "none", border: "none", color: "rgba(190,205,235,0.5)", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans',sans-serif" }}>← Back</button>
                    </div>
                    <div className="ff-chat-messages">
                      {messages.length === 0 && <div style={{ textAlign: "center", color: "rgba(190,205,235,0.35)", fontSize: "0.85rem", margin: "auto" }}>No messages yet.</div>}
                      {messages.map(m => (
                        <div key={m.id} className={`ff-msg ${m.sender_id === userId ? "mine" : "theirs"}`}>
                          <div className="ff-msg-bubble">{m.content}</div>
                          <div className="ff-msg-time">{formatTime(m.created_at)}</div>
                        </div>
                      ))}
                      <div ref={bottomRef} />
                    </div>
                    <div className="ff-chat-input">
                      <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Type a message…" />
                      <button className="ff-send-btn" onClick={sendMessage} disabled={sendingMsg || !msgInput.trim()}><Send size={16} /></button>
                    </div>
                  </div>
                </div>
              ) : assignedJobs.length === 0 ? (
                <div className="ff-empty"><div className="ff-empty-icon">📋</div><div className="ff-empty-title">No jobs assigned yet</div><p style={{ fontSize: "0.85rem", fontWeight: 300 }}>Accept a job from the Available tab to get started.</p></div>
              ) : (
                assignedJobs.map(job => (
                  <div key={job.id} className="ff-card">
                    <div className="ff-card-head">
                      <div>
                        <p className="ff-card-title">{job.service_needed}</p>
                        <p className="ff-card-sub">📍 {job.location}</p>
                      </div>
                      <span className="ff-status-badge" style={{ background: `${STATUS_COLORS[job.status]}22`, color: STATUS_COLORS[job.status], border: `1px solid ${STATUS_COLORS[job.status]}44` }}>
                        {STATUS_LABELS[job.status]}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "rgba(190,205,235,0.65)", margin: "0 0 0.5rem", fontWeight: 300 }}>{job.job_description}</p>
                    <div className="ff-card-meta">
                      <span className="ff-meta-item">📅 {job.preferred_schedule}</span>
                      <span className="ff-meta-item">🕐 {formatDate(job.created_at)}</span>
                      {job.quoted_price && <span className="ff-meta-item">💰 ${job.quoted_price}</span>}
                    </div>
                    <div className="ff-card-actions">
                      {job.status === "matched" && (
                        <button className="ff-action-btn" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.3)" }} onClick={() => markInProgress(job)}>
                          <Clock size={14} /> Mark In Progress
                        </button>
                      )}
                      {job.status === "in_progress" && (
                        <button className="ff-action-btn ff-action-complete" onClick={() => markComplete(job)}>
                          <CheckCircle size={14} /> Mark Complete
                        </button>
                      )}
                      <button className="ff-action-btn ff-action-decline" onClick={() => setChatJob(job)}>💬 Chat with Client</button>
                    </div>
                  </div>
                ))
              )
            )}

            {/* ── PROFILE ── */}
            {tab === "profile" && contractor && (
              <div className="ff-profile-grid">
                <div className="ff-card">
                  <div className="ff-profile-avatar">
                    {contractor.photo_url ? <img src={contractor.photo_url} alt="" /> : "🔧"}
                  </div>
                  <p className="ff-profile-name">{contractor.first_name} {contractor.last_name}</p>
                  <p className="ff-profile-email">{contractor.email} · {contractor.phone}</p>
                  <p style={{ fontSize: "0.82rem", color: "rgba(190,205,235,0.5)", marginBottom: "1rem" }}>
                    {contractor.years_of_experience} year{contractor.years_of_experience !== 1 ? "s" : ""} experience
                  </p>
                  <div className="ff-section-label">Specialties</div>
                  <div className="ff-tag-list">
                    {contractor.specialties.map(s => <span key={s} className="ff-tag">{s}</span>)}
                  </div>
                  <div className="ff-section-label" style={{ marginTop: "1rem" }}>Service Areas</div>
                  <div className="ff-tag-list">
                    {contractor.service_area.map(z => <span key={z} className="ff-tag">📍 {z}</span>)}
                  </div>
                </div>

                <div className="ff-card">
                  <p className="ff-section-label">Weekly Availability</p>
                  {Object.entries(contractor.availability || {}).map(([day, slots]) => (
                    slots.length > 0 ? (
                      <div key={day} className="ff-avail-day">
                        <div className="ff-avail-day-name">{day}</div>
                        <div className="ff-avail-slots">
                          {(slots as string[]).map(s => <span key={s} className="ff-avail-slot">{s}</span>)}
                        </div>
                      </div>
                    ) : null
                  ))}
                  {Object.values(contractor.availability || {}).every((s: any) => s.length === 0) && (
                    <p style={{ color: "rgba(190,205,235,0.4)", fontSize: "0.85rem" }}>No availability set.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── EARNINGS ── */}
            {tab === "earnings" && (
              <div className="ff-card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: "2rem" }}>
                  <div><p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(190,205,235,0.4)", margin: "0 0 0.25rem" }}>Total Paid</p>
                    <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.8rem", color: "#10b981", margin: 0 }}>${totalPaid.toFixed(2)}</p></div>
                  <div><p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(190,205,235,0.4)", margin: "0 0 0.25rem" }}>Pending</p>
                    <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.8rem", color: "#f59e0b", margin: 0 }}>${totalPending.toFixed(2)}</p></div>
                </div>
                {earnings.length === 0 ? (
                  <div className="ff-empty"><div className="ff-empty-icon">💰</div><div className="ff-empty-title">No earnings yet</div><p style={{ fontSize: "0.85rem", fontWeight: 300 }}>Completed jobs will appear here.</p></div>
                ) : (
                  <table className="ff-earnings-table">
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.map(e => (
                        <tr key={e.id}>
                          <td style={{ color: "#f0f4ff" }}>{(e.jobs as any)?.service_needed ?? "—"}</td>
                          <td style={{ color: "rgba(190,205,235,0.55)" }}>{formatDate(e.created_at)}</td>
                          <td style={{ color: "#f0f4ff", fontWeight: 500 }}>${e.amount.toFixed(2)}</td>
                          <td>
                            <span className={`ff-pay-badge ${e.status === "paid" ? "ff-pay-paid" : e.status === "processing" ? "ff-pay-processing" : "ff-pay-pending"}`}>
                              {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
