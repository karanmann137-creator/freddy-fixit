import { Ic } from "@/components/Ic";
import VoiceDictate from "@/components/VoiceDictate";
import PasswordField from "@/components/PasswordField";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import OnboardingProgress from "@/components/OnboardingProgress";
import { trackEvent } from "@/lib/analytics";
import { requestGoogleReview } from "@/lib/reviewPrompt";
import { useServicePricing, fromText } from "@/lib/servicePricing";
import { isPerKmService, freqLabel, SLIDER_STOPS, SLIDER_SHORT } from "@/lib/recurrence";
import NewRequest from "@/components/NewRequest";
import OAuthButtons from "@/components/OAuthButtons";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import ServicePicker from "@/components/ServicePicker";
import BudgetPicker from "@/components/BudgetPicker";
import { validateEmail, validatePhone } from "@/lib/emailValidation";
import { stashReferralCode, stashedReferralCode, applyReferralAtSignup } from "@/lib/referralCode";
import WaitlistForm from "@/components/WaitlistForm";
import { usePlatformStatus, acceptingRequests } from "@/lib/platformStatus";
import { detectFromText } from "@/lib/serviceTags";
import { questionsFor, answerSummary, type JobAnswers } from "@/lib/jobQuestions";

export const SERVICES = [
  { iconName: "wrench", label: "General Handyman" },
  { iconName: "pipe", label: "Plumbing Repair" },
  { iconName: "zap", label: "Electrical Work" },
  { iconName: "thermometer", label: "HVAC Maintenance" },
  { iconName: "hammer", label: "Carpentry" },
  { iconName: "paint-roller", label: "Painting" },
  { iconName: "layers", label: "Drywall / Flooring" },
  { iconName: "car", label: "Oil Change" },
  { iconName: "circle-dashed", label: "Tire Swap / Rotation" },
  { iconName: "battery", label: "Battery / Brakes" },
  { iconName: "car", label: "Vehicle Maintenance" },
  { iconName: "tree", label: "Landscaping" },
  { iconName: "snowflake", label: "Snow Removal" },
  { iconName: "cloud-rain", label: "Gutters" },
  { iconName: "door", label: "Windows & Doors" },
  { iconName: "building", label: "Siding & Roofing" },
  { iconName: "garage-door", label: "Garage" },
  { iconName: "wind", label: "Air Conditioning" },
  { iconName: "sparkles", label: "Cleaning Services" },
  { iconName: "trowel", label: "Concrete / Masonry" },
  { iconName: "key", label: "Locksmith" },
  { iconName: "refrigerator", label: "Appliance Repair / Install" },
  { iconName: "sun", label: "Solar" },
  { iconName: "package", label: "Moving & Storage" },
  { iconName: "trash", label: "Junk Removal" },
  { iconName: "sparkles", label: "Pest Control" },
  { iconName: "wind", label: "Duct Cleaning" },
  { iconName: "toolbox", label: "Fencing" },
  { iconName: "hammer", label: "Decks & Patios" },
  { iconName: "sparkles", label: "Window Cleaning" },
  { iconName: "home", label: "Home Renovations" },
  { iconName: "layers", label: "Insulation" },
  { iconName: "cloud-rain", label: "Eavestrough Cleaning" },
  { iconName: "droplet", label: "Basement / Waterproofing" },
  { iconName: "droplet", label: "Pressure Washing" },
  { iconName: "package", label: "Other" },
];

export const SCHEDULES = [
  { iconName: "zap", label: "Urgent / ASAP",  sub: "Within 24 hours" },
  { iconName: "calendar", label: "This Week",       sub: "Next 2–5 days" },
  { iconName: "calendar", label: "Flexible",        sub: "I'm not in a rush" },
  { iconName: "refresh", label: "Recurring",       sub: "Regular maintenance" },
];

// One short, plain-language line per step — replaces both the old
// STEP_TITLES/STEP_SUBS pair and the Freddy speech-bubble reframe
// (see OnboardingProgress for the numbered bar that carries the step count).
const STEP_TITLES = ["Describe your problem", "Confirm what we found", "Answer a few quick questions", "Add the job details", "Create your free account"];
// Stable machine names for the drop-off funnel in PostHog (do not rename — insights
// key off these). "details" and "account" are deliberately unchanged so the existing
// funnel keeps working; "service" is gone because that screen no longer exists.
const STEP_NAMES  = ["describe", "confirm", "questions", "details", "account"];

const HOME_TO_SERVICE: Record<string,string> = {
  "General Repairs": "General Handyman",
  "Plumbing": "Plumbing Repair",
  "Electrical": "Electrical Work",
  "HVAC": "HVAC Maintenance",
  "Drywall & Flooring": "Drywall / Flooring",
};

// Format a North-American phone as the user types: 403-555-0100.
function fmtPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3) + "-" + d.slice(3);
  return d.slice(0,3) + "-" + d.slice(3,6) + "-" + d.slice(6);
}

// A referral code can arrive two ways: in the ?ref= link, or typed in by hand
// because the friend was told it in person. App.tsx stashes the link version to
// localStorage, but it does that in an effect, so on a cold load of
// /client-onboarding?ref=CODE it may not have run yet — read the URL directly
// too rather than depending on which effect fires first.
function stashedRefCode(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (fromUrl) return fromUrl.trim().toUpperCase();
    return stashedReferralCode();
  } catch { return ""; }
}

// Derive a display name from the email local-part so clients don't have to type
// their name (reduces last-step drop-off). "alex.johnson@x.com" -> Alex / Johnson.
function namesFromEmail(email: string): { first: string; last: string } {
  const localRaw = (email.split("@")[0] || "");
  const local = localRaw.replace(/\d+/g, "");
  const parts = local.split(/[._\-+]+/).filter(pt => pt.length > 1);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  let first = parts[0] ? cap(parts[0]) : "";
  const last = parts[1] ? cap(parts[1]) : "";
  if (!first) { const fallback = (localRaw.replace(/[^A-Za-z]/g, "") || localRaw); first = fallback ? cap(fallback) : ""; }
  return { first, last };
}

export default function ClientOnboarding() {
  const [, setLocation] = useLocation();
  // A signed-in user starting a new request gets the streamlined returning-user
  // flow (no re-signup); only logged-out visitors get the account-creation form.
  const [mode, setMode] = useState<"loading"|"signup"|"new">("loading");
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMode(user ? "new" : "signup");
    })();
  }, []);

  // Is the marketplace taking new job requests right now? Read unconditionally
  // (hooks rule) — the gate itself lives further down, past the early returns.
  const { status: platform, ready: platformReady } = usePlatformStatus();

  // Pre-select a service if the home page linked here with ?service=…
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("service");
    if (!raw) return;
    const mapped = HOME_TO_SERVICE[raw] ?? raw;
    if (SERVICES.some(sv => sv.label === mapped)) setSelectedServices([mapped]);
  }, []);
  const [step, setStep] = useState(1);
  const TOTAL = 5;
  // What the keyword map pulled out of the description, and the exact text it was
  // read from. Storing the text lets us re-run detection only when the description
  // actually changed, so a client who edits their chips then steps back and forward
  // doesn't have their edits silently overwritten.
  const [tags, setTags]                   = useState<string[]>([]);
  const [answers, setAnswers]             = useState<JobAnswers>({});
  const [detectedFor, setDetectedFor]     = useState("");
  const [showAllServices, setShowAllServices] = useState(false);
  const [form, setForm] = useState(() => ({ email:"", phone:"", password:"", preferredSchedule:"", location:"", postalCode:"", jobDescription:"", businessName:"", businessType:"", locations:"", billingPreference:"", referralCode: stashedRefCode() }));
  // True only when Have I Been Pwned definitively matched the typed password.
  // An unreachable HIBP reports false, so a flaky network can never block a signup.
  const [pwBreached, setPwBreached] = useState(false);
  const [clientType, setClientType] = useState<"individual"|"business">("individual");
  const [recurring, setRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<string>("");
  const [sliderIdx, setSliderIdx]                   = useState(3); // default "monthly"
  const [recurringDates, setRecurringDates]         = useState<string[]>([]);
  const [newDate, setNewDate]                       = useState("");
  const [recurringKm, setRecurringKm]               = useState("");
  const [prepayPref, setPrepayPref]                 = useState(0);
  const [recurringStartDate, setRecurringStartDate] = useState("");
  const [recurringEndDate, setRecurringEndDate]     = useState("");

  const SEASON_PRESETS = [
    { label: "Spring", start: "-04-01", end: "-06-30" },
    { label: "Summer", start: "-07-01", end: "-09-30" },
    { label: "Fall",   start: "-10-01", end: "-11-30" },
    { label: "Winter", start: "-12-01", end: "-03-31" },
  ];
  const applySeason = (s: typeof SEASON_PRESETS[0]) => {
    const yr = new Date().getFullYear();
    const startYr = s.label === "Winter" && new Date().getMonth() >= 11 ? yr + 1 : yr;
    const endYr   = s.label === "Winter" ? startYr + 1 : startYr;
    setRecurringStartDate(startYr + s.start);
    setRecurringEndDate(endYr + s.end);
  };

  // Slider drives the time cadence (1 wk -> 3 mo). Seasonal / per_km override it.
  const pickSlider = (i: number) => {
    const idx = Math.max(0, Math.min(SLIDER_STOPS.length - 1, i));
    setSliderIdx(idx);
    setRecurringFrequency(SLIDER_STOPS[idx]);
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const addDate = () => {
    if (!newDate) return;
    setRecurringDates(prev => prev.includes(newDate) ? prev : [...prev, newDate].sort());
    setNewDate("");
  };
  const removeDate = (d: string) => setRecurringDates(prev => prev.filter(x => x !== d));

  // When the client switches to Recurring, seed a sensible cadence (monthly).
  useEffect(() => {
    if (form.preferredSchedule === "Recurring" && !recurringFrequency) {
      setRecurringFrequency(SLIDER_STOPS[sliderIdx]);
    }
  }, [form.preferredSchedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Onboarding drop-off funnel: fire a step-view event each time a logged-out
  // visitor lands on / advances through a signup step. Lets PostHog pinpoint
  // exactly which internal step people abandon (steps live on one URL, so
  // $pageview alone can't see them). Named steps: service -> details -> account.
  useEffect(() => {
    if (mode !== "signup") return;
    trackEvent("onboarding_step_view", { flow: "client", step, step_name: STEP_NAMES[step-1] || String(step) });
  }, [step, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const pricing = useServicePricing();
  const [budgetMin, setBudgetMin]           = useState("");
  const [budgetMax, setBudgetMax]           = useState("");
  const [budgetFlexible, setBudgetFlexible] = useState(false);
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoWarn, setPhotoWarn] = useState(false); // photo failed to upload at submit
  const [referral, setReferral] = useState<{ code:string } | null>(null);
  const [refCopied, setRefCopied] = useState(false);

  const set = (key: string, val: string) => { setForm(f => ({ ...f, [key]: val })); setErrors(e => ({ ...e, [key]: "" })); };

  const toggleService = (label: string) => {
    setSelectedServices(prev => prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]);
    setErrors(e => ({ ...e, serviceNeeded: "" }));
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  // The questions shown are driven by the FIRST selected service, so if that
  // changes the recorded answers belong to a different question set and must go.
  // Keeping them would attach (say) a plumbing answer to an electrical job.
  const primaryService = selectedServices[0] || "";
  useEffect(() => { setAnswers({}); }, [primaryService]);
  const activeQuestions = questionsFor(primaryService);

  const setAnswer = (q: { id: string; multi?: boolean }, option: string) => {
    setAnswers(prev => {
      if (!q.multi) {
        // Tapping the chosen answer again clears it — every question is skippable.
        return prev[q.id] === option ? { ...prev, [q.id]: "" } : { ...prev, [q.id]: option };
      }
      const cur = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
      const nextVals = cur.includes(option) ? cur.filter(v => v !== option) : [...cur, option];
      return { ...prev, [q.id]: nextVals };
    });
  };
  const isAnswered = (q: { id: string; multi?: boolean }, option: string) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.includes(option) : v === option;
  };
  const answeredCount = activeQuestions.filter(q => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : !!v;
  }).length;

  // Read the description and pre-fill services + descriptive tags. Runs when the
  // client leaves the description screen, never on every keystroke — and never
  // overwrites services they picked themselves (or a ?service= deep link).
  const runDetect = () => {
    const text = form.jobDescription.trim();
    if (!text || text === detectedFor) return;
    const d = detectFromText(text);
    setDetectedFor(text);
    setTags(d.tags);
    if (d.services.length) setSelectedServices(prev => prev.length ? prev : d.services);
  };

  // What the contractor actually reads. The answers and tags are folded into the
  // description text itself so pros see them today without a schema change; the
  // structured copies also ride along in signup metadata for later use.
  const composedDescription = () => {
    const parts = [form.jobDescription.trim()];
    const sum = answerSummary(primaryService, answers);
    if (sum) parts.push(sum);
    if (tags.length) parts.push("Details: " + tags.join(", "));
    return parts.join("\n\n");
  };

  const validate = () => {
    const errs: Record<string,string> = {};
    // 1 describe · 2 confirm · 3 questions (nothing required — every one is skippable)
    // · 4 details · 5 account
    if (step === 1) {
      if (form.jobDescription.trim().length < 10) errs.jobDescription = "Tell us a little more — at least 10 characters";
    }
    if (step === 2) {
      if (selectedServices.length === 0) errs.serviceNeeded = "Please select at least one service";
    }
    if (step === 4) {
      if (!form.location.trim() && !form.postalCode.trim()) errs.location = "Enter your address or postal code";
      else if (!form.location.trim() && form.postalCode.trim() && !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(form.postalCode.trim())) errs.location = "Enter a valid postal code (e.g. T2P 1J9) or your address";
      if (!form.preferredSchedule) errs.preferredSchedule = "Please select a schedule";
      // Budget is optional, but if given it has to make sense.
      if (!budgetFlexible) {
        const bLo = budgetMin.trim() === "" ? null : Number(budgetMin);
        const bHi = budgetMax.trim() === "" ? null : Number(budgetMax);
        if ((bLo != null && (!isFinite(bLo) || bLo < 0)) || (bHi != null && (!isFinite(bHi) || bHi < 0))) {
          errs.budget = "Budget must be a positive number";
        } else if (bLo != null && bHi != null && bHi < bLo) {
          errs.budget = "Budget maximum must be at least the minimum";
        }
      }
    }
    if (step === 5) {
      { const ev = validateEmail(form.email); if (!ev.ok) errs.email = ev.error!; }
      { const pv = validatePhone(form.phone); if (!pv.ok) errs.phone = pv.error!; }
      if (form.password.length < 8) errs.password = "Minimum 8 characters";
      else if (pwBreached) errs.password = "This password has appeared in public data breaches. Please choose a different one.";
    }
    setErrors(errs);
    // On a long step the errored field can sit below the fold — scroll it into view.
    const order = ["jobDescription","serviceNeeded","location","preferredSchedule","budget","email","phone","password"];
    const first = order.find(k => errs[k]);
    if (first) setTimeout(() => { document.getElementById("co-err-" + first)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    // Read the description on the way out of screen 1 so screen 2 has something
    // to confirm.
    if (step === 1) runDetect();
    setStep(s => s + 1);
    window.scrollTo(0,0);
  };
  const back = () => { if (step === 1) setLocation("/"); else { setStep(s => s - 1); window.scrollTo(0,0); } };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!agreedToTerms) { setSubmitError("Please agree to the User Agreement and Privacy Policy to continue."); window.scrollTo(0,0); return; }
    setLoading(true); setSubmitError("");
    // Name isn't collected any more — derive it from the email address.
    const derivedName = namesFromEmail(form.email);
    try {
      // Pass the whole request as signup metadata so a DB trigger creates the
      // profile + client_request even when email confirmation is on (no session
      // is returned until the email is verified).
      const metadata: Record<string, any> = {
        role: "client",
        first_name: derivedName.first, last_name: derivedName.last, phone: form.phone,
        service_needed: selectedServices.join(", "),
        budget_flexible: budgetFlexible,
        budget_min: budgetFlexible || budgetMin.trim() === "" ? "" : String(Number(budgetMin)),
        budget_max: budgetFlexible || budgetMax.trim() === "" ? "" : String(Number(budgetMax)),
        preferred_schedule: form.preferredSchedule,
        location: form.location.trim() || form.postalCode.trim(),
        postal_code: form.postalCode.trim(),
        // The description a pro reads already has the answers + tags folded in, so
        // this works today with no schema change. The structured copies ride along
        // separately for a later migration that wants them as real columns.
        job_description: composedDescription(),
        job_tags: tags,
        job_answers: answers,
        client_type: clientType,
        business_name: clientType === "business" ? form.businessName : "",
        business_type: clientType === "business" ? form.businessType : "",
        locations: clientType === "business" ? form.locations : "",
        recurring: recurring || form.preferredSchedule === "Recurring",
        recurring_frequency: recurringFrequency,
        recurring_interval_km: recurringFrequency === "per_km" && recurringKm ? String(parseInt(recurringKm, 10) || "") : "",
        recurring_prepay_pref: String(prepayPref || 0),
        recurring_start_date: recurringStartDate,
        recurring_end_date: recurringEndDate,
        recurring_dates: recurringDates,
        billing_preference: clientType === "business" ? form.billingPreference : "",
      };
      // Block duplicate accounts: an email or phone already in use can't sign up again
      // (client or contractor). Pre-flight check; DB triggers are the hard backstop.
      try {
        const { data: avail } = await supabase.rpc("check_signup_availability", { p_email: form.email, p_phone: form.phone });
        if ((avail as any)?.email_taken) { setSubmitError("An account with this email already exists. Please sign in instead."); window.scrollTo(0,0); setLoading(false); return; }
        if ((avail as any)?.phone_taken) { setSubmitError("An account with this phone number already exists. Please sign in, or use a different number."); window.scrollTo(0,0); setLoading(false); return; }
      } catch {}
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: metadata, emailRedirectTo: `${window.location.origin}/auth/callback?role=client` },
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Account creation failed.");
      // Email-confirmation mode returns a fake "success" (no identities) when the
      // email already exists. Treat that as a duplicate instead of a new signup.
      if (((authData.user.identities?.length) ?? 0) === 0) { setSubmitError("An account with this email already exists. Please sign in instead."); window.scrollTo(0,0); setLoading(false); return; }
      // Weekly-tips opt-in (CASL express consent — checkbox is never pre-checked).
      if (newsletterOptIn) {
        try { await supabase.rpc("newsletter_subscribe", { p_email: form.email, p_audience: "client", p_name: derivedName.first, p_source: "signup_checkbox" }); } catch {}
      }
      const userId = authData.user.id;
      // A TYPED code has to survive the email-confirmation detour. There is no
      // session yet, so apply_referral_code (keyed on auth.uid()) can't run — and
      // AuthCallback, which runs it after they click the link, only ever reads
      // localStorage. Without this line a code entered by hand is silently lost
      // for exactly the people who take the long way round.
      stashReferralCode(form.referralCode);
      // No session => email confirmation required. The trigger saved their
      // request already; show the verify screen.
      if (!authData.session) { trackEvent("sign_up", { method: "client" }); trackEvent("post_job"); requestGoogleReview("signup"); requestGoogleReview("job_posted"); setVerifyEmail(true); window.scrollTo(0,0); setLoading(false); return; }

      // Session exists: attach the optional photo to the request the trigger made.
      if (photoFile) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = userId + "/" + crypto.randomUUID() + "." + ext;
        const up = await supabase.storage.from("problem-photos").upload(path, photoFile, { upsert: false });
        if (!up.error) {
          const { data: reqRow } = await supabase.from("client_requests").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (reqRow) await supabase.from("client_requests").update({ photo_path: path }).eq("id", reqRow.id);
        } else {
          setPhotoWarn(true); // surface on the success screen instead of failing silently
        }
      }
      // Apply the referral code now that the client has an active session. The
      // TYPED code wins over the stashed one: if they arrived on a ?ref= link but
      // then deliberately typed a different code, the one they typed is the one
      // they meant. A bad code must never block a signup — applyReferralAtSignup
      // cannot throw, and a refusal is now STASHED rather than discarded, so the
      // dashboard prints it directly above the box that retries it.
      await applyReferralAtSignup(form.referralCode || stashedReferralCode());
      trackEvent("sign_up", { method: "client" }); trackEvent("post_job"); requestGoogleReview("signup"); requestGoogleReview("job_posted");
      try { const { data: refData } = await supabase.rpc("get_my_referral"); const rc = Array.isArray(refData) ? refData[0]?.code : (refData as any)?.code; if (rc) setReferral({ code: rc }); } catch {}
      setSuccess(true); window.scrollTo(0,0);
    } catch (err: any) {
      setSubmitError(err.message?.includes("already registered") ? "An account with this email already exists. Please sign in instead." : err.message ?? "Something went wrong.");
    } finally { setLoading(false); }
  };

  const copyReferral = async () => {
    const code = referral?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`Get your first Freddy Fix It service fee waived with my code ${code}: https://freddyfixit.ca/?ref=${code}`);
      setRefCopied(true); setTimeout(() => setRefCopied(false), 2000);
    } catch {}
  };

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".95rem", outline:"none", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"var(--ff-bg)", backgroundImage:"linear-gradient(rgba(var(--ff-bg-rgb), 0.90), rgba(var(--ff-bg-rgb), 0.95)), radial-gradient(ellipse 50% 32% at 18% -4%, rgba(234,107,20,0.30) 0%, transparent 68%), radial-gradient(ellipse 55% 36% at 84% -8%, rgba(234,107,20,0.18) 0%, transparent 70%), repeating-linear-gradient(45deg, transparent 0 26px, rgba(var(--ff-fg), 0.022) 26px, rgba(var(--ff-fg), 0.022) 27px), repeating-linear-gradient(-45deg, transparent 0 26px, rgba(var(--ff-fg), 0.018) 26px, rgba(var(--ff-fg), 0.018) 27px), url(\"https://images.unsplash.com/photo-1750128973550-750f796f431b?auto=format&fit=crop&w=1600&q=65\")", backgroundSize:"auto, auto, auto, auto, auto, cover", backgroundPosition:"center, center, center, center, center, center", backgroundAttachment:"fixed", padding:"3rem 1rem 4rem", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    inner: { maxWidth:"580px", margin:"0 auto" },
    card: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"2rem" },
    label: { display:"block", fontSize:".78rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .6)", marginBottom:".6rem" },
    err: { fontSize:".78rem", color:"var(--ff-danger)", marginTop:".35rem" },
    svcBtn: { display:"flex", alignItems:"center", gap:".65rem", padding:".9rem 1rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", fontSize:".88rem", cursor:"pointer", textAlign:"left" as const, width:"100%" },
    svcBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
    schedBtn: { display:"flex", alignItems:"center", gap:"1rem", padding:"1rem 1.2rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".75rem" },
    schedBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
    navBtn: { flex:1, padding:".85rem 1.5rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:".4rem" },
  };

  if (mode === "loading") return (
    <>
      <style>{`@keyframes ff-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ minHeight:"100vh", background:"var(--ff-bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Ic name="refresh" size={40} color="#ea6b14" style={{ animation:"ff-spin .8s linear infinite" }} />
      </div>
    </>
  );
  if (mode === "new") return <NewRequest />;

  if (verifyEmail) return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ ...s.inner, textAlign:"center", paddingTop:"4rem" }}>
        <div style={{ width:"72px", height:"72px", background:"rgba(234,107,20,.15)", border:"2px solid rgba(234,107,20,.4)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 2rem" }}>
          <Ic name="mail" size={32} color="#ea6b14" />
        </div>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:".5rem" }}>Check Your <span style={{ color:"#ea6b14" }}>Email</span></h1>
        <p style={{ color:"rgba(var(--ff-muted), .7)", marginBottom:".5rem", lineHeight:1.6 }}>We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account.</p>
        <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".85rem", marginBottom:"2rem", fontWeight:300 }}>Your request is saved — we'll start matching you with contractors right away.{photoFile ? " Once you've verified, you can add your photo from your dashboard." : ""}</p>
        <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff", maxWidth:"260px", margin:"0 auto" }} onClick={() => setLocation("/login")}>Go to Sign In →</button>
      </div>
    </div>
  );

  if (success) return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ ...s.inner, textAlign:"center", paddingTop:"4rem" }}>
        <div style={{ width:"72px", height:"72px", background:"rgba(234,107,20,.15)", border:"2px solid rgba(234,107,20,.4)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 2rem" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ea6b14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"3rem", letterSpacing:".06em", marginBottom:".5rem" }}>Request <span style={{ color:"#ea6b14" }}>Received!</span></h1>
        <p style={{ color:"rgba(var(--ff-muted), .65)", marginBottom:"2rem" }}>We'll be in touch within a few hours.</p>
        {photoWarn && (
          <p style={{ background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.45)", borderRadius:"10px", padding:".85rem 1rem", color:"var(--ff-text)", fontSize:".88rem", lineHeight:1.55, marginBottom:"2rem", textAlign:"left" }}>
            Heads up — your photo didn't upload. Your request went through fine; you can add the photo again from your dashboard.
          </p>
        )}
        {referral?.code && (
          <div style={{ background:"linear-gradient(135deg, rgba(234,107,20,.10), rgba(var(--ff-fg),.03))", border:"1px solid rgba(234,107,20,.28)", borderRadius:"12px", padding:"1.25rem", marginBottom:"2rem", textAlign:"left" }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:".04em", marginBottom:".35rem" }}>Invite a friend, they save</div>
            <div style={{ fontSize:".84rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.5, marginBottom:".9rem" }}>Friends who join with your code get the <strong>3% service fee waived on their first job</strong>.</div>
            <div style={{ display:"flex", gap:".6rem", alignItems:"center", flexWrap:"wrap" as const }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.6rem", letterSpacing:".12em", color:"#ea6b14", border:"1px dashed rgba(234,107,20,.5)", borderRadius:"10px", padding:".3rem .85rem" }}>{referral.code}</div>
              <button style={{ ...s.navBtn, fontSize:".82rem", padding:".55rem 1rem", ...(refCopied ? { color:"#22c55e", borderColor:"rgba(34,197,94,.4)", background:"rgba(34,197,94,.1)" } : { background:"rgba(var(--ff-fg), .06)", color:"var(--ff-text)", border:"1px solid rgba(var(--ff-fg), .12)" }) }} onClick={copyReferral}>{refCopied ? "Copied ✓" : "Copy invite link"}</button>
            </div>
          </div>
        )}
        <div style={{ display:"flex", gap:".75rem", justifyContent:"center" }}>
          <button style={{ ...s.navBtn, background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"1px solid rgba(var(--ff-fg), .1)" }} onClick={() => setLocation("/")}>← Home</button>
          <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={() => setLocation("/client-dashboard")}>My Dashboard →</button>
        </div>
      </div>
    </div>
  );

  // Waitlist / paused mode — capture interest instead of creating an account and
  // a job request no contractor is allowed to act on yet. The DB trigger
  // `enforce_platform_pause` is the real gate; this is the humane version of it.
  // Anything the visitor already typed is carried into the waitlist form so they
  // don't start over. Placed AFTER the verifyEmail/success returns so someone who
  // signed up moments before the owner flipped the switch still sees their
  // confirmation screen.
  if (platformReady && !acceptingRequests(platform.mode)) return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ ...s.inner, paddingTop:"2.5rem" }}>
        <button onClick={() => setLocation("/")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"1.5rem", display:"block" }}>
          ← Home
        </button>
        <WaitlistForm
          initialService={selectedServices[0] || ""}
          initialDescription={form.jobDescription}
          initialEmail={form.email}
          source="client_onboarding"
        />
        <p style={{ textAlign:"center", fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.6, margin:"1.5rem auto 0", maxWidth:"460px" }}>
          Are you a contractor? We're still onboarding pros while we rebuild —{" "}
          <a href="/contractor-onboarding" style={{ color:"#ea6b14", textDecoration:"none", fontWeight:600 }}>join Freddy's team →</a>
        </p>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <button onClick={back} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"2rem", display:"block" }}>
          {step === 1 ? "← Home" : "← Back"}
        </button>
        <OnboardingProgress step={step} total={TOTAL} />
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:"2rem" }}>{STEP_TITLES[step-1]}</h1>

        <div style={s.card}>
          {/* ── 5 · Account ─────────────────────────────────────────────── */}
          {step === 5 && (
            <div>
              <OAuthButtons role="client" label="sign up in one tap with" />
              <p style={{ textAlign:"center", fontSize:".78rem", color:"rgba(var(--ff-muted), .4)", margin:"1.25rem 0" }}>or create your account with email</p>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Email</label>
                <input autoComplete="email" style={{ ...inp, borderColor: errors.email ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} type="email" placeholder="alex@email.com" value={form.email} onChange={e => set("email",e.target.value)} />
                {errors.email && <p id="co-err-email" style={s.err}>{errors.email}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Phone <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                <input autoComplete="tel" style={{ ...inp, borderColor: errors.phone ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} type="tel" placeholder="403-555-0100" value={form.phone} onChange={e => set("phone",fmtPhone(e.target.value))} />
                {errors.phone && <p id="co-err-phone" style={s.err}>{errors.phone}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Password (for your account)</label>
                <PasswordField meter autoComplete="new-password" style={{ ...inp, borderColor: errors.password ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="Min 8 characters" value={form.password} onChange={v => set("password",v)} onBreachChange={setPwBreached} />
                <p style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .55)", margin:".3rem 0 0", lineHeight:1.4 }}>At least 8 characters. Length beats symbols &mdash; four random words is stronger than one word with punctuation.</p>
                {errors.password && <p id="co-err-password" style={s.err}>{errors.password}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Referral code <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                <input
                  style={{ ...inp, letterSpacing:".08em" }}
                  type="text" placeholder="A friend's code"
                  autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={24}
                  value={form.referralCode}
                  onChange={e => set("referralCode", e.target.value.toUpperCase())}
                />
                <p style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .55)", margin:".3rem 0 0", lineHeight:1.4 }}>
                  Referred by someone? Enter their code and we&rsquo;ll waive the 3% service fee on your first job. Prefilled automatically if you arrived from an invite link.
                </p>
              </div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:".75rem", margin:"1.5rem 0 .5rem", padding:"1rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={agreedToTerms}
                  onChange={e => { setAgreedToTerms(e.target.checked); if (e.target.checked) setSubmitError(""); }}
                  style={{ marginTop:"2px", accentColor:"#ea6b14", width:"16px", height:"16px", flexShrink:0, cursor:"pointer" }}
                />
                <label htmlFor="agreeTerms" style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, cursor:"pointer", fontWeight:300 }}>
                  I am 18 or older and I agree to Freddy Fix It&rsquo;s{" "}
                  <a href="/user-agreement" target="_blank" rel="noopener noreferrer" style={{ color:"#ea6b14", textDecoration:"none" }}>User Agreement</a>
                  {" "}and{" "}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"#ea6b14", textDecoration:"none" }}>Privacy Policy</a>.
                </label>
              </div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:".75rem", margin:".5rem 0", padding:".85rem 1rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
                <input
                  type="checkbox"
                  id="newsTips"
                  checked={newsletterOptIn}
                  onChange={e => setNewsletterOptIn(e.target.checked)}
                  style={{ marginTop:"2px", accentColor:"#ea6b14", width:"16px", height:"16px", flexShrink:0, cursor:"pointer" }}
                />
                <label htmlFor="newsTips" style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, cursor:"pointer", fontWeight:300 }}>
                  Email me practical Calgary home &amp; vehicle tips (about once a week — unsubscribe anytime).
                </label>
              </div>
              {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginTop:"1rem" }}>{submitError}</div>}
            </div>
          )}

          {/* ── 1 · Describe ────────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>What needs fixing?</label>
                <textarea
                  style={{ ...inp, resize:"vertical", minHeight:"140px", borderColor: errors.jobDescription ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }}
                  placeholder="e.g. My kitchen tap has been dripping for a week and the cupboard underneath is damp."
                  value={form.jobDescription}
                  onChange={e => set("jobDescription", e.target.value)}
                />
                <VoiceDictate onAppend={(t) => set("jobDescription", (form.jobDescription.trim() ? form.jobDescription.trim() + " " : "") + t)} />
                <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .55)", marginTop:".4rem" }}>
                  No need to know the trade name — plain English is perfect. We'll work out who to send.
                </p>
                {errors.jobDescription && <p id="co-err-jobDescription" style={s.err}>{errors.jobDescription}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Photo of the Problem <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5*1024*1024) { setSubmitError("Photo must be under 5MB."); e.target.value = ""; return; } setSubmitError(""); setPhotoFile(f); }} style={{ ...inp, padding:".6rem", cursor:"pointer" }} />
                <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .55)", marginTop:".4rem" }}>A photo helps us give you a faster, more accurate estimate. Max 5MB.</p>
                {photoFile && <p style={{ fontSize:".78rem", color:"var(--ff-success)", marginTop:".3rem" }}>Attached: {photoFile.name}</p>}
              </div>
              {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginTop:"1rem" }}>{submitError}</div>}
            </div>
          )}

          {/* ── 2 · Confirm ─────────────────────────────────────────────
              What we read out of the description, shown as chips the client can
              tap off. They always get the last word — nothing here is locked in. */}
          {step === 2 && (
            <div>
              <p style={s.label}>The service we picked</p>
              {selectedServices.length > 0 ? (
                <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginBottom:".75rem" }}>
                  {selectedServices.map(sv => (
                    <button key={sv} type="button" onClick={() => toggleService(sv)}
                      style={{ display:"inline-flex", alignItems:"center", gap:".5rem", padding:".55rem .9rem", borderRadius:"999px", fontFamily:"inherit", fontSize:".88rem", fontWeight:500, cursor:"pointer", background:"rgba(234,107,20,.15)", border:"1px solid #ea6b14", color:"var(--ff-text)" }}>
                      {sv}
                      <span aria-hidden style={{ color:"#ea6b14", fontSize:"1.05rem", lineHeight:1 }}>×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize:".88rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.55, marginBottom:".75rem" }}>
                  We couldn't tell which trade this needs — pick one below and we'll take it from there.
                </p>
              )}
              {selectedServices.length > 0 && (
                <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"1.25rem" }}>
                  Tap one to remove it. Wrong trade? Add the right one below.
                </p>
              )}
              {errors.serviceNeeded && <p id="co-err-serviceNeeded" style={s.err}>{errors.serviceNeeded}</p>}

              {tags.length > 0 && (
                <div style={{ marginBottom:"1.25rem" }}>
                  <p style={s.label}>Details we spotted</p>
                  <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                    {tags.map(t => (
                      <button key={t} type="button" onClick={() => removeTag(t)}
                        style={{ display:"inline-flex", alignItems:"center", gap:".45rem", padding:".4rem .75rem", borderRadius:"999px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .14)", color:"rgba(var(--ff-muted), .85)" }}>
                        {t}
                        <span aria-hidden style={{ fontSize:"1rem", lineHeight:1, opacity:.7 }}>×</span>
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .55)", marginTop:".5rem" }}>
                    These ride along to your pro. Tap any that don't apply.
                  </p>
                </div>
              )}

              {showAllServices || selectedServices.length === 0 ? (
                <div style={{ marginBottom:".5rem" }}>
                  <p style={s.label}>All services <span style={{ color:"rgba(var(--ff-muted), .4)", textTransform:"none", letterSpacing:0 }}>(select all that apply)</span></p>
                  <ServicePicker items={SERVICES} selected={selectedServices} onToggle={toggleService} pricing={pricing} />
                </div>
              ) : (
                <button type="button" onClick={() => setShowAllServices(true)}
                  style={{ width:"100%", padding:".8rem 1rem", borderRadius:"10px", fontFamily:"inherit", fontSize:".88rem", cursor:"pointer", background:"rgba(var(--ff-fg), .04)", border:"1px dashed rgba(var(--ff-fg), .2)", color:"rgba(var(--ff-muted), .8)" }}>
                  + Add or change the service
                </button>
              )}
            </div>
          )}

          {/* ── 3 · Questions ───────────────────────────────────────────
              Tap-only, and every one is skippable. The answers are folded into
              the description a contractor reads, so a skipped question costs
              detail but never blocks the request. */}
          {step === 3 && (
            <div>
              <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", marginBottom:"1.5rem" }}>
                {answeredCount} of {activeQuestions.length} answered · every one is optional
              </p>
              {activeQuestions.map(q => (
                <div key={q.id} style={{ marginBottom:"1.75rem" }}>
                  <p style={{ fontSize:".95rem", fontWeight:500, color:"var(--ff-text)", marginBottom:".7rem", lineHeight:1.45 }}>
                    {q.prompt}
                    {q.multi && <span style={{ fontWeight:400, color:"rgba(var(--ff-muted), .55)", fontSize:".82rem" }}> · pick any that apply</span>}
                  </p>
                  <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                    {q.options.map(opt => {
                      const on = isAnswered(q, opt);
                      return (
                        <button key={opt} type="button" onClick={() => setAnswer(q, opt)}
                          style={{ padding:".6rem 1rem", borderRadius:"10px", fontFamily:"inherit", fontSize:".88rem", fontWeight: on ? 500 : 400, cursor:"pointer",
                            background: on ? "rgba(234,107,20,.15)" : "rgba(var(--ff-fg), .04)",
                            border: on ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .12)",
                            color: on ? "var(--ff-text)" : "rgba(var(--ff-muted), .8)" }}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 4 · Details ─────────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom:"1.5rem" }}>
                <label style={s.label}>I am requesting as</label>
                <div style={{ display:"flex", gap:".6rem", marginTop:".4rem" }}>
                  {([["individual","Just me / household"],["business","A small business"]] as const).map(([val,lbl]) => (
                    <button key={val} type="button" onClick={() => setClientType(val)}
                      style={{ flex:1, padding:".7rem .5rem", borderRadius:"10px", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem", fontWeight:500,
                        background: clientType===val ? "rgba(234,107,20,.15)" : "rgba(var(--ff-fg), .04)",
                        border: clientType===val ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .12)",
                        color: clientType===val ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)" }}>{lbl}</button>
                  ))}
                </div>
              </div>
              {clientType === "business" && (
                <div style={{ marginBottom:"1.75rem", paddingBottom:"1.25rem", borderBottom:"1px solid rgba(var(--ff-fg), .08)" }}>
                  <div style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".12em", color:"#ea6b14", marginBottom:".9rem" }}>Business details</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:"1rem" }}>
                    <div style={{ marginBottom:"1.2rem" }}>
                      <label style={s.label}>Business name</label>
                      <input style={inp} placeholder="Acme Property Mgmt" value={form.businessName} onChange={e => set("businessName", e.target.value)} />
                    </div>
                    <div style={{ marginBottom:"1.2rem" }}>
                      <label style={s.label}>Business type</label>
                      <input style={inp} placeholder="e.g. Property mgmt, Cafe" value={form.businessType} onChange={e => set("businessType", e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginBottom:"1.2rem" }}>
                    <label style={s.label}>Locations / sites <span style={{ opacity:.5, fontWeight:400 }}>(if more than one)</span></label>
                    <textarea style={{ ...inp, resize:"vertical", minHeight:"70px" }} placeholder="List the addresses or number of sites we would be servicing." value={form.locations} onChange={e => set("locations", e.target.value)} />
                  </div>
                  <div style={{ marginBottom:"1.2rem" }}>
                    <label style={s.label}>Billing preference</label>
                    <input style={inp} placeholder="e.g. Net-30 invoicing, PO required" value={form.billingPreference} onChange={e => set("billingPreference", e.target.value)} />
                  </div>
                  <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".88rem", color:"rgba(var(--ff-fg), .85)" }}>
                    <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} style={{ width:"16px", height:"16px", accentColor:"#ea6b14" }} />
                    This is recurring / scheduled maintenance
                  </label>
                </div>
              )}
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Where's the job? <span style={{ color:"rgba(var(--ff-muted), .4)", textTransform:"none", letterSpacing:0 }}>(address or postal code — either one)</span></label>
                <AddressAutocomplete autoComplete="street-address" style={{ ...inp, borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="e.g. 123 Main St NW" value={form.location} onChange={v => set("location", v)} />
                <div style={{ display:"flex", alignItems:"center", gap:".6rem", margin:".55rem 0" }}>
                  <div style={{ flex:1, height:1, background:"rgba(var(--ff-fg), .12)" }} />
                  <span style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .5)" }}>or just a postal code</span>
                  <div style={{ flex:1, height:1, background:"rgba(var(--ff-fg), .12)" }} />
                </div>
                <input autoComplete="postal-code" style={{ ...inp, borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="e.g. T2P 1J9" value={form.postalCode} onChange={e => set("postalCode", e.target.value)} />
                {errors.location && <p id="co-err-location" style={s.err}>{errors.location}</p>}
              </div>

              <p style={{ ...s.label, marginTop:"1.5rem" }}>When Do You Need It?</p>
              {SCHEDULES.map(sc => (
                <button key={sc.label} style={{ ...s.schedBtn, ...(form.preferredSchedule===sc.label ? s.schedBtnSel : {}) }} onClick={() => set("preferredSchedule",sc.label)}>
                  <span style={{ fontSize:"1.5rem" }}><Ic name={sc.iconName as any} size={20} color="#ea6b14" style={{ marginRight:8, flexShrink:0 }} /></span>
                  <div><div style={{ fontSize:".95rem", fontWeight:500 }}>{sc.label}</div><div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)" }}>{sc.sub}</div></div>
                </button>
              ))}
              {errors.preferredSchedule && <p id="co-err-preferredSchedule" style={s.err}>{errors.preferredSchedule}</p>}

              {form.preferredSchedule === "Recurring" && (
                <div style={{ marginTop:"1rem", padding:"1rem", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"10px", display:"flex", flexDirection:"column" as const, gap:"1rem" }}>
                  <div>
                    <p style={{ ...s.label, marginBottom:".6rem" }}>How often?</p>
                    {recurringFrequency !== "seasonal" && recurringFrequency !== "per_km" && (
                      <div style={{ marginBottom:".8rem" }}>
                        <input type="range" min={0} max={SLIDER_STOPS.length - 1} step={1}
                          value={sliderIdx} onChange={e => pickSlider(parseInt(e.target.value, 10))}
                          aria-label="How often"
                          style={{ width:"100%", accentColor:"#ea6b14", cursor:"pointer" }} />
                        <div style={{ display:"flex", justifyContent:"space-between", marginTop:".2rem" }}>
                          {SLIDER_STOPS.map((stop, i) => (
                            <span key={stop} onClick={() => pickSlider(i)}
                              style={{ fontSize:".68rem", cursor:"pointer", textAlign:"center" as const, flex:1,
                                color: i === sliderIdx ? "#ea6b14" : "rgba(var(--ff-muted), .5)",
                                fontWeight: i === sliderIdx ? 600 : 400 }}>
                              {SLIDER_SHORT[stop]}
                            </span>
                          ))}
                        </div>
                        <p style={{ fontSize:".85rem", color:"var(--ff-text)", marginTop:".45rem", fontWeight:500 }}>
                          {freqLabel(SLIDER_STOPS[sliderIdx])}
                        </p>
                      </div>
                    )}
                    <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                      <button type="button" onClick={() => setRecurringFrequency("seasonal")}
                        style={{ padding:".55rem 1.05rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid",
                          background: recurringFrequency==="seasonal" ? "rgba(234,107,20,.2)" : "rgba(var(--ff-fg), .04)",
                          borderColor: recurringFrequency==="seasonal" ? "#ea6b14" : "rgba(var(--ff-fg), .12)",
                          color: recurringFrequency==="seasonal" ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)" }}>
                        Seasonal
                      </button>
                      {selectedServices.some(isPerKmService) && (
                        <button type="button" onClick={() => setRecurringFrequency("per_km")}
                          style={{ padding:".55rem 1.05rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid",
                            background: recurringFrequency==="per_km" ? "rgba(234,107,20,.2)" : "rgba(var(--ff-fg), .04)",
                            borderColor: recurringFrequency==="per_km" ? "#ea6b14" : "rgba(var(--ff-fg), .12)",
                            color: recurringFrequency==="per_km" ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)" }}>
                          Per distance (km)
                        </button>
                      )}
                      {(recurringFrequency==="seasonal" || recurringFrequency==="per_km") && (
                        <button type="button" onClick={() => pickSlider(sliderIdx)}
                          style={{ padding:".55rem 1.05rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid rgba(var(--ff-fg), .12)", background:"rgba(var(--ff-fg), .04)", color:"rgba(var(--ff-muted), .7)" }}>
                          Use slider instead
                        </button>
                      )}
                    </div>
                  </div>
                  {recurringFrequency === "per_km" && (
                    <div>
                      <label style={{ ...s.label, marginBottom:".35rem" }}>Service every… (km)</label>
                      <input type="number" min={1000} step={500} inputMode="numeric" placeholder="e.g. 5000"
                        value={recurringKm} onChange={e => setRecurringKm(e.target.value)}
                        style={{ ...inp, padding:".6rem .8rem", fontSize:".88rem", maxWidth:"180px" }} />
                      <p style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .55)", marginTop:".4rem" }}>
                        We can't read your odometer, so we'll send an estimated reminder based on typical driving.
                      </p>
                    </div>
                  )}
                  <div>
                    <p style={{ ...s.label, marginBottom:".6rem" }}>Pay ahead? <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></p>
                    <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                      {[0,2,3].map(n => (
                        <button key={n} type="button"
                          onClick={() => setPrepayPref(n)}
                          style={{ padding:".6rem 1.1rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid",
                            background: prepayPref===n ? "rgba(234,107,20,.2)" : "rgba(var(--ff-fg), .04)",
                            borderColor: prepayPref===n ? "#ea6b14" : "rgba(var(--ff-fg), .12)",
                            color: prepayPref===n ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)" }}>
                          {n === 0 ? "Pay each visit" : `Prepay ${n} visits`}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .55)", marginTop:".4rem" }}>
                      Prepaid visits are held securely and released to your pro one visit at a time. You can set this up after your first estimate is approved — unused visits are refundable.
                    </p>
                  </div>
                  {recurringFrequency === "seasonal" && (
                    <div>
                      <p style={{ ...s.label, marginBottom:".6rem" }}>Quick season presets</p>
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                        {SEASON_PRESETS.map(sp => (
                          <button key={sp.label} type="button" onClick={() => applySeason(sp)}
                            style={{ padding:".5rem .9rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer", border:"1px solid rgba(var(--ff-fg), .15)", background:"rgba(var(--ff-fg), .05)", color:"rgba(var(--ff-muted), .8)" }}>
                            {sp.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const }}>
                    <div style={{ flex:"1 1 140px", minWidth:0 }}>
                      <label style={{ ...s.label, marginBottom:".35rem" }}>Start date <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                      <input type="date" value={recurringStartDate} onChange={e => setRecurringStartDate(e.target.value)}
                        style={{ ...inp, padding:".6rem .8rem", fontSize:".88rem", minWidth:0 }} />
                    </div>
                    <div style={{ flex:"1 1 140px", minWidth:0 }}>
                      <label style={{ ...s.label, marginBottom:".35rem" }}>End date <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                      <input type="date" value={recurringEndDate} onChange={e => setRecurringEndDate(e.target.value)}
                        style={{ ...inp, padding:".6rem .8rem", fontSize:".88rem", minWidth:0 }} />
                    </div>
                  </div>
                  <div>
                    <p style={{ ...s.label, marginBottom:".4rem" }}>Add specific visit dates <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></p>
                    <p style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .55)", marginBottom:".5rem" }}>
                      Pick exact dates you also want a visit — each becomes a scheduled booking on top of your regular cadence.
                    </p>
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                      <input type="date" min={todayStr} value={newDate} onChange={e => setNewDate(e.target.value)}
                        style={{ ...inp, padding:".6rem .8rem", fontSize:".88rem", maxWidth:"180px", minWidth:0 }} />
                      <button type="button" onClick={addDate} disabled={!newDate}
                        style={{ padding:".55rem 1rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor: newDate ? "pointer" : "default", border:"1px solid #ea6b14", background:"rgba(234,107,20,.15)", color:"var(--ff-text)", opacity: newDate ? 1 : .5 }}>
                        + Add date
                      </button>
                    </div>
                    {recurringDates.length > 0 && (
                      <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginTop:".6rem" }}>
                        {recurringDates.map(d => (
                          <span key={d} style={{ display:"inline-flex", alignItems:"center", gap:".4rem", padding:".35rem .6rem", borderRadius:"999px", fontSize:".8rem", background:"rgba(234,107,20,.12)", border:"1px solid rgba(234,107,20,.3)", color:"var(--ff-text)" }}>
                            {new Date(d + "T00:00:00").toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" })}
                            <button type="button" onClick={() => removeDate(d)} aria-label="Remove date"
                              style={{ border:"none", background:"none", color:"#ea6b14", cursor:"pointer", fontSize:"1rem", lineHeight:1, padding:0 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Budget — anchored to the category average so the number is informed. */}
              <BudgetPicker
                services={selectedServices}
                pricing={pricing}
                min={budgetMin}
                max={budgetMax}
                flexible={budgetFlexible}
                onMin={v => { setBudgetMin(v); setErrors(e => ({ ...e, budget: "" })); }}
                onMax={v => { setBudgetMax(v); setErrors(e => ({ ...e, budget: "" })); }}
                onFlexible={v => { setBudgetFlexible(v); setErrors(e => ({ ...e, budget: "" })); }}
                error={errors.budget}
                errorId="co-err-budget"
              />
            </div>
          )}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"1px solid rgba(var(--ff-fg), .1)" }} onClick={back}>{step===1 ? "← Home" : "← Back"}</button>
          {step < TOTAL
            ? <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={next}>Next →</button>
            : <button style={{ ...s.navBtn, background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", opacity: loading ? .6 : 1 }} onClick={handleSubmit} disabled={loading}>
                {loading ? <><span className="ff-btn-spin" aria-hidden="true" />Submitting…</> : "Submit Request →"}
              </button>
          }
        </div>
        <p style={{ textAlign:"center", marginTop:"1.25rem", fontSize:".82rem", color:"rgba(var(--ff-muted), .4)" }}>
          Already have an account? <button onClick={() => setLocation("/login")} style={{ background:"none", border:"none", cursor:"pointer", color:"#ea6b14", fontFamily:"inherit", fontSize:".82rem", padding:0 }}>Sign in</button>
        </p>
      </div>
    </div>
  );
}
