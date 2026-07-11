import { Ic } from "@/components/Ic";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { requestGoogleReview } from "@/lib/reviewPrompt";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import ProfileBar from "@/components/ProfileBar";
import JobChat from "@/components/JobChat";
import JobTimeline from "@/components/JobTimeline";
import MilestonePanel from "@/components/MilestonePanel";
import JobTimer from "@/components/JobTimer";
import JobChecklist from "@/components/JobChecklist";
import ReportProblem from "@/components/ReportProblem";
import FileClaimModal, { type ClaimJob } from "@/components/FileClaimModal";
import { jobCode } from "@/lib/jobCode";
import ConfirmDialog, { type ConfirmState } from "@/components/ConfirmDialog";
import ProfileCompletionModal from "@/components/ProfileCompletionModal";
import FreddyRewind from "@/components/FreddyRewind";
import { freqLabel } from "@/lib/recurrence";
import DashboardSidebar, { type SidebarItem, type SidebarAction } from "@/components/DashboardSidebar";
import NotificationBell from "@/components/NotificationBell";
import { SettingsPanel } from "@/components/SettingsModal";

type ClientTab = "requests" | "pros" | "recurring" | "history" | "profile" | "settings";

const CLIENT_NAV: SidebarItem[] = [
  { key: "requests",  label: "My Requests",    icon: "clipboard-list" },
  { key: "pros",      label: "My Pros",        icon: "user-check" },
  { key: "recurring", label: "Recurring Plans", icon: "refresh" },
  { key: "history",   label: "History",        icon: "clock" },
  { key: "profile",   label: "Profile",        icon: "user" },
  { key: "settings",  label: "Settings",       icon: "settings" },
];

function QuoteBreakdownView({ row, assumptionsKey = "assumptions" }: { row: any; assumptionsKey?: string }) {
  const items: [string, any][] = [["Labour", row?.labour_amount], ["Parts & materials", row?.parts_amount], ["Call-out", row?.callout_fee]];
  const present = items.filter(([, v]) => v != null);
  const assumptions = row?.[assumptionsKey];
  const hasRange = row?.price_low != null && row?.price_high != null;
  if (present.length === 0 && !assumptions && !row?.subject_to_inspection && !hasRange) return null;
  return (
    <div style={{ marginTop:".5rem", padding:".55rem .7rem", borderRadius:"8px", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)" }}>
      {present.length > 0 && (
        <div style={{ fontSize:".68rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .45)", marginBottom:".3rem" }}>Price breakdown</div>
      )}
      {present.map(([l, v]) => (
        <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:".8rem", color:"rgba(var(--ff-muted), .8)" }}>
          <span>{l}</span><span>${Number(v).toFixed(2)}</span>
        </div>
      ))}
      {hasRange && <div style={{ fontSize:".8rem", color:"var(--ff-text)", fontWeight:600, marginTop: present.length ? ".4rem" : 0 }}>Estimated range: ${Number(row.price_low).toFixed(0)}–${Number(row.price_high).toFixed(0)}</div>}
      {assumptions && <div style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .65)", marginTop: (present.length || hasRange) ? ".4rem" : 0, lineHeight:1.45 }}>{assumptions}</div>}
      {row?.subject_to_inspection && <div style={{ fontSize:".76rem", color:"var(--ff-warn)", marginTop:".4rem", lineHeight:1.4 }}>Heads up: the final price may change after the contractor inspects the job on-site.</div>}
    </div>
  );
}


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
  const color = pct >= 0.75 ? "var(--ff-success)" : pct >= 0.45 ? "var(--ff-warn)" : "var(--ff-danger)";
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
  const [feeRate, setFeeRate] = useState(0.03); // base service-fee rate; loaded from platform_fee_rate() so it matches what Stripe charges
  const [waivedForJob, setWaivedForJob] = useState<string|null>(null); // job whose 3% fee a referral waives
  const [loadError, setLoadError] = useState(false);
  const [selectedReqId, setSelectedReqId] = useState<string|null>(null);
  const [histFilter, setHistFilter] = useState<"all"|"active"|"completed"|"cancelled">("all");
  const [histLimit, setHistLimit] = useState(5);
  const [pros, setPros]             = useState<any[]>([]);
  const [referral, setReferral]     = useState<any>(null);
  const [rewindOpen, setRewindOpen] = useState(false);
  const [refCopied, setRefCopied]   = useState(false);
  const [plans, setPlans]           = useState<any[]>([]);
  const [busyPlan, setBusyPlan]     = useState<string|null>(null);
  const [newVisitTime, setNewVisitTime] = useState<string>("");
  const [showChangeTime, setShowChangeTime] = useState(false);
  const [selAddons, setSelAddons]   = useState<number[]>([]); // optional add-on indexes ticked on the approval card
  const [toast, setToast]           = useState<{ kind:"err"|"ok"; text:string }|null>(null);
  const [activeTab, setActiveTab]   = useState<ClientTab>("requests");
  const toastTimer = useRef<number | null>(null);
  const notify = (text: string, kind: "err" | "ok" = "err") => {
    setToast({ kind, text });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), kind === "ok" ? 3000 : 6000);
  };
  const [showResched, setShowResched] = useState(false);
  const [reschedNote, setReschedNote] = useState("");
  const [claimOpen, setClaimOpen]   = useState(false);
  const [claimJobs, setClaimJobs]   = useState<ClaimJob[]>([]);

  // "File a claim" (sidebar footer): load every job tied to this client's
  // requests so they can pick which one the claim is about, then hand off to
  // the existing ReportProblem flow inside FileClaimModal.
  const openClaim = async () => {
    setClaimOpen(true);
    try {
      const ids = requests.map(r => r.id);
      if (ids.length === 0) { setClaimJobs([]); return; }
      const { data } = await supabase.from("jobs").select("id, status, request_id").in("request_id", ids);
      const svc = new Map(requests.map(r => [r.id, r.service_needed as string | null]));
      setClaimJobs((data ?? []).map((j: any) => ({ id: j.id, status: j.status, service: svc.get(j.request_id) ?? null })));
    } catch {
      setClaimJobs([]);
    }
  };

  const askConfirm = (o: Omit<ConfirmState, "resolve">) =>
    new Promise<boolean>(resolve => setConfirmState({ ...o, resolve }));

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

        // profile + requests have no inter-dependency — fetch them together.
        const [prof, reqs, myPros, ref, rate, planRows] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("client_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.rpc("list_my_pros"),
          supabase.rpc("get_my_referral"),
          supabase.rpc("platform_fee_rate"),
          supabase.rpc("list_my_recurring_plans"),
        ]);
        // Base fee rate comes from the DB (single source of truth) so the total
        // shown here is exactly what create-payment-intent will charge.
        if (typeof rate.data === "number" && rate.data >= 0 && rate.data < 0.2) setFeeRate(Number(rate.data));
        // A failed profile/requests read must show an error+retry, not a false "no jobs" empty state.
        if (prof.error || reqs.error) { setLoadError(true); return; }
        setProfile(prof.data);
        setRequests(reqs.data ?? []);
        setPros(myPros.data ?? []);
        setReferral(ref.data ?? null);
        setPlans(planRows.data ?? []);
        // All clients pay the standard 3% service fee unless a referral waives it
        // for a specific first job (checked per-job in the active-job effect below).
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Non-terminal requests the client can switch between. If the user picked one
  // explicitly use it; otherwise default to the first open request, else newest.
  const openReqs = requests.filter(r => r.status !== "completed" && r.status !== "cancelled");
  const activeReq =
    (selectedReqId && requests.find(r => r.id === selectedReqId)) ||
    openReqs[0] || requests[0];

  // Load the assigned contractor + job whenever the active request changes
  // (mount, or the client switching between open requests).
  useEffect(() => {
    if (!activeReq) { setContractor(null); setActiveJob(null); return; }
    let cancelled = false;
    (async () => {
      const [{ data: con }, { data: job }] = await Promise.all([
        activeReq.assigned_contractor_id
          ? supabase.rpc("get_contractor_profile", { p_id: activeReq.assigned_contractor_id }).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("jobs").select("*").eq("request_id", activeReq.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setContractor(con ?? null);
      setActiveJob(job ?? null);
      setSelAddons([]); // fresh add-on selection per job
      // Referral perk: the 3% service fee is waived on a referred client's first
      // job. Check the specific job so the displayed total matches what Stripe charges.
      if (job && job.payment_status !== "released" && job.total_charged == null) {
        supabase.rpc("referral_waiver_eligible", { p_client: activeReq.user_id, p_job_id: job.id })
          .then(({ data }) => { if (!cancelled) setWaivedForJob(data === true ? job.id : null); });
      } else if (!cancelled) {
        setWaivedForJob(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReq?.id]);

  // Realtime: keep the active job's status/payment live as the contractor acts
  // (proposes a time, marks on-the-way, completes) without a manual refresh.
  useEffect(() => {
    if (!activeReq?.id) return;
    const channel = supabase.channel("clientjob:" + activeReq.id)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `request_id=eq.${activeReq.id}` },
        payload => { const row = payload.new as any; if (row?.id) setActiveJob((j: any) => (j && j.id !== row.id) ? j : { ...(j ?? {}), ...row }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReq?.id]);

  const handleSignOut = async () => { await supabase.auth.signOut(); setLocation("/"); };

  const toggleFav = async (contractorId: string) => {
    // optimistic flip
    setPros(prev => prev.map(x => x.contractor_id === contractorId ? { ...x, is_favorite: !x.is_favorite } : x));
    const { data, error } = await supabase.rpc("toggle_favorite", { p_contractor_id: contractorId });
    if (error) { setPros(prev => prev.map(x => x.contractor_id === contractorId ? { ...x, is_favorite: !x.is_favorite } : x)); notify("Couldn't update your favourites — please try again."); return; }
    setPros(prev => prev.map(x => x.contractor_id === contractorId ? { ...x, is_favorite: data === true } : x));
  };

  const rehire = (pro: any) => {
    const q = new URLSearchParams();
    q.set("pro", pro.contractor_id);
    if (pro.last_service) q.set("service", pro.last_service);
    // ClientOnboarding shows the short NewRequest form for signed-in users and
    // NewRequest reads ?pro= / ?service= (there is no /new-request route).
    setLocation("/client-onboarding?" + q.toString());
  };

  const copyReferral = async () => {
    const code = referral?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`Get your first Freddy Fix It service fee waived with my code ${code}: https://freddyfixit.ca/?ref=${code}`);
      setRefCopied(true); setTimeout(() => setRefCopied(false), 2000);
    } catch { notify("Couldn't copy automatically — your code is " + code + " (shown on the card)."); }
  };

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
    if (error) { notify("Couldn't save changes: " + error.message); return; }
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
    if (error) { notify("Couldn't remove request: " + error.message); return; }
    if (data === "deleted") setRequests(prev => prev.filter(x => x.id !== r.id));
    else setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: "cancelled" } : x));
  };

  const approveSchedule = async () => {
    if (!activeJob) return;
    setBusyReq(true);
    const { error } = await supabase.rpc("approve_job_schedule", {
      p_job_id: activeJob.id,
      p_selected_items: selAddons.length ? selAddons : null,
    });
    setBusyReq(false);
    if (error) { notify("Couldn't approve: " + error.message); return; }
    // Email the client a written contract copy (Alberta: starts the 10-day cancellation clock).
    supabase.functions.invoke("notify-email", { body: { event: "contract_copy", job_id: activeJob.id } }).catch(() => {});
    // If this job is covered by a prepaid recurring pool, draw down one occurrence
    // now (links the job to the held funds — no separate checkout needed).
    let covered = false;
    try {
      const { data: used } = await supabase.rpc("consume_prepaid_occurrence", { p_job: activeJob.id });
      covered = used === true;
    } catch { /* no pool / not eligible — falls through to normal pay flow */ }
    // Mirror the server's idempotent add-on math: amount − previously-accepted + newly-selected.
    const qi = Array.isArray(activeJob.quote_items) ? activeJob.quote_items : null;
    let newAmount = activeJob.amount;
    let newItems = qi;
    if (qi) {
      const prevAccepted = qi.reduce((t: number, i: any) => t + (i.accepted ? Number(i.amount) || 0 : 0), 0);
      const newSelected = selAddons.reduce((t, idx) => t + (Number(qi[idx]?.amount) || 0), 0);
      newAmount = Math.round((Number(activeJob.amount) - prevAccepted + newSelected) * 100) / 100;
      newItems = qi.map((i: any, idx: number) => ({ ...i, accepted: selAddons.includes(idx) }));
    }
    setSelAddons([]);
    setActiveJob({ ...activeJob, status: "scheduled", client_approved_at: new Date().toISOString(),
      amount: newAmount, quote_items: newItems,
      ...(covered ? { payment_status: "held", paid_at: new Date().toISOString() } : {}) });
  };
  const requestReschedule = () => {
    if (!activeJob || !profile) return;
    setReschedNote("");
    setShowResched(true);
  };
  const submitReschedule = async () => {
    if (!activeJob || !profile) return;
    const trimmed = reschedNote.trim();
    if (!trimmed) return;
    setBusyReq(true);
    const { error } = await supabase.from("messages").insert({
      job_id: activeJob.id,
      sender_id: profile.id,
      content: "Reschedule request: " + trimmed,
    });
    setBusyReq(false);
    if (error) { notify("Couldn't send your request: " + error.message); return; }
    setShowResched(false);
    notify("Sent! Your contractor will see your suggested time and propose a new one.", "ok");
  };

  const confirmVisit = async () => {
    if (!activeJob) return;
    setBusyReq(true);
    const { error } = await supabase.rpc("confirm_visit", { p_job_id: activeJob.id });
    setBusyReq(false);
    if (error) { notify("Couldn't confirm: " + error.message); return; }
    setActiveJob({ ...activeJob, client_confirmed_visit_at: new Date().toISOString() });
  };

  const changeVisitTime = async () => {
    if (!activeJob || !newVisitTime) { notify("Pick a new date and time first."); return; }
    if (!(await askConfirm({
      title: "Change the time?",
      message: "Heads up: your pro already blocked off the current time. Changing it means they have to accept the new time — they may not be available and could decline. If they can't make it, they'll suggest another time for you to approve.",
      confirmLabel: "Yes, change the time",
      danger: false,
    }))) return;
    const iso = new Date(newVisitTime).toISOString();
    setBusyReq(true);
    const { error } = await supabase.rpc("client_reschedule_visit", { p_job_id: activeJob.id, p_scheduled_at: iso });
    setBusyReq(false);
    if (error) { notify("Couldn't change the time: " + error.message); return; }
    setShowChangeTime(false);
    setNewVisitTime("");
    setActiveJob({ ...activeJob, status: "assigned", scheduled_at: iso, schedule_proposed_at: new Date().toISOString(), client_approved_at: null, client_confirmed_visit_at: null, client_rescheduled_at: new Date().toISOString(), reschedule_accepted_at: null });
  };

  const togglePlan = async (plan: any) => {
    const next = plan.recurring_plan_status === "active" ? "paused" : "active";
    setBusyPlan(plan.request_id);
    const { error } = await supabase.rpc("set_recurring_plan_status", { p_request: plan.request_id, p_status: next });
    setBusyPlan(null);
    if (error) { notify("Couldn't update plan: " + error.message); return; }
    setPlans(prev => prev.map(p => p.request_id === plan.request_id ? { ...p, recurring_plan_status: next } : p));
  };
  const prepayPlan = async (plan: any, n: number) => {
    if (!(await askConfirm({
      title: `Prepay ${n} visit${n===1?"":"s"}?`,
      message: "You'll go to a secure checkout for the total. Each visit is held securely and released to your pro one at a time as it's completed. Unused visits are refundable.",
      confirmLabel: "Continue to checkout",
      danger: false,
    }))) return;
    setBusyPlan(plan.request_id);
    try {
      const { data, error } = await supabase.functions.invoke("create-recurring-prepayment", {
        body: { plan_request_id: plan.request_id, occurrences: n },
      });
      if (error) throw error;
      if (data?.url) { window.location.href = data.url; return; }
      throw new Error(data?.error || "Could not start checkout");
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      notify("Prepay couldn't start: " + msg);
      setBusyPlan(null);
    }
  };

  const downloadReceipt = (j: any) => {
    const amt = Number(j?.amount ?? 0);
    const total = jobTotal(j);
    const fee = r2(total - amt);
    const paidOn = j.paid_at ? new Date(j.paid_at).toLocaleDateString() : new Date().toLocaleDateString();
    const ref = (j.id ?? "").slice(0, 8).toUpperCase();
    const esc = (v: any) => String(v ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);
    const html =
      "<!doctype html><html><head><meta charset='utf-8'><title>Receipt " + esc(ref) + "</title>" +
      "<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a2236;max-width:560px;margin:40px auto;padding:0 20px}" +
      "h1{font-size:22px;color:#ea6b14;margin:0 0 2px}.sub{color:#667;font-size:13px;margin-bottom:24px}" +
      "table{width:100%;border-collapse:collapse;margin:18px 0}td{padding:9px 0;font-size:14px;border-bottom:1px solid #eee}" +
      "td.r{text-align:right}.tot td{font-weight:700;font-size:16px;border-bottom:none;border-top:2px solid var(--ff-bg);padding-top:12px}" +
      ".muted{color:#778;font-size:12px}@media print{button{display:none}}" +
      "button{margin-top:18px;padding:10px 18px;background:#ea6b14;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}</style></head><body>" +
      "<h1>FREDDY FIX IT</h1><div class='sub'>Payment receipt · " + esc(paidOn) + "</div>" +
      "<table>" +
      "<tr><td>Receipt #</td><td class='r'>" + esc(ref) + "</td></tr>" +
      "<tr><td>Service</td><td class='r'>" + esc(activeReq?.service_needed ?? "Home service") + "</td></tr>" +
      (contractor ? "<tr><td>Contractor</td><td class='r'>" + esc(contractor.first_name + " " + (contractor.last_name?.[0] ?? "") + ".") + "</td></tr>" : "") +
      "<tr><td>Job amount</td><td class='r'>$" + amt.toFixed(2) + "</td></tr>" +
      "<tr><td>Service fee (" + (amt > 0 ? Math.round((fee / amt) * 100) : Math.round(feeRate * 100)) + "%)</td><td class='r'>$" + fee.toFixed(2) + "</td></tr>" +
      "<tr class='tot'><td>Total paid</td><td class='r'>$" + total.toFixed(2) + "</td></tr>" +
      "</table>" +
      "<div class='muted'>Status: " + esc((j.payment_status ?? "").replace("_", " ")) + ". Payment is held securely and released to your contractor after you confirm the work is complete.</div>" +
      "<button onclick='window.print()'>Print / Save as PDF</button>" +
      "</body></html>";
    const w = window.open("", "_blank");
    if (!w) { notify("Please allow pop-ups to view your receipt."); return; }
    w.document.write(html);
    w.document.close();
  };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  function jobTotal(j: any) {
    if (j?.total_charged != null) return Number(j.total_charged);
    const amt = Number(j?.amount ?? 0);
    const rate = (j?.id && waivedForJob === j.id) ? 0 : feeRate;
    return r2(amt * (1 + rate));
  }
  // Human copy for the fee line — always matches what jobTotal() (and Stripe) charge.
  function feeText(j: any) {
    if (j?.id && waivedForJob === j.id) return "Your service fee is waived on this job (referral reward).";
    return "Total includes a " + (Math.round(feeRate * 1000) / 10) + "% service fee.";
  }
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
      notify("Payment couldn't start: " + msg);
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
    if (error) { notify("Couldn't confirm: " + error.message); return; }
    requestGoogleReview("job_done", { jobId: activeJob.id });
    setActiveJob({ ...activeJob, status: "completed", client_confirmed_at: new Date().toISOString() });
    setRequests(prev => prev.map(r => r.id === activeJob.request_id ? { ...r, status: "completed" } : r));
    if (activeJob.payment_status === "held") {
      // Try to release right away. If it doesn't go through (network blip, Stripe
      // hiccup), the payout is NOT lost — the reconcile-payouts cron re-tries every
      // 15 min for any confirmed-but-held job. So we reassure rather than alarm.
      try {
        const releaseBody = activeJob.prepayment_id
          ? { prepayment_id: activeJob.prepayment_id, job_id: activeJob.id }
          : { job_id: activeJob.id };
        const { data, error } = await supabase.functions.invoke("release-payment", { body: releaseBody });
        const failed = !!error || (data && (data as any).error);
        if (failed) {
          notify("Job confirmed. The payment to your contractor is being processed and will complete automatically within a few minutes — nothing more for you to do.", "ok");
        } else {
          setActiveJob((j: any) => j ? { ...j, payment_status: "released" } : j);
        }
      } catch {
        notify("Job confirmed. The payment to your contractor is being processed and will complete automatically within a few minutes — nothing more for you to do.", "ok");
      }
    }
  };

  // Client responds to a contractor's proposed price change (any live stage, pre-payout).
  const approvePriceChange = async () => {
    if (!activeJob) return;
    setBusyReq(true);
    try {
      const { data, error } = await supabase.functions.invoke("adjust-payment", { body: { job_id: activeJob.id } });
      const errMsg = error ? error.message : (data && (data as any).error);
      if (errMsg) { setBusyReq(false); notify("Couldn't apply the price change: " + errMsg); return; }
      if (data && (data as any).mode === "topup" && (data as any).url) {
        // Increase — pay the extra via Stripe Checkout; the webhook applies the new price.
        window.location.href = (data as any).url;
        return;
      }
      // Decrease or no-change — applied immediately (any refund is issued by adjust-payment).
      const pc = activeJob.price_change_pending;
      setActiveJob((j: any) => j ? { ...j, amount: pc?.amount ?? j.amount, price_change_pending: null } : j);
      setBusyReq(false);
    } catch (e: any) {
      setBusyReq(false);
      notify("Couldn't apply the price change: " + String(e?.message ?? e));
    }
  };

  const declinePriceChange = async () => {
    if (!activeJob) return;
    if (!(await askConfirm({
      title: "Decline the price change?",
      message: "Your pro's proposed new price won't be applied — the current agreed price stays in place.",
      confirmLabel: "Yes, decline", danger: false,
    }))) return;
    setBusyReq(true);
    const { error } = await supabase.rpc("decline_price_change", { p_job_id: activeJob.id });
    setBusyReq(false);
    if (error) { notify("Couldn't decline: " + error.message); return; }
    setActiveJob((j: any) => j ? { ...j, price_change_pending: null } : j);
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
    const ar = activeReq;
    if (ar && ar.status === "pending") {
      supabase.from("bids").select("*").eq("request_id", ar.id).eq("status", "pending").order("amount", { ascending: true })
        .then(async ({ data }) => {
          setClientBids(data ?? []);
          const ids = Array.from(new Set((data ?? []).map((b: any) => b.contractor_id)));
          if (ids.length) {
            const { data: dir } = await supabase.rpc("get_contractor_directory").select("id, first_name, last_name").in("id", ids);
            const m: Record<string,string> = {};
            ((dir ?? []) as any[]).forEach((c: any) => { m[c.id] = ((c.first_name ?? "") + " " + (c.last_name ? c.last_name[0] + "." : "")).trim() || "Contractor"; });
            setBidNames(m);
          }
        });
    } else { setClientBids([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReq?.id, activeReq?.status]);

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
    if (error) { notify("Couldn't select: " + error.message); return; }
    const ar = activeReq;
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
    if (error) { notify("Couldn't submit rating: " + error.message); return; }
    setHasReviewed(true);
  };

  const s = {
    wrap: { minHeight:"100vh", background:"var(--ff-bg)", backgroundImage:"radial-gradient(ellipse 60% 30% at 80% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), radial-gradient(rgba(var(--ff-fg), 0.025) 1px, transparent 1px)", backgroundSize:"auto, 22px 22px", backgroundAttachment:"fixed", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    header: { background:"rgba(var(--ff-fg), .03)", borderBottom:"1px solid rgba(var(--ff-fg), .07)", padding:".75rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".75rem" },
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" },
    content: { maxWidth:"800px", margin:"0 auto", padding:"1.5rem" },
    card: { background:"rgba(var(--ff-fg), .055)", border:"1px solid rgba(var(--ff-fg), .05)", borderRadius:"14px", padding:"1.5rem", marginBottom:"1.5rem" },
    cardTitle: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", lineHeight:1.1, color:"#ea6b14", marginBottom:"1.25rem" },
    btn: { padding:".5rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"6px", color:"rgba(var(--ff-muted), .7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" },
    primaryBtn: { padding:".75rem 1.5rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer" },
    tabs: { display:"flex", gap:".5rem", marginBottom:"1.5rem", flexWrap:"wrap" as const },
    tab: { padding:".6rem 1.2rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px", color:"rgba(var(--ff-muted), .6)", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem" },
    activeTab: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.4)", color:"var(--ff-text)" },
  };

  if (loading) return (
    <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", color:"rgba(var(--ff-muted), .5)" }}>
        <div style={{ marginBottom:"1rem" }}><Ic name="settings" size={36} color="#ea6b14" /></div>Loading your dashboard…
      </div>
    </div>
  );

  // A read failure is distinct from "you have no jobs yet" — never show the empty
  // state when the data simply didn't load; offer a retry instead.
  if (loadError) return (
    <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", color:"rgba(var(--ff-muted), .7)", maxWidth:"320px", padding:"1.5rem" }}>
        <div style={{ marginBottom:".75rem", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".04em" }}>Couldn't load your dashboard</div>
        <div style={{ fontSize:".9rem", marginBottom:"1.25rem" }}>Check your connection and try again.</div>
        <button style={s.primaryBtn} onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  return (
    <div style={s.wrap} className="ffdash">
      <style>{".ffdash button{transition:filter .12s ease, transform .08s ease, opacity .12s ease} .ffdash button:hover:not(:disabled){filter:brightness(1.09)} .ffdash button:active:not(:disabled){transform:translateY(1px)} .ffdash button:disabled{opacity:.55; cursor:not-allowed}"}</style>
      {toast && (
        <div onClick={() => setToast(null)} style={{ position:"fixed", left:"50%", bottom:"1.5rem", transform:"translateX(-50%)", zIndex:9999, maxWidth:"90vw", padding:".8rem 1.1rem", borderRadius:"12px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:".9rem", lineHeight:1.45, color:"#fff", background: toast.kind==="ok" ? "#1c6b39" : "#8a2020", border:"1px solid " + (toast.kind==="ok" ? "rgba(34,197,94,.55)" : "rgba(239,68,68,.55)"), boxShadow:"0 10px 34px rgba(0,0,0,.4)" }}>{toast.text}</div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ height: "3.75rem" }} />
      <div style={{ display:"flex", alignItems:"flex-start" as const }}>
        <DashboardSidebar
          items={CLIENT_NAV}
          active={activeTab}
          onSelect={(k) => setActiveTab(k as ClientTab)}
          title="Dashboard"
          bell={profile?.id ? <NotificationBell userId={profile.id} dashboardPath="/client-dashboard" /> : undefined}
          actions={[
            { key: "claim",   label: "File a claim", icon: "alert-triangle", onClick: openClaim },
            { key: "logout",  label: "Log out",    icon: "door", onClick: handleSignOut, danger: true },
          ] as SidebarAction[]}
        />
        <div style={{ flex:1, minWidth:0 }}>

      <div style={s.header}>
        <div>
          <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.7rem", letterSpacing:".02em", margin:0, lineHeight:1.1 }}>
            Welcome{profile?.first_name ? ", " + profile.first_name : " back"}
          </h1>
          <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .6)", marginTop:".2rem" }}>Here's what's happening with your requests.</div>
        </div>
        <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const }}>
          <button style={{ ...s.tab, display:"inline-flex", alignItems:"center", gap:".35rem" }} onClick={() => setRewindOpen(true)}><Ic name="star" size={13} color="#ea6b14" />My Rewind</button>
          <button style={s.primaryBtn} onClick={() => setLocation("/client-onboarding")}>+ New Request</button>
        </div>
      </div>

      <div style={s.content}>
        {(() => {
          const missing: string[] = [];
          if (!profile?.first_name || !profile?.last_name) missing.push("your name");
          if (!profile?.phone) missing.push("phone number");
          return missing.length > 0 ? (
            <div style={{ margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.45)", display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".75rem", justifyContent:"space-between" }}>
              <div style={{ flex:"1 1 260px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:".4rem", fontSize:".85rem", fontWeight:600, color:"#ea6b14", marginBottom:".3rem" }}>
                  <Ic name="alert-triangle" size={14} />Complete your profile
                </div>
                <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>
                  Add {missing.join(" and ")} so your pros can reach you.
                </div>
              </div>
              <button style={{ ...s.primaryBtn, whiteSpace:"nowrap" as const }} onClick={() => { setActiveTab("profile"); window.scrollTo({ top:0, behavior:"smooth" }); }}>
                Complete profile
              </button>
            </div>
          ) : null;
        })()}
        <ProfileCompletionModal role="client" profile={profile} />
        {rewindOpen && <FreddyRewind mode="client" onClose={() => setRewindOpen(false)} />}

        {(() => {
          // "Needs your attention" — surfaces the next action on the selected request.
          const attn: { key: string; text: string; cta: string }[] = [];
          if (activeJob?.price_change_pending) attn.push({ key: "price", text: "Your pro proposed a new price — review and approve or decline.", cta: "Review price" });
          else if (activeJob?.status === "pending_confirmation" && !activeJob?.is_milestone) attn.push({ key: "confirm", text: "Your pro marked the job complete — confirm the work to release payment.", cta: "Confirm now" });
          if (activeJob?.status === "assigned" && activeJob?.schedule_proposed_at && !activeJob?.client_approved_at && !(activeJob?.client_rescheduled_at && !activeJob?.reschedule_accepted_at)) attn.push({ key: "sched", text: "Your pro proposed a time and price — approve it to book the visit.", cta: "Review proposal" });
          if (!activeJob && clientBids.length > 0) attn.push({ key: "bids", text: clientBids.length + " pro" + (clientBids.length === 1 ? " has" : "s have") + " bid on your request — pick the one you like.", cta: "See bids" });
          if (attn.length === 0) return null;
          return (
            <div style={{ ...s.card, padding:"1.1rem 1.25rem", marginBottom:"1.25rem", border:"1px solid rgba(234,107,20,.3)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:".45rem", fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"#ea6b14", fontWeight:700 }}>
                <Ic name="alert-triangle" size={13} />Needs your attention
              </div>
              {attn.slice(0, 3).map((a, i) => (
                <div key={a.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:".75rem", padding:".6rem 0", borderTop: i === 0 ? "none" : "1px solid rgba(var(--ff-fg), .06)", marginTop: i === 0 ? ".5rem" : 0 }}>
                  <div style={{ fontSize:".85rem", color:"var(--ff-text)", lineHeight:1.45 }}>{a.text}</div>
                  <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none", whiteSpace:"nowrap" as const, flexShrink:0 }} onClick={() => { setActiveTab("requests"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{a.cta}</button>
                </div>
              ))}
            </div>
          );
        })()}

        {activeTab === "profile" && (
          <>
            <ProfileBar role="client" />
          </>
        )}

        {activeTab === "settings" && (
          <SettingsPanel role="client" />
        )}

        {activeTab === "pros" && (pros.length > 0 ? (
          <div style={{ ...s.card }}>
            <div style={s.cardTitle}>Your pros</div>
            <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .55)", marginTop:"-.4rem", marginBottom:".9rem" }}>Rebook someone you trust — they'll be requested directly.</div>
            <div style={{ display:"flex", gap:".8rem", overflowX:"auto" as const, paddingBottom:".3rem" }}>
              {pros.map(pro => (
                <div key={pro.contractor_id} style={{ minWidth:"210px", flex:"0 0 auto", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"12px", padding:"1rem", background:"rgba(var(--ff-fg), .03)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:".5rem" }}>
                    <div>
                      <div style={{ fontSize:".95rem", fontWeight:600, color:"var(--ff-text)" }}>{pro.company_name || pro.name || "Your pro"}</div>
                      <div style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .5)" }}>
                        {pro.rating ? `⭐ ${Number(pro.rating).toFixed(1)}` : "New"}{pro.jobs_together ? ` · ${pro.jobs_together} job${pro.jobs_together===1?"":"s"} together` : ""}
                      </div>
                    </div>
                    <button onClick={() => toggleFav(pro.contractor_id)} aria-label={pro.is_favorite ? "Remove favourite" : "Add favourite"} title={pro.is_favorite ? "Remove favourite" : "Add favourite"} style={{ background:"none", border:"none", cursor:"pointer", fontSize:"1.1rem", lineHeight:1, color: pro.is_favorite ? "#ea6b14" : "rgba(var(--ff-muted), .4)" }}>
                      {pro.is_favorite ? "♥" : "♡"}
                    </button>
                  </div>
                  {pro.last_service && <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .45)", marginTop:".5rem" }}>Last: {pro.last_service}</div>}
                  <button style={{ ...s.primaryBtn, width:"100%", marginTop:".7rem", padding:".5rem", fontSize:".82rem" }} onClick={() => rehire(pro)}>Book again</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"3.5rem 2rem" }}>
            <div style={{ marginBottom:"1rem" }}><Ic name="user-check" size={44} color="#ea6b14" /></div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".4rem" }}>No pros yet</h2>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".9rem" }}>Once you've worked with a contractor, they'll show up here so you can rebook them in one tap.</p>
          </div>
        ))}

        {activeTab === "requests" && referral?.code && (
          <div style={{ ...s.card, background:"linear-gradient(135deg, rgba(234,107,20,.10), rgba(var(--ff-fg),.03))", borderColor:"rgba(234,107,20,.28)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".75rem", flexWrap:"wrap" as const }}>
              <div>
                <div style={{ ...s.cardTitle, marginBottom:".2rem" }}>Invite a friend, they save</div>
                <div style={{ fontSize:".84rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.5 }}>
                  Friends who join with your code get the <strong>3% service fee waived on their first job</strong>.
                  {referral.invited ? ` You've invited ${referral.invited}${referral.rewarded ? `, ${referral.rewarded} booked` : ""}.` : ""}
                </div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:".12em", color:"#ea6b14", border:"1px dashed rgba(234,107,20,.5)", borderRadius:"10px", padding:".35rem .9rem" }}>{referral.code}</div>
                <button style={{ ...s.tab, marginTop:".45rem", fontSize:".78rem", ...(refCopied ? { color:"#22c55e", borderColor:"rgba(34,197,94,.4)", background:"rgba(34,197,94,.1)" } : {}) }} onClick={copyReferral}>{refCopied ? "Copied ✓" : "Copy invite link"}</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "recurring" && (plans.length > 0 ? (
          <div style={{ ...s.card }}>
            <div style={s.cardTitle}>Recurring plans</div>
            <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .55)", marginTop:"-.4rem", marginBottom:".9rem" }}>We'll line up each visit automatically. Prepay ahead to lock it in — held securely, released one visit at a time.</div>
            <div style={{ display:"flex", flexDirection:"column" as const, gap:".8rem" }}>
              {plans.map(pl => {
                const paused = pl.recurring_plan_status !== "active";
                const cadence = pl.recurring_frequency === "per_km"
                  ? (pl.recurring_interval_km ? `Every ~${Number(pl.recurring_interval_km).toLocaleString()} km` : "By distance")
                  : (freqLabel(pl.recurring_frequency) || "Recurring");
                const hasPool = pl.prepay_id && (pl.prepay_status === "held" || pl.prepay_status === "partially_released");
                const remaining = hasPool ? Math.max(0, Number(pl.prepay_total || 0) - Number(pl.prepay_released || 0)) : 0;
                return (
                  <div key={pl.request_id} style={{ border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"12px", padding:"1rem", background:"rgba(var(--ff-fg), .03)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:".75rem", flexWrap:"wrap" as const }}>
                      <div>
                        <div style={{ fontSize:".95rem", fontWeight:600, color:"var(--ff-text)" }}>{pl.service_needed}</div>
                        <div style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .55)", marginTop:".15rem" }}>
                          {cadence}{pl.contractor_company ? ` · ${pl.contractor_company}` : ""}{pl.next_due ? ` · next ${new Date(pl.next_due).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize:".7rem", fontWeight:600, padding:".2rem .6rem", borderRadius:"999px", color: paused ? "var(--ff-warn)" : "var(--ff-success)", background: paused ? "rgba(251,191,36,.12)" : "rgba(34,197,94,.12)" }}>
                        {paused ? "Paused" : "Active"}
                      </span>
                    </div>
                    {hasPool && (
                      <div style={{ fontSize:".76rem", color:"var(--ff-success)", marginTop:".55rem" }}>
                        <Ic name="check-circle" size={12} style={{ marginRight:4 }} />
                        {remaining} of {pl.prepay_total} prepaid visit{Number(pl.prepay_total)===1?"":"s"} remaining.
                      </div>
                    )}
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginTop:".7rem" }}>
                      {!hasPool && !paused && [2,3].map(n => (
                        <button key={n} style={{ ...s.primaryBtn, padding:".45rem .8rem", fontSize:".8rem" }} disabled={busyPlan===pl.request_id} onClick={() => prepayPlan(pl, n)}>
                          {busyPlan===pl.request_id ? "…" : `Prepay ${n} visits`}
                        </button>
                      ))}
                      <button style={{ ...s.btn, padding:".45rem .8rem", fontSize:".8rem" }} disabled={busyPlan===pl.request_id} onClick={() => togglePlan(pl)}>
                        {paused ? "Resume plan" : "Pause plan"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"3.5rem 2rem" }}>
            <div style={{ marginBottom:"1rem" }}><Ic name="refresh" size={44} color="#ea6b14" /></div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".4rem" }}>No recurring plans</h2>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".9rem" }}>Book a job as recurring and we'll line up each visit automatically — you can manage and prepay them here.</p>
          </div>
        ))}

        {activeTab === "requests" && (
        <>
            {requests.length === 0 ? (
              <div style={{ textAlign:"center", padding:"3rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="home" size={44} color="#ea6b14" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".5rem" }}>What needs fixing?</h2>
                <p style={{ color:"rgba(var(--ff-muted), .5)", marginBottom:"1.25rem", maxWidth:"380px", marginLeft:"auto", marginRight:"auto", lineHeight:1.55 }}>Describe the job, get free estimates from vetted Calgary pros, and pick the one you like. Your payment is held securely until the work is done.</p>
                <button style={s.primaryBtn} onClick={() => setLocation("/client-onboarding")}>Post your first request →</button>
                <div style={{ marginTop:"1rem", fontSize:".78rem", color:"rgba(var(--ff-muted), .45)" }}>Popular: handyman visits · plumbing · electrical · furnace tune-ups</div>
              </div>
            ) : (
              <>
                {openReqs.length > 1 && (
                  <div style={{ ...s.card, padding:"1rem 1.25rem" }}>
                    <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)", marginBottom:".6rem" }}>Your open requests ({openReqs.length})</div>
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                      {openReqs.map(r => {
                        const on = r.id === activeReq?.id;
                        return (
                          <button key={r.id} onClick={() => setSelectedReqId(r.id)} style={{ ...s.tab, ...(on ? s.activeTab : {}), display:"flex", alignItems:"center", gap:".4rem" }}>
                            <Ic name={STATUS_META[r.status]?.icon as any} size={12} color={STATUS_META[r.status]?.color} />
                            <span style={{ maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{r.service_needed}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {activeReq && (
                  <div style={s.card}>
                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:".75rem", flexWrap:"wrap" as const }}>
                      <div style={s.cardTitle}>Current Request</div>
                      {activeJob?.id && <div style={{ fontSize:".72rem", fontFamily:"monospace", color:"#ea6b14" }} title="Quote this Job ID when filing a claim">{jobCode(activeJob.id)}</div>}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:".75rem 1.5rem", marginBottom:"1.25rem" }}>
                      {[["Service", activeReq.service_needed], ["Location", activeReq.location], ["Schedule", activeReq.preferred_schedule], ["Submitted", new Date(activeReq.created_at).toLocaleDateString()]].map(([l,v]) => (
                        <div key={l}>
                          <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)" }}>{l}</div>
                          <div style={{ fontSize:".9rem", color:"var(--ff-text)", marginTop:".1rem", wordBreak:"break-word" as const }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .06)", borderRadius:"8px", padding:"1rem", marginBottom:"1rem" }}>
                      <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".4rem" }}>Job Description</div>
                      <div style={{ fontSize:".88rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6 }}>{activeReq.job_description}</div>
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
                          <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".5rem", padding:".6rem .7rem", marginBottom:".5rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px", flexWrap:"wrap" as const }}>
                            <div style={{ flex:"1 1 160px" }}>
                              <div style={{ fontSize:".88rem", color:"var(--ff-text)" }}>{bidNames[b.contractor_id] ?? "Contractor"}{b.amount != null ? " — $" + b.amount : ""}</div>
                              {b.message && <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .65)", marginTop:".15rem" }}>{b.message}</div>}
                              <QuoteBreakdownView row={b} assumptionsKey="assumptions" />
                            </div>
                            <button style={{ ...s.primaryBtn, background:"#22c55e", color:"#06210f", padding:".5rem 1rem" }} disabled={busyPick === b.id} onClick={() => pickBid(b.id)}>{busyPick === b.id ? "…" : "Choose"}</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeJob && (activeJob.client_approved_at || activeJob.status === "scheduled" || activeJob.status === "pending_confirmation" || activeJob.status === "completed") && (
                      <div style={{ marginTop:"1rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .07)" }}>
                        <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)", marginBottom:".75rem" }}>Job progress</div>
                        <JobTimeline job={activeJob} />
                      </div>
                    )}

                    {activeJob && activeJob.is_milestone && (
                      <MilestonePanel role="client" job={activeJob} />
                    )}

                    {activeJob && activeJob.payment_status === "disputed" && (
                      <div style={{ marginTop:"1rem", padding:"1rem", borderRadius:"12px", background:"rgba(251,191,36,.08)", border:"1px solid rgba(251,191,36,.35)" }}>
                        <div style={{ fontSize:".9rem", fontWeight:600, color:"var(--ff-warn)", marginBottom:".4rem" }}><Ic name="alert-triangle" size={14} style={{ marginRight:5 }} />Claim filed — under review</div>
                        <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.55 }}>Your payment is <strong>frozen and protected</strong> while our team reviews your claim. The contractor has a few days to respond, then we'll decide. Nothing has been released to them in the meantime. We'll email you as soon as it's resolved.</div>
                      </div>
                    )}

                    {activeJob && activeJob.payment_status !== "disputed" && (
                      <div style={{ marginTop:"1rem", padding:"1rem", borderRadius:"12px", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)" }}>
                        {activeJob.price_change_pending && (
                          <div style={{ marginBottom:"1rem", padding:".9rem", borderRadius:"10px", background:"rgba(251,191,36,.08)", border:"1px solid rgba(251,191,36,.35)" }}>
                            <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".4rem" }}><Ic name="alert-triangle" size={14} style={{ marginRight:4 }} />Your pro proposed a new price</div>
                            <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .85)", lineHeight:1.5, marginBottom:".5rem" }}>
                              {"Current: $" + Number(activeJob.amount ?? 0).toFixed(2) + "  \u2192  New: $" + Number(activeJob.price_change_pending.amount).toFixed(2)}
                              {(() => { const d = Number(activeJob.price_change_pending.amount) - Number(activeJob.amount ?? 0); return d > 0.005 ? "  (you'll pay $" + d.toFixed(2) + " more)" : d < -0.005 ? "  (you'll be refunded $" + Math.abs(d).toFixed(2) + ")" : ""; })()}
                            </div>
                            {activeJob.price_change_pending.reason && (
                              <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.45, marginBottom:".6rem", fontStyle:"italic" as const }}>{"\u201c" + activeJob.price_change_pending.reason + "\u201d"}</div>
                            )}
                            <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                              <button style={s.primaryBtn} disabled={busyReq} onClick={approvePriceChange}>{busyReq ? "…" : (Number(activeJob.price_change_pending.amount) > Number(activeJob.amount ?? 0) + 0.005 ? "Approve & pay difference" : "Approve new price")}</button>
                              <button style={s.btn} disabled={busyReq} onClick={declinePriceChange}>Decline</button>
                            </div>
                          </div>
                        )}
                        {activeJob.status === "assigned" && activeJob.client_rescheduled_at && !activeJob.reschedule_accepted_at && (
                          <div>
                            <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".4rem" }}><Ic name="clock" size={14} style={{ marginRight:4 }} />Waiting for your pro to accept the new time</div>
                            <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>You asked to move this to {activeJob.scheduled_at ? new Date(activeJob.scheduled_at).toLocaleString() : "a new time"}. Your contractor will accept it or suggest another time for you to approve.</div>
                          </div>
                        )}
                        {activeJob.status === "assigned" && activeJob.schedule_proposed_at && !activeJob.client_approved_at && !(activeJob.client_rescheduled_at && !activeJob.reschedule_accepted_at) && (
                          <>
                            <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".4rem" }}>Your contractor proposed a time &amp; price</div>
                            <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", marginBottom:".5rem" }}><Ic name="calendar" size={13} style={{ marginRight:4 }} />{activeJob.scheduled_at ? new Date(activeJob.scheduled_at).toLocaleString() : "—"}{activeJob.amount ? " · $" + activeJob.amount : ""}</div>
                            <QuoteBreakdownView row={activeJob} assumptionsKey="quote_assumptions" />
                            {Array.isArray(activeJob.quote_items) && activeJob.quote_items.length > 0 && (() => {
                              const baseAmt = Number(activeJob.amount ?? 0) - activeJob.quote_items.reduce((t: number, i: any) => t + (i.accepted ? Number(i.amount) || 0 : 0), 0);
                              const addonSum = selAddons.reduce((t, idx) => t + (Number(activeJob.quote_items[idx]?.amount) || 0), 0);
                              return (
                                <div style={{ margin:".6rem 0 .25rem", padding:".7rem .8rem", borderRadius:"10px", background:"rgba(234,107,20,.05)", border:"1px dashed rgba(234,107,20,.35)" }}>
                                  <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .55)", fontWeight:700, marginBottom:".45rem" }}>
                                    <Ic name="sparkles" size={12} color="#ea6b14" style={{ marginRight:4 }} />Optional add-ons
                                  </div>
                                  <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .65)", lineHeight:1.45, marginBottom:".5rem" }}>Your pro offered these extras. Tick any you'd like — they're added to the price. Totally optional.</div>
                                  {activeJob.quote_items.map((it: any, idx: number) => (
                                    <label key={idx} style={{ display:"flex", alignItems:"flex-start", gap:".55rem", padding:".35rem 0", cursor:"pointer" }}>
                                      <input type="checkbox" checked={selAddons.includes(idx)} onChange={() => setSelAddons(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])} style={{ marginTop:"2px", cursor:"pointer", accentColor:"#ea6b14" }} />
                                      <span style={{ flex:1, fontSize:".84rem", lineHeight:1.45, color:"var(--ff-text)" }}>{it.label}</span>
                                      <span style={{ fontSize:".84rem", fontWeight:600, color: selAddons.includes(idx) ? "#ea6b14" : "rgba(var(--ff-muted), .7)" }}>{"+$" + Number(it.amount).toFixed(2)}</span>
                                    </label>
                                  ))}
                                  <div style={{ marginTop:".5rem", paddingTop:".5rem", borderTop:"1px solid rgba(234,107,20,.2)", display:"flex", justifyContent:"space-between", fontSize:".88rem", fontWeight:700 }}>
                                    <span>Total if approved</span>
                                    <span style={{ color:"#ea6b14" }}>{"$" + (Math.round((baseAmt + addonSum) * 100) / 100).toFixed(2)}</span>
                                  </div>
                                </div>
                              );
                            })()}
                            {activeJob.notes && /Price update:/.test(activeJob.notes) && (
                              <div style={{ fontSize:".8rem", color:"var(--ff-warn)", margin:".5rem 0 .75rem", lineHeight:1.45 }}>{activeJob.notes.split("\n").filter((l: string) => l.startsWith("Price update:")).pop()}</div>
                            )}
                            <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                              <button style={s.primaryBtn} disabled={busyReq} onClick={approveSchedule}>{busyReq ? "…" : "Approve & schedule"}</button>
                              <button style={s.btn} disabled={busyReq} onClick={requestReschedule}><Ic name="calendar" size={13} style={{ marginRight:4 }} />Request a different time</button>
                            </div>
                            {showResched && (
                              <div style={{ marginTop:".7rem", padding:".8rem .85rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .1)" }}>
                                <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5, marginBottom:".5rem" }}>Suggest a different day/time. Your contractor gets it as a message and proposes a new time.</div>
                                <textarea value={reschedNote} onChange={e => setReschedNote(e.target.value)} rows={3} placeholder="e.g. Any weekday after 4pm, or this Saturday morning" style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const, marginBottom:".55rem" }} />
                                <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                                  <button style={s.primaryBtn} disabled={busyReq || !reschedNote.trim()} onClick={submitReschedule}>{busyReq ? "…" : "Send suggestion"}</button>
                                  <button style={s.btn} disabled={busyReq} onClick={() => setShowResched(false)}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {activeJob.status === "assigned" && !activeJob.schedule_proposed_at && (
                          <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .75)" }}><Ic name="check-circle" size={14} style={{ marginRight:4 }} />Matched! Waiting for your contractor to propose a time and price.</div>
                        )}
                        {activeJob.status === "scheduled" && !activeJob.is_milestone && (
                          <>
                            <div style={{ fontSize:".85rem", color:"var(--ff-success)", marginBottom: (activeJob.payment_status === "held" || activeJob.payment_status === "released") ? 0 : ".75rem" }}><Ic name="calendar" size={13} style={{ marginRight:4 }} />Scheduled for {activeJob.scheduled_at ? new Date(activeJob.scheduled_at).toLocaleString() : "the agreed time"}{activeJob.amount ? " · $" + activeJob.amount : ""}.</div>
                            <div style={{ margin:".25rem 0 .9rem", padding:".8rem .85rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .1)" }}>
                              {activeJob.client_confirmed_visit_at ? (
                                <div style={{ fontSize:".82rem", color:"var(--ff-success)", lineHeight:1.5 }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />You confirmed this visit. Need to change it? <button onClick={() => setShowChangeTime(v => !v)} style={{ background:"none", border:"none", color:"#ea6b14", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer", padding:0, textDecoration:"underline" }}>Change the time</button></div>
                              ) : (
                                <>
                                  <div style={{ fontSize:".82rem", color:"var(--ff-text)", lineHeight:1.5, marginBottom:".6rem" }}>Is this time still good? Confirm it, or pick a new day/time. The day before is your last easy change.</div>
                                  <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                                    <button style={{ ...s.btn, color:"var(--ff-success)", borderColor:"rgba(34,197,94,.4)", background:"rgba(34,197,94,.1)" }} disabled={busyReq} onClick={confirmVisit}>{busyReq ? "…" : "✓ Confirm this time"}</button>
                                    <button style={s.btn} disabled={busyReq} onClick={() => setShowChangeTime(v => !v)}><Ic name="calendar" size={13} style={{ marginRight:4 }} />Change the time</button>
                                  </div>
                                </>
                              )}
                              {showChangeTime && (
                                <div style={{ marginTop:".7rem" }}>
                                  <div style={{ fontSize:".78rem", color:"var(--ff-warn)", lineHeight:1.5, marginBottom:".5rem" }}><Ic name="alert-triangle" size={12} style={{ marginRight:4 }} />Your pro already blocked off the current time. If you change it, they have to accept the new time and may decline if they're not free — they'll then suggest another time.</div>
                                  <input type="datetime-local" value={newVisitTime} onChange={e => setNewVisitTime(e.target.value)} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, marginBottom:".55rem" }} />
                                  <button style={{ ...s.primaryBtn }} disabled={busyReq || !newVisitTime} onClick={changeVisitTime}>{busyReq ? "…" : "Send new time to my pro"}</button>
                                </div>
                              )}
                            </div>
                            {Array.isArray(activeJob.quote_items) && activeJob.quote_items.some((i: any) => i.accepted) && (
                              <div style={{ margin:".25rem 0 .9rem", padding:".6rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .1)", fontSize:".8rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.5 }}>
                                <Ic name="sparkles" size={12} color="#ea6b14" style={{ marginRight:4 }} />Add-ons included: {activeJob.quote_items.filter((i: any) => i.accepted).map((i: any) => i.label + " (+$" + Number(i.amount).toFixed(2) + ")").join(", ")}
                              </div>
                            )}
                            <div style={{ display:"grid", gap:".6rem", margin:".25rem 0 .9rem" }}>
                              <JobTimer job={activeJob} role="client" />
                              <JobChecklist job={activeJob} role="client" />
                            </div>
                            {(activeJob.payment_status === "held" || activeJob.payment_status === "released") ? (
                              <>
                                <div style={{ fontSize:".82rem", color:"var(--ff-success)", marginBottom:".6rem" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />Payment secured — we'll release it to your contractor once you confirm the work is done.</div>
                                <button style={s.btn} onClick={() => downloadReceipt(activeJob)}><Ic name="download" size={13} style={{ marginRight:4 }} />Download receipt</button>
                              </>
                            ) : activeJob.amount ? (
                              <>
                                {activeJob.payment_status === "failed" && (
                                  <div style={{ fontSize:".82rem", color:"var(--ff-danger)", marginBottom:".6rem", lineHeight:1.5 }}><Ic name="alert-triangle" size={13} style={{ marginRight:4 }} />Your last payment didn't go through. No charge was made — please try again below.</div>
                                )}
                                <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .75)", marginBottom:".6rem", lineHeight:1.5 }}>Pay now to secure the job. Your money is <strong>held safely</strong> and only released to the contractor after you confirm the work is done. {feeText(activeJob)}</div>
                                <button style={s.primaryBtn} disabled={busyPay} onClick={payForJob}>{busyPay ? "Opening checkout…" : "Pay $" + jobTotal(activeJob).toFixed(2) + " (held until you confirm)"}</button>
                              </>
                            ) : null}
                          </>
                        )}
                        {activeJob.status === "pending_confirmation" && !activeJob.is_milestone && (
                          <>
                            <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".4rem" }}>Your contractor marked this complete</div>
                            {completionPhotoUrl && <img src={completionPhotoUrl} alt="Completed work" style={{ width:"100%", maxWidth:"320px", borderRadius:"10px", margin:".5rem 0", display:"block" }} />}
                            <div style={{ display:"grid", gap:".6rem", margin:".25rem 0 .75rem" }}>
                              <JobTimer job={activeJob} role="client" />
                              <JobChecklist job={activeJob} role="client" />
                            </div>
                            {(activeJob.payment_status === "held" || activeJob.payment_status === "released") ? (
                              <>
                                <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", marginBottom:".75rem" }}>Confirm the work is done and we'll release your held payment to the contractor. If you don't, it auto-confirms in a few days.</div>
                                <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                                  <button style={{ ...s.primaryBtn, background:"#22c55e", color:"#06210f" }} disabled={busyReq || !!activeJob.price_change_pending} onClick={confirmCompletion}>{busyReq ? "…" : "✓ Confirm & release payment"}</button>
                                  <button style={{ ...s.btn, color:"var(--ff-warn)", borderColor:"rgba(251,191,36,.35)", background:"rgba(251,191,36,.08)" }} disabled={busyReq} onClick={() => setReportOpen(true)}><Ic name="alert-triangle" size={13} style={{ marginRight:4 }} />File a claim</button>
                                  <button style={s.btn} onClick={() => downloadReceipt(activeJob)}><Ic name="download" size={13} style={{ marginRight:4 }} />Download receipt</button>
                                </div>
                              </>
                            ) : activeJob.amount ? (
                              <>
                                <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", marginBottom:".6rem", lineHeight:1.5 }}>Pay for the job, then confirm. Your payment is held and only released to the contractor once you confirm. {feeText(activeJob)}</div>
                                <button style={s.primaryBtn} disabled={busyPay} onClick={payForJob}>{busyPay ? "Opening checkout…" : "Pay $" + jobTotal(activeJob).toFixed(2) + " now"}</button>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", marginBottom:".75rem" }}>Please confirm the work is done. If you don't, it auto-confirms in a few days.</div>
                                <button style={{ ...s.primaryBtn, background:"#22c55e", color:"#06210f" }} disabled={busyReq || !!activeJob.price_change_pending} onClick={confirmCompletion}>{busyReq ? "…" : "✓ Confirm completion"}</button>
                              </>
                            )}
                          </>
                        )}
                        {activeJob.status === "completed" && (
                          hasReviewed ? (
                            <div style={{ fontSize:".85rem", color:"var(--ff-success)" }}><Ic name="check-circle" size={14} style={{ marginRight:4 }} />Completed — thanks for rating your contractor!</div>
                          ) : (
                            <div>
                              <div style={{ fontSize:".9rem", fontWeight:600, marginBottom:".5rem" }}>Rate your contractor (out of 10)</div>
                              {(["price","experience","result"] as const).map(k => (
                                <div key={k} style={{ marginBottom:".55rem" }}>
                                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", marginBottom:".2rem" }}>
                                    <span style={{ textTransform:"capitalize" as const }}>{k === "result" ? "End result" : k}</span>
                                    <span style={{ color:"#ea6b14", fontWeight:600 }}>{ratingForm[k]}/10</span>
                                  </div>
                                  <input type="range" min={1} max={10} value={ratingForm[k]} onChange={e => setRatingForm(f => ({ ...f, [k]: Number(e.target.value) }))} style={{ width:"100%", accentColor:"#ea6b14" }} />
                                </div>
                              ))}
                              <textarea value={ratingForm.comment} rows={2} placeholder="Optional comment" onChange={e => setRatingForm(f => ({ ...f, comment: e.target.value }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const, margin:".25rem 0 .6rem" }} />
                              <button style={s.primaryBtn} disabled={busyReq} onClick={submitReview}>{busyReq ? "…" : "Submit rating"}</button>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {editingId === activeReq.id ? (
                      <div style={{ marginTop:"1rem", borderTop:"1px solid rgba(var(--ff-fg), .07)", paddingTop:"1rem", display:"flex", flexDirection:"column", gap:".6rem" }}>
                        {([["Service","service"],["Schedule","schedule"],["Location","location"]] as const).map(([label,key]) => (
                          <div key={key}>
                            <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".25rem" }}>{label}</div>
                            <input value={(editForm as any)[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                              style={{ width:"100%", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".88rem", boxSizing:"border-box" as const }} />
                          </div>
                        ))}
                        <div>
                          <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".25rem" }}>Job Description</div>
                          <textarea value={editForm.description} rows={3} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            style={{ width:"100%", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".88rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
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
                        <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .5)" }}>{contractor.specialties?.[0] ?? "Your contractor"}</div>
                      </div>
                      {activeJob && (
                        <button style={{ ...s.btn, marginLeft:"auto", color:"var(--ff-text)", borderColor:"rgba(234,107,20,.35)", background:"rgba(234,107,20,.12)", display:"flex", alignItems:"center", gap:".4rem" }} onClick={() => setChatOpen(true)}>
                          <Ic name="message-square" size={14} />
                          {activeJob.status === "completed" ? "View chat" : "Message " + contractor.first_name}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
        </>
        )}

        {activeTab === "history" && (() => {
                  const histAll = requests.filter(r => r.id !== activeReq?.id);
                  if (histAll.length === 0) return null;
                  const matches = (r: any) =>
                    histFilter === "all" ? true :
                    histFilter === "completed" ? r.status === "completed" :
                    histFilter === "cancelled" ? r.status === "cancelled" :
                    (r.status !== "completed" && r.status !== "cancelled");
                  const filtered = histAll.filter(matches);
                  const shown = filtered.slice(0, histLimit);
                  const FILTERS: { key: typeof histFilter; label: string }[] = [
                    { key: "all", label: "All" },
                    { key: "active", label: "Active" },
                    { key: "completed", label: "Completed" },
                    { key: "cancelled", label: "Cancelled" },
                  ];
                  return (
                    <div style={s.card}>
                      <div style={s.cardTitle}>Request History</div>
                      <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginBottom:"1rem" }}>
                        {FILTERS.map(f => (
                          <button key={f.key} onClick={() => { setHistFilter(f.key); setHistLimit(5); }} style={{ ...s.tab, padding:".4rem .85rem", fontSize:".8rem", ...(histFilter === f.key ? s.activeTab : {}) }}>{f.label}</button>
                        ))}
                      </div>
                      {shown.length === 0 ? (
                        <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .5)", padding:".5rem 0" }}>No {histFilter === "all" ? "" : histFilter + " "}requests to show.</div>
                      ) : shown.map(r => (
                        <div key={r.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:".85rem 0", borderBottom:"1px solid rgba(var(--ff-fg), .06)", gap:"1rem", flexWrap:"wrap" as const }}>
                          <div>
                            <div style={{ fontSize:".9rem" }}>{r.service_needed}</div>
                            <div style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)" }}>{new Date(r.created_at).toLocaleDateString()}</div>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:".75rem" }}>
                            {r.status !== "completed" && r.status !== "cancelled" && (
                              <button style={{ ...s.btn, padding:".3rem .7rem" }} onClick={() => setSelectedReqId(r.id)}>View</button>
                            )}
                            <div style={{ fontSize:".78rem", fontWeight:500, color: STATUS_META[r.status]?.color, whiteSpace:"nowrap" as const }}>
                              <Ic name={STATUS_META[r.status]?.icon as any} size={13} color={STATUS_META[r.status]?.color} style={{ marginRight:4 }} />{STATUS_META[r.status]?.label}
                            </div>
                            {r.status !== "cancelled" && (
                              <button style={{ ...s.btn, padding:".3rem .55rem", color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyReq} onClick={() => removeRequest(r)}><Ic name="trash" size={13} /></button>
                            )}
                          </div>
                        </div>
                      ))}
                      {filtered.length > histLimit && (
                        <button style={{ ...s.btn, marginTop:"1rem" }} onClick={() => setHistLimit(l => l + 5)}>Show more ({filtered.length - histLimit})</button>
                      )}
                    </div>
                  );
                })()}
      </div>
        </div>
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
      {claimOpen && profile && (
        <FileClaimModal
          jobs={claimJobs}
          userId={profile.id}
          onClose={() => setClaimOpen(false)}
          onSubmitted={() => notify("Claim submitted — we'll review it.", "ok")}
        />
      )}
      <ConfirmDialog state={confirmState} onClose={(ok) => { confirmState?.resolve(ok); setConfirmState(null); }} />
    </div>
  );
}
