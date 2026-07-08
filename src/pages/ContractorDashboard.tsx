import { Ic } from "@/components/Ic";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import DeleteAccount from "@/components/DeleteAccount";
import ProfileBar from "@/components/ProfileBar";
import ScheduleField from "@/components/ScheduleField";
import JobChat from "@/components/JobChat";
import JobTimeline from "@/components/JobTimeline";
import { AVAIL_DAYS, WEEKDAYS, TIME_OPTIONS, readAvailability } from "@/lib/availability";
import RespondToClaim from "@/components/RespondToClaim";
import ConfirmDialog, { type ConfirmState } from "@/components/ConfirmDialog";
import ProfileCompletionModal from "@/components/ProfileCompletionModal";
import ContractorProfileCompletion from "@/components/ContractorProfileCompletion";
import ProfileCompleteCelebration from "@/components/ProfileCompleteCelebration";
import DashboardSidebar, { type SidebarItem, type SidebarAction } from "@/components/DashboardSidebar";
import NotificationBell from "@/components/NotificationBell";

const CONTRACTOR_NAV: SidebarItem[] = [
  { key: "jobs",      label: "My Jobs",        icon: "briefcase" },
  { key: "available", label: "Available Jobs", icon: "search" },
  { key: "earnings",  label: "Earnings",       icon: "dollar" },
  { key: "reviews",   label: "Reviews",        icon: "star" },
  { key: "profile",   label: "Profile",        icon: "user" },
];

// Which required pieces of a contractor profile are still missing. Shared by the
// "finish setting up" nudge and the profile-complete celebration trigger.
const contractorMissing = (c: any): string[] => {
  const m: string[] = [];
  if (!(c?.service_area?.length)) m.push("service area");
  if (!c?.work_type) m.push("your trade");
  if (!c?.has_liability_insurance && !c?.licensed) m.push("licence or insurance");
  if (!(c?.doc_urls && Object.keys(c.doc_urls).length)) m.push("verification documents");
  return m;
};
import FreddyRewind from "@/components/FreddyRewind";
import MilestonePanel from "@/components/MilestonePanel";
import { useServicePricing, rangeText, money, type ServicePrice } from "@/lib/servicePricing";
import { freqLabel } from "@/lib/recurrence";

const ffInp = { width:"100%", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const };
const ffLbl = { fontSize:".66rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .45)", marginBottom:".2rem" };

function quoteTotal(f: any): number | null {
  const keys = ["labour","parts","callout"];
  const any = keys.some(k => f?.[k] !== "" && f?.[k] != null);
  if (any) return keys.reduce((t,k) => t + (f[k] ? Number(f[k]) : 0), 0);
  return f?.amount ? Number(f.amount) : null;
}

function QuoteBreakdown({ v, on, calloutHint, price }: { v: any; on: (patch: any) => void; calloutHint?: number | null; price?: ServicePrice | null }) {
  const keys: [string,string,string][] = [["labour","Labour",""],["parts","Parts",""],["callout","Call-out", calloutHint != null ? String(calloutHint) : ""]];
  const any = ["labour","parts","callout"].some(k => v?.[k] !== "" && v?.[k] != null);
  const sum = ["labour","parts","callout"].reduce((t,k) => t + (v?.[k] ? Number(v[k]) : 0), 0);
  const hasRef = !!price && (price.base_price != null || (price.typical_low != null && price.typical_high != null));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:".55rem", flexBasis:"100%", width:"100%" }}>
      {hasRef && (
        <div style={{ display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".5rem", padding:".5rem .6rem", background:"rgba(234,107,20,.08)", border:"1px solid rgba(234,107,20,.25)", borderRadius:"8px" }}>
          <span style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .8)" }}>
            {price!.base_price != null && <>Platform base <b style={{ color:"var(--ff-text)" }}>{money(price!.base_price)}</b></>}
            {price!.typical_low != null && price!.typical_high != null && <> · Typical {money(price!.typical_low)}–{money(price!.typical_high)}</>}
            {price!.unit && <span style={{ opacity:.7 }}> ({price!.unit})</span>}
          </span>
          {price!.base_price != null && (
            <button type="button" onClick={() => on({ amount: String(price!.base_price), labour:"", parts:"", callout:"", used_base_price: true })}
              style={{ marginLeft:"auto", padding:".3rem .6rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"6px", fontSize:".74rem", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              Use base price
            </button>
          )}
        </div>
      )}
      {v?.used_base_price && <div style={{ fontSize:".74rem", color:"var(--ff-success)", fontWeight:600 }}><Ic name="check-circle" size={12} style={{ marginRight:4 }} />Using platform base price</div>}
      <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .5)", lineHeight:1.4 }}>Itemise your price (optional) — clients trust and approve detailed estimates faster.</div>
      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
        {keys.map(([key,label,ph]) => (
          <div key={key} style={{ flex:"1 1 80px" }}>
            <div style={ffLbl}>{label}</div>
            <input type="number" min="0" value={v?.[key] ?? ""} placeholder={ph ? ("$" + ph) : "$"} onChange={e => on({ [key]: e.target.value, used_base_price:false })} style={ffInp} />
          </div>
        ))}
      </div>
      {any && <div style={{ fontSize:".82rem", color:"var(--ff-success)", fontWeight:600 }}>Itemised total: ${sum.toFixed(2)}</div>}
      <div>
        <div style={ffLbl}>Price range (optional) — show the client a low–high estimate</div>
        <div style={{ display:"flex", gap:".5rem", alignItems:"center" }}>
          <input type="number" min="0" value={v?.price_low ?? ""} placeholder={price?.typical_low != null ? ("$" + price.typical_low) : "Low $"} onChange={e => on({ price_low: e.target.value })} style={ffInp} />
          <span style={{ color:"rgba(var(--ff-muted), .5)" }}>–</span>
          <input type="number" min="0" value={v?.price_high ?? ""} placeholder={price?.typical_high != null ? ("$" + price.typical_high) : "High $"} onChange={e => on({ price_high: e.target.value })} style={ffInp} />
        </div>
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:".5rem", fontSize:".8rem", color:"rgba(var(--ff-muted), .75)", cursor:"pointer" }}>
        <input type="checkbox" checked={!!v?.subject} onChange={e => on({ subject: e.target.checked })} />
        Final price subject to on-site inspection
      </label>
    </div>
  );
}

export default function ContractorDashboard() {
  const [, setLocation] = useLocation();
  const pricing = useServicePricing();
  const priceFor = (svc?: string | null): ServicePrice | null => pricing[(svc || "").split(",")[0].trim()] ?? null;
  const [profile, setProfile]         = useState<any>(null);
  const [contractor, setContractor]   = useState<any>(null);
  const [myJobs, setMyJobs]           = useState<any[]>([]);
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [activeJobId, setActiveJobId] = useState<string|null>(null);
  const [chatJob, setChatJob]         = useState<any|null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState|null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<"jobs"|"available"|"profile"|"earnings"|"reviews">("jobs");
  const [showProfileCongrats, setShowProfileCongrats] = useState(false);
  const [showCustomAvail, setShowCustomAvail] = useState(false);
  const [proposeForm, setProposeForm] = useState({ when:"", amount:"", notes:"", labour:"", parts:"", callout:"", subject:false, price_low:"", price_high:"", used_base_price:false });
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
  const [busyJobId, setBusyJobId]     = useState<string | null>(null); // per-job busy flag — only the job being acted on shows a spinner/disables
  const [portfolio, setPortfolio]     = useState<any[]>([]);
  const [pfForm, setPfForm]           = useState<{ title:string; description:string; file:File|null }>({ title:"", description:"", file:null });
  const [googleUrl, setGoogleUrl]     = useState("");
  const [busyPf, setBusyPf]           = useState(false);
  const [bidForm, setBidForm]         = useState<Record<string,{amount:string;message:string;labour?:string;parts?:string;callout?:string;assumptions?:string;subject?:boolean;price_low?:string;price_high?:string;used_base_price?:boolean}>>({});
  const [requoteOpen, setRequoteOpen] = useState<Record<string,boolean>>({});
  const [requoteForm, setRequoteForm] = useState<Record<string,{amount:string;reason:string;labour:string;parts:string;callout:string;subject:boolean;price_low?:string;price_high?:string;used_base_price?:boolean}>>({});
  const [pricingForm, setPricingForm] = useState({ hourly:"", callout:"" });
  const [busyPricing, setBusyPricing] = useState(false);
  const [hiding, setHiding]           = useState<string|null>(null);
  const [busyBid, setBusyBid]         = useState<string|null>(null);
  const [busyStripe, setBusyStripe]   = useState(false);
  const [myReviews, setMyReviews]     = useState<any[]>([]);
  const [disputes, setDisputes]       = useState<Record<string, any>>({});
  const [claimPhotos, setClaimPhotos] = useState<Record<string, string>>({});
  const [claimToAnswer, setClaimToAnswer] = useState<any|null>(null);
  const [earn, setEarn]               = useState<any>(null);
  const [goalInput, setGoalInput]     = useState("");
  const [savingGoal, setSavingGoal]   = useState(false);
  const [rewindOpen, setRewindOpen]   = useState(false);
  const [loadError, setLoadError]     = useState(false);
  const [toast, setToast]             = useState<{ kind:"err"|"ok"; text:string }|null>(null);
  const toastTimer = useRef<number | null>(null);
  const notify = (text: string, kind: "err" | "ok" = "err") => {
    setToast({ kind, text });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), kind === "ok" ? 3000 : 6000);
  };

  const askConfirm = (o: Omit<ConfirmState, "resolve">) =>
    new Promise<boolean>(resolve => setConfirmState({ ...o, resolve }));

  // Export the job/payout history as a CSV the contractor can open in Excel
  // (handy at tax time). Built entirely in-browser — no server round-trip.
  const exportPayoutsCsv = () => {
    const esc = (v: any) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const header = ["Service", "Date", "Status", "Estimate", "Your payout"].map(esc).join(",");
    const lines = myJobs.map((j: any) => [
      j.request?.service_needed ?? "Job",
      new Date(j.created_at).toLocaleDateString(),
      j.status.replace("_", " "),
      j.amount != null ? j.amount : "",
      j.amount != null ? netPayout(j).toFixed(2) : "",
    ].map(esc).join(","));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "freddy-fixit-payouts-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setLocation("/login");
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoadError(false);
      try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      // All six reads key only off user.id, so fire them in parallel instead of
      // waiting on each round-trip in sequence.
      const [
        { data: prof },
        { data: con },
        { data: pf },
        { data: jobs },
        { data: open },
        { data: revs },
        { data: disp },
        { data: earnStats },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("contractors").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("portfolio_items").select("*").eq("contractor_id", user.id).order("created_at", { ascending: false }),
        supabase.from("jobs")
          .select("*, request:client_requests!jobs_request_id_fkey(service_needed, job_description, preferred_schedule, location, photo_path, estimated_quote, quote_notes, vehicle_details, recurring, recurring_frequency), client:profiles!jobs_client_id_fkey(first_name)")
          .eq("contractor_id", user.id).order("created_at", { ascending: false }),
        supabase.rpc("list_open_jobs"),
        supabase.from("reviews")
          .select("*, client:profiles!reviews_client_id_fkey(first_name)")
          .eq("contractor_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("disputes")
          .select("*")
          .eq("contractor_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_contractor_earnings_stats"),
      ]);

      setProfile(prof);
      setContractor(con);
      setEarn(earnStats ?? null);
      setGoalInput(earnStats?.weekly_goal ? String(earnStats.weekly_goal) : "");
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
      setPortfolio(pf ?? []);
      const enriched = jobs ?? [];
      setMyJobs(enriched);
      if (enriched.length > 0) setActiveJobId(enriched[0].id);
      setAvailableJobs(open ?? []);
      setMyReviews(revs ?? []);
      const dmap: Record<string, any> = {};
      for (const d of (disp ?? [])) { if (!dmap[d.job_id]) dmap[d.job_id] = d; }
      setDisputes(dmap);
      // Sign the client's claim photos so the contractor can see the evidence.
      const allPaths = (disp ?? []).flatMap((d: any) => d.photo_paths ?? []);
      if (allPaths.length > 0) {
        const signed: Record<string, string> = {};
        for (const p of allPaths) {
          const { data: u } = await supabase.storage.from("problem-photos").createSignedUrl(p, 3600);
          if (u?.signedUrl) signed[p] = u.signedUrl;
        }
        setClaimPhotos(signed);
      }
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (contractor) setPricingForm({
      hourly: contractor.hourly_rate != null ? String(contractor.hourly_rate) : "",
      callout: contractor.min_callout != null ? String(contractor.min_callout) : "",
    });
  }, [contractor?.id]);

  const handleSignOut = async () => { await supabase.auth.signOut(); setLocation("/"); };

  // Format a timestamp as LOCAL "YYYY-MM-DDTHH:mm" for datetime inputs.
  // (toISOString() is UTC — it used to prefill Calgary times 6–7h late.)
  const toLocalInput = (iso: string) => {
    const t = new Date(iso);
    if (isNaN(t.getTime())) return "";
    t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
    return t.toISOString().slice(0, 16);
  };

  const openJob = (job: any) => {
    if (activeJobId === job.id) { setActiveJobId(null); return; }
    setActiveJobId(job.id);
    setPhotoFile(null);
    setProposeForm({
      when: job.scheduled_at ? toLocalInput(job.scheduled_at) : "",
      amount: job.amount != null ? String(job.amount) : "",
      notes: job.notes ?? "",
      labour: job.labour_amount != null ? String(job.labour_amount) : "",
      parts: job.parts_amount != null ? String(job.parts_amount) : "",
      callout: job.callout_fee != null ? String(job.callout_fee) : "",
      subject: !!job.subject_to_inspection,
      price_low: job.price_low != null ? String(job.price_low) : "",
      price_high: job.price_high != null ? String(job.price_high) : "",
      used_base_price: !!job.used_base_price,
    });
  };
  const proposeSchedule = async (job: any) => {
    if (!proposeForm.when) { notify("Pick a date and time first."); return; }
    setBusyJobId(job.id);
    const whenIso = new Date(proposeForm.when).toISOString();
    const ptotal = quoteTotal(proposeForm);
    const { error } = await supabase.rpc("propose_job_schedule", {
      p_job_id: job.id,
      p_scheduled_at: whenIso,
      p_amount: ptotal,
      p_notes: proposeForm.notes || null,
      p_labour: proposeForm.labour ? Number(proposeForm.labour) : null,
      p_parts: proposeForm.parts ? Number(proposeForm.parts) : null,
      p_callout: proposeForm.callout ? Number(proposeForm.callout) : null,
      p_subject_to_inspection: !!proposeForm.subject,
      p_price_low: proposeForm.price_low ? Number(proposeForm.price_low) : null,
      p_price_high: proposeForm.price_high ? Number(proposeForm.price_high) : null,
      p_used_base_price: !!proposeForm.used_base_price,
    });
    setBusyJobId(null);
    if (error) { notify("Couldn't send proposal: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, scheduled_at: whenIso, amount: ptotal != null ? ptotal : j.amount, labour_amount: proposeForm.labour ? Number(proposeForm.labour) : null, parts_amount: proposeForm.parts ? Number(proposeForm.parts) : null, callout_fee: proposeForm.callout ? Number(proposeForm.callout) : null, subject_to_inspection: !!proposeForm.subject, schedule_proposed_at: new Date().toISOString(), client_approved_at: null } : j));
  };
  const onMyWay = async (job: any) => {
    setBusyJobId(job.id);
    const { error } = await supabase.rpc("contractor_on_my_way", { p_job_id: job.id });
    setBusyJobId(null);
    if (error) { notify("Couldn't update: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, on_my_way_at: new Date().toISOString() } : j));
    notify("We let the client know you're on your way.", "ok");
  };
  const acceptReschedule = async (job: any) => {
    setBusyJobId(job.id);
    const { error } = await supabase.rpc("contractor_accept_reschedule", { p_job_id: job.id });
    setBusyJobId(null);
    if (error) { notify("Couldn't accept the new time: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "scheduled", client_approved_at: new Date().toISOString(), reschedule_accepted_at: new Date().toISOString(), client_rescheduled_at: null } : j));
    notify("New time accepted — the client's been notified.", "ok");
  };
  const markComplete = async (job: any) => {
    if (!(await askConfirm({
      title: "Mark job complete?",
      message: "The client will be asked to confirm the work and release your payment. Make sure the job is fully done before marking it complete.",
      confirmLabel: "Yes, mark complete",
      danger: false,
    }))) return;
    setBusyJobId(job.id);
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
      notify("Couldn't mark complete: " + (e.message || e));
    } finally {
      setBusyJobId(null);
    }
  };
  const withdrawJob = async (job: any) => {
    if (!(await askConfirm({
      title: "Withdraw from this job?",
      message: "The job goes back to the open pool and your chat history with this client is permanently removed.",
      confirmLabel: "Yes, withdraw",
      danger: true,
    }))) return;
    setBusyJobId(job.id);
    const { error } = await supabase.rpc("withdraw_job", { p_job_id: job.id });
    setBusyJobId(null);
    if (error) { notify("Couldn't withdraw: " + error.message); return; }
    setMyJobs(prev => prev.filter(j => j.id !== job.id));
    setActiveJobId(null);
  };
  const saveGoogleUrl = async () => {
    setBusyPf(true);
    const { error } = await supabase.from("contractors").update({ google_reviews_url: googleUrl || null }).eq("id", profile.id);
    setBusyPf(false);
    if (error) { notify("Couldn't save link: " + error.message); return; }
    setContractor((c: any) => ({ ...c, google_reviews_url: googleUrl || null }));
  };
  const pfUrl = (path: string) => supabase.storage.from("portfolio-photos").getPublicUrl(path).data.publicUrl;
  const addPortfolioItem = async () => {
    if (!pfForm.file) { notify("Choose a photo first."); return; }
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
    } catch (e: any) { notify("Couldn't add: " + (e.message || e)); }
    finally { setBusyPf(false); }
  };
  const deletePortfolioItem = async (item: any) => {
    if (!window.confirm("Remove this portfolio item?")) return;
    const { error } = await supabase.from("portfolio_items").delete().eq("id", item.id);
    if (error) { notify("Couldn't remove: " + error.message); return; }
    if (item.photo_path) supabase.storage.from("portfolio-photos").remove([item.photo_path]);
    setPortfolio(prev => prev.filter(p => p.id !== item.id));
  };
  const placeBid = async (r: any) => {
    const f = bidForm[r.id] || { amount:"", message:"" };
    let total = quoteTotal(f);
    if (total == null && r.my_amount != null) total = Number(r.my_amount);
    if (total == null) { notify("Enter your bid amount or an itemised breakdown."); return; }
    setBusyBid(r.id);
    const msg = f.message !== undefined ? f.message : (r.my_message ?? "");
    const { error } = await supabase.rpc("place_bid", {
      p_request_id: r.id,
      p_amount: total,
      p_message: msg || null,
      p_labour: f.labour ? Number(f.labour) : null,
      p_parts: f.parts ? Number(f.parts) : null,
      p_callout: f.callout ? Number(f.callout) : null,
      p_assumptions: f.assumptions || null,
      p_subject_to_inspection: !!f.subject,
      p_price_low: f.price_low ? Number(f.price_low) : null,
      p_price_high: f.price_high ? Number(f.price_high) : null,
      p_used_base_price: !!f.used_base_price,
    });
    setBusyBid(null);
    if (error) { notify("Couldn't place bid: " + error.message); return; }
    setAvailableJobs(prev => prev.map(x => x.id === r.id
      ? { ...x, my_amount: total, my_message: msg || null, bid_count: x.my_amount != null ? x.bid_count : (x.bid_count ?? 0) + 1 }
      : x));
  };

  const setBid = (id: string, patch: any) => setBidForm(p => ({ ...p, [id]: { ...{ amount:"", message:"" }, ...(p[id] ?? {}), ...patch } }));

  // Contractor proposes a price change at any live stage, up until payout.
  // On an unpaid job the client just re-approves the schedule; on a held job the
  // change is queued for the client to approve (and pay any top-up) before release.
  const requestRequote = async (job: any) => {
    const f = requoteForm[job.id] || { amount:"", reason:"", labour:"", parts:"", callout:"", subject:false };
    if (!f.reason || !f.reason.trim()) { notify("Add a short reason so the client understands the change."); return; }
    const total = quoteTotal(f);
    if (total == null) { notify("Enter the new price or an itemised breakdown."); return; }
    setBusyJobId(job.id);
    const { data, error } = await supabase.rpc("propose_price_change", {
      p_job_id: job.id,
      p_amount: total,
      p_reason: f.reason,
      p_labour: f.labour ? Number(f.labour) : null,
      p_parts: f.parts ? Number(f.parts) : null,
      p_callout: f.callout ? Number(f.callout) : null,
      p_subject_to_inspection: !!f.subject,
      p_price_low: f.price_low ? Number(f.price_low) : null,
      p_price_high: f.price_high ? Number(f.price_high) : null,
      p_used_base_price: !!f.used_base_price,
    });
    setBusyJobId(null);
    if (error) { notify("Couldn't send price change: " + error.message); return; }
    if (data === "pending_client_approval") {
      // Held job — queued for the client. Show the pending banner; price applies once they approve.
      const pending = {
        amount: total, reason: f.reason,
        labour: f.labour ? Number(f.labour) : null,
        parts: f.parts ? Number(f.parts) : null,
        callout: f.callout ? Number(f.callout) : null,
        subject: !!f.subject,
        price_low: f.price_low ? Number(f.price_low) : null,
        price_high: f.price_high ? Number(f.price_high) : null,
        used_base_price: !!f.used_base_price,
      };
      setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, price_change_pending: pending, price_change_proposed_at: new Date().toISOString() } : j));
    } else {
      // Unpaid job — back to the normal approve-the-schedule flow at the new price.
      setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "assigned", amount: total, client_approved_at: null, schedule_proposed_at: new Date().toISOString() } : j));
    }
    setRequoteOpen(o => ({ ...o, [job.id]: false }));
  };

  // Reusable "adjust the price" block. Shown at every live stage (scheduled,
  // in_progress, pending_confirmation) until the money is released to the pro.
  const renderPriceChange = (job: any) => {
    if (job.payment_status === "released") return null;
    const rf = requoteForm[job.id] || { amount:"", reason:"", labour:"", parts:"", callout:"", subject:false };
    const setRf = (patch: any) => setRequoteForm(o => ({ ...o, [job.id]: { ...rf, ...patch } }));
    const pending = job.price_change_pending;
    return (
      <div style={{ borderTop:"1px solid rgba(var(--ff-fg), .07)", paddingTop:".7rem" }}>
        {pending ? (
          <div style={{ fontSize:".82rem", color:"var(--ff-warn)", lineHeight:1.45 }}>
            <Ic name="clock" size={13} style={{ marginRight:4 }} />
            {"Waiting for the client to approve your new price of $" + pending.amount + (pending.reason ? " — " + pending.reason : "") + ". It applies (and any extra is charged) once they approve."}
          </div>
        ) : !requoteOpen[job.id] ? (
          <button onClick={() => setRequoteOpen(o => ({ ...o, [job.id]: true }))} style={{ background:"none", border:"none", color:"#ea6b14", fontFamily:"inherit", fontSize:".82rem", fontWeight:600, cursor:"pointer", padding:0 }}>
            <Ic name="pencil" size={13} style={{ marginRight:4 }} />Need to adjust the price? Request a change
          </button>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:".6rem" }}>
            <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.45 }}>Send the client a revised estimate. They'll re-approve (and cover any extra) before it takes effect — your chat history stays.</div>
            <input type="number" min="0" value={rf.amount} placeholder="New total price $" onChange={e => setRf({ amount: e.target.value })} style={ffInp} />
            <QuoteBreakdown v={rf} on={setRf} calloutHint={contractor?.min_callout ?? null} price={priceFor(job.request?.service_needed)} />
            <textarea value={rf.reason} rows={2} placeholder="Reason for the change (e.g. found a cracked pipe behind the wall)" onChange={e => setRf({ reason: e.target.value })} style={{ ...ffInp, resize:"vertical" as const }} />
            <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
              <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyJobId === job.id} onClick={() => requestRequote(job)}>{busyJobId === job.id ?"Sending…" : "Send revised estimate"}</button>
              <button style={{ ...s.btn }} onClick={() => setRequoteOpen(o => ({ ...o, [job.id]: false }))}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const hideJob = async (r: any) => {
    if (!(await askConfirm({
      title: "Hide this job?",
      message: "It'll be removed from your Available Jobs list and you won't see this request again.",
      confirmLabel: "Hide it",
      danger: false,
    }))) return;
    setHiding(r.id);
    const { error } = await supabase.from("hidden_jobs").insert({ contractor_id: profile.id, request_id: r.id });
    setHiding(null);
    if (error) { notify("Couldn't hide this job: " + error.message); return; }
    setAvailableJobs(prev => prev.filter(x => x.id !== r.id));
  };

  const savePricing = async () => {
    setBusyPricing(true);
    const { error } = await supabase.from("contractors").update({
      hourly_rate: pricingForm.hourly ? Number(pricingForm.hourly) : null,
      min_callout: pricingForm.callout ? Number(pricingForm.callout) : null,
    }).eq("id", profile.id);
    setBusyPricing(false);
    if (error) { notify("Couldn't save pricing: " + error.message); return; }
    setContractor((c: any) => ({ ...c, hourly_rate: pricingForm.hourly ? Number(pricingForm.hourly) : null, min_callout: pricingForm.callout ? Number(pricingForm.callout) : null }));
  };

  // Availability is stored as { days: string[], start: "HH:MM", end: "HH:MM" }.
  const avail = readAvailability(contractor?.availability);
  const saveAvail = async (next: { days: string[]; start: string; end: string }) => {
    if (!profile) return;
    // Reject an invalid window (end at/before start) before writing anything.
    if (next.start && next.end && next.end <= next.start) {
      notify("Your end time needs to be after your start time.");
      return;
    }
    const prev = contractor?.availability;
    setContractor((c: any) => ({ ...c, availability: next })); // optimistic
    const { error } = await supabase.from("contractors").update({ availability: next }).eq("id", profile.id);
    if (error) {
      setContractor((c: any) => ({ ...c, availability: prev })); // roll back on failure
      notify("Couldn't save your availability — please try again.");
    }
  };
  const setAvailDays  = (days: string[]) => saveAvail({ ...avail, days });
  const toggleDay     = (day: string) => saveAvail({ ...avail, days: avail.days.includes(day) ? avail.days.filter(d => d !== day) : [...avail.days, day] });
  const setAvailStart = (start: string) => saveAvail({ ...avail, start });
  const setAvailEnd   = (end: string) => saveAvail({ ...avail, end });
  const dayIsOn = (day: string) => avail.days.includes(day);

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
      notify("Payout setup failed: " + msg);
      setBusyStripe(false);
    }
  }

  const totalEarned = Number(contractor?.total_earned ?? 0);

  const saveGoal = async () => {
    setSavingGoal(true);
    const g = Number(goalInput) || 0;
    const { error } = await supabase.rpc("set_weekly_goal", { p_goal: g });
    setSavingGoal(false);
    if (error) { notify("Could not save your goal: " + error.message); return; }
    setEarn((e: any) => e ? { ...e, weekly_goal: g || null } : e);
  };

  // What the contractor actually receives = 93% of the quote (platform keeps 7%).
  const netPayout = (job: any) => job?.contractor_payout != null
    ? Number(job.contractor_payout)
    : Math.round(Number(job?.amount ?? 0) * 0.93 * 100) / 100;
  const awaitingJobs = myJobs.filter(j => j.status === "pending_confirmation" || j.status === "scheduled" || j.status === "in_progress");
  const awaitingTotal = awaitingJobs.reduce((t,j) => t + (j.amount ? netPayout(j) : 0), 0);
  const STATUS_COLORS: Record<string,string> = { pending:"#f59e0b", matched:"#3b82f6", in_progress:"#ea6b14", completed:"#22c55e", cancelled:"#ef4444", assigned:"#3b82f6", scheduled:"#8b5cf6", pending_confirmation:"#f59e0b" };

  const s = {
    wrap: { minHeight:"100vh", background:"var(--ff-bg)", backgroundImage:"radial-gradient(ellipse 60% 30% at 80% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), radial-gradient(rgba(var(--ff-fg), 0.025) 1px, transparent 1px)", backgroundSize:"auto, 22px 22px", backgroundAttachment:"fixed", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    header: { background:"rgba(var(--ff-fg), .03)", borderBottom:"1px solid rgba(var(--ff-fg), .07)", padding:".75rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center" },
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" },
    tabsBar: { background:"rgba(var(--ff-fg), .02)", borderBottom:"1px solid rgba(var(--ff-fg), .06)", padding:"0 1.5rem", overflowX:"auto" as const },
    tabsInner: { maxWidth:"900px", margin:"0 auto", display:"flex", gap:".25rem" },
    tab: { padding:".85rem 1.25rem", background:"none", border:"none", borderBottom:"2px solid transparent", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", whiteSpace:"nowrap" as const },
    activeTab: { color:"#ea6b14", borderBottomColor:"#ea6b14" },
    content: { maxWidth:"900px", margin:"0 auto", padding:"2rem 1.5rem" },
    card: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"1.75rem", marginBottom:"1.5rem" },
    cardTitle: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", color:"#ea6b14", marginBottom:"1.25rem" },
    jobCard: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"12px", padding:"1.5rem", marginBottom:"1rem", cursor:"pointer" },
    btn: { padding:".5rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"6px", color:"rgba(var(--ff-muted), .7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" },
    earnCard: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"12px", padding:"1.25rem", textAlign:"center" as const },
    chip: { padding:".3rem .75rem", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.25)", borderRadius:"99px", fontSize:".78rem", color:"rgba(var(--ff-muted), .8)", display:"inline-block", margin:".2rem" },
    slot: { padding:".38rem .85rem", borderRadius:"99px", fontSize:".78rem", cursor:"pointer", border:"1px solid rgba(var(--ff-fg), .1)", background:"rgba(var(--ff-fg), .04)", color:"rgba(var(--ff-muted), .7)", fontFamily:"inherit", margin:".2rem" },
    slotSel: { background:"rgba(234,107,20,.15)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
  };

  if (loading) return (
    <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", color:"rgba(var(--ff-muted), .5)" }}>
        <div style={{ marginBottom:"1rem" }}><Ic name="settings" size={36} color="#ea6b14" /></div>Loading your dashboard…
      </div>
    </div>
  );

  if (loadError) return (
    <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", color:"rgba(var(--ff-muted), .7)", maxWidth:"320px", padding:"1.5rem" }}>
        <div style={{ marginBottom:".75rem", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".04em" }}>Couldn't load your dashboard</div>
        <div style={{ fontSize:".9rem", marginBottom:"1.25rem" }}>Check your connection and try again.</div>
        <button style={{ padding:".75rem 1.5rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer" }} onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      {toast && (
        <div onClick={() => setToast(null)} style={{ position:"fixed", left:"50%", bottom:"1.5rem", transform:"translateX(-50%)", zIndex:9999, maxWidth:"90vw", padding:".8rem 1.1rem", borderRadius:"12px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:".9rem", lineHeight:1.45, color:"#fff", background: toast.kind==="ok" ? "#1c6b39" : "#8a2020", border:"1px solid " + (toast.kind==="ok" ? "rgba(34,197,94,.55)" : "rgba(239,68,68,.55)"), boxShadow:"0 10px 34px rgba(0,0,0,.4)" }}>{toast.text}</div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ height: "3.75rem" }} />
      <div style={{ display:"flex", alignItems:"flex-start" as const }}>
        <DashboardSidebar
          items={CONTRACTOR_NAV}
          active={activeTab}
          onSelect={(k) => setActiveTab(k as any)}
          title="Dashboard"
          bell={profile?.id ? <NotificationBell userId={profile.id} dashboardPath="/contractor-dashboard" /> : undefined}
          actions={[
            { key: "contact",  label: "Contact us", icon: "mail",     onClick: () => { window.location.href = "mailto:hello@freddyfixit.ca"; } },
            { key: "settings", label: "Settings",   icon: "settings", onClick: () => window.dispatchEvent(new Event("ff:open-settings")) },
            { key: "logout",   label: "Log out",    icon: "door",     onClick: handleSignOut, danger: true },
          ] as SidebarAction[]}
        />
        <div style={{ flex:1, minWidth:0 }}>

      <div style={s.header}>
        <div>
          <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", letterSpacing:".02em", margin:0, lineHeight:1.1 }}>
            Welcome{profile?.first_name ? ", " + profile.first_name : ""}
          </h1>
          <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .6)", marginTop:".2rem" }}>
            {contractor?.status === "pending" ? "Profile under review" : contractor?.status === "active" ? "Active" : "Account inactive"}
          </div>
        </div>
      </div>

      {showProfileCongrats && (
        <ProfileCompleteCelebration
          onClose={() => setShowProfileCongrats(false)}
          onBrowse={() => { setShowProfileCongrats(false); setActiveTab("available"); }}
        />
      )}

      <div style={s.content}>
        <ProfileCompletionModal role="contractor" profile={profile} contractor={contractor} onSetupPayouts={setupPayouts} />

        {contractor && !contractor.stripe_payouts_enabled && (
          <div style={{ margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.45)", display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".75rem", justifyContent:"space-between" }}>
            <div style={{ flex:"1 1 260px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:".4rem", fontSize:".85rem", fontWeight:600, color:"#ea6b14", marginBottom:".3rem" }}>
                <Ic name="alert-triangle" size={14} />Finish payout setup to get paid
              </div>
              <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>
                {contractor.stripe_account_id
                  ? "Your bank connection isn't finished yet. Until it is, money for completed jobs can't be sent to you."
                  : "You haven't connected a bank account. Until you do, you won't be paid for completed jobs — clients can still book and pay, but your payout stays on hold."}
              </div>
            </div>
            <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none", whiteSpace:"nowrap" as const }} disabled={busyStripe} onClick={setupPayouts}>
              {busyStripe ? "Opening Stripe…" : (contractor.stripe_account_id ? "Finish setup" : "Set up payouts")}
            </button>
          </div>
        )}

        {contractor && contractorMissing(contractor).length > 0 && (
          <div style={{ margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.45)", display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".75rem", justifyContent:"space-between" }}>
            <div style={{ flex:"1 1 260px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:".4rem", fontSize:".85rem", fontWeight:600, color:"#ea6b14", marginBottom:".3rem" }}>
                <Ic name="alert-triangle" size={14} />Finish setting up your profile
              </div>
              <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>
                Still needed before you can take jobs: {contractorMissing(contractor).join(", ")}.
              </div>
            </div>
            <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none", whiteSpace:"nowrap" as const }} onClick={() => { setActiveTab("profile"); window.scrollTo({ top:0, behavior:"smooth" }); }}>
              Complete profile
            </button>
          </div>
        )}

        {activeTab === "jobs" && (
          <div>
            {myJobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="clipboard-list" size={48} color="#ea6b14" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", marginBottom:".5rem" }}>No Jobs Yet</h2>
                <p style={{ color:"rgba(var(--ff-muted), .5)" }}>Once matched with a client, your jobs appear here.</p>
              </div>
            ) : myJobs.map(job => (
              <div key={job.id} style={s.jobCard} onClick={() => openJob(job)}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".75rem" }}>
                  <div>
                    <div style={{ fontSize:"1rem", fontWeight:500, marginBottom:".3rem" }}>{job.request?.service_needed ?? "Job"}</div>
                    <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".2rem" }}><Ic name="user" size={13} style={{ marginRight:4 }} />{job.client?.first_name || "Your client"}</div>
                    <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .5)" }}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{job.request?.location}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:".78rem", fontWeight:500, color: STATUS_COLORS[job.status] ?? "#94a3b8" }}>● {job.status.replace("_"," ")}</div>
                    {job.amount && <div style={{ fontSize:"1rem", fontWeight:500, color:"#22c55e", marginTop:".25rem" }}>${job.amount}</div>}
                  </div>
                </div>
                {activeJobId === job.id && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop:"1rem", borderTop:"1px solid rgba(var(--ff-fg), .07)", paddingTop:"1rem" }}>
                    <RequestPhotoQuote requestId={job.request_id} photoPath={job.request?.photo_path} estimatedQuote={job.request?.estimated_quote} quoteNotes={job.request?.quote_notes} canQuote />

                    {Number(job.amount) > 2000 && <MilestonePanel role="contractor" job={job} />}

                    {(job.client_approved_at || job.status === "scheduled" || job.status === "pending_confirmation" || job.status === "completed") && (
                      <div style={{ margin:"1rem 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .07)" }}>
                        <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)", marginBottom:".75rem" }}>Job progress</div>
                        <JobTimeline job={job} />
                      </div>
                    )}

                    {disputes[job.id] && (() => {
                      const d = disputes[job.id];
                      const open = d.status === "open";
                      const responded = !!d.contractor_responded_at;
                      const deadline = d.response_deadline ? new Date(d.response_deadline) : null;
                      const overdue = deadline ? deadline.getTime() < Date.now() : false;
                      return (
                        <div style={{ margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(251,191,36,.07)", border:"1px solid rgba(251,191,36,.35)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:".4rem", fontSize:".82rem", fontWeight:600, color:"var(--ff-warn)", marginBottom:".6rem" }}>
                            <Ic name="alert-triangle" size={14} />{open ? "The client filed a claim on this job" : "Claim resolved"}
                          </div>
                          <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .85)", lineHeight:1.5, marginBottom:".5rem" }}>
                            Your payout is paused while our team reviews. <strong>{d.reason}</strong>
                          </div>
                          {d.description && <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.5, marginBottom:".5rem" }}>&ldquo;{d.description}&rdquo;</div>}
                          <div style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.6, marginBottom:".6rem" }}>
                            {d.requested_remedy && <div>Requested outcome: {d.requested_remedy}</div>}
                            {d.service_date && <div>Date of service: {d.service_date}</div>}
                          </div>
                          {(d.photo_paths ?? []).length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:".4rem", marginBottom:".7rem" }}>
                              {(d.photo_paths ?? []).map((p: string) => claimPhotos[p] ? (
                                <a key={p} href={claimPhotos[p]} target="_blank" rel="noopener noreferrer">
                                  <img src={claimPhotos[p]} alt="Claim photo" style={{ width:"68px", height:"68px", objectFit:"cover" as const, borderRadius:"8px", border:"1px solid rgba(var(--ff-fg), .12)" }} />
                                </a>
                              ) : null)}
                            </div>
                          )}
                          {open && !responded && (
                            <>
                              <div style={{ fontSize:".78rem", color: overdue ? "var(--ff-danger)" : "var(--ff-warn)", marginBottom:".6rem" }}>
                                <Ic name="clock" size={12} style={{ marginRight:4 }} />
                                {overdue ? "Your response window has passed — you can still respond until our team decides." : `Please respond by ${deadline ? deadline.toLocaleDateString() : "the deadline"}.`}
                              </div>
                              <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} onClick={() => setClaimToAnswer(d)}>Respond to claim</button>
                            </>
                          )}
                          {responded && (
                            <div style={{ fontSize:".8rem", color:"var(--ff-success)", lineHeight:1.5 }}>
                              <Ic name="check-circle" size={13} style={{ marginRight:4 }} />Your response was submitted. Our team is reviewing both sides.
                              <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .75)", marginTop:".4rem" }}>&ldquo;{d.contractor_response}&rdquo;</div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{ display:"flex", flexDirection:"column", gap:".7rem", marginBottom:"1.25rem" }}>
                      {job.request?.recurring && (
                        <div style={{ display:"flex", gap:".55rem", alignItems:"flex-start", padding:".7rem .8rem", borderRadius:"10px", background:"rgba(234,107,20,.10)", border:"1px solid rgba(234,107,20,.28)", marginBottom:".3rem" }}>
                          <Ic name="refresh" size={16} color="#ea6b14" style={{ marginTop:1, flexShrink:0 }} />
                          <div style={{ fontSize:".8rem", color:"var(--ff-text)", lineHeight:1.5 }}>
                            <strong>Recurring job{job.request?.recurring_frequency ? " — " + freqLabel(job.request.recurring_frequency) : ""}.</strong> This client wants a regular pro. Taking it on means committing to show up at the agreed times each visit — reliable recurring work, but please only accept if you can keep the schedule.
                          </div>
                        </div>
                      )}
                      {job.client_rescheduled_at && !job.reschedule_accepted_at && (
                        <div style={{ padding:".7rem .8rem", borderRadius:"10px", background:"rgba(59,130,246,.10)", border:"1px solid rgba(59,130,246,.30)", marginBottom:".3rem" }}>
                          <div style={{ fontSize:".8rem", color:"var(--ff-text)", lineHeight:1.5, marginBottom:".55rem" }}>
                            <Ic name="calendar" size={14} color="#3b82f6" style={{ marginRight:5 }} />
                            <strong>The client changed the time</strong> to {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "a new time"}. Accept it, or propose a different time below if you're not available.
                          </div>
                          <button style={{ ...s.btn, background:"#3b82f6", color:"#fff", border:"none" }} disabled={busyJobId === job.id} onClick={() => acceptReschedule(job)}>{busyJobId === job.id ?"…" : "Accept new time"}</button>
                        </div>
                      )}
                      {job.status === "assigned" && (
                        <>
                          {job.schedule_proposed_at && !job.client_approved_at && (
                            <div style={{ fontSize:".8rem", color:"var(--ff-warn)" }}><Ic name="clock" size={13} style={{ marginRight:4 }} />Waiting for the client to approve {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "your proposed time"}. You can update it below.</div>
                          )}
                          <ScheduleField value={proposeForm.when} onChange={(v) => setProposeForm(f => ({ ...f, when: v }))} />
                          <div>
                            <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".25rem" }}>Price ($)</div>
                            <input type="number" min="0" value={proposeForm.amount} placeholder="e.g. 250" onChange={e => setProposeForm(f => ({ ...f, amount: e.target.value, used_base_price:false }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const }} />
                          </div>
                          <textarea value={proposeForm.notes} rows={2} placeholder="Notes for the client (optional)" onChange={e => setProposeForm(f => ({ ...f, notes: e.target.value }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
                          <QuoteBreakdown v={proposeForm} on={pp => setProposeForm(f => ({ ...f, ...pp }))} calloutHint={contractor?.min_callout ?? null} price={priceFor(job.request?.service_needed)} />
                          <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                            <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyJobId === job.id} onClick={() => proposeSchedule(job)}>{busyJobId === job.id ?"Sending…" : (job.schedule_proposed_at ? "Update proposal" : "Propose time & price")}</button>
                            <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyJobId === job.id} onClick={() => withdrawJob(job)}>Withdraw</button>
                          </div>
                        </>
                      )}
                      {(job.status === "scheduled" || job.status === "in_progress") && (
                        <>
                          <div style={{ fontSize:".85rem", color:"var(--ff-success)" }}><Ic name="calendar" size={13} style={{ marginRight:4 }} />Booked for {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "the agreed time"}{job.amount ? " · $" + job.amount : ""}.</div>
                          {job.on_my_way_at ? (
                            <div style={{ fontSize:".82rem", color:"var(--ff-success)" }}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />You let the client know you're on the way.</div>
                          ) : (
                            <button style={{ ...s.btn, color:"var(--ff-text)", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.12)", alignSelf:"flex-start" }} disabled={busyJobId === job.id} onClick={() => onMyWay(job)}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{busyJobId === job.id ?"…" : "I'm on my way"}</button>
                          )}
                          {!job.is_milestone && (
                          <div>
                            <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".25rem" }}>Completion photo (optional)</div>
                            <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)" }} />
                          </div>
                          )}
                          <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                            {!job.is_milestone && <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none", fontWeight:600 }} disabled={busyJobId === job.id} onClick={() => markComplete(job)}>{busyJobId === job.id ?"Working…" : "✓ Mark complete"}</button>}
                            <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyJobId === job.id} onClick={() => withdrawJob(job)}>Withdraw</button>
                          </div>
                          {renderPriceChange(job)}
                        </>
                      )}
                      {job.status === "pending_confirmation" && (
                        <>
                          <div style={{ fontSize:".85rem", color:"var(--ff-warn)" }}><Ic name="clock" size={13} style={{ marginRight:4 }} />You marked this complete — waiting for the client to confirm.</div>
                          {renderPriceChange(job)}
                        </>
                      )}
                      {job.status === "completed" && (
                        <div style={{ fontSize:".85rem", color:"var(--ff-success)" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />Job completed and confirmed.</div>
                      )}
                    </div>

                    <button
                      onClick={() => setChatJob(job)}
                      style={{ display:"flex", alignItems:"center", gap:".5rem", width:"100%", justifyContent:"center", padding:".7rem 1rem", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.3)", borderRadius:"10px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".88rem", fontWeight:500, cursor:"pointer" }}>
                      <Ic name="message-square" size={15} />
                      {job.status === "completed"
                        ? `View chat with ${job.client?.first_name || "your client"}`
                        : `Message ${job.client?.first_name || "your client"}`}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "available" && (
          <div>
            <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .45)", marginBottom:"1rem" }}>Open jobs that match your trades — lowest-competition first.</p>
            {availableJobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="clipboard-list" size={48} color="#ea6b14" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", marginBottom:".5rem" }}>No Open Jobs Right Now</h2>
                <p style={{ color:"rgba(var(--ff-muted), .5)" }}>New jobs matching your specialties will show up here. Add more specialties in your profile to see more work.</p>
                <button onClick={() => setActiveTab("profile")} style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none", marginTop:"1.25rem" }}>Update your specialties</button>
              </div>
            ) : availableJobs.map(r => (
              <div key={r.id} style={s.jobCard}>
                {r.is_preferred && (
                  <div style={{ display:"inline-flex", alignItems:"center", gap:".35rem", padding:".25rem .6rem", borderRadius:"99px", background:"rgba(234,107,20,.16)", color:"#ea6b14", fontSize:".72rem", fontWeight:700, marginBottom:".6rem" }}>
                    <Ic name="star" size={12} />This client requested you — reserved for 48h
                  </div>
                )}
                {r.is_recurring && (
                  <div style={{ display:"flex", gap:".5rem", alignItems:"flex-start", padding:".6rem .7rem", borderRadius:"10px", background:"rgba(234,107,20,.10)", border:"1px solid rgba(234,107,20,.28)", marginBottom:".6rem" }}>
                    <Ic name="refresh" size={15} color="#ea6b14" style={{ marginTop:1, flexShrink:0 }} />
                    <div style={{ fontSize:".78rem", color:"var(--ff-text)", lineHeight:1.5 }}>
                      <strong>Recurring{r.recurring_frequency ? " · " + freqLabel(r.recurring_frequency) : ""}.</strong> Winning this makes you the client's go-to pro — you'll be expected to return at the agreed times each visit.
                    </div>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".5rem" }}>
                  <div>
                    <div style={{ fontSize:"1rem", fontWeight:500 }}>{r.service_needed}</div>
                    {rangeText(priceFor(r.service_needed)) && <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .5)", marginTop:"2px" }}>Typical {rangeText(priceFor(r.service_needed))}</div>}
                  </div>
                  <div style={{ fontSize:".78rem", color:"#ea6b14" }}><Ic name="timer" size={12} style={{ marginRight:4 }} />{r.preferred_schedule}</div>
                </div>
                <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginBottom:".6rem" }}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location}</div>
                <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .65)", marginBottom:"1rem", lineHeight:1.5 }}>{r.job_description}</div>
                <RequestPhotoQuote requestId={r.id} photoPath={r.photo_path} estimatedQuote={r.estimated_quote} quoteNotes={r.quote_notes} />
                <div style={{ margin:".75rem 0", padding:".75rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .08)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:".5rem" }}>
                    <span style={{ fontSize:".75rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .5)" }}>Bids</span>
                    <span style={{ fontSize:".78rem", fontWeight:600, color: (r.bid_count ?? 0) >= 3 ? "#ef4444" : "var(--ff-success)" }}>{r.bid_count ?? 0}/3</span>
                  </div>
                  {r.my_amount != null && <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .75)", marginBottom:".5rem" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />You bid {"$" + r.my_amount}. You can update it below.</div>}
                  {r.my_amount == null && (r.bid_count ?? 0) >= 3 && <div style={{ fontSize:".82rem", color:"var(--ff-warn)" }}>This job already has 3 bids.</div>}
                  {(r.my_amount != null || (r.bid_count ?? 0) < 3) && (
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                      <input type="number" min="0" placeholder="Price $" value={bidForm[r.id]?.amount ?? (r.my_amount != null ? String(r.my_amount) : "")} onChange={e => setBid(r.id, { amount: e.target.value, message: bidForm[r.id]?.message ?? (r.my_message ?? ""), used_base_price:false })} style={{ width:"100px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }} />
                      <input placeholder="Short message (optional)" value={bidForm[r.id]?.message ?? (r.my_message ?? "")} onChange={e => setBid(r.id, { message: e.target.value, amount: bidForm[r.id]?.amount ?? (r.my_amount != null ? String(r.my_amount) : "") })} style={{ flex:"1 1 150px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }} />
                      <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyBid === r.id} onClick={() => placeBid(r)}>{busyBid === r.id ? "…" : (r.my_amount != null ? "Update bid" : "Place bid")}</button>
                      <QuoteBreakdown v={bidForm[r.id] ?? {}} on={patch => setBid(r.id, patch)} calloutHint={contractor?.min_callout ?? null} price={priceFor(r.service_needed)} />
                      <input placeholder="Assumptions (optional, e.g. price assumes parts are accessible)" value={bidForm[r.id]?.assumptions ?? ""} onChange={e => setBid(r.id, { assumptions: e.target.value })} style={{ ...ffInp, flexBasis:"100%" }} />
                    </div>
                  )}
                </div>
                <button onClick={() => hideJob(r)} disabled={hiding === r.id} style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".78rem", cursor:"pointer", padding:0, marginTop:".25rem" }}>
                  {hiding === r.id ? "Hiding…" : "Not a fit — hide this job"}
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === "profile" && (
          <div>
            <ProfileBar role="contractor" />
            {(() => {
              const missing = contractorMissing(contractor);
              if (missing.length === 0) return null;
              return (
                <div style={{ ...s.card, border:"1px solid rgba(234,107,20,.35)", background:"rgba(234,107,20,.06)" }}>
                  <div style={{ ...s.cardTitle, display:"flex", alignItems:"center", gap:".5rem" }}>
                    <Ic name="bell" size={18} color="#ea6b14" /> Finish setting up your profile
                  </div>
                  <p style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.55, marginBottom:"1.25rem" }}>
                    You still need to add: <strong style={{ color:"var(--ff-text)" }}>{missing.join(", ")}</strong>. Complete these so admin can approve you and you can start taking jobs.
                  </p>
                  <ContractorProfileCompletion
                    profile={profile}
                    contractor={contractor}
                    onSaved={(patch: any) => {
                      const merged = { ...contractor, ...patch };
                      if (contractorMissing(contractor).length > 0 && contractorMissing(merged).length === 0) setShowProfileCongrats(true);
                      setContractor((c: any) => ({ ...c, ...patch }));
                    }}
                  />
                </div>
              );
            })()}
            <div style={s.card}>
              <div style={s.cardTitle}>Your Profile</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".75rem", marginBottom:"1.25rem" }}>
                {[["Name", `${profile?.first_name} ${profile?.last_name}`], ["Email", profile?.email], ["Phone", profile?.phone], ["Experience", `${contractor?.years_of_experience ?? 0} years`], ["Rating", contractor?.rating ? `⭐ ${contractor.rating}` : "No ratings"], ["Status", contractor?.status]].map(([l,v]) => (
                  <div key={l}>
                    <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)" }}>{l}</div>
                    <div style={{ fontSize:".9rem", color:"var(--ff-text)" }}>{v}</div>
                  </div>
                ))}
              </div>
              {(contractor?.specialties?.length ?? 0) > 0 && (
                <div style={{ marginBottom:"1rem" }}>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".5rem" }}>Specialties</div>
                  {contractor.specialties.map((sp: string) => <span key={sp} style={s.chip}>{sp}</span>)}
                </div>
              )}
              {(contractor?.service_area?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".5rem" }}>Service Area</div>
                  {contractor.service_area.map((z: string) => <span key={z} style={s.chip}><Ic name="map-pin" size={11} style={{ marginRight:3 }} />{z}</span>)}
                </div>
              )}
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Your default pricing</div>
              <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"1rem", lineHeight:1.5 }}>
                Set these once and they'll pre-fill your call-out fee when you send an estimate, so you bid faster and more consistently. Clients don't see these numbers.
              </p>
              <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const }}>
                <div style={{ flex:"1 1 130px" }}>
                  <div style={ffLbl}>Hourly rate ($)</div>
                  <input type="number" min="0" value={pricingForm.hourly} placeholder="e.g. 85" onChange={e => setPricingForm(f => ({ ...f, hourly: e.target.value }))} style={ffInp} />
                </div>
                <div style={{ flex:"1 1 130px" }}>
                  <div style={ffLbl}>Minimum call-out ($)</div>
                  <input type="number" min="0" value={pricingForm.callout} placeholder="e.g. 120" onChange={e => setPricingForm(f => ({ ...f, callout: e.target.value }))} style={ffInp} />
                </div>
              </div>
              <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none", marginTop:"1rem" }} disabled={busyPricing} onClick={savePricing}>{busyPricing ? "Saving…" : "Save pricing"}</button>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Portfolio &amp; Reviews</div>
              <div style={{ marginBottom:"1.25rem" }}>
                <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".35rem" }}>Google reviews link</div>
                <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                  <input value={googleUrl} placeholder="https://g.page/your-business/review" onChange={e => setGoogleUrl(e.target.value)} style={{ flex:"1 1 220px", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }} />
                  <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyPf} onClick={saveGoogleUrl}>Save link</button>
                </div>
              </div>
              <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".35rem" }}>Past work photos</div>
              {portfolio.length === 0 && <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .45)", marginBottom:".75rem" }}>No portfolio items yet. Add your best past jobs below.</p>}
              {portfolio.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:".75rem", marginBottom:"1rem" }}>
                  {portfolio.map(item => (
                    <div key={item.id} style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", overflow:"hidden" }}>
                      {item.photo_path && <img src={pfUrl(item.photo_path)} alt={item.title || "Past job"} style={{ width:"100%", height:"100px", objectFit:"cover" as const, display:"block" }} />}
                      <div style={{ padding:".5rem .6rem" }}>
                        {item.title && <div style={{ fontSize:".8rem", fontWeight:600, color:"var(--ff-text)" }}>{item.title}</div>}
                        {item.description && <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .6)", marginTop:".15rem" }}>{item.description}</div>}
                        <button onClick={() => deletePortfolioItem(item)} style={{ marginTop:".4rem", fontSize:".7rem", color:"#ef4444", background:"none", border:"none", cursor:"pointer", padding:0 }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:".5rem", borderTop:"1px solid rgba(var(--ff-fg), .07)", paddingTop:".9rem" }}>
                <input value={pfForm.title} placeholder="Title (e.g. Kitchen sink replacement)" onChange={e => setPfForm(f => ({ ...f, title: e.target.value }))} style={{ padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const }} />
                <textarea value={pfForm.description} rows={2} placeholder="Short description (optional)" onChange={e => setPfForm(f => ({ ...f, description: e.target.value }))} style={{ padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
                <input type="file" accept="image/*" onChange={e => setPfForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))} style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)" }} />
                <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none", alignSelf:"flex-start" as const }} disabled={busyPf} onClick={addPortfolioItem}>{busyPf ? "Adding…" : "+ Add portfolio item"}</button>
              </div>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Availability</div>
              <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .5)", marginBottom:"1.1rem", lineHeight:1.5 }}>
                Pick a typical week. You can fine-tune any day. Changes save automatically.
              </p>
              {(() => {
                const eq = (a: string[]) => a.length === avail.days.length && a.every(d => avail.days.includes(d));
                const active = eq(AVAIL_DAYS) ? "every" : eq(WEEKDAYS) ? "weekdays" : (avail.days.length ? "custom" : "none");
                const presets: [string,string,string[]][] = [
                  ["weekdays","Weekdays", WEEKDAYS],
                  ["every","Every day", AVAIL_DAYS],
                ];
                const presetBtn = (selected: boolean) => ({
                  padding:".5rem .9rem", borderRadius:"99px", cursor:"pointer", fontFamily:"inherit", fontSize:".82rem", fontWeight:600,
                  border: selected ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .14)",
                  background: selected ? "#ea6b14" : "rgba(var(--ff-fg), .05)",
                  color: selected ? "#fff" : "var(--ff-text)",
                });
                const showChips = showCustomAvail || active === "custom";
                const sel = {
                  padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)",
                  borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer",
                };
                return (
                  <div>
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                      {presets.map(([key,label,days]) => (
                        <button key={key} onClick={() => { setShowCustomAvail(false); setAvailDays(days); }} style={presetBtn(active === key)}>
                          {label}
                        </button>
                      ))}
                      <button onClick={() => setShowCustomAvail(v => !v || active !== "custom" ? true : false)} style={presetBtn(active === "custom")}>
                        Custom
                      </button>
                    </div>
                    {showChips && (
                      <div style={{ marginTop:"1.1rem", paddingTop:"1.1rem", borderTop:"1px solid rgba(var(--ff-fg), .07)" }}>
                        <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .55)", marginBottom:".7rem" }}>
                          Tap the days you usually work
                        </div>
                        <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                          {AVAIL_DAYS.map(day => {
                            const on = dayIsOn(day);
                            return (
                              <button key={day} onClick={() => toggleDay(day)} aria-label={day}
                                style={{ display:"flex", alignItems:"center", gap:".35rem", padding:".5rem .85rem", borderRadius:"99px", cursor:"pointer", fontFamily:"inherit", fontSize:".82rem", fontWeight:600,
                                  border: on ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .14)",
                                  background: on ? "rgba(234,107,20,.16)" : "rgba(var(--ff-fg), .05)",
                                  color: on ? "#ea6b14" : "rgba(var(--ff-muted), .6)" }}>
                                {on && <span style={{ fontSize:".78rem" }}>✓</span>}{day.slice(0,3)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {avail.days.length > 0 && (
                      <div style={{ marginTop:"1.1rem", paddingTop:"1.1rem", borderTop:"1px solid rgba(var(--ff-fg), .07)" }}>
                        <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .55)", marginBottom:".7rem" }}>
                          Hours you're usually available
                        </div>
                        <div style={{ display:"flex", gap:".6rem", alignItems:"center", flexWrap:"wrap" as const }}>
                          <select value={avail.start} onChange={e => setAvailStart(e.target.value)} style={sel}>
                            {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <span style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)" }}>to</span>
                          <select value={avail.end} onChange={e => setAvailEnd(e.target.value)} style={sel}>
                            {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        {avail.end <= avail.start && (
                          <p style={{ fontSize:".78rem", color:"var(--ff-warn)", marginTop:".7rem", marginBottom:0 }}>
                            End time should be after the start time.
                          </p>
                        )}
                      </div>
                    )}
                    {avail.days.length === 0 && !showChips && (
                      <p style={{ fontSize:".78rem", color:"var(--ff-warn)", marginTop:".9rem", marginBottom:0 }}>
                        No availability set yet — pick a preset or Custom so clients know when to reach you.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
            <DeleteAccount />
          </div>
        )}

        {activeTab === "earnings" && (
          <div>
            {earn && (() => {
              const week = Number(earn.this_week || 0);
              const goal = Number(earn.weekly_goal || 0);
              const pct = goal > 0 ? Math.min(100, Math.round((week / goal) * 100)) : 0;
              const trend = Array.isArray(earn.trend) ? earn.trend : [];
              const peak = Math.max(1, ...trend.map((t: any) => Number(t.amount || 0)));
              return (
                <div style={{ ...s.card, marginBottom:"1.5rem", background:"linear-gradient(135deg, rgba(234,107,20,.10), rgba(var(--ff-fg),.03))", borderColor:"rgba(234,107,20,.3)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:".75rem", flexWrap:"wrap" as const }}>
                    <div>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .5)" }}>This week</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(2rem,9vw,3rem)", letterSpacing:".03em", color:"#ea6b14", lineHeight:1.05 }}>${week.toFixed(0)}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)" }}>{earn.jobs_this_week || 0} job{(earn.jobs_this_week===1)?"":"s"} paid out this week</div>
                    </div>
                    <button style={{ ...s.btn, display:"inline-flex", alignItems:"center", gap:".4rem", background:"rgba(234,107,20,.9)", color:"#fff", border:"none" }} onClick={() => setRewindOpen(true)}>
                      <Ic name="star" size={13} />My Rewind
                    </button>
                  </div>

                  <div style={{ marginTop:"1.1rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".74rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".35rem" }}>
                      <span>Weekly goal</span>
                      <span>{goal > 0 ? `$${week.toFixed(0)} / $${goal.toFixed(0)} · ${pct}%` : "Set a goal to track your week"}</span>
                    </div>
                    {goal > 0 && (
                      <div style={{ height:"10px", borderRadius:"999px", background:"rgba(var(--ff-fg),.1)", overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background: pct>=100 ? "#22c55e" : "#ea6b14", borderRadius:"999px", transition:"width .4s" }} />
                      </div>
                    )}
                    <div style={{ display:"flex", gap:".5rem", marginTop:".6rem", alignItems:"center" }}>
                      <input type="number" inputMode="numeric" placeholder="e.g. 1500" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{ ...ffInp, maxWidth:"140px" }} />
                      <button style={{ ...s.btn }} disabled={savingGoal} onClick={saveGoal}>{savingGoal ? "Saving…" : (goal>0 ? "Update goal" : "Set goal")}</button>
                    </div>
                  </div>

                  {trend.length > 0 && (
                    <div style={{ marginTop:"1.3rem" }}>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .5)", marginBottom:".5rem" }}>Last 8 weeks</div>
                      <div style={{ display:"flex", alignItems:"flex-end", gap:".35rem", height:"70px" }}>
                        {trend.map((t: any, i: number) => {
                          const h = Math.round((Number(t.amount || 0) / peak) * 100);
                          const isNow = i === trend.length - 1;
                          return (
                            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:".25rem" }} title={`${t.week}: $${Number(t.amount||0).toFixed(0)}`}>
                              <div style={{ width:"100%", height:`${Math.max(3,h)}%`, minHeight:"3px", background: isNow ? "#ea6b14" : "rgba(234,107,20,.4)", borderRadius:"4px 4px 0 0" }} />
                              <div style={{ fontSize:".58rem", color:"rgba(var(--ff-muted), .4)", whiteSpace:"nowrap" }}>{String(t.week).split(" ")[1]}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display:"flex", gap:"1.5rem", marginTop:"1.3rem", flexWrap:"wrap" as const, fontSize:".82rem" }}>
                    <div><span style={{ color:"rgba(var(--ff-muted),.5)" }}>This month </span><strong style={{ color:"var(--ff-text)" }}>${Number(earn.this_month||0).toFixed(0)}</strong></div>
                    <div><span style={{ color:"rgba(var(--ff-muted),.5)" }}>Last month </span><strong style={{ color:"var(--ff-text)" }}>${Number(earn.last_month||0).toFixed(0)}</strong></div>
                    <div><span style={{ color:"rgba(var(--ff-muted),.5)" }}>This year </span><strong style={{ color:"var(--ff-text)" }}>${Number(earn.this_year||0).toFixed(0)}</strong></div>
                  </div>
                </div>
              );
            })()}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
              {[["$" + totalEarned.toFixed(2), "Total Earned"], [contractor?.total_jobs ?? 0, "Jobs Completed"], [myJobs.filter(j=>j.status==="assigned"||j.status==="in_progress").length, "Active Jobs"], [contractor?.rating ? `⭐ ${contractor.rating}` : "—", "Avg Rating"]].map(([v,l]) => (
                <div key={String(l)} style={s.earnCard}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(1.5rem,6vw,2rem)", letterSpacing:".04em", color:"#ea6b14", marginBottom:".25rem" }}>{v}</div>
                  <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)" }}>{l}</div>
                </div>
              ))}
            </div>
            {awaitingTotal > 0 && (
              <div style={{ ...s.card, marginBottom:"1.5rem", borderColor:"rgba(234,107,20,.35)", background:"rgba(234,107,20,.06)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:".6rem" }}>
                  <Ic name="key" size={16} color="#ea6b14" />
                  <div>
                    <div style={{ fontSize:"1rem", fontWeight:600, color:"var(--ff-text)" }}>${awaitingTotal.toFixed(2)} held securely</div>
                    <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .65)", lineHeight:1.45, marginTop:".1rem" }}>Held safely for {awaitingJobs.length} active job{awaitingJobs.length === 1 ? "" : "s"}. Released to you once the client confirms the work (or automatically after 3 days). Amounts shown are your 93% payout after the 7% platform fee.</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ ...s.card, marginBottom:"1.5rem" }}>
              <div style={s.cardTitle}>Payouts</div>
              {contractor?.stripe_payouts_enabled ? (
                <div style={{ display:"flex", alignItems:"center", gap:".6rem", color:"#22c55e", fontSize:".9rem" }}>
                  <Ic name="check" size={16} color="#22c55e" />
                  <span>Connected — you're set up to receive payouts.</span>
                </div>
              ) : (
                <div>
                  <p style={{ color:"rgba(var(--ff-muted), .7)", fontSize:".88rem", marginBottom:".9rem", lineHeight:1.5 }}>
                    {contractor?.stripe_account_id
                      ? "Your payout account needs a few more details before you can be paid. Finish setup with Stripe below."
                      : "Connect a bank account through Stripe to get paid for completed jobs. Funds for each job are released to you after the client confirms the work is done."}
                  </p>
                  <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyStripe} onClick={setupPayouts}>
                    {busyStripe ? "Opening Stripe…" : (contractor?.stripe_account_id ? "Finish payout setup" : "Set up payouts")}
                  </button>
                </div>
              )}
            </div>
            <div style={s.card}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:".75rem", flexWrap:"wrap" as const, marginBottom:"1.25rem" }}>
                <div style={{ ...s.cardTitle, marginBottom:0 }}>Job History</div>
                {myJobs.length > 0 && (
                  <button style={{ ...s.btn, display:"inline-flex", alignItems:"center", gap:".4rem" }} onClick={exportPayoutsCsv}>
                    <Ic name="download" size={13} />Download CSV
                  </button>
                )}
              </div>
              {myJobs.length === 0 ? <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No jobs yet.</p> : myJobs.map(job => (
                <div key={job.id} style={{ display:"flex", justifyContent:"space-between", padding:".85rem 0", borderBottom:"1px solid rgba(var(--ff-fg), .06)" }}>
                  <div>
                    <div style={{ fontSize:".9rem" }}>{job.request?.service_needed ?? "Job"}</div>
                    <div style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)" }}>{new Date(job.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    {job.amount ? (
                      <>
                        <div style={{ fontSize:".95rem", fontWeight:600, color:"#22c55e" }}>${netPayout(job).toFixed(2)}</div>
                        <div style={{ fontSize:".66rem", color:"rgba(var(--ff-muted), .4)" }}>your payout · ${job.amount} estimate</div>
                      </>
                    ) : <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .4)" }}>TBD</div>}
                    <div style={{ fontSize:".72rem", textTransform:"capitalize", color: STATUS_COLORS[job.status] ?? "#94a3b8", marginTop:".15rem" }}>{job.status.replace("_"," ")}</div>
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
                <p style={{ color:"rgba(var(--ff-muted), .5)" }}>Reviews from clients appear here after jobs are completed.</p>
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
                  {[
                    ["Price", myReviews.reduce((a,r)=>a+(r.price_score??0),0)/myReviews.length || 0],
                    ["Experience", myReviews.reduce((a,r)=>a+(r.experience_score??0),0)/myReviews.length || 0],
                    ["Results", myReviews.reduce((a,r)=>a+(r.result_score??0),0)/myReviews.length || 0],
                  ].map(([label, avg]) => (
                    <div key={String(label)} style={s.earnCard}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"#ea6b14", marginBottom:".25rem" }}>{(avg as number).toFixed(1)}<span style={{ fontSize:"1rem", color:"rgba(var(--ff-muted), .4)" }}>/10</span></div>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)" }}>{label}</div>
                    </div>
                  ))}
                </div>
                {myReviews.map(r => (
                  <div key={r.id} style={{ ...s.card, marginBottom:"1rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:".75rem" }}>
                      <div style={{ fontWeight:500, color:"var(--ff-text)" }}>{r.client?.first_name ?? "Client"}</div>
                      <div style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)" }}>{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display:"flex", gap:".5rem", marginBottom:".75rem", flexWrap:"wrap" as const }}>
                      {[["Price", r.price_score], ["Experience", r.experience_score], ["Results", r.result_score]].map(([l, v]) => v != null && (
                        <span key={String(l)} style={{ ...s.chip, background:"rgba(234,107,20,.08)", fontSize:".76rem" }}>{l}: <strong style={{ color:"#ea6b14" }}>{v}/10</strong></span>
                      ))}
                    </div>
                    {r.comment && <p style={{ fontSize:".88rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6, margin:0 }}>{r.comment}</p>}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

      </div>
        </div>
      </div>

      {chatJob && profile && (
        <JobChat
          jobId={chatJob.id}
          meId={profile.id}
          title={`Chat with ${chatJob.client?.first_name || "your client"}`}
          readOnly={chatJob.status === "cancelled"}
          onClose={() => setChatJob(null)}
        />
      )}
      {claimToAnswer && profile && (
        <RespondToClaim
          disputeId={claimToAnswer.id}
          userId={profile.id}
          claim={claimToAnswer}
          onClose={() => setClaimToAnswer(null)}
          onSubmitted={(resp) => {
            const did = claimToAnswer.id, jid = claimToAnswer.job_id;
            setDisputes(prev => ({ ...prev, [jid]: { ...prev[jid], contractor_response: resp, contractor_responded_at: new Date().toISOString() } }));
            setClaimToAnswer(null);
          }}
        />
      )}
      {rewindOpen && <FreddyRewind mode="contractor" onClose={() => setRewindOpen(false)} />}
        <ConfirmDialog state={confirmState} onClose={(ok) => { confirmState?.resolve(ok); setConfirmState(null); }} />
    </div>
  );
}
