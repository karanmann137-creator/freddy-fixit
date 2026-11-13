import { Ic } from "@/components/Ic";
import { Sk, SkCard, StalledNotice, useEnterAnim } from "@/components/Skeleton";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { validateEmail } from "@/lib/emailValidation";
import ProfileBar from "@/components/ProfileBar";
import MilestonePanel from "@/components/MilestonePanel";
import ContractPanel from "@/components/ContractPanel";
import DashboardSidebar, { type SidebarItem } from "@/components/DashboardSidebar";
import AdminMessageModal, { type MsgRecipient } from "@/components/AdminMessageModal";
import JobChat from "@/components/JobChat";
import { jobCode } from "@/lib/jobCode";
import { DASH_NAV_EVENT, readDashNavFromUrl, clearDashNavFromUrl, type DashNavDetail } from "@/lib/notificationRoutes";
import { needsFor, pendingText, disabledText } from "@/lib/stripeRequirements";
import { clearPlatformStatusCache, DEFAULT_NOTICE, type PlatformMode, type PlatformNotice } from "@/lib/platformStatus";
import FadeImg from "@/components/FadeImg";
import DismissX from "@/components/DismissX";
import DashSearch from "@/components/DashSearch";
import { searchTokens, matchesSearch } from "@/lib/dashSearch";
import { getDismissals, dismiss as dismissKey } from "@/lib/dismissals";
import VerifyCodeModal from "@/components/VerifyCodeModal";
import { mfaOwed } from "@/lib/mfa";
// The shared dashboard primitives. Admin was the last of the three dashboards
// to hand-roll all of its chrome in a local `s` style object; see Dash.tsx for
// what each of these replaced and how far the three had drifted.
import {
  DashShell, DashContent, DashCard,
  Pass, PassTop, Hero, HeroSub, PassMeta, PassMetaItem,
  StateLine, Row, Pill, Button, AttentionCard,
} from "@/components/ui";
import AdminRequestsTab from "./admin/AdminRequestsTab";
import AdminPicksTab from "./admin/AdminPicksTab";
import AdminFlaggedTab from "./admin/AdminFlaggedTab";
import AdminPrepaidTab from "./admin/AdminPrepaidTab";
import AdminDisputesTab from "./admin/AdminDisputesTab";
import AdminAgentsTab from "./admin/AdminAgentsTab";
import AdminActivityTab from "./admin/AdminActivityTab";
import AdminHealthTab from "./admin/AdminHealthTab";
import AdminPlatformTab from "./admin/AdminPlatformTab";

// Re-signup flagging is computed server-side by admin_resignup_matches().
// The Accounts tab lists every auth user (via admin_list_accounts) so the admin
// can see full details and fully delete any account (admin-delete-account edge
// fn wipes jobs, requests, messages, reviews, storage + the login).

/**
 * ADMIN_NAV is the ROUTING truth and must stay complete. `applyDashNav` below
 * validates an incoming deep link against this array (`ADMIN_NAV.some(i =>
 * i.key === d.tab)`), so an item removed from here stops being reachable from a
 * notification even though its tab body still exists. Never trim this array to
 * tidy the sidebar; trim `visibleNav()` instead.
 *
 * ── THE FOUR SECTIONS, and why the ORDER of the array is load-bearing ────
 * Twelve flat items is a twelve-way decision every time the admin looks at the
 * rail (Hick). Four captioned groups make it one four-way decision and then one
 * small one. The captions answer "what am I here to do":
 *
 *   OPERATE  the day's work — requests in, jobs running, picks, flagged chat,
 *            disputes. Everything here is something a human works THROUGH.
 *   MONEY    money the platform is holding that isn't a job yet.
 *   GROW     pipeline — leads, and the agents that propose work on them.
 *   SYSTEM   the platform itself and the record of what was done to it.
 *
 * ⚠️ DashboardSidebar groups by FIRST APPEARANCE — it walks the array and opens
 * a new group whenever `section` differs from the previous item's. So a section
 * whose items are not CONTIGUOUS here renders as two groups with the same
 * caption. If you add an item, insert it inside its section's run; do not
 * append it at the end with the right `section` string and assume that works.
 *
 * Operate leads because that is what an admin opens the dashboard to do, and
 * System is last because it is the thing you go to deliberately rather than the
 * thing you were already doing (Serial Position: the ends of a list are what
 * gets seen, so the daily work and the settings sit at them).
 */
const ADMIN_NAV: SidebarItem[] = [
  { key: "requests", label: "Requests", icon: "clipboard-list", section: "Operate" },
  { key: "jobs",     label: "Jobs",     icon: "briefcase",      section: "Operate" },
  { key: "picks",    label: "Picks",    icon: "star",           section: "Operate" },
  { key: "flagged",  label: "Flagged chat", icon: "message-square", section: "Operate" },
  { key: "disputes", label: "Disputes", icon: "alert-triangle", section: "Operate" },
  { key: "prepaid",  label: "Prepaid",  icon: "dollar",         section: "Money" },
  { key: "leads",    label: "Leads",    icon: "user-check",     section: "Grow" },
  // Agents — the background workers' proposal queue. Sits in Grow, beside the
  // leads it proposes against, because it IS something to work through: nothing
  // an agent produces reaches a client, a contractor, a social account or `main`
  // until it is approved here. `sparkles` because Ic has no bot or cpu glyph and
  // a missing glyph renders BLANK rather than erroring.
  { key: "agents",   label: "Agents",   icon: "sparkles",       section: "Grow" },
  { key: "health",   label: "Health",   icon: "check",          section: "System" },
  { key: "platform", label: "Platform", icon: "settings",       section: "System" },
  { key: "accounts", label: "Accounts", icon: "user",           section: "System" },
  // Last, because it is read-after-the-fact rather than something to work
  // through. `clock` because Ic has no shield or history glyph and a missing
  // glyph renders BLANK rather than erroring.
  { key: "activity", label: "Activity", icon: "clock",          section: "System" },
];

/**
 * Which rail items to SHOW. Modelled on ClientDashboard's `visibleNav()`, and
 * for the same reason: an item that opens an empty state is worse than no item,
 * because it costs a decision on every visit and pays nothing back.
 *
 * ── THE SPLIT ───────────────────────────────────────────────────────────
 * ALWAYS VISIBLE — the seven surfaces whose empty state is itself the answer,
 * or that the admin must be able to reach when there is nothing in them:
 *   Requests, Jobs, Accounts  the platform's three core lists. "No requests
 *                             today" is information; a missing Requests tab is
 *                             an admin wondering where requests went.
 *   Health, Platform          the controls. Platform in particular is how the
 *                             site is paused and re-armed, and the moment you
 *                             need it most is an incident — exactly when a
 *                             count-driven rule might have hidden it.
 *   Activity                  the audit trail. Append-only, no clear button,
 *                             and it must never look optional.
 *   Agents                    the roster is DECLARED, so an agent that has
 *                             never run is still listed. Hiding the tab on an
 *                             empty queue would hide the only surface that can
 *                             tell you an agent is silently not running — you
 *                             cannot query an absence.
 *
 * EARNED — appears the moment it has rows, disappears when it is cleared:
 *   Picks, Flagged chat, Disputes, Prepaid, Leads. All five are exception
 *   queues. Disputes has never had a row on this platform; Picks and Flagged
 *   chat are usually zero. Five permanently-empty items in a rail of twelve is
 *   how the rail stopped being read.
 *
 * The counts come from the ones already computed for the badges — one source,
 * so a visible item can never show a badge the filter disagreed with.
 *
 * ⚠️ `active` is always shown, and that is not a nicety. A notification deep
 * link can land on an earned tab whose rows have since been cleared — a dispute
 * resolved, a held request released — and the body still renders. Without this
 * the admin would be looking at the Disputes tab with nothing highlighted in
 * the rail and no way back to it. The filter decides what to OFFER; it must
 * never contradict where you already are.
 *
 * ⚠️ AND `failed` IS WHY A COUNT-DRIVEN RAIL NEEDS THE FAILURE FLAGS (2026-11-09).
 * An earned tab is earned by `rows.length`, and a failed read produces a length
 * of zero — so the three reads that can fail here would HIDE their own tab at
 * exactly the moment it has something to say, taking the retry button with it
 * and leaving the owner no route to the surface that could tell him anything.
 * That is strictly worse than the confident-empty-state bug it accompanies: an
 * empty state is a wrong answer, a missing tab is no question. Zero-because-we-
 * could-not-tell is not zero, in the rail the same as in the body.
 */
function visibleNav(opts: {
  active: string;
  picks: number; flagged: number; disputes: number; prepaid: number; leads: number;
  failed: { picks: boolean; flagged: boolean; prepaid: boolean };
}): SidebarItem[] {
  const show = new Set<string>(["requests", "jobs", "accounts", "health", "platform", "activity", "agents"]);
  if (opts.picks > 0    || opts.failed.picks)   show.add("picks");
  if (opts.flagged > 0  || opts.failed.flagged) show.add("flagged");
  if (opts.disputes > 0) show.add("disputes");
  if (opts.prepaid > 0  || opts.failed.prepaid) show.add("prepaid");
  if (opts.leads > 0)    show.add("leads");
  show.add(opts.active);
  return ADMIN_NAV.filter(it => show.has(String(it.key)));
}

/**
 * What each admin list is searched against — one definition per list, so the
 * box and the rows can't disagree about what "searchable" means.
 *
 * Requests and jobs are PAGINATED (PAGE_SIZE 20), so this filter only ever sees
 * the page that is loaded. The result line below each box says so in words
 * rather than reporting a total it cannot know — an admin who searches a job
 * code and is told "0 shown" without being told it only looked at 20 rows would
 * reasonably conclude the job does not exist.
 */
const adminJobFields = (j: any): (string | number | null | undefined)[] => [
  j?.request?.service_needed, j?.request?.location, j?.status, j?.amount,
  jobCode(j?.id ?? ""),
  j?.client?.first_name, j?.client?.last_name,
  j?.pro?.first_name, j?.pro?.last_name, j?.pro?.company_name,
];
const adminAcctFields = (a: any): (string | number | null | undefined)[] => [
  a?.first_name, a?.last_name, a?.email, a?.phone, a?.meta_phone, a?.company_name,
];

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [tab, setTab] = useState<"health"|"platform"|"requests"|"jobs"|"picks"|"accounts"|"flagged"|"disputes"|"prepaid"|"leads"|"agents"|"activity">("requests");
  // The agent team. Two reads, two failure flags — `agentsFailed` and
  // `actionsFailed` are separate because the registry answering while the queue
  // breaks is a real state, and collapsing them would render a confident "no
  // agents, nothing pending" for a read that simply didn't happen. A failed read
  // is never an empty result.
  const [agentOverview, setAgentOverview] = useState<any>(null);
  const [agentsFailed, setAgentsFailed] = useState(false);
  const [agentActions, setAgentActions] = useState<any[]>([]);
  const [actionsFailed, setActionsFailed] = useState(false);
  const [busyReview, setBusyReview] = useState<string|null>(null); // action id being approved/rejected
  // Drafting is a separate button with its own busy id, because it costs a model
  // call and the owner must be able to tell "writing your message" apart from
  // "filing your decision". Errors are keyed per action: a failure on one lead
  // must never read as a failure on the lead below it.
  const [busyDraft, setBusyDraft] = useState<string|null>(null);
  const [draftErr, setDraftErr] = useState<Record<string, string>>({});
  // Which copy button last succeeded. A clipboard write can be refused outright
  // (insecure context, permission), so the "Copied" label is set only after the
  // promise resolves — never optimistically, or the owner walks away believing
  // he has the message.
  const [copiedKey, setCopiedKey] = useState<string>("");
  // Per-action edited payload, keyed by action id. Absent means "unedited" —
  // which is NOT the same as "edited to match", because an absent entry sends
  // p_payload => null and the RPC keeps what the agent wrote.
  const [actionEdit, setActionEdit] = useState<Record<string, string>>({});
  const [agentFilter, setAgentFilter] = useState<"pending"|"all">("pending");
  // Admin action audit trail (admin_audit_tail). `auditFailed` exists because a
  // failed read is not an empty result — an audit log that renders a confident
  // "nothing here" when the query broke is worse than no audit log at all.
  const [audit, setAudit] = useState<any[]>([]);
  const [auditFailed, setAuditFailed] = useState(false);
  const tabAnim = useEnterAnim(tab); // replays a 220ms fade+rise on tab change; nothing remounts
  // `prepaysFailed` for the same reason as `auditFailed`: supabase.from()
  // RESOLVES with {data,error} rather than throwing, so the try/catch around the
  // read never fires and a broken query would otherwise render "No prepaid
  // recurring plans yet" — a confident answer about money we could not read.
  const [prepays, setPrepays] = useState<any[]>([]);
  const [prepaysFailed, setPrepaysFailed] = useState(false);
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
  const [busyMfa, setBusyMfa] = useState<string|null>(null); // user id whose two-step is being cleared
  // A lapsed two-step window turns every admin_guard() RPC into a refusal whose
  // remedy lived only on the sign-in page. `verifyGate` holds the action that
  // was refused so the modal can retry it; `what` names it in the prompt so the
  // ask never feels like it came out of nowhere. One copy, every call site.
  const [verifyGate, setVerifyGate] = useState<{ retry: () => void; what: string } | null>(null);
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
  const [picksFailed, setPicksFailed] = useState(false);
  // Messages the chat guard refused to deliver. The row still exists (that's the
  // evidence); RLS keeps it hidden from everyone but the sender and an admin.
  // `chatFlagsFailed` is the worst of this family to get wrong: the empty state
  // here reads "Nothing has been blocked. 🎉", which on a failed read is the
  // dashboard congratulating the owner for something it never found out.
  const [chatFlags, setChatFlags] = useState<any[]>([]);
  const [chatFlagsFailed, setChatFlagsFailed] = useState(false);
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
  // `platFailed` matters more than the other three flags put together: this is
  // the pause switch, and platMode defaults to "open". A failed platform_status
  // read left the picker showing "Open — currently on" whatever the DB actually
  // says, so the owner could read a stale mode off the one control he uses to
  // decide whether the site is taking jobs. A failed read is not an empty
  // result, and here it is not an "open" one either.
  const [platMode, setPlatMode] = useState<PlatformMode>("open");
  const [platFailed, setPlatFailed] = useState(false);
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
  // Client-side filter over rows that are already loaded — no query, no RPC, no
  // new RLS surface. One box serves Requests and Jobs, so it is cleared on every
  // tab change: carrying a query from Jobs into Requests would present a full
  // tab as an empty one.
  const [search, setSearch] = useState("");
  /**
   * Explanatory notes the owner has dismissed for good, from `ui_dismissals`.
   *
   * These are the static "here is what this tab does" paragraphs. They never
   * change, so once he has read one, showing it again forever is just noise
   * above the thing he came for — which is exactly the complaint. Nothing
   * actionable is dismissible this way; the two live bars below use `hiddenNow`.
   *
   * A FAILED READ IS NOT AN EMPTY RESULT: `getDismissals` resolves `ok:false`
   * rather than an empty set on error, and we only apply the keys when `ok`, so
   * a bad read leaves every note SHOWING. Erring toward too much explanation is
   * the safe direction.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  /**
   * Session-only hides for the two bars that carry LIVE state — the load-error
   * banner and the orphaned-accounts nudge. Both are counts that change
   * underneath the row, so a permanent dismissal would silence a future,
   * different fault. Hiding until the next load is the most that is safe.
   */
  const [hiddenNow, setHiddenNow] = useState<Set<string>>(new Set());


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
    // Only a CLEAN "no session" answer is a sign-out — see the twin comment in
    // ClientDashboard. A failed read also yields `data.session === null`, so the
    // bare test bounced the signed-in owner to /login, which read the same valid
    // session and sent him back here. ProtectedRoute owns the unreadable case
    // and shows a Try again dead end for it. (2026-11-09)
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error || !data.session) { if (!error) setLocation("/login"); return; }
      const uid = data.session.user.id;
      const { data: prof } = await supabase.from("profiles").select("id, first_name").eq("id", uid).maybeSingle();
      setMe(prof ? { id: prof.id, first_name: prof.first_name ?? undefined } : { id: uid });
      // Only applied when the read succeeded — see the `dismissed` docblock.
      const d = await getDismissals(uid);
      if (d.ok) setDismissed(new Set(d.keys));
    });
  }, []);

  // One box, several tabs — so the query is cleared whenever the tab changes.
  useEffect(() => { setSearch(""); }, [tab]);

  // Reload whenever any tab's page changes (also fires once on mount).
  useEffect(() => { loadAll(); }, [page]);

  const loadAll = async () => {
    setLoading(true);
    setLoadError("");
    // Every session-only hide is released here, which is what makes the "hide
    // until the next load" promise true. Without this a dismissed load-error
    // banner would stay hidden across a retry and silence a DIFFERENT fault.
    setHiddenNow(new Set());
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
    // ⚠️ The next four reads keep `error` rather than destructuring `{ data }`
    // alone. The try/catch is NOT what was protecting them: supabase.from() and
    // supabase.rpc() RESOLVE with {data,error} and do not throw, so a broken
    // query fell through the catch, set an empty array, and every one of these
    // tabs rendered a confident "nothing here" for a question it never got an
    // answer to. Same lesson as auditFailed, four more times.
    try {
      const { data: pp, error: ppErr } = await supabase.from("recurring_prepayments")
        .select("*, plan:client_requests!recurring_prepayments_plan_request_id_fkey(service_needed), client:profiles!recurring_prepayments_client_id_fkey(first_name,last_name)")
        .order("created_at", { ascending: false });
      setPrepaysFailed(!!ppErr);
      setPrepays(ppErr ? [] : (pp ?? []));
    } catch { setPrepaysFailed(true); setPrepays([]); }
    // Picks feed. Its own try/catch so an older DB without the RPC still loads
    // every other tab instead of failing the whole dashboard.
    try {
      const { data: pk, error: pkErr } = await supabase.rpc("admin_list_picks", { p_limit: 200 });
      setPicksFailed(!!pkErr);
      setPicks(pkErr ? [] : ((pk as any[]) ?? []));
    } catch { setPicksFailed(true); setPicks([]); }
    // Blocked chat messages, same defensive pattern.
    try {
      const { data: cf, error: cfErr } = await supabase.rpc("admin_list_chat_flags", { p_limit: 200 });
      setChatFlagsFailed(!!cfErr);
      setChatFlags(cfErr ? [] : ((cf as any[]) ?? []));
    } catch { setChatFlagsFailed(true); setChatFlags([]); }
    // Admin action trail. Own try/catch like the other newer tabs, and the
    // error is kept rather than swallowed into an empty array — see auditFailed.
    try {
      const { data: al, error: alErr } = await supabase.rpc("admin_audit_tail", { p_limit: 300 });
      setAuditFailed(!!alErr);
      setAudit((al as any[]) ?? []);
    } catch { setAuditFailed(true); setAudit([]); }
    // The agent team. Both reads carry plain is_admin() server-side (not
    // admin_guard), deliberately: the second factor rides our own Resend mailer,
    // and a mailer outage must never blind the admin dashboard. Only the approval
    // WRITE asks for a code.
    try {
      const { data: ao, error: aoErr } = await supabase.rpc("admin_agent_overview");
      setAgentsFailed(!!aoErr);
      setAgentOverview(aoErr ? null : (ao ?? null));
    } catch { setAgentsFailed(true); setAgentOverview(null); }
    try {
      const { data: aa, error: aaErr } = await supabase.rpc("admin_list_agent_actions", { p_limit: 200, p_status: null });
      setActionsFailed(!!aaErr);
      setAgentActions(aaErr ? [] : ((aa as any[]) ?? []));
    } catch { setActionsFailed(true); setAgentActions([]); }
    // Platform mode + everything the pause is holding. Three separate try/catch
    // blocks so a DB that predates any one of them still renders the rest.
    try {
      const { data: ps, error: psErr } = await supabase.rpc("platform_status");
      // An unrecognised mode is a failed read too, not a reason to keep the
      // default: platMode starts at "open", so anything that leaves it untouched
      // leaves the picker claiming the site is taking jobs.
      const m = (ps as any)?.mode;
      const known = m === "open" || m === "paused" || m === "waitlist";
      setPlatFailed(!!psErr || !known);
      if (known) setPlatMode(m);
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
    } catch { setPlatFailed(true); /* leave the defaults — the tab still renders */ }
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
        {/* The inline `opacity` the old buttons carried is GONE on purpose: the
            shared `.ffdash .ffu-btn:disabled` rule dims a disabled button, so
            the literal was a second, competing answer to the same question —
            and an inline style beats the sheet, so the page's number would have
            won and the primitive's would never have applied. */}
        <Button disabled={page[which] <= 0}
          onClick={() => setPage(p => ({ ...p, [which]: Math.max(0, p[which] - 1) }))}>← Prev</Button>
        <span style={{ color:"rgba(var(--ff-muted), .6)", fontSize:".82rem" }}>Page {page[which] + 1} of {pageCount(which)}</span>
        <Button disabled={page[which] >= pageCount(which) - 1}
          onClick={() => setPage(p => ({ ...p, [which]: p[which] + 1 }))}>Next →</Button>
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

  /**
   * Every destructive admin action passes `admin_guard()`, which refuses once
   * the two-step window (12h) has lapsed. Before 2026-11-04 that refusal was a
   * dead end: the message says "verify your sign-in code first" and this page
   * had nowhere to do that, so the only route back in was signing out and back
   * in with a password — which Google sign-in skips entirely.
   *
   * Call this on ANY admin-write failure. It asks `mfa_status()` whether a code
   * is actually owed (never the error's wording — see `mfaOwed`), and if so it
   * opens the modal holding `retry` so the action resumes on its own. Returns
   * true when the modal has taken over, so the caller skips its alert.
   */
  const offerVerify = async (what: string, retry: () => void): Promise<boolean> => {
    if (!(await mfaOwed())) return false;
    setVerifyGate({ retry, what });
    return true;
  };

  // `confirmed` lets the verify-modal retry resume the action without asking the
  // same "are you sure?" a second time. The person already answered it; a second
  // prompt reads as the app having forgotten, and teaches them to click through
  // confirmations without reading — which on these buttons is the real danger.
  const deleteRequest = async (r: any, confirmed = false) => {
    if (!confirmed && !window.confirm("Delete this request permanently? This also removes any assigned job and its messages.")) return;
    setBusyDelete(true);
    const { error } = await supabase.rpc("admin_delete_request", { p_request_id: r.id });
    setBusyDelete(false);
    if (error) {
      if (await offerVerify("deleting this request", () => deleteRequest(r, true))) return;
      alert("Couldn't delete: " + error.message); return;
    }
    setRequests(prev => prev.filter(x => x.id !== r.id));
  };

  /**
   * Approve or reject one agent proposal.
   *
   * This is the single gate the whole agent team hangs off. Approving is what
   * releases the `claim_token` a harness acts on, so it is irreversible from the
   * agent's point of view — which is why `admin_review_agent_action` carries
   * `admin_guard()` and writes to `admin_audit_log` immediately after it.
   *
   * `p_payload` is sent only when the owner actually edited the draft. Passing an
   * unchanged copy would still stamp `edited: true` in the audit log, which turns
   * "the owner rewrote this" into noise.
   *
   * The edit box is plain JSON on purpose: an agent's payload shape is per-kind and
   * not yet settled, and a typed form per kind would silently drop fields it didn't
   * know about. A parse failure refuses rather than sending a half-read object.
   */
  const reviewAction = async (a: any, approve: boolean, confirmed = false) => {
    const raw = actionEdit[a.id];
    let payload: any = null;
    if (approve && typeof raw === "string") {
      try { payload = JSON.parse(raw); }
      catch { alert("That edited draft isn't valid JSON, so nothing was sent. Fix it or press Reset to go back to what the agent wrote."); return; }
    }
    // `needs_harness === false` means no bot will ever act on this kind — it is a
    // handoff to the owner, so approving it means "I've done this" and the RPC
    // closes it at `sent`. The confirm text and the optimistic status below both
    // read the same flag the server reads, so neither can describe an outcome the
    // DB isn't about to write.
    const handoff = a.needs_harness === false;
    if (!confirmed) {
      const what = approve
        ? (handoff
            ? `Mark this ${String(a.kind || "action").replace(/_/g, " ")} as handled?\n\nNothing automatic happens — this just clears it off your list, so only do it once you've actually followed up.`
            : `Approve this ${String(a.kind || "action").replace(/_/g, " ")} from ${a.agent_label || a.agent}?\n\nOnce approved it is released to the agent to carry out. You can't un-approve it.`)
        : `Reject this ${String(a.kind || "action").replace(/_/g, " ")}? The agent won't act on it.`;
      if (!window.confirm(what)) return;
    }
    setBusyReview(a.id);
    const { error } = await supabase.rpc("admin_review_agent_action", {
      p_action_id: a.id, p_approve: approve, p_payload: payload,
    });
    setBusyReview(null);
    if (error) {
      if (await offerVerify(approve ? "approving this agent action" : "rejecting this agent action",
                            () => reviewAction(a, approve, true))) return;
      alert("Couldn't save that decision: " + error.message); return;
    }
    // Reflect it locally AND reload, so the per-agent pending counts in the header
    // can't drift from the rows underneath them.
    setAgentActions(prev => prev.map(x => x.id === a.id
      ? { ...x, status: approve ? (handoff ? "sent" : "approved") : "rejected" } : x));
    setActionEdit(prev => { const n = { ...prev }; delete n[a.id]; return n; });
    loadAll();
  };

  /**
   * Ask for a drafted follow-up on ONE lead-response finding.
   *
   * This is the only place on the platform where a click costs a token, and that
   * placement is the whole cost design: the agent that FINDS these leads is a
   * plain Postgres function on pg_cron with no network client, so detection is
   * free and a quiet day costs nothing. The model runs here, once, on a lead the
   * owner has already decided to chase.
   *
   * `functions.invoke` throws the response body away, so the reason has to be
   * pulled off `error.context` — otherwise a precise refusal ("that lead is
   * rejected", "the drafting key isn't set up") arrives as "Edge Function
   * returned a non-2xx status code" and the owner has nothing to act on.
   *
   * On success the draft is written onto the payload server-side, so a reload
   * keeps it. `saved: false` means it drafted but didn't persist — shown rather
   * than swallowed, because the money was already spent and the text is still
   * usable if he copies it now.
   */
  const draftLead = async (a: any) => {
    setBusyDraft(a.id);
    setDraftErr(prev => { const n = { ...prev }; delete n[a.id]; return n; });
    try {
      const { data, error } = await supabase.functions.invoke("agent-draft-lead", {
        body: { action_id: a.id },
      });
      if (error) {
        let m = error.message || "Couldn't draft that one.";
        try { const j = await (error as any).context?.json?.(); if (j?.error) m = j.error; } catch { /* error body was not JSON; keep the default message */ }
        setDraftErr(prev => ({ ...prev, [a.id]: m }));
        return;
      }
      if (!data?.ok || !data?.draft) {
        setDraftErr(prev => ({ ...prev, [a.id]: data?.error || "Couldn't draft that one." }));
        return;
      }
      // Merge into the row we already hold so the draft appears without a round
      // trip, then reload to pick up anything else that moved.
      setAgentActions(prev => prev.map(x => x.id === a.id
        ? { ...x, payload: { ...(x.payload || {}), draft: data.draft } } : x));
      if (data.saved === false) {
        setDraftErr(prev => ({ ...prev, [a.id]: "Drafted, but it didn't save — copy it before you leave this page." }));
      } else {
        loadAll();
      }
    } catch (e: any) {
      setDraftErr(prev => ({ ...prev, [a.id]: e?.message || "Couldn't draft that one." }));
    } finally {
      setBusyDraft(null);
    }
  };

  // Copy that tells the truth. `navigator.clipboard` is absent on insecure
  // origins and rejects when permission is denied, and a silent failure here
  // means the owner pastes the previous thing he copied into a client's inbox.
  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(prev => (prev === key ? "" : prev)), 1800);
    } catch {
      setCopiedKey("");
      alert("Couldn't copy that — select the text and copy it by hand.");
    }
  };

  // Re-send the new-job email for a request that stalled. This normally happens by
  // itself at 24h and again at 48h while the request is under 3 bids; the button is
  // the manual override and deliberately ignores that two-nudge cap.
  //
  // admin_refire_request resets `dispatched_to` down to the pros who already bid
  // before re-invoking dispatch-job, so a pro who has already quoted is never
  // nudged about it and everyone else is emailed exactly once per press.
  const refireRequest = async (r: any, confirmed = false) => {
    if (!confirmed && !window.confirm(
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
      if (await offerVerify("re-sending this job", () => refireRequest(r, true))) return;
      alert("Couldn't re-send: " + (e?.message || String(e)));
    } finally { setBusyRefire(null); }
  };

  const deleteJob = async (j: any, confirmed = false) => {
    if (!confirmed && !window.confirm("Delete this job permanently? This also removes its milestones, messages, reviews and disputes. This can't be undone.")) return;
    setBusyJob(j.id);
    const { error } = await supabase.rpc("admin_delete_job", { p_job_id: j.id });
    setBusyJob(null);
    if (error) {
      if (await offerVerify("deleting this job", () => deleteJob(j, true))) return;
      alert("Couldn't delete job: " + error.message); return;
    }
    setJobs(prev => prev.filter(x => x.id !== j.id));
  };

  const deleteAccount = async (a: any, confirmed = false) => {
    const who = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.email || a.id.slice(0, 8);
    if (!confirmed && !window.confirm(`Permanently delete ${who} and ALL of their data — jobs, requests, messages, reviews, photos and their login. This cannot be undone.`)) return;
    setBusyDeleteAccount(a.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-account", { body: { user_id: a.id } });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      setAccounts(prev => prev.filter(x => x.id !== a.id));
      if (data && (data as any).warning) alert((data as any).warning);
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
      // The edge function checks `admin_action_allowed()`, which mirrors mfa_ok()
      // deliberately — so the same lapsed window refuses here too, and the same
      // modal is the remedy.
      if (await offerVerify(`deleting ${who}`, () => deleteAccount(a, true))) return;
      alert("Couldn't delete account: " + msg);
    } finally { setBusyDeleteAccount(null); }
  };

  // Break glass: turn two-step sign-in OFF for someone who has lost both their
  // email and their recovery codes. This is the whole reason the feature can be
  // switched on safely -- without it, a lost mailbox is a permanently dead
  // account and the only remedy would be raw SQL. It clears the setting; it does
  // not sign anyone in, and it is logged by admin_clear_mfa itself.
  const clearMfa = async (a: any, confirmed = false) => {
    const who = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.email || a.id.slice(0, 8);
    if (!confirmed && !window.confirm(`Turn OFF two-step sign-in for ${who}? They'll be able to sign in with just their password until they switch it back on. Only do this once you're sure who you're talking to.`)) return;
    setBusyMfa(a.id);
    try {
      const { data, error } = await supabase.rpc("admin_clear_mfa", { p_user_id: a.id });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.reason || "unknown");
      alert(`Two-step sign-in is now off for ${who}.`);
    } catch (e: any) {
      if (await offerVerify(`turning off two-step for ${who}`, () => clearMfa(a, true))) return;
      alert("Couldn't turn off two-step: " + (e?.message || String(e)));
    } finally { setBusyMfa(null); }
  };

  const setContractorStatus = async (contractorId: string, status: "active"|"inactive") => {
    setBusyStatus(contractorId);
    const { error } = await supabase.rpc("admin_set_contractor_status", { p_id: contractorId, p_status: status });
    setBusyStatus(null);
    if (error) {
      if (await offerVerify(status === "active" ? "approving this contractor" : "deactivating this contractor",
                            () => setContractorStatus(contractorId, status))) return;
      alert("Couldn't update contractor: " + error.message); return;
    }
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
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
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
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
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
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
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
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
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
      try { if (error?.context?.json) { const b = await error.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
      // resolve-dispute holds a service-role client, so it asks
      // `admin_action_allowed()` rather than evaluating mfa_ok() itself. Same
      // lapsed window, same remedy. The retry re-confirms deliberately: this one
      // moves real money, and that is the confirmation worth asking twice.
      if (await offerVerify("resolving this dispute", () => resolveDispute(d, action))) return;
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
    // This response IS an authoritative read of the mode, so it clears
    // platFailed — otherwise the "couldn't read the mode" line would sit above a
    // picker that has just been told the truth by the server.
    if (m === "open" || m === "paused" || m === "waitlist") { setPlatMode(m); setPlatFailed(false); }
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

  const changeMode = async (mode: PlatformMode, confirmed = false) => {
    if (mode === platMode) return;
    const warn = mode === "open"
      ? "Reopen the site to new client requests?\n\nThe overhaul banner disappears and new requests dispatch to contractors immediately.\n\nAnything already held stays held until you release it below."
      : mode === "waitlist"
      ? "Switch to WAITLIST mode?\n\nClients can still describe their job, but it's captured instead of sent to contractors. Nobody gets emailed.\n\nContractors can still sign up and browse."
      : "PAUSE the site?\n\nNew client requests stop entirely and the overhaul notice shows site-wide.\n\nContractors can still sign up and browse.";
    if (!confirmed && !window.confirm(warn)) return;
    setBusyPlatform(true);
    try {
      await applyMode(mode, noticeDraft);
      alert(mode === "open" ? "Site is open. New requests dispatch normally again."
          : mode === "waitlist" ? "Waitlist mode is on. New requests are captured, not dispatched."
          : "Site is paused. New client requests are blocked.");
    } catch (e: any) {
      if (await offerVerify("changing the site mode", () => changeMode(mode, true))) return;
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
      if (await offerVerify("saving the notice wording", () => saveNotice())) return;
      alert("Couldn't save the wording: " + (e?.message || String(e)));
    } finally { setBusyPlatform(false); }
  };

  // Releasing sends held requests through the normal dispatch path — contractors
  // get emailed. All four arguments are passed explicitly: leaning on PostgREST
  // to fill defaults risks overload ambiguity if the signature ever changes.
  const releaseHeld = async (ids: string[], confirmed = false) => {
    if (!ids.length) return;
    if (!confirmed && !window.confirm(
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
      if (await offerVerify("releasing these held requests", () => releaseHeld(ids, true))) return;
      alert("Couldn't release: " + (e?.message || String(e)));
    } finally { setBusyRelease(false); }
  };

  // ── What is left of the local `s` object ───────────────────────────────────
  //
  // This was twelve keys re-deriving the whole dashboard chrome: `wrap`,
  // `header`, `content`, `tabs`, `tab`, `activeTab`, `card` and `title` are now
  // <DashShell>, <Pass>, <DashContent> and <DashCard>, and `logo` was already
  // dead with zero call sites. The values here had drifted from Client's in
  // every dimension that decides whether the three read as one product — a
  // 1000px column against 800, --ff-r2 and --ff-s5 against --ff-r3 and
  // clamp(1rem,4vw,1.5rem), and a .95rem weight-500 card title where Client
  // uses the Bebas accent caption. None of those differences was ever decided.
  //
  // TWO KEYS SURVIVE, and each one is a TEXT style rather than a piece of
  // chrome, which is why no primitive replaced it. `badge` is now every <Pill>
  // and `btn` is now every <Button>, so both are gone.
  //
  //   `title` is the ITEM NAME at the top of a per-item card, and ⚠️ it was
  //          deliberately NOT ported to <DashCard title=…>. That prop renders
  //          `.ffd-cardtitle`, which is the Bebas accent caption — i.e. ORANGE
  //          (uiStyles.ts:852, `color: var(--ff-accent-500)`). There are twenty
  //          of these cards on this page, so using it would paint twenty orange
  //          headings and spend the one-orange-per-screen budget twenty times
  //          over. That is precisely the state the old dashboards were in,
  //          where nothing read as important because everything did. So
  //          `DashCard`'s `title` prop goes UNUSED on this page: Admin has no
  //          one-per-section caption that a <Group> label does not already do
  //          better, and the Group label is the neutral shared caption.
  //   `meta` is the metadata line inside a card (icon + one fact). The
  //          primitives have no equivalent — <Row>'s `sub` is one line, and
  //          these cards stack four to six of them.
  //
  // ⚠️ Neither may grow an interactive state. Inline styles cannot express
  // :hover/:active/:disabled, and the shared sheet's
  // `.ffdash button:not(.ffu-btn)` carries all three for every raw button left
  // on the page; an inline `opacity` here would beat it and freeze the
  // disabled state. That is why the pager's hand-written `opacity` is gone.
  const s = {
    title: { fontSize:".95rem", fontWeight:500, color:"var(--ff-text)", marginBottom:".35rem" },
    meta: { fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginBottom: "var(--ff-s1)" },
  };

  // Shaped like the ported chrome: the nav spacer, then the shared content
  // column of cards. Same reason as the other two dashboards — the real
  // content lands where the placeholders are, so nothing jumps. The skeleton
  // mounts <DashShell> too, so it gets the same page ground as the real page
  // rather than a second hand-rolled copy of it.
  if (loading) return (
    <DashShell>
      <div style={{ height: "var(--ff-topnav-h)" }} />
      <DashContent wide busy>
        <span className="ff-sr-only">Loading the admin dashboard</span>
        <div aria-hidden="true" style={{ marginBottom:"var(--ff-s5)" }}><Sk w={220} h={28} r={8} /></div>
        <div style={{ display:"grid", gap:"1rem" }}><SkCard /><SkCard /><SkCard /></div>
        <StalledNotice />
      </DashContent>
    </DashShell>
  );

  const roleChip = (role?: string) => {
    const r = role || "—";
    const col = r === "admin" ? "var(--ff-c10)" : r === "contractor" ? "var(--ff-info)" : r === "client" ? "var(--ff-success)" : "rgba(var(--ff-muted), .5)";
    return <span style={{ fontSize:".72rem", fontWeight:600, color: col, textTransform:"capitalize" as const }}>● {r}</span>;
  };

  const openDisputes = disputes.filter(d => d.status === "open").length;
  const newLeads = leads.filter(l => l.status === "new").length;
  const healthAlerts = health ? ((health.no_bid_count||0) + (health.awaiting_confirm_count||0) + (health.awaiting_approval_count||0) + (health.stale_disputes_count||0)) : 0;
  // The badge counts and the visibility filter read the SAME numbers, so a
  // visible item can never carry a badge the filter disagreed with. Leads uses
  // `leads.length` for visibility and `newLeads` for the badge on purpose: the
  // tab is earned by having any lead at all, but the badge counts only the ones
  // nobody has looked at yet.
  const navItems: SidebarItem[] = visibleNav({
    active: tab,
    picks: picks.length,
    flagged: chatFlags.length,
    disputes: openDisputes,
    prepaid: prepays.length,
    leads: leads.length,
    // A read that failed keeps its tab reachable, so the Retry inside it is
    // reachable too. The badge below still counts rows only — a badge is a
    // count, and there is nothing to count.
    failed: { picks: picksFailed, flagged: chatFlagsFailed, prepaid: prepaysFailed },
  }).map(it => ({
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

  const hideNow = (key: string) => setHiddenNow(prev => new Set(prev).add(key));
  /**
   * Renders a tab's explanatory paragraph with a "don't show this again" ×, or
   * nothing once it has been dismissed. Every note on this page goes through
   * here so the copy, the ×, and the persistence can't drift apart — the same
   * reason `upsertMeta` has exactly one copy.
   */
  const tabNote = (key: string, text: string) => {
    const k = "admin_note:" + key;
    if (dismissed.has(k)) return null;
    return (
      <div style={{ display:"flex", alignItems:"flex-start", gap:".5rem", marginBottom:"1rem" }}>
        <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", margin:0, lineHeight:1.5, flex:1, minWidth:0 }}>{text}</p>
        <DismissX
          onClick={() => { setDismissed(prev => new Set(prev).add(k)); if (me?.id) dismissKey(me.id, k); }}
          label="Don't show this again"
          title="Don't show this again"
        />
      </div>
    );
  };

  // Account search composes with the role chips rather than replacing them: an
  // admin who clicked "contractor" and then typed a name means both.
  const acctTokens = searchTokens(accountQ);
  const filteredAccounts = accounts.filter(a => {
    if (accountRole !== "all") {
      if (accountRole === "orphaned") { if (!a.orphaned) return false; }
      else if ((a.role || "") !== accountRole) return false;
    }
    return matchesSearch(acctTokens, adminAcctFields(a));
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
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ── What needs an admin ────────────────────────────────────────────────────
  //
  // Derived ONCE and read by both the pass and the attention card, so the navy
  // block can never say "all clear" above a list of three things to do. Same
  // reason ClientDashboard hoists `attnRows` above its pass.
  //
  // ⚠️ Every count here is an existing one, re-read rather than re-queried. A
  // second query would be a second answer, and the rail's badges, the pass and
  // this list would start disagreeing about the same number.
  const pendingAgentCount = agentActions.filter((a:any) => a.status === "pending").length;
  const adminAttn: { key:string; icon:any; tone:any; title:string; sub:string; cta:string; tab:string }[] = [
    // MONEY FIRST, and the order is the whole point of a capped list. An open
    // dispute freezes a payout — `resolve-dispute` is the only thing that
    // un-freezes it — so it outranks everything below even when there are more
    // of them. The card renders three rows; what gets cut is decided here.
    openDisputes > 0 ? {
      key:"disputes", icon:"alert-triangle" as const, tone:"accent" as const,
      title: openDisputes === 1 ? "1 open dispute" : openDisputes + " open disputes",
      sub:"Money on these jobs stays held until you resolve them.",
      cta:"Review", tab:"disputes",
    } : null,
    // Also money, one step further back: a held request has reached nobody, so
    // no bid, no job and no charge can happen on it at all.
    heldReqs.length > 0 ? {
      key:"held", icon:"clipboard-list" as const, tone:"accent" as const,
      title: heldReqs.length === 1 ? "1 request held" : heldReqs.length + " requests held",
      sub:"These came in while the site was paused and have not reached a single pro.",
      cta:"Release", tab:"platform",
    } : null,
    healthAlerts > 0 ? {
      key:"health", icon:"check" as const, tone:"warn" as const,
      title: healthAlerts === 1 ? "1 overdue item" : healthAlerts + " overdue items",
      sub:"Requests with no bids, or jobs waiting on a client past the normal window.",
      cta:"Open", tab:"health",
    } : null,
    pendingAgentCount > 0 ? {
      key:"agents", icon:"sparkles" as const, tone:"warn" as const,
      title: pendingAgentCount === 1 ? "1 agent proposal waiting" : pendingAgentCount + " agent proposals waiting",
      sub:"Nothing an agent drafted leaves the platform until you approve it.",
      cta:"Review", tab:"agents",
    } : null,
  ].filter(Boolean) as any[];

  /**
   * The pass. Admin's states PLATFORM state, not navigation — the rail already
   * answers "where can I go", and everything in here is a condition.
   *
   * ⚠️ THE ORANGE RULE. `turn` is the only branch that paints orange and there
   * is exactly one of those, gated on `adminAttn.length` — the same list the
   * card below renders, so the orange appears if and only if there is something
   * in it. A quiet platform has no orange on this screen anywhere, and that
   * absence is what makes the orange legible on the days there is something.
   * `paused` is `review` (amber) rather than a softer orange: the site being
   * paused is a state the admin chose, not a thing waiting on him.
   *
   * No `accent` on the meta strip for the same budget reason — three counts are
   * metadata, and the state line has first claim on the one accent.
   */
  const pass = (() => {
    const n = adminAttn.length;
    if (n > 0) return {
      state: "turn" as const,
      label: n === 1 ? "1 THING NEEDS YOU" : n + " THINGS NEED YOU",
      hero: adminAttn[0].title + " — " + adminAttn[0].sub,
      sub: n > 1 ? "The rest are listed below." : "",
    };
    if (platMode !== "open") return {
      state: "review" as const,
      label: platMode === "waitlist" ? "WAITLIST MODE" : "SITE PAUSED",
      hero: platMode === "waitlist"
        ? "The site is taking waitlist signups and holding new requests."
        : "The site is paused. Outbound email is suppressed and new requests are held.",
      sub: "Re-arm everything from Platform when you are ready.",
    };
    return {
      state: "ok" as const,
      label: "ALL CLEAR",
      hero: "Nothing is overdue, disputed or waiting on you.",
      sub: "",
    };
  })();

  return (
    <DashShell>
      {/* ⚠️ The page's own `<style>{".ffdash button{…}"}</style>` block was
          DELETED here, and deleting it is the point of the port rather than
          tidying after it. The shared sheet carries the same press scoped as
          `.ffdash button:not(.ffu-btn)`; the page's copy was unscoped, and
          `.ffdash button` (0,0,1,1) outranks `.ffu-btn` (0,0,1,0), so leaving
          it would have silently re-overridden the transition, hover filter and
          disabled opacity of every <Button> ported below — the primitives
          would still render, and would just not behave like primitives. */}
      {/* A Google Fonts <link> stood here and was DELETED 2026-11-08. It asked
          for Bebas Neue + DM Sans 300/400/500, a strict SUBSET of the single
          <link> in index.html, so it fetched nothing new and could only ever
          disagree with it. That is the live hazard, not the wasted request: a
          face used site-wide belongs in that one <link>, and a per-page loader
          is the thing that makes "we changed the display face" leave one page
          rendering the old one with no error. ~38 of these subset loaders are
          still scattered across the read pages; this is the first to go, and it
          went because a dashboard is the last place that should be deciding
          which fonts the site uses. */}
      {/* Clears the fixed TopNav. The height is MEASURED and published by
          TopNav on :root — the old hardcoded 3.75rem was one of three
          disagreeing constants and went stale the moment the nav's breakpoint
          or the user's text size moved it. */}
      <div style={{ height: "var(--ff-topnav-h)" }} />
      <div style={{ display:"flex", alignItems:"flex-start" as const }}>
        <DashboardSidebar
          items={navItems}
          active={tab}
          onSelect={(k) => setTab(k as any)}
          title="Admin"
        />
        <div style={{ flex:1, minWidth:0 }}>

      {/* ── The pass ──────────────────────────────────────────────────────────
          Replaces a hand-rolled header bar whose h1 carried an "ADMIN" chip on
          a raw `var(--ff-c10)` background — a permanent second orange on every
          screen, spent on a label that told the admin something he knew. The
          pass spends it at most once, on a condition.

          `lead` replaces the mark: TopNav already carries the logo three rems
          above this, and PassTop would otherwise draw it twice. */}
      <div style={{ margin:"0 var(--ff-s4) var(--ff-s5)", borderRadius:"var(--ff-r4)", overflow:"hidden", boxShadow:"var(--ff-lift-3)" }}>
        <Pass>
          <PassTop lead={<span className="ffu-wordmark">{me?.first_name ? "HI, " + String(me.first_name).toUpperCase() : "ADMIN"}</span>} />
          <StateLine state={pass.state} pulse={pass.state === "turn"}>{pass.label}</StateLine>
          <Hero>{pass.hero}</Hero>
          {pass.sub && <HeroSub>{pass.sub}</HeroSub>}
          <PassMeta>
            <PassMetaItem label="Requests" value={counts.requests} />
            <PassMetaItem label="Jobs" value={counts.jobs} />
            <PassMetaItem label="Accounts" value={accounts.length} />
          </PassMeta>
        </Pass>
      </div>

      {loadError && !hiddenNow.has("loadError") && (
        <div style={{ margin:"1rem 1.5rem 0", padding:".8rem 1rem", background:"rgba(var(--ff-danger-rgb), .1)", border:"var(--ff-hair-w) solid rgba(var(--ff-danger-rgb), .4)", borderRadius:"10px", display:"flex", alignItems:"center", gap:".75rem", flexWrap:"wrap" }}>
          <span style={{ fontSize:".85rem", color:"var(--ff-text)", flex:1, minWidth:0 }}>{loadError}</span>
          <Button onClick={() => loadAll()} style={{ borderColor:"rgba(var(--ff-danger-rgb), .5)" }}>Retry</Button>
          {/* Session-only, and deliberately not persisted. This names a real
              fault whose text changes with the fault — dismissing it forever
              would silence a DIFFERENT failure later. `loadAll` clears and
              re-sets loadError, so a retry that fails again shows it back. */}
          <DismissX onClick={() => hideNow("loadError")} label="Hide this" title="Hide until the next load" />
        </div>
      )}

      {/* `wide` is the documented opt-out from the shared 800px column, and
          Admin's list tabs are what it exists for — Accounts and Jobs render
          tables of people and money that genuinely need the room. */}
      <DashContent wide className={tabAnim}>
        <ProfileBar role="admin" />

        {/* <AttentionCard> caps the render at `max` and returns null on an
            empty list, so there is no length check here. The rows are ordered
            money-first in `adminAttn`; what the cap cuts is decided there. */}
        <AttentionCard max={3}>
          {adminAttn.map(a => (
            <Row
              key={a.key}
              icon={a.icon}
              tone={a.tone}
              title={a.title}
              sub={a.sub}
              right={<Button variant="primary" onClick={() => { setTab(a.tab as any); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{a.cta}</Button>}
            />
          ))}
        </AttentionCard>

        {tab === "requests" && <AdminRequestsTab search={search} requests={requests} setSearch={setSearch} counts={counts} s={s} bidsBy={bidsBy} nameFor={nameFor} busyRefire={busyRefire} refireRequest={refireRequest} busyDelete={busyDelete} deleteRequest={deleteRequest} pager={pager} />}

        {tab === "accounts" && (
          <div>
            {tabNote("accounts", "Every account on the platform. Search, view full details, approve or deactivate contractors, and permanently delete any account (this wipes all of their jobs, requests, messages, reviews, photos and login).")}
            {/* The same search component as every other list, deliberately — this
                box predates it and had its own substring match, which meant a
                phone typed as 403-555-1234 missed a stored 4035551234. */}
            <DashSearch
              value={accountQ}
              onChange={setAccountQ}
              placeholder="Search name, email or phone"
              resultText={filteredAccounts.length + " of " + accounts.length + " shown"}
            />
            {/* ⚠️ NOT <DashTabs>, and the refusal is semantic rather than
                cosmetic. DashTabs renders role="tablist" with aria-selected,
                which is a claim that these switch between SECTIONS of the page.
                These are a FILTER over one list — the tab is still "accounts"
                whichever chip is lit, and the search box beside them composes
                with them rather than replacing them. Announcing a filter as a
                tablist would tell a screen reader the page changed when it did
                not. `s.tab`/`s.activeTab` were deleted, so the chips now carry
                `.ffd-tab` from the shared sheet — the same chip the real tab
                strip uses, which is the point: they LOOK the same because they
                come from one rule, while meaning something different in the
                accessibility tree. The padding override that used to shrink
                them is gone too; it was pushing them under the 48px thumb
                floor that the pointer:coarse block promises. */}
            <div className="ffd-tabs" style={{ marginBottom:"1rem" }}>
              {(["all","client","contractor","admin","orphaned"] as const).map(rf => (
                <button key={rf} type="button" onClick={() => setAccountRole(rf)}
                  aria-pressed={accountRole === rf}
                  className={accountRole === rf ? "ffd-tab ffd-on" : "ffd-tab"}
                  style={{ textTransform:"capitalize" as const }}>
                  {rf}{rf === "all" ? ` (${accounts.length})` : ` (${accounts.filter(a => rf === "orphaned" ? a.orphaned : (a.role || "") === rf).length})`}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" as const, marginBottom:"1rem", padding:".7rem .85rem", background:"rgba(var(--ff-accent-rgb), .06)", border:"1px solid rgba(var(--ff-accent-rgb), .2)", borderRadius:"8px" }}>
              <span style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)", flex:1 }}>
                Email accounts a custom message{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}.
              </span>
              {selectedIds.size > 0 && (
                <Button variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              )}
              {/* Three identically orange-tinted raw buttons became one primary
                  and two secondaries. The primary is the one that acts on what
                  the admin has already selected; "email EVERY contractor" is the
                  bigger hammer and deliberately the quieter button. */}
              <Button variant="primary"
                disabled={selectedIds.size === 0} onClick={() => setMsgRecipients(selectedRecipients())}>
                <Ic name="mail" size={13} style={{ marginRight:4 }} />Email selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </Button>
              <Button
                disabled={contractorAccts.length === 0} onClick={() => setMsgRecipients(contractorAccts.map(toRecipient))}>
                <Ic name="mail" size={13} style={{ marginRight:4 }} />Email all contractors ({contractorAccts.length})
              </Button>
              <Button
                disabled={clientAccts.length === 0} onClick={() => setMsgRecipients(clientAccts.map(toRecipient))}>
                <Ic name="mail" size={13} style={{ marginRight:4 }} />Email all clients ({clientAccts.length})
              </Button>
            </div>
            {accounts.some(a => a.orphaned) && !hiddenNow.has("orphans") && (
              <div style={{ display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" as const, marginBottom:"1rem", padding:".7rem .85rem", background:"rgba(var(--ff-accent-rgb), .06)", border:"1px solid rgba(var(--ff-accent-rgb), .2)", borderRadius:"8px" }}>
                <span style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)", flex:1 }}>
                  {accounts.filter(a => a.orphaned).length} account{accounts.filter(a => a.orphaned).length>1?"s":""} signed in but never finished onboarding.
                </span>
                <Button variant="primary"
                  disabled={busyNudge} onClick={nudgeIncomplete}>
                  <Ic name="mail" size={13} style={{ marginRight:4 }} />{busyNudge ? "Sending…" : "Email a finish-signup reminder"}
                </Button>
                {/* Session-only. This is a live count of people who are stuck
                    mid-signup — the exact state health check 7 exists to catch —
                    so it must come back, and the orphaned filter chip above
                    still lists them either way. */}
                <DismissX onClick={() => hideNow("orphans")} label="Hide this" title="Hide until the next load" />
              </div>
            )}
            {filteredAccounts.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No matching accounts.</p>}
            {filteredAccounts.map(a => {
              const nm = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.company_name || "(no name)";
              const isContractor = (a.role === "contractor") || !!a.company_name || (a.specialties && a.specialties.length);
              return (
                <DashCard key={a.id}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:".55rem" }}>
                      {a.email && (
                        <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)}
                          title="Select for bulk email" style={{ width:16, height:16, accentColor:"var(--ff-c10)", cursor:"pointer" }} />
                      )}
                      <div style={s.title}>{nm}{a.company_name && a.company_name !== nm ? ` · ${a.company_name}` : ""}</div>
                    </div>
                    {roleChip(a.role)}
                  </div>
                  {a.orphaned && <div style={{ fontSize:".74rem", color:"var(--ff-warn)", marginBottom:".3rem" }}>⚠ No profile row (orphaned auth account)</div>}
                  {flagMatches[a.id] && (
                    <div style={{ marginTop:".3rem", marginBottom:".4rem", padding:".6rem .8rem", background:"rgba(var(--ff-danger-rgb), .12)", border:"1px solid rgba(var(--ff-danger-rgb), .4)", borderRadius:"8px", color:"var(--ff-danger)", fontSize:".8rem", lineHeight:1.45 }}>
                      {"Possible re-signup — matches a previously deleted account that had poor reviews (avg "}
                      {flagMatches[a.id].avg}{"/10 over "}{flagMatches[a.id].count}{" review"}{flagMatches[a.id].count === 1 ? "" : "s"}{", deleted "}
                      {new Date(flagMatches[a.id].date).toLocaleDateString()}{"). Matched on "}{flagMatches[a.id].fields.join(", ")}{"."}
                    </div>
                  )}
                  {editEmailId === a.id ? (
                    <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, alignItems:"center", margin:".3rem 0 .45rem" }}>
                      <input value={editEmailVal} onChange={e => setEditEmailVal(e.target.value)} type="email" placeholder="new@email.com" autoComplete="off"
                        style={{ padding:".4rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .18)", borderRadius:"7px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".82rem", flex:"1 1 210px", minWidth:0 }} />
                      <Button variant="primary" disabled={busyEmailEdit === a.id} onClick={() => saveEmail(a)}>
                        {busyEmailEdit === a.id ? "Saving…" : "Save"}
                      </Button>
                      <Button variant="ghost" disabled={busyEmailEdit === a.id} onClick={() => setEditEmailId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div style={{ ...s.meta, display:"flex", alignItems:"center", gap:".5rem", flexWrap:"wrap" as const }}>
                      <span>{[a.email, a.phone || a.meta_phone].filter(Boolean).join(" · ") || "—"}</span>
                      {/* The old inline style shrank this to .72rem and .2rem of
                          vertical padding, which put it well under the 48px
                          thumb floor. Porting it to the primitive drops those
                          overrides rather than carrying them through — an
                          inline padding would have beaten the class and
                          re-created the Fitts violation inside the fix. */}
                      <Button variant="ghost" onClick={() => { setEditEmailId(a.id); setEditEmailVal(a.email || ""); }}>
                        <Ic name="mail" size={11} style={{ marginRight:3 }} />Edit email
                      </Button>
                    </div>
                  )}
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .4)" }}>
                    ID {a.id.slice(0,8)} · joined {a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}
                    {a.last_sign_in_at ? ` · last seen ${new Date(a.last_sign_in_at).toLocaleDateString()}` : " · never signed in"}
                  </div>
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>{a.request_count ?? 0} request{(a.request_count ?? 0) === 1 ? "" : "s"} · {a.job_count ?? 0} job{(a.job_count ?? 0) === 1 ? "" : "s"}</div>
                  {isContractor && (
                    <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .07)", borderRadius:"8px" }}>
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
                              <Button
                                disabled={busyPayoutCheck === a.id} onClick={() => checkPayout(a.id)}>
                                {busyPayoutCheck === a.id ? "Checking Stripe…" : "What's blocking their payouts?"}
                              </Button>
                            ) : chk.error ? (
                              <div style={{ ...s.meta, color:"var(--ff-danger)" }}>Couldn't check Stripe: {chk.error}</div>
                            ) : (
                              <div style={{ padding:".55rem .7rem", borderRadius:"8px", background:"rgba(var(--ff-accent-rgb), .06)", border:"1px solid rgba(var(--ff-accent-rgb), .18)" }}>
                                {steps.length > 0 ? (
                                  <>
                                    <div style={{ fontSize:".74rem", fontWeight:600, color:"var(--ff-c10)", marginBottom: "var(--ff-s1)" }}>Stripe is still waiting on:</div>
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
                        <div style={s.meta}><a href={a.google_reviews_url} target="_blank" rel="noreferrer" style={{ color:"var(--ff-c10)" }}>Google reviews page ↗</a></div>
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
                                <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginTop: "var(--ff-s1)" }}>
                                  {docKeys.map(k => (
                                    <Button key={k} variant="ghost" onClick={() => openDoc(docs[k])}>
                                      <Ic name="file" size={12} style={{ marginRight:4 }} />{DOC_LABELS[k] || k} ↗
                                    </Button>
                                  ))}
                                </div>
                              </>
                            )}
                            {(a.photo_url || portfolio.length > 0) && (
                              <>
                                <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .6)", fontWeight:500, marginTop:".5rem" }}>Photos</div>
                                <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginTop: "var(--ff-s1)" }}>
                                  {a.photo_url && (
                                    <FadeImg src={a.photo_url} alt="Profile" onClick={() => window.open(a.photo_url, "_blank")}
                                      style={{ width:60, height:60, objectFit:"cover", borderRadius:8, cursor:"pointer", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)" }} />
                                  )}
                                  {portfolio.map((p:any, i:number) => {
                                    const url = pubUrl("portfolio-photos", p.path);
                                    return (
                                      <FadeImg key={i} src={url} alt={p.title || "Portfolio"} title={p.title || ""} onClick={() => window.open(url, "_blank")}
                                        style={{ width:60, height:60, objectFit:"cover", borderRadius:8, cursor:"pointer", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)" }} />
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                      {/* Vetting state is "pending us", which is what the warn
                          tone is for; active is settled, which is good. The
                          raw --ff-accent-500 chip this replaced was orange for
                          every state including the settled one. */}
                      <div style={{ marginTop:".35rem" }}>
                        <Pill tone={a.contractor_status === "active" ? "good" : a.contractor_status ? "warn" : "neutral"}>
                          {a.contractor_status || "—"}
                        </Pill>
                      </div>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:".5rem", marginTop:".75rem", flexWrap:"wrap" as const }}>
                    {isContractor && (
                      <Button onClick={() => window.open("/contractors/" + a.id, "_blank")}>View Profile ↗</Button>
                    )}
                    {a.email && (
                      <Button
                        onClick={() => setMsgRecipients([toRecipient(a)])}>
                        <Ic name="mail" size={13} style={{ marginRight:4 }} />Email
                      </Button>
                    )}
                    {isContractor && a.contractor_status !== "active" && (
                      // The one primary in this cluster. Approving a contractor
                      // is the action the admin opened the account for; the rest
                      // are things he might also do while he is here.
                      <Button variant="primary"
                        disabled={busyStatus === a.id} onClick={() => setContractorStatus(a.id, "active")}>
                        {busyStatus === a.id ? "…" : "Approve"}
                      </Button>
                    )}
                    {isContractor && a.contractor_status === "active" && (
                      <Button variant="danger"
                        disabled={busyStatus === a.id} onClick={() => setContractorStatus(a.id, "inactive")}>
                        {busyStatus === a.id ? "…" : "Deactivate"}
                      </Button>
                    )}
                    <Button disabled={busyMfa === a.id} onClick={() => clearMfa(a)}
                      title="Use only when someone has lost both their email and their recovery codes">
                      <Ic name="key" size={13} style={{ marginRight:4 }} />{busyMfa === a.id ? "…" : "Turn off two-step"}
                    </Button>
                    <Button variant="danger" style={{ marginLeft:"auto" }}
                      disabled={busyDeleteAccount === a.id} onClick={() => deleteAccount(a)}>
                      <Ic name="trash" size={13} style={{ marginRight:4 }} />{busyDeleteAccount === a.id ? "Deleting…" : "Delete account"}
                    </Button>
                  </div>
                </DashCard>
              );
            })}
          </div>
        )}

        {tab === "jobs" && (() => {
          const tokens = searchTokens(search);
          const shown = jobs.filter(j => matchesSearch(tokens, adminJobFields(j)));
          return (
          <div>
            {jobs.length > 3 && (
              <DashSearch
                value={search}
                onChange={setSearch}
                placeholder="Search this page — job code, service, client, pro or status"
                resultText={shown.length + " of " + jobs.length + " on this page (searches the page you're on, not all " + counts.jobs + ")"}
              />
            )}
            {jobs.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No jobs yet.</p>}
            {/* A query that empties the list is a different fact from an empty
                page, and the pager is the fix for one and not the other. */}
            {jobs.length > 0 && shown.length === 0 && (
              <p style={{ color:"rgba(var(--ff-muted), .45)", fontSize:".9rem" }}>
                Nothing on this page matches “{search}”. Try the next page, or{" "}
                <button type="button" onClick={() => setSearch("")} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".9rem", fontWeight:600, cursor:"pointer", padding:0 }}>clear the search</button>.
              </p>
            )}
            {shown.map(j => (
              // ⚠️ <DashCard> and NOT a <Row>: this card mounts <ContractPanel>
              // and <MilestonePanel>, which are the fail-closed payment gate and
              // the escrow stage list. A Row has one `sub` slot and could not
              // hold either, and dropping the ContractPanel mount is exactly
              // what made every job unpayable with no error in fa5e2b5.
              <DashCard key={j.id}>
                <div style={s.title}>
                  {j.request?.service_needed || "Job"} <span style={{ fontFamily:"monospace", color:"var(--ff-c10)", fontSize:".8em" }}>{jobCode(j.id)}</span>
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
                  <Button onClick={() => setChatJob(j)}><Ic name="message-square" size={13} style={{ marginRight:4 }} />Read chat</Button>
                  <Button variant="danger" disabled={busyJob === j.id} onClick={() => deleteJob(j)}><Ic name="trash" size={13} style={{ marginRight:4 }} />{busyJob === j.id ? "Deleting…" : "Delete job"}</Button>
                </div>
              </DashCard>
            ))}
            {pager("jobs")}
          </div>
          );
        })()}

        {tab === "picks" && <AdminPicksTab tabNote={tabNote} picksFailed={picksFailed} loadAll={loadAll} picks={picks} />}

        {tab === "flagged" && <AdminFlaggedTab tabNote={tabNote} chatFlagsFailed={chatFlagsFailed} loadAll={loadAll} chatFlags={chatFlags} s={s} />}

        {tab === "prepaid" && <AdminPrepaidTab prepaysFailed={prepaysFailed} loadAll={loadAll} prepays={prepays} busyRefund={busyRefund} refundPrepay={refundPrepay} />}

        {tab === "disputes" && <AdminDisputesTab disputes={disputes} s={s} disputePhotos={disputePhotos} disputeRespPhotos={disputeRespPhotos} resolveNote={resolveNote} setResolveNote={setResolveNote} busyResolve={busyResolve} resolveDispute={resolveDispute} partialAmt={partialAmt} setPartialAmt={setPartialAmt} />}

        {tab === "leads" && (
          <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Estimate requests from visitors who haven't signed up. Reach out, then mark them contacted.
            </p>
            {leads.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No estimate leads yet.</p>}
            {leads.map(l => (
              /* A <DashCard>, not a <Row>: the payload is the visitor's own
                 words plus two tappable contact links, and the mailto/tel
                 targets are the point of the record. */
              <DashCard key={l.id} style={l.status === "new" ? { borderColor:"rgba(var(--ff-accent-rgb), .4)" } : undefined}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap" as const, gap:".5rem" }}>
                  <div style={s.title}>{l.service_needed || "General enquiry"}</div>
                  {/* `warn` and NOT `accent`, even though a new lead does want
                      you: there are N leads on this tab, so an accent chip per
                      card would spend the one-orange budget N times. "Pending
                      us" is exactly what `warn` means. */}
                  <Pill tone={l.status === "new" ? "warn" : "good"}>{l.status === "new" ? "New" : "Contacted"}</Pill>
                </div>
                <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{l.name || "—"}</div>
                <div style={s.meta}>
                  {l.email ? <a href={"mailto:" + l.email} style={{ color:"var(--ff-c10)", textDecoration:"none" }}>{l.email}</a> : null}
                  {l.email && l.phone ? " · " : ""}
                  {l.phone ? <a href={"tel:" + l.phone} style={{ color:"var(--ff-c10)", textDecoration:"none" }}>{l.phone}</a> : null}
                </div>
                {l.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{l.location}</div>}
                {l.details && (
                  <div style={{ marginTop:".5rem", padding:".6rem .8rem", background:"rgba(var(--ff-fg), .03)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>{l.details}</div>
                )}
                <div style={{ ...s.meta, marginTop:".4rem", color:"rgba(var(--ff-muted), .45)" }}>Received {new Date(l.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}</div>
                {l.status === "new" && (
                  <div style={{ marginTop:".75rem" }}>
                    <Button disabled={busyLead === l.id} onClick={() => markLeadContacted(l.id)}>{busyLead === l.id ? "…" : "Mark contacted"}</Button>
                  </div>
                )}
              </DashCard>
            ))}
          </div>
        )}

        {/*
          Agents — the background team's proposal queue, plus whether each agent is
          actually running.

          TWO panels, on purpose, because they answer two different questions and a
          single list could only ever answer the first:
            · the queue says "what is waiting on me"
            · the roster says "is anything silently not running at all"

          The roster is the one that matters here. Every outage this platform has
          ever had was an ABSENCE — an email that never sent, a mount that got
          dropped, a module that built to zero bytes — and an agent that quietly
          stops producing looks exactly like an agent with nothing to say. The queue
          alone cannot tell those apart, which is why the roster reads from
          agent_registry (a declared list) rather than from the runs it has seen.

          `stale` is computed in the DB against each agent's OWN declared cadence,
          and a disabled agent is never stale. That is deliberate: `enabled` means "a
          harness exists and this is expected to run", so nothing goes red until
          somebody claims it is running. A permanently-red panel is one the owner
          learns to scroll past, and that would undo the point of having it.
        */}
        {tab === "agents" && <AdminAgentsTab agentOverview={agentOverview} agentActions={agentActions} agentFilter={agentFilter} actionsFailed={actionsFailed} loadAll={loadAll} setAgentFilter={setAgentFilter} actionEdit={actionEdit} s={s} busyDraft={busyDraft} draftLead={draftLead} draftErr={draftErr} copyText={copyText} copiedKey={copiedKey} setActionEdit={setActionEdit} busyReview={busyReview} reviewAction={reviewAction} agentsFailed={agentsFailed} />}

        {/*
          Activity — every destructive admin action, newest first.
          Read-only by construction: admin_audit_log has a SELECT policy and no
          INSERT/UPDATE/DELETE policy at all, and writes go only through
          log_admin_action, which is granted to service_role. There is deliberately
          no "clear" button here and there never should be — a log the dashboard
          can erase is not a log.
          Times come pre-formatted from the DB as at_local (ff_local_ts), NOT
          formatted here: a bare to_char on a timestamptz renders Calgary times
          6–7 hours ahead, and doing it in two places is how they drift apart.
        */}
        {tab === "activity" && <AdminActivityTab auditFailed={auditFailed} loadAll={loadAll} audit={audit} />}

        {tab === "health" && <AdminHealthTab health={health} healthFailed={healthFailed} loadAll={loadAll} />}

        {tab === "platform" && <AdminPlatformTab platFailed={platFailed} loadAll={loadAll} platMode={platMode} changeMode={changeMode} busyPlatform={busyPlatform} s={s} noticeDraft={noticeDraft} setNoticeDraft={setNoticeDraft} saveNotice={saveNotice} heldReqs={heldReqs} setHeldSel={setHeldSel} heldSel={heldSel} releaseHeld={releaseHeld} busyRelease={busyRelease} waitlistRows={waitlistRows} />}
      </DashContent>
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
      {/* Mounted once, for every refused action. `askConfirm`'s lesson applies
          here too: the handler above hands control to this component, so a
          missing mount would leave a button that silently does nothing. */}
      {verifyGate && (
        <VerifyCodeModal
          what={verifyGate.what}
          onDone={() => { const again = verifyGate.retry; setVerifyGate(null); again(); }}
          onCancel={() => setVerifyGate(null)}
        />
      )}
    </DashShell>
  );
}
