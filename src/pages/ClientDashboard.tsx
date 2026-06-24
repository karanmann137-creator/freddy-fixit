import { Ic } from "@/components/Ic";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import DeleteAccount from "@/components/DeleteAccount";
import ProfileBar from "@/components/ProfileBar";
import JobChat from "@/components/JobChat";
import JobTimeline from "@/components/JobTimeline";
import ReportProblem from "@/components/ReportProblem";
import ConfirmDialog, { type ConfirmState } from "@/components/ConfirmDialog";


const VEHICLE_SERVICES = ["Oil Change","Tire Swap / Rotation","Battery / Brakes","Vehicle Maintenance"];

function calcJobScore(r: any): { score: number; max: number; label: string; color: string } {
  let score = 0;
  // Description quality
  const desc = (r.job_description ?? "").trim();
  if (desc.length >= 50) score += 3;
  else if (desc.length >= 20) score += 2;
  else if (desc.length >= 5) score += 1;
  // Photo
  if (r.photo_path) score += 2;
  // Location
  if ((r.location ?? "").trim().length > 3) score += 1;
  // Vehicle details (if vehicle job)
  const isVehicle = VEHICLE_SERVICES.some(s => (r.service_needed ?? "").includes(s));
  if (isVehicle) {
    const vd = r.vehicle_details ?? {};
    if (vd.make) score += 1;
    if (vd.year) score += 1;
    if (vd.problem) score += 1;
  }
  // Schedule urgency
  const sched = (r.preferred_schedule ?? "").toLowerCase();
  if (sched.includes("urgent")) score += 2;
  else if (sched.includes("week")) score += 1;
  const max = isVehicle ? 10 : 8;
  const pct = score / max;
  const label = pct >= 0.75 ? "Strong listing" : pct >= 0.45 ? "Good listing" : "Add more details";
  const color = pct >= 0.75 ? "#86efac" : pct >= 0.45 ? "#fbbf24" : "#f87171";
  return { score, max, label, color };
}

const STATUS_META: Record<string, { icon: string; label: string; color: string }> = {
  pending:     { icon: "clock", label: "Pending Review",     color: "#f59e0b" },
  matched:     { icon: "link", label: "Contractor Matched", color: "#3b82f6" },
  in_progress: { icon: "wrench", label: "Work In Progress",   color: "#ea6b14" },
  completed:   { icon: "check-circle", label: "Completed",          color: "#22c55e" },
  cancelled:   { icon: "x-circle", label: "Cancelled",          color: "#ef4444" },
};

export default function ClientDashboard() {
  const [, setLocation] = useLocation();
  const [profile, setProfile]       = useState<any>(null);
  const [requests, setRequests]     = useState<any[]>([]);
  const [contractor, setContractor] = useState<any>(null);
  const [activeJob, setActiveJob]   = useState<any>(null);
  const [chatOpen, setChatOpen]     = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState|null>(null);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string|null>(null);
  const [editForm, setEditForm]     = useState({ service:"", schedule:"", location:"", description:"" });
  const [busyReq, setBusyReq]       = useState(false);
  const [completionPhotoUrl, setCompletionPhotoUrl] = useState<string|null>(null);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [ratingForm, setRatingForm] = useState<{ price:number; experience:number; result:number; comment:string }>({ price:8, experience:8, result:8, comment:"" });
  const [clientBids, setClientBids] = useState<any[]>([]);
  const [bidNames, setBidNames] = useState<Record<string,string>>({});
  const [busyPick, setBusyPick] = useState<string|null>(null);
  const [busyPay, setBusyPay] = useState(false);
  const [feeRate, setFeeRate] = useState(0.03);

  const askConfirm = (o: Omit<ConfirmState, "resolve">) =>
    new Promise<boolean>(resolve => setConfirmState({ ...o, resolve }));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setLocation("/login");
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // profile + requests have no inter-dependency — fetch them together.
      const [{ data: prof }, { data: reqs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("client_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setProfile(prof);
      setRequests(reqs ?? []);

      // All clients pay the standard 3% service fee (feeRate defaults to 0.03).

      const activeReq = (reqs ?? []).find((r: any) => r.status !== "completed" && r.status !== "cancelled");

      if (activeReq) {
        // assigned contractor + the job (with its messages embedded) are
        // independent of each other — fetch them together, and pull messages
        // in the same round-trip instead of a third sequential query.
        const [{ data: con }, { data: job }] = await Promise.all([
          activeReq.assigned_contractor_id
            ? supabase.rpc("get_contractor_profile", { p_id: activeReq.assigned_contractor_id }).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from("jobs").select("*").eq("request_id", activeReq.id).maybeSingle(),
        ]);
        if (con) setContractor(con);
        setActiveJob(job);
      }

      setLoading(false);
    };
    load();
  }, []);

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

  const approveSchedule = async () => {
    if (!activeJob) return;
    setBusyReq(true);
    const { error } = await supabase.rpc("approve_job_schedule", { p_job_id: activeJob.id });
    setBusyReq(false);
    if (error) { alert("Couldn't approve: " + error.message); return; }
    setActiveJob({ ...activeJob, status: "scheduled", client_approved_at: new Date().toISOString() });
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  function jobTotal(j: any) {
    if (j?.total_charged != null) return Number(j.total_charged);
    const amt = Number(j?.amount ?? 0);
    return r2(amt * (1 + feeRate));
  }
  const feeWaived = feeRate === 0;
  const payForJob = async () => {
    if (!activeJob) return;
    if (!(await askConfirm({
      title: "Pay " + "$" + jobTotal(activeJob).toFixed(2) + "?",
      message: "You'll be taken to a secure checkout. Your payment is held safely and only released to the contractor after you confirm the work is done.",
      confirmLabel: "Continue to checkout",
      danger: false,
    }))) return;
    setBusyPay(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-payment-intent", { body: { job_id: activeJob.id } });
      if (error) throw error;
      if (data?.url) { window.location.href = data.url; return; }
      throw new Error(data?.error || "Could not start checkout");
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Payment couldn't start: " + msg);
      setBusyPay(false);
    }
  };

  const confirmCompletion = async () => {
    if (!activeJob) return;
    const willRelease = activeJob.payment_status === "held";
    if (!(await askConfirm({
      title: willRelease ? "Confirm & release payment?" : "Confirm completion?",
      message: willRelease
        ? "This releases your held payment to the contractor and closes the job. Only do this once you're satisfied the work is done."
        : "This marks the job as done and closes it out. Only do this once you're satisfied the work is done.",
      confirmLabel: willRelease ? "Yes, release payment" : "Yes, confirm",
      danger: false,
    }))) return;
    setBusyReq(true);
    const { error } = await supabase.rpc("confirm_job_completion", { p_job_id: activeJob.id });
    setBusyReq(false);
    if (error) { alert("Couldn't confirm: " + error.message); return; }
    setActiveJob({ ...activeJob, status: "completed", client_confirmed_at: new Date().toISOString() });
    setRequests(prev => prev.map(r => r.id === activeJob.request_id ? { ...r, status: "completed" } : r));
    if (activeJob.payment_status === "held") {
      supabase.functions.invoke("release-payment", { body: { job_id: activeJob.id } })
        .then(() => setActiveJob((j: any) => j ? { ...j, payment_status: "released" } : j))
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (activeJob?.completion_photo_path) {
      supabase.storage.from("completion-photos").createSignedUrl(activeJob.completion_photo_path, 3600)
        .then(({ data }) => setCompletionPhotoUrl(data?.signedUrl ?? null));
    } else { setCompletionPhotoUrl(null); }
  }, [activeJob?.completion_photo_path]);

  useEffect(() => {
    if (activeJob?.status === "completed") {
      supabase.from("reviews").select("id").eq("job_id", activeJob.id).maybeSingle()
        .then(({ data }) => setHasReviewed(!!data));
    } else { setHasReviewed(false); }
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    const ar = requests.find((r: any) => r.status !== "completed" && r.status !== "cancelled") ?? requests[0];
    if (ar && ar.status === "pending") {
      supabase.from("bids").select("*").eq("request_id", ar.id).eq("status", "pending").order("amount", { ascending: true })
        .then(async ({ data }) => {
          setClientBids(data ?? []);
          const ids = Array.from(new Set((data ?? []).map((b: any) => b.contractor_id)));
          if (ids.length) {
            const { data: dir } = await supabase.from("contractor_directory").select("id, first_name, last_name").in("id", ids);
            const m: Record<string,string> = {};
            (dir ?? []).forEach((c: any) => { m[c.id] = ((c.first_name ?? "") + " " + (c.last_name ? c.last_name[0] + "." : "")).trim() || "Contractor"; });
            setBidNames(m);
          }
        });
    } else { setClientBids([]); }
  }, [requests]);

  const pickBid = async (bidId: string) => {
    if (!(await askConfirm({
      title: "Choose this contractor?",
      message: "This assigns your job to this contractor and declines the other bids. They'll be notified and will propose a time and price.",
      confirmLabel: "Yes, choose them",
      danger: false,
    }))) return;
    setBusyPick(bidId);
    const { error } = await supabase.rpc("accept_bid", { p_bid_id: bidId });
    setBusyPick(null);
    if (error) { alert("Couldn't select: " + error.message); return; }
    const ar = requests.find(r => r.status !== "completed" && r.status !== "cancelled") ?? requests[0];
    if (ar) {
      const { data: job } = await supabase.from("jobs").select("*").eq("request_id", ar.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setActiveJob(job);
      setRequests(prev => prev.map(r => r.id === ar.id ? { ...r, status: "matched" } : r));
      setClientBids([]);
    }
  };

  const submitReview = async () => {
    if (!activeJob) return;
    setBusyReq(true);
    const { error } = await supabase.rpc("submit_review", {
      p_job_id: activeJob.id,
      p_price: ratingForm.price,
      p_experience: ratingForm.experience,
      p_result: ratingForm.result,
      p_comment: ratingForm.comment || null,
    });
    setBusyReq(false);
    if (error) { alert("Couldn't submit rating: " + error.message); return; }
    setHasReviewed(true);
  };

  const activeReq = requests.find(r => r.status !== "completed" && r.status !== "cancelled") ?? requests[0];

  const s = {
    wrap: { minHeight:"100vh", background:"#1a2236", backgroundImage:"radial-gradient(ellipse 60% 30% at 80% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize:"auto, 22px 22px", backgroundAttachment:"fixed", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" },
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
        <div style={{ marginBottom:"1rem" }}><Ic name="settings" size={36} color="#ea6b14" /></div>Loading your dashboard…
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
        <ProfileBar role="client" />

        {feeWaived && (
          <div style={{ display:"flex", alignItems:"center", gap:".6rem", padding:".7rem 1rem", marginBottom:"1.25rem", borderRadius:"12px", background:"rgba(34,197,94,.08)", border:"1px solid rgba(34,197,94,.3)" }}>
            <span style={{ fontSize:"1.1rem" }}>🎉</span>
            <div style={{ fontSize:".84rem", color:"#bbf7d0", lineHeight:1.45 }}><strong style={{ color:"#86efac" }}>Returning-client perk:</strong> your 3% service fee is waived on every job from here on out. Thanks for booking with Freddy Fix It.</div>
          </div>
        )}

        <>
            {requests.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="home" size={48} color="#ea6b14" /></div>
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
                    <RequestPhotoQuote requestId={activeReq.id} photoPath={activeReq.photo_path} estimatedQuote={activeReq.estimated_quote} quoteNotes={activeReq.quote_notes} canUpload />
                    <div style={{ display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" }}>
                      <div style={{ display:"inline-block", padding:".4rem .9rem", borderRadius:"99px", fontSize:".78rem", fontWeight:500, color: STATUS_META[activeReq.status]?.color, border:`1px solid ${STATUS_META[activeReq.status]?.color}` }}>
                        <Ic name={STATUS_META[activeReq.status]?.icon as any} size={13} color={STATUS_META[activeReq.status]?.color} style={{ marginRight:4 }} />{STATUS_META[activeReq.status]?.label}
                      </div>
                      {(() => { const { score, max, label, color } = calcJobScore(activeReq); return (
                        <div title={`Listing score: ${score}/${max}`} style={{ display:"inline-flex", alignItems:"center", gap:".4rem", padding:".4rem .9rem", borderRadius:"99px", fontSize:".78rem", fontWeight:500, color, border:`1px solid ${color}44`, background:`${color}11` }}>
                          <span style={{ fontWeight:700 }}>{score}/{max}</span>
                          <span>{label}</span>
                          {label === "Add more details" && <span style={{ fontSize:".72rem", opacity:.7 }}>— add photo or description</span>}
                        </div>
                      ); })()}
                    </div>

                    {activeReq.status === "pending" && clientBids.length > 0 && (
                      <div style={{ marginTop:"1rem", padding:"1rem", borderRadius:"12px", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)" }}>
                        <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".6rem" }}>Choose your contractor ({clientBids.length} bid{clientBids.length === 1 ? "" : "s"})</div>
                        {clientBids.map(b => (
                          <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".5rem", padding:".6rem .7rem", marginBottom:".5rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px", flexWrap:"wrap" as const }}>
                            <div style={{ flex:"1 1 160px" }}>
                              <div style={{ fontSize:".88rem", color:"#f0f4ff" }}>{bidNames[b.contractor_id] ?? "Contractor"}{b.amount != null ? " — $" + b.amount : ""}</div>
                              {b.message && <div style={{ fontSize:".78rem", color:"rgba(190,205,235,.65)", marginTop:".15rem" }}>{b.message}</div>}
                            </div>
                            <button style={{ ...s.primaryBtn, background:"#22c55e", color:"#06210f", padding:".5rem 1rem" }} disabled={busyPick === b.id} onClick={() => pickBid(b.id)}>{busyPick === b.id ? "…" : "Choose"}</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeJob && (activeJob.client_approved_at || activeJob.status === "scheduled" || activeJob.status === "pending_confirmation" || activeJob.status === "completed") && (
                      <div style={{ marginTop:"1rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)" }}>
                        <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.45)", marginBottom:".75rem" }}>Job progress</div>
                        <JobTimeline job={activeJob} />
                      </div>
                    )}

                    {activeJob && activeJob.payment_status === "disputed" && (
                      <div style={{ marginTop:"1rem", padding:"1rem", borderRadius:"12px", background:"rgba(251,191,36,.08)", border:"1px solid rgba(251,191,36,.35)" }}>
                        <div style={{ fontSize:".9rem", fontWeight:600, color:"#fbbf24", marginBottom:".4rem" }}><Ic name="alert-triangle" size={14} style={{ marginRight:5 }} />Problem reported — under review</div>
                        <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.8)", lineHeight:1.55 }}>Your payment is <strong>frozen and protected</strong> while our team reviews your report. Nothing has been released to the contractor. We'll email you as soon as it's resolved.</div>
                      </div>
                    )}

                    {activeJob && activeJob.payment_status !== "disputed" && (
                      <div style={{ marginTop:"1rem", padding:"1rem", borderRadius:"12px", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)" }}>
                        {activeJob.status === "assigned" && activeJob.schedule_proposed_at && !activeJob.client_approved_at && (
                          <>
                            <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".4rem" }}>Your contractor proposed a time</div>
                            <div style={{ fontSize:".85rem", color:"rgba(190,205,235,.8)", marginBottom:".75rem" }}><Ic name="calendar" size={13} style={{ marginRight:4 }} />{activeJob.scheduled_at ? new Date(activeJob.scheduled_at).toLocaleString() : "—"}{activeJob.amount ? " · $" + activeJob.amount : ""}</div>
                            <button style={s.primaryBtn} disabled={busyReq} onClick={approveSchedule}>{busyReq ? "…" : "Approve & schedule"}</button>
                          </>
                        )}
                        {activeJob.status === "assigned" && !activeJob.schedule_proposed_at && (
                          <div style={{ fontSize:".85rem", color:"rgba(190,205,235,.75)" }}><Ic name="check-circle" size={14} style={{ marginRight:4 }} />Matched! Waiting for your contractor to propose a time and price.</div>
                        )}
                        {activeJob.status === "scheduled" && (
                          <>
                            <div style={{ fontSize:".85rem", color:"#86efac", marginBottom: (activeJob.payment_status === "held" || activeJob.payment_status === "released") ? 0 : ".75rem" }}><Ic name="calendar" size={13} style={{ marginRight:4 }} />Scheduled for {activeJob.scheduled_at ? new Date(activeJob.scheduled_at).toLocaleString() : "the agreed time"}{activeJob.amount ? " · $" + activeJob.amount : ""}.</div>
                            {(activeJob.payment_status === "held" || activeJob.payment_status === "released") ? (
                              <div style={{ fontSize:".82rem", color:"#86efac" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />Payment secured — we'll release it to your contractor once you confirm the work is done.</div>
                            ) : activeJob.amount ? (
                              <>
                                <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.75)", marginBottom:".6rem", lineHeight:1.5 }}>Pay now to secure the job. Your money is <strong>held safely</strong> and only released to the contractor after you confirm the work is done. {feeWaived ? <span style={{ color:"#86efac" }}>Service fee waived — thanks for booking with us again. 🎉</span> : "Total includes a 3% service fee."}</div>
                                <button style={s.primaryBtn} disabled={busyPay} onClick={payForJob}>{busyPay ? "Opening checkout…" : "Pay $" + jobTotal(activeJob).toFixed(2) + " (held until you confirm)"}</button>
                              </>
                            ) : null}
                          </>
                        )}
                        {activeJob.status === "pending_confirmation" && (
                          <>
                            <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".4rem" }}>Your contractor marked this complete</div>
                            {completionPhotoUrl && <img src={completionPhotoUrl} alt="Completed work" style={{ width:"100%", maxWidth:"320px", borderRadius:"10px", margin:".5rem 0", display:"block" }} />}
                            {(activeJob.payment_status === "held" || activeJob.payment_status === "released") ? (
                              <>
                                <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.7)", marginBottom:".75rem" }}>Confirm the work is done and we'll release your held payment to the contractor. If you don't, it auto-confirms in a few days.</div>
                                <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                                  <button style={{ ...s.primaryBtn, background:"#22c55e", color:"#06210f" }} disabled={busyReq} onClick={confirmCompletion}>{busyReq ? "…" : "✓ Confirm & release payment"}</button>
                                  <button style={{ ...s.btn, color:"#fbbf24", borderColor:"rgba(251,191,36,.35)", background:"rgba(251,191,36,.08)" }} disabled={busyReq} onClick={() => setReportOpen(true)}><Ic name="alert-triangle" size={13} style={{ marginRight:4 }} />Report a problem</button>
                                </div>
                              </>
                            ) : activeJob.amount ? (
                              <>
                                <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.7)", marginBottom:".6rem", lineHeight:1.5 }}>Pay for the job, then confirm. Your payment is held and only released to the contractor once you confirm. {feeWaived ? <span style={{ color:"#86efac" }}>Service fee waived for returning clients. 🎉</span> : "Total includes a 3% service fee."}</div>
                                <button style={s.primaryBtn} disabled={busyPay} onClick={payForJob}>{busyPay ? "Opening checkout…" : "Pay $" + jobTotal(activeJob).toFixed(2) + " now"}</button>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.7)", marginBottom:".75rem" }}>Please confirm the work is done. If you don't, it auto-confirms in a few days.</div>
                                <button style={{ ...s.primaryBtn, background:"#22c55e", color:"#06210f" }} disabled={busyReq} onClick={confirmCompletion}>{busyReq ? "…" : "✓ Confirm completion"}</button>
                              </>
                            )}
                          </>
                        )}
                        {activeJob.status === "completed" && (
                          hasReviewed ? (
                            <div style={{ fontSize:".85rem", color:"#86efac" }}><Ic name="check-circle" size={14} style={{ marginRight:4 }} />Completed — thanks for rating your contractor!</div>
                          ) : (
                            <div>
                              <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".5rem" }}>Rate your contractor (out of 10)</div>
                              {(["price","experience","result"] as const).map(k => (
                                <div key={k} style={{ marginBottom:".55rem" }}>
                                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:".8rem", color:"rgba(190,205,235,.8)", marginBottom:".2rem" }}>
                                    <span style={{ textTransform:"capitalize" as const }}>{k === "result" ? "End result" : k}</span>
                                    <span style={{ color:"#ea6b14", fontWeight:600 }}>{ratingForm[k]}/10</span>
                                  </div>
                                  <input type="range" min={1} max={10} value={ratingForm[k]} onChange={e => setRatingForm(f => ({ ...f, [k]: Number(e.target.value) }))} style={{ width:"100%", accentColor:"#ea6b14" }} />
                                </div>
                              ))}
                              <textarea value={ratingForm.comment} rows={2} placeholder="Optional comment" onChange={e => setRatingForm(f => ({ ...f, comment: e.target.value }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const, margin:".25rem 0 .6rem" }} />
                              <button style={s.primaryBtn} disabled={busyReq} onClick={submitReview}>{busyReq ? "…" : "Submit rating"}</button>
                            </div>
                          )
                        )}
                      </div>
                    )}

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
                        <button style={s.btn} onClick={() => startEdit(activeReq)}><Ic name="pencil" size={13} style={{ marginRight:4 }} />Edit</button>
                        <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyReq} onClick={() => removeRequest(activeReq)}><Ic name="trash" size={13} style={{ marginRight:4 }} />Delete</button>
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
                        <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.5)" }}>{contractor.specialties?.[0] ?? "Your contractor"}</div>
                      </div>
                      {activeJob && (
                        <button style={{ ...s.btn, marginLeft:"auto", color:"#f0f4ff", borderColor:"rgba(234,107,20,.35)", background:"rgba(234,107,20,.12)", display:"flex", alignItems:"center", gap:".4rem" }} onClick={() => setChatOpen(true)}>
                          <Ic name="message-square" size={14} />
                          {activeJob.status === "completed" ? "View chat" : "Message " + contractor.first_name}
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
                            <Ic name={STATUS_META[r.status]?.icon as any} size={13} color={STATUS_META[r.status]?.color} style={{ marginRight:4 }} />{STATUS_META[r.status]?.label}
                          </div>
                          {r.status !== "cancelled" && (
                            <button style={{ ...s.btn, padding:".3rem .55rem", color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyReq} onClick={() => removeRequest(r)}><Ic name="trash" size={13} /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
        </>

        <DeleteAccount />
      </div>

      {chatOpen && activeJob && profile && (
        <JobChat
          jobId={activeJob.id}
          meId={profile.id}
          title={"Chat with " + (contractor?.first_name ?? "your contractor")}
          readOnly={activeJob.status === "completed"}
          onClose={() => setChatOpen(false)}
        />
      )}
      {reportOpen && activeJob && profile && (
        <ReportProblem
          jobId={activeJob.id}
          userId={profile.id}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => {
            setReportOpen(false);
            setActiveJob((j: any) => j ? { ...j, payment_status: "disputed", disputed_at: new Date().toISOString() } : j);
          }}
        />
      )}
      <ConfirmDialog state={confirmState} onClose={(ok) => { confirmState?.resolve(ok); setConfirmState(null); }} />
    </div>
  );
}
