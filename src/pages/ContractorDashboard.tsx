import { Ic } from "@/components/Ic";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import DeleteAccount from "@/components/DeleteAccount";
import ProfileBar from "@/components/ProfileBar";

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
  const [activeTab, setActiveTab]     = useState<"jobs"|"available"|"profile"|"earnings"|"reviews">("jobs");
  const [proposeForm, setProposeForm] = useState({ when:"", amount:"", notes:"" });
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
  const [busyJob, setBusyJob]         = useState(false);
  const [portfolio, setPortfolio]     = useState<any[]>([]);
  const [pfForm, setPfForm]           = useState<{ title:string; description:string; file:File|null }>({ title:"", description:"", file:null });
  const [googleUrl, setGoogleUrl]     = useState("");
  const [busyPf, setBusyPf]           = useState(false);
  const [bidForm, setBidForm]         = useState<Record<string,{amount:string;message:string}>>({});
  const [busyBid, setBusyBid]         = useState<string|null>(null);
  const [busyStripe, setBusyStripe]   = useState(false);
  const [myReviews, setMyReviews]     = useState<any[]>([]);
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
      setGoogleUrl(con?.google_reviews_url ?? "");
      // Sync live Stripe payout status (no account.updated webhook needed)
      if (con?.stripe_account_id && !con?.stripe_payouts_enabled) {
        supabase.functions.invoke("refresh-connect-status", { body: {} })
          .then(({ data }: any) => {
            if (data && (data.payouts_enabled != null)) {
              setContractor((c: any) => c ? { ...c, stripe_charges_enabled: !!data.charges_enabled, stripe_payouts_enabled: !!data.payouts_enabled } : c);
            }
          })
          .catch(() => {});
      }
      const { data: pf } = await supabase.from("portfolio_items").select("*").eq("contractor_id", user.id).order("created_at", { ascending: false });
      setPortfolio(pf ?? []);
      const { data: jobs } = await supabase.from("jobs")
        .select("*, request:client_requests!jobs_request_id_fkey(service_needed, job_description, preferred_schedule, location, photo_path, estimated_quote, quote_notes, vehicle_details), client:profiles!jobs_client_id_fkey(first_name)")
        .eq("contractor_id", user.id).order("created_at", { ascending: false });
      const enriched = jobs ?? [];
      setMyJobs(enriched);
      if (enriched.length > 0) setActiveJobId(enriched[0].id);
      const { data: open } = await supabase.rpc("list_open_jobs");
      setAvailableJobs(open ?? []);
      const { data: revs } = await supabase
        .from("reviews")
        .select("*, client:profiles!reviews_client_id_fkey(first_name)")
        .eq("contractor_id", user.id)
        .order("created_at", { ascending: false });
      setMyReviews(revs ?? []);
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

  const openJob = (job: any) => {
    if (activeJobId === job.id) { setActiveJobId(null); return; }
    setActiveJobId(job.id);
    setPhotoFile(null);
    setProposeForm({
      when: job.scheduled_at ? new Date(job.scheduled_at).toISOString().slice(0,16) : "",
      amount: job.amount != null ? String(job.amount) : "",
      notes: job.notes ?? "",
    });
  };
  const proposeSchedule = async (job: any) => {
    if (!proposeForm.when) { alert("Pick a date and time first."); return; }
    setBusyJob(true);
    const whenIso = new Date(proposeForm.when).toISOString();
    const { error } = await supabase.rpc("propose_job_schedule", {
      p_job_id: job.id,
      p_scheduled_at: whenIso,
      p_amount: proposeForm.amount ? Number(proposeForm.amount) : null,
      p_notes: proposeForm.notes || null,
    });
    setBusyJob(false);
    if (error) { alert("Couldn't send proposal: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, scheduled_at: whenIso, amount: proposeForm.amount ? Number(proposeForm.amount) : j.amount, schedule_proposed_at: new Date().toISOString(), client_approved_at: null } : j));
  };
  const markComplete = async (job: any) => {
    if (!window.confirm("Mark this job complete? The client will be asked to confirm.")) return;
    setBusyJob(true);
    let photoPath: string | null = null;
    try {
      if (photoFile) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = job.id + "/" + crypto.randomUUID() + "." + ext;
        const { error: upErr } = await supabase.storage.from("completion-photos").upload(path, photoFile);
        if (upErr) throw upErr;
        photoPath = path;
      }
      const { error } = await supabase.rpc("mark_job_complete", { p_job_id: job.id, p_photo_path: photoPath });
      if (error) throw error;
      setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "pending_confirmation", contractor_completed_at: new Date().toISOString(), completion_photo_path: photoPath ?? j.completion_photo_path } : j));
      setPhotoFile(null);
    } catch (e: any) {
      alert("Couldn't mark complete: " + (e.message || e));
    } finally {
      setBusyJob(false);
    }
  };
  const withdrawJob = async (job: any) => {
    if (!window.confirm("Withdraw from this job? It goes back to the open pool and the chat history is removed.")) return;
    setBusyJob(true);
    const { error } = await supabase.rpc("withdraw_job", { p_job_id: job.id });
    setBusyJob(false);
    if (error) { alert("Couldn't withdraw: " + error.message); return; }
    setMyJobs(prev => prev.filter(j => j.id !== job.id));
    setActiveJobId(null);
  };
  const saveGoogleUrl = async () => {
    setBusyPf(true);
    const { error } = await supabase.from("contractors").update({ google_reviews_url: googleUrl || null }).eq("id", profile.id);
    setBusyPf(false);
    if (error) { alert("Couldn't save link: " + error.message); return; }
    setContractor((c: any) => ({ ...c, google_reviews_url: googleUrl || null }));
  };
  const pfUrl = (path: string) => supabase.storage.from("portfolio-photos").getPublicUrl(path).data.publicUrl;
  const addPortfolioItem = async () => {
    if (!pfForm.file) { alert("Choose a photo first."); return; }
    setBusyPf(true);
    try {
      const ext = (pfForm.file.name.split(".").pop() || "jpg").toLowerCase();
      const path = profile.id + "/" + crypto.randomUUID() + "." + ext;
      const { error: upErr } = await supabase.storage.from("portfolio-photos").upload(path, pfForm.file);
      if (upErr) throw upErr;
      const { data: row, error } = await supabase.from("portfolio_items")
        .insert({ contractor_id: profile.id, title: pfForm.title || null, description: pfForm.description || null, photo_path: path })
        .select().single();
      if (error) throw error;
      setPortfolio(prev => [row, ...prev]);
      setPfForm({ title:"", description:"", file:null });
    } catch (e: any) { alert("Couldn't add: " + (e.message || e)); }
    finally { setBusyPf(false); }
  };
  const deletePortfolioItem = async (item: any) => {
    if (!window.confirm("Remove this portfolio item?")) return;
    const { error } = await supabase.from("portfolio_items").delete().eq("id", item.id);
    if (error) { alert("Couldn't remove: " + error.message); return; }
    if (item.photo_path) supabase.storage.from("portfolio-photos").remove([item.photo_path]);
    setPortfolio(prev => prev.filter(p => p.id !== item.id));
  };
  const placeBid = async (r: any) => {
    const f = bidForm[r.id] || { amount:"", message:"" };
    const amt = f.amount !== undefined && f.amount !== "" ? f.amount : (r.my_amount != null ? String(r.my_amount) : "");
    if (!amt) { alert("Enter your bid amount."); return; }
    setBusyBid(r.id);
    const msg = f.message !== undefined ? f.message : (r.my_message ?? "");
    const { error } = await supabase.rpc("place_bid", { p_request_id: r.id, p_amount: Number(amt), p_message: msg || null });
    setBusyBid(null);
    if (error) { alert("Couldn't place bid: " + error.message); return; }
    setAvailableJobs(prev => prev.map(x => x.id === r.id
      ? { ...x, my_amount: Number(amt), my_message: msg || null, bid_count: x.my_amount != null ? x.bid_count : (x.bid_count ?? 0) + 1 }
      : x));
  };

  const toggleSlot = async (day: string, slot: string) => {
    if (!contractor || !profile) return;
    const avail = { ...(contractor.availability ?? {}) };
    const existing = avail[day] ?? [];
    avail[day] = existing.includes(slot) ? existing.filter((s: string) => s !== slot) : [...existing, slot];
    await supabase.from("contractors").update({ availability: avail }).eq("id", profile.id);
    setContractor((c: any) => ({ ...c, availability: avail }));
  };

  async function setupPayouts() {
    setBusyStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-connect-account", { body: {} });
      if (error) throw error;
      if (data?.url) { window.location.href = data.url; return; }
      throw new Error(data?.error || "Could not start payout setup");
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Payout setup failed: " + msg);
      setBusyStripe(false);
    }
  }

  const totalEarned = Number(contractor?.total_earned ?? 0);
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const getSlots = (day: string) => ["Saturday","Sunday"].includes(day) ? ["Morning","Afternoon"] : ["Morning","Afternoon","Evening"];
  const STATUS_COLORS: Record<string,string> = { pending:"#f59e0b", matched:"#3b82f6", in_progress:"#ea6b14", completed:"#22c55e", cancelled:"#ef4444", assigned:"#3b82f6" };

  const s = {
    wrap: { minHeight:"100vh", background:"#1a2236", backgroundImage:"radial-gradient(ellipse 60% 30% at 80% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize:"auto, 22px 22px", backgroundAttachment:"fixed", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" },
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
      <div style={{ height: "3.75rem" }} />
      <div style={s.header}>
        <div style={{ fontSize:".85rem", color:"rgba(190,205,235,.6)" }}>
          {contractor?.status === "pending" ? "Profile under review" : contractor?.status === "active" ? "Active" : "Account inactive"}
        </div>
      </div>

      <div style={s.tabsBar}>
        <div style={s.tabsInner}>
          {(["jobs","available","profile","earnings","reviews"] as const).map(t => (
            <button key={t} style={{ ...s.tab, ...(activeTab===t ? s.activeTab : {}) }} onClick={() => setActiveTab(t)}>
              {{ jobs:"My Jobs", available:"Available Jobs", profile:"My Profile", earnings:"Earnings", reviews:"My Reviews" }[t]}
            </button>
          ))}
        </div>
      </div>

      <div style={s.content}>
        <ProfileBar role="contractor" />

        {activeTab === "jobs" && (
          <div>
            {myJobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="clipboard-list" size={48} color="#ea6b14" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", marginBottom:".5rem" }}>No Jobs Yet</h2>
                <p style={{ color:"rgba(190,205,235,.5)" }}>Once matched with a client, your jobs appear here.</p>
              </div>
            ) : myJobs.map(job => (
              <div key={job.id} style={s.jobCard} onClick={() => openJob(job)}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".75rem" }}>
                  <div>
                    <div style={{ fontSize:"1rem", fontWeight:500, marginBottom:".3rem" }}>{job.request?.service_needed ?? "Job"}</div>
                    <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.6)", marginBottom:".2rem" }}><Ic name="user" size={13} style={{ marginRight:4 }} />{job.client?.first_name ?? "Client"} · <Ic name="message-square" size={13} style={{ marginRight:4, marginLeft:4 }} />Message in chat below</div>
                    <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.5)" }}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{job.request?.location}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:".78rem", fontWeight:500, color: STATUS_COLORS[job.status] }}>● {job.status.replace("_"," ")}</div>
                    {job.amount && <div style={{ fontSize:"1rem", fontWeight:500, color:"#22c55e", marginTop:".25rem" }}>${job.amount}</div>}
                  </div>
                </div>
                {activeJobId === job.id && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop:"1rem", borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:"1rem" }}>
                    <RequestPhotoQuote requestId={job.request_id} photoPath={job.request?.photo_path} estimatedQuote={job.request?.estimated_quote} quoteNotes={job.request?.quote_notes} canQuote />

                    <div style={{ display:"flex", flexDirection:"column", gap:".7rem", marginBottom:"1.25rem" }}>
                      {job.status === "assigned" && (
                        <>
                          {job.schedule_proposed_at && !job.client_approved_at && (
                            <div style={{ fontSize:".8rem", color:"#fbbf24" }}><Ic name="clock" size={13} style={{ marginRight:4 }} />Waiting for the client to approve {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "your proposed time"}. You can update it below.</div>
                          )}
                          <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                            <div style={{ flex:"1 1 190px" }}>
                              <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".25rem" }}>Proposed date &amp; time</div>
                              <input type="datetime-local" value={proposeForm.when} onChange={e => setProposeForm(f => ({ ...f, when: e.target.value }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const }} />
                            </div>
                            <div style={{ flex:"1 1 110px" }}>
                              <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".25rem" }}>Price ($)</div>
                              <input type="number" min="0" value={proposeForm.amount} placeholder="e.g. 250" onChange={e => setProposeForm(f => ({ ...f, amount: e.target.value }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const }} />
                            </div>
                          </div>
                          <textarea value={proposeForm.notes} rows={2} placeholder="Notes for the client (optional)" onChange={e => setProposeForm(f => ({ ...f, notes: e.target.value }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
                          <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                            <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyJob} onClick={() => proposeSchedule(job)}>{busyJob ? "Sending…" : (job.schedule_proposed_at ? "Update proposal" : "Propose time & price")}</button>
                            <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyJob} onClick={() => withdrawJob(job)}>Withdraw</button>
                          </div>
                        </>
                      )}
                      {(job.status === "scheduled" || job.status === "in_progress") && (
                        <>
                          <div style={{ fontSize:".85rem", color:"#86efac" }}><Ic name="calendar" size={13} style={{ marginRight:4 }} />Booked for {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "the agreed time"}{job.amount ? " · $" + job.amount : ""}.</div>
                          <div>
                            <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".25rem" }}>Completion photo (optional)</div>
                            <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} style={{ fontSize:".8rem", color:"rgba(190,205,235,.7)" }} />
                          </div>
                          <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                            <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none", fontWeight:600 }} disabled={busyJob} onClick={() => markComplete(job)}>{busyJob ? "Working…" : "✓ Mark complete"}</button>
                            <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyJob} onClick={() => withdrawJob(job)}>Withdraw</button>
                          </div>
                        </>
                      )}
                      {job.status === "pending_confirmation" && (
                        <div style={{ fontSize:".85rem", color:"#fbbf24" }}><Ic name="clock" size={13} style={{ marginRight:4 }} />You marked this complete — waiting for the client to confirm.</div>
                      )}
                      {job.status === "completed" && (
                        <div style={{ fontSize:".85rem", color:"#86efac" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />Job completed and confirmed.</div>
                      )}
                    </div>

                    <div style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".75rem" }}><Ic name="message-square" size={14} style={{ marginRight:6 }} />Chat with {job.client?.first_name}</div>
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
            <p style={{ fontSize:".82rem", color:"rgba(190,205,235,.45)", marginBottom:"1rem" }}>Open job requests in your area. Message us on WhatsApp to accept a job.</p>
            {availableJobs.length === 0 ? <p style={{ color:"rgba(190,205,235,.45)" }}>No open jobs right now.</p> : availableJobs.map(r => (
              <div key={r.id} style={s.jobCard}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".5rem" }}>
                  <div style={{ fontSize:"1rem", fontWeight:500 }}>{r.service_needed}</div>
                  <div style={{ fontSize:".78rem", color:"#ea6b14" }}><Ic name="timer" size={12} style={{ marginRight:4 }} />{r.preferred_schedule}</div>
                </div>
                <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.55)", marginBottom:".6rem" }}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location}</div>
                <div style={{ fontSize:".85rem", color:"rgba(190,205,235,.65)", marginBottom:"1rem", lineHeight:1.5 }}>{r.job_description}</div>
                <RequestPhotoQuote requestId={r.id} photoPath={r.photo_path} estimatedQuote={r.estimated_quote} quoteNotes={r.quote_notes} />
                <div style={{ margin:".75rem 0", padding:".75rem", borderRadius:"10px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:".5rem" }}>
                    <span style={{ fontSize:".75rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.5)" }}>Bids</span>
                    <span style={{ fontSize:".78rem", fontWeight:600, color: (r.bid_count ?? 0) >= 3 ? "#ef4444" : "#86efac" }}>{r.bid_count ?? 0}/3</span>
                  </div>
                  {r.my_amount != null && <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.75)", marginBottom:".5rem" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />You bid {"$" + r.my_amount}. You can update it below.</div>}
                  {r.my_amount == null && (r.bid_count ?? 0) >= 3 && <div style={{ fontSize:".82rem", color:"#fbbf24" }}>This job already has 3 bids.</div>}
                  {(r.my_amount != null || (r.bid_count ?? 0) < 3) && (
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                      <input type="number" min="0" placeholder="Price $" value={bidForm[r.id]?.amount ?? (r.my_amount != null ? String(r.my_amount) : "")} onChange={e => setBidForm(p => ({ ...p, [r.id]: { amount: e.target.value, message: p[r.id]?.message ?? (r.my_message ?? "") } }))} style={{ width:"100px", padding:".5rem .6rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem" }} />
                      <input placeholder="Short message (optional)" value={bidForm[r.id]?.message ?? (r.my_message ?? "")} onChange={e => setBidForm(p => ({ ...p, [r.id]: { message: e.target.value, amount: p[r.id]?.amount ?? (r.my_amount != null ? String(r.my_amount) : "") } }))} style={{ flex:"1 1 150px", padding:".5rem .6rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem" }} />
                      <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyBid === r.id} onClick={() => placeBid(r)}>{busyBid === r.id ? "…" : (r.my_amount != null ? "Update bid" : "Place bid")}</button>
                    </div>
                  )}
                </div>
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
                  {contractor.specialties.map((sp: string) => <span key={sp} style={s.chip}>{sp}</span>)}
                </div>
              )}
              {(contractor?.service_area?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".5rem" }}>Service Area</div>
                  {contractor.service_area.map((z: string) => <span key={z} style={s.chip}><Ic name="map-pin" size={11} style={{ marginRight:3 }} />{z}</span>)}
                </div>
              )}
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Portfolio &amp; Reviews</div>
              <div style={{ marginBottom:"1.25rem" }}>
                <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".35rem" }}>Google reviews link</div>
                <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                  <input value={googleUrl} placeholder="https://g.page/your-business/review" onChange={e => setGoogleUrl(e.target.value)} style={{ flex:"1 1 220px", padding:".55rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem" }} />
                  <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyPf} onClick={saveGoogleUrl}>Save link</button>
                </div>
              </div>
              <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.4)", marginBottom:".35rem" }}>Past work photos</div>
              {portfolio.length === 0 && <p style={{ fontSize:".82rem", color:"rgba(190,205,235,.45)", marginBottom:".75rem" }}>No portfolio items yet. Add your best past jobs below.</p>}
              {portfolio.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:".75rem", marginBottom:"1rem" }}>
                  {portfolio.map(item => (
                    <div key={item.id} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"10px", overflow:"hidden" }}>
                      {item.photo_path && <img src={pfUrl(item.photo_path)} alt={item.title || "Past job"} style={{ width:"100%", height:"100px", objectFit:"cover" as const, display:"block" }} />}
                      <div style={{ padding:".5rem .6rem" }}>
                        {item.title && <div style={{ fontSize:".8rem", fontWeight:600, color:"#f0f4ff" }}>{item.title}</div>}
                        {item.description && <div style={{ fontSize:".72rem", color:"rgba(190,205,235,.6)", marginTop:".15rem" }}>{item.description}</div>}
                        <button onClick={() => deletePortfolioItem(item)} style={{ marginTop:".4rem", fontSize:".7rem", color:"#ef4444", background:"none", border:"none", cursor:"pointer", padding:0 }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:".5rem", borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:".9rem" }}>
                <input value={pfForm.title} placeholder="Title (e.g. Kitchen sink replacement)" onChange={e => setPfForm(f => ({ ...f, title: e.target.value }))} style={{ padding:".55rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const }} />
                <textarea value={pfForm.description} rows={2} placeholder="Short description (optional)" onChange={e => setPfForm(f => ({ ...f, description: e.target.value }))} style={{ padding:".55rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
                <input type="file" accept="image/*" onChange={e => setPfForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))} style={{ fontSize:".8rem", color:"rgba(190,205,235,.7)" }} />
                <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none", alignSelf:"flex-start" as const }} disabled={busyPf} onClick={addPortfolioItem}>{busyPf ? "Adding…" : "+ Add portfolio item"}</button>
              </div>
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
              {[["$" + totalEarned.toFixed(2), "Total Earned"], [contractor?.total_jobs ?? 0, "Jobs Completed"], [myJobs.filter(j=>j.status==="assigned"||j.status==="in_progress").length, "Active Jobs"], [contractor?.rating ? `⭐ ${contractor.rating}` : "—", "Avg Rating"]].map(([v,l]) => (
                <div key={String(l)} style={s.earnCard}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", letterSpacing:".06em", color:"#ea6b14", marginBottom:".25rem" }}>{v}</div>
                  <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.45)" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ ...s.card, marginBottom:"1.5rem" }}>
              <div style={s.cardTitle}>Payouts</div>
              {contractor?.stripe_payouts_enabled ? (
                <div style={{ display:"flex", alignItems:"center", gap:".6rem", color:"#22c55e", fontSize:".9rem" }}>
                  <Ic name="check" size={16} color="#22c55e" />
                  <span>Connected — you're set up to receive payouts. You keep <strong>93%</strong> of each job; Freddy Fix It's fee is 7%.</span>
                </div>
              ) : (
                <div>
                  <p style={{ color:"rgba(190,205,235,.7)", fontSize:".88rem", marginBottom:".9rem", lineHeight:1.5 }}>
                    {contractor?.stripe_account_id
                      ? "Your payout account needs a few more details before you can be paid. Finish setup with Stripe below."
                      : "Connect a bank account through Stripe to get paid for completed jobs. Funds for each job are released to you after the client confirms the work is done. You keep 93% of every job."}
                  </p>
                  <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyStripe} onClick={setupPayouts}>
                    {busyStripe ? "Opening Stripe…" : (contractor?.stripe_account_id ? "Finish payout setup" : "Set up payouts")}
                  </button>
                </div>
              )}
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

        {activeTab === "reviews" && (
          <div>
            {myReviews.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="star" size={48} color="#ea6b14" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", marginBottom:".5rem" }}>No Reviews Yet</h2>
                <p style={{ color:"rgba(190,205,235,.5)" }}>Reviews from clients appear here after jobs are completed.</p>
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"1rem", marginBottom:"1.5rem" }}>
                  {[
                    ["Price", myReviews.reduce((a,r)=>a+(r.price_score??0),0)/myReviews.length || 0],
                    ["Experience", myReviews.reduce((a,r)=>a+(r.experience_score??0),0)/myReviews.length || 0],
                    ["Results", myReviews.reduce((a,r)=>a+(r.result_score??0),0)/myReviews.length || 0],
                  ].map(([label, avg]) => (
                    <div key={String(label)} style={s.earnCard}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"#ea6b14", marginBottom:".25rem" }}>{(avg as number).toFixed(1)}<span style={{ fontSize:"1rem", color:"rgba(190,205,235,.4)" }}>/10</span></div>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(190,205,235,.45)" }}>{label}</div>
                    </div>
                  ))}
                </div>
                {myReviews.map(r => (
                  <div key={r.id} style={{ ...s.card, marginBottom:"1rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:".75rem" }}>
                      <div style={{ fontWeight:500, color:"#f0f4ff" }}>{r.client?.first_name ?? "Client"}</div>
                      <div style={{ fontSize:".75rem", color:"rgba(190,205,235,.4)" }}>{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display:"flex", gap:".5rem", marginBottom:".75rem", flexWrap:"wrap" as const }}>
                      {[["Price", r.price_score], ["Experience", r.experience_score], ["Results", r.result_score]].map(([l, v]) => v != null && (
                        <span key={String(l)} style={{ ...s.chip, background:"rgba(234,107,20,.08)", fontSize:".76rem" }}>{l}: <strong style={{ color:"#ea6b14" }}>{v}/10</strong></span>
                      ))}
                    </div>
                    {r.comment && <p style={{ fontSize:".88rem", color:"rgba(190,205,235,.75)", lineHeight:1.6, margin:0 }}>{r.comment}</p>}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <DeleteAccount />

      </div>
    </div>
  );
}
