import { Ic, type IconName } from "@/components/Ic";
import { DashboardSkeleton, useEnterAnim } from "@/components/Skeleton";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { clearMyProfile, dashboardFor } from "@/lib/myProfile";
import { readAuthUser } from "@/lib/authRead";
import { getCommissionRate, getFeeRate } from "@/lib/platformRates";
import { compressImage } from "@/lib/imageCompress";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import ScheduleField from "@/components/ScheduleField";
import JobChat from "@/components/JobChat";
import ChatTimePrompt from "@/components/ChatTimePrompt";
import MessagesInbox, { partyName } from "@/components/MessagesInbox";
import { useConversations, conversationKey, chatReadOnly, chatClosedReason, type Conversation } from "@/lib/chatUnread";
import { useBidThreads, bidToConversation } from "@/lib/bidThreads";
import { formatWhen } from "@/lib/chatParse";
import JobTimeline from "@/components/JobTimeline";
import { readAvailability } from "@/lib/availability";
import RespondToClaim from "@/components/RespondToClaim";
import ConfirmDialog, { type ConfirmState } from "@/components/ConfirmDialog";
import ProfileCompletionModal from "@/components/ProfileCompletionModal";
import ProfileCompleteCelebration from "@/components/ProfileCompleteCelebration";
import DashboardSidebar, { type SidebarItem } from "@/components/DashboardSidebar";
import RequestHelpModal from "@/components/RequestHelpModal";
import { jobCode } from "@/lib/jobCode";
import { jobBalanceDue, jobAwaitingBalance, jobFullyFunded } from "@/lib/jobFunding";
import { priceChangeMath, pcMoney, pcRateLabel } from "@/lib/priceChange";
import JobsCalendar from "@/components/JobsCalendar";
import JobTimer from "@/components/JobTimer";
import JobChecklist from "@/components/JobChecklist";
import JobPhotos, { photosMissing } from "@/components/JobPhotos";
import JobExpenses, { type JobExpense } from "@/components/JobExpenses";
import ContractPanel, { CONTRACT_ANCHOR } from "@/components/ContractPanel";
import BidChat from "@/components/BidChat";
import DismissX from "@/components/DismissX";
import DashSearch from "@/components/DashSearch";
import { searchTokens, matchesSearch } from "@/lib/dashSearch";
import { Pass, PassTop, IconButton, StateLine, Hero, HeroSub, PassMeta, PassMetaItem, JobSwitcher, AttentionCard, Row, Button, DashShell, DashContent, DashCard, type State, type RowTone } from "@/components/ui";

/**
 * Every tab this page can route to. This array is the ROUTING table, not the
 * sidebar — what a contractor actually sees is `visibleNav()` below, which is a
 * filter over it. Never trim this array to tidy the sidebar; trim the filter
 * instead, or a live deep link starts landing on nothing.
 */
const CONTRACTOR_NAV: SidebarItem[] = [
  { key: "jobs",      label: "My Jobs",        icon: "briefcase" },
  { key: "available", label: "Available Jobs", icon: "search" },
  { key: "messages",  label: "Messages",       icon: "message-square" },
  { key: "calendar",  label: "Calendar",       icon: "calendar" },
  { key: "earnings",  label: "Earnings",       icon: "dollar" },
  { key: "reviews",   label: "Reviews",        icon: "star" },
  { key: "profile",   label: "Profile",        icon: "user" },
];

/**
 * The sidebar a contractor actually gets.
 *
 * ⚠️ This page had NO filter at all — all seven items showed from minute one,
 * and for a pro who had never been awarded a job, four of the seven opened an
 * empty state: Calendar drew an empty month, Earnings showed $0 against a goal
 * bar with nothing in it, Reviews said "No Reviews Yet", and only My Jobs,
 * Available Jobs, Messages and Profile did anything. Client and Admin had both
 * already solved this; Contractor was the outlier, which is the same shape as
 * every other divergence this pass closed — nobody decided it.
 *
 * Hick's law is the reason this matters rather than being tidiness: the cost of
 * a choice is the number of options, so four dead options make the three live
 * ones measurably slower to find. Each one appears the moment it has something
 * in it, and `CONTRACTOR_NAV` stays whole so the key is still routable if an
 * older link or a `ff:dash-nav` event aims at it.
 *
 * Calendar keys on a job with a `scheduled_at`, not on having any job at all —
 * JobsCalendar buckets by that field, so a pro with assigned-but-unscheduled
 * work would still get an empty grid.
 */
function visibleNav(opts: { scheduled: number; earned: number; reviews: number }): SidebarItem[] {
  const show = new Set<string>(["jobs", "available", "messages", "profile"]);
  if (opts.scheduled > 0) show.add("calendar");
  if (opts.earned > 0)    show.add("earnings");
  if (opts.reviews > 0)   show.add("reviews");
  return CONTRACTOR_NAV.filter(it => show.has(String(it.key)));
}

// Pipeline-stage matchers — single source shared by the workflow strip counters
// and the My Jobs stage filter, so a stage's count always equals what its click shows.
const STAGE_MATCH: Record<string, (j: any) => boolean> = {
  propose:   j => j.status === "assigned" && !j.schedule_proposed_at,
  awaiting:  j => j.status === "assigned" && !!j.schedule_proposed_at,
  scheduled: j => j.status === "scheduled",
  working:   j => j.status === "in_progress",
  payment:   j => j.status === "pending_confirmation" || (j.status === "completed" && j.payment_status === "held"),
};
// Mirrors the server guard `job_money_block()`, which `withdraw_job()` calls.
// Withdrawal HARD-DELETES the job and every child cascades, so the DB refuses it
// the moment any money is attached. The button was rendered unconditionally, which
// meant it sat there dead on every deposit-paid job with nothing on screen saying so.
//
// It is deliberately STRICTER than the server, in the two places the browser can't
// see the whole truth: a milestone job holds real money per stage while
// jobs.payment_status is still 'unpaid', and `processing` means a Stripe checkout
// may be open right now. Over-hiding a destructive control costs a contractor one
// email; over-showing it offers to delete the only pointer to a live charge.
const canWithdraw = (j: any): boolean =>
  (j?.payment_status ?? "unpaid") === "unpaid" &&
  !j?.is_milestone &&
  !j?.prepayment_id;

/**
 * Where this pro is actually going, and whether it is the real address.
 *
 * Since the approximate-location change, `client_requests.location` is a postal
 * code and a quadrant ("T3A 1B2 · NW Calgary") — deliberately, because that row
 * is readable by all seven pros a job is dispatched to. The street address is
 * collected once, at deposit time, into `jobs.service_address`, which only the
 * two job parties can read.
 *
 * So a job card has TWO possible destinations and they mean different things:
 * navigating to a postal centroid drops a pro somewhere on the right block and
 * nowhere near the right door. This is the ONE place that decides between them,
 * shared by the card list and the directions tile, so a pro can never be shown
 * an exact address in one and sent to the centroid by the other.
 *
 * `exact` is what the callers key their wording on. Never label an approximate
 * area as an address: a pro who believes they have the address will not ask.
 */
const jobDestination = (j: any): { text: string; exact: boolean } => {
  const exact = String(j?.service_address || "").trim();
  if (exact) return { text: exact, exact: true };
  return { text: String(j?.request?.location || "").trim(), exact: false };
};

const STAGE_LABEL: Record<string, string> = {
  propose: "needs your estimate",
  awaiting: "awaiting client approval",
  scheduled: "scheduled",
  working: "in progress",
  payment: "awaiting payment",
};

// The contractor can dismiss the profile nudge if they believe they're done.
// The token records WHICH gaps were dismissed, so if the set later changes
// (e.g. insurance lapses) the nudge comes back rather than staying silent.
const nudgeToken = (gaps: ProfileGap[]) => "profile_nudge:" + gaps.map(g => g.key).sort().join(",");

/**
 * What a search query is matched against — one definition per list, so the
 * box and the rows can't disagree about what "searchable" means.
 *
 * The job code is included because it is the identifier a client quotes on the
 * phone, and it is the only thing on the card that is unique. Nothing private
 * to the other party goes in here: matching is done on text already rendered.
 */
const jobSearchFields = (j: any): (string | number | null | undefined)[] => [
  j?.request?.service_needed, jobDestination(j).text, j?.client?.first_name,
  j?.status?.replace("_", " "), j?.amount, jobCode(j?.id ?? ""),
  j?.scheduled_at ? new Date(j.scheduled_at).toLocaleDateString() : null,
];
import FreddyRewind from "@/components/FreddyRewind";
import MilestonePanel from "@/components/MilestonePanel";
import { useServicePricing, type ServicePrice } from "@/lib/servicePricing";
import { freqLabel } from "@/lib/recurrence";
import { jobIsLive } from "@/lib/jobStage";
import { DASH_NAV_EVENT, readDashNavFromUrl, clearDashNavFromUrl, type DashNavDetail } from "@/lib/notificationRoutes";
import { needsFor, pendingText, disabledText } from "@/lib/stripeRequirements";
import FadeImg from "@/components/FadeImg";
import { ffInp, QuoteBreakdown, contractorMissing, contractorGaps, type ProfileGap } from "./contractor/shared";
import ContractorAvailableTab from "./contractor/ContractorAvailableTab";
import ContractorProfileTab from "./contractor/ContractorProfileTab";
import ContractorEarningsTab from "./contractor/ContractorEarningsTab";
import ContractorReviewsTab from "./contractor/ContractorReviewsTab";

// Section anchors inside the EXPANDED job card, so a "Needs your attention"
// button can land on the control it names rather than on the card header.
//
// These are deliberately bare ids, NOT keyed per job: exactly one job card is
// expanded at a time (`activeJobId === job.id`), so each id is unique in the
// document — the same reasoning that lets ContractPanel ship a single
// CONTRACT_ANCHOR. Keying them per job would break the pulse, which compares
// `pulseAnchor` to the id by string.
const A_CLAIM    = "ffp-claim";
const A_RESCHED  = "ffp-resched";
const A_WALK     = "ffp-walkthrough";
const A_PROPOSE  = "ffp-propose";
const A_PHOTOS   = "ffp-photos";
const A_ONWAY    = "ffp-onway";
const A_BALANCE  = "ffp-balance";

function quoteTotal(f: any): number | null {
  const keys = ["labour","parts","callout"];
  const any = keys.some(k => f?.[k] !== "" && f?.[k] != null);
  if (any) return keys.reduce((t,k) => t + (f[k] ? Number(f[k]) : 0), 0);
  return f?.amount ? Number(f.amount) : null;
}

export default function ContractorDashboard() {
  const [, setLocation] = useLocation();
  const pricing = useServicePricing();
  const priceFor = (svc?: string | null): ServicePrice | null => pricing[(svc || "").split(",")[0].trim()] ?? null;
  const [profile, setProfile]         = useState<any>(null);
  const [contractor, setContractor]   = useState<any>(null);
  const [myJobs, setMyJobs]           = useState<any[]>([]);
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  // job_id -> service-agreement status. The client can't pay until this is
  // "signed", so it drives the "send your agreement" attention row.
  const [contracts, setContracts]     = useState<Record<string, string>>({});
  // True when the job_contracts read failed, so "needs a signed agreement" stays
  // silent instead of firing off an empty map (see loadContracts).
  const [contractsFailed, setContractsFailed] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string|null>(null);
  const [chatJob, setChatJob]         = useState<any|null>(null);
  const [timeDismissed, setTimeDismissed] = useState<Set<string>>(new Set());
  const [confirmState, setConfirmState] = useState<ConfirmState|null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<"jobs"|"available"|"messages"|"calendar"|"profile"|"earnings"|"reviews">("jobs");
  const tabAnim = useEnterAnim(activeTab); // replays a 220ms fade+rise on tab change; nothing remounts
  const [jobFilter, setJobFilter]     = useState<string|null>(null); // pipeline-strip stage filter for the My Jobs list
  const [search, setSearch]           = useState(""); // client-side filter over already-loaded rows; no query, no new RLS surface
  /**
   * Attention rows the contractor has hidden — SESSION ONLY, deliberately.
   *
   * Nothing in this list is safe to dismiss forever. `claim-`, `bal-`,
   * `contract-` and `photo-` are money and payout gates; `resched-`, `wt-`,
   * `wtdone-`, `slot-`, `propose-` and `soon-` are action-required state that
   * changes underneath the row; `reserved` and `msg-` carry NEW information on
   * every load, so a permanent dismissal of "3 unread" would silence every
   * future message. Note the contractor `photo-` row is the opposite of the
   * client's "photo" row — theirs is an optional advisory, this one is what
   * stops them marking the job complete and getting paid.
   *
   * So there is no `ui_dismissals` write here. The banner above it persists its
   * dismissal, because "my profile is complete" is a fact that stays true.
   */
  const [hiddenNow, setHiddenNow]     = useState<Set<string>>(new Set());
  const [pendingJobId, setPendingJobId] = useState<string|null>(null); // job a notification pointed at, waiting for the list to load
  const [bidsCount, setBidsCount]     = useState(0); // lifetime bids — drives the "place your first bid" setup step
  const [showProfileCongrats, setShowProfileCongrats] = useState(false);
  // Contractor guide card — shown until they open it or dismiss it. Local only;
  // it's a nudge, not something worth a database column.
  const [guideSeen, setGuideSeen] = useState<boolean>(() => {
    try { return localStorage.getItem("ff_seen_contractor_guide") === "1"; } catch { return false; }
  });
  const dismissGuide = () => {
    try { localStorage.setItem("ff_seen_contractor_guide", "1"); } catch { /* storage can be unavailable (private mode); best effort */ }
    setGuideSeen(true);
  };
  // One payload behind the Messages tab, the sidebar badge and every per-job
  // unread dot — they read the same array, so a badge can't outlive its list.
  const {
    conversations, totalUnread, unreadFor,
    loading: convLoading, error: convError,
    refresh: refreshConvs, markRead: markConvRead,
  } = useConversations(profile?.id);
  // The OTHER half of the same inbox. `my_conversations()` is job-scoped and
  // `my_bid_threads()` is request-scoped, so two RPCs feed what the pro
  // experiences as one Messages tab. Merged below into `inboxRows`.
  //
  // For a contractor the RPC returns only threads the CLIENT has already opened
  // — the pro replies, never initiates — so an empty list genuinely means
  // nobody has written. The hook keeps it live; before it existed a question
  // arriving while the dashboard was open showed up nowhere until a reload.
  const bid = useBidThreads(profile?.id);
  // ONE list behind the Messages tab. Only STARTED bid threads join it — see
  // `bidThreadStarted` — and the merge sorts by last message so the newest
  // conversation is at the top regardless of which RPC it came from.
  const inboxRows: Conversation[] = [
    ...conversations,
    ...bid.started.map(t => bidToConversation(t, profile?.id)),
  ].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  // The badge counts BOTH halves, or a client's pre-hire question produces no
  // badge anywhere — which is most of what "no way of replying" was.
  const msgUnread = totalUnread + bid.totalUnread;
  // Rendering rules for a list fed by two calls that can fail independently:
  // only claim "loading" while we have nothing to show, and only show the error
  // state when BOTH halves failed — a working half must never be hidden behind
  // the other's failure.
  const inboxLoading = (convLoading || bid.loading) && inboxRows.length === 0;
  const inboxError   = convError && bid.error;
  const [showCustomAvail, setShowCustomAvail] = useState(false);
  const [proposeForm, setProposeForm] = useState<{ when:string; amount:string; notes:string; labour:string; parts:string; callout:string; subject:boolean; price_low:string; price_high:string; used_base_price:boolean; items:{label:string;amount:string}[] }>({ when:"", amount:"", notes:"", labour:"", parts:"", callout:"", subject:false, price_low:"", price_high:"", used_base_price:false, items:[] });
  const [busyJobId, setBusyJobId]     = useState<string | null>(null); // per-job busy flag — only the job being acted on shows a spinner/disables
  const [portfolio, setPortfolio]     = useState<any[]>([]);
  const [pfForm, setPfForm]           = useState<{ title:string; description:string; file:File|null }>({ title:"", description:"", file:null });
  const [googleUrl, setGoogleUrl]     = useState("");
  const [busyPf, setBusyPf]           = useState(false);
  const [bidForm, setBidForm]         = useState<Record<string,{amount:string;message:string;labour?:string;parts?:string;callout?:string;assumptions?:string;subject?:boolean;price_low?:string;price_high?:string;used_base_price?:boolean;walkthrough?:boolean}>>({});
  const [requoteOpen, setRequoteOpen] = useState<Record<string,boolean>>({});
  const [requoteForm, setRequoteForm] = useState<Record<string,{amount:string;reason:string;labour:string;parts:string;callout:string;subject:boolean;price_low?:string;price_high?:string;used_base_price?:boolean}>>({});
  const [pricingForm, setPricingForm] = useState({ hourly:"", callout:"" });
  const [busyPricing, setBusyPricing] = useState(false);
  const [hiding, setHiding]           = useState<string|null>(null);
  const [busyBid, setBusyBid]         = useState<string|null>(null);
  const [bidOpen, setBidOpen]         = useState<Record<string,boolean>>({});
  const [bidChat, setBidChat]         = useState<{ requestId:string; name:string; title?:string|null } | null>(null);
  const [busyStripe, setBusyStripe]   = useState(false);
  // What Stripe is still waiting on, straight from refresh-connect-status (v11).
  // Empty until that call returns; the banner falls back to generic copy.
  const [stripeNeeds, setStripeNeeds] = useState<{ requirements: string[]; pending: string[]; disabled_reason: string | null }>(
    { requirements: [], pending: [], disabled_reason: null },
  );
  const [myReviews, setMyReviews]     = useState<any[]>([]);
  const [disputes, setDisputes]       = useState<Record<string, any>>({});
  const [claimPhotos, setClaimPhotos] = useState<Record<string, string>>({});
  const [claimToAnswer, setClaimToAnswer] = useState<any|null>(null);
  const [earn, setEarn]               = useState<any>(null);
  const [respMins, setRespMins]       = useState<number|null>(null); // own median first-response time (speed-to-lead)
  const [expenses, setExpenses]       = useState<JobExpense[]>([]);  // job costing — contractor-private (RLS scopes to own rows)
  const [expensesFailed, setExpensesFailed] = useState(false);       // read failed ≠ no costs logged
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

  // Every "Needs your attention" button lands on the CONTROL it names, not on
  // the top of the job card.
  //
  // The card is long — agreement, milestones, timeline, walkthrough, the whole
  // propose form, timer, checklist, expenses, photos — so "Add photos" scrolling
  // to the card header left the pro looking at a heading and hunting downward
  // for the thing they'd just been sent to. On a phone the control was often
  // several screens down. A button that lands near-but-not-on its target reads
  // as a button that did nothing.
  //
  // `ringAnchor` is the one implementation of "scroll there and ring it", shared
  // by the profile-gap chips, the agreement button and every job row. It was
  // pasted twice before this and had already drifted (60ms vs 80ms).
  const [pulseAnchor, setPulseAnchor] = useState<string | null>(null);
  const pulseTimer = useRef<number | null>(null);
  const ringAnchor = (anchorId: string, delay = 80) => {
    setPulseAnchor(anchorId);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulseAnchor(null), 4500);
    // Wait for the tab (and, for a job anchor, the expanded card) to paint
    // before measuring. Falling back to the top of the page is deliberate: a
    // section that isn't on screen for this job's state has no anchor, and
    // scrolling somewhere beats scrolling nowhere.
    requestAnimationFrame(() => window.setTimeout(() => {
      const el = document.getElementById(anchorId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }, delay));
  };
  // Point the contractor at the exact section of their profile that's still
  // missing: jump to the Profile tab, scroll it into view, and ring it.
  const focusProfileGap = (anchor: string) => { setActiveTab("profile"); ringAnchor(anchor, 60); };
  useEffect(() => () => { if (pulseTimer.current) window.clearTimeout(pulseTimer.current); }, []);

  /**
   * Open a job on the Jobs tab and land on one of its sections.
   *
   * Section anchors are only rendered by the EXPANDED card, and exactly one job
   * is expanded at a time, so a bare id like `ffp-photos` is unique in the
   * document — the same reasoning that lets ContractPanel use a single
   * CONTRACT_ANCHOR. Do not key these per job id; the pulse compares by string.
   *
   * `setJobFilter(null)` first, or a stage filter can hide the very job being
   * opened and the scroll finds nothing.
   */
  const focusJobAnchor = (job: any, anchorId: string) => {
    setActiveTab("jobs");
    setJobFilter(null);
    if (activeJobId !== job.id) openJob(job);
    ringAnchor(anchorId);
  };
  const focusContractJob = (job: any) => focusJobAnchor(job, CONTRACT_ANCHOR);
  // Spreads an id + the ring onto whichever section an attention row targets.
  // scrollMarginTop clears the fixed top nav so the section isn't tucked under it.
  const jobAnchor = (id: string, style: React.CSSProperties = {}) => ({
    id,
    className: pulseAnchor === id ? "ff-pulse" : undefined,
    // scrollMarginTop clears the fixed top nav so the section isn't scrolled
    // to a position that tucks it underneath the bar.
    style: { scrollMarginTop: "5.5rem", ...style },
  });

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
      j.amount != null ? (netPayout(j)?.toFixed(2) ?? "") : "",
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
    // Only a CLEAN "no session" answer is a sign-out — see the twin comment in
    // ClientDashboard. A failed read also yields `data.session === null`, so the
    // bare test bounced a signed-in pro to /login, which read the same valid
    // session and sent them back. ProtectedRoute owns the unreadable case and
    // now shows a Try again dead end for it. (2026-11-09)
    supabase.auth.getSession().then(({ data, error }) => {
      if (!error && !data.session) setLocation("/login");
    });
  }, []);

  // One search box, two lists — so the query is cleared on every tab change.
  // Carrying "kitchen" from My Jobs over to Available Jobs would present an
  // empty tab as if there were no work, which is the worst possible lie to
  // tell a contractor looking for leads.
  useEffect(() => { setSearch(""); }, [activeTab]);

  // Pull the service-agreement status for a set of jobs. Called on load for every
  // job, and again after ContractPanel signs so the attention row clears without
  // a refresh.
  //
  // A failed read used to return silently, leaving `contracts[job.id]` undefined —
  // which the attention row below reads as "no agreement has ever been sent" and
  // tells the pro to send one they may already have signed. Record the failure so
  // that row can stay quiet rather than assert something we don't know.
  const loadContracts = async (jobIds: string[]) => {
    if (!jobIds.length) return;
    const { data, error } = await supabase.from("job_contracts").select("job_id, status").in("job_id", jobIds);
    if (error || !data) { setContractsFailed(true); return; }
    setContractsFailed(false);
    setContracts(prev => {
      const next = { ...prev };
      for (const id of jobIds) delete next[id]; // a job with no row is "not started"
      for (const c of data as any[]) next[c.job_id] = c.status;
      return next;
    });
  };

  useEffect(() => {
    const load = async () => {
      setLoadError(false);
      try {
      /*
       * ⚠️ EVERY READ IN THIS LOAD DISCARDED ITS `error`, WHICH MADE THE
       * `loadError` SCREEN BELOW UNREACHABLE (2026-11-09).
       *
       * `supabase.from(...)` and `.rpc(...)` RESOLVE with `{ data, error }` —
       * they do not throw — so the `catch` at the bottom of this effect, the
       * only thing that ever called `setLoadError(true)`, could not fire for a
       * failed query. Every failure therefore arrived as `data: null`, and
       * `prof2`/`con2` ending up null falls through to the "You're almost
       * there" screen 900 lines down, whose only button goes to
       * /contractor-onboarding. So a verified contractor with jobs and money in
       * flight was told to go and sign up again, on a transient network error.
       * That is the endless loop the owner reported, reached from the data side
       * rather than the routing side.
       *
       * WHICH ERRORS ARE FATAL IS A JUDGEMENT AND IT IS WRITTEN DOWN HERE.
       * Fatal = the read decides which SCREEN you see, or hides money:
       * `profiles`/`contractors` (identity — their absence routes to
       * onboarding), `jobs` (the work and the balances), `disputes` (a claim
       * against this pro's money), `list_open_jobs` (an empty Find Work tab is
       * indistinguishable from no work available, which costs them income).
       * Not fatal = portfolio, reviews, the bid count and the earnings rollup:
       * each already has a `?? []` / `?? 0` fallback and none of them changes
       * what the page claims about money. A flaky cosmetic read must not blank
       * a dashboard someone is trying to get paid from.
       */
      /*
       * THREE OUTCOMES, NOT TWO — `readAuthUser()` separates "signed out" from
       * "couldn't tell"; a signed-out getUser() resolves WITH an error, so
       * testing for one would tell a signed-out visitor their jobs are safe and
       * offer a refresh that can never work. See src/lib/authRead.ts.
       *
       * Signed out falls through as before (ProtectedRoute and the getSession
       * effect above both own that case). An unreadable session shows the
       * error+Retry screen rather than the finish-setup screen, whose only
       * button goes to /contractor-onboarding — which is what used to greet an
       * established pro with jobs in flight after one bad network moment.
       */
      const who = await readAuthUser();
      if (who.kind === "unknown") { setLoadError(true); setLoading(false); return; }
      if (who.kind === "signedOut") { setLoading(false); return; }
      const user = { id: who.userId };
      // All six reads key only off user.id, so fire them in parallel instead of
      // waiting on each round-trip in sequence.
      const [
        { data: prof, error: eProf },
        { data: con, error: eCon },
        { data: pf },
        { data: jobs, error: eJobs },
        { data: open, error: eOpen },
        { data: revs },
        { data: disp, error: eDisp },
        { data: earnStats },
        { count: bidsCnt },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("contractors").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("portfolio_items").select("*").eq("contractor_id", user.id).order("created_at", { ascending: false }),
        supabase.from("jobs")
          .select("*, request:client_requests!jobs_request_id_fkey(service_needed, job_description, preferred_schedule, location, photo_path, estimated_quote, quote_notes, vehicle_details, recurring, recurring_frequency, budget_min, budget_max, budget_flexible), client:profiles!jobs_client_id_fkey(first_name)")
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
        supabase.from("bids").select("id", { count: "exact", head: true }).eq("contractor_id", user.id),
      ]);

      // The five load-bearing reads, checked BEFORE the self-repair below —
      // ensure_profile() repairs an account that is genuinely incomplete, and
      // running it because a query timed out would be acting on a wrong answer.
      if (eProf || eCon || eJobs || eDisp || eOpen) { setLoadError(true); setLoading(false); return; }

      // Half-finished signup (e.g. Google one-tap / email-only account): self-repair
      // the account so the dashboard loads and the rest can be completed from the
      // Profile tab, instead of blocking them out. Reaching here now means the
      // rows are genuinely ABSENT, not unreadable.
      let prof2 = prof, con2 = con;
      if (!prof2 || !con2) {
        try {
          const { data: role } = await supabase.rpc("ensure_profile", { p_role: "contractor" });
          clearMyProfile();  // a profile row now exists where it didn't
          if (role && role !== "contractor") {
            // dashboardFor(), not a local ternary — see the twin comment in
            // ClientDashboard. These two had drifted into mirror images of each
            // other, each correct only because of the guard above it.
            setLocation(dashboardFor(role));
            return;
          }
          const [{ data: p2, error: e2 }, { data: c2, error: e3 }] = await Promise.all([
            supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
            supabase.from("contractors").select("*").eq("id", user.id).maybeSingle(),
          ]);
          // The repair ran; if the re-read fails we do not know whether it
          // worked, and "finish setting up" would be a guess. Say so instead.
          if (e2 || e3) { setLoadError(true); setLoading(false); return; }
          prof2 = p2; con2 = c2;
        } catch { /* fall through to the finish-setup screen */ }
      }
      setProfile(prof2);
      setContractor(con2);
      setBidsCount(bidsCnt ?? 0);
      setEarn(earnStats ?? null);
      // Bid threads are NOT loaded here any more — `useBidThreads` owns that list,
      // keeps it live and reloads it itself. A manual fetch here would race the
      // hook and go stale again the moment a message arrived.
      // Speed-to-lead: own median first-response time (fire-and-forget; null = not enough bids yet)
      supabase.rpc("contractor_response_stats")
        .then(({ data }: any) => { const r = (data ?? [])[0]; setRespMins(r ? Number(r.median_minutes) : null); });
      // Job costing: own expense rows (fire-and-forget; RLS scopes to this contractor).
      // A failed read used to be indistinguishable from "no costs logged", which
      // hides the real-profit rollup and invites the pro to re-enter costs they
      // already have. Flag it so the earnings tab can say so instead.
      supabase.from("job_expenses").select("*").order("created_at", { ascending: false })
        .then(({ data, error }: any) => {
          if (error) { setExpensesFailed(true); return; }
          setExpensesFailed(false);
          setExpenses((data ?? []) as JobExpense[]);
        });
      { const wg = (earnStats as { weekly_goal?: number | null } | null)?.weekly_goal; setGoalInput(wg ? String(wg) : ""); }
      setGoogleUrl(con2?.google_reviews_url ?? "");
      // Sync live Stripe payout status (no account.updated webhook needed) and
      // capture what Stripe is still waiting on, so the banner can name the
      // actual missing step instead of a vague "setup isn't finished".
      if (con2?.stripe_account_id && !con2?.stripe_payouts_enabled) {
        supabase.functions.invoke("refresh-connect-status", { body: {} })
          .then(({ data }: any) => {
            if (data && (data.payouts_enabled != null)) {
              setContractor((c: any) => c ? { ...c, stripe_charges_enabled: !!data.charges_enabled, stripe_payouts_enabled: !!data.payouts_enabled } : c);
              setStripeNeeds({
                requirements: Array.isArray(data.requirements) ? data.requirements : [],
                pending: Array.isArray(data.pending_verification) ? data.pending_verification : [],
                disabled_reason: data.disabled_reason ?? null,
              });
            }
          })
          .catch(() => {});
      }
      setPortfolio(pf ?? []);
      const enriched = jobs ?? [];
      setMyJobs(enriched);
      loadContracts(enriched.map((j: any) => j.id));
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

  const [helpOpen, setHelpOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  // Account actions moved to the TopNav gear, which can't reach this page's
  // state — it dispatches, we listen (same pattern as `ff:open-settings`).
  useEffect(() => {
    const help = () => setHelpOpen(true);
    const bug = () => setBugOpen(true);
    window.addEventListener("ff:request-help", help);
    window.addEventListener("ff:report-bug", bug);
    return () => {
      window.removeEventListener("ff:request-help", help);
      window.removeEventListener("ff:report-bug", bug);
    };
  }, []);
  // Walkthrough-first flow: free site visit before the priced estimate.
  const [wtForm, setWtForm] = useState({ when:"", note:"" });
  const [wtOpen, setWtOpen] = useState(false);

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
      items: Array.isArray(job.quote_items) ? job.quote_items.map((i: any) => ({ label: String(i.label ?? ""), amount: i.amount != null ? String(i.amount) : "" })) : [],
    });
    setWtForm({ when: job.walkthrough_at ? toLocalInput(job.walkthrough_at) : "", note: job.walkthrough_note ?? "" });
    setWtOpen(false);
  };

  /**
   * Open a conversation from the inbox. The real job row is preferred so the
   * chat's context strip and quick actions have everything, but the inbox can
   * legitimately list a job this tab hasn't loaded (a finished one, say) — in
   * that case a stub built from the conversation row is enough for the drawer,
   * which reads its own messages regardless.
   */
  const openConversation = (c: Conversation) => {
    // A bid row FIRST, before any job lookup. Its `job_id` is the synthetic
    // `bid:<request>:<pro>` key, which matches no job and is not a uuid — falling
    // through would open JobChat on an id every query would reject.
    if (c.kind === "bid" && c.request_id && profile) {
      setBidChat({
        requestId: c.request_id,
        name: c.other_name ?? c.other_company ?? "Client",
        title: c.service_needed,
      });
      if (c.unread > 0) void bid.markRead(c.request_id, profile.id);
      return;
    }
    const real = myJobs.find(j => j.id === c.job_id);
    setChatJob(real ?? {
      id: c.job_id,
      status: c.job_status,
      scheduled_at: c.scheduled_at,
      amount: c.amount,
      client: { first_name: c.other_name?.split(" ")[0] ?? null },
      request: { service_needed: c.service_needed, location: c.location },
    });
    // Optimistic — the badge clears now, the server catches up.
    if (c.unread > 0) void markConvRead(c.job_id);
  };

  // ── Notification deep links ─────────────────────────────────────────────────
  // Tapping a 🔔 lands here two ways: from another page it navigates with
  // ?tab=&job=, and from this page (where the bell usually lives) wouter would
  // treat the same path as a no-op, so the bell fires ff:dash-nav instead.
  const applyDashNav = (d: DashNavDetail) => {
    if (d.tab && CONTRACTOR_NAV.some(i => i.key === d.tab)) {
      setActiveTab(d.tab as any);
      setJobFilter(null); // a stage filter could otherwise hide the job we're opening
    }
    if (d.jobId) setPendingJobId(d.jobId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const first = readDashNavFromUrl();
    if (first.tab || first.jobId) { applyDashNav(first); clearDashNavFromUrl(); }
    const onNav = (e: Event) => applyDashNav((e as CustomEvent<DashNavDetail>).detail ?? {});
    window.addEventListener(DASH_NAV_EVENT, onNav);
    return () => window.removeEventListener(DASH_NAV_EVENT, onNav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Once the jobs are in, expand the one the notification named and scroll to it.
  useEffect(() => {
    if (!pendingJobId || !myJobs.length) return;
    const job = myJobs.find(j => j.id === pendingJobId);
    setPendingJobId(null);
    if (!job) return; // not one of theirs (or already gone) — the tab switch stands
    if (activeJobId !== job.id) openJob(job);
    setTimeout(() => {
      document.getElementById("job-" + job.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJobId, myJobs]);
  const proposeWalkthrough = async (job: any) => {
    if (!wtForm.when) { notify("Pick a date and time for the walkthrough."); return; }
    setBusyJobId(job.id);
    const iso = new Date(wtForm.when).toISOString();
    const { error } = await supabase.rpc("propose_walkthrough", { p_job_id: job.id, p_at: iso, p_note: wtForm.note || null });
    setBusyJobId(null);
    if (error) { notify("Couldn't propose the walkthrough: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, walkthrough_proposed_at: new Date().toISOString(), walkthrough_at: iso, walkthrough_note: wtForm.note || null, walkthrough_approved_at: null, walkthrough_done_at: null } : j));
    setWtOpen(false);
    notify("Walkthrough proposed — the client will confirm the time.", "ok");
  };
  const completeWalkthrough = async (job: any) => {
    setBusyJobId(job.id);
    const { error } = await supabase.rpc("complete_walkthrough", { p_job_id: job.id });
    setBusyJobId(null);
    if (error) { notify("Couldn't mark the walkthrough done: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, walkthrough_done_at: new Date().toISOString() } : j));
    notify("Walkthrough done — now send your estimate below.", "ok");
  };
  const proposeSchedule = async (job: any) => {
    if (!proposeForm.when) { notify("Pick a date and time first."); return; }
    const cleanItems = (proposeForm.items || []).filter(i => i.label.trim() && i.amount !== "" && !isNaN(Number(i.amount)));
    if ((proposeForm.items || []).some(i => i.label.trim() && (i.amount === "" || isNaN(Number(i.amount))))) { notify("Give every optional add-on a price (or remove it)."); return; }
    setBusyJobId(job.id);
    const whenIso = new Date(proposeForm.when).toISOString();
    const ptotal = quoteTotal(proposeForm);
    const quoteItems = cleanItems.length ? cleanItems.map(i => ({ label: i.label.trim(), amount: Number(i.amount) })) : null;
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
      p_quote_items: quoteItems,
    });
    setBusyJobId(null);
    if (error) { notify("Couldn't send proposal: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, scheduled_at: whenIso, amount: ptotal != null ? ptotal : j.amount, labour_amount: proposeForm.labour ? Number(proposeForm.labour) : null, parts_amount: proposeForm.parts ? Number(proposeForm.parts) : null, callout_fee: proposeForm.callout ? Number(proposeForm.callout) : null, subject_to_inspection: !!proposeForm.subject, quote_items: quoteItems ? quoteItems.map(i => ({ ...i, optional: true, accepted: null })) : null, schedule_proposed_at: new Date().toISOString(), client_approved_at: null } : j));
  };
  // Tap-to-navigate: opens the job address in Google Maps (app on mobile, web on desktop).
  const mapsUrl = (addr: string) =>
    "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);

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
  // JobPhotos writes to the DB itself; mirror it locally so the "still needs a
  // photo" prompts clear immediately instead of waiting for a reload.
  const patchJobPhoto = (jobId: string, kind: "before" | "after", path: string) => {
    const col = kind === "before" ? "before_photo_path" : "completion_photo_path";
    setMyJobs(prev => prev.map(j => j.id === jobId ? { ...j, [col]: path } : j));
  };
  const markComplete = async (job: any) => {
    // Photos are saved as they're taken, so by here they're already on the job.
    // Check first for a friendly nudge — mark_job_complete enforces it anyway.
    const miss = photosMissing(job);
    if (miss.length) {
      notify("Add " + miss.join(" and ") + " first — the client can't confirm and release your payment without it.");
      return;
    }
    if (!(await askConfirm({
      title: "Mark job complete?",
      message: "The client will be asked to confirm the work and release your payment. Make sure the job is fully done before marking it complete.",
      confirmLabel: "Yes, mark complete",
      danger: false,
    }))) return;
    setBusyJobId(job.id);
    try {
      const { error } = await supabase.rpc("mark_job_complete", { p_job_id: job.id, p_photo_path: null });
      if (error) throw error;
      setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "pending_confirmation", contractor_completed_at: new Date().toISOString() } : j));
    } catch (e: any) {
      notify("Couldn't mark complete: " + (e.message || e));
    } finally {
      setBusyJobId(null);
    }
  };
  const withdrawJob = async (job: any) => {
    if (!(await askConfirm({
      title: "Withdraw from this job?",
      message: "The job goes back to the open pool. Everything attached to it is permanently removed — your chat history, the service agreement, any photos, logged costs and tracked time. If the client has already paid, you can't withdraw: message them to sort it out, or email hello@freddyfixit.ca.",
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
      const small = await compressImage(pfForm.file, "photo");
      const ext = (small.name.split(".").pop() || "jpg").toLowerCase();
      const path = profile.id + "/" + crypto.randomUUID() + "." + ext;
      const { error: upErr } = await supabase.storage.from("portfolio-photos").upload(path, small, { contentType: small.type || undefined });
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
  // Opt in/out of jobs outside the pro's listed trades (the "Other" specialty).
  const setOpenToOther = async (on: boolean) => {
    const prev: string[] = contractor?.specialties ?? [];
    const next = on ? Array.from(new Set([...prev, "Other"])) : prev.filter(sp => sp !== "Other");
    setContractor((c: any) => ({ ...c, specialties: next })); // optimistic
    const { error } = await supabase.from("contractors").update({ specialties: next }).eq("id", profile.id);
    if (error) {
      setContractor((c: any) => ({ ...c, specialties: prev })); // roll back on failure
      notify("Couldn't save that — please try again.");
    }
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
    const wt = !!f.walkthrough;
    let total = wt ? null : quoteTotal(f);
    if (!wt && total == null && r.my_amount != null) total = Number(r.my_amount);
    if (!wt && total == null) { notify("Enter your bid amount or an itemised breakdown."); return; }
    // A walkthrough-first bid carries no firm price, so the ballpark range IS the
    // number the client compares. place_bid enforces all three of these server-side
    // too; checking here means the pro sees our wording, not a raw Postgres error.
    const lo = f.price_low !== undefined && f.price_low !== "" ? Number(f.price_low) : null;
    const hi = f.price_high !== undefined && f.price_high !== "" ? Number(f.price_high) : null;
    if (wt) {
      if (lo == null || hi == null || !isFinite(lo) || !isFinite(hi)) {
        notify("A walkthrough bid still needs a ballpark range — the client has nothing to compare without one."); return;
      }
      if (lo <= 0 || hi <= 0) { notify("Your ballpark range needs to be more than zero."); return; }
      if (hi < lo) { notify("Your ballpark high can't be below the low."); return; }
    } else if (lo != null && hi != null && hi < lo) {
      notify("Your estimated range high can't be below the low."); return;
    }
    setBusyBid(r.id);
    const msg = f.message !== undefined ? f.message : (r.my_message ?? "");
    const { error } = await supabase.rpc("place_bid", {
      p_request_id: r.id,
      p_amount: total,
      p_message: msg || null,
      p_labour: wt ? null : (f.labour ? Number(f.labour) : null),
      p_parts: wt ? null : (f.parts ? Number(f.parts) : null),
      p_callout: wt ? null : (f.callout ? Number(f.callout) : null),
      p_assumptions: f.assumptions || null,
      p_subject_to_inspection: !!f.subject,
      p_price_low: lo,
      p_price_high: hi,
      p_used_base_price: wt ? false : !!f.used_base_price,
      p_walkthrough: wt,
    });
    setBusyBid(null);
    if (error) { notify("Couldn't place bid: " + error.message); return; }
    const hadBid = r.my_amount != null || r.my_walkthrough;
    setAvailableJobs(prev => prev.map(x => x.id === r.id
      ? { ...x, my_amount: total, my_message: msg || null, my_walkthrough: wt, my_price_low: lo, my_price_high: hi, bid_count: hadBid ? x.bid_count : (x.bid_count ?? 0) + 1 }
      : x));
    setBidOpen(prev => ({ ...prev, [r.id]: false }));
    notify(hadBid ? "Your bid has been updated." : "Your bid has been placed.", "ok");
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

  // Withdraw a price change the pro proposed themselves. The optimistic update
  // clears both columns, matching exactly what the RPC writes, so the banner
  // collapses back to the "Request a change" link with no refetch.
  const withdrawPriceChange = async (job: any) => {
    if (!(await askConfirm({
      title: "Withdraw this price change?",
      message: "The client will be told it is withdrawn and the price you both agreed to stays in place. You can always send a new revised estimate afterwards.",
      confirmLabel: "Withdraw it",
      danger: false,
    }))) return;
    setBusyJobId(job.id);
    const { error } = await supabase.rpc("withdraw_price_change", { p_job_id: job.id });
    setBusyJobId(null);
    if (error) { notify("Couldn't withdraw it: " + error.message); return; }
    setMyJobs(prev => prev.map(j => j.id === job.id ? { ...j, price_change_pending: null, price_change_proposed_at: null } : j));
  };

  // The CLIENT's service-fee rate, needed so the pro can see the client's real
  // total on a price change. Only a fallback — `priceChangeMath` prefers the
  // rate the client actually agreed to (`client_fee / amount`) whenever the job
  // has been charged, because re-rating a live job at the current platform rate
  // would move the goalposts mid-job.
  const [feeRate, setFeeRate] = useState<number | null>(null);
  useEffect(() => { getFeeRate().then(r => { if (r.ok) setFeeRate(r.rate); }); }, []);

  // One money row, so the pending banner and the live preview punctuate alike.
  // Deliberately a local presentational helper rather than a shared component:
  // what MUST be shared between the two sides of a price change is the
  // arithmetic, and that lives in src/lib/priceChange.ts.
  const pcRow = (labelText: string, value: string, opts?: { strong?: boolean; color?: string; top?: boolean }) => (
    <div style={{
      display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"1rem",
      padding:".5rem 0",
      ...(opts?.top ? { marginTop:".35rem", paddingTop: "var(--ff-s3)", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .14)" } : null),
    }}>
      <span style={{ fontSize:".84rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.45 }}>{labelText}</span>
      <span style={{
        fontSize: opts?.strong ? ".98rem" : ".88rem",
        fontWeight: opts?.strong ? 700 : 600,
        color: opts?.color ?? "var(--ff-text)",
        whiteSpace:"nowrap" as const,
      }}>{value}</span>
    </div>
  );

  // Reusable "adjust the price" block. Shown at every live stage (scheduled,
  // in_progress, pending_confirmation) until the money is released to the pro.
  const renderPriceChange = (job: any) => {
    if (job.payment_status === "released") return null;
    // Milestone jobs are priced per stage (MilestonePanel) — the whole-job price
    // change RPC rejects them, so don't offer a form that can only fail.
    if (job.is_milestone) return null;
    const rf = requoteForm[job.id] || { amount:"", reason:"", labour:"", parts:"", callout:"", subject:false };
    const setRf = (patch: any) => setRequoteForm(o => ({ ...o, [job.id]: { ...rf, ...patch } }));
    const pending = job.price_change_pending;
    return (
      <div style={{ borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .07)", paddingTop: "var(--ff-s3)" }}>
        {pending ? (() => {
          /* THE PRO'S HALF OF THE SAME ARITHMETIC (rebuilt 2026-11-07).
             This banner used to be one concatenated sentence carrying a raw
             unformatted `pending.amount` and nothing else — no service fee, no
             client total, no payout. So the pro proposing a change could not
             answer the first question the client asks them in chat ("what am I
             actually paying now?"), and the two sides were reading different
             numbers off different screens. Both sides now compute from
             src/lib/priceChange.ts, so they cannot disagree to the cent.

             MONEY GUARDS: none. Display only — no reads, no writes. */
          const pc = priceChangeMath({ ...job, payment_status: "held", price_change_pending: pending }, feeRate ?? 0.03);
          if (!pc) return null;
          const paidInFull = jobFullyFunded(job);
          const payout = commission == null ? null : Math.round(pc.newPrice * (1 - commission) * 100) / 100;
          return (
            <div style={{ borderRadius:"14px", border:"1px solid rgba(var(--ff-warn-rgb), .34)", background:"rgba(var(--ff-warn-rgb), .07)", padding:"1.1rem 1.1rem 1.2rem" }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:".6rem", marginBottom: "var(--ff-s4)" }}>
                <Ic name="clock" size={16} color="var(--ff-warn)" style={{ marginTop:2, flexShrink:0 }} />
                <div>
                  <div style={{ fontFamily:"var(--ff-font-head, inherit)", fontSize:"1rem", color:"var(--ff-text)", letterSpacing:".01em" }}>
                    Waiting on the client to approve {pcMoney(pc.newPrice)}
                  </div>
                  <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.5, marginTop: "var(--ff-s1)" }}>
                    The agreed price is still {pcMoney(pc.oldPrice)} until they do. Keep working to the original scope until you hear back.
                  </div>
                </div>
              </div>

              {pending.reason ? (
                <div style={{ borderLeft:"3px solid var(--ff-warn)", paddingLeft:".75rem", margin:"0 0 .95rem", fontSize:".82rem", color:"rgba(var(--ff-muted), .85)", lineHeight:1.6 }}>
                  {pending.reason}
                </div>
              ) : null}

              <div style={{ background:"rgba(var(--ff-fg), .035)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"11px", padding:".75rem .85rem" }}>
                {pcRow("New job price", pcMoney(pc.newPrice))}
                {pcRow("Client service fee (" + pcRateLabel(pc.rate) + ")", pcMoney(pc.newFee))}
                {pcRow("What the client pays in total", pcMoney(pc.newTotal), { top:true })}
                {payout != null ? pcRow("Your payout after commission", pcMoney(payout), { top:true, strong:true }) : null}
              </div>

              <div style={{ fontSize:".79rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6, marginTop: "var(--ff-s4)" }}>
                {paidInFull
                  ? "They have already paid this job in full, so when they approve they are taken straight to a checkout for the " + pcMoney(pc.balanceOwed) + " difference. Nothing reaches you until that clears."
                  : "They have paid " + pcMoney(pc.funded) + " so far. Nothing extra is charged today — the balance they settle at the end becomes " + pcMoney(pc.balanceOwed) + "."}
              </div>

              {/* THE INVERSE THE PRO NEVER HAD (2026-11-07). propose_price_change
                  had no undo for the person who called it, so a wrong figure — or
                  one the pro and client talked out of in chat — sat 'pending'
                  forever. run_reminders step 6 kept nudging the client about a
                  number the pro no longer wanted, and the only exits were the
                  client approving a price nobody intended or declining it, which
                  records the pro as declined when they actually withdrew.
                  `withdraw_price_change` is the contractor-side twin of
                  `decline_price_change`; it touches none of the four payout
                  guards. */}
              <div style={{ marginTop:"1rem", paddingTop: "var(--ff-s4)", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .1)" }}>
                <button
                  disabled={busyJobId === job.id}
                  onClick={() => withdrawPriceChange(job)}
                  style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", fontSize:".8rem", fontWeight:600, cursor:"pointer", padding:0, textDecoration:"underline" }}
                >
                  {busyJobId === job.id ? "Withdrawing…" : "Withdraw this price change"}
                </button>
                <div style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .55)", lineHeight:1.55, marginTop:".35rem" }}>
                  Puts the price back to {pcMoney(pc.oldPrice)} and lets the client know. Use this if you sent the wrong figure, or if you have agreed in the messages to leave it alone.
                </div>
              </div>
            </div>
          );
        })() : !requoteOpen[job.id] ? (
          <button onClick={() => setRequoteOpen(o => ({ ...o, [job.id]: true }))} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".82rem", fontWeight:600, cursor:"pointer", padding:0 }}>
            <Ic name="pencil" size={13} style={{ marginRight:4 }} />Need to adjust the price? Request a change
          </button>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:".75rem" }}>
            <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.45 }}>Send the client a revised estimate. They'll re-approve (and cover any extra) before it takes effect — your chat history stays.</div>
            {/* Be straight with the pro about what a price rise risks. On an
                unpaid job decline_price_reopen genuinely releases them and puts
                the request back in front of the other bids, so the soft copy
                above on its own was misleading. Once money is held the job
                can't be handed away, so say that instead of implying it can. */}
            {(job.payment_status ?? "unpaid") === "unpaid" ? (
              <div style={{ display:"flex", alignItems:"flex-start", gap:".5rem", padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-warn-rgb), .10)", border:"1px solid rgba(var(--ff-warn-rgb), .32)" }}>
                <Ic name="alert-triangle" size={14} color="var(--ff-warn)" style={{ marginTop:2, flexShrink:0 }} />
                <div style={{ fontSize:".78rem", color:"var(--ff-text)", lineHeight:1.55 }}>
                  <strong>Raising the price can cost you the job.</strong> Nothing has been paid yet, so the client can decline and re-open the request to the other pros who bid — in one tap, without talking to you first. Only raise it if the work genuinely changed, give the specific reason, and message them about it before you send this.
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"flex-start", gap:".5rem", padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .1)" }}>
                <Ic name="info" size={14} color="var(--ff-warn)" style={{ marginTop:2, flexShrink:0 }} />
                <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.55 }}>
                  The client has already paid on this job, so they can't hand it to another pro. But they can decline the change — you'd finish at the agreed price. Give the specific reason and message them first.
                </div>
              </div>
            )}
            <input type="number" min="0" value={rf.amount} placeholder="New total price $" onChange={e => setRf({ amount: e.target.value })} style={ffInp} />
            <QuoteBreakdown v={rf} on={setRf} calloutHint={contractor?.min_callout ?? null} price={priceFor(job.request?.service_needed)} />

            {/* LIVE PREVIEW of exactly what the client will be shown.
                The total comes from `quoteTotal(rf)` — the SAME function
                requestRequote sends to propose_price_change — so the preview
                and the proposal can never drift apart. The arithmetic comes
                from src/lib/priceChange.ts, the one module the client panel,
                this form, the price_change email and the e-signed clause all
                read, which is the whole reason it exists. */}
            {(() => {
              const t = quoteTotal(rf);
              if (t == null || !(t > 0)) return null;
              const pv = priceChangeMath({ ...job, payment_status: "held", price_change_pending: { amount: t } }, feeRate ?? 0.03);
              if (!pv) return null;
              const paidInFull = jobFullyFunded(job);
              const payout = commission == null ? null : Math.round(pv.newPrice * (1 - commission) * 100) / 100;
              return (
                <div style={{ borderRadius:"13px", border:"1px dashed rgba(var(--ff-accent-rgb), .4)", background:"rgba(var(--ff-accent-rgb), .05)", padding:"1rem 1rem 1.05rem" }}>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".11em", fontWeight:700, color:"var(--ff-c10)", marginBottom: "var(--ff-s3)" }}>
                    What the client will see
                  </div>
                  <div style={{ background:"rgba(var(--ff-fg), .035)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"11px", padding:".7rem .8rem" }}>
                    {pcRow("Price they agreed to", pcMoney(pv.oldPrice))}
                    {pv.isIncrease ? pcRow("Increase", "+" + pcMoney(pv.delta)) : pv.isReduction ? pcRow("Reduction", "−" + pcMoney(Math.abs(pv.delta))) : null}
                    {pcRow("New job price", pcMoney(pv.newPrice), { top:true })}
                    {pcRow("Service fee (" + pcRateLabel(pv.rate) + ")", pv.rate === 0 ? "Waived" : pcMoney(pv.newFee))}
                    {pcRow("Their new total", pcMoney(pv.newTotal), { top:true, strong:true })}
                  </div>
                  <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.6, marginTop:".8rem" }}>
                    {pv.isReduction
                      ? (pv.funded - pv.newTotal > 0.005
                          ? "They have paid " + pcMoney(pv.funded) + ", so " + pcMoney(Math.round((pv.funded - pv.newTotal) * 100) / 100) + " goes back to their card."
                          : "The balance they settle at the end comes down to " + pcMoney(pv.balanceOwed) + ".")
                      : pv.isIncrease
                        ? (paidInFull
                            ? "This job is paid in full, so approving sends them to a checkout for the " + pcMoney(pv.balanceOwed) + " difference right away."
                            : "Nothing extra is charged today — the balance they settle at the end becomes " + pcMoney(pv.balanceOwed) + ".")
                      : "Same total as before — this just re-itemises the quote."}
                  </div>
                  {payout != null ? (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"1rem", marginTop:".85rem", paddingTop: "var(--ff-s3)", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .1)" }}>
                      <span style={{ fontSize:".79rem", color:"rgba(var(--ff-muted), .7)" }}>Your payout after commission</span>
                      <strong style={{ fontSize:".95rem", color:"var(--ff-c10)" }}>{pcMoney(payout)}</strong>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            <textarea value={rf.reason} rows={2} placeholder="Reason for the change (e.g. found a cracked pipe behind the wall)" onChange={e => setRf({ reason: e.target.value })} style={{ ...ffInp, resize:"vertical" as const }} />
            <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
              <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none" }} disabled={busyJobId === job.id} onClick={() => requestRequote(job)}>{busyJobId === job.id ?"Sending…" : "Send revised estimate"}</button>
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
  // "I don't need this step" on the Get-set-up checklist — persisted so it stays
  // skipped across devices/sessions (contractors.setup_skipped, own-row RLS update).
  const skipSetupStep = async (key: string) => {
    if (!profile) return;
    const prev: string[] = contractor?.setup_skipped ?? [];
    const next = Array.from(new Set([...prev, key]));
    setContractor((c: any) => ({ ...c, setup_skipped: next })); // optimistic
    const { error } = await supabase.from("contractors").update({ setup_skipped: next }).eq("id", profile.id);
    if (error) {
      setContractor((c: any) => ({ ...c, setup_skipped: prev }));
      notify("Couldn't save that — please try again.");
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
      if (data?.url) { window.location.assign(data.url); return; }
      throw new Error(data?.error || "Could not start payout setup");
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
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

  // The contractor's share is 1 - platform_commission_rate(), read from the DB
  // rather than hardcoded here. The five hardcoded 0.07/0.93 literals on this
  // platform are all on the CHARGE path, where a network read would turn an
  // unreadable constant into a blocked checkout. A dashboard label is not the
  // charge path, so there is no sixth copy.
  const [commission, setCommission] = useState<number | null>(null);
  useEffect(() => { getCommissionRate().then(r => { if (r.ok) setCommission(r.rate); }); }, []);

  // What the contractor actually receives. The stored contractor_payout is
  // stamped at checkout and always wins — it is what will really be paid, even
  // if the platform rate changes later. The estimate below is only for a job
  // that has not been charged yet, and returns null rather than guessing when
  // the rate could not be read: a failed read is not an empty result, and a
  // wrong payout figure is worse to a contractor than a missing one.
  const netPayout = (job: any): number | null => {
    if (job?.contractor_payout != null) return Number(job.contractor_payout);
    if (commission == null) return null;
    return Math.round(Number(job?.amount ?? 0) * (1 - commission) * 100) / 100;
  };
  // Jobs are collected in two charges — a deposit that books the pro, and the
  // balance once the work is done — so a job sitting at payment_status='held'
  // is not necessarily paid in full. This is what stands between the pro and
  // their payout, so it has to be visible to them, not just to the client.
  //
  // Both of these now come from src/lib/jobFunding, which mirrors the generated
  // `jobs.fully_funded` column exactly. The local copies they replaced read a
  // NULL `total_charged` as zero, so an uncharged job computed a balance of 0
  // and `awaitingBalance` never fired on it. `awaitingBalance` also used to test
  // `jobBalanceDue(j) > 0.005` — a SECOND epsilon, a hair tighter than the
  // server's 0.01 — which could claim a sub-cent balance the server considers
  // settled. The shared version gates on the predicate and leaves the number to
  // the display, which is the rule in CLAUDE.md.
  const awaitingBalance = jobAwaitingBalance;
  const awaitingJobs = myJobs.filter(j => j.status === "pending_confirmation" || j.status === "scheduled" || j.status === "in_progress");
  // If the rate could not be read, no estimate is trustworthy, so the whole
  // "coming your way" card is withheld rather than shown short. Keeping this a
  // plain number means the two render sites below need no change: a 0 total
  // simply doesn't render.
  const awaitingUnknown = awaitingJobs.some(j => j.amount && netPayout(j) == null);
  const awaitingTotal = awaitingUnknown ? 0 : awaitingJobs.reduce((t,j) => t + (j.amount ? (netPayout(j) ?? 0) : 0), 0);
  const STATUS_COLORS: Record<string,string> = { pending:"var(--ff-warn)", matched:"var(--ff-info)", in_progress:"var(--ff-c10)", completed:"var(--ff-success)", cancelled:"var(--ff-danger)", assigned:"var(--ff-info)", scheduled:"#8b5cf6", pending_confirmation:"var(--ff-warn)" };
  // "Reliability streak" — consecutive most-recent finished jobs that were completed & confirmed with no claim.
  const streak = (() => {
    const finished = [...myJobs]
      .filter(j => j.status === "completed" || j.status === "cancelled")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    let n = 0;
    for (const j of finished) { if (j.status === "completed" && !disputes[j.id]) n++; else break; }
    return n;
  })();

  const s = {
    // `header` and `logo` were removed on 2026-10-30. `header` was the v1
    // greeting strip, which the <Pass> replaced; `logo` had already been dead
    // for some time (the global TopNav carries the wordmark). Both are deleted
    // rather than left in place because a style key that nothing reads still
    // looks like the live answer to "how is the top of this page styled".
    //
    // ── 2026-11-08: the page chrome moved to the shared primitives ─────────
    // ⚠️ `wrap`, `content`, `card` and `cardTitle` are GONE — they are
    // <DashShell>, <DashContent>, <DashCard> and `.ffd-cardtitle` from
    // src/components/ui/Dash.tsx now. Dash.tsx adopted CLIENT's numbers
    // because Client is the stated reference, so this page's column narrowed
    // 900 → 800px and its card padding tightened 1.75 → 1.5rem. Those are
    // real visual changes and they ARE the alignment; see the comments at the
    // <DashContent> and <DashCard> mounts.
    //
    // ⚠️ `tabsBar`, `tabsInner`, `tab`, `activeTab`, `slot` and `slotSel` are
    // also gone, and those six were DEAD — zero call sites, each one. The
    // underline tab bar they described had already been replaced by the
    // sidebar; only the keys survived, which is worse than either, because a
    // style key that nothing reads reads as the live answer. Anything that
    // needs a tab or a filter chip here takes `.ffd-tab` / `.ffd-tab.ffd-on`.
    //
    // ⚠️ Inline styles cannot express :hover/:active/:disabled and must not
    // try; the shared `.ffdash button:not(.ffu-btn)` rule carries all three.
    // Setting `opacity` here would beat the injected sheet and freeze every
    // button's disabled state.
    //
    // `btn`/`primaryBtn`/`jobCard`/`earnCard`/`chip` stay as objects for now:
    // `btn` alone has 28 call sites, several on the contract-gated payment
    // surface where the `disabled` expression carries `contractBlocked`. The
    // structural port onto <Button>/<Sheet> is its own change, to be read
    // against the fail-closed gate, not a line item inside a reskin.
    jobCard: { background:"var(--ff-card-bg)", border:"var(--ff-hair-w) solid var(--ff-card-border)", borderRadius:"var(--ff-r2)", padding:"clamp(.9rem, 3.5vw, 1.5rem)", marginBottom:"var(--ff-s4)", cursor:"pointer" },
    btn: { minHeight:"var(--ff-h-ctl)", padding:"0 var(--ff-s4)", background:"var(--ff-card-bg)", border:"var(--ff-hair-w) solid var(--ff-card-border)", borderRadius:"var(--ff-r2)", color:"var(--ff-text)", fontFamily:"'Bebas Neue',sans-serif", fontSize:".88rem", letterSpacing:".09em", cursor:"pointer" },
    // Byte-identical to ClientDashboard's `primaryBtn`. It is NEW here: this
    // page had no primary-button key at all, so its two primary actions (the
    // load-error Retry and the finish-setup CTA) were hand-rolled with their
    // own padding, radius, font and weight — two more undecided divergences.
    primaryBtn: { minHeight:"var(--ff-h-ctl)", padding:"0 var(--ff-s5)", background:"var(--ff-accent-500)", color:"#fff", border:"none", borderRadius:"var(--ff-r2)", boxShadow:"var(--ff-lift-2)", fontFamily:"'Bebas Neue',sans-serif", fontSize:".95rem", letterSpacing:".09em", cursor:"pointer" },
    earnCard: { background:"var(--ff-card-bg)", border:"var(--ff-hair-w) solid var(--ff-card-border)", borderRadius:"var(--ff-r2)", padding:"var(--ff-s5)", textAlign:"center" as const },
    chip: { padding:".3rem .75rem", background:"rgba(var(--ff-accent-rgb), .08)", border:"var(--ff-hair-w) solid rgba(var(--ff-accent-rgb), .18)", borderRadius:"99px", fontSize:".78rem", color:"rgba(var(--ff-muted), .8)", display:"inline-block", margin: "var(--ff-s1)" },
  };

  // A layout-matched shell rather than a centred spinner: the sidebar, header
  // strip and content column land where the real ones are about to, so nothing
  // jumps when the data arrives. DashboardSkeleton renders NOTHING for its
  // first 120ms, so a warm load still looks instant.
  if (loading) return (
    <DashShell>
      <DashboardSkeleton />
    </DashShell>
  );

  if (loadError) return (
    <DashShell style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", color:"rgba(var(--ff-muted), .7)", maxWidth:"320px", padding:"1.5rem" }}>
        <div style={{ marginBottom:".75rem", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".04em" }}>Couldn't load your dashboard</div>
        <div style={{ fontSize:".9rem", marginBottom:"1.25rem" }}>You are still signed in and nothing has been lost — your jobs, bids and earnings are all safe. Refresh the page to try again.</div>
        <button style={s.primaryBtn} onClick={() => window.location.reload()}>Retry</button>
      </div>
    </DashShell>
  );

  // Signed in but signup was never finished (e.g. Google one-tap creates the login
  // instantly, but the contractor record only exists after "Complete Registration").
  // Without this, the dashboard rendered as a blank page + footer.
  // A time the CLIENT named in the chat, waiting on this pro to accept or counter.
  // `chat_time_by` is whoever typed it, so this never prompts the person who
  // suggested it. Dismissing only hides the modal — the attention row stays.
  const chatTimeJobs = myJobs.filter((j: any) =>
    j.chat_time_at && !j.chat_time_resolved_at && j.chat_time_by && j.chat_time_by !== profile?.id
    && j.status !== "cancelled" && j.status !== "completed"
    && new Date(j.chat_time_at).getTime() > Date.now());
  const timePromptJob = chatTimeJobs.find((j: any) => !timeDismissed.has(j.id)) ?? null;

  // The per-page Google Fonts <link> that used to sit on this branch is gone
  // (2026-11-08). All three faces load from the single <link> in index.html,
  // and CLAUDE.md is explicit that a face used site-wide belongs in that one —
  // a per-page loader is a subset of it that re-requests the same stylesheet.
  if (!profile || !contractor) return (
    <DashShell style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", maxWidth:"380px", padding:"1.5rem" }}>
        <div style={{ width:56, height:56, borderRadius:"50%", margin:"0 auto 1rem", background:"linear-gradient(135deg,var(--ff-c10),#f59e42)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.9rem" }}>F</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.7rem", letterSpacing:".04em", lineHeight:1.1, color:"var(--ff-text)", marginBottom:".5rem" }}>You're almost there</div>
        <div style={{ fontSize:".92rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.55, marginBottom:"1.25rem" }}>
          Your login is set up, but we still need a few details before you can see and bid on jobs. It takes about two minutes — and if you started earlier, we saved your progress.
        </div>
        <button style={s.primaryBtn} onClick={() => setLocation("/contractor-onboarding")}>Finish setting up →</button>
      </div>
    </DashShell>
  );

  // ── "Needs your attention", HOISTED out of the JSX on 2026-10-30 ──────────
  // This derivation used to live inside a `{(() => { … })()}` in the middle of
  // the return, which meant nothing ABOVE the return could read it — and the
  // Pass at the top of the page is exactly a thing above the return that has to
  // read it. The rows themselves are unchanged (same order, same text, same
  // onClick, same four-row cap); only the place they are computed moved. The
  // panel further down now renders `shownAttn` instead of rebuilding it.
  //
  // ORDER MATTERS: only the first four rows render, so money-gating rows
  // (claims, unsent agreements, missing photos, an unpaid balance) are pushed
  // FIRST and the conversational rows go last. A chat time suggestion plus
  // three unread threads used to fill every slot and hide the fact that a claim
  // was open or an agreement had never been sent.
  //
  // `hero` is new and is the ONLY added field: the Pass needs a headline short
  // enough to set in Bebas at display size, and `text` is a full sentence. The
  // two are deliberately not derived from each other — `hero` names the move,
  // `text` explains it, and a truncated sentence would do neither.
  const attn: { key: string; icon: IconName; tone: RowTone; hero: string; text: string; cta: string; onClick: () => void; danger?: boolean }[] = [];

  // ── Won work with nowhere to be paid ─────────────────────────────────────
  // Bidding is deliberately open to pros who haven't connected Stripe — gating
  // it would leave clients with an empty bid list. The cost is that a pro can
  // WIN a job they cannot be paid for: `contract_ready()`'s fifth reason
  // requires `stripe_payouts_enabled`, so the client's card is refused (HTTP
  // 428) and the job cannot start. Nothing else on this page says that in those
  // terms — the checklist item reads as housekeeping, not as "this job is
  // frozen".
  //
  // ONE row, not one per job, pushed BEFORE the loop: the condition is about the
  // account, not the job, and only four rows render, so a per-job version would
  // evict everything else the moment a pro had two live jobs.
  //
  // `contractor` is non-null here (the guard above returns), so this reads a
  // loaded row rather than a pending one.
  // NOT the same set as `liveJobs` further down, which is "not cancelled and
  // not completed" and is used for counting. `jobIsLive` is the narrower
  // enumerated list — the stages where the contract and the payment gate
  // actually apply — and is the one the client dashboard's agreement row and
  // the chat lock also read. Keep the two names distinct; collapsing them
  // would quietly change what the Pass counts.
  const liveWonJobs = myJobs.filter(jobIsLive);
  const payoutLocked = !contractor.stripe_payouts_enabled && liveWonJobs.length > 0;
  // What the chat predicate is told. Spelled out once and shared, so the
  // attention row, the lock and the explanation in the chat can never disagree.
  const payoutLockCtx = { viewer: "contractor" as const, payoutsEnabled: !!contractor.stripe_payouts_enabled };
  if (payoutLocked) {
    attn.push({
      key: "payout-lock", icon: "alert-triangle" as const, tone: "warn" as const, danger: true,
      hero: "CONNECT YOUR PAYOUTS TO CONTINUE",
      text: liveWonJobs.length === 1
        ? "You won “" + (liveWonJobs[0].request?.service_needed ?? "a job") + "”, but your client can't be charged and messaging is locked until you connect a bank account. It takes about two minutes."
        : "You've won " + liveWonJobs.length + " jobs, but your clients can't be charged and messaging is locked until you connect a bank account. It takes about two minutes.",
      cta: "Connect payouts",
      onClick: () => { void setupPayouts(); },
    });
  }

  for (const job of myJobs) {
    const d = disputes[job.id];
    const svc = job.request?.service_needed ?? "a job";
    if (d && d.status === "open" && !d.contractor_responded_at) {
      attn.push({ key: "claim-" + job.id, icon: "alert-triangle" as const, tone: "warn" as const, hero: "A CLAIM NEEDS YOUR REPLY", text: "A client filed a claim on “" + svc + "” — your payout is paused until you respond.", cta: "Respond now", onClick: () => focusJobAnchor(job, A_CLAIM), danger: true });
    // Gated on the live stages, exactly like the panel this row scrolls
    // to. Neither flag is ever cleared, so ungated the row — and its
    // dead "Review new time" button, since A_RESCHED only renders on
    // those stages — sat on completed and cancelled jobs forever,
    // burning one of only four attention slots.
    } else if (job.client_rescheduled_at && !job.reschedule_accepted_at
               && ["assigned","scheduled","in_progress"].includes(job.status)) {
      attn.push({ key: "resched-" + job.id, icon: "calendar" as const, tone: "accent" as const, hero: "YOUR CLIENT MOVED THE TIME", text: (job.client?.first_name || "Your client") + " changed the time on “" + svc + "”.", cta: "Review new time", onClick: () => focusJobAnchor(job, A_RESCHED) });
    } else if (job.status === "assigned" && job.walkthrough_approved_at && !job.walkthrough_done_at) {
      attn.push({ key: "wt-" + job.id, icon: "check-circle" as const, tone: "accent" as const, hero: "MARK THE WALKTHROUGH DONE", text: "Walkthrough confirmed for “" + svc + "”" + (job.walkthrough_at ? " — " + new Date(job.walkthrough_at).toLocaleString() : "") + ". After the visit, mark it done and send your estimate.", cta: "Mark walkthrough done", onClick: () => focusJobAnchor(job, A_WALK) });
    } else if (job.status === "assigned" && job.walkthrough_done_at && !job.schedule_proposed_at) {
      // The walkthrough block only says "done"; the thing they came to do
      // is the propose form, so send them there rather than to the notice.
      attn.push({ key: "wtdone-" + job.id, icon: "dollar" as const, tone: "accent" as const, hero: "SEND YOUR ESTIMATE", text: "You finished the walkthrough on “" + svc + "” — the client is waiting for your estimate.", cta: "Send estimate", onClick: () => focusJobAnchor(job, A_PROPOSE) });
    } else if (job.status === "assigned" && job.slot_released_at && !job.schedule_proposed_at) {
      attn.push({ key: "slot-" + job.id, icon: "calendar" as const, tone: "warn" as const, hero: "PROPOSE A NEW TIME", text: "The booked time on “" + svc + "” was released — it wasn't signed and paid in time. You still have the job; propose a new time.", cta: "Propose new time", onClick: () => focusJobAnchor(job, A_PROPOSE) });
    } else if (job.status === "assigned" && !job.schedule_proposed_at && !job.walkthrough_proposed_at) {
      attn.push({ key: "propose-" + job.id, icon: "dollar" as const, tone: "accent" as const, hero: "SEND YOUR TIME AND PRICE", text: "“" + svc + "” is waiting for your time and price.", cta: "Propose now", onClick: () => focusJobAnchor(job, A_PROPOSE) });
    } else if (job.status === "scheduled" && job.scheduled_at) {
      const dt = new Date(job.scheduled_at).getTime() - Date.now();
      // Booked within the day: the move is directions + "I'm on my way",
      // so land on that pair rather than the top of the card.
      if (dt > 0 && dt < 24 * 3600 * 1000) attn.push({ key: "soon-" + job.id, icon: "calendar" as const, tone: "accent" as const, hero: "YOU'RE ON SITE SOON", text: "“" + svc + "” is booked for " + new Date(job.scheduled_at).toLocaleString() + ".", cta: "Get ready", onClick: () => focusJobAnchor(job, A_ONWAY) });
    }
    // Work is done and only the deposit is in: the outstanding balance is
    // the single thing blocking this pro's payout, and nothing else on
    // their dashboard would tell them so.
    if (job.status === "pending_confirmation" && awaitingBalance(job)) {
      attn.push({ key: "bal-" + job.id, icon: "dollar" as const, tone: "accent" as const, hero: "THE BALANCE ISN'T IN YET", text: "“" + svc + "” is finished but the client still owes $" + jobBalanceDue(job).toFixed(2) + " — your payout is released once they pay and confirm.", cta: "See what's owed", onClick: () => focusJobAnchor(job, A_BALANCE) });
    }
    // No signed agreement = the client physically cannot pay, so this
    // outranks everything else on a live job. Only prompt when it's the
    // contractor's move (nothing sent yet); once it's with the client the
    // panel on the job already says who we're waiting on.
    // `!payoutLocked` because sending the agreement cannot help while payouts
    // are off — the payment gate refuses the card either way, so this row would
    // be a control that can never succeed, burning a slot above the one row
    // that CAN clear the block.
    if (!contractsFailed && !payoutLocked && jobIsLive(job)
        && !["signed", "sent"].includes(contracts[job.id] ?? "")) {
      attn.push({ key: "contract-" + job.id, icon: "file" as const, tone: "accent" as const, hero: "SEND THE AGREEMENT", text: "“" + svc + "” needs a signed service agreement — your client can't pay until you send it.", cta: "Send agreement", onClick: () => focusContractJob(job) });
    }
    // Photos are what unlock payment, so chase them once work is under way.
    if (job.status === "in_progress" || (job.status === "scheduled" && job.on_my_way_at)) {
      const miss = photosMissing(job);
      if (miss.length) attn.push({ key: "photo-" + job.id, icon: "camera" as const, tone: "warn" as const, hero: "ADD THE REQUIRED PHOTOS", text: "“" + svc + "” still needs " + miss.join(" and ") + " — you can't mark it complete without them.", cta: "Add photos", onClick: () => focusJobAnchor(job, A_PHOTOS) });
    }
  }
  const reserved = availableJobs.filter((r: any) => r.is_preferred);
  if (reserved.length > 0) {
    attn.push({ key: "reserved", icon: "user-check" as const, tone: "accent" as const, hero: "A CLIENT ASKED FOR YOU", text: reserved.length === 1 ? "A client requested you — “" + reserved[0].service_needed + "” is reserved for you for 48h." : reserved.length + " clients requested you — jobs are reserved for you for 48h.", cta: "See jobs", onClick: () => { setActiveTab("available"); window.scrollTo({ top: 0, behavior: "smooth" }); } });
  }
  // ── Conversational rows last (see the ordering note above) ──────────
  for (const job of chatTimeJobs) {
    // Stays put after "Decide later" so a suggested time can't be lost.
    attn.push({
      key: "chattime-" + job.id, icon: "clock" as const, tone: "neutral" as const,
      hero: "A TIME WAS SUGGESTED",
      text: (job.client?.first_name || "Your client") + " suggested " + formatWhen(job.chat_time_at) + " for “" + (job.request?.service_needed ?? "a job") + "”.",
      cta: "Accept or change",
      onClick: () => setTimeDismissed(prev => { const n = new Set(prev); n.delete(job.id); return n; }),
    });
  }
  // Unread messages. Capped at 3 so a chatty week can't bury the rows
  // that gate money (claims, agreements, photos).
  //
  // `inboxRows`, not `conversations` — a pre-hire question from a client
  // deciding who to hire is the MOST time-sensitive message a pro gets,
  // and it used to raise no row at all.
  for (const c of inboxRows.filter(c => c.unread > 0).slice(0, 3)) {
    attn.push({
      key: "msg-" + conversationKey(c), icon: "message-square" as const, tone: "neutral" as const,
      hero: c.unread === 1 ? "YOU HAVE AN UNREAD MESSAGE" : "YOU HAVE UNREAD MESSAGES",
      text: partyName(c) + " sent you " + (c.unread === 1 ? "a message" : c.unread + " messages")
        + (c.kind === "bid"
            ? " about “" + (c.service_needed ?? "a job") + "” — they haven't picked anyone yet."
            : " about “" + (c.service_needed ?? "a job") + "”."),
      cta: "Read it",
      onClick: () => { setActiveTab("messages"); openConversation(c); window.scrollTo({ top: 0, behavior: "smooth" }); },
    });
  }
  // Filter BEFORE the slice, or an × would remove a row and reveal
  // nothing — only the first four ever render.
  const attnRowKey = (k: string) => "attn:contractor:" + k;
  const shownAttn = attn.filter(a => !hiddenNow.has(attnRowKey(a.key)));

  // ── The Pass ──────────────────────────────────────────────────────────────
  // One sentence, at the top, answering "is this on me or on them?" before
  // anything scrolls. Mirrors ClientDashboard's `pass` exactly in shape so the
  // two dashboards can never drift into saying the same state two ways.
  //
  // Branch order is severity, not chronology, and it is deliberate:
  //   1. an attention row — something is on this pro RIGHT NOW
  //   2. account not active — nothing else is actionable until it is
  //   3. payouts not connected — work can be done but cannot be PAID, and this
  //      is also the fifth reason `contract_ready()` refuses, so without it the
  //      client cannot be charged either. It outranks "next job" for that
  //      reason, not because it is urgent in itself.
  //   4. the next booked job
  //   5. live jobs but nothing booked / nothing on the go
  const nextBooked = myJobs
    .filter((j: any) => j.scheduled_at && new Date(j.scheduled_at).getTime() > Date.now()
                        && !["cancelled","completed"].includes(j.status))
    .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
  const liveJobs = myJobs.filter((j: any) => !["cancelled","completed"].includes(j.status));
  const pass: {
    state: State; label: string; hero: string; sub?: string;
    meta: { label: string; value: string; accent?: boolean }[];
  } = (() => {
    // Meta is shared by every branch that has numbers worth showing. An empty
    // meta row is better than three blank label/value pairs, which read as a
    // broken component rather than as "nothing yet" — same call as the client
    // side's "NOTHING OPEN" branch.
    const meta = [
      { label: "Active jobs", value: String(liveJobs.length) },
      { label: "Open near you", value: String(availableJobs.length), accent: availableJobs.length > 0 },
      { label: "This week", value: "$" + Number(earn?.this_week ?? 0).toFixed(0) },
    ];
    if (shownAttn.length > 0) {
      const extra = shownAttn.length - 1;
      return {
        state: "turn" as const,
        label: "YOUR TURN",
        hero: shownAttn[0].hero,
        sub: extra > 0 ? extra + " more thing" + (extra === 1 ? "" : "s") + " needs you below." : shownAttn[0].text,
        meta,
      };
    }
    if (contractor.status === "pending") {
      return { state: "wait" as const, label: "UNDER REVIEW", hero: "WE'RE CHECKING YOUR PROFILE",
               sub: "We'll email you the moment you're approved — nothing else is needed from you.", meta: [] };
    }
    if (contractor.status !== "active") {
      return { state: "wait" as const, label: "ACCOUNT INACTIVE", hero: "YOUR ACCOUNT ISN'T ACTIVE",
               sub: "Get in touch and we'll sort it out.", meta: [] };
    }
    if (!contractor.stripe_payouts_enabled) {
      return { state: "turn" as const, label: "ONE STEP LEFT", hero: "CONNECT YOUR PAYOUTS",
               sub: "Until a bank account is connected we can't pay you — and clients can't be charged for your jobs.", meta };
    }
    if (nextBooked) {
      return { state: "wait" as const, label: "NEXT UP", hero: formatWhen(nextBooked.scheduled_at).toUpperCase(),
               sub: (nextBooked.request?.service_needed ?? "A job") + (nextBooked.client?.first_name ? " for " + nextBooked.client.first_name : ""), meta };
    }
    if (liveJobs.length > 0) {
      return { state: "ok" as const, label: "ALL CAUGHT UP", hero: "NOTHING NEEDS YOU",
               sub: liveJobs.length + " job" + (liveJobs.length === 1 ? "" : "s") + " on the go — we'll tell you the moment one needs a move.", meta };
    }
    return { state: "ok" as const, label: "NOTHING ON THE GO", hero: "READY FOR WORK",
             sub: availableJobs.length > 0 ? availableJobs.length + " job" + (availableJobs.length === 1 ? "" : "s") + " posted near you right now." : "We'll notify you the moment a job lands in your trades.",
             meta };
  })();

  return (
    <DashShell>
      {/* ⚠️ The page's own `<style>{".ffdash button{…}"}</style>` block is GONE
          (2026-11-08), and deleting it FIXED a live defect rather than merely
          removing a duplicate. The shared sheet in ui/uiStyles.ts scopes the
          press as `.ffdash button:not(.ffu-btn)`; this page's copy was
          unscoped, and `.ffdash button` (0,0,1,1) outranks `.ffu-btn`
          (0,0,1,0) — so every button ported onto the <Button> primitive was
          having its release overridden back to `.16s var(--ff-ease-out)` by
          the page it was mounted on. The pulse ring came with it, and its
          radius was 10px here against Client's 12px; neither number was ever
          decided, so the shared one is Client's. Do not copy any of it back. */}
      {toast && (
        <div onClick={() => setToast(null)} className="ff-toast-in" style={{ position:"fixed", left:"50%", bottom:"calc(1.5rem + max(var(--ff-fsb-h, 0px), env(safe-area-inset-bottom, 0px)))", transform:"translateX(-50%)", zIndex:9999, maxWidth:"90vw", padding:".8rem 1.1rem", borderRadius:"12px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:".9rem", lineHeight:1.45, color:"#fff", background: toast.kind==="ok" ? "#1c6b39" : "#8a2020", border:"1px solid " + (toast.kind==="ok" ? "rgba(var(--ff-success-rgb), .55)" : "rgba(var(--ff-danger-rgb), .55)"), boxShadow:"0 10px 34px rgba(0,0,0,.4)" }}>{toast.text}</div>
      )}
      {/* The per-page Google Fonts <link> that used to sit here is gone — it
          was a strict subset of the single <link> in index.html, which is
          where a face used site-wide belongs. */}
      {/* Clears the fixed TopNav. The height is MEASURED and published by
          TopNav on :root; the hardcoded 3.75rem that used to be here was one
          of three disagreeing constants and went stale the moment the nav's
          breakpoint or the user's text size moved it. */}
      <div style={{ height: "var(--ff-topnav-h)" }} />
      <div style={{ display:"flex", alignItems:"flex-start" as const }}>
        <DashboardSidebar
          items={visibleNav({
            scheduled: myJobs.filter((j: any) => j.scheduled_at && j.status !== "cancelled").length,
            earned: totalEarned,
            reviews: myReviews.length,
          }).map(it => {
            if (it.key === "available" && contractor?.status === "active" && availableJobs.length > 0) return { ...it, badge: availableJobs.length };
            if (it.key === "messages" && msgUnread > 0) return { ...it, badge: msgUnread };
            return it;
          })}
          active={activeTab}
          onSelect={(k) => setActiveTab(k as any)}
          title="Dashboard"
        />
        <div style={{ flex:1, minWidth:0 }}>

      {/* ── The Pass ───────────────────────────────────────────────────────────
          Replaces the v1 `<div style={s.header}>` greeting, which was a Bebas
          "Welcome, <name>" over a one-word status and answered nothing: a pro
          with a claim open and a pro with an empty week read identically.
          Same component, same props and the same forceNavy default as the
          client side, so the two cannot drift.

          `lead` REPLACES the mark and wordmark on purpose — this renders under
          the global TopNav, which already carries the logo, and two logos ~60px
          apart reads as a layout bug. See PassTop's docblock. */}
      <div style={{ margin:"0 var(--ff-s4) var(--ff-s5)", borderRadius:"var(--ff-r4)", overflow:"hidden", boxShadow:"var(--ff-lift-3)" }}>
        <Pass>
          <PassTop lead={<span className="ffu-wordmark">{profile?.first_name ? "HI, " + String(profile.first_name).toUpperCase() : "WELCOME BACK"}</span>}>
            {msgUnread > 0 && (
              <IconButton label={msgUnread + " unread message" + (msgUnread === 1 ? "" : "s")} badge={msgUnread} onClick={() => { setActiveTab("messages"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <Ic name="message-square" size={16} />
              </IconButton>
            )}
          </PassTop>
          {/* Live jobs only. No `alwaysShow` and no length guard here — the
              component itself returns null under two jobs, and re-deriving that
              condition at the call site is how two readers of the same rule end
              up disagreeing about it.

              No `onNew` either: a contractor doesn't create jobs, so a "+ NEW"
              chip would be a control that can never succeed.

              The dot is `turn` when one of the hoisted attention rows belongs to
              this job. Rows are keyed `"<kind>-" + job.id`, which is why the
              test is a suffix match — the conversational rows ("reserved",
              "msg-…") carry no job id and correctly match nothing. */}
          <JobSwitcher
            jobs={liveJobs.map((j: any) => ({
              id: j.id,
              label: j.request?.service_needed ?? "Job",
              state: shownAttn.some(a => a.key.endsWith("-" + j.id)) ? "turn" as const : "wait" as const,
            }))}
            activeId={activeJobId}
            onSelect={(id) => {
              const j = liveJobs.find((x: any) => x.id === id);
              if (!j) return;
              // Same four steps as every other jump into a job on this page
              // (see the DashboardSidebar onOpen handler): the stage filter has
              // to be cleared first or it can hide the job being opened.
              setActiveTab("jobs");
              setJobFilter(null);
              if (activeJobId !== j.id) openJob(j);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
          <StateLine state={pass.state} pulse={pass.state === "turn"}>{pass.label}</StateLine>
          <Hero>{pass.hero}</Hero>
          {pass.sub && <HeroSub>{pass.sub}</HeroSub>}
          {pass.meta.length > 0 && (
            <PassMeta>
              {pass.meta.map(m => <PassMetaItem key={m.label} label={m.label} value={m.value} accent={m.accent} />)}
            </PassMeta>
          )}
        </Pass>
      </div>

      {showProfileCongrats && (
        <ProfileCompleteCelebration
          onClose={() => setShowProfileCongrats(false)}
          onBrowse={() => { setShowProfileCongrats(false); setActiveTab("available"); }}
        />
      )}

      {/* ⚠️ This column was 900px wide with its own `clamp(1rem,4vw,2rem)
          clamp(.75rem,3vw,1.5rem)` padding; <DashContent> is Client's 800px
          and `clamp(1rem,4vw,1.5rem)`. That is a VISIBLE narrowing and it is
          the point of the change, not a side effect — the three dashboards had
          three different column widths and three different paddings, and
          Dash.tsx's docblock records that none of the three was ever decided.
          Client is the stated reference, so Client's numbers won. Do NOT reach
          for `wide` here: that opt-out exists for Admin's list tabs, which
          render wide tables. */}
      <DashContent className={tabAnim}>
        <ProfileCompletionModal role="contractor" profile={profile} contractor={contractor} onSetupPayouts={setupPayouts} />

        {contractor && !contractor.stripe_payouts_enabled && (() => {
          const steps   = needsFor(stripeNeeds.requirements);
          const waiting = pendingText(stripeNeeds.pending);
          const blocked = disabledText(stripeNeeds.disabled_reason);
          // Nothing outstanding and Stripe is reviewing => reassure, don't nag.
          const onlyWaiting = steps.length === 0 && !!waiting;
          return (
          <div style={{ margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(var(--ff-accent-rgb), .1)", border:"1px solid rgba(var(--ff-accent-rgb), .45)", display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".75rem", justifyContent:"space-between" }}>
            <div style={{ flex:"1 1 260px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:".4rem", fontSize:".85rem", fontWeight:600, color:"var(--ff-c10)", marginBottom:".3rem" }}>
                <Ic name="alert-triangle" size={14} />{onlyWaiting ? "Payout setup is being reviewed" : "Finish payout setup to get paid"}
              </div>
              <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>
                {onlyWaiting
                  ? waiting
                  : (contractor.stripe_account_id
                      ? (steps.length > 0
                          ? "You're almost there — Stripe still needs " + (steps.length === 1 ? "one thing" : steps.length + " things") + " before money for completed jobs can reach you:"
                          : "Your bank connection isn't finished yet. Until it is, money for completed jobs can't be sent to you.")
                      // Corrected 2026-11-03: this used to say "clients can
                      // still book and pay, but your payout stays on hold",
                      // which is wrong in the direction that costs the pro the
                      // job. `contract_ready()`'s fifth reason requires
                      // `stripe_payouts_enabled`, so the four payment-intent
                      // functions return 428 and the client is never charged at
                      // all. The old copy told a pro the one thing they could
                      // safely ignore was the one thing freezing their work.
                      : "You haven't connected a bank account. Until you do, your clients can't be charged for your jobs at all — so a job you win can't start, and messaging on it stays locked.")}
              </div>
              {!onlyWaiting && steps.length > 0 && (
                <ul style={{ margin:".55rem 0 0", padding:0, listStyle:"none", display:"flex", flexDirection:"column" as const, gap: "var(--ff-s2)" }}>
                  {steps.map((n, i) => (
                    <li key={i} style={{ display:"flex", gap: "var(--ff-s2)", alignItems:"flex-start" }}>
                      <span style={{ flex:"0 0 auto", marginTop:".15rem" }}><Ic name="alert-triangle" size={12} color="var(--ff-c10)" /></span>
                      <span>
                        <span style={{ display:"block", fontSize:".8rem", fontWeight:600, color:"var(--ff-text)" }}>{n.label}</span>
                        <span style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.45 }}>{n.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!onlyWaiting && waiting && (
                <div style={{ marginTop:".5rem", fontSize:".76rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.45 }}>{waiting}</div>
              )}
              {blocked && (
                <div style={{ marginTop:".5rem", fontSize:".76rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.45 }}>{blocked}</div>
              )}
            </div>
            {!onlyWaiting && (
              <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", whiteSpace:"nowrap" as const }} disabled={busyStripe} onClick={setupPayouts}>
                {busyStripe ? "Opening Stripe…" : (contractor.stripe_account_id ? "Finish setup" : "Set up payouts")}
              </button>
            )}
          </div>
          );
        })()}

        {contractor && (() => {
          const gaps = contractorGaps(contractor);
          if (!gaps.length) return null;
          // Dismissed only for this exact set of gaps — if the set changes later
          // (e.g. insurance lapses) the reminder comes back on its own.
          if ((contractor.setup_skipped ?? []).includes(nudgeToken(gaps))) return null;
          return (
            <div style={{ margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(var(--ff-accent-rgb), .1)", border:"1px solid rgba(var(--ff-accent-rgb), .45)", display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".75rem", justifyContent:"space-between" }}>
              <div style={{ flex:"1 1 260px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:".4rem", fontSize:".85rem", fontWeight:600, color:"var(--ff-c10)", marginBottom:".3rem" }}>
                  <Ic name="alert-triangle" size={14} />Finish setting up your profile
                </div>
                <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5, marginBottom:".55rem" }}>
                  Still missing from your profile — tap one to jump straight to it:
                </div>
                <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const }}>
                  {gaps.map(g => (
                    <button key={g.key} onClick={() => focusProfileGap(g.anchor)}
                      style={{ padding:".3rem .65rem", borderRadius:"99px", border:"1px solid rgba(var(--ff-accent-rgb), .45)", background:"rgba(var(--ff-accent-rgb), .12)", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".76rem", fontWeight:600, cursor:"pointer" }}>
                      {g.label} →
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"stretch", gap:".4rem" }}>
                <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", whiteSpace:"nowrap" as const }} onClick={() => focusProfileGap(gaps[0].anchor)}>
                  Complete profile
                </button>
                <button onClick={() => skipSetupStep(nudgeToken(gaps))}
                  style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .65)", fontFamily:"inherit", fontSize:".74rem", cursor:"pointer", textDecoration:"underline", padding:0 }}>
                  Ignore — my profile is complete
                </button>
              </div>
              {/* Same call as the link beside it, deliberately. The × is the
                  faster affordance; giving it its OWN store for the same fact is
                  how two answers to one question start disagreeing. */}
              <DismissX onClick={() => skipSetupStep(nudgeToken(gaps))} label="Don't show this again" title="Don't show this again" />
            </div>
          );
        })()}

        {/* The contractor guide — how bidding and getting paid actually work.
            A plain link (not SPA navigation) so a full page loads cleanly, and
            dismissible so it doesn't nag a pro who has already read it. */}
        {!guideSeen && (
          <div style={{ margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(var(--ff-accent-rgb), .08)", border:"1px solid rgba(var(--ff-accent-rgb), .25)", display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".75rem", justifyContent:"space-between" }}>
            <div style={{ flex:"1 1 260px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:".4rem", fontSize:".85rem", fontWeight:600, color:"var(--ff-c10)", marginBottom:".3rem" }}>
                <Ic name="star" size={14} />Read this first — the contractor guide
              </div>
              <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>
                How bidding works, how and when you get paid, and the one step that releases your money. About five minutes, and it saves a lot of guessing.
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"stretch", gap:".4rem" }}>
              <a href="/contractor-guide" onClick={dismissGuide}
                style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", whiteSpace:"nowrap" as const, textAlign:"center" as const, textDecoration:"none" }}>
                Read the guide
              </a>
              <button onClick={dismissGuide}
                style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .65)", fontFamily:"inherit", fontSize:".74rem", cursor:"pointer", textDecoration:"underline", padding:0 }}>
                Not now
              </button>
            </div>
            <DismissX onClick={dismissGuide} label="Hide this" title="Hide this" />
          </div>
        )}

        {(activeTab === "jobs" || activeTab === "available" || activeTab === "calendar") && (() => {
          // Jobber-style workflow pipeline strip: where every job sits, at a glance.
          // Clicking a stage jumps to the right tab (and filters My Jobs by stage).
          //
          // ── The stage colours are TOKENS as of 2026-11-08 ────────────────
          // They were `#3b82f6` / `#f59e0b` / `#8b5cf6` / `#8b5cf6` /
          // `var(--ff-c10)` / `#22c55e` — four raw hexes imported from the
          // Jobber strip this is modelled on, and every one of them was a
          // LIGHT-MODE BUG of exactly the kind CLAUDE.md describes: a literal
          // renders its dark-mode value on the off-white ground, with nothing
          // thrown. `--ff-success`/`--ff-warn`/`--ff-info` each carry a
          // separate light value, so the strip now follows the theme.
          //
          // ⚠️ The orange is GONE from `working`, and that is Von Restorff,
          // not tidying. The selected chip already spends accent — a `.1`
          // tint plus a `.5` border — so an orange top-rule on a *different*
          // chip put two orange things in one strip, and the one that means
          // "you pressed this" lost. "In progress" is a STATUS, and the
          // question orange answers is "is this the one action for you?", so
          // the answer for a status is a neutral or semantic colour.
          //
          // ⚠️ And the two purples were the SAME hex on two different stages,
          // which means the purple was already carrying no distinction. Five
          // hues for six stages was never a six-step ramp; this palette has no
          // such ramp and inventing one would be a palette change, which is
          // out of scope by decision. So the rule now answers the one question
          // a pro actually asks the strip — WHOSE TURN IS IT:
          //   info    → an opportunity that is not yours yet
          //   warn    → you owe an action
          //   muted   → waiting on someone else
          //   success → money is inbound
          // A new stage picks one of those four. If none fits, the stage is
          // probably two stages.
          const TURN_YOU   = "var(--ff-warn)";
          const TURN_THEM  = "rgba(var(--ff-muted), .3)";
          const TURN_NEW   = "var(--ff-info)";
          const TURN_MONEY = "var(--ff-success)";
          const stages: { key: string; label: string; count: number; color: string; onClick: () => void }[] = [
            { key: "leads", label: "New leads", count: availableJobs.length, color: TURN_NEW,
              onClick: () => { setActiveTab("available"); window.scrollTo({ top: 0, behavior: "smooth" }); } },
            { key: "propose", label: "Needs your estimate", count: myJobs.filter(STAGE_MATCH.propose).length, color: TURN_YOU,
              onClick: () => { setActiveTab("jobs"); setJobFilter(f => f === "propose" ? null : "propose"); } },
            { key: "awaiting", label: "Awaiting client", count: myJobs.filter(STAGE_MATCH.awaiting).length, color: TURN_THEM,
              onClick: () => { setActiveTab("jobs"); setJobFilter(f => f === "awaiting" ? null : "awaiting"); } },
            { key: "scheduled", label: "Scheduled", count: myJobs.filter(STAGE_MATCH.scheduled).length, color: TURN_THEM,
              onClick: () => { setActiveTab("jobs"); setJobFilter(f => f === "scheduled" ? null : "scheduled"); } },
            { key: "working", label: "In progress", count: myJobs.filter(STAGE_MATCH.working).length, color: TURN_YOU,
              onClick: () => { setActiveTab("jobs"); setJobFilter(f => f === "working" ? null : "working"); } },
            { key: "payment", label: "Awaiting payment", count: myJobs.filter(STAGE_MATCH.payment).length, color: TURN_MONEY,
              onClick: () => { setActiveTab("jobs"); setJobFilter(f => f === "payment" ? null : "payment"); } },
          ];
          return (
            <div style={{ display:"flex", gap:".5rem", overflowX:"auto" as const, paddingBottom:".35rem", marginBottom:"1.25rem" }}>
              {stages.map(st => {
                const on = jobFilter === st.key && activeTab === "jobs";
                return (
                  <button
                    key={st.key}
                    onClick={st.onClick}
                    style={{
                      flex:"1 0 108px", minWidth:"108px", padding:".7rem .6rem", textAlign:"left" as const, cursor:"pointer", fontFamily:"inherit",
                      borderRadius:"12px", background: on ? "rgba(var(--ff-accent-rgb), .1)" : "rgba(var(--ff-fg), .045)",
                      border: on ? "1px solid rgba(var(--ff-accent-rgb), .5)" : "1px solid rgba(var(--ff-fg), .06)",
                      borderTop: "3px solid " + st.color,
                    }}
                  >
                    <div style={{ fontSize:"1.25rem", fontWeight:700, color: st.count > 0 ? "var(--ff-text)" : "rgba(var(--ff-muted), .35)", lineHeight:1.1 }}>{st.count}</div>
                    <div style={{ fontSize:".68rem", color:"rgba(var(--ff-muted), .6)", marginTop: "var(--ff-s1)", lineHeight:1.25 }}>{st.label}</div>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Needs your attention. The LIST is derived ABOVE the return
            (`shownAttn`) so this card and the Pass can never disagree about
            whether anything is on this pro — that is the whole reason for the
            hoist. <AttentionCard> caps the render and returns null on an empty
            list, so there is no length check here.

            ⚠️ `max={4}`, not the component's default 3. The contractor side has
            always shown four and the extra slot is load-bearing: a pro can
            legitimately have a claim, an unsent agreement, missing photos and
            an unpaid balance at the same moment, and all four gate money.

            Each row is DELIBERATELY not interactive as a whole, exactly as on
            the client side: a <button> cannot contain a <button>, and two
            things have to stay in the trailing slot — the worded CTA and the
            dismiss ×. The wording is load-bearing ("Send agreement" and "See
            what's owed" say what is about to happen; a chevron does not).

            `danger` keeps its own treatment rather than becoming a tone: the
            claim row's button is the only destructive-adjacent control in the
            card, and <Row>'s tones colour the ICON, not the button. */}
        <AttentionCard max={4}>
          {shownAttn.map(a => (
            <Row
              key={a.key}
              icon={a.icon}
              tone={a.tone}
              title={a.hero}
              sub={a.text}
              right={
                <>
                  <Button variant={a.danger ? "danger" : "primary"} onClick={a.onClick}>{a.cta}</Button>
                  {/* Hide for now only — see the hiddenNow docblock. Every row
                      here is either a money gate or state that changes, so
                      nothing in this card is ever dismissed forever. */}
                  <DismissX
                    onClick={() => setHiddenNow(prev => new Set(prev).add(attnRowKey(a.key)))}
                    label="Hide for now"
                    title="Hide until next time you open the dashboard"
                  />
                </>
              }
            />
          ))}
        </AttentionCard>

        {activeTab === "jobs" && (() => {
          // Search COMPOSES with the pipeline-stage filter rather than replacing
          // it — a pro who clicked "Scheduled" and then typed an address means
          // both, and silently dropping either would show them a job the
          // controls on screen say is hidden.
          const staged = jobFilter && STAGE_MATCH[jobFilter] ? myJobs.filter(STAGE_MATCH[jobFilter]) : myJobs;
          const tokens = searchTokens(search);
          const shown = staged.filter(j => matchesSearch(tokens, jobSearchFields(j)));
          return (
          <div>
            {myJobs.length > 3 && (
              <DashSearch
                value={search}
                onChange={setSearch}
                placeholder="Search jobs — service, client, address or job code"
                resultText={shown.length + " of " + staged.length + " shown"}
              />
            )}
            {jobFilter && myJobs.length > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:".6rem", marginBottom:"1rem", flexWrap:"wrap" as const }}>
                <span style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .6)" }}>
                  Showing {shown.length} job{shown.length === 1 ? "" : "s"} — {STAGE_LABEL[jobFilter] ?? jobFilter}
                </span>
                <button onClick={() => setJobFilter(null)} style={{ ...s.btn, padding:".3rem .75rem", borderRadius:"99px", fontSize:".75rem" }}>Show all ×</button>
              </div>
            )}
            {/* Two different nothings, said differently. "No jobs in this stage"
                is the truth about the pipeline; when a query is what emptied
                the list, saying that would be a lie the pro can't correct. */}
            {myJobs.length > 0 && shown.length === 0 && (
              <div style={{ textAlign:"center" as const, padding:"2.5rem 1.5rem", color:"rgba(var(--ff-muted), .5)", fontSize:".9rem" }}>
                {tokens.length > 0
                  ? <>No jobs match “{search}”. <button type="button" onClick={() => setSearch("")} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".9rem", fontWeight:600, cursor:"pointer", padding:0 }}>Clear search</button></>
                  : <>No jobs {jobFilter ? (STAGE_LABEL[jobFilter] ?? "in this stage") : "here"} right now.</>}
              </div>
            )}
            {(() => {
              // Persistent "Get set up" checklist — shows until every step is done or
              // skipped ("I don't need this step"). Skips persist to the DB.
              if (!contractor) return null;
              const skipped: string[] = contractor.setup_skipped ?? [];
              const steps = [
                { key: "profile", label: "Complete your profile", done: contractorMissing(contractor).length === 0,
                  sub: contractorMissing(contractor).length > 0 ? "Missing: " + contractorMissing(contractor).join(", ") : "Done — clients can see your credentials.",
                  onClick: () => { const g = contractorGaps(contractor); if (g.length) focusProfileGap(g[0].anchor); else setActiveTab("profile"); }, skippable: false },
                { key: "payouts", label: "Set up payouts", done: !!contractor.stripe_payouts_enabled,
                  sub: contractor.stripe_payouts_enabled ? "Connected — you're ready to get paid." : "Connect a bank account so you can be paid.",
                  // Not skippable: without a payout account we cannot pay them at all.
                  onClick: setupPayouts, skippable: false },
                { key: "availability", label: "Set your working days & hours", done: avail.days.length > 0,
                  sub: avail.days.length > 0 ? "Done — clients see when you work." : "Tell clients when you're available to work.",
                  onClick: () => setActiveTab("profile"), skippable: true },
                { key: "first_bid", label: "Place your first bid", done: bidsCount > 0 || myJobs.length > 0,
                  sub: availableJobs.length > 0 ? availableJobs.length + " open job" + (availableJobs.length === 1 ? "" : "s") + " match your trades right now — fewer bids = easier to win." : "New jobs matching your trades show up in Available Jobs.",
                  onClick: () => setActiveTab("available"), skippable: true },
              ];
              // A skip only counts on a step that's allowed to be skipped, so a
              // historic "payouts" skip can't keep that step hidden any more.
              const remaining = steps.filter(st => !st.done && !(st.skippable && skipped.includes(st.key)));
              if (remaining.length === 0) return null;
              const settled = steps.length - remaining.length;
              return (
                <DashCard style={{ padding:"1.25rem 1.4rem" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:".6rem", flexWrap:"wrap" as const, marginBottom:".35rem" }}>
                    <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.35rem", letterSpacing:".03em", lineHeight:1.1, margin:0 }}>Get set up</h2>
                    <span style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .6)" }}>{settled} of {steps.length} done</span>
                  </div>
                  <div style={{ height:"6px", borderRadius:"99px", background:"rgba(var(--ff-fg), .07)", marginBottom:".6rem", overflow:"hidden" }}>
                    <div style={{ height:"100%", width:(settled / steps.length) * 100 + "%", background:"var(--ff-c10)", borderRadius:"99px", transition:"width .25s ease" }} />
                  </div>
                  {steps.map((step, i) => {
                    const isSkipped = step.skippable && skipped.includes(step.key);
                    return (
                      <div key={step.key} style={{ display:"flex", gap: "var(--ff-s3)", alignItems:"flex-start", padding:".7rem .1rem", borderTop: i === 0 ? "none" : "var(--ff-hair-w) solid rgba(var(--ff-fg), .06)", opacity: isSkipped && !step.done ? .55 : 1 }}>
                        <div style={{ width:"22px", height:"22px", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background: step.done ? "rgba(var(--ff-success-rgb), .15)" : "rgba(var(--ff-accent-rgb), .12)", border:"1px solid " + (step.done ? "rgba(var(--ff-success-rgb), .4)" : "rgba(var(--ff-accent-rgb), .35)"), color: step.done ? "var(--ff-success)" : "var(--ff-c10)", fontSize:".72rem", fontWeight:700 }}>{step.done ? <Ic name="check" size={12} color="var(--ff-success)" /> : i + 1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div onClick={step.done || isSkipped ? undefined : step.onClick} style={{ fontSize:".88rem", fontWeight:500, color:"var(--ff-text)", cursor: step.done || isSkipped ? "default" : "pointer", textDecoration: isSkipped && !step.done ? "line-through" : "none" }}>{step.label}</div>
                          <div style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .55)", marginTop:".1rem" }}>{isSkipped && !step.done ? "Skipped — you can still do this any time from your Profile tab." : step.sub}</div>
                        </div>
                        {!step.done && !isSkipped && (
                          <div style={{ display:"flex", flexDirection:"column" as const, gap:".3rem", alignItems:"flex-end", flexShrink:0 }}>
                            <button onClick={step.onClick} style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", padding:".35rem .8rem", fontSize:".76rem", whiteSpace:"nowrap" as const }}>Do it</button>
                            {step.skippable && (
                              <button onClick={() => skipSetupStep(step.key)} style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .45)", fontFamily:"inherit", fontSize:".7rem", cursor:"pointer", padding:0, whiteSpace:"nowrap" as const }}>I don't need this step</button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </DashCard>
              );
            })()}
            {myJobs.length === 0 ? (
              <div style={{ textAlign:"center" as const, padding:"2.5rem 1.5rem", color:"rgba(var(--ff-muted), .5)" }}>
                <div style={{ marginBottom:".75rem" }}><Ic name="clipboard-list" size={40} color="var(--ff-c10)" /></div>
                <div style={{ fontSize:".95rem", marginBottom:".3rem", color:"var(--ff-text)" }}>No jobs yet</div>
                <div style={{ fontSize:".85rem" }}>Jobs you win show up here. Check <button onClick={() => setActiveTab("available")} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".85rem", fontWeight:600, cursor:"pointer", padding:0 }}>Available Jobs</button> for open work matching your trades.</div>
              </div>
            ) : shown.map(job => (
              <div key={job.id} id={"job-" + job.id} style={{ ...s.jobCard, scrollMarginTop: "5.5rem" }} onClick={() => openJob(job)}>
                {/* The address is the longest thing on this card and it lived in
                    a flex child with no minWidth:0, so it could not shrink —
                    it pushed the status and the price column off the right of
                    a phone. minWidth:0 plus the underlined link's own
                    overflow handling keeps both columns on screen, and the
                    status/price column no longer shrinks to nothing. */}
                <div style={{ display:"flex", gap:".75rem", justifyContent:"space-between", marginBottom:".75rem" }}>
                  <div style={{ minWidth:0, flex:"1 1 auto" }}>
                    <div style={{ fontSize:"1rem", fontWeight:500, marginBottom: "var(--ff-s1)" }}>{job.request?.service_needed ?? "Job"}</div>
                    <div style={{ fontSize:".72rem", fontFamily:"monospace", color:"var(--ff-c10)", marginBottom:".3rem" }}>{jobCode(job.id)}</div>
                    <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", marginBottom: "var(--ff-s1)" }}><Ic name="user" size={13} style={{ marginRight:4 }} />{job.client?.first_name || "Your client"}</div>
                    {jobDestination(job).text && (
                      <a href={mapsUrl(jobDestination(job).text)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        title={jobDestination(job).exact ? undefined : "Approximate area — the client confirms their full address when they pay the deposit."}
                        style={{ display:"inline-block", maxWidth:"100%", fontSize:".82rem", color:"rgba(var(--ff-muted), .65)", textDecoration:"underline", textUnderlineOffset:"3px" }}>
                        <Ic name="map-pin" size={13} color="var(--ff-c10)" style={{ marginRight:4 }} />{jobDestination(job).text}{jobDestination(job).exact ? "" : " (approx.)"}
                      </a>
                    )}
                  </div>
                  <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                    {/* A pill rather than "● scheduled". At a glance on a card
                        list, a tinted chip is what separates one job's state
                        from the next; a coloured bullet in body text does not.

                        The ?? fallback is `rgb(var(--ff-muted))` and NOT one of
                        the four status hues on purpose: it fires only for a
                        status STATUS_COLORS has no entry for, and a colour that
                        claims a meaning for an unknown state is a lie. Muted
                        secondary text is the honest answer — the pill still
                        reads, it just doesn't assert. It was `#94a3b8`, which
                        was slate-400 in both themes and so sat at 2.6:1 on the
                        off-white ground; the token is 71,85,105 in light. */}
                    <span style={{ display:"inline-block", padding:".22rem .55rem", borderRadius:"99px", fontSize:".7rem", fontWeight:700, letterSpacing:".03em", textTransform:"uppercase" as const, whiteSpace:"nowrap" as const, color: STATUS_COLORS[job.status] ?? "rgb(var(--ff-muted))", background:"rgba(var(--ff-fg), .07)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)" }}>{job.status.replace("_"," ")}</span>
                    {job.amount && <div style={{ fontSize:"1rem", fontWeight:600, color:"var(--ff-success)", marginTop:".35rem" }}>${job.amount}</div>}
                  </div>
                </div>
                {activeJobId === job.id && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop:"1rem", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .07)", paddingTop:"1rem" }}>
                    <RequestPhotoQuote requestId={job.request_id} photoPath={job.request?.photo_path} estimatedQuote={job.request?.estimated_quote} quoteNotes={job.request?.quote_notes} canQuote={["assigned","scheduled","in_progress"].includes(job.status)} />

                    {/* Every job needs a signed service agreement before the client can pay,
                        so this sits above the pricing/scheduling work — it's the first move. */}
                    <ContractPanel role="contractor" job={job} onUpdated={() => loadContracts([job.id])} highlight={pulseAnchor === CONTRACT_ANCHOR} />

                    {/* No outer price gate: MilestonePanel self-gates on
                        `total <= 2000 && !job.is_milestone`. Gating here on the
                        raw amount hid the panel from a job already ON a milestone
                        plan whose price later dropped to $2,000 or less — the pro
                        could then neither complete a stage nor get paid. */}
                    <MilestonePanel role="contractor" job={job} />

                    {(job.client_approved_at || job.status === "scheduled" || job.status === "pending_confirmation" || job.status === "completed") && (
                      /* The caption and the panel moved INTO JobTimeline on
                         2026-10-30 — they were duplicated here and in
                         ClientDashboard byte-for-byte. This is the first piece
                         of the redesign to reach the contractor dashboard; the
                         rest of this page is still v1 until it is ported, so
                         expect this one block to look newer than its
                         neighbours for now. Don't re-wrap it to match them. */
                      <JobTimeline job={job} />
                    )}

                    {disputes[job.id] && (() => {
                      const d = disputes[job.id];
                      const open = d.status === "open";
                      const responded = !!d.contractor_responded_at;
                      const deadline = d.response_deadline ? new Date(d.response_deadline) : null;
                      const overdue = deadline ? deadline.getTime() < Date.now() : false;
                      return (
                        <div {...jobAnchor(A_CLAIM, { margin:"0 0 1.25rem", padding:"1rem 1.1rem", borderRadius:"12px", background:"rgba(251,191,36,.07)", border:"1px solid rgba(251,191,36,.35)" })}>
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
                            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:".4rem", marginBottom: "var(--ff-s3)" }}>
                              {(d.photo_paths ?? []).map((p: string) => claimPhotos[p] ? (
                                <a key={p} href={claimPhotos[p]} target="_blank" rel="noopener noreferrer">
                                  <FadeImg src={claimPhotos[p]} alt="Claim photo" style={{ width:"68px", height:"68px", objectFit:"cover" as const, borderRadius:"8px", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)" }} />
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
                              <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none" }} onClick={() => setClaimToAnswer(d)}>Respond to claim</button>
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

                    <div style={{ display:"flex", flexDirection:"column", gap: "var(--ff-s3)", marginBottom:"1.25rem" }}>
                      {job.request?.recurring && (
                        <div style={{ display:"flex", gap:".55rem", alignItems:"flex-start", padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-accent-rgb), .10)", border:"1px solid rgba(var(--ff-accent-rgb), .28)", marginBottom:".3rem" }}>
                          <Ic name="repeat" size={16} color="var(--ff-c10)" style={{ marginTop:1, flexShrink:0 }} />
                          <div style={{ fontSize:".8rem", color:"var(--ff-text)", lineHeight:1.5 }}>
                            <strong>Recurring job{job.request?.recurring_frequency ? " — " + freqLabel(job.request.recurring_frequency) : ""}.</strong> This client wants a regular pro. Taking it on means committing to show up at the agreed times each visit — reliable recurring work, but please only accept if you can keep the schedule.
                          </div>
                        </div>
                      )}
                      {/* Gated on the live stages. The two flags are never cleared, so
                          without this the "the client changed the time" prompt and its
                          Accept button sat on completed and cancelled jobs forever. */}
                      {job.client_rescheduled_at && !job.reschedule_accepted_at
                        && ["assigned","scheduled","in_progress"].includes(job.status) && (
                        <div {...jobAnchor(A_RESCHED, { padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-info-rgb), .10)", border:"1px solid rgba(var(--ff-info-rgb), .30)", marginBottom:".3rem" })}>
                          <div style={{ fontSize:".8rem", color:"var(--ff-text)", lineHeight:1.5, marginBottom:".55rem" }}>
                            <Ic name="calendar" size={14} color="var(--ff-info)" style={{ marginRight:5 }} />
                            <strong>The client changed the time</strong> to {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "a new time"}. Accept it, or propose a different time below if you're not available.
                          </div>
                          <button style={{ ...s.btn, background:"var(--ff-info)", color:"var(--ff-bg)", border:"none" }} disabled={busyJobId === job.id} onClick={() => acceptReschedule(job)}>{busyJobId === job.id ?"…" : "Accept new time"}</button>
                        </div>
                      )}
                      {job.status === "assigned" && (
                        <>
                          {/* The booked time was released because the agreement wasn't
                              signed and paid in time. The job, the estimate and you are
                              all still on it — only the time slot went back. */}
                          {job.slot_released_at && !job.schedule_proposed_at && (
                            <div style={{ padding:".7rem .8rem", borderRadius:"10px", background:"rgba(251,191,36,.08)", border:"1px solid rgba(251,191,36,.35)" }}>
                              <div style={{ fontSize:".82rem", color:"var(--ff-text)", lineHeight:1.55 }}>
                                <Ic name="clock" size={13} color="var(--ff-warn)" style={{ marginRight:5 }} />
                                <strong>The booked time was released.</strong>{job.slot_released_from ? " " + new Date(job.slot_released_from).toLocaleString() + " came round without the agreement being signed and paid, so we freed the slot rather than hold it." : " The agreement wasn't signed and paid in time, so we freed the slot rather than hold it."} You still have this job — propose a new time below and your client can approve it as usual.
                              </div>
                            </div>
                          )}
                          {/* Walkthrough-first: a free site visit before the priced estimate. */}
                          {job.walkthrough_done_at ? (
                            <div style={{ fontSize:".82rem", color:"var(--ff-success)" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />Walkthrough done — send your estimate below while it's fresh.</div>
                          ) : job.walkthrough_proposed_at && job.walkthrough_approved_at ? (
                            <div {...jobAnchor(A_WALK, { padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-success-rgb), .08)", border:"1px solid rgba(var(--ff-success-rgb), .3)" })}>
                              <div style={{ fontSize:".82rem", color:"var(--ff-text)", lineHeight:1.5, marginBottom:".55rem" }}>
                                <Ic name="calendar" size={14} color="var(--ff-success)" style={{ marginRight:5 }} />
                                <strong>Walkthrough confirmed</strong> for {job.walkthrough_at ? new Date(job.walkthrough_at).toLocaleString() : "the agreed time"}. It's a free visit — after you've seen the space, mark it done and send your estimate.
                              </div>
                              <button style={{ ...s.btn, background:"var(--ff-success)", color:"var(--ff-bg)", border:"none", fontWeight:600 }} disabled={busyJobId === job.id} onClick={() => completeWalkthrough(job)}>{busyJobId === job.id ? "…" : "✓ Walkthrough done"}</button>
                            </div>
                          ) : job.walkthrough_proposed_at ? (
                            <div style={{ padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-accent-rgb), .08)", border:"1px solid rgba(var(--ff-accent-rgb), .28)" }}>
                              <div style={{ fontSize:".82rem", color:"var(--ff-text)", lineHeight:1.5, marginBottom:".55rem" }}>
                                <Ic name="clock" size={13} color="var(--ff-c10)" style={{ marginRight:5 }} />
                                Waiting for the client to confirm your walkthrough on <strong>{job.walkthrough_at ? new Date(job.walkthrough_at).toLocaleString() : "the proposed time"}</strong>. Need to change it?
                              </div>
                              <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                                <input type="datetime-local" value={wtForm.when} onChange={e => setWtForm(f => ({ ...f, when: e.target.value }))} style={{ ...ffInp, width:"auto" }} />
                                <button style={s.btn} disabled={busyJobId === job.id} onClick={() => proposeWalkthrough(job)}>{busyJobId === job.id ? "…" : "Update time"}</button>
                              </div>
                            </div>
                          ) : !job.schedule_proposed_at && (
                            <div style={{ padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .03)", border:"1px dashed rgba(var(--ff-fg), .14)" }}>
                              {!wtOpen ? (
                                <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.5 }}>
                                  Hard to price without seeing it?{" "}
                                  <button type="button" onClick={() => setWtOpen(true)} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".8rem", fontWeight:600, cursor:"pointer", padding:0, textDecoration:"underline" }}>Propose a free walkthrough first</button>
                                  {" "}— see the space, then send your estimate on the spot.
                                </div>
                              ) : (
                                <>
                                  <div style={{ fontSize:".8rem", color:"var(--ff-text)", lineHeight:1.5, marginBottom:".55rem" }}><strong>Propose a walkthrough visit.</strong> The client approves the time — it's free, nothing is charged. After the visit, send your estimate below.</div>
                                  <div style={{ display:"flex", flexDirection:"column" as const, gap:".5rem" }}>
                                    <input type="datetime-local" value={wtForm.when} onChange={e => setWtForm(f => ({ ...f, when: e.target.value }))} style={{ ...ffInp, width:"auto", alignSelf:"flex-start" }} />
                                    <input placeholder="Note for the client (optional, e.g. takes about 20 minutes)" value={wtForm.note} onChange={e => setWtForm(f => ({ ...f, note: e.target.value }))} style={ffInp} />
                                    <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                                      <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none" }} disabled={busyJobId === job.id} onClick={() => proposeWalkthrough(job)}>{busyJobId === job.id ? "Sending…" : "Propose walkthrough"}</button>
                                      <button style={s.btn} disabled={busyJobId === job.id} onClick={() => setWtOpen(false)}>Cancel</button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {job.schedule_proposed_at && !job.client_approved_at && (
                            <div style={{ fontSize:".8rem", color:"var(--ff-warn)" }}><Ic name="clock" size={13} style={{ marginRight:4 }} />Waiting for the client to approve {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "your proposed time"}. You can update it below.</div>
                          )}
                          {/* The propose form is wrapped so "Propose now" / "Send estimate"
                              can ring the WHOLE form rather than a single field. The wrapper
                              re-declares the parent's flex column and gap, so it changes
                              nothing visually — these were siblings of the gapped column. */}
                          <div {...jobAnchor(A_PROPOSE, { display:"flex", flexDirection:"column" as const, gap: "var(--ff-s3)" })}>
                          <ScheduleField value={proposeForm.when} onChange={(v) => setProposeForm(f => ({ ...f, when: v }))} />
                          <div>
                            <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom: "var(--ff-s1)" }}>Price ($)</div>
                            <input type="number" min="0" value={proposeForm.amount} placeholder="e.g. 250" onChange={e => setProposeForm(f => ({ ...f, amount: e.target.value, used_base_price:false }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const }} />
                          </div>
                          <textarea value={proposeForm.notes} rows={2} placeholder="Notes for the client (optional)" onChange={e => setProposeForm(f => ({ ...f, notes: e.target.value }))} style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
                          <QuoteBreakdown v={proposeForm} on={pp => setProposeForm(f => ({ ...f, ...pp }))} calloutHint={contractor?.min_callout ?? null} price={priceFor(job.request?.service_needed)} />
                          {/* Optional add-ons the client can tick when approving — great upsell for
                              "while I'm there" extras. Not part of the base price. */}
                          <div style={{ padding:".7rem .8rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .03)", border:"1px dashed rgba(var(--ff-fg), .14)" }}>
                            <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .5)", fontWeight:700, marginBottom: "var(--ff-s1)" }}>Optional add-ons</div>
                            <div style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .55)", lineHeight:1.45, marginBottom: proposeForm.items.length ? ".55rem" : ".45rem" }}>
                              Offer extras the client can tick when approving (e.g. "Replace supply lines — $45"). They're added on top of your price only if the client picks them.
                            </div>
                            {proposeForm.items.map((it, idx) => (
                              <div key={idx} style={{ display:"flex", gap: "var(--ff-s2)", alignItems:"center", marginBottom:".4rem" }}>
                                <input value={it.label} placeholder="Add-on description" onChange={e => setProposeForm(f => ({ ...f, items: f.items.map((x,i) => i === idx ? { ...x, label: e.target.value } : x) }))} style={{ ...ffInp, flex:"1 1 140px" }} />
                                <input type="number" min="0" value={it.amount} placeholder="$" onChange={e => setProposeForm(f => ({ ...f, items: f.items.map((x,i) => i === idx ? { ...x, amount: e.target.value } : x) }))} style={{ ...ffInp, width:"86px", flex:"0 0 86px" }} />
                                <button type="button" aria-label="Remove add-on" onClick={() => setProposeForm(f => ({ ...f, items: f.items.filter((_,i) => i !== idx) }))} style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .45)", fontFamily:"inherit", fontSize:"1rem", cursor:"pointer", padding:"0 .15rem", flexShrink:0 }}>×</button>
                              </div>
                            ))}
                            {proposeForm.items.length < 15 && (
                              <button type="button" onClick={() => setProposeForm(f => ({ ...f, items: [...f.items, { label:"", amount:"" }] }))} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".8rem", fontWeight:600, cursor:"pointer", padding:0 }}>+ Add an optional item</button>
                            )}
                          </div>
                          <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                            <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none" }} disabled={busyJobId === job.id} onClick={() => proposeSchedule(job)}>{busyJobId === job.id ?"Sending…" : (job.schedule_proposed_at ? "Update proposal" : "Propose time & price")}</button>
                            {canWithdraw(job) && <button style={{ ...s.btn, color:"var(--ff-danger)", borderColor:"rgba(var(--ff-danger-rgb), .3)", background:"rgba(var(--ff-danger-rgb), .08)" }} disabled={busyJobId === job.id} onClick={() => withdrawJob(job)}>Withdraw</button>}
                          </div>
                          {/* A client can move the time on a job they've already paid for,
                              which flips it back to 'assigned' — so this branch can render
                              on a job holding money. Two things follow. Withdraw is hidden
                              above, and the price control the propose form offers would be
                              rejected, so the real one is mounted here. */}
                          {/* Keyed on money actually being held, NOT on !canWithdraw —
                              canWithdraw is deliberately stricter than the server and also
                              hides on a milestone job holding nothing yet, where this
                              wording would be a plain lie. There, the button is simply
                              absent and nothing is claimed. */}
                          {(job.payment_status ?? "unpaid") !== "unpaid" && (
                            <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.5 }}>
                              This job is paid for, so it can't be withdrawn here — message the client, or email hello@freddyfixit.ca if something's gone wrong.
                            </div>
                          )}
                          </div>
                          {(job.payment_status ?? "unpaid") !== "unpaid" && renderPriceChange(job)}
                        </>
                      )}
                      {(job.status === "scheduled" || job.status === "in_progress") && (
                        <>
                          <div style={{ fontSize:".85rem", color:"var(--ff-success)" }}><Ic name="calendar" size={13} style={{ marginRight:4 }} />Booked for {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "the agreed time"}{job.amount ? " · $" + job.amount : ""}.</div>
                          {Array.isArray(job.quote_items) && job.quote_items.some((i: any) => i.accepted) && (
                            <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.5 }}>
                              <Ic name="check-circle" size={13} color="var(--ff-success)" style={{ marginRight:4 }} />
                              Add-ons the client picked: {job.quote_items.filter((i: any) => i.accepted).map((i: any) => i.label + " ($" + i.amount + ")").join(", ")} — included in the price above.
                            </div>
                          )}
                          <JobTimer job={job} role="contractor" hourlyRate={contractor?.hourly_rate ?? null} onError={m => notify(m)}
                            onBill={(_h, amt, reason) => {
                              setRequoteForm(o => ({ ...o, [job.id]: { ...(o[job.id] ?? { amount:"", reason:"", labour:"", parts:"", callout:"", subject:false }), amount: amt != null ? String(amt) : (o[job.id]?.amount ?? ""), labour:"", parts:"", callout:"", reason } }));
                              setRequoteOpen(o => ({ ...o, [job.id]: true }));
                            }} />
                          <JobChecklist job={job} role="contractor" onError={m => notify(m)} />
                          <JobExpenses jobId={job.id} items={expenses.filter(e => e.job_id === job.id)} jobAmount={job.amount}
                            onAdd={r => setExpenses(p => [r, ...p])} onDelete={id => setExpenses(p => p.filter(e => e.id !== id))} onError={m => notify(m)} />
                          {/* Heading out: tappable map + on-my-way, side by side */}
                          <div {...jobAnchor(A_ONWAY, { display:"flex", gap:".6rem", flexWrap:"wrap" as const, alignItems:"stretch" })}>
                            {/* The label is keyed on `exact`, not decoration. A pro
                                who reads "Job location" over a postal centroid drives
                                to the right block and the wrong door, and — because
                                the copy sounded definite — never thinks to ask. */}
                            {jobDestination(job).text && (
                              <a href={mapsUrl(jobDestination(job).text)} target="_blank" rel="noopener noreferrer"
                                style={{ flex:"1 1 230px", minWidth:0, display:"flex", alignItems:"center", gap:".65rem", padding:".75rem .9rem", borderRadius:"12px", background:"rgba(var(--ff-fg), .05)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", textDecoration:"none" }}>
                                <Ic name="map-pin" size={20} color="var(--ff-c10)" style={{ flexShrink:0 }} />
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontSize:".66rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .5)", marginBottom:".15rem" }}>{jobDestination(job).exact ? "Service address — tap for directions" : "Approximate area only — ask the client to confirm"}</div>
                                  <div style={{ fontSize:".86rem", fontWeight:600, color:"var(--ff-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{jobDestination(job).text}</div>
                                </div>
                              </a>
                            )}
                            {job.on_my_way_at ? (
                              <div style={{ flex:"1 1 190px", display:"flex", alignItems:"center", justifyContent:"center", gap: "var(--ff-s2)", padding:".75rem .9rem", borderRadius:"12px", background:"rgba(var(--ff-success-rgb), .1)", border:"1px solid rgba(var(--ff-success-rgb), .35)", fontSize:".84rem", color:"var(--ff-success)", fontWeight:600, textAlign:"center" as const }}>
                                <Ic name="check-circle" size={16} color="var(--ff-success)" style={{ flexShrink:0 }} />Client knows you're on the way
                              </div>
                            ) : (
                              <button disabled={busyJobId === job.id} onClick={() => onMyWay(job)}
                                style={{ flex:"1 1 190px", padding:".75rem 1.1rem", borderRadius:"12px", border:"none", background:"var(--ff-c10)", color:"#fff", fontFamily:"inherit", fontSize:".95rem", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap: "var(--ff-s2)" }}>
                                <Ic name="map-pin" size={17} color="#fff" style={{ flexShrink:0 }} />{busyJobId === job.id ? "Sending…" : "I'm on my way"}
                              </button>
                            )}
                          </div>
                          {/* Anchored so the "still needs a before/after photo" attention row
                              lands on the uploader itself. Safe as a bare id: the sibling
                              <JobPhotos> below lives in the mutually exclusive
                              pending_confirmation branch, so the two never render together. */}
                          <div {...jobAnchor(A_PHOTOS)}>
                            <JobPhotos job={job} role="contractor" onError={m => notify(m)} onSaved={(kind, path) => patchJobPhoto(job.id, kind, path)} />
                          </div>
                          <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                            {/* Dimmed AND actually disabled while photos are outstanding —
                                the reason is spelled out directly underneath. */}
                            {!job.is_milestone && <button title={photosMissing(job).length ? "Add " + photosMissing(job).join(" and ") + " first." : undefined} style={{ ...s.btn, background:"var(--ff-success)", color:"var(--ff-bg)", border:"none", fontWeight:600, opacity: photosMissing(job).length ? .55 : 1, cursor: photosMissing(job).length ? "not-allowed" : "pointer" }} disabled={busyJobId === job.id || photosMissing(job).length > 0} onClick={() => markComplete(job)}>{busyJobId === job.id ?"Working…" : "✓ Mark complete"}</button>}
                            {canWithdraw(job) && <button style={{ ...s.btn, color:"var(--ff-danger)", borderColor:"rgba(var(--ff-danger-rgb), .3)", background:"rgba(var(--ff-danger-rgb), .08)" }} disabled={busyJobId === job.id} onClick={() => withdrawJob(job)}>Withdraw</button>}
                          </div>
                          {!job.is_milestone && photosMissing(job).length > 0 && (
                            <div style={{ fontSize:".78rem", color:"var(--ff-c10)", display:"flex", alignItems:"center", gap:".35rem" }}>
                              <Ic name="camera" size={13} color="var(--ff-c10)" style={{ flexShrink:0 }} />
                              Add {photosMissing(job).join(" and ")} to mark this job complete.
                            </div>
                          )}
                          {renderPriceChange(job)}
                        </>
                      )}
                      {job.status === "pending_confirmation" && (
                        <>
                          <div style={{ fontSize:".85rem", color:"var(--ff-warn)" }}><Ic name="clock" size={13} style={{ marginRight:4 }} />You marked this complete — waiting for the client to confirm.</div>
                          {awaitingBalance(job) && (
                            <div {...jobAnchor(A_BALANCE, { background:"rgba(var(--ff-accent-rgb), .08)", border:"1px solid rgba(var(--ff-accent-rgb), .18)", borderRadius:"10px", padding:".7rem .8rem", fontSize:".82rem", color:"var(--ff-text)", lineHeight:1.5 })}>
                              <Ic name="dollar" size={13} color="var(--ff-c10)" style={{ marginRight:4 }} />
                              <strong>{"The client still owes $" + jobBalanceDue(job).toFixed(2) + "."}</strong> They paid a deposit to book you and pay the rest now the work is done. They can't confirm — and your payout can't be released — until that balance is in. We've asked them for it; a friendly message from you usually speeds it up.
                            </div>
                          )}
                          <JobPhotos job={job} role="contractor" onError={m => notify(m)} onSaved={(kind, path) => patchJobPhoto(job.id, kind, path)} />
                          <JobTimer job={job} role="contractor" hourlyRate={contractor?.hourly_rate ?? null} onError={m => notify(m)}
                            onBill={(_h, amt, reason) => {
                              setRequoteForm(o => ({ ...o, [job.id]: { ...(o[job.id] ?? { amount:"", reason:"", labour:"", parts:"", callout:"", subject:false }), amount: amt != null ? String(amt) : (o[job.id]?.amount ?? ""), labour:"", parts:"", callout:"", reason } }));
                              setRequoteOpen(o => ({ ...o, [job.id]: true }));
                            }} />
                          <JobChecklist job={job} role="contractor" onError={m => notify(m)} />
                          <JobExpenses jobId={job.id} items={expenses.filter(e => e.job_id === job.id)} jobAmount={job.amount}
                            onAdd={r => setExpenses(p => [r, ...p])} onDelete={id => setExpenses(p => p.filter(e => e.id !== id))} onError={m => notify(m)} />
                          {renderPriceChange(job)}
                        </>
                      )}
                      {job.status === "completed" && (
                        <div style={{ fontSize:".85rem", color:"var(--ff-success)" }}><Ic name="check-circle" size={13} style={{ marginRight:4 }} />Job completed and confirmed.</div>
                      )}
                    </div>

                    <button
                      onClick={() => { setChatJob(job); if (unreadFor(job.id) > 0) void markConvRead(job.id); }}
                      style={{ display:"flex", alignItems:"center", gap:".5rem", width:"100%", justifyContent:"center", padding:".7rem 1rem", background:"rgba(var(--ff-accent-rgb), .1)", border:"1px solid rgba(var(--ff-accent-rgb), .3)", borderRadius:"10px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".88rem", fontWeight:500, cursor:"pointer" }}>
                      <Ic name="message-square" size={15} />
                      {job.status === "completed"
                        ? `View chat with ${job.client?.first_name || "your client"}`
                        : `Message ${job.client?.first_name || "your client"}`}
                      {unreadFor(job.id) > 0 && (
                        <span style={{ minWidth:18, height:18, padding:"0 .3rem", borderRadius:999, background:"var(--ff-c10)", color:"#fff", fontSize:".68rem", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          {unreadFor(job.id) > 9 ? "9+" : unreadFor(job.id)}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          );
        })()}

        {activeTab === "messages" && (
          <MessagesInbox
            conversations={inboxRows}
            loading={inboxLoading}
            error={inboxError}
            meId={profile?.id}
            onOpen={openConversation}
            onRetry={() => { void refreshConvs(); void bid.refresh(); }}
          />
        )}

        {activeTab === "calendar" && (
          <JobsCalendar
            jobs={myJobs}
            statusColors={STATUS_COLORS}
            onOpen={(job) => { setActiveTab("jobs"); setJobFilter(null); if (activeJobId !== job.id) openJob(job); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        )}

        {activeTab === "available" && <ContractorAvailableTab search={search} availableJobs={availableJobs} contractor={contractor} setActiveTab={setActiveTab} s={s} setSearch={setSearch} priceFor={priceFor} pricing={pricing} bidOpen={bidOpen} setBidOpen={setBidOpen} bid={bid} setBidChat={setBidChat} bidForm={bidForm} setBid={setBid} busyBid={busyBid} placeBid={placeBid} hideJob={hideJob} hiding={hiding} />}

        {activeTab === "profile" && <ContractorProfileTab contractor={contractor} profile={profile} pulseAnchor={pulseAnchor} setShowProfileCongrats={setShowProfileCongrats} setContractor={setContractor} setOpenToOther={setOpenToOther} pricingForm={pricingForm} setPricingForm={setPricingForm} s={s} busyPricing={busyPricing} savePricing={savePricing} googleUrl={googleUrl} setGoogleUrl={setGoogleUrl} busyPf={busyPf} saveGoogleUrl={saveGoogleUrl} portfolio={portfolio} pfUrl={pfUrl} deletePortfolioItem={deletePortfolioItem} pfForm={pfForm} setPfForm={setPfForm} addPortfolioItem={addPortfolioItem} avail={avail} showCustomAvail={showCustomAvail} setShowCustomAvail={setShowCustomAvail} setAvailDays={setAvailDays} dayIsOn={dayIsOn} toggleDay={toggleDay} setAvailStart={setAvailStart} setAvailEnd={setAvailEnd} />}

        {activeTab === "earnings" && <ContractorEarningsTab earn={earn} s={s} setRewindOpen={setRewindOpen} goalInput={goalInput} setGoalInput={setGoalInput} savingGoal={savingGoal} saveGoal={saveGoal} totalEarned={totalEarned} contractor={contractor} myJobs={myJobs} streak={streak} respMins={respMins} expensesFailed={expensesFailed} expenses={expenses} awaitingTotal={awaitingTotal} awaitingJobs={awaitingJobs} stripeNeeds={stripeNeeds} busyStripe={busyStripe} setupPayouts={setupPayouts} exportPayoutsCsv={exportPayoutsCsv} netPayout={netPayout} />}

        {activeTab === "reviews" && <ContractorReviewsTab myReviews={myReviews} s={s} />}

      </DashContent>
        </div>
      </div>

      {bidChat && profile && (
        <BidChat
          requestId={bidChat.requestId}
          contractorId={profile.id}
          meId={profile.id}
          role="contractor"
          title={bidChat.title}
          otherName={bidChat.name}
          onRead={() => void bid.markRead(bidChat.requestId, profile.id)}
          onClose={() => { setBidChat(null); void bid.refresh(); }}
        />
      )}
      {timePromptJob && profile && !chatJob && (
        <ChatTimePrompt
          job={timePromptJob}
          title={timePromptJob.request?.service_needed ?? "This job"}
          onClose={() => setTimeDismissed(prev => new Set(prev).add(timePromptJob.id))}
          onSuggest={() => setChatJob(timePromptJob)}
          onResolved={(outcome) => {
            const now = new Date().toISOString();
            setMyJobs(prev => prev.map(j => j.id === timePromptJob.id
              ? { ...j, chat_time_resolved_at: now,
                  ...(outcome === "scheduled" || outcome === "penciled" || outcome === "proposal_updated"
                    ? { scheduled_at: timePromptJob.chat_time_at } : {}),
                  ...(outcome === "scheduled" ? { status: "scheduled" } : {}) }
              : j));
            if (outcome === "declined") setTimeDismissed(prev => new Set(prev).add(timePromptJob.id));
            else notify(outcome === "ignored" ? "Nothing to update on that job." : "Time saved — it's on your calendar.", outcome === "ignored" ? "err" : "ok");
          }}
        />
      )}
      {chatJob && profile && (
        <JobChat
          jobId={chatJob.id}
          meId={profile.id}
          title={`Chat with ${chatJob.client?.first_name || "your client"}`}
          job={chatJob}
          role="contractor"
          // Stays open right through the claim window — a client needs to reach
          // their pro while deciding, and for the 3 days they have to raise a
          // problem afterwards. chatReadOnly is the single rule for that.
          //
          // The viewer context adds exactly one lock: a pro who won a job but
          // hasn't finished payout setup can read but not write, because
          // contract_ready() means the client cannot be charged for that job at
          // all. `contractor` is null while loading or if the read failed, which
          // leaves payoutsEnabled undefined and the predicate open.
          readOnly={chatReadOnly(chatJob, payoutLockCtx)}
          closedReason={chatClosedReason(chatJob, payoutLockCtx)}
          // Only the payout lock is clearable from inside the drawer, and only
          // while it's actually the reason — a cancelled or paid-out job must
          // keep the quiet grey notice, not an orange alert offering Stripe.
          closedAction={!contractor.stripe_payouts_enabled && jobIsLive(chatJob)
            ? { label: "Connect payouts", onClick: () => { void setupPayouts(); } }
            : null}
          onJump={() => { setActiveTab("jobs"); setJobFilter(null); if (activeJobId !== chatJob.id) openJob(chatJob); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onJobPatch={(patch) => {
            setMyJobs(prev => prev.map(j => (j.id === chatJob.id ? { ...j, ...patch } : j)));
            setChatJob((j: any) => (j ? { ...j, ...patch } : j));
          }}
          onClose={() => { setChatJob(null); void refreshConvs(); }}
        />
      )}
      {claimToAnswer && profile && (
        <RespondToClaim
          disputeId={claimToAnswer.id}
          userId={profile.id}
          claim={claimToAnswer}
          onClose={() => setClaimToAnswer(null)}
          onSubmitted={(resp) => {
            const jid = claimToAnswer.job_id;
            setDisputes(prev => ({ ...prev, [jid]: { ...prev[jid], contractor_response: resp, contractor_responded_at: new Date().toISOString() } }));
            setClaimToAnswer(null);
          }}
        />
      )}
      {rewindOpen && <FreddyRewind mode="contractor" onClose={() => setRewindOpen(false)} />}
        {helpOpen && profile && (
          <RequestHelpModal userId={profile.id} onClose={() => setHelpOpen(false)} />
        )}
        {bugOpen && profile && (
          <RequestHelpModal userId={profile.id} role="contractor" mode="bug" onClose={() => setBugOpen(false)} />
        )}
        <ConfirmDialog state={confirmState} onClose={(ok) => { confirmState?.resolve(ok); setConfirmState(null); }} />
    </DashShell>
  );
}
