import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, signOut } from "@/lib/supabase";
import type { Job, Message, Contractor } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Send, Plus, LogOut, ChevronRight } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  matched: "#3b82f6",
  in_progress: "#8b5cf6",
  completed: "#10b981",
  cancelled: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  matched: "Contractor Matched",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing: border-box; }
  .ff-wrap { min-height: 100vh; background: #1a2236; font-family: 'DM Sans', sans-serif; color: #f0f4ff; }
  .ff-wrap::before { content:''; position:fixed; inset:0; pointer-events:none;
    background-image: repeating-linear-gradient(0deg,transparent,transparent 60px,rgba(255,255,255,0.012) 60px,rgba(255,255,255,0.012) 61px),
      repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(255,255,255,0.012) 60px,rgba(255,255,255,0.012) 61px); }

  /* Nav */
  .ff-nav { display:flex; align-items:center; justify-content:space-between;
    padding:1rem 2rem; border-bottom:1px solid rgba(255,255,255,0.07);
    background:rgba(26,34,54,0.95); position:sticky; top:0; z-index:100; backdrop-filter:blur(8px); }
  .ff-nav-brand { font-family:'Bebas Neue',sans-serif; font-size:1.4rem; letter-spacing:0.1em; }
  .ff-nav-brand span { color:#ea6b14; }
  .ff-nav-right { display:flex; align-items:center; gap:1rem; }
  .ff-nav-btn { display:flex; align-items:center; gap:0.4rem; padding:0.45rem 0.9rem;
    border-radius:7px; font-size:0.82rem; font-weight:500; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.2s; }
  .ff-nav-btn-primary { background:#ea6b14; color:#fff; border:none; }
  .ff-nav-btn-primary:hover { background:#f07a28; }
  .ff-nav-btn-ghost { background:none; color:rgba(190,205,235,0.6); border:1px solid rgba(255,255,255,0.1); }
  .ff-nav-btn-ghost:hover { color:#f0f4ff; border-color:rgba(255,255,255,0.25); }

  /* Layout */
  .ff-body { max-width:1100px; margin:0 auto; padding:2rem 1.5rem; position:relative; z-index:1; }
  .ff-greeting { margin-bottom:2rem; }
  .ff-greeting h1 { font-family:'Bebas Neue',sans-serif; font-size:2.2rem; letter-spacing:0.06em; margin:0 0 0.25rem; }
  .ff-greeting p { color:rgba(190,205,235,0.55); font-size:0.9rem; font-weight:300; margin:0; }

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
  .ff-card-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1rem; gap:1rem; }
  .ff-card-title { font-size:1rem; font-weight:500; color:#f0f4ff; margin:0 0 0.25rem; }
  .ff-card-sub { font-size:0.8rem; color:rgba(190,205,235,0.5); margin:0; font-weight:300; }
  .ff-status-badge { padding:0.3rem 0.7rem; border-radius:99px; font-size:0.75rem; font-weight:500;
    letter-spacing:0.05em; white-space:nowrap; flex-shrink:0; }
  .ff-card-meta { display:flex; flex-wrap:wrap; gap:1rem; margin-top:0.75rem; }
  .ff-meta-item { font-size:0.82rem; color:rgba(190,205,235,0.55); display:flex; align-items:center; gap:0.35rem; }

  /* Contractor chip */
  .ff-contractor-chip { display:flex; align-items:center; gap:0.75rem; margin-top:1rem;
    padding:0.75rem 1rem; background:rgba(234,107,20,0.08); border:1px solid rgba(234,107,20,0.2);
    border-radius:10px; }
  .ff-contractor-avatar { width:36px; height:36px; border-radius:50%; background:rgba(234,107,20,0.2);
    display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0; }
  .ff-contractor-name { font-size:0.9rem; font-weight:500; color:#f0f4ff; }
  .ff-contractor-meta { font-size:0.78rem; color:rgba(190,205,235,0.5); margin-top:0.1rem; }
  .ff-open-chat { margin-left:auto; background:none; border:1px solid rgba(234,107,20,0.3);
    color:#ea6b14; border-radius:6px; padding:0.35rem 0.75rem; font-size:0.78rem;
    cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; display:flex; align-items:center; gap:0.3rem; }
  .ff-open-chat:hover { background:rgba(234,107,20,0.1); }

  /* Chat panel */
  .ff-chat-wrap { display:flex; flex-direction:column; height:500px; }
  .ff-chat-header { padding:1rem 1.25rem; border-bottom:1px solid rgba(255,255,255,0.07);
    font-size:0.9rem; font-weight:500; display:flex; align-items:center; gap:0.5rem; }
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
    font-family:'DM Sans',sans-serif; font-size:0.9rem; outline:none; transition:border-color 0.2s; }
  .ff-chat-input input:focus { border-color:rgba(234,107,20,0.4); }
  .ff-chat-input input::placeholder { color:rgba(190,205,235,0.3); }
  .ff-send-btn { padding:0.65rem 1rem; background:#ea6b14; color:#fff; border:none;
    border-radius:8px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; }
  .ff-send-btn:hover { background:#f07a28; }
  .ff-send-btn:disabled { opacity:0.5; cursor:not-allowed; }

  /* Empty state */
  .ff-empty { text-align:center; padding:3rem 1rem; color:rgba(190,205,235,0.4); }
  .ff-empty-icon { font-size:2.5rem; margin-bottom:1rem; }
  .ff-empty-title { font-size:1rem; font-weight:500; color:rgba(190,205,235,0.6); margin-bottom:0.5rem; }
  .ff-empty-sub { font-size:0.85rem; font-weight:300; }
  .ff-new-btn { display:inline-flex; align-items:center; gap:0.5rem; margin-top:1rem;
    padding:0.7rem 1.4rem; background:#ea6b14; color:#fff; border:none; border-radius:8px;
    font-family:'DM Sans',sans-serif; font-size:0.9rem; cursor:pointer; transition:all 0.2s; }
  .ff-new-btn:hover { background:#f07a28; box-shadow:0 4px 20px rgba(234,107,20,0.35); }

  /* Job select */
  .ff-job-select { display:flex; flex-direction:column; gap:0.75rem; }
  .ff-job-select-item { padding:1rem 1.25rem; background:rgba(255,255,255,0.04);
    border:1px solid rgba(255,255,255,0.08); border-radius:10px; cursor:pointer;
    transition:all 0.2s; display:flex; align-items:center; justify-content:space-between; }
  .ff-job-select-item:hover { border-color:rgba(234,107,20,0.3); }
  .ff-job-select-item.active { border-color:rgba(234,107,20,0.5); background:rgba(234,107,20,0.06); }

  .ff-loading { display:flex; align-items:center; justify-content:center; padding:3rem; color:rgba(190,205,235,0.5); gap:0.75rem; }
`;

type DashTab = "jobs" | "chat" | "new";

export default function ClientDashboard() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<DashTab>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load client data
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }
      setUserId(user.id);

      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (client) {
        setClientId(client.id);
        setClientName(`${client.first_name} ${client.last_name}`);

        const { data: jobData } = await supabase
          .from("jobs")
          .select("*, contractors(*)")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false });

        setJobs(jobData ?? []);
        if (jobData && jobData.length > 0) setSelectedJob(jobData[0]);
      }
      setLoading(false);
    })();
  }, []);

  // Load + subscribe to messages for selected job
  useEffect(() => {
    if (!selectedJob) return;
    supabase
      .from("messages")
      .select("*")
      .eq("job_id", selectedJob.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));

    const sub = supabase
      .channel(`messages:${selectedJob.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${selectedJob.id}` },
        payload => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [selectedJob?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !selectedJob || !userId) return;
    setSendingMsg(true);
    const { error } = await supabase.from("messages").insert({
      job_id: selectedJob.id,
      sender_id: userId,
      sender_role: "client",
      content: msgInput.trim(),
    });
    if (!error) setMsgInput("");
    setSendingMsg(false);
  };

  const handleLogout = async () => {
    await signOut();
    setLocation("/login");
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="ff-wrap">
      <style>{styles}</style>

      <nav className="ff-nav">
        <div className="ff-nav-brand">FREDDY <span>FIXIT</span></div>
        <div className="ff-nav-right">
          <span style={{ fontSize: "0.82rem", color: "rgba(190,205,235,0.5)" }}>{clientName}</span>
          <button className="ff-nav-btn ff-nav-btn-primary" onClick={() => setTab("new")}>
            <Plus size={14} /> New Request
          </button>
          <button className="ff-nav-btn ff-nav-btn-ghost" onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </nav>

      <div className="ff-body">
        <div className="ff-greeting">
          <h1>Welcome back{clientName ? `, ${clientName.split(" ")[0]}` : ""}!</h1>
          <p>Here's what's happening with your requests.</p>
        </div>

        <div className="ff-tabs">
          {(["jobs", "chat", "new"] as DashTab[]).map(t => (
            <button key={t} className={`ff-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t === "jobs" ? "My Jobs" : t === "chat" ? "Messages" : "New Request"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

            {/* ── JOBS TAB ── */}
            {tab === "jobs" && (
              loading ? (
                <div className="ff-loading"><Loader2 size={20} className="animate-spin" /> Loading your jobs…</div>
              ) : jobs.length === 0 ? (
                <div className="ff-empty">
                  <div className="ff-empty-icon">📋</div>
                  <div className="ff-empty-title">No requests yet</div>
                  <div className="ff-empty-sub">Submit your first job request and we'll find you a pro.</div>
                  <button className="ff-new-btn" onClick={() => setTab("new")}><Plus size={16} /> New Request</button>
                </div>
              ) : (
                jobs.map(job => (
                  <div key={job.id} className="ff-card">
                    <div className="ff-card-head">
                      <div>
                        <p className="ff-card-title">{job.service_needed}</p>
                        <p className="ff-card-sub">{job.location}</p>
                      </div>
                      <span className="ff-status-badge" style={{
                        background: `${STATUS_COLORS[job.status]}22`,
                        color: STATUS_COLORS[job.status],
                        border: `1px solid ${STATUS_COLORS[job.status]}44`,
                      }}>
                        {STATUS_LABELS[job.status]}
                      </span>
                    </div>

                    <p style={{ fontSize: "0.85rem", color: "rgba(190,205,235,0.65)", margin: "0 0 0.5rem", fontWeight: 300 }}>
                      {job.job_description}
                    </p>

                    <div className="ff-card-meta">
                      <span className="ff-meta-item">📅 {job.preferred_schedule}</span>
                      <span className="ff-meta-item">🕐 Submitted {formatDate(job.created_at)}</span>
                      {job.quoted_price && <span className="ff-meta-item">💰 Quote: ${job.quoted_price}</span>}
                    </div>

                    {job.contractors && (
                      <div className="ff-contractor-chip">
                        <div className="ff-contractor-avatar">
                          {job.contractors.photo_url
                            ? <img src={job.contractors.photo_url} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                            : "🔧"}
                        </div>
                        <div>
                          <div className="ff-contractor-name">{job.contractors.first_name} {job.contractors.last_name}</div>
                          <div className="ff-contractor-meta">
                            ⭐ {job.contractors.rating.toFixed(1)} · {job.contractors.specialties?.slice(0, 2).join(", ")}
                          </div>
                        </div>
                        <button className="ff-open-chat" onClick={() => { setSelectedJob(job); setTab("chat"); }}>
                          Chat <ChevronRight size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )
            )}

            {/* ── CHAT TAB ── */}
            {tab === "chat" && (
              jobs.length === 0 ? (
                <div className="ff-empty">
                  <div className="ff-empty-icon">💬</div>
                  <div className="ff-empty-title">No active jobs</div>
                  <div className="ff-empty-sub">Chat becomes available once a job is submitted.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: jobs.length > 1 ? "280px 1fr" : "1fr", gap: "1rem" }}>
                  {jobs.length > 1 && (
                    <div className="ff-card" style={{ padding: "1rem", alignSelf: "start" }}>
                      <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(190,205,235,0.45)", marginBottom: "0.75rem" }}>Select Job</p>
                      <div className="ff-job-select">
                        {jobs.map(j => (
                          <div key={j.id} className={`ff-job-select-item${selectedJob?.id === j.id ? " active" : ""}`} onClick={() => setSelectedJob(j)}>
                            <div>
                              <div style={{ fontSize: "0.88rem", fontWeight: 500 }}>{j.service_needed}</div>
                              <div style={{ fontSize: "0.75rem", color: "rgba(190,205,235,0.45)", marginTop: "0.15rem" }}>{STATUS_LABELS[j.status]}</div>
                            </div>
                            <ChevronRight size={14} style={{ color: "rgba(190,205,235,0.3)" }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="ff-card" style={{ padding: 0, overflow: "hidden" }}>
                    {selectedJob ? (
                      <div className="ff-chat-wrap">
                        <div className="ff-chat-header">
                          💬 {selectedJob.service_needed}
                          {selectedJob.contractors && (
                            <span style={{ color: "rgba(190,205,235,0.5)", fontWeight: 300, fontSize: "0.8rem" }}>
                              · {selectedJob.contractors.first_name}
                            </span>
                          )}
                        </div>
                        <div className="ff-chat-messages">
                          {messages.length === 0 && (
                            <div style={{ textAlign: "center", color: "rgba(190,205,235,0.35)", fontSize: "0.85rem", margin: "auto" }}>
                              No messages yet. Say hi!
                            </div>
                          )}
                          {messages.map(m => (
                            <div key={m.id} className={`ff-msg ${m.sender_id === userId ? "mine" : "theirs"}`}>
                              <div className="ff-msg-bubble">{m.content}</div>
                              <div className="ff-msg-time">{formatTime(m.created_at)}</div>
                            </div>
                          ))}
                          <div ref={bottomRef} />
                        </div>
                        <div className="ff-chat-input">
                          <input
                            value={msgInput}
                            onChange={e => setMsgInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && sendMessage()}
                            placeholder="Type a message…"
                          />
                          <button className="ff-send-btn" onClick={sendMessage} disabled={sendingMsg || !msgInput.trim()}>
                            <Send size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="ff-empty"><div className="ff-empty-icon">💬</div><div className="ff-empty-title">Select a job to chat</div></div>
                    )}
                  </div>
                </div>
              )
            )}

            {/* ── NEW REQUEST TAB ── */}
            {tab === "new" && (
              <NewRequestForm clientId={clientId} onSuccess={(job) => {
                setJobs(prev => [job, ...prev]);
                setSelectedJob(job);
                setTab("jobs");
                toast.success("New request submitted!");
              }} />
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Inline new-request mini-form ──────────────────────────────────────────────

const SERVICES = [
  { icon: "🔧", label: "General Handyman" }, { icon: "🚿", label: "Plumbing Repair" },
  { icon: "⚡", label: "Electrical Work" }, { icon: "🌡️", label: "HVAC Maintenance" },
  { icon: "🪵", label: "Carpentry" }, { icon: "🎨", label: "Painting" },
  { icon: "🏠", label: "Drywall / Flooring" }, { icon: "🚗", label: "Oil Change" },
  { icon: "🛞", label: "Tire Swap / Rotation" }, { icon: "🔋", label: "Battery / Brakes" },
  { icon: "🧰", label: "Vehicle Maintenance" }, { icon: "📦", label: "Other" },
];
const SCHEDULES = [
  { icon: "⚡", label: "Urgent / ASAP" }, { icon: "📅", label: "This Week" },
  { icon: "🗓️", label: "Flexible" }, { icon: "🔁", label: "Recurring" },
];

const newFormStyles = `
  .nr-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.65rem; margin-bottom:1rem; }
  .nr-chip { display:flex; align-items:center; gap:0.5rem; padding:0.7rem 0.85rem;
    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
    border-radius:8px; color:rgba(190,205,235,0.75); font-family:'DM Sans',sans-serif;
    font-size:0.85rem; cursor:pointer; transition:all 0.2s; }
  .nr-chip:hover { border-color:rgba(234,107,20,0.3); }
  .nr-chip.sel { background:rgba(234,107,20,0.12); border-color:rgba(234,107,20,0.5); color:#f0f4ff; }
  .nr-label { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em;
    color:rgba(190,205,235,0.55); margin-bottom:0.5rem; display:block; }
  .nr-input { width:100%; padding:0.7rem 0.9rem; background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#f0f4ff;
    font-family:'DM Sans',sans-serif; font-size:0.9rem; outline:none;
    transition:border-color 0.2s; box-sizing:border-box; }
  .nr-input:focus { border-color:rgba(234,107,20,0.4); }
  .nr-input::placeholder { color:rgba(190,205,235,0.3); }
  .nr-textarea { resize:vertical; min-height:100px; }
  .nr-field { margin-bottom:1.2rem; }
  .nr-submit { width:100%; padding:0.85rem; background:linear-gradient(135deg,#ea6b14,#f09020);
    color:#fff; border:none; border-radius:8px; font-family:'DM Sans',sans-serif;
    font-size:0.95rem; font-weight:500; cursor:pointer; transition:all 0.2s;
    display:flex; align-items:center; justify-content:center; gap:0.5rem; margin-top:0.5rem; }
  .nr-submit:hover { box-shadow:0 4px 24px rgba(234,107,20,0.4); }
  .nr-submit:disabled { opacity:0.5; cursor:not-allowed; }
  .nr-section-title { font-family:'Bebas Neue',sans-serif; font-size:1.2rem; letter-spacing:0.06em;
    color:#ea6b14; margin:0 0 1rem; }
  .nr-error { font-size:0.78rem; color:#f87171; margin-top:0.3rem; }
`;

function NewRequestForm({ clientId, onSuccess }: { clientId: string | null; onSuccess: (job: Job) => void }) {
  const [service, setService] = useState("");
  const [schedule, setSchedule] = useState("");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!service) e.service = "Please select a service";
    if (!schedule) e.schedule = "Please select a schedule";
    if (!location.trim()) e.location = "Location required";
    if (desc.trim().length < 10) e.desc = "Please describe the job (min 10 chars)";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (!clientId) { toast.error("Client record not found. Please complete onboarding first."); return; }

    setSubmitting(true);
    const { data, error } = await supabase.from("jobs").insert({
      client_id: clientId,
      service_needed: service,
      location,
      preferred_schedule: schedule,
      job_description: desc,
      status: "pending",
    }).select("*, contractors(*)").single();

    if (error) { toast.error("Failed to submit. Please try again."); }
    else { onSuccess(data as Job); }
    setSubmitting(false);
  };

  return (
    <div className="ff-card">
      <style>{newFormStyles}</style>
      <p className="nr-section-title">New Service Request</p>

      <div className="nr-field">
        <span className="nr-label">Service Needed</span>
        <div className="nr-grid">
          {SERVICES.map(s => (
            <button key={s.label} className={`nr-chip${service === s.label ? " sel" : ""}`} onClick={() => setService(s.label)}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {errors.service && <p className="nr-error">{errors.service}</p>}
      </div>

      <div className="nr-field">
        <span className="nr-label">When Do You Need It?</span>
        <div className="nr-grid">
          {SCHEDULES.map(s => (
            <button key={s.label} className={`nr-chip${schedule === s.label ? " sel" : ""}`} onClick={() => setSchedule(s.label)}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {errors.schedule && <p className="nr-error">{errors.schedule}</p>}
      </div>

      <div className="nr-field">
        <label className="nr-label">Your Location in Calgary</label>
        <input className="nr-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. 123 Main St NW, Calgary" />
        {errors.location && <p className="nr-error">{errors.location}</p>}
      </div>

      <div className="nr-field">
        <label className="nr-label">Describe the Job</label>
        <textarea className="nr-input nr-textarea" value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Tell us what needs fixing. The more detail, the better." />
        {errors.desc && <p className="nr-error">{errors.desc}</p>}
      </div>

      <button className="nr-submit" onClick={submit} disabled={submitting}>
        {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : "Submit Request →"}
      </button>
    </div>
  );
}
