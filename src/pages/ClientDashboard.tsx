import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";

const STATUS_META: Record<string, { icon: string; label: string; color: string }> = {
  pending:     { icon: "⏳", label: "Pending Review",     color: "#f59e0b" },
  matched:     { icon: "🔗", label: "Contractor Matched", color: "#3b82f6" },
  in_progress: { icon: "🔧", label: "Work In Progress",   color: "#ea6b14" },
  completed:   { icon: "✅", label: "Completed",          color: "#22c55e" },
  cancelled:   { icon: "❌", label: "Cancelled",          color: "#ef4444" },
};

export default function ClientDashboard() {
  const [, setLocation] = useLocation();
  const [profile, setProfile]       = useState<any>(null);
  const [requests, setRequests]     = useState<any[]>([]);
  const [contractor, setContractor] = useState<any>(null);
  const [activeJob, setActiveJob]   = useState<any>(null);
  const [messages, setMessages]     = useState<any[]>([]);
  const [newMsg, setNewMsg]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [activeTab, setActiveTab]   = useState<"overview"|"chat">("overview");
  const [editingId, setEditingId]   = useState<string|null>(null);
  const [editForm, setEditForm]     = useState({ service:"", schedule:"", location:"", description:"" });
  const [busyReq, setBusyReq]       = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setLocation("/login");
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(prof);

      const { data: reqs } = await supabase
        .from("client_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setRequests(reqs ?? []);

      const activeReq = (reqs ?? []).find((r: any) => r.status !== "completed" && r.status !== "cancelled");

      if (activeReq?.assigned_contractor_id) {
        const { data: con } = await supabase.from("profiles").select("*").eq("id", activeReq.assigned_contractor_id).single();
        setContractor(con);
      }

      if (activeReq) {
        const { data: job } = await supabase.from("jobs").select("*").eq("request_id", activeReq.id).maybeSingle();
        setActiveJob(job);
        if (job) {
          const { data: msgs } = await supabase.from("messages").select("*").eq("job_id", job.id).order("created_at", { ascending: true });
          setMessages(msgs ?? []);
        }
      }

      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!activeJob) return;
    const channel = supabase.channel("messages:" + activeJob.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${activeJob.id}` },
        payload => setMessages(prev => [...prev, payload.new as any]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeJob]);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeJob || !profile) return;
    setSendingMsg(true);
    const content = newMsg.trim();
    setNewMsg("");
    await supabase.from("messages").insert({ job_id: activeJob.id, sender_id: profile.id, content });
    setSendingMsg(false);
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); setLocation("/"); };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditForm({ service: r.service_needed ?? "", schedule: r.preferred_schedule ?? "", location: r.location ?? "", description: r.job_description ?? "" });
  };
  const saveEdit = async (id: string) => {
    setBusyReq(true);
    const { error } = await supabase.rpc("update_client_request", {
      p_request_id: id, p_service: editForm.service, p_schedule: editForm.schedule,
      p_location: editForm.location, p_description: editForm.description,
    });
    setBusyReq(false);
    if (error) { alert("Couldn't save changes: " + error.message); return; }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, service_needed: editForm.service, preferred_schedule: editForm.schedule, location: editForm.location, job_description: editForm.description } : r));
    setEditingId(null);
  };
  const removeRequest = async (r: any) => {
    const assigned = !!r.assigned_contractor_id;
    const ok = window.confirm(assigned
      ? "A contractor is attached to this request, so it will be cancelled (kept in your history). Continue?"
      : "Delete this request permanently? This can't be undone.");
    if (!ok) return;
    setBusyReq(true);
    const { data, error } = await supabase.rpc("remove_client_request", { p_request_id: r.id });
    setBusyReq(false);
    if (error) { alert("Couldn't remove request: " + error.message); return; }
    if (data === "deleted") setRequests(prev => prev.filter(x => x.id !== r.id));
    else setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: "cancelled" } : x));
  };

  const activeReq = requests.find(r => r.status !== "completed" && r.status !== "cancelled") ?? requests[0];

  const s = {
    wrap: { minHeight:"100vh", background:"#1a2236", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" },
    header: { background:"rgba(255,255,255,.03)", borderBottom:"1px solid rgba(255,255,255,.07)", padding:".75rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".75rem" },
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" },
    content: { maxWidth:"800px", margin:"0 auto", padding:"1.5rem" },
    card: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"14px", padding:"1.5rem", marginBottom:"1.5rem" },
    cardTitle: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", color:"#ea6b14", marginBottom:"1.25rem" },
    btn: { padding:".5rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"6px", color:"rgba(190,205,235,.7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" },
    primaryBtn: { padding:".75rem 1.5rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer" },
    tabs: { display:"flex", gap:".5rem", marginBottom:"1.5rem", flexWrap:"wrap" as const },
    tab: { padding:".6rem 1.2rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px", color:"rgba(190,205,235,.6)", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem" },
    activeTab: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.4)", color:"#f0f4ff" },
  };

  if (loading) return (
    <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", color:"rgba(190,205,235,.5)" }}>
        <div style={{ fontSize:"2rem", marginBottom:"1rem" }}>⚙️</div>Loading your dashboard…
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ height: "3.75rem" }} />
      <div style={s.header}>
        <div style={{ fontSize:".95rem", color:"rgba(190,205,235,.7)" }}>Welcome back, {profile?.first_name}</div>
        <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const }}>
          <button style={s.primaryBtn} onClick={() => setLocation("/client-onboarding")}>+ New Request</button>
        </div>
      </div>

      <div style={s.content}>
        {activeJob && (
          <div style={s.tabs}>
            <button style={{ ...s.tab, ...(activeTab==="overview" ? s.activeTab : {}) }} onClick={() => setActiveTab("overview")}>Overview</button>
            <button style={{ ...s.tab, ...(activeTab==="chat" ? s.activeTab : {}) }} onClick={() => setActiveTab("chat")}>💬 Chat with Contractor</button>
          </div>
        )}

        {activeTab === "overview" && (
          <>
            {requests.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ fontSize:"3rem", marginBottom:"1rem" }}>🏠</div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", marginBottom:".5rem" }}>No Requests Yet</h2>
                <p style={{ color:"rgba(190,205,235,.5)", marginBottom:"1.5rem" }}>Submit your first job request and we'll get you sorted.</p>
                <button style={s.primaryBtn} onClick={() => setLocation("/client-onboarding")}>Submit a Request →</button>
              </div>
            ) : (
              <>
                {activeReq && (
                  <div style={s.card}>
                    <div style={s.cardTitle}>Current Request</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:".75rem 1.5rem", marginBottom:"1.25rem" }}>
                      {[["Service", activeReq.service_needed], ["Location", activeReq.location], ["Schedule", activeReq.preferred_schedule], ["Submitted", new Date(activeReq.created_at).toLocaleDateString()]].map(([l,v]) => (
                        <div key={l}>
                          <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)" }}>{l}</div>
                          <div style={{ fontSize:".9rem", color:"#f0f4ff", marginTop:".1rem", wordBreak:"break-word" as const }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.06)", borderRadius:"8px", padding:"1rem", marginBottom:"1rem" }}>
                      <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".4rem" }}>Job Description</div>
                      <div style={{ fontSize:".88rem", color:"rgba(190,205,235,.75)", lineHeight:1.6 }}>{activeReq.job_description}</div>
                    </div>
                    <RequestPhotoQuote requestId={activeReq.id} photoPath={activeReq.photo_path} estimatedQuote={activeReq.estimated_quote} quoteNotes={activeReq.quote_notes} />
                    <div style={{ display:"inline-block", padding:".4rem .9rem", borderRadius:"99px", fontSize:".78rem", fontWeight:500, color: STATUS_META[activeReq.status]?.color, border:`1px solid ${STATUS_META[activeReq.status]?.color}` }}>
                      {STATUS_META[activeReq.status]?.icon} {STATUS_META[activeReq.status]?.label}
                    </div>

                    {editingId === activeReq.id ? (
                      <div style={{ marginTop:"1rem", borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:"1rem", display:"flex", flexDirection:"column", gap:".6rem" }}>
                        {([["Service","service"],["Schedule","schedule"],["Location","location"]] as const).map(([label,key]) => (
                          <div key={key}>
                            <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".25rem" }}>{label}</div>
                            <input value={(editForm as any)[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                              style={{ width:"100%", padding:".6rem .8rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".88rem", boxSizing:"border-box" as const }} />
                          </div>
                        ))}
                        <div>
                          <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".25rem" }}>Job Description</div>
                          <textarea value={editForm.description} rows={3} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            style={{ width:"100%", padding:".6rem .8rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".88rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
                        </div>
                        <div style={{ display:"flex", gap:".6rem" }}>
                          <button style={s.primaryBtn} disabled={busyReq} onClick={() => saveEdit(activeReq.id)}>{busyReq ? "Saving…" : "Save changes"}</button>
                          <button style={s.btn} disabled={busyReq} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:"flex", gap:".6rem", marginTop:"1rem" }}>
                        <button style={s.btn} onClick={() => startEdit(activeReq)}>✏️ Edit</button>
                        <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyReq} onClick={() => removeRequest(activeReq)}>🗑 Delete</button>
                      </div>
                    )}
                  </div>
                )}

                {contractor && (
                  <div style={s.card}>
                    <div style={s.cardTitle}>Your Contractor</div>
                    <div style={{ display:"flex", alignItems:"center", gap:"1rem", flexWrap:"wrap" as const }}>
                      <div style={{ width:"48px", height:"48px", borderRadius:"50%", background:"rgba(234,107,20,.2)", border:"2px solid rgba(234,107,20,.4)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", color:"#ea6b14", flexShrink:0 }}>
                        {contractor.first_name?.[0]}{contractor.last_name?.[0]}
                      </div>
                      <div>
                        <div style={{ fontSize:"1rem", fontWeight:500 }}>{contractor.first_name} {contractor.last_name}</div>
                        <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.5)" }}>📞 {contractor.phone}</div>
                      </div>
                      {activeJob && (
                        <button style={{ ...s.btn, marginLeft:"auto", color:"#25d366", borderColor:"rgba(37,211,102,.25)", background:"rgba(37,211,102,.1)" }} onClick={() => setActiveTab("chat")}>
                          💬 Message
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {requests.length > 1 && (
                  <div style={s.card}>
                    <div style={s.cardTitle}>Past Requests</div>
                    {requests.slice(1).map(r => (
                      <div key={r.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:".85rem 0", borderBottom:"1px solid rgba(255,255,255,.06)", gap:"1rem", flexWrap:"wrap" as const }}>
                        <div>
                          <div style={{ fontSize:".9rem" }}>{r.service_needed}</div>
                          <div style={{ fontSize:".75rem", color:"rgba(190,205,235,.4)" }}>{new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:".75rem" }}>
                          <div style={{ fontSize:".78rem", fontWeight:500, color: STATUS_META[r.status]?.color, whiteSpace:"nowrap" as const }}>
                            {STATUS_META[r.status]?.icon} {STATUS_META[r.status]?.label}
                          </div>
                          {r.status !== "cancelled" && (
                            <button style={{ ...s.btn, padding:".3rem .55rem", color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyReq} onClick={() => removeRequest(r)}>🗑</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "chat" && activeJob && (
          <div style={{ ...s.card, display:"flex", flexDirection:"column", height:"500px", padding:0, overflow:"hidden" }}>
            <div style={{ padding:"1rem 1.5rem", borderBottom:"1px solid rgba(255,255,255,.07)", fontSize:".88rem", color:"rgba(190,205,235,.7)" }}>
              💬 Chat with {contractor?.first_name ?? "your contractor"}
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"1.25rem", display:"flex", flexDirection:"column", gap:".75rem" }}>
              {messages.length === 0 && <p style={{ textAlign:"center", color:"rgba(190,205,235,.35)", fontSize:".85rem", margin:"auto" }}>No messages yet. Say hi! 👋</p>}
              {messages.map(m => {
                const mine = m.sender_id === profile?.id;
                return (
                  <div key={m.id} style={{ display:"flex", flexDirection:"column", maxWidth:"72%", alignSelf: mine ? "flex-end" : "flex-start", alignItems: mine ? "flex-end" : "flex-start" }}>
                    <div style={{ padding:".65rem 1rem", borderRadius:"12px", fontSize:".88rem", lineHeight:1.5, background: mine ? "#ea6b14" : "rgba(255,255,255,.08)", color:"#f0f4ff" }}>{m.content}</div>
                    <div style={{ fontSize:".65rem", color:"rgba(190,205,235,.35)", marginTop:".25rem" }}>{new Date(m.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}</div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>
            <div style={{ display:"flex", gap:".75rem", padding:"1rem 1.25rem", borderTop:"1px solid rgba(255,255,255,.07)" }}>
              <input style={{ flex:1, padding:".7rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".9rem", outline:"none", minWidth:0 }}
                placeholder="Type a message…" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); sendMessage(); }}} />
              <button style={{ padding:".7rem 1.25rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontWeight:500, cursor:"pointer", flexShrink:0 }}
                onClick={sendMessage} disabled={sendingMsg || !newMsg.trim()}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
