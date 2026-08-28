import { Ic } from "@/components/Ic";
import { Sk, SkText, SkCard, StalledNotice } from "@/components/Skeleton";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import VoiceDictate from "@/components/VoiceDictate";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";
import { requestGoogleReview } from "@/lib/reviewPrompt";
import OnboardingProgress from "@/components/OnboardingProgress";
import { SERVICES, SCHEDULES } from "@/pages/ClientOnboarding";
import { useServicePricing, fromText, floorFor } from "@/lib/servicePricing";
import ServicePicker from "@/components/ServicePicker";
import BudgetPicker from "@/components/BudgetPicker";
import { isPerKmService, freqLabel, SLIDER_STOPS, SLIDER_SHORT } from "@/lib/recurrence";
import WaitlistForm from "@/components/WaitlistForm";
import { usePlatformStatus, acceptingRequests } from "@/lib/platformStatus";
import { detectFromText } from "@/lib/serviceTags";
import { questionsFor, answerSummary, type JobAnswers } from "@/lib/jobQuestions";
import { trackEvent } from "@/lib/analytics";
import { useStoredDraft, useDraftAutosave, clearDraft, NEWREQUEST_DRAFT_KEY, dStr, dArr, dNum, dBool } from "@/lib/requestDraft";

const TOTAL = 4;
// One short, plain-language line per step — matches ClientOnboarding's
// STEP_TITLES pattern. Replaces the old STEP_SUBS pair and the Freddy
// speech-bubble reframe (see OnboardingProgress for the numbered bar that
// carries the step count).
const STEP_TITLES = ["What Needs Fixing?", "Did We Get That Right?", "A Few Quick Questions", "Where & When"];
// Stable machine names for the drop-off funnel in PostHog (do not rename —
// insights key off these). The flow value is deliberately DIFFERENT from the
// signup flow's "client", so the two funnels can never be mixed together.
const STEP_NAMES  = ["describe", "confirm", "questions", "details"];

// Shown when an already-signed-in client starts another request. Unlike the
// first-time onboarding flow, this never creates an account — it reuses the
// session + saved details and only asks what's actually new. It mirrors the
// signup flow's describe-first shape (describe → confirm → questions →
// details), minus the account step, so a returning client gets the same
// plain-English start as a first-timer.
export default function NewRequest() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [lastReq, setLastReq] = useState<any>(null);

  // Is the marketplace taking new job requests right now? Read unconditionally
  // (hooks rule) — the gate itself lives further down, past the early returns.
  const { status: platform, ready: platformReady } = usePlatformStatus();

  /**
   * A half-finished request, remembered for the length of the browsing session.
   *
   * Its own key (`ff_req_draft_return`), separate from the signup form's — the two
   * hold different shapes and must never cross-restore. Read ONCE here, above
   * every piece of state that seeds from it, because the autosave effect below
   * runs on mount too and a later read would see the freshly-written empty form.
   */
  const { draft, restored, startOver } = useStoredDraft(NEWREQUEST_DRAFT_KEY);
  // Captured once, because the profile/address read below resolves AFTER mount and
  // would otherwise overwrite a restored choice with its own default. Empty string
  // means "the draft had nothing to say", which is the same as no draft at all.
  const draftAddrChoice = dStr(draft, "addrChoice");
  const draftVehChoice  = dStr(draft, "vehChoice");

  const [selectedServices, setSelectedServices] = useState<string[]>(() => dArr(draft, "selectedServices").filter(l => SERVICES.some(sv => sv.label === l)));
  const pricing = useServicePricing();
  const [schedule, setSchedule] = useState(() => dStr(draft, "schedule"));
  const [sameAddress, setSameAddress] = useState(true);
  const [newLocation, setNewLocation] = useState(() => dStr(draft, "newLocation"));

  // Saved addresses & vehicles (reused across requests).
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [savedVehicles, setSavedVehicles] = useState<any[]>([]);
  const [addrChoice, setAddrChoice] = useState<string>(() => dStr(draft, "addrChoice", "last")); // saved id | "last" | "new"
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [vehChoice, setVehChoice] = useState<string>(() => dStr(draft, "vehChoice", "new"));    // saved id | "new"
  const [vehYear, setVehYear] = useState(() => dStr(draft, "vehYear"));
  const [vehMake, setVehMake] = useState(() => dStr(draft, "vehMake"));
  const [vehModel, setVehModel] = useState(() => dStr(draft, "vehModel"));
  const [saveNewVehicle, setSaveNewVehicle] = useState(true);
  const [description, setDescription] = useState(() => dStr(draft, "description"));
  // Describe-first scaffolding: which screen we're on, what the description
  // read as, and the answers to the follow-up questions.
  const [step, setStep] = useState(() => dNum(draft, "step", 1, 1, TOTAL));
  const [tags, setTags] = useState<string[]>(() => dArr(draft, "tags"));
  const [answers, setAnswers] = useState<JobAnswers>(() => {
    // Free-form id->string map, so there's no fixed key list to validate against.
    // Keep only the string values and drop anything else.
    const raw = draft?.answers;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: JobAnswers = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
    return out;
  });
  const [detectedFor, setDetectedFor] = useState(() => dStr(draft, "detectedFor"));
  const [showAllServices, setShowAllServices] = useState(() => dBool(draft, "showAllServices"));
  const [budgetMax, setBudgetMax]           = useState(() => dStr(draft, "budgetMax"));
  const [budgetFlexible, setBudgetFlexible] = useState(() => dBool(draft, "budgetFlexible"));
  /**
   * The platform's starting price for whatever is currently selected. Derived,
   * never typed — the client picks a maximum only (see BudgetPicker).
   *
   * Computed HERE rather than inside BudgetPicker so the number the client is
   * shown and the number written into `client_requests.budget_min` are the same
   * value, not two evaluations that could drift apart. Null while `pricing` is
   * still loading or when nothing selected is in the price book, in which case
   * the floor is hidden and budget_min is left NULL rather than guessed.
   */
  const budgetFloor = floorFor(selectedServices.join(", "), pricing);
  const [recurring, setRecurring] = useState(() => dBool(draft, "recurring"));
  const [recurringFrequency, setRecurringFrequency] = useState<string>(() => dStr(draft, "recurringFrequency"));
  const [sliderIdx, setSliderIdx]                   = useState(() => dNum(draft, "sliderIdx", 3, 0, SLIDER_STOPS.length - 1));
  const [recurringDates, setRecurringDates]         = useState<string[]>(() => dArr(draft, "recurringDates"));
  const [newDate, setNewDate]                       = useState("");
  const [recurringKm, setRecurringKm]               = useState(() => dStr(draft, "recurringKm"));
  // Only 0 / 2 / 3 are offerable; clamping a range would let a stale value restore
  // as one with no chip selected, which reads as "nothing chosen" while still
  // being submitted. Anything off the list falls back to 0.
  const [prepayPref, setPrepayPref]                 = useState(() => { const n = dNum(draft, "prepayPref", 0, 0, 3); return n === 2 || n === 3 ? n : 0; });
  const [recurringStartDate, setRecurringStartDate] = useState(() => dStr(draft, "recurringStartDate"));
  const [recurringEndDate, setRecurringEndDate]     = useState(() => dStr(draft, "recurringEndDate"));

  const SEASON_PRESETS = [
    { label: "Spring", start: "-04-01", end: "-06-30" },
    { label: "Summer", start: "-07-01", end: "-09-30" },
    { label: "Fall",   start: "-10-01", end: "-11-30" },
    { label: "Winter", start: "-12-01", end: "-03-31" },
  ];
  const applySeason = (sp: typeof SEASON_PRESETS[0]) => {
    const yr = new Date().getFullYear();
    const startYr = sp.label === "Winter" && new Date().getMonth() >= 11 ? yr + 1 : yr;
    const endYr   = sp.label === "Winter" ? startYr + 1 : startYr;
    setRecurringStartDate(startYr + sp.start);
    setRecurringEndDate(endYr + sp.end);
  };

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
  useEffect(() => {
    if (schedule === "Recurring" && !recurringFrequency) setRecurringFrequency(SLIDER_STOPS[sliderIdx]);
  }, [schedule]); // eslint-disable-line react-hooks/exhaustive-deps
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [loadError, setLoadError] = useState(false);
  const [loadTick, setLoadTick] = useState(0);
  useEffect(() => {
    (async () => {
      try {
      setLoadError(false);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }
      // A PostgREST error resolves rather than throwing, so destructuring only
      // `data` let one failed read (say saved_addresses) look like "you have no
      // saved addresses" — the client re-types an address they already gave us,
      // and `loadError` never fires. Check each result explicitly.
      const [pRes, rRes, aRes, vRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("client_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("saved_addresses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("saved_vehicles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      const firstErr = [pRes, rRes, aRes, vRes].find(r => (r as any).error);
      if (firstErr) throw (firstErr as any).error;
      const prof = pRes.data, reqs = rRes.data, addrs = aRes.data, vehs = vRes.data;
      setProfile(prof);
      const last = (reqs ?? [])[0] ?? null;
      setLastReq(last);
      setSavedAddresses(addrs ?? []);
      setSavedVehicles(vehs ?? []);
      // Default address choice: last-used if we have one, else first saved, else fresh entry.
      // DEFAULT, not override — a restored draft already carries a choice the client
      // made, and this read resolves after mount, so without the guard it would land
      // a second later and silently move them off the address they picked (hiding a
      // new one they had already typed).
      if (draftAddrChoice) { setSameAddress(draftAddrChoice !== "new"); }
      else if (last?.location) { setAddrChoice("last"); setSameAddress(true); }
      else if ((addrs ?? []).length) { setAddrChoice((addrs as any[])[0].id); setSameAddress(true); }
      else { setAddrChoice("new"); setSameAddress(false); }
      if ((vehs ?? []).length && !draftVehChoice) setVehChoice((vehs as any[])[0].id);
      if (last?.client_type === "business") setRecurring(!!last.recurring);
      } catch (e) {
        console.error("NewRequest load failed", e);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTick]);

  // Rehire: a "Book again" link carries ?pro=<contractorId> so this request is
  // sent directly to that pro (they get an in-app "a past client wants you" ping).
  const [preferredPro, setPreferredPro] = useState<string | null>(null);
  useEffect(() => {
    const pro = new URLSearchParams(window.location.search).get("pro");
    if (pro) setPreferredPro(pro);
  }, []);

  // Pre-select a service if the home page linked here with ?service=…
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("service");
    if (!raw) return;
    const map: Record<string,string> = { "General Repairs":"General Handyman", "Plumbing":"Plumbing Repair", "Electrical":"Electrical Work", "HVAC":"HVAC Maintenance", "Drywall & Flooring":"Drywall / Flooring" };
    const mapped = map[raw] ?? raw;
    // ADD, never replace — see the same guard in ClientOnboarding. Now that a draft
    // can be restored, someone who picked three services and then tapped a service
    // tile would otherwise come back to find the other two silently deleted.
    if (SERVICES.some(sv => sv.label === mapped)) {
      setSelectedServices(prev => prev.includes(mapped) ? prev : [...prev, mapped]);
    }
  }, []);

  const prevAddress = lastReq?.location ?? "";
  const isBusiness = lastReq?.client_type === "business";

  const VEHICLE_SERVICES = ["Oil Change","Tire Swap / Rotation","Battery / Brakes","Vehicle Maintenance"];
  const isVehicle = selectedServices.some(sv => VEHICLE_SERVICES.includes(sv));

  // Resolve the address string from the current choice.
  const resolveLocation = () => {
    if (addrChoice === "new") return newLocation.trim();
    if (addrChoice === "last") return prevAddress;
    const found = savedAddresses.find(a => a.id === addrChoice);
    return found?.address ?? "";
  };

  const toggleService = (label: string) => {
    setSelectedServices(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
    setErrors(e => ({ ...e, services: "" }));
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  // The questions shown are driven by the FIRST selected service, so if that
  // changes the recorded answers belong to a different question set and must go.
  // Keeping them would attach (say) a plumbing answer to an electrical job.
  const primaryService = selectedServices[0] || "";
  // The FIRST run is skipped, and that skip is what makes draft restore work at
  // all: this effect fires on mount like any other, so without the ref it would
  // wipe the answers we just restored before the client ever saw them.
  const answersFor = useRef(primaryService);
  useEffect(() => {
    if (answersFor.current === primaryService) return;
    answersFor.current = primaryService;
    setAnswers({});
  }, [primaryService]);
  const activeQuestions = questionsFor(primaryService);

  /**
   * Autosave, debounced.
   *
   * The snapshot is FLAT because `draftWorthOffering` looks for `description` and
   * `selectedServices` at the top level, and flat is what the `dStr`/`dArr`/`dNum`
   * accessors above read back.
   *
   * Left out on purpose: `photoFile` (a `File` doesn't survive JSON — a stringified
   * one restores as `{}` and the UI would claim a photo is attached with no bytes
   * to upload), `errors` / `submitError` / `submitting` (they describe a moment,
   * not an intention), and `agreedToTerms` (consent should be an act of this
   * visit, not one inherited from the last one).
   *
   * `enabled` goes false while the insert is in flight so a pending timer can't
   * outlive a request that now exists; a FAILED submit turns it back on, because
   * at that point the client still has a draft and nothing was created.
   */
  useDraftAutosave(NEWREQUEST_DRAFT_KEY, {
    step, tags, answers, detectedFor, showAllServices,
    selectedServices, description, schedule,
    addrChoice, newLocation, vehChoice, vehYear, vehMake, vehModel,
    recurring, recurringFrequency, sliderIdx, recurringDates,
    recurringKm, prepayPref, recurringStartDate, recurringEndDate,
    budgetMax, budgetFlexible,
  }, !submitting);

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
    const text = description.trim();
    if (!text || text === detectedFor) return;
    const d = detectFromText(text);
    setDetectedFor(text);
    setTags(d.tags);
    if (d.services.length) setSelectedServices(prev => prev.length ? prev : d.services);
  };

  // What the contractor actually reads. The answers and tags are folded into the
  // description text itself so pros see them today without a schema change.
  const composedDescription = () => {
    const parts = [description.trim()];
    const sum = answerSummary(primaryService, answers);
    if (sum) parts.push(sum);
    if (tags.length) parts.push("Details: " + tags.join(", "));
    return parts.join("\n\n");
  };

  // Drop-off funnel. Distinct flow value so it can never be confused with the
  // signup funnel (see STEP_NAMES).
  useEffect(() => {
    if (loading) return;
    trackEvent("onboarding_step_view", { flow: "returning_client", step, step_name: STEP_NAMES[step - 1] });
  }, [step, loading]);

  const validate = () => {
    const e: Record<string, string> = {};
    // 1 describe · 2 confirm · 3 questions (nothing required — every one is
    // skippable) · 4 details.
    if (step === 1) {
      if (description.trim().length < 10) e.description = "Please add a few more details (min 10 characters)";
    }
    if (step === 2) {
      if (selectedServices.length === 0) e.services = "Please select at least one service";
    }
    if (step === 4) {
      if (!schedule) e.schedule = "Please choose a timeframe";
      const loc = resolveLocation();
      if (!loc) e.location = addrChoice === "new" ? "Address required" : "No address on file — please enter one";
      // Budget is optional, but if given it has to make sense. The minimum is
      // ours and can't be typed wrong, so only the max is validated — and a max
      // under our floor is a soft warning inside BudgetPicker, not a hard block:
      // someone genuinely willing to pay less should still be allowed to ask.
      if (!budgetFlexible) {
        const bHi = budgetMax.trim() === "" ? null : Number(budgetMax);
        if (bHi != null && (!isFinite(bHi) || bHi < 0)) e.budget = "Budget must be a positive number";
      }
    }
    setErrors(e);
    // Scroll the first problem into view — on a long form the submit button is
    // at the bottom and an error near the top is otherwise invisible.
    const first = ["description", "services", "budget", "schedule", "location"].find(k => e[k]);
    if (first) {
      setTimeout(() => {
        document.getElementById("nr-err-" + first)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    }
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    // Read the description on the way out of screen 1 so screen 2 has something
    // to confirm.
    if (step === 1) runDetect();
    setStep(s => s + 1);
    window.scrollTo(0, 0);
  };
  const back = () => {
    if (step === 1) setLocation("/client-dashboard");
    else { setStep(s => s - 1); window.scrollTo(0, 0); }
  };

  const submit = async () => {
    if (!validate()) return;
    if (!agreedToTerms) { setSubmitError("Please agree to the User Agreement and Privacy Policy to continue."); return; }
    setSubmitting(true); setSubmitError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }

      let photoPath: string | null = null;
      if (photoFile) {
        const small = await compressImage(photoFile, "photo");
        const ext = (small.name.split(".").pop() || "jpg").toLowerCase();
        const path = user.id + "/" + crypto.randomUUID() + "." + ext;
        const up = await supabase.storage.from("problem-photos").upload(path, small, { upsert: false, contentType: small.type || undefined });
        if (!up.error) photoPath = path;
      }

      const location = resolveLocation();

      // Persist a newly-typed address to the user's saved list (best effort).
      if (addrChoice === "new" && saveNewAddress && location) {
        const dup = savedAddresses.some(a => (a.address ?? "").trim().toLowerCase() === location.toLowerCase());
        if (!dup) await supabase.from("saved_addresses").insert({ user_id: user.id, address: location });
      }

      // Resolve the vehicle (saved pick or newly typed) for vehicle jobs.
      let vehicleDetails: any = null;
      if (isVehicle) {
        if (vehChoice !== "new") {
          const v = savedVehicles.find(x => x.id === vehChoice);
          if (v) vehicleDetails = { year: v.year ?? "", make: v.make ?? "", model: v.model ?? "", notes: v.notes ?? "" };
        } else if (vehYear.trim() || vehMake.trim() || vehModel.trim()) {
          vehicleDetails = { year: vehYear.trim(), make: vehMake.trim(), model: vehModel.trim() };
          if (saveNewVehicle) {
            await supabase.from("saved_vehicles").insert({ user_id: user.id, year: vehYear.trim() || null, make: vehMake.trim() || null, model: vehModel.trim() || null });
          }
        }
      }

      const { error } = await supabase.from("client_requests").insert({
        user_id: user.id,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        email: profile?.email ?? user.email ?? null,
        phone: profile?.phone ?? null,
        service_needed: selectedServices.join(", "),
        preferred_contractor_id: preferredPro,
        preferred_schedule: schedule,
        location,
        job_description: composedDescription(),
        photo_path: photoPath,
        status: "pending",
        budget_flexible: budgetFlexible,
        // budget_min is OURS now (see BudgetPicker) — the platform starting
        // price for the chosen services, stored even when the client says
        // they're flexible, because it describes the work rather than their
        // preference and it is the anchor the contractor actually wants.
        budget_min: budgetFloor,
        budget_max: budgetFlexible || budgetMax.trim() === "" ? null : Number(budgetMax),
        client_type: lastReq?.client_type ?? "individual",
        business_name: isBusiness ? (lastReq?.business_name ?? null) : null,
        business_type: isBusiness ? (lastReq?.business_type ?? null) : null,
        locations: isBusiness ? (lastReq?.locations ?? null) : null,
        recurring: recurring || schedule === "Recurring",
        recurring_frequency: recurringFrequency || null,
        recurring_interval_km: recurringFrequency === "per_km" && recurringKm ? (parseInt(recurringKm, 10) || null) : null,
        recurring_prepay_pref: prepayPref || 0,
        recurring_start_date: recurringStartDate || null,
        recurring_end_date: recurringEndDate || null,
        recurring_dates: recurringDates.length ? recurringDates : null,
        billing_preference: isBusiness ? (lastReq?.billing_preference ?? null) : null,
        vehicle_details: vehicleDetails,
      });
      if (error) throw error;
      requestGoogleReview("job_posted");
      // The request row exists now, so the draft is no longer a half-finished
      // request — it's a duplicate waiting to happen. Cleared before navigating,
      // while `submitting` still has autosave switched off.
      clearDraft(NEWREQUEST_DRAFT_KEY);
      setLocation("/client-dashboard");
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".95rem", outline:"none", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"var(--ff-bg)", padding:"3rem 1rem 4rem", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    inner: { maxWidth:"580px", margin:"0 auto" },
    card: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"2rem" },
    label: { display:"block", fontSize:".78rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .6)", marginBottom:".6rem" },
    err: { fontSize:".78rem", color:"var(--ff-danger)", marginTop:".35rem" },
    svcBtn: { display:"flex", alignItems:"center", gap:".65rem", padding:".9rem 1rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", fontSize:".88rem", cursor:"pointer", textAlign:"left" as const, width:"100%" },
    svcBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
    schedBtn: { display:"flex", alignItems:"center", gap:"1rem", padding:"1rem 1.2rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".75rem" },
    schedBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
    addrBtn: { display:"flex", alignItems:"center", gap:".6rem", padding:".85rem 1rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .85)", fontFamily:"inherit", fontSize:".9rem", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".6rem" },
    addrBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
    navBtn: { flex:1, padding:".85rem 1.5rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:".4rem" },
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"var(--ff-bg)", fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ height:"3.75rem" }} />
      <div style={{ maxWidth:"680px", margin:"0 auto", padding:"clamp(1rem, 4vw, 2rem)" }} aria-busy="true">
        <span className="ff-sr-only">Loading your details</span>
        <Sk w="58%" h={26} />
        <div style={{ height: 18 }} />
        <SkText lines={2} />
        <div style={{ height: 26 }} />
        <div style={{ display:"grid", gap:"1rem" }}><SkCard /><SkCard /></div>
        <StalledNotice />
      </div>
    </div>
  );
  if (loadError) return (
    <div style={{ minHeight:"100vh", background:"var(--ff-bg)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"1rem", fontFamily:"'DM Sans', sans-serif", padding:"2rem", textAlign:"center" }}>
      <p style={{ margin:0, color:"var(--ff-text)", fontSize:"1rem" }}>We couldn&rsquo;t load your details. Check your connection and try again.</p>
      <button onClick={() => { setLoading(true); setLoadTick(t => t + 1); }} style={{ padding:".7rem 1.6rem", borderRadius:"8px", border:"none", background:"#ea6b14", color:"#fff", fontFamily:"inherit", fontSize:".9rem", fontWeight:600, cursor:"pointer" }}>Try again</button>
    </div>
  );

  // Waitlist / paused mode — a returning client is the person most likely to be
  // let down by silence, so capture them by name and tell them plainly. The DB
  // trigger `enforce_platform_pause` is the real gate; this is the humane
  // version of it. Their profile already has the contact details, so the form is
  // prefilled and they only confirm.
  if (platformReady && !acceptingRequests(platform.mode)) return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <button onClick={() => setLocation("/client-dashboard")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"1.5rem", display:"block" }}>
          ← Dashboard
        </button>
        <WaitlistForm
          initialService={selectedServices[0] || ""}
          initialDescription={description}
          initialEmail={profile?.email || ""}
          initialName={profile?.first_name || ""}
          source="new_request"
        />
        <p style={{ textAlign:"center", fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.6, margin:"1.5rem auto 0", maxWidth:"460px" }}>
          Any job already in progress carries on as normal — you&rsquo;ll find it on your{" "}
          <a href="/client-dashboard" style={{ color:"#ea6b14", textDecoration:"none", fontWeight:600 }}>dashboard</a>.
        </p>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <button onClick={back} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"2rem", display:"block" }}>
          {step === 1 ? "← Dashboard" : "← Back"}
        </button>
        <OnboardingProgress step={step} total={TOTAL} />
        {/* The form has already filled itself in by the time this renders — it says
            so rather than asking. Same banner shape as the signup flow on purpose. */}
        {restored && (
          <div style={{ display:"flex", alignItems:"center", gap:".75rem", flexWrap:"wrap" as const, padding:".8rem 1rem", marginBottom:"1.25rem", borderRadius:"10px", background:"rgba(34,197,94,.1)", border:"1px solid rgba(34,197,94,.3)" }}>
            <Ic name="check" size={16} color="#22c55e" style={{ flexShrink:0 }} />
            <span style={{ fontSize:".88rem", color:"var(--ff-text)", flex:"1 1 auto", minWidth:0 }}>We saved your progress.</span>
            {/* Clear the stored copy, THEN reload — resetting two dozen pieces of
                state by hand would be a second copy of the initial values that has
                to be kept in step with the first one forever. */}
            <button type="button" onClick={() => { startOver(); window.location.reload(); }} style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontFamily:"inherit", fontSize:".82rem", color:"rgba(var(--ff-muted), .75)", textDecoration:"underline", flexShrink:0 }}>
              Start over
            </button>
          </div>
        )}
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:"2rem" }}>{STEP_TITLES[step-1]}</h1>

        {preferredPro && (
          <div style={{ ...s.card, marginBottom:"1rem", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.07)", display:"flex", alignItems:"center", gap:".6rem" }}>
            <Ic name="star" size={16} color="#ea6b14" />
            <div style={{ fontSize:".86rem", color:"var(--ff-text)" }}>You're rebooking a pro you've worked with — they'll be notified directly to send you an estimate.</div>
          </div>
        )}

        <div style={s.card}>
          {/* ---------- 1 · Describe it in your own words ---------- */}
          {step === 1 && (<>
            {/* Contact summary (read-only) */}
            <div style={{ marginBottom:"1.75rem", paddingBottom:"1.25rem", borderBottom:"1px solid rgba(var(--ff-fg), .08)" }}>
              <div style={s.label}>Submitting as</div>
              <div style={{ fontSize:".95rem", fontWeight:500 }}>
                {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Your account"}
                {isBusiness && lastReq?.business_name ? <span style={{ color:"rgba(var(--ff-muted), .6)", fontWeight:400 }}> · {lastReq.business_name}</span> : null}
              </div>
              <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginTop:".2rem" }}>
                {[profile?.email, profile?.phone].filter(Boolean).join(" · ")}
              </div>
              <p style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)", marginTop:".5rem" }}>Need to change your name or phone? Update it in your profile.</p>
            </div>

            {/* The description drives everything downstream — the service we pick,
                the questions we ask, and what the pro reads. So it comes first and
                nothing is asked before it. */}
            <div style={{ marginBottom:"1.2rem" }}>
              <label style={s.label}>What&rsquo;s going on?</label>
              <textarea
                style={{ ...inp, resize:"vertical", minHeight:"140px", lineHeight:1.6, borderColor: errors.description ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }}
                placeholder="e.g. The kitchen tap drips constantly and the cupboard underneath is damp — it's been getting worse for a couple of weeks."
                value={description}
                onChange={e => { setDescription(e.target.value); setErrors(er => ({ ...er, description:"" })); }} />
              <VoiceDictate onAppend={(t) => { setDescription(d => (d.trim() ? d.trim() + " " : "") + t); setErrors(er => ({ ...er, description:"" })); }} />
              {errors.description && <p id="nr-err-description" style={s.err}>{errors.description}</p>}
            </div>

            {/* Photo */}
            <div style={{ marginBottom:"1.2rem" }}>
              <label style={s.label}>Photo of the problem <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
              <p style={{ margin:"0 0 .5rem", fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.45 }}>A clear photo helps contractors give you a faster, more accurate estimate — and means fewer surprises on the day.</p>
              <label htmlFor="nr-photo-upload" style={{ display:"flex", alignItems:"center", gap:".75rem", border:"2px dashed " + (photoFile ? "rgba(234,107,20,.5)" : "rgba(var(--ff-fg), .12)"), borderRadius:"10px", padding:"1rem 1.25rem", cursor:"pointer", background: photoFile ? "rgba(234,107,20,.05)" : "transparent", transition:"border-color .2s,background .2s" }}>
                <Ic name="camera" size={22} color="#ea6b14" style={{ flexShrink:0 }} />
                <div>
                  <p style={{ margin:0, fontSize:".85rem", color: photoFile ? "#ea6b14" : "rgba(var(--ff-muted), .7)", fontWeight:500 }}>
                    {photoFile ? photoFile.name : "Attach a photo"}
                  </p>
                  <p style={{ margin:".2rem 0 0", fontSize:".74rem", color:"rgba(var(--ff-muted), .4)" }}>
                    {photoFile ? "Tap to change" : "Tap to choose — max 5 MB"}
                  </p>
                </div>
                <input id="nr-photo-upload" type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5*1024*1024) { setSubmitError("Photo must be under 5MB. Please choose a smaller one."); e.target.value = ""; return; } setSubmitError(""); setPhotoFile(f); }} style={{ display:"none" }} />
              </label>
            </div>
          </>)}

          {/* ---------- 2 · Confirm what we read ---------- */}
          {step === 2 && (<>
            <p style={s.label}>The service we picked</p>
            {selectedServices.length > 0 ? (
              <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginBottom:".6rem" }}>
                {selectedServices.map(sv => (
                  <button key={sv} type="button" onClick={() => toggleService(sv)}
                    style={{ display:"inline-flex", alignItems:"center", gap:".5rem", padding:".6rem 1rem", borderRadius:"999px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", background:"rgba(234,107,20,.15)", border:"1px solid #ea6b14", color:"var(--ff-text)" }}>
                    {sv}
                    <span style={{ color:"#ea6b14", fontSize:"1.05rem", lineHeight:1 }}>×</span>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ fontSize:".88rem", color:"rgba(var(--ff-muted), .7)", marginBottom:".8rem", lineHeight:1.5 }}>
                We couldn&rsquo;t tell which trade this needs — pick one below and we&rsquo;ll take it from there.
              </p>
            )}
            {selectedServices.length > 0 && (
              <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginBottom:"1.25rem" }}>
                Tap one to remove it. Wrong trade? Add the right one below.
              </p>
            )}
            {errors.services && <p id="nr-err-services" style={s.err}>{errors.services}</p>}

            {tags.length > 0 && (
              <div style={{ marginBottom:"1.5rem" }}>
                <p style={s.label}>Details we spotted</p>
                <div style={{ display:"flex", gap:".45rem", flexWrap:"wrap" as const }}>
                  {tags.map(t => (
                    <button key={t} type="button" onClick={() => removeTag(t)}
                      style={{ display:"inline-flex", alignItems:"center", gap:".4rem", padding:".4rem .75rem", borderRadius:"999px", fontFamily:"inherit", fontSize:".8rem", cursor:"pointer", background:"rgba(var(--ff-fg), .05)", border:"1px solid rgba(var(--ff-fg), .14)", color:"rgba(var(--ff-muted), .85)" }}>
                      {t}
                      <span style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".95rem", lineHeight:1 }}>×</span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .45)", marginTop:".5rem" }}>
                  These go to the pro with your description. Remove anything that isn&rsquo;t right.
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
          </>)}

          {/* ---------- 3 · Tap-only follow-ups ---------- */}
          {step === 3 && (<>
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
          </>)}

          {/* ---------- 4 · Where & when ---------- */}
          {step === 4 && (<>
          {/* Schedule */}
          <p style={s.label}>When do you need it?</p>
          {SCHEDULES.map(sc => (
            <button key={sc.label} style={{ ...s.schedBtn, ...(schedule === sc.label ? s.schedBtnSel : {}) }} onClick={() => { setSchedule(sc.label); setErrors(e => ({ ...e, schedule:"" })); }}>
              <span style={{ fontSize:"1.5rem" }}><Ic name={sc.iconName as any} size={22} color="#ea6b14" /></span>
              <div><div style={{ fontSize:".95rem", fontWeight:500 }}>{sc.label}</div><div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)" }}>{sc.sub}</div></div>
            </button>
          ))}
          {errors.schedule && <p id="nr-err-schedule" style={s.err}>{errors.schedule}</p>}

          {schedule === "Recurring" && (
            <div style={{ marginTop:".75rem", padding:"1rem", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"10px", display:"flex", flexDirection:"column" as const, gap:"1rem" }}>
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
                  Prepaid visits are held securely and released one visit at a time. Set this up after your first estimate is approved — unused visits are refundable.
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

          {/* Address */}
          <p style={{ ...s.label, marginTop:"1.75rem" }}>Where is this job?</p>
          {(() => {
            // De-dupe the "last used" option if it's already a saved address.
            const lastIsSaved = prevAddress && savedAddresses.some(a => (a.address ?? "").trim().toLowerCase() === prevAddress.trim().toLowerCase());
            const pick = (val: string) => { setAddrChoice(val); setSameAddress(val !== "new"); setErrors(e => ({ ...e, location:"" })); };
            return (
              <>
                {prevAddress && !lastIsSaved && (
                  <button style={{ ...s.addrBtn, ...(addrChoice === "last" ? s.addrBtnSel : {}) }} onClick={() => pick("last")}>
                    <span><Ic name={addrChoice === "last" ? "radio-on" : "radio-off"} size={16} color="#ea6b14" /></span>
                    <span>Same as last time — <span style={{ color:"rgba(var(--ff-muted), .6)" }}>{prevAddress}</span></span>
                  </button>
                )}
                {savedAddresses.map(a => (
                  <button key={a.id} style={{ ...s.addrBtn, ...(addrChoice === a.id ? s.addrBtnSel : {}) }} onClick={() => pick(a.id)}>
                    <span><Ic name={addrChoice === a.id ? "radio-on" : "radio-off"} size={16} color="#ea6b14" /></span>
                    <span>{a.label ? <strong style={{ marginRight:6 }}>{a.label}</strong> : null}<span style={{ color:"rgba(var(--ff-muted), .75)" }}>{a.address}</span></span>
                  </button>
                ))}
                <button style={{ ...s.addrBtn, ...(addrChoice === "new" ? s.addrBtnSel : {}) }} onClick={() => pick("new")}>
                  <span><Ic name={addrChoice === "new" ? "radio-on" : "radio-off"} size={16} color="#ea6b14" /></span>
                  <span>A different address</span>
                </button>
                {addrChoice === "new" && (
                  <>
                    <AddressAutocomplete autoComplete="street-address" style={{ ...inp, marginTop:".4rem", borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="e.g. 123 Main St NW" value={newLocation} onChange={v => { setNewLocation(v); setErrors(er => ({ ...er, location:"" })); }} />
                    <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", marginTop:".5rem" }}>
                      <input type="checkbox" checked={saveNewAddress} onChange={e => setSaveNewAddress(e.target.checked)} style={{ width:"15px", height:"15px", accentColor:"#ea6b14" }} />
                      Save this address for next time
                    </label>
                  </>
                )}
              </>
            );
          })()}
          {errors.location && <p id="nr-err-location" style={s.err}>{errors.location}</p>}

          {/* Vehicle (only for vehicle services) */}
          {isVehicle && (
            <>
              <p style={{ ...s.label, marginTop:"1.75rem" }}>Which vehicle?</p>
              {savedVehicles.map(v => {
                const label = [v.year, v.make, v.model].filter(Boolean).join(" ") || "Saved vehicle";
                return (
                  <button key={v.id} style={{ ...s.addrBtn, ...(vehChoice === v.id ? s.addrBtnSel : {}) }} onClick={() => setVehChoice(v.id)}>
                    <span><Ic name={vehChoice === v.id ? "radio-on" : "radio-off"} size={16} color="#ea6b14" /></span>
                    <span>{label}</span>
                  </button>
                );
              })}
              <button style={{ ...s.addrBtn, ...(vehChoice === "new" ? s.addrBtnSel : {}) }} onClick={() => setVehChoice("new")}>
                <span><Ic name={vehChoice === "new" ? "radio-on" : "radio-off"} size={16} color="#ea6b14" /></span>
                <span>{savedVehicles.length ? "A different vehicle" : "Add your vehicle"}</span>
              </button>
              {vehChoice === "new" && (
                <>
                  <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const, marginTop:".4rem" }}>
                    <input style={{ ...inp, flex:"1 1 80px", minWidth:0 }} placeholder="Year" value={vehYear} onChange={e => setVehYear(e.target.value)} />
                    <input style={{ ...inp, flex:"1 1 110px", minWidth:0 }} placeholder="Make" value={vehMake} onChange={e => setVehMake(e.target.value)} />
                    <input style={{ ...inp, flex:"1 1 110px", minWidth:0 }} placeholder="Model" value={vehModel} onChange={e => setVehModel(e.target.value)} />
                  </div>
                  <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", marginTop:".5rem" }}>
                    <input type="checkbox" checked={saveNewVehicle} onChange={e => setSaveNewVehicle(e.target.checked)} style={{ width:"15px", height:"15px", accentColor:"#ea6b14" }} />
                    Save this vehicle for next time
                  </label>
                </>
              )}
            </>
          )}

          {isBusiness && (
            <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".88rem", color:"rgba(var(--ff-fg), .85)", marginTop:"1rem" }}>
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} style={{ width:"16px", height:"16px", accentColor:"#ea6b14" }} />
              This is recurring / scheduled maintenance
            </label>
          )}

          {/* Budget — our starting price is shown read-only; the client picks a max. */}
          <BudgetPicker
            services={selectedServices}
            pricing={pricing}
            floor={budgetFloor}
            max={budgetMax}
            flexible={budgetFlexible}
            onMax={v => { setBudgetMax(v); setErrors(e => ({ ...e, budget: "" })); }}
            onFlexible={v => { setBudgetFlexible(v); setErrors(e => ({ ...e, budget: "" })); }}
            error={errors.budget}
            errorId="nr-err-budget"
          />

          <div style={{ display:"flex", alignItems:"flex-start", gap:".75rem", marginTop:"1.5rem", padding:"1rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
            <input
              type="checkbox"
              id="nr-agree-terms"
              checked={agreedToTerms}
              onChange={e => { setAgreedToTerms(e.target.checked); if (e.target.checked) setSubmitError(""); }}
              style={{ marginTop:"2px", accentColor:"#ea6b14", width:"16px", height:"16px", flexShrink:0, cursor:"pointer" }}
            />
            <label htmlFor="nr-agree-terms" style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, cursor:"pointer", fontWeight:300 }}>
              I agree to Freddy Fix It&rsquo;s{" "}
              <a href="/user-agreement" target="_blank" rel="noopener noreferrer" style={{ color:"#ea6b14", textDecoration:"none" }}>User Agreement</a>
              {" "}and{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"#ea6b14", textDecoration:"none" }}>Privacy Policy</a>.
            </label>
          </div>
          </>)}

          {/* Deliberately OUTSIDE the step blocks: the photo-size guard on screen 1
              and submit() on screen 4 both write here. */}
          {submitError &&<div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginTop:"1rem" }}>{submitError}</div>}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"1px solid rgba(var(--ff-fg), .1)" }} onClick={back}>{step === 1 ? "← Dashboard" : "← Back"}</button>
          {step < TOTAL
            ? <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={next}>Next →</button>
            : <button style={{ ...s.navBtn, background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", opacity: submitting ? .6 : 1 }} onClick={submit} disabled={submitting}>
                {submitting ? <><span className="ff-btn-spin" aria-hidden="true" />Submitting…</> : "Submit Request →"}
              </button>
          }
        </div>
      </div>
    </div>
  );
}
