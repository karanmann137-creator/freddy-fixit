import { Ic } from "@/components/Ic";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { validateEmail } from "@/lib/emailValidation";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import ProfileBar from "@/components/ProfileBar";
import MilestonePanel from "@/components/MilestonePanel";
import ContractPanel from "@/components/ContractPanel";
import DashboardSidebar, { type SidebarItem, type SidebarAction } from "@/components/DashboardSidebar";
import NotificationBell from "@/components/NotificationBell";
import AdminMessageModal, { type MsgRecipient } from "@/components/AdminMessageModal";
import JobChat from "@/components/JobChat";
import { jobCode } from "@/lib/jobCode";
import { DASH_NAV_EVENT, readDashNavFromUrl, clearDashNavFromUrl, type DashNavDetail } from "@/lib/notificationRoutes";
import { needsFor, pendingText, disabledText } from "@/lib/stripeRequirements";
import { clearPlatformStatusCache, DEFAULT_NOTICE, type PlatformMode, type PlatformNotice } from "@/lib/platformStatus";

// Re-signup flagging is computed server-side by admin_resignup_matches().
// The Accounts tab lists every auth user (via admin_list_accounts) so the admin
// can see full details and fully delete any account (admin-delete-account edge
// fn wipes jobs, requests, messages, reviews, storage + the login).

const ADMIN_NAV: SidebarItem[] = [
  { key: "health",   label: "Health",   icon: "check" },
  { key: "platform", label: "Platform", icon: "settings" },
  { key: "requests", label: "Requests", icon: "clipboard-list" },
  { key: "jobs",     label: "Jobs",     icon: "briefcase" },
  { key: "picks",    label: "Picks",    icon: "star" },
  { key: "accounts", label: "Accounts", icon: "user" },
  { key: "flagged",  label: "Flagged chat", icon: "message-square" },
  { key: "disputes", label: "Disputes", icon: "alert-triangle" },
  { key: "prepaid",  label: "Prepaid",  icon: "dollar" },
  { key: "leads",    label: "Leads",    icon: "user-check" },
];

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [tab, setTab] = useState<"health"|"platform"|"requests"|"jobs"|"picks"|"accounts"|"flagged"|"disputes"|"prepaid"|"leads">("requests");
  const [prepays, setPrepays] = useState<any[]>([]);
  const [busyRefund, setBusyRefund] = useState<string|null>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [busyLead, setBusyLead] = useState<string|null>(null);
  const [health, setHealth] = useState<any>(null);
  const [disputePhotos, setDisputePhotos] = useState<Record<string, string[]>>({});
  const [disputeRespPhotos, setDisputeRespPhotos] = useState<Record<string, string[]>>({});
  const [busyResolve, setBusyResolve] = useState<string|null>(null);
  const [partialAmt, setPartialAmt] = useState<Record<string, string>>({});
  const [resolveNote, setResolveNote] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [healthFailed, setHealthFailed] = useState(false);
  const [busyStatus, setBusyStatus] = useState<string|null>(null); // contractor id whose status is toggling
  const [busyDelete, setBusyDelete] = useState(false);
  const [busyDeleteAccount, setBusyDeleteAccount] = useState<string|null>(null);
  const [busyNudge, setBusyNudge] = useState(false);
  const [busyRefire, setBusyRefire] = useState<string|null>(null); // request id being re-sent
  // Live Stripe payout diagnosis, keyed by contractor id. Fetched on demand
  // (one Stripe API call each) so the owner can see exactly what a stuck
  // contractor still owes Stripe without asking them.
  const [payoutCheck, setPayoutCheck] = useState<Record<string, { needs: string[]; pending: string[]; disabled: string|null; error?: string }>>({});
  const [busyPayoutCheck, setBusyPayoutCheck] = useState<string|null>(null);
  const [busyJob, setBusyJob] = useState<string|null>(null);
  // Read any job's chat. RLS already grants an admin full access to messages; the
  // drawer is opened with role="admin", which makes it read-only and — crucially —
  // stops it clearing the real recipient's unread badge.
  const [chatJob, setChatJob] = useState<any>(null);
  const [bidsBy, setBidsBy] = useState<Record<string, any[]>>({});
  // Who got picked for what, newest first. Built from jobs (not bids) so it also
  // covers rehires and admin assignments, where no bid was ever accepted.
  const [picks, setPicks] = useState<any[]>([]);
  // Messages the chat guard refused to deliver. The row still exists (that's the
  // evidence); RLS keeps it hidden from everyone but the sender and an admin.
  const [chatFlags, setChatFlags] = useState<any[]>([]);
  const [flagMatches, setFlagMatches] = useState<Record<string, { fields: string[]; avg: number; count: number; date: string }>>({});
  const [accountQ, setAccountQ] = useState("");
  const [accountRole, setAccountRole] = useState<"all"|"client"|"contractor"|"admin"|"orphaned">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [msgRecipients, setMsgRecipients] = useState<MsgRecipient[] | null>(null);
  const [editEmailId, setEditEmailId] = useState<string|null>(null);
  const [editEmailVal, setEditEmailVal] = useState("");
  const [busyEmailEdit, setBusyEmailEdit] = useState<string|null>(null);
  // ── Platform mode ───────────────────────────────────────────────────────────
  // While the site is paused or in waitlist mode, new client requests are held
  // instead of dispatched. The DB trigger enforce_platform_pause is the real
  // gate; this tab is the switch and the review queue for what got held.
  const [platMode, setPlatMode] = useState<PlatformMode>("open");
  const [noticeDraft, setNoticeDraft] = useState<PlatformNotice>(DEFAULT_NOTICE);
  const [heldReqs, setHeldReqs] = useState<any[]>([]);
  const [waitlistRows, setWaitlistRows] = useState<any[]>([]);
  const [heldSel, setHeldSel] = useState<Set<string>>(new Set());
  const [busyPlatform, setBusyPlatform] = useState(false);
  const [busyRelease, setBusyRelease] = useState(false);
  const PAGE_SIZE = 20;
  const [page, setPage] = useState<{ requests: number; jobs: number }>({ requests: 0, jobs: 0 });
  const [counts, setCounts] = useState<{ requests: number; jobs: number }>({ requests: 0, jobs: 0 });
  const [me, setMe] = useState<{ id: string; first_name?: string } | null>(null);

  const handleSignOut = async () => { await supabase.auth.signOut(); setLocation("/"); };

  // ── Notification deep links ─────────────────────────────────────────────────
  // Tapping a 🔔 lands here two ways: from another page it navigates with ?tab=,
  // and from this page (where the bell lives) wouter treats the same path as a
  // no-op, so the bell fires ff:dash-nav instead.
  useEffect(() => {
    const apply = (d: DashNavDetail) => {
      if (d.tab && ADMIN_NAV.some(i => i.key === d.tab)) setTab(d.tab as any);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const first = readDashNavFromUrl();
    if (first.tab || first.jobId) { apply(first); clearDashNavFromUrl(); }
    const onNav = (e: Event) => apply((e as CustomEvent<DashNavDetail>).detail ?? {});
    window.addEventListener(DASH_NAV_EVENT, onNav);
    return () => window.removeEventListener(DASH_NAV_EVENT, onNav);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setLocation("/login"); return; }
      const uid = data.session.user.id;
      const { data: prof } = await supabase.from("profiles").select("id, first_name").eq("id", uid).maybeSingle();
      setMe(prof ?? { id: uid });
    });
  }, []);

  // Reload whenever any tab's page changes (also fires once on mount).
  useEffect(() => { loadAll(); }, [page]);

  const loadAll = async () => {
    setLoading(true);
    setLoadError("");
    try {
    const rRange: [number, number] = [page.requests * PAGE_SIZE, page.requests * PAGE_SIZE + PAGE_SIZE - 1];
    const jRange: [number, number] = [page.jobs * PAGE_SIZE, page.jobs * PAGE_SIZE + PAGE_SIZE - 1];
    const results = await Promise.all([
      supabase.from("client_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(rRange[0], rRange[1]),
      // Embed the request + both parties so a job card reads without cross-referencing.
      supabase.from("jobs").select("*, request:client_requests!jobs_request_id_fkey(service_needed, location), client:profiles!jobs_client_id_fkey(first_name, last_name), pro:profiles!jobs_contractor_id_fkey(first_name, last_name)", { count: "exact" }).order("created_at", { ascending: false }).range(jRange[0], jRange[1]),
      supabase.rpc("admin_list_accounts"),
      // ALL bids, not just pending — otherwise the winning bid vanishes the moment
      // the client picks it and the request card can only say "Assigned".
      supabase.from("bids").select("*").order("amount", { ascending: true }),
      supabase.rpc("admin_resignup_matches"),
      supabase.from("disputes").select("*, job:jobs(id, amount, total_charged, contractor_payout, status, payment_status, stripe_payment_intent_id)").order("created_at", { ascending: false }),
      supabase.from("quote_leads").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("admin_health"),
    ]);
    // Surface query failures instead of silently rendering empty tabs.
    const failed = results.map((r: any, i: number) => r?.error ? ["requests","jobs","accounts","bids","re-signup flags","disputes","leads","health"][i] : null).filter(Boolean);
    if (failed.length) setLoadError("Some data failed to load (" + failed.join(", ") + ") — what's shown may be incomplete.");
    const [{ data: reqs, count: reqCount }, { data: js, count: jobCount }, { data: accts }, { data: bids }, { data: resignup }, { data: disp }, { data: leadsData }, { data: healthData, error: healthErr }] = results as any[];
    setRequests(reqs ?? []);
    setHealthFailed(!!healthErr);
    setJobs(js ?? []);
    setAccounts((accts as any[]) ?? []);
    setDisputes(disp ?? []);
    setLeads(leadsData ?? []);
    setHealth(healthData ?? null);
    // Recurring prepay pools (admin RLS = read all) for the Prepaid tab.
    try {
      const { data: pp } = await supabase.from("recurring_prepayments")
        .select("*, plan:client_requests!recurring_prepayments_plan_request_id_fkey(service_needed), client:profiles!recurring_prepayments_client_id_fkey(first_name,last_name)")
        .order("created_at", { ascending: false });
      setPrepays(pp ?? []);
    } catch { setPrepays([]); }
    // Picks feed. Its own try/catch so an older DB without the RPC still loads
    // every other tab instead of failing the whole dashboard.
    try {
      const { data: pk } = await supabase.rpc("admin_list_picks", { p_limit: 200 });
      setPicks((pk as any[]) ?? []);
    } catch { setPicks([]); }
    // Blocked chat messages, same defensive pattern.
    try {
      const { data: cf } = await supabase.rpc("admin_list_chat_flags", { p_limit: 200 });
      setChatFlags((cf as any[]) ?? []);
    } catch { setChatFlags([]); }
    // Platform mode + everything the pause is holding. Three separate try/catch
    // blocks so a DB that predates any one of them still renders the rest.
    try {
      const { data: ps } = await supabase.rpc("platform_status");
      const m = (ps as any)?.mode;
      if (m === "open" || m === "paused" || m === "waitlist") setPlatMode(m);
      const n = (ps as any)?.notice;
      if (n && typeof n === "object") {
        setNoticeDraft({
          headline: String(n.headline ?? DEFAULT_NOTICE.headline),
          body:     String(n.body     ?? DEFAULT_NOTICE.body),
          cta:      String(n.cta      ?? DEFAULT_NOTICE.cta),
          // `??` and not `||` on purpose: a saved empty string means the owner
          // switched the detail panel off, and `||` would keep resurrecting the
          // default copy they had just cleared.
          details:  String(n.details  ?? DEFAULT_NOTICE.details),
        });
      }
    } catch { /* leave the defaults — the tab still renders */ }
    try {
      const { data: wl } = await supabase.rpc("admin_list_waitlisted", { p_limit: 200 });
      setHeldReqs((wl as any[]) ?? []);
    } catch { setHeldReqs([]); }
    try {
      const { data: wr } = await supabase.from("waitlist")
        .select("id, name, email, phone, service, description, source, created_at, notified_at")
        .order("created_at", { ascending: false }).limit(200);
      setWaitlistRows(wr ?? []);
    } catch { setWaitlistRows([]); }
    // Resolve signed URLs for all dispute photos (problem-photos is private). Both
    // the claim photos and the contractor-response photos are signed in a single
    // parallel pass instead of two sequential per-dispute loops.
    const sign = (paths: string[]) => Promise.all((paths ?? []).map((pp: string) =>
      supabase.storage.from("problem-photos").createSignedUrl(pp, 3600)
        .then(({ data }) => data?.signedUrl).catch(() => null)));
    const dp: Record<string, string[]> = {};
    const rp: Record<string, string[]> = {};
    await Promise.all((disp ?? []).flatMap((d: any) => [
      (d.photo_paths?.length ? sign(d.photo_paths).then(u => { dp[d.id] = u.filter(Boolean) as string[]; }) : Promise.resolve()),
      (d.contractor_response_photos?.length ? sign(d.contractor_response_photos).then(u => { rp[d.id] = u.filter(Boolean) as string[]; }) : Promise.resolve()),
    ]));
    setDisputePhotos(dp);
    setDisputeRespPhotos(rp);
    setCounts({ requests: reqCount ?? 0, jobs: jobCount ?? 0 });
    const bb: Record<string, any[]> = {};
    (bids ?? []).forEach((b: any) => { if (!bb[b.request_id]) bb[b.request_id] = []; bb[b.request_id].push(b); });
    setBidsBy(bb);

    // Likely re-signups of deleted, poorly-rated accounts — matched server-side
    // by admin_resignup_matches() (hashes built and joined in SQL).
    const fm: Record<string, { fields: string[]; avg: number; count: number; date: string }> = {};
    for (const r of (resignup ?? [])) {
      fm[r.contractor_id] = { fields: r.fields ?? [], avg: r.avg_score, count: r.review_count, date: r.deleted_at };
    }
    setFlagMatches(fm);
    } catch (e) {
      console.error("AdminDashboard loadAll error:", e);
      setLoadError("Couldn't load the dashboard — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const pageCount = (which: "requests"|"jobs") => Math.max(1, Math.ceil((counts[which] || 0) / PAGE_SIZE));
  const pager = (which: "requests"|"jobs") => (
    counts[which] > PAGE_SIZE ? (
      <div style={{ display:"flex", gap:".75rem", alignItems:"center", justifyContent:"center", marginTop:"1.25rem" }}>
        <button style={{ ...s.btn, opacity: page[which] <= 0 ? .4 : 1 }} disabled={page[which] <= 0}
          onClick={() => setPage(p => ({ ...p, [which]: Math.max(0, p[which] - 1) }))}>← Prev</button>
        <span style={{ color:"rgba(var(--ff-muted), .6)", fontSize:".82rem" }}>Page {page[which] + 1} of {pageCount(which)}</span>
        <button style={{ ...s.btn, opacity: page[which] >= pageCount(which) - 1 ? .4 : 1 }} disabled={page[which] >= pageCount(which) - 1}
          onClick={() => setPage(p => ({ ...p, [which]: p[which] + 1 }))}>Next →</button>
      </div>
    ) : null
  );

  const nameFor = (id: string) => {
    const a = accounts.find(x => x.id === id);
    if (!a) return "Contractor";
    return ((a.first_name ?? "") + " " + (a.last_name ? a.last_name[0] + "." : "")).trim() || a.company_name || "Contractor";
  };

  /** Name off an embedded profiles row (jobs query joins client + pro). */
  const pname = (p: any, fallback: string) =>
    (((p?.first_name ?? "") + " " + (p?.last_name ? p.last_name[0] + "." : "")).trim()) || fallback;

  const deleteRequest = async (r: any) => {
    if (!window.confirm("Delete this request permanently? This also removes any assigned job and its messages.")) return;
    setBusyDelete(true);
    const { error } = await supabase.rpc("admin_delete_request", { p_request_id: r.id });
    setBusyDelete(false);
    if (error) { alert("Couldn't delete: " + error.message); return; }
    setRequests(prev => prev.filter(x => x.id !== r.id));
  };

  // Re-send the new-job email for a request that stalled. This normally happens by
  // itself at 24h and again at 48h while the request is under 3 bids; the button is
  // the manual override and deliberately ignores that two-nudge cap.
  //
  // admin_refire_request resets `dispatched_to` down to the pros who already bid
  // before re-invoking dispatch-job, so a pro who has already quoted is never
  // nudged about it and everyone else is emailed exactly once per press.
  const refireRequest = async (r: any) => {
    if (!window.confirm(
      "Re-send this job to every matching contractor who hasn't bid on it yet?\n\n" +
      "Pros who already sent an estimate won't be emailed again."
    )) return;
    setBusyRefire(r.id);
    try {
      const { data, error } = await supabase.rpc("admin_refire_request", { p_request_id: r.id });
      if (error) throw error;
      const reached = Number((data as any)?.reached ?? 0);
      const count   = Number((data as any)?.refire_count ?? 0);
      setRequests(prev => prev.map(x => x.id === r.id ? { ...x, refire_count: count } : x));
      alert(reached === 0
        ? "Nothing sent — every matching contractor has either already bid on this job or hidden it from their feed."
        : `Re-sent to ${reached} contractor${reached === 1 ? "" : "s"}.`);
    } catch (e: any) {
      alert("Couldn't re-send: " + (e?.message || String(e)));
    } finally { setBusyRefire(null); }
  };

  const deleteJob = async (j: any) => {
    if (!window.confirm("Delete this job permanently? This also removes its milestones, messages, reviews and disputes. This can't be undone.")) return;
    setBusyJob(j.id);
    const { error } = await supabase.rpc("admin_delete_job", { p_job_id: j.id });
    setBusyJob(null);
    if (error) { alert("Couldn't delete job: " + error.message); return; }
    setJobs(prev => prev.filter(x => x.id !== j.id));
  };

  const deleteAccount = async (a: any) => {
    const who = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.email || a.id.slice(0, 8);
    if (!window.confirm(`Permanently delete ${who} and ALL of their data — jobs, requests, messages, reviews, photos and their login. This cannot be undone.`)) return;
    setBusyDeleteAccount(a.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-account", { body: { user_id: a.id } });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      setAccounts(prev => prev.filter(x => x.id !== a.id));
      if (data && (data as any).warning) alert((data as any).warning);
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Couldn't delete account: " + msg);
    } finally { setBusyDeleteAccount(null); }
  };

  const setContractorStatus = async (contractorId: string, status: "active"|"inactive") => {
    setBusyStatus(contractorId);
    const { error } = await supabase.rpc("admin_set_contractor_status", { p_id: contractorId, p_status: status });
    setBusyStatus(null);
    if (error) { alert("Couldn't update contractor: " + error.message); return; }
    setAccounts(prev => prev.map(a => a.id === contractorId ? { ...a, contractor_status: status } : a));
  };

  // Open a private contractor document (ID / insurance / WCB / trade cert) via a
  // short-lived signed URL. Admins can read the private contractor-docs bucket (RLS).
  const openDoc = async (path: string) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from("contractor-docs").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { alert("Couldn't open that document — it may not have been uploaded."); return; }
    window.open(data.signedUrl, "_blank");
  };
  // Public buckets (contractor-photos / portfolio-photos) — direct public URL.
  const pubUrl = (bucket: string, path: string) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const DOC_LABELS: Record<string, string> = {
    gov_id: "Government photo ID", insurance: "Insurance certificate",
    wcb: "WCB coverage", certification: "Trade certification",
  };

  // Email every orphaned/incomplete account (authenticated but never finished
  // onboarding) a "finish your signup" nudge. Reusable for future OAuth orphans.
  const nudgeIncomplete = async () => {
    const n = accounts.filter(a => a.orphaned).length;
    if (n === 0) { alert("No incomplete/orphaned accounts to email right now."); return; }
    if (!window.confirm(`Email ${n} incomplete signup${n>1?"s":""} a friendly "finish your account" nudge?`)) return;
    setBusyNudge(true);
    try {
      const { data, error } = await supabase.functions.invoke("finish-signup-nudge", { body: { confirm: "SEND" } });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      const sent = (data as any)?.sent ?? 0, failed = (data as any)?.failed ?? 0;
      alert(`Sent ${sent} reminder${sent!==1?"s":""}${failed?`, ${failed} failed`:""}.`);
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Couldn't send reminders: " + msg);
    } finally { setBusyNudge(false); }
  };

  // Ask Stripe (live) what this contractor still owes before payouts can start.
  // refresh-connect-status accepts { contractor_id } for admins only.
  const checkPayout = async (id: string) => {
    setBusyPayoutCheck(id);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-connect-status", { body: { contractor_id: id } });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      const d = data as any;
      setPayoutCheck(p => ({ ...p, [id]: {
        needs: Array.isArray(d.requirements) ? d.requirements : [],
        pending: Array.isArray(d.pending_verification) ? d.pending_verification : [],
        disabled: d.disabled_reason ?? null,
      }}));
      // Keep the roster row honest if Stripe says they're actually done now.
      if (d.payouts_enabled) setAccounts(as => as.map(a => a.id === id ? { ...a, stripe_payouts_enabled: true } : a));
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      setPayoutCheck(p => ({ ...p, [id]: { needs: [], pending: [], disabled: null, error: msg } }));
    } finally { setBusyPayoutCheck(null); }
  };

  // Admin changes an account's login (auth) email and keeps profiles.email in
  // sync via the admin-update-email edge fn (admin-gated, dup-checked server-side).
  const saveEmail = async (a: any) => {
    const next = editEmailVal.trim().toLowerCase();
    if (!next) { alert("Enter an email address."); return; }
    { const ev = validateEmail(next); if (!ev.ok && !window.confirm(ev.error + "\n\nUse this email anyway?")) return; }
    if (next === (a.email || "").toLowerCase()) { setEditEmailId(null); return; }
    setBusyEmailEdit(a.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-update-email", { body: { user_id: a.id, new_email: next } });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      setAccounts(prev => prev.map(x => x.id === a.id ? { ...x, email: next } : x));
      setEditEmailId(null);
      alert("Login email updated to " + next + ".");
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Couldn't update email: " + msg);
    } finally { setBusyEmailEdit(null); }
  };

  const markLeadContacted = async (leadId: string) => {
    setBusyLead(leadId);
    const { error } = await supabase.from("quote_leads").update({ status: "contacted" }).eq("id", leadId);
    setBusyLead(null);
    if (error) { alert("Couldn't update lead: " + error.message); return; }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: "contacted" } : l));
  };

  const refundPrepay = async (pp: any) => {
    if (!confirm("Refund the client's unreleased prepaid visits? Already-completed visits stay paid to the pro. This can't be undone.")) return;
    setBusyRefund(pp.id);
    try {
      const { data, error } = await supabase.functions.invoke("refund-recurring-prepayment", { body: { prepay_id: pp.id } });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      await loadAll();
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Couldn't refund: " + msg);
    } finally { setBusyRefund(null); }
  };

  const resolveDispute = async (d: any, action: "refund_full"|"refund_partial"|"release") => {
    let refund_amount: number | undefined;
    if (action === "refund_partial") {
      refund_amount = Number(partialAmt[d.id]);
      if (!refund_amount || refund_amount <= 0) { alert("Enter a partial refund amount first."); return; }
    }
    const labels: Record<string, string> = {
      refund_full: "Refund the client in full",
      refund_partial: `Refund $${refund_amount} to the client (contractor still gets paid)`,
      release: "Release the held payment to the contractor (dispute not upheld)",
    };
    if (!window.confirm(`${labels[action]}?\n\nThis moves real money and can't be undone.`)) return;
    setBusyResolve(d.id);
    const { data, error } = await supabase.functions.invoke("resolve-dispute", {
      body: { dispute_id: d.id, action, refund_amount, note: resolveNote[d.id] || undefined },
    });
    setBusyResolve(null);
    if (error || data?.error) {
      let msg = error?.message || data?.error || "Unknown error";
      try { if (error?.context?.json) { const b = await error.context.json(); if (b?.error) msg = b.error; } } catch {}
      alert("Couldn't resolve dispute: " + msg);
      return;
    }
    await loadAll();
  };

  // ── Platform mode handlers ──────────────────────────────────────────────────
  // set_platform_mode is admin-gated in the DB and returns the new
  // platform_status(), so we patch local state from the response rather than
  // trusting what we sent. clearPlatformStatusCache() is essential: every other
  // surface (the banner, both client gates) caches the status once per session.
  const applyMode = async (mode: PlatformMode, notice: PlatformNotice) => {
    const { data, error } = await supabase.rpc("set_platform_mode", {
      p_mode: mode,
      // `details` MUST be listed. set_platform_mode overwrites the whole
      // pause_notice blob, so any key missing here is deleted from the DB — and
      // changeMode() passes the live draft through this same path, meaning a
      // simple Open/Paused toggle would otherwise erase the panel copy.
      p_notice: { headline: notice.headline, body: notice.body, cta: notice.cta, details: notice.details },
    });
    if (error) throw error;
    clearPlatformStatusCache();
    const m = (data as any)?.mode;
    if (m === "open" || m === "paused" || m === "waitlist") setPlatMode(m);
    const n = (data as any)?.notice;
    if (n && typeof n === "object") {
      setNoticeDraft({
        headline: String(n.headline ?? notice.headline),
        body:     String(n.body     ?? notice.body),
        cta:      String(n.cta      ?? notice.cta),
        details:  String(n.details  ?? notice.details),
      });
    }
    return data;
  };

  const changeMode = async (mode: PlatformMode) => {
    if (mode === platMode) return;
    const warn = mode === "open"
      ? "Reopen the site to new client requests?\n\nThe overhaul banner disappears and new requests dispatch to contractors immediately.\n\nAnything already held stays held until you release it below."
      : mode === "waitlist"
      ? "Switch to WAITLIST mode?\n\nClients can still describe their job, but it's captured instead of sent to contractors. Nobody gets emailed.\n\nContractors can still sign up and browse."
      : "PAUSE the site?\n\nNew client requests stop entirely and the overhaul notice shows site-wide.\n\nContractors can still sign up and browse.";
    if (!window.confirm(warn)) return;
    setBusyPlatform(true);
    try {
      await applyMode(mode, noticeDraft);
      alert(mode === "open" ? "Site is open. New requests dispatch normally again."
          : mode === "waitlist" ? "Waitlist mode is on. New requests are captured, not dispatched."
          : "Site is paused. New client requests are blocked.");
    } catch (e: any) {
      alert("Couldn't change the mode: " + (e?.message || String(e)));
    } finally { setBusyPlatform(false); }
  };

  const saveNotice = async () => {
    if (!noticeDraft.headline.trim() || !noticeDraft.body.trim() || !noticeDraft.cta.trim()) {
      alert("Headline, message and button text all need something in them."); return;
    }
    setBusyPlatform(true);
    try {
      await applyMode(platMode, {
        headline: noticeDraft.headline.trim(),
        body:     noticeDraft.body.trim(),
        cta:      noticeDraft.cta.trim(),
        // Deliberately NOT in the required check above. An empty details box is
        // a real choice — it turns the "why are you paused?" panel off and the
        // strip goes back to being unpressable. It must still be SENT, though:
        // set_platform_mode replaces the whole notice blob, so omitting this key
        // would silently wipe the panel copy every time the owner touched a
        // headline.
        details:  noticeDraft.details.trim(),
      });
      alert("Saved. Anyone who loads the site from now on sees the new wording.");
    } catch (e: any) {
      alert("Couldn't save the wording: " + (e?.message || String(e)));
    } finally { setBusyPlatform(false); }
  };

  // Releasing sends held requests through the normal dispatch path — contractors
  // get emailed. All four arguments are passed explicitly: leaning on PostgREST
  // to fill defaults risks overload ambiguity if the signature ever changes.
  const releaseHeld = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(
      `Release ${ids.length} held request${ids.length === 1 ? "" : "s"} to contractors?\n\n` +
      "Matching contractors get emailed straight away. This can't be undone."
    )) return;
    setBusyRelease(true);
    try {
      const { data, error } = await supabase.rpc("release_waitlisted_requests", {
        p_ids: ids, p_max: ids.length, p_max_age_days: 3650, p_dispatch: true,
      });
      if (error) throw error;
      const n = Number((data as any)?.released ?? ids.length);
      setHeldReqs(prev => prev.filter(r => !ids.includes(r.id)));
      setHeldSel(new Set());
      alert(n === 0
        ? "Nothing was released — those requests may have already gone out."
        : `Released ${n} request${n === 1 ? "" : "s"}. Matching contractors have been emailed.`);
    } catch (e: any) {
      alert("Couldn't release: " + (e?.message || String(e)));
    } finally { setBusyRelease(false); }
  };

  const s = { wrap: { minHeight:"100vh", background:"var(--ff-bg)", backgroundImage:"radial-gradient(ellipse 60% 30% at 80% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), radial-gradient(rgba(var(--ff-fg), 0.025) 1px, transparent 1px)", backgroundSize:"auto, 22px 22px", backgroundAttachment:"fixed", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" }, header: { background:"var(--ff-card-bg)", borderBottom:"1px solid rgba(var(--ff-fg), .07)", padding:"1rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center" }, logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:".1em" }, content: { maxWidth:"1000px", margin:"0 auto", padding:"clamp(1rem, 4vw, 2rem) clamp(.75rem, 3vw, 1.5rem)" }, tabs: { display:"flex", gap:".5rem", marginBottom:"1.5rem", flexWrap:"wrap" as const }, tab: { padding:".6rem 1.2rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px", color:"rgba(var(--ff-muted), .6)", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem" }, activeTab: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.4)", color:"var(--ff-text)" }, card: { background:"var(--ff-card-bg)", border:"1px solid var(--ff-card-border)", borderRadius:"12px", padding:"1.25rem", marginBottom:"1rem" }, title: { fontSize:".95rem", fontWeight:500, color:"var(--ff-text)", marginBottom:".35rem" }, meta: { fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginBottom:".2rem" }, badge: { fontSize:".75rem", fontWeight:500, color:"#ea6b14" }, btn: { padding:".5rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"6px", color:"rgba(var(--ff-muted), .7)", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" } };

  if (loading) return <div style={{ ...s.wrap, display:"flex", alignItems:"center", justifyContent:"center" }}>Loading…</div>;

  const roleChip = (role?: string) => {
    const r = role || "—";
    const col = r === "admin" ? "#ea6b14" : r === "contractor" ? "var(--ff-info)" : r === "client" ? "var(--ff-success)" : "rgba(var(--ff-muted), .5)";
    return <span style={{ fontSize:".72rem", fontWeight:600, color: col, textTransform:"capitalize" as const }}>● {r}</span>;
  };

  const openDisputes = disputes.filter(d => d.status === "open").length;
  const newLeads = leads.filter(l => l.status === "new").length;
  const healthAlerts = health ? ((health.no_bid_count||0) + (health.awaiting_confirm_count||0) + (health.awaiting_approval_count||0) + (health.stale_disputes_count||0)) : 0;
  const navItems: SidebarItem[] = ADMIN_NAV.map(it => ({
    ...it,
    badge: it.key === "health"   ? (healthAlerts || undefined)
         : it.key === "platform" ? (heldReqs.length || undefined)
         : it.key === "requests" ? (counts.requests || undefined)
         : it.key === "jobs"     ? (counts.jobs || undefined)
         : it.key === "picks"    ? (picks.length || undefined)
         : it.key === "flagged"  ? (chatFlags.length || undefined)
         : it.key === "accounts" ? (accounts.length || undefined)
         : it.key === "disputes" ? (openDisputes || undefined)
         : it.key === "prepaid"  ? (prepays.length || undefined)
         : it.key === "leads"    ? (newLeads || undefined)
         : undefined,
  }));

  const filteredAccounts = accounts.filter(a => {
    if (accountRole !== "all") {
      if (accountRole === "orphaned") { if (!a.orphaned) return false; }
      else if ((a.role || "") !== accountRole) return false;
    }
    const q = accountQ.trim().toLowerCase();
    if (q) {
      const hay = [a.first_name, a.last_name, a.email, a.phone, a.meta_phone, a.company_name].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Any account with an email on file is an eligible email target (clients + contractors).
  const isContractorAcct = (a: any) =>
    (a.role === "contractor") || !!a.company_name || (a.specialties && a.specialties.length);
  const isClientAcct = (a: any) => !isContractorAcct(a) && a.role !== "admin";
  const toRecipient = (a: any): MsgRecipient => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(" ") || a.company_name || a.email || "account",
    email: a.email,
  });
  const contractorAccts = accounts.filter(a => isContractorAcct(a) && a.email);
  const clientAccts = accounts.filter(a => isClientAcct(a) && a.email);
  const selectedRecipients = () =>
    accounts.filter(a => selectedIds.has(a.id) && a.email).map(toRecipient);
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div style={s.wrap} className="ffdash">
      <style>{".ffdash button{transition:filter .12s ease, transform .08s ease, opacity .12s ease} .ffdash button:hover:not(:disabled){filter:brightness(1.09)} .ffdash button:active:not(:disabled){transform:translateY(1px)} .ffdash button:disabled{opacity:.55; cursor:not-allowed}"}</style>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ height: "3.75rem" }} />
      <div style={{ display:"flex", alignItems:"flex-start" as const }}>
        <DashboardSidebar
          items={navItems}
          active={tab}
          onSelect={(k) => setTab(k as any)}
          title="Admin"
          bell={me?.id ? <NotificationBell userId={me.id} dashboardPath="/admin-dashboard" /> : undefined}
          actions={[
            { key: "logout", label: "Log out", icon: "door", onClick: handleSignOut, danger: true },
          ] as SidebarAction[]}
        />
        <div style={{ flex:1, minWidth:0 }}>

      <div style={s.header}>
        <div>
          <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.7rem", letterSpacing:".02em", margin:0, lineHeight:1.1 }}>
            Welcome{me?.first_name ? ", " + me.first_name : ""} <span style={{ fontSize:".6rem", background:"#ea6b14", color:"#fff", borderRadius:"4px", padding:".15rem .45rem", verticalAlign:"middle", letterSpacing:".05em" }}>ADMIN</span>
          </h1>
          <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .6)", marginTop:".2rem" }}>Manage requests, jobs, accounts and disputes.</div>
        </div>
      </div>

      {loadError && (
        <div style={{ margin:"1rem 1.5rem 0", padding:".8rem 1rem", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.4)", borderRadius:"10px", display:"flex", alignItems:"center", gap:".75rem", flexWrap:"wrap" }}>
          <span style={{ fontSize:".85rem", color:"var(--ff-text)" }}>{loadError}</span>
          <button style={{ ...s.btn, borderColor:"rgba(239,68,68,.5)" }} onClick={() => loadAll()}>Retry</button>
        </div>
      )}

      <div style={s.content}>
        <ProfileBar role="admin" />

        {tab === "requests" && (
          <div>
            {requests.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No requests yet.</p>}
            {requests.map(r => (
              <div key={r.id} style={s.card}>
                <div style={s.title}>{r.service_needed}</div>
                <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{r.first_name} {r.last_name} · <Ic name="phone" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.phone}</div>
                <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location} · <Ic name="timer" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.preferred_schedule}</div>
                <div style={s.meta}>{r.job_description}</div>
                <div style={{ ...s.badge, marginTop:".5rem" }}>● {r.status}</div>
                {/* Bid history stays visible AFTER the pick — the winner is marked and the
                    others are dimmed, so it's obvious who the client chose and who they passed on. */}
                {(bidsBy[r.id]?.length ?? 0) > 0 && (() => {
                  const bids = bidsBy[r.id];
                  const picked = bids.find((b: any) => b.status === "accepted");
                  return (
                    <div style={{ marginTop:".75rem" }}>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)", marginBottom:".4rem" }}>
                        {r.status === "pending" ? `Bids (${bids.length}/7)` : `Bids (${bids.length})`}
                      </div>
                      {bids.map((b: any) => {
                        const won  = b.status === "accepted";
                        const lost = b.status === "declined";
                        return (
                          <div key={b.id} style={{
                            padding:".5rem .6rem", marginBottom:".4rem", borderRadius:"8px",
                            background: won ? "rgba(34,197,94,.08)" : "rgba(var(--ff-fg), .04)",
                            border: won ? "1px solid rgba(34,197,94,.4)" : "1px solid rgba(var(--ff-fg), .08)",
                            opacity: lost ? .55 : 1,
                          }}>
                            <div style={{ fontSize:".85rem", color:"var(--ff-text)", display:"flex", alignItems:"center", gap:".4rem", flexWrap:"wrap" as const }}>
                              <span>{nameFor(b.contractor_id)}{b.amount != null ? " — $" + b.amount : (b.walkthrough_requested ? " — walkthrough first" : "")}</span>
                              {won && <span style={{ fontSize:".65rem", background:"rgba(34,197,94,.18)", color:"var(--ff-success)", border:"1px solid rgba(34,197,94,.4)", borderRadius:"4px", padding:".1rem .4rem", letterSpacing:".04em" }}>✓ PICKED</span>}
                              {lost && <span style={{ fontSize:".65rem", color:"rgba(var(--ff-muted), .5)", letterSpacing:".04em" }}>not picked</span>}
                            </div>
                            {b.message && <div style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .6)" }}>{b.message}</div>}
                          </div>
                        );
                      })}
                      {r.status === "pending"
                        ? <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .4)" }}>The client picks a bid from their dashboard.</div>
                        : picked
                          ? <div style={{ fontSize:".72rem", color:"var(--ff-success)" }}>The client picked {nameFor(picked.contractor_id)}{picked.amount != null ? " at $" + picked.amount : ""}.</div>
                          : null}
                    </div>
                  );
                })()}
                {r.status !== "pending" && r.assigned_contractor_id && (
                  <div style={{ ...s.meta, marginTop:".5rem", color:"var(--ff-success)" }}>
                    Assigned to {nameFor(r.assigned_contractor_id)} ✓
                    {(bidsBy[r.id]?.length ?? 0) === 0 ? " (no bids — assigned directly)" : ""}
                  </div>
                )}
                <RequestPhotoQuote requestId={r.id} photoPath={r.photo_path} estimatedQuote={r.estimated_quote} quoteNotes={r.quote_notes} canQuote />
                <div style={{ marginTop:".75rem", display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                  {/* Only for requests still taking bids — dispatch-job refuses anything
                      else, so offering the button there would be a dead control. */}
                  {r.status === "pending" && (
                    <button style={{ ...s.btn, color:"#ea6b14", borderColor:"rgba(234,107,20,.35)", background:"rgba(234,107,20,.08)" }}
                      disabled={busyRefire === r.id} onClick={() => refireRequest(r)}>
                      <Ic name="mail" size={13} style={{ marginRight:4 }} />
                      {busyRefire === r.id ? "Sending…" : "Re-send to contractors"}
                    </button>
                  )}
                  <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyDelete} onClick={() => deleteRequest(r)}><Ic name="trash" size={13} style={{ marginRight:4 }} />Delete request</button>
                </div>
                {r.status === "pending" && Number(r.refire_count ?? 0) > 0 && (
                  <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .45)", marginTop:".4rem" }}>
                    Re-sent {r.refire_count} time{Number(r.refire_count) === 1 ? "" : "s"}
                    {Number(r.refire_count) >= 2 ? " — automatic nudges are used up, but you can still re-send by hand." : "."}
                  </div>
                )}
              </div>
            ))}
            {pager("requests")}
          </div>
        )}

        {tab === "accounts" && (
          <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Every account on the platform. Search, view full details, approve or deactivate contractors, and permanently delete any account (this wipes all of their jobs, requests, messages, reviews, photos and login).
            </p>
            <input value={accountQ} onChange={e => setAccountQ(e.target.value)} placeholder="Search name, email or phone…"
              style={{ width:"100%", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, marginBottom:".75rem" }} />
            <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginBottom:"1rem" }}>
              {(["all","client","contractor","admin","orphaned"] as const).map(rf => (
                <button key={rf} onClick={() => setAccountRole(rf)}
                  style={{ ...s.tab, padding:".4rem .9rem", textTransform:"capitalize" as const, ...(accountRole === rf ? s.activeTab : {}) }}>
                  {rf}{rf === "all" ? ` (${accounts.length})` : ` (${accounts.filter(a => rf === "orphaned" ? a.orphaned : (a.role || "") === rf).length})`}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" as const, marginBottom:"1rem", padding:".7rem .85rem", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"8px" }}>
              <span style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)", flex:1 }}>
                Email accounts a custom message{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}.
              </span>
              {selectedIds.size > 0 && (
                <button style={s.btn} onClick={() => setSelectedIds(new Set())}>Clear</button>
              )}
              <button style={{ ...s.btn, color:"#ea6b14", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.1)" }}
                disabled={selectedIds.size === 0} onClick={() => setMsgRecipients(selectedRecipients())}>
                <Ic name="mail" size={13} style={{ marginRight:4 }} />Email selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </button>
              <button style={{ ...s.btn, color:"#ea6b14", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.1)" }}
                disabled={contractorAccts.length === 0} onClick={() => setMsgRecipients(contractorAccts.map(toRecipient))}>
                <Ic name="mail" size={13} style={{ marginRight:4 }} />Email all contractors ({contractorAccts.length})
              </button>
              <button style={{ ...s.btn, color:"#ea6b14", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.1)" }}
                disabled={clientAccts.length === 0} onClick={() => setMsgRecipients(clientAccts.map(toRecipient))}>
                <Ic name="mail" size={13} style={{ marginRight:4 }} />Email all clients ({clientAccts.length})
              </button>
            </div>
            {accounts.some(a => a.orphaned) && (
              <div style={{ display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" as const, marginBottom:"1rem", padding:".7rem .85rem", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"8px" }}>
                <span style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)", flex:1 }}>
                  {accounts.filter(a => a.orphaned).length} account{accounts.filter(a => a.orphaned).length>1?"s":""} signed in but never finished onboarding.
                </span>
                <button style={{ ...s.btn, color:"#ea6b14", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.1)" }}
                  disabled={busyNudge} onClick={nudgeIncomplete}>
                  <Ic name="mail" size={13} style={{ marginRight:4 }} />{busyNudge ? "Sending…" : "Email a finish-signup reminder"}
                </button>
              </div>
            )}
            {filteredAccounts.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No matching accounts.</p>}
            {filteredAccounts.map(a => {
              const nm = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.company_name || "(no name)";
              const isContractor = (a.role === "contractor") || !!a.company_name || (a.specialties && a.specialties.length);
              return (
                <div key={a.id} style={s.card}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:".55rem" }}>
                      {a.email && (
                        <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)}
                          title="Select for bulk email" style={{ width:16, height:16, accentColor:"#ea6b14", cursor:"pointer" }} />
                      )}
                      <div style={s.title}>{nm}{a.company_name && a.company_name !== nm ? ` · ${a.company_name}` : ""}</div>
                    </div>
                    {roleChip(a.role)}
                  </div>
                  {a.orphaned && <div style={{ fontSize:".74rem", color:"var(--ff-warn)", marginBottom:".3rem" }}>⚠ No profile row (orphaned auth account)</div>}
                  {flagMatches[a.id] && (
                    <div style={{ marginTop:".3rem", marginBottom:".4rem", padding:".6rem .8rem", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.4)", borderRadius:"8px", color:"var(--ff-danger)", fontSize:".8rem", lineHeight:1.45 }}>
                      {"Possible re-signup — matches a previously deleted account that had poor reviews (avg "}
                      {flagMatches[a.id].avg}{"/10 over "}{flagMatches[a.id].count}{" review"}{flagMatches[a.id].count === 1 ? "" : "s"}{", deleted "}
                      {new Date(flagMatches[a.id].date).toLocaleDateString()}{"). Matched on "}{flagMatches[a.id].fields.join(", ")}{"."}
                    </div>
                  )}
                  {editEmailId === a.id ? (
                    <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, alignItems:"center", margin:".3rem 0 .45rem" }}>
                      <input value={editEmailVal} onChange={e => setEditEmailVal(e.target.value)} type="email" placeholder="new@email.com" autoComplete="off"
                        style={{ padding:".4rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .18)", borderRadius:"7px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem", flex:"1 1 210px", minWidth:0 }} />
                      <button style={{ ...s.btn, color:"var(--ff-success)", borderColor:"rgba(34,197,94,.35)" }} disabled={busyEmailEdit === a.id} onClick={() => saveEmail(a)}>
                        {busyEmailEdit === a.id ? "Saving…" : "Save"}
                      </button>
                      <button style={s.btn} disabled={busyEmailEdit === a.id} onClick={() => setEditEmailId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={s.meta}>
                      {[a.email, a.phone || a.meta_phone].filter(Boolean).join(" · ") || "—"}
                      <button onClick={() => { setEditEmailId(a.id); setEditEmailVal(a.email || ""); }}
                        style={{ ...s.btn, fontSize:".72rem", padding:".2rem .55rem", marginLeft:".5rem" }}>
                        <Ic name="mail" size={11} style={{ marginRight:3 }} />Edit email
                      </button>
                    </div>
                  )}
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .4)" }}>
                    ID {a.id.slice(0,8)} · joined {a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}
                    {a.last_sign_in_at ? ` · last seen ${new Date(a.last_sign_in_at).toLocaleDateString()}` : " · never signed in"}
                  </div>
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>{a.request_count ?? 0} request{(a.request_count ?? 0) === 1 ? "" : "s"} · {a.job_count ?? 0} job{(a.job_count ?? 0) === 1 ? "" : "s"}</div>
                  {isContractor && (
                    <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .07)", borderRadius:"8px" }}>
                      <div style={s.meta}>Specialties: {(a.specialties ?? []).join(", ") || "—"}</div>
                      <div style={s.meta}>Area: {(a.service_area ?? []).join(", ") || "—"}</div>
                      <div style={s.meta}>
                        Trade: {a.work_type || "—"}
                        {a.years_of_experience != null ? "  ·  " + a.years_of_experience + " yr" + (Number(a.years_of_experience) === 1 ? "" : "s") + " experience" : ""}
                      </div>
                      {(a.availability?.days?.length || a.availability?.start) ? (
                        <div style={s.meta}>
                          Availability: {(a.availability?.days ?? []).join(", ") || "—"}
                          {a.availability?.start ? " · " + a.availability.start + "–" + (a.availability.end || "?") : ""}
                        </div>
                      ) : null}
                      <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .55)" }}>
                        {"Licensed: "}{a.licensed === true ? ("Yes" + (a.license_number ? " (#" + a.license_number + ")" : "")) : a.licensed === false ? "No" : "—"}
                        {"  ·  Insurance: "}{a.has_liability_insurance === true ? ("Yes" + (a.insurance_provider ? " (" + a.insurance_provider + (a.insurance_expiry ? ", exp " + a.insurance_expiry : "") + ")" : "")) : a.has_liability_insurance === false ? "No" : "—"}
                        {"  ·  WCB: "}{a.operates_alone === true ? "Exempt (operates alone)" : a.has_wcb === true ? "Yes" : a.has_wcb === false ? "No" : "—"}
                      </div>
                      <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .55)" }}>
                        {"Rating: "}{a.rating ? Number(a.rating).toFixed(1) + "/10 (" + (a.rating_count ?? 0) + " review" + ((a.rating_count ?? 0) === 1 ? "" : "s") + ")" : "no reviews yet"}
                        {"  ·  Jobs done: "}{a.total_jobs ?? 0}
                        {"  ·  Earned: $"}{Number(a.total_earned ?? 0).toLocaleString()}
                        {"  ·  Payouts: "}{a.stripe_payouts_enabled ? "set up ✓" : "not set up"}
                      </div>
                      {!a.stripe_payouts_enabled && (() => {
                        const chk = payoutCheck[a.id];
                        const steps = chk ? needsFor(chk.needs) : [];
                        return (
                          <div style={{ marginTop:".35rem" }}>
                            {!chk ? (
                              <button style={{ ...s.btn, fontSize:".72rem", padding:".25rem .6rem", color:"#ea6b14", borderColor:"rgba(234,107,20,.35)", background:"rgba(234,107,20,.08)" }}
                                disabled={busyPayoutCheck === a.id} onClick={() => checkPayout(a.id)}>
                                {busyPayoutCheck === a.id ? "Checking Stripe…" : "What's blocking their payouts?"}
                              </button>
                            ) : chk.error ? (
                              <div style={{ ...s.meta, color:"#ef4444" }}>Couldn't check Stripe: {chk.error}</div>
                            ) : (
                              <div style={{ padding:".55rem .7rem", borderRadius:"8px", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.18)" }}>
                                {steps.length > 0 ? (
                                  <>
                                    <div style={{ fontSize:".74rem", fontWeight:600, color:"#ea6b14", marginBottom:".25rem" }}>Stripe is still waiting on:</div>
                                    <ul style={{ margin:0, paddingLeft:"1.1rem", fontSize:".76rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.5 }}>
                                      {steps.map((n, i) => <li key={i}>{n.label}</li>)}
                                    </ul>
                                  </>
                                ) : (
                                  <div style={{ ...s.meta, marginTop:0 }}>Stripe lists nothing outstanding — they may just need to reopen the setup link and finish.</div>
                                )}
                                {pendingText(chk.pending) ? <div style={{ ...s.meta, marginTop:".3rem" }}>{pendingText(chk.pending)}</div> : null}
                                {disabledText(chk.disabled) ? <div style={{ ...s.meta, marginTop:".3rem" }}>{disabledText(chk.disabled)}</div> : null}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {(a.hourly_rate || a.min_callout) ? (
                        <div style={s.meta}>
                          {"Pricing: "}
                          {a.hourly_rate ? "$" + a.hourly_rate + "/hr" : ""}
                          {a.hourly_rate && a.min_callout ? " · " : ""}
                          {a.min_callout ? "$" + a.min_callout + " min callout" : ""}
                        </div>
                      ) : null}
                      {a.work_references ? <div style={s.meta}>References: {a.work_references}</div> : null}
                      {a.google_reviews_url ? (
                        <div style={s.meta}><a href={a.google_reviews_url} target="_blank" rel="noreferrer" style={{ color:"#ea6b14" }}>Google reviews page ↗</a></div>
                      ) : null}
                      {a.review_status && a.review_status !== "pending" ? (
                        <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .5)" }}>
                          Doc review (AI): {a.review_status}
                          {a.review_result ? " — " + (typeof a.review_result === "string" ? a.review_result : JSON.stringify(a.review_result)).slice(0, 240) : ""}
                        </div>
                      ) : null}
                      {(() => {
                        const docs = (a.doc_urls && typeof a.doc_urls === "object") ? a.doc_urls as Record<string,string> : {};
                        const docKeys = Object.keys(docs).filter(k => docs[k]);
                        const portfolio = Array.isArray(a.portfolio) ? a.portfolio.filter((x:any)=>x?.path) : [];
                        if (!docKeys.length && !a.photo_url && !portfolio.length) return (
                          <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .4)", marginTop:".4rem" }}>No documents or photos uploaded yet.</div>
                        );
                        return (
                          <div style={{ marginTop:".55rem" }}>
                            {docKeys.length > 0 && (
                              <>
                                <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .6)", fontWeight:500 }}>Documents</div>
                                <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginTop:".25rem" }}>
                                  {docKeys.map(k => (
                                    <button key={k} style={{ ...s.btn, fontSize:".76rem", padding:".35rem .7rem" }} onClick={() => openDoc(docs[k])}>
                                      <Ic name="file" size={12} style={{ marginRight:4 }} />{DOC_LABELS[k] || k} ↗
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            {(a.photo_url || portfolio.length > 0) && (
                              <>
                                <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .6)", fontWeight:500, marginTop:".5rem" }}>Photos</div>
                                <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginTop:".25rem" }}>
                                  {a.photo_url && (
                                    <img src={a.photo_url} alt="Profile" onClick={() => window.open(a.photo_url, "_blank")}
                                      style={{ width:60, height:60, objectFit:"cover", borderRadius:8, cursor:"pointer", border:"1px solid rgba(var(--ff-fg), .12)" }} />
                                  )}
                                  {portfolio.map((p:any, i:number) => {
                                    const url = pubUrl("portfolio-photos", p.path);
                                    return (
                                      <img key={i} src={url} alt={p.title || "Portfolio"} title={p.title || ""} onClick={() => window.open(url, "_blank")}
                                        style={{ width:60, height:60, objectFit:"cover", borderRadius:8, cursor:"pointer", border:"1px solid rgba(var(--ff-fg), .12)" }} />
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                      <div style={{ ...s.badge, marginTop:".35rem" }}>● {a.contractor_status || "—"}</div>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:".5rem", marginTop:".75rem", flexWrap:"wrap" as const }}>
                    {isContractor && (
                      <button style={s.btn} onClick={() => window.open("/contractors/" + a.id, "_blank")}>View Profile ↗</button>
                    )}
                    {a.email && (
                      <button style={{ ...s.btn, color:"#ea6b14", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.1)" }}
                        onClick={() => setMsgRecipients([toRecipient(a)])}>
                        <Ic name="mail" size={13} style={{ marginRight:4 }} />Email
                      </button>
                    )}
                    {isContractor && a.contractor_status !== "active" && (
                      <button style={{ ...s.btn, color:"var(--ff-success)", borderColor:"rgba(34,197,94,.35)" }}
                        disabled={busyStatus === a.id} onClick={() => setContractorStatus(a.id, "active")}>
                        {busyStatus === a.id ? "…" : "Approve"}
                      </button>
                    )}
                    {isContractor && a.contractor_status === "active" && (
                      <button style={{ ...s.btn, color:"var(--ff-danger)", borderColor:"rgba(239,68,68,.3)" }}
                        disabled={busyStatus === a.id} onClick={() => setContractorStatus(a.id, "inactive")}>
                        {busyStatus === a.id ? "…" : "Deactivate"}
                      </button>
                    )}
                    <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)", marginLeft:"auto" }}
                      disabled={busyDeleteAccount === a.id} onClick={() => deleteAccount(a)}>
                      <Ic name="trash" size={13} style={{ marginRight:4 }} />{busyDeleteAccount === a.id ? "Deleting…" : "Delete account"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "jobs" && (
          <div>
            {jobs.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No jobs yet.</p>}
            {jobs.map(j => (
              <div key={j.id} style={s.card}>
                <div style={s.title}>
                  {j.request?.service_needed || "Job"} <span style={{ fontFamily:"monospace", color:"#ea6b14", fontSize:".8em" }}>{jobCode(j.id)}</span>
                </div>
                <div style={s.meta}>
                  <Ic name="user" size={13} style={{ marginRight:4 }} />{pname(j.client, "Client")}
                  {" → "}
                  <Ic name="briefcase" size={13} style={{ marginRight:4, marginLeft:4 }} />
                  <span style={{ color:"var(--ff-success)" }}>{pname(j.pro, "Contractor")}</span>
                </div>
                {j.request?.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{j.request.location}</div>}
                <div style={s.meta}>Status: {j.status}</div>
                {j.amount && <div style={s.meta}>Amount: ${j.amount}</div>}
                {j.scheduled_at && <div style={s.meta}>Date: {new Date(j.scheduled_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</div>}
                <ContractPanel role="admin" job={j} />
                {j.is_milestone && <MilestonePanel role="admin" job={j} />}
                <div style={{ marginTop:".75rem", display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                  <button style={s.btn} onClick={() => setChatJob(j)}><Ic name="message-square" size={13} style={{ marginRight:4 }} />Read chat</button>
                  <button style={{ ...s.btn, color:"#ef4444", borderColor:"rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)" }} disabled={busyJob === j.id} onClick={() => deleteJob(j)}><Ic name="trash" size={13} style={{ marginRight:4 }} />{busyJob === j.id ? "Deleting…" : "Delete job"}</button>
                </div>
              </div>
            ))}
            {pager("jobs")}
          </div>
        )}

        {tab === "picks" && (
          <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Every contractor a client has been matched with, newest first — who won, at what price, and how many bids they beat.
            </p>
            {picks.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No picks yet. This fills in as clients choose contractors.</p>}
            {picks.map((p: any) => {
              const how = p.how === "client_pick" ? { label:"Client picked", color:"#22c55e" }
                        : p.how === "rehire"      ? { label:"Rehired their pro", color:"#ea6b14" }
                        :                            { label:"Assigned by admin", color:"rgba(var(--ff-muted), .6)" };
              const price = p.winning_amount ?? p.amount;
              return (
                <div key={p.job_id} style={s.card}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:".5rem", flexWrap:"wrap" as const }}>
                    <div style={s.title}>{p.service || "Job"}</div>
                    <span style={{ fontFamily:"monospace", color:"#ea6b14", fontSize:".75rem" }}>{jobCode(p.job_id)}</span>
                    <span style={{ fontSize:".65rem", color:how.color, border:"1px solid currentColor", borderRadius:"4px", padding:".1rem .4rem", letterSpacing:".04em", opacity:.9 }}>{how.label}</span>
                  </div>
                  <div style={s.meta}>
                    <Ic name="user" size={13} style={{ marginRight:4 }} />{p.client_name || "Client"}
                    {" chose "}
                    <span style={{ color:"var(--ff-success)" }}>{p.contractor_name || p.company_name || "a contractor"}</span>
                    {p.company_name && p.contractor_name ? " (" + p.company_name + ")" : ""}
                  </div>
                  <div style={s.meta}>
                    {price != null ? "$" + price : "Price not set yet"}
                    {p.bid_count > 0 ? " · from " + p.bid_count + (p.bid_count === 1 ? " bid" : " bids") : " · no bids"}
                    {" · "}{p.job_status}
                  </div>
                  {p.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{p.location}</div>}
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                    {new Date(p.picked_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "flagged" && (
          <div>
            <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.6, margin:"0 0 1rem", maxWidth:640 }}>
              Messages the chat guard stopped before they reached the other person. The
              sender saw a note explaining why and could rewrite it. Nothing here was
              delivered — this is the record, kept so you can spot anyone who keeps trying
              to take a job off the platform.
            </p>
            {chatFlags.length === 0 && (
              <p style={{ color:"rgba(var(--ff-muted), .45)" }}>Nothing has been blocked. 🎉</p>
            )}
            {chatFlags.map(f => (
              <div key={f.message_id} style={{ ...s.card, borderColor:"rgba(239,68,68,.3)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:".75rem", flexWrap:"wrap", alignItems:"baseline" }}>
                  <div style={{ fontWeight:600, color:"var(--ff-text)" }}>
                    {f.sender_name || "Someone"}
                    <span style={{ fontSize:".72rem", fontWeight:600, color:"rgba(var(--ff-muted), .55)", marginLeft:".45rem", textTransform:"capitalize" as const }}>
                      {f.sender_role || "user"}
                    </span>
                  </div>
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                    {new Date(f.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}
                  </div>
                </div>
                <div style={{ display:"flex", gap:".35rem", flexWrap:"wrap", margin:".5rem 0" }}>
                  {(f.flag_reasons ?? []).map((r: string) => (
                    <span key={r} style={{
                      fontSize:".68rem", fontWeight:700, letterSpacing:".4px", textTransform:"uppercase" as const,
                      padding:".18rem .5rem", borderRadius:999,
                      color:"#fca5a5", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.28)",
                    }}>{String(r).replace(/_/g, " ")}</span>
                  ))}
                </div>
                <div style={{
                  fontSize:".85rem", lineHeight:1.6, color:"var(--ff-text)", whiteSpace:"pre-wrap",
                  background:"rgba(var(--ff-fg), .05)", borderLeft:"3px solid rgba(239,68,68,.5)",
                  borderRadius:6, padding:".6rem .75rem",
                }}>{f.content}</div>
                <div style={{ ...s.meta, marginTop:".55rem" }}>
                  {f.service || "Job"}
                  {f.client_name ? " · client " + f.client_name : ""}
                  {f.contractor_name ? " · pro " + f.contractor_name : ""}
                  {f.job_id ? " · " + jobCode(f.job_id) : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "prepaid" && (
          <div>
            {prepays.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No prepaid recurring plans yet.</p>}
            {prepays.map(pp => {
              const perOcc = Number(pp.amount_per_occurrence || 0) + Number(pp.client_fee_per || 0);
              const refundable = Math.max(0, Number(pp.total_charged || 0) - Number(pp.occurrences_released || 0) * perOcc);
              const canRefund = (pp.status === "held" || pp.status === "partially_released") && refundable > 0;
              const who = pp.client ? `${pp.client.first_name ?? ""} ${pp.client.last_name ?? ""}`.trim() : "";
              return (
                <div key={pp.id} style={s.card}>
                  <div style={s.title}>{pp.plan?.service_needed || "Recurring plan"}{who ? ` · ${who}` : ""}</div>
                  <div style={s.meta}>Status: {pp.status}</div>
                  <div style={s.meta}>Visits: {pp.occurrences_released}/{pp.occurrences_total} released</div>
                  <div style={s.meta}>Charged: ${Number(pp.total_charged || 0).toFixed(2)} · Refundable now: ${refundable.toFixed(2)}</div>
                  {canRefund ? (
                    <button style={{ ...s.btn, background:"#ef4444", color:"#fff", border:"none", marginTop:".5rem" }} disabled={busyRefund === pp.id} onClick={() => refundPrepay(pp)}>
                      {busyRefund === pp.id ? "…" : "Refund unreleased visits"}
                    </button>
                  ) : (
                    <div style={{ ...s.meta, opacity:.6 }}>{pp.status === "refunded" ? "Refunded" : pp.status === "released" ? "Fully released" : "Nothing refundable"}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "disputes" && (
          <div>
            {disputes.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No disputes yet.</p>}
            {disputes.map(d => {
              const job = d.job ?? {};
              const charged = Number(job.total_charged ?? job.amount ?? 0);
              const payout = Number(job.contractor_payout ?? 0);
              const statusLabel: Record<string, string> = {
                open: "Open — needs review",
                resolved_refund: "Resolved — full refund",
                resolved_partial: "Resolved — partial refund",
                resolved_released: "Resolved — released to contractor",
                rejected: "Rejected",
              };
              const statusColor = d.status === "open" ? "var(--ff-warn)" : "var(--ff-success)";
              return (
                <div key={d.id} style={{ ...s.card, ...(d.status === "open" ? { borderColor:"rgba(251,191,36,.4)" } : {}) }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                    <div style={s.title}>{d.reason}</div>
                    <div style={{ fontSize:".78rem", fontWeight:500, color: statusColor }}>● {statusLabel[d.status] ?? d.status}</div>
                  </div>
                  <div style={s.meta}>Job {String(d.job_id).slice(0,8)} · Charged ${charged.toFixed(2)} · Contractor payout ${payout.toFixed(2)}</div>
                  <div style={s.meta}>Reported {new Date(d.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>
                  {d.description && (
                    <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>{d.description}</div>
                  )}
                  {(disputePhotos[d.id]?.length ?? 0) > 0 && (
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginTop:".6rem" }}>
                      {disputePhotos[d.id].map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={"Evidence " + (i+1)} style={{ width:"110px", height:"110px", objectFit:"cover", borderRadius:"8px", border:"1px solid rgba(var(--ff-fg), .12)" }} />
                        </a>
                      ))}
                    </div>
                  )}

                  {(d.agreed_scope || d.requested_remedy || d.service_date || d.amount_in_dispute != null || d.declarant_name) && (
                    <div style={{ marginTop:".6rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .02)", border:"1px solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".8rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6 }}>
                      {d.service_date && <div>Date of service: <strong style={{ color:"rgba(var(--ff-fg), .9)" }}>{d.service_date}</strong></div>}
                      {d.agreed_scope && <div>What was agreed: {d.agreed_scope}</div>}
                      {d.requested_remedy && <div>Requested outcome: <strong style={{ color:"rgba(var(--ff-fg), .9)" }}>{d.requested_remedy}</strong></div>}
                      {d.amount_in_dispute != null && <div>Amount in dispute: ${Number(d.amount_in_dispute).toFixed(2)}</div>}
                      {d.declarant_name && <div style={{ marginTop:".3rem", fontStyle:"italic" as const, color:"rgba(var(--ff-muted), .6)" }}>Declared true &amp; signed by {d.declarant_name}</div>}
                    </div>
                  )}

                  <div style={{ marginTop:".6rem", padding:".6rem .8rem", background: d.contractor_responded_at ? "rgba(59,130,246,.07)" : "rgba(251,191,36,.06)", border: "1px solid " + (d.contractor_responded_at ? "rgba(59,130,246,.3)" : "rgba(251,191,36,.25)"), borderRadius:"8px", fontSize:".82rem", lineHeight:1.5 }}>
                    {d.contractor_responded_at ? (
                      <>
                        <div style={{ fontWeight:600, color:"var(--ff-info)", marginBottom:".3rem" }}>Contractor responded</div>
                        <div style={{ color:"rgba(var(--ff-muted), .85)" }}>{d.contractor_response}</div>
                        {(disputeRespPhotos[d.id]?.length ?? 0) > 0 && (
                          <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginTop:".5rem" }}>
                            {disputeRespPhotos[d.id].map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt={"Response " + (i+1)} style={{ width:"90px", height:"90px", objectFit:"cover" as const, borderRadius:"8px", border:"1px solid rgba(var(--ff-fg), .12)" }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ color:"var(--ff-warn)" }}>
                        Awaiting contractor response{d.response_deadline ? " — due " + new Date(d.response_deadline).toLocaleDateString("en-CA", { dateStyle:"medium" }) : ""}.
                      </div>
                    )}
                  </div>

                  {d.status === "open" ? (
                    <div style={{ marginTop:".9rem", borderTop:"1px solid rgba(var(--ff-fg), .07)", paddingTop:".9rem" }}>
                      <textarea value={resolveNote[d.id] ?? ""} rows={2} placeholder="Resolution note (optional, shared internally)"
                        onChange={e => setResolveNote(p => ({ ...p, [d.id]: e.target.value }))}
                        style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem", boxSizing:"border-box" as const, resize:"vertical" as const, marginBottom:".7rem" }} />
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                        <button style={{ ...s.btn, background:"#ef4444", color:"#fff", border:"none" }} disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "refund_full")}>{busyResolve === d.id ? "…" : "Refund client in full"}</button>
                        <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none" }} disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "release")}>Release to contractor</button>
                      </div>
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center", marginTop:".6rem" }}>
                        <input type="number" min={0} max={charged} step="0.01" value={partialAmt[d.id] ?? ""} placeholder="Partial $"
                          onChange={e => setPartialAmt(p => ({ ...p, [d.id]: e.target.value }))}
                          style={{ width:"110px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem" }} />
                        <button style={{ ...s.btn, background:"#ea6b14", color:"#fff", border:"none" }} disabled={busyResolve === d.id} onClick={() => resolveDispute(d, "refund_partial")}>Partial refund + pay contractor</button>
                      </div>
                      <div style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .45)", marginTop:".55rem", lineHeight:1.45 }}>Full refund returns the whole charge to the client and pays nothing out. Partial refund returns part to the client and still pays the contractor their payout. Release pays the contractor and keeps the charge.</div>
                    </div>
                  ) : (
                    <div style={{ ...s.meta, marginTop:".6rem", color:"var(--ff-success)" }}>
                      {d.refund_amount != null ? `Refunded $${Number(d.refund_amount).toFixed(2)}. ` : ""}
                      {d.resolved_at ? "Resolved " + new Date(d.resolved_at).toLocaleDateString() : ""}
                      {d.resolution_note ? ` — ${d.resolution_note}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "leads" && (
          <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Estimate requests from visitors who haven't signed up. Reach out, then mark them contacted.
            </p>
            {leads.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No estimate leads yet.</p>}
            {leads.map(l => (
              <div key={l.id} style={{ ...s.card, ...(l.status === "new" ? { borderColor:"rgba(234,107,20,.4)" } : {}) }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                  <div style={s.title}>{l.service_needed || "General enquiry"}</div>
                  <div style={{ fontSize:".78rem", fontWeight:500, color: l.status === "new" ? "#ea6b14" : "var(--ff-success)" }}>● {l.status === "new" ? "New" : "Contacted"}</div>
                </div>
                <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{l.name || "—"}</div>
                <div style={s.meta}>
                  {l.email ? <a href={"mailto:" + l.email} style={{ color:"#ea6b14", textDecoration:"none" }}>{l.email}</a> : null}
                  {l.email && l.phone ? " · " : ""}
                  {l.phone ? <a href={"tel:" + l.phone} style={{ color:"#ea6b14", textDecoration:"none" }}>{l.phone}</a> : null}
                </div>
                {l.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{l.location}</div>}
                {l.details && (
                  <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>{l.details}</div>
                )}
                <div style={{ ...s.meta, marginTop:".4rem", color:"rgba(var(--ff-muted), .45)" }}>Received {new Date(l.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>
                {l.status === "new" && (
                  <div style={{ marginTop:".75rem" }}>
                    <button style={{ ...s.btn, background:"#22c55e", color:"#06210f", border:"none" }} disabled={busyLead === l.id} onClick={() => markLeadContacted(l.id)}>{busyLead === l.id ? "…" : "Mark contacted"}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "health" && (
          <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Things that may need your attention. Buckets only show items that have been waiting too long.
            </p>
            {!health && (healthFailed
              ? <p style={{ color:"var(--ff-warn)" }}>Couldn&rsquo;t load the health checks. <button style={s.btn} onClick={() => loadAll()}>Retry</button></p>
              : <p style={{ color:"rgba(var(--ff-muted), .45)" }}>Loading…</p>)}
            {health && (() => {
              const buckets: { key:string; title:string; hint:string; count:number; items:any[] }[] = [
                { key:"no_bid", title:"Requests with no bids", hint:"Pending & unassigned for over 24h — may need a contractor invited.", count: health.no_bid_count||0, items: health.no_bid||[] },
                { key:"awaiting_approval", title:"Waiting on client approval", hint:"Contractor proposed a time over 2 days ago, client hasn't approved.", count: health.awaiting_approval_count||0, items: health.awaiting_approval||[] },
                { key:"awaiting_confirm", title:"Waiting on client confirmation", hint:"Job completed over 2 days ago, client hasn't confirmed (auto-confirms at 3 days).", count: health.awaiting_confirm_count||0, items: health.awaiting_confirm||[] },
                { key:"stale_disputes", title:"Stale open disputes", hint:"Disputes open for over 3 days.", count: health.stale_disputes_count||0, items: health.stale_disputes||[] },
              ];
              const allClear = buckets.every(b => b.count === 0);
              return (
                <>
                  <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const, marginBottom:"1.25rem" }}>
                    <div style={{ ...s.card, flex:"1 1 180px", margin:0, textAlign:"center" as const }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"#ea6b14", lineHeight:1 }}>{health.new_leads_count ?? 0}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:".35rem" }}>New estimate leads</div>
                    </div>
                    <div style={{ ...s.card, flex:"1 1 180px", margin:0, textAlign:"center" as const }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"var(--ff-warn)", lineHeight:1 }}>{health.pending_contractors_count ?? 0}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:".35rem" }}>Contractors awaiting review</div>
                    </div>
                  </div>
                  {allClear && <p style={{ color:"var(--ff-success)", fontSize:".9rem" }}>● All clear — nothing is overdue right now.</p>}
                  {buckets.map(b => b.count > 0 && (
                    <div key={b.key} style={{ marginBottom:"1.5rem" }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:".04em", color:"var(--ff-warn)" }}>{b.title} ({b.count})</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginBottom:".6rem" }}>{b.hint}</div>
                      {b.items.map((it:any) => (
                        <div key={it.id} style={{ ...s.card, borderColor:"rgba(251,191,36,.25)" }}>
                          <div style={s.title}>{it.service_needed || it.service || it.reason || "Item"}</div>
                          {(it.first_name || it.last_name || it.client_name) && (
                            <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{it.client_name || `${it.first_name||""} ${it.last_name||""}`.trim()}</div>
                          )}
                          {it.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{it.location}</div>}
                          {(it.created_at || it.since) && <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>Since {new Date(it.created_at || it.since).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )}

        {tab === "platform" && (
          <div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:".05em", marginBottom:".3rem" }}>Platform mode</h2>
            <p style={{ fontSize:".84rem", color:"rgba(var(--ff-muted), .6)", marginBottom:"1.25rem", maxWidth:"58ch" }}>
              This is the master switch for whether the site takes new client jobs.
              Contractors can always sign up and look around, whichever mode you pick.
            </p>

            {/* ── Mode picker ─────────────────────────────────────────────── */}
            {([
              { key:"open"     as PlatformMode, label:"Open",     tone:"var(--ff-success)",
                desc:"Normal. New client requests go straight out to matching contractors." },
              { key:"waitlist" as PlatformMode, label:"Waitlist", tone:"#ea6b14",
                desc:"Clients can still describe their job and leave their details, but nothing is sent to contractors. You release the jobs by hand when you're ready." },
              { key:"paused"   as PlatformMode, label:"Paused",   tone:"var(--ff-warn)",
                desc:"New client requests stop completely. The overhaul notice shows across the site." },
            ]).map(m => {
              const on = platMode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => changeMode(m.key)}
                  disabled={busyPlatform}
                  style={{
                    ...s.card,
                    display:"flex", alignItems:"flex-start", gap:".75rem", width:"100%",
                    textAlign:"left" as const, cursor: busyPlatform ? "default" : "pointer",
                    fontFamily:"inherit", color:"var(--ff-text)",
                    background: on ? "rgba(234,107,20,.08)" : "rgba(var(--ff-fg), .04)",
                    borderColor: on ? "rgba(234,107,20,.4)" : "rgba(var(--ff-fg), .08)",
                  }}
                >
                  <Ic name={on ? "radio-on" : "radio-off"} size={20} style={{ color: on ? m.tone : "rgba(var(--ff-muted), .4)", flexShrink:0, marginTop:2 }} />
                  <span style={{ minWidth:0 }}>
                    <span style={{ display:"block", fontSize:".95rem", fontWeight:600, color: on ? m.tone : "var(--ff-text)" }}>
                      {m.label}{on ? " — currently on" : ""}
                    </span>
                    <span style={{ display:"block", fontSize:".8rem", color:"rgba(var(--ff-muted), .6)", marginTop:".25rem" }}>{m.desc}</span>
                  </span>
                </button>
              );
            })}

            {/* ── Notice wording ──────────────────────────────────────────── */}
            <div style={{ ...s.card, marginTop:"1.5rem" }}>
              <div style={{ ...s.title, marginBottom:".2rem" }}>What clients see while you're paused</div>
              <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .55)", marginBottom:".9rem" }}>
                Used on the site-wide banner and on the waitlist form. Editing this takes effect on the next page load — no deploy needed.
              </div>
              {([
                { key:"headline" as const, label:"Headline",    ph:"We're rebuilding Freddy Fix It" },
                { key:"cta"      as const, label:"Button text", ph:"Join the waitlist" },
              ]).map(f => (
                <label key={f.key} style={{ display:"block", marginBottom:".8rem" }}>
                  <span style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".3rem" }}>{f.label}</span>
                  <input
                    value={noticeDraft[f.key]}
                    onChange={e => setNoticeDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .05)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }}
                  />
                </label>
              ))}
              <label style={{ display:"block", marginBottom:".9rem" }}>
                <span style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".3rem" }}>Message</span>
                <textarea
                  value={noticeDraft.body}
                  onChange={e => setNoticeDraft(d => ({ ...d, body: e.target.value }))}
                  rows={3}
                  style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .05)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", resize:"vertical" as const }}
                />
              </label>

              {/* ── "Why are you paused?" panel ───────────────────────────── */}
              <label style={{ display:"block", marginBottom:".9rem" }}>
                <span style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".3rem" }}>
                  The &ldquo;why?&rdquo; panel — what people see when they press the banner
                </span>
                <span style={{ display:"block", fontSize:".74rem", color:"rgba(var(--ff-muted), .45)", marginBottom:".35rem", lineHeight:1.5 }}>
                  Same formatting as the newsletter: <code>## </code>starts a heading, <code>- </code>starts a bullet,
                  and <code>**text**</code> makes it bold. Leave this empty to switch the panel off — the banner
                  goes back to being a plain strip nobody can press.
                </span>
                <textarea
                  value={noticeDraft.details}
                  onChange={e => setNoticeDraft(d => ({ ...d, details: e.target.value }))}
                  rows={12}
                  placeholder={"## Why we're paused\nWe'd rather fix things before you feel them.\n\n## What we're improving\n- **Your money, held safely.** Released only when you confirm the work is done."}
                  style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .05)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace", fontSize:".78rem", lineHeight:1.6, resize:"vertical" as const }}
                />
              </label>

              <button
                onClick={saveNotice}
                disabled={busyPlatform}
                style={{ ...s.btn, background:"rgba(234,107,20,.15)", borderColor:"rgba(234,107,20,.4)", color:"var(--ff-text)" }}
              >
                {busyPlatform ? "Saving…" : "Save wording"}
              </button>
            </div>

            {/* ── Held requests ───────────────────────────────────────────── */}
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".05em", marginTop:"2rem", marginBottom:".3rem" }}>
              Jobs held by the pause ({heldReqs.length})
            </h2>
            <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".9rem", maxWidth:"58ch" }}>
              Real job requests from signed-in clients that were captured instead of sent out. Releasing one emails every matching contractor immediately.
            </p>
            {heldReqs.length === 0 ? (
              <div style={{ ...s.card, color:"rgba(var(--ff-muted), .55)", fontSize:".85rem" }}>
                Nothing is being held right now.
              </div>
            ) : (
              <>
                <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginBottom:".9rem", alignItems:"center" }}>
                  <button
                    onClick={() => setHeldSel(prev => prev.size === heldReqs.length ? new Set() : new Set(heldReqs.map(r => r.id)))}
                    style={s.btn}
                  >
                    {heldSel.size === heldReqs.length ? "Clear selection" : "Select all"}
                  </button>
                  <button
                    onClick={() => releaseHeld(Array.from(heldSel))}
                    disabled={busyRelease || heldSel.size === 0}
                    style={{ ...s.btn,
                      background: heldSel.size ? "rgba(234,107,20,.15)" : "rgba(var(--ff-fg), .06)",
                      borderColor: heldSel.size ? "rgba(234,107,20,.4)" : "rgba(var(--ff-fg), .1)",
                      color: heldSel.size ? "var(--ff-text)" : "rgba(var(--ff-muted), .5)" }}
                  >
                    {busyRelease ? "Releasing…" : `Release selected (${heldSel.size})`}
                  </button>
                </div>
                {heldReqs.map(r => {
                  const picked = heldSel.has(r.id);
                  return (
                    <div key={r.id} style={{ ...s.card, borderColor: picked ? "rgba(234,107,20,.4)" : "rgba(var(--ff-fg), .08)" }}>
                      <div style={{ display:"flex", gap:".7rem", alignItems:"flex-start" }}>
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => setHeldSel(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                          aria-label={`Select ${r.service_needed || "request"}`}
                          style={{ marginTop:4, flexShrink:0, accentColor:"#ea6b14" }}
                        />
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={s.title}>{r.service_needed || "Job request"}</div>
                          {r.client_name && <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{r.client_name}{r.client_email ? ` · ${r.client_email}` : ""}</div>}
                          {r.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location}</div>}
                          <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                            Waiting {Number(r.days_waiting ?? 0)} day{Number(r.days_waiting ?? 0) === 1 ? "" : "s"}
                            {r.created_at ? ` · posted ${new Date(r.created_at).toLocaleDateString("en-CA", { dateStyle:"medium" })}` : ""}
                          </div>
                          {r.job_description && (
                            <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .65)", marginTop:".5rem", whiteSpace:"pre-wrap" as const }}>
                              {String(r.job_description).slice(0, 400)}{String(r.job_description).length > 400 ? "…" : ""}
                            </div>
                          )}
                          <button
                            onClick={() => releaseHeld([r.id])}
                            disabled={busyRelease}
                            style={{ ...s.btn, marginTop:".7rem" }}
                          >
                            {busyRelease ? "Working…" : "Release just this one"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Waitlist signups ────────────────────────────────────────── */}
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".05em", marginTop:"2rem", marginBottom:".3rem" }}>
              Waitlist signups ({waitlistRows.length})
            </h2>
            <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".9rem", maxWidth:"58ch" }}>
              People who left their details while the site was paused. Nobody here has an account or a job request yet — email them when you reopen.
            </p>
            {waitlistRows.length === 0 ? (
              <div style={{ ...s.card, color:"rgba(var(--ff-muted), .55)", fontSize:".85rem" }}>
                No signups yet.
              </div>
            ) : waitlistRows.map(w => (
              <div key={w.id} style={s.card}>
                <div style={s.title}>{w.name || w.email}</div>
                <div style={s.meta}><Ic name="mail" size={13} style={{ marginRight:4 }} />{w.email}{w.phone ? ` · ${w.phone}` : ""}</div>
                {w.service && <div style={s.meta}><Ic name="wrench" size={13} style={{ marginRight:4 }} />{w.service}</div>}
                <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                  {new Date(w.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}
                  {w.source ? ` · from ${String(w.source).replace(/_/g, " ")}` : ""}
                  {w.notified_at ? " · already emailed" : ""}
                </div>
                {w.description && (
                  <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .65)", marginTop:".5rem", whiteSpace:"pre-wrap" as const }}>
                    {String(w.description).slice(0, 400)}{String(w.description).length > 400 ? "…" : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </div>
      </div>
      {msgRecipients && (
        <AdminMessageModal recipients={msgRecipients} onClose={() => setMsgRecipients(null)} />
      )}
      {chatJob && me && (
        <JobChat
          jobId={chatJob.id}
          meId={me.id}
          title={"Chat · " + jobCode(chatJob.id)}
          job={chatJob}
          role="admin"
          readOnly
          closedReason="You're reading this as an admin — you can see everything, including messages the chat guard blocked, but you can't post."
          onClose={() => setChatJob(null)}
        />
      )}
    </div>
  );
}
