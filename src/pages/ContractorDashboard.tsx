import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function ContractorDashboard() {
  const [, setLocation] = useLocation();
  const [profile, setProfile]         = useState<any>(null);
  const [contractor, setContractor]   = useState<any>(null);
  const [myJobs, setMyJobs]           = useState<any[]>([]);
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [messages, setMessages]       = useState<any[]>([]);
  const [activeJobId, setActiveJobId] = useState<string|null>(null);
  const [newMsg, setNewMsg]           = useState("");
  const [sendingMsg, setSendingMsg]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<"jobs"|"available"|"profile"|"earnings">("jobs");
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
      const { data: con } = await supabase.from("contractors").select("*").eq("id", user.id).single();
      setContractor(con);
      const { data: jobs } = await supabase.from("jobs").select("*").eq("contractor_id", user.id).order("created_at", { ascending: false });
      const enriched = await Promise.all((jobs ?? []).map(async (job: any) => {
        const [{ data: req }, { data: client }] = await Promise.all([
          supabase.from("client_requests").select("*").eq("id", job.request_id).single(),
          supabase.from("profiles").select("*").eq("id", job.client_id).single(),
        ]);
        return { ...job, request: req, client };
      }));
      setMyJobs(enriched);
      if (enriched.length > 0) setActiveJobId(enriched[0].id);
      const { data: open } = await supabase.from("client_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(20);
      setAvailableJobs(open ?? []);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    supabase.from("messages").select("*").eq("job_id", activeJobId).order("created_at", { ascending: true }).then(({ data }) => setMessages(data ?? []));
    const channel = supabase.channel("con-msgs:" + activeJobId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${activeJobId}` },
        payload => setMessages(prev => [...prev, payload.new as any]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeJobId]);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeJobId || !profile) return;
    setSendingMsg(true);
    const content = newMsg.trim();
    setNewMsg("");
    await supabase.from("messages").insert({ job_id: activeJobId, sender_id: profile.id, content });
    setSendingMsg(false);
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); setLocation("/"); };

  const toggleSlot = async (day: string, slot: string) => {
    if (!contractor || !profile) return;
    const avail = { ...(contractor.availability ?? {}) };
    const existing = avail[day] ?? [];
    avail[day] = existing.includes(slot) ? existing.filter((s: string) => s !== slot) : [...existing, slot];
    await supabase.from("contractors").update({ availability: avail }).eq("id", profile.id);
    setContractor((c: any) => ({ ...c, availability: avail }));
  };

  const totalEarned = myJobs.filter(j => j.status === "completed").reduce((n, j) => n + (j.amount ?? 0), 0);
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const getSlots = (day: string) => ["Saturday","Sunday"].includes(day) ? ["Morning","Afternoon"] : ["Morning","Afternoon","Evening"];
  const STATUS_COLORS: Record<string,string> = { pending:"#f59e0b", matched:"#3b82f6", in_progress:"#ea6b14", completed:"#22c55e", cancelled:"#ef4444", assigned:"#3b82f6" };

  const s = {
    wrap: { minHeight:"100vh", background:"#1a2236", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" },
    header: { background:"rgba(255,255,255,.03)", borderBottom:"1px solid rgba(255,255,255,.07)", padding:".75rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center" },
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" },
    tabsBar: { background:"rgba(255,255,255,.02)", borderBottom:"1px solid rgba(255,255,255,.06)", padding:"0 1.5rem", overflowX:"auto" as const },
    tabsInner: { maxWidth:"900px", margin:"0 auto", display:"flex", gap:".25rem" },
    tab: { padding:".85rem 1.25rem", background:"none", border:"none", borderBottom:"2px solid transparent", color:"rgba(190,205,235,.5)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", whiteSpace:"nowrap" as const },
    activeTab: { color:"#ea6b14", borderBottomColor:"#ea6b14" },
    content: { maxWidth:"900px", margin:"0 auto", padding:"2rem 1.5rem" },
    card: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"14px", padding:"1.75rem", marginBottom:"1.5rem" },
    cardTitle: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", color:"#ea6b14", marginBottom:"1.25rem" },
    jobCard: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"12px", padding:"1.5rem", marginBottom:"1rem", cursor:"pointer" },
    btn: { padding:".5rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"6px", color:"rgba(190,205,235,.7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" },
    earnCard: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"12px", padding:"1.25rem", textAlign:"center" as const },
    chip: { padding:".3rem .75rem", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.25)", borderRadius:"99px", fontSize:".78rem", color:"rgba(190,205,235,.8)", display:"inline-block", margin:".2rem" },
    slot: { padding:".38rem .85rem", borderRadius:"99px", fontSize:".78rem", cursor:"pointer", border:"1px solid rgba(255,255,255,.1)", background:"rgba(255,255,255,.04)", color:"rgba(190,205,235,.7)", fontFamily:"inherit", margin:".2rem" },
    slotSel: { background:"rgba(234,107,20,.15)", borderColor:"rgba(234,107,20,.5)", color:"#f0f4ff" },
  };

  if (loading) return <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>Loading…</div>;

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.header}>
        <div>
          <div style={s.logo}>FREDDY <span style={{ color:"#ea6b14" }}>FIXIT</span></div>
          <div style={{ fontSize:".78rem", color:"rgba(190,205,235,.45)" }}>
            {contractor?.status === "pending" ? "⏳ Profile under review" : contractor?.status === "active" ? "✅ Active" : "Account inactive"}
          </div>
        </div>
        <button style={s.btn} onClick={handleSignOut}>Sign Out</button>
      </div>

      <div style={s.tabsBar}>
        <div style={s.tabsInner}>
          {(["jobs","available","profile","earnings"] as const).map(t => (
            <button key={t} style={{ ...s.tab, ...(activeTab===t ? s.activeTab : {}) }} onClick={() => setActiveTab(t)}>
              {{ jobs:"My Jobs", available:"Available Jobs", profile:"My Profile", earnings:"Earnings" }[t]}
            </button>
          ))}
        </div>
      </div>

      <div style={s.content}>

        {activeTab === "jobs" && (
          <div>
            {myJobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ fontSize:"3rem", marginBottom:"1rem" }}>📋</div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", marginBottom:".5rem" }}>No Jobs Yet</h2>
                <p style={{ color:"rgba(190,205,235,.5)" }}>Once matched with a client, your jobs appear here.</p>
              </div>
            ) : myJobs.map(job => (
              <div key={job.id} style={s.jobCard} onClick={() => setActiveJobId(activeJobId === job.id ? null : job.id)}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".75rem" }}>
                  <div>
                    <div style={{ fontSize:"1rem", fontWeight:500, marginBottom:".3rem" }}>{job.request?.service_needed ?? "Job"}</div>
                    <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.6)", marginBottom:".2rem" }}>👤 {job.client?.first_name} {job.client?.last_name} · 📞 {job.client?.phone}</div>
                    <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.5)" }}>📍 {job.request?.location}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:".78rem", fontWeight:500, color: STATUS_COLORS[job.status] }}>● {job.status.replace("_"," ")}</div>
                    {job.amount && <div style={{ fontSize:"1rem", fontWeight:500, color:"#22c55e", marginTop:".25rem" }}>${job.amount}</div>}
                  </div>
                </div>
                {activeJobId === job.id && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop:"1rem", borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:"1rem" }}>
                    <div style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".75rem" }}>💬 Chat with {job.client?.first_name}</div>
                    <div style={{ maxHeight:"200px", overflowY:"auto", display:"flex", flexDirection:"column", gap:".6rem", marginBottom:".75rem" }}>
                      {messages.length === 0 && <p style={{ textAlign:"center", fontSize:".82rem", color:"rgba(190,205,235,.35)" }}>No messages yet</p>}
                      {messages.map(m => {
                        const mine = m.sender_id === profile?.id;
                        return (
                          <div key={m.id} style={{ display:"flex", flexDirection:"column", maxWidth:"72%", alignSelf: mine ? "flex-end" : "flex-start", alignItems: mine ? "flex-end" : "flex-start" }}>
                            <div style={{ padding:".6rem .9rem", borderRadius:"10px", fontSize:".85rem", lineHeight:1.5, background: mine ? "#ea6b14" : "rgba(255,255,255,.08)", color:"#f0f4ff" }}>{m.content}</div>
                          </div>
                        );
                      })}
                      <div ref={msgEndRef} />
                    </div>
                    <div style={{ display:"flex", gap:".6rem" }}>
                      <input style={{ flex:1, padding:".65rem .9rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".88rem", outline:"none" }}
                        placeholder="Message…" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                        onKeyDown={e => { if(e.key==="Enter"){ e.preventDefault(); sendMessage(); }}} />
                      <button style={{ padding:".65rem 1.1rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", cursor:"pointer" }}
                        onClick={sendMessage} disabled={sendingMsg||!newMsg.trim()}>Send</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "available" && (
          <div>
            <p style={{ fontSize:".82rem", color:"rgba(190,205,235,.45)", marginBottom:"1rem" }}>Open job requests in Calgary. Message us on WhatsApp to accept a job.</p>
            {availableJobs.length === 0 ? <p style={{ color:"rgba(190,205,235,.45)" }}>No open jobs right now.</p> : availableJobs.map(r => (
              <div key={r.id} style={s.jobCard}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".5rem" }}>
                  <div style={{ fontSize:"1rem", fontWeight:500 }}>{r.service_needed}</div>
                  <div style={{ fontSize:".78rem", color:"#ea6b14" }}>⏱ {r.preferred_schedule}</div>
                </div>
                <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.55)", marginBottom:".6rem" }}>📍 {r.location}</div>
                <div style={{ fontSize:".85rem", color:"rgba(190,205,235,.65)", marginBottom:"1rem", lineHeight:1.5 }}>{r.job_description}</div>
                <a href={`https://wa.me/18255618331?text=Hi%2C%20I'd%20like%20to%20accept%20the%20${encodeURIComponent(r.service_needed)}%20job`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:"inline-flex", alignItems:"center", gap:".5rem", padding:".6rem 1.1rem", background:"rgba(37,211,102,.1)", border:"1px solid rgba(37,211,102,.25)", borderRadius:"8px", color:"#25d366", fontSize:".82rem", fontWeight:500, textDecoration:"none" }}>
                  💬 Accept via WhatsApp
                </a>
              </div>
            ))}
          </div>
        )}

        {activeTab === "profile" && (
          <div>
            <div style={s.card}>
              <div style={s.cardTitle}>Your Profile</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".75rem", marginBottom:"1.25rem" }}>
                {[["Name", `${profile?.first_name} ${profile?.last_name}`], ["Email", profile?.email], ["Phone", profile?.phone], ["Experience", `${contractor?.years_of_experience ?? 0} years`], ["Rating", contractor?.rating ? `⭐ ${contractor.rating}` : "No ratings"], ["Status", contractor?.status]].map(([l,v]) => (
                  <div key={l}>
                    <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.4)" }}>{l}</div>
                    <div style={{ fontSize:".9rem", color:"#f0f4ff" }}>{v}</div>
                  </div>
                ))}
              </div>
              {(contractor?.specialties?.length ?? 0) > 0 && (
                <div style={{ marginBottom:"1rem" }}>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".5rem" }}>Specialties</div>
                  {contractor.specialties.map((s: string) => <span key={s} style={s.chip}>{s}</span>)}
                </div>
              )}
              {(contractor?.service_area?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".5rem" }}>Service Area</div>
                  {contractor.service_area.map((z: string) => <span key={z} style={s.chip}>📍 {z}</span>)}
                </div>
              )}
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Availability</div>
              {DAYS.map(day => (
                <div key={day} style={{ marginBottom:"1rem" }}>
                  <div style={{ fontSize:".78rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.45)", marginBottom:".5rem" }}>{day}</div>
                  {getSlots(day).map(slot => {
                    const sel = ((contractor?.availability ?? {})[day] ?? []).includes(slot);
                    return <button key={slot} style={{ ...s.slot, ...(sel ? s.slotSel : {}) }} onClick={() => toggleSlot(day, slot)}>{slot}</button>;
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "earnings" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1rem", marginBottom:"1.5rem" }}>
              {[["$" + totalEarned.toFixed(2), "Total Earned"], [myJobs.filter(j=>j.status==="completed").length, "Jobs Completed"], [myJobs.filter(j=>j.status==="assigned"||j.status==="in_progress").length, "Active Jobs"], [contractor?.rating ? `⭐ ${contractor.rating}` : "—", "Avg Rating"]].map(([v,l]) => (
                <div key={String(l)} style={s.earnCard}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", letterSpacing:".06em", color:"#ea6b14", marginBottom:".25rem" }}>{v}</div>
                  <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.45)" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Job History</div>
              {myJobs.length === 0 ? <p style={{ color:"rgba(190,205,235,.45)" }}>No jobs yet.</p> : myJobs.map(job => (
                <div key={job.id} style={{ display:"flex", justifyContent:"space-between", padding:".85rem 0", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
                  <div>
                    <div style={{ fontSize:".9rem" }}>{job.request?.service_needed ?? "Job"}</div>
                    <div style={{ fontSize:".75rem", color:"rgba(190,205,235,.4)" }}>{new Date(job.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    {job.amount ? <div style={{ fontSize:".95rem", fontWeight:500, color:"#22c55e" }}>${job.amount}</div> : <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.4)" }}>TBD</div>}
                    <div style={{ fontSize:".72rem", textTransform:"capitalize", color: STATUS_COLORS[job.status] }}>{job.status.replace("_"," ")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
