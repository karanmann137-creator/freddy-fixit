import { Ic } from "@/components/Ic";
import { Sk, SkText, SkCard, StalledNotice } from "@/components/Skeleton";
import VoiceDictate from "@/components/VoiceDictate";
import { AREAS, areaToken, areasFromPostal, formatApproxLocation, fsaOf, isPostalCode, parseApproxLocation } from "@/lib/calgaryAreas";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { readAuthUser } from "@/lib/authRead";
import { DeadEnd } from "@/components/ui";
import { compressImage } from "@/lib/imageCompress";
import { scanImage, shouldBlock, rejectMessage } from "@/lib/imageSafety";
import { requestGoogleReview } from "@/lib/reviewPrompt";
import OnboardingProgress from "@/components/OnboardingProgress";
import { SERVICES, SCHEDULES } from "@/pages/ClientOnboarding";
import { useServicePricing, floorFor } from "@/lib/servicePricing";
import ServicePicker from "@/components/ServicePicker";
import BudgetPicker from "@/components/BudgetPicker";
import PhotoPicker from "@/components/PhotoPicker";
import { isPerKmService, freqLabel, SLIDER_STOPS, SLIDER_SHORT } from "@/lib/recurrence";
import WaitlistForm from "@/components/WaitlistForm";
import { usePlatformStatus, acceptingRequests } from "@/lib/platformStatus";
import { detectFromText } from "@/lib/serviceTags";
import { detectJobSplit, type SplitPart } from "@/lib/jobSplit";
import SplitJobDialog from "@/components/SplitJobDialog";
import { questionsFor, answerSummary, type JobAnswers } from "@/lib/jobQuestions";
import { trackEvent } from "@/lib/analytics";
import { validatePhone, fmtPhone } from "@/lib/emailValidation";
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
  // Captured once, because the profile/last-request read below resolves AFTER mount
  // and would otherwise overwrite a restored choice with its own default. Empty
  // string means "the draft had nothing to say", which is the same as no draft.
  const draftLocChoice = dStr(draft, "locChoice");
  const draftVehChoice  = dStr(draft, "vehChoice");

  const [selectedServices, setSelectedServices] = useState<string[]>(() => dArr(draft, "selectedServices").filter(l => SERVICES.some(sv => sv.label === l)));
  const pricing = useServicePricing();
  const [schedule, setSchedule] = useState(() => dStr(draft, "schedule"));
  /**
   * APPROXIMATE location only — a postal code plus an area, never a street address.
   *
   * A posted request is read by up to seven pros bidding on it, and none of them
   * needs to know which house it is. The full address is confirmed once, later,
   * immediately before the deposit. See the warning at the top of
   * `src/lib/calgaryAreas.ts`: BOTH halves have to be present, because a missing
   * area token throws no error and shows no empty state — it just quietly makes
   * the request out-of-zone for every contractor.
   */
  const [locChoice, setLocChoice] = useState<string>(() => dStr(draft, "locChoice", "last")); // "last" | "new"
  const [postalCode, setPostalCode] = useState(() => dStr(draft, "postalCode"));
  const [area, setArea] = useState(() => dStr(draft, "area"));
  /**
   * THE AREA IS DERIVED FROM THE POSTAL CODE, NOT ASKED FOR — same as
   * ClientOnboarding step 1, and it has to stay the same, because these are the
   * two entry points that write the identical `client_requests.location` string.
   *
   * `area` is still the stored answer (the server reads the token out of the raw
   * text), the client just no longer answers a second "which part of town?"
   * question to produce it. This flag is the ESCAPE HATCH, true only when the
   * chips are the real control: the client asked to correct the guess, or we
   * don't recognise the FSA and have nothing to guess with.
   *
   * It restores from the draft by COMPARISON rather than by storing a flag of
   * its own — if the saved area isn't the one the saved postal code produces,
   * it was a manual pick and the chips belong back on screen. That covers the
   * unmapped-FSA case for free and adds no field to `requestDraft.ts`.
   */
  const [areaOverride, setAreaOverride] = useState(() => {
    const a = dStr(draft, "area");
    return !!a && a !== (areasFromPostal(dStr(draft, "postalCode"))[0] || "");
  });

  // Saved vehicles (reused across requests). Saved ADDRESSES are deliberately no
  // longer read here — this form doesn't collect a street address any more, and
  // the pre-deposit address confirmation is what owns that list now.
  const [savedVehicles, setSavedVehicles] = useState<any[]>([]);
  const [vehChoice, setVehChoice] = useState<string>(() => dStr(draft, "vehChoice", "new"));    // saved id | "new"
  const [vehYear, setVehYear] = useState(() => dStr(draft, "vehYear"));
  const [vehMake, setVehMake] = useState(() => dStr(draft, "vehMake"));
  const [vehModel, setVehModel] = useState(() => dStr(draft, "vehModel"));
  const [saveNewVehicle, setSaveNewVehicle] = useState(true);
  const [description, setDescription] = useState(() => dStr(draft, "description"));
  // Only asked for when the account has no phone on file (Google sign-ins, and
  // accounts made while the signup field was optional).
  const [phone, setPhone] = useState("");
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
  /**
   * The platform's starting price for whatever is currently selected. Derived,
   * never typed — as of 2026-09-11 the client names no number at all (see
   * BudgetPicker for why the max field was removed).
   *
   * It is still computed and still written into `client_requests.budget_min`,
   * because it describes the WORK rather than a preference of theirs, and it is
   * what stops the contractor-side `targetBid()` suggesting a price below the
   * cheapest honest version of the job. Null while `pricing` is still loading or
   * when nothing selected is in the price book, in which case budget_min is left
   * NULL rather than guessed.
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
  // Photo nudge state. `photoNudged` is a ref, not state, so the second press
  // can never be swallowed by a re-render landing between the two clicks.
  const photoNudged = useRef(false);
  const [photoPulse, setPhotoPulse] = useState(false);

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
      // THREE OUTCOMES, NOT TWO. `getUser()` resolves WITH an error when the
      // visitor is signed out, so `if (!user)` lumps a plainly-signed-out
      // visitor together with a momentary network fault and sends both to
      // /login — where the session reads as valid and sends them back here,
      // which is the loop. Only a positive "signedOut" earns the redirect; a
      // "couldn't tell" falls into `loadError`, which already offers Try again.
      const who = await readAuthUser();
      if (who.kind === "signedOut") { setLocation("/login"); return; }
      if (who.kind !== "user") { setLoadError(true); setLoading(false); return; }
      const user = { id: who.userId };
      // A PostgREST error resolves rather than throwing, so destructuring only
      // `data` let one failed read (say saved_vehicles) look like "you have no
      // saved vehicles" — the client re-types details they already gave us, and
      // `loadError` never fires. Check each result explicitly.
      const [pRes, rRes, vRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("client_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("saved_vehicles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      const firstErr = [pRes, rRes, vRes].find(r => (r as any).error);
      if (firstErr) throw (firstErr as any).error;
      const prof = pRes.data, reqs = rRes.data, vehs = vRes.data;
      setProfile(prof);
      const last = (reqs ?? [])[0] ?? null;
      setLastReq(last);
      setSavedVehicles(vehs ?? []);
      /**
       * Default location choice: reuse last time's approximate location, but ONLY
       * when both halves of it read back. The previous request may predate this
       * form and hold a full street address, out of which `parseApproxLocation`
       * recovers a postal code and nothing else — offering that as "same as last
       * time" would write half a location, which is the silent in-zone-ranking
       * failure `calgaryAreas.ts` warns about.
       *
       * DEFAULT, not override — a restored draft already carries a choice the
       * client made, and this read resolves after mount, so without the guard it
       * would land a second later and silently move them off the answer they
       * picked (wiping a postal code they had already typed).
       */
      if (!draftLocChoice) {
        const prev = parseApproxLocation(last?.location ?? "");
        setLocChoice(prev.postal && prev.area ? "last" : "new");
      }
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

  /**
   * The multi-trade split suggestion, non-null only while the dialog is open.
   *
   * ⚠️ This is state rather than a promise, DELIBERATELY, and it is the one
   * difference from the askConfirm pattern used everywhere else. askConfirm only
   * settles when <ConfirmDialog/> closes, so a page that forgets the mount hangs
   * the button forever with no error — and the button this one hangs is Submit on
   * the top of the funnel. Here, a missing <SplitJobDialog/> mount leaves
   * `submitting` false and a request simply un-posted until the next press: the
   * person is still on their fully typed form and nothing is half-created. Both
   * failure modes are silent; only one of them loses the job.
   */
  const [splitSuggestion, setSplitSuggestion] = useState<SplitPart[] | null>(null);

  /**
   * Pros this client has worked with or favourited, for the "book again" strip.
   *
   * This used to sit on the client dashboard home tab, where it competed with
   * the money-gating attention rows for the top of the page. It belongs HERE:
   * rebooking is a decision about the request being written, so the shortcut
   * lives on the form that writes it.
   *
   * Read on its OWN, deliberately outside the `Promise.all` above — that block
   * sets `loadError`, which replaces the entire page with a retry screen. A
   * convenience strip must never be able to stop someone posting a job, so a
   * failed read here leaves `pros` empty and the strip simply doesn't render.
   * There is nothing for the client to do about it either way, and the full
   * list is still on the dashboard's My Pros tab.
   */
  const [pros, setPros] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc("list_my_pros");
      if (!alive || error) return;
      setPros(data ?? []);
    })();
    return () => { alive = false; };
  }, []);
  const chosenPro = preferredPro ? pros.find(p => p.contractor_id === preferredPro) : null;

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

  /**
   * Pre-fill the description if the home page hero linked here with ?desc=…
   *
   * This is the SIGNED-IN twin of the same effect in ClientOnboarding. It has to
   * exist there and here, because ClientOnboarding renders <NewRequest/> outright
   * for a logged-in client — so without this, exactly the people who have used us
   * before would type their problem into the hero box, press Next, and be asked
   * for it again. That is the "decorative box" failure, and it would hit our
   * returning clients only, which is the worst half to lose it on.
   *
   * Same three rules as the ClientOnboarding copy:
   * - ADD, never replace, matching the ?service= guard directly above — a
   *   restored draft's description outranks a hero line, since it is the longer
   *   thought and the client can still edit it.
   * - Strip the param afterwards with replaceState (the clearDashNavFromUrl
   *   idiom), so a refresh mid-form can't re-apply a line they deleted.
   * - Trimmed and capped here as well as at the sending end, because a URL is
   *   user input wherever it came from.
   */
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("desc");
    const d = (raw || "").trim().slice(0, 400);
    if (d) setDescription(prev => (prev.trim() ? prev : d));
    if (raw !== null) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("desc");
        window.history.replaceState({}, "", u.pathname + u.search + u.hash);
      } catch { /* a URL we can't rewrite is cosmetic — the prefill already happened */ }
    }
  }, []);

  /**
   * Last time's location, read back as an APPROXIMATE one.
   *
   * `.text` is empty unless BOTH halves parsed, and that emptiness is what hides
   * the "same as last time" option for a client whose previous request holds a
   * legacy street address. It deliberately does NOT fall back to the raw string:
   * re-posting a street address is the exact thing this change exists to stop.
   */
  const prevApprox = (() => {
    const p = parseApproxLocation(lastReq?.location ?? "");
    return { ...p, text: p.postal && p.area ? formatApproxLocation(p.postal, p.area) : "" };
  })();
  const isBusiness = lastReq?.client_type === "business";

  const VEHICLE_SERVICES = ["Oil Change","Tire Swap / Rotation","Battery / Brakes","Vehicle Maintenance"];
  const isVehicle = selectedServices.some(sv => VEHICLE_SERVICES.includes(sv));

  /**
   * ONE answer to "is the client entering a fresh location?", shared by the
   * renderer, `validate()` and `resolveLocation()`.
   *
   * `locChoice` alone is not safe to branch on: when `prevApprox.text` is empty
   * the two radio buttons aren't rendered at all, so a restored draft (or the
   * initial default, before the profile read resolves) holding "last" would
   * leave the client on a screen with no location control AND a validation
   * error they have no way to clear. Emptiness of `prevApprox.text` therefore
   * overrides the stored choice everywhere, not just in the renderer.
   */
  const enteringNew = locChoice === "new" || !prevApprox.text;

  // Resolve the approximate location from the current choice. Everything goes
  // through `formatApproxLocation`, so `client_requests.location` can only ever
  // hold a value `mask_location()` maps to itself — postal code AND area token.
  const resolveLocation = () => (enteringNew ? formatApproxLocation(postalCode, area) : prevApprox.text);

  // What the postal code says, and whether the chips have to be on screen.
  // `fsaOf` reads the first three characters, so the tag resolves the moment
  // "T3A" is typed rather than waiting for the full six — and an FSA we don't
  // recognise reveals the chips immediately, while the client is still looking
  // at the field, instead of failing validation at the bottom of the form.
  const derivedArea = areasFromPostal(postalCode)[0] || "";
  const showAreaChips = areaOverride || (!!fsaOf(postalCode) && !derivedArea);

  const onPostal = (v: string) => {
    setPostalCode(v);
    setErrors(e => ({ ...e, location: "" }));
    // The postal code OWNS the area while the chips are hidden, including
    // CLEARING it. The old rule here was suggest-into-empty-only, which meant
    // typing T3A (NW) and then correcting to T2P left the job tagged NW — the
    // client silently dispatched to the quadrant they just corrected away from.
    // Once they've taken the chips over, their pick stands and typing stops
    // touching it.
    if (!areaOverride) setArea(areasFromPostal(v)[0] || "");
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
    locChoice, postalCode, area, vehChoice, vehYear, vehMake, vehModel,
    recurring, recurringFrequency, sliderIdx, recurringDates,
    recurringKm, prepayPref, recurringStartDate, recurringEndDate,
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
  //
  // `withExtras` exists for the multi-trade split, where this is called once per
  // part. The answers and tags belong to `primaryService`'s question set, so
  // they ride on exactly ONE part rather than being copied onto all of them: a
  // pro reading "Details: tiled walls, new build" at the bottom of the stone
  // pathway half is being told something confident about a job that isn't
  // theirs, and they price off that text.
  const composedPart = (text: string, withExtras: boolean) => {
    const parts = [text.trim()];
    if (withExtras) {
      const sum = answerSummary(primaryService, answers);
      if (sum) parts.push(sum);
      if (tags.length) parts.push("Details: " + tags.join(", "));
    }
    return parts.join("\n\n");
  };
  const composedDescription = () => composedPart(description, true);

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
      if (!profile?.phone) { const pv = validatePhone(phone, true); if (!pv.ok) e.phone = pv.error!; }
    }
    if (step === 2) {
      if (selectedServices.length === 0) e.services = "Please select at least one service";
    }
    if (step === 4) {
      if (!schedule) e.schedule = "Please choose a timeframe";
      /**
       * BOTH halves are required, and separately — a postal code with no area
       * still produces a non-empty string, so a bare "is it blank?" check would
       * pass and the request would then rank out-of-zone for every contractor
       * with nothing anywhere saying so. Each half gets its own message, because
       * "location required" beside a filled-in postal box reads like a bug.
       */
      if (!enteringNew) {
        // "Same as last time" is only ever offered when it parses, so this
        // branch can't fail — but it stays as the belt to the renderer's braces.
        if (!prevApprox.text) e.location = "Please tell us where this job is";
      } else if (!isPostalCode(postalCode)) {
        e.location = "Please enter a full postal code (e.g. T3A 1B2)";
      } else if (!area) {
        e.location = "Please choose the area this job is in";
      }
      // No budget branch: as of 2026-09-11 the client types no money figure on
      // this form, so there is nothing here that can be wrong. BudgetPicker is
      // read-only.
    }
    setErrors(e);
    // Scroll the first problem into view — on a long form the submit button is
    // at the bottom and an error near the top is otherwise invisible.
    const first = ["phone", "description", "services", "schedule", "location"].find(k => e[k]);
    if (first) {
      setTimeout(() => {
        document.getElementById("nr-err-" + first)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    }
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    /**
     * The photo nudge — a nudge, NOT a gate. Same rule, same wording and the
     * same one-press budget as ClientOnboarding step 1, because this is the
     * SAME question asked of a returning client and the two forms answering it
     * differently is how one of them quietly stops working.
     *
     * It runs AFTER validate() so a real error keeps the scroll position; the
     * flag is a ref rather than state because a re-render between the two
     * presses would race the click handler and swallow the second press.
     */
    if (step === 1 && !photoFile && !photoNudged.current) {
      photoNudged.current = true;
      setPhotoPulse(true);
      setTimeout(() => {
        document.getElementById("nr-photo")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
      setTimeout(() => setPhotoPulse(false), 4500); // matches 1.5s x 3
      return;
    }
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

  /**
   * `split` is how the second pass tells the first one apart:
   *   undefined   first press — run the multi-trade detector
   *   "one"       the client chose "Keep as one job"
   *   SplitPart[] the client accepted the split, with their edits
   *
   * ⚠️ Never pass this straight to onClick — React hands a click event to the
   * first parameter, which would arrive here as a truthy non-array `split` and
   * be read as an accepted split of zero parts. The call site wraps it.
   */
  const submit = async (split?: SplitPart[] | "one") => {
    if (!validate()) return;
    if (!agreedToTerms) { setSubmitError("Please agree to the User Agreement and Privacy Policy to continue."); return; }
    setSubmitting(true); setSubmitError("");
    try {
      // Same three-outcome read as the mount, and here the old two-way version
      // did a second kind of damage: the bare `return` left `submitting` true
      // (there is no `finally` on this try), so the Submit button stayed dead
      // afterwards. A transient fault threw away a fully typed request, bounced
      // the person to /login, and gave them a jammed button to come back to.
      const who = await readAuthUser();
      if (who.kind === "signedOut") { setSubmitting(false); setLocation("/login"); return; }
      if (who.kind !== "user") {
        setSubmitError("We couldn't confirm you're still signed in. Your answers are saved — refresh the page and submit again.");
        setSubmitting(false);
        return;
      }
      const user = { id: who.userId, email: who.email };

      /**
       * ── Multi-trade split, offered here and NOWHERE else ──────────────────
       *
       * WHY BEFORE THE PHOTO UPLOAD. This branch returns to the screen so the
       * dialog can open, and submit() then runs again from the top. Everything
       * above this line is idempotent; the photo upload is not — it writes a new
       * storage object under a fresh UUID every time, so detecting after it
       * would leave an orphaned copy in `problem-photos` for every split the
       * client accepts. The safety-scan branch below is allowed to return late
       * because it is the END of its own flow, not a round trip.
       *
       * WHY `description` AND NOT composedDescription(). The composed text has
       * the answer summary and the tag list appended, and those are generated
       * prose — "Details: tiled walls, new build" contains commas and the answer
       * summary can contain anything. Segmenting them would cut on our own
       * formatting rather than on the client's list markers.
       *
       * WHY A PREFERRED PRO SUPPRESSES IT ENTIRELY. ?pro= means the client
       * picked one specific person from My Pros. Splitting would either send
       * that pro a part of the job they don't do, or quietly route half of it
       * away from the only person they asked for. Both are worse than one
       * imperfectly-matched request, and the client can post the second job
       * themselves. Vehicle jobs are suppressed for the same shape of reason:
       * `vehicle_details` is one vehicle, and it is shared by every row.
       *
       * FAILS OPEN, like the detector itself: detectJobSplit() never throws and
       * returns null for every ambiguous case, and null means post unsplit.
       */
      if (split === undefined && !preferredPro && !isVehicle) {
        const suggestion = await detectJobSplit(description);
        if (suggestion && suggestion.length >= 2) {
          setSplitSuggestion(suggestion);
          setSubmitting(false);
          return;
        }
      }
      const splitParts = Array.isArray(split) ? split : null;

      let photoPath: string | null = null;
      if (photoFile) {
        const small = await compressImage(photoFile, "photo");
        const ext = (small.name.split(".").pop() || "jpg").toLowerCase();
        const path = user.id + "/" + crypto.randomUUID() + "." + ext;
        const up = await supabase.storage.from("problem-photos").upload(path, small, { upsert: false, contentType: small.type || undefined });
        // Safety scan before the photo is linked to the request. Fail-open —
        // only a real "reject" stops it, and a scanner outage comes back
        // "unknown" and attaches the photo as normal.
        //
        // Unlike the signup flow, this stops BEFORE the request is inserted and
        // says so, because here it can: nothing else is half-created, the page
        // is still on screen, and the person can pick a different photo. It
        // drops the attachment first so pressing Submit again just works — the
        // photo is optional, so refusing one must never leave someone unable to
        // post their job at all.
        if (!up.error) {
          const scan = await scanImage("problem-photos", path);
          if (shouldBlock(scan)) {
            setPhotoFile(null);
            setSubmitError(rejectMessage(scan) + " We've removed it — press Submit again to post without a photo, or choose a different one.");
            setSubmitting(false);
            return;
          }
          photoPath = path;
        }
      }

      // Postal code + area token, never a street address — see resolveLocation().
      // Nothing is written to `saved_addresses` here any more: this form has no
      // street address to save, and the pre-deposit confirmation owns that list.
      const location = resolveLocation();

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

      /**
       * Everything every part of a split SHARES. One person, one address, one
       * schedule, one photo — the split is about trade, and nothing else.
       *
       * `service_needed` and `job_description` are absent here because there is
       * no sensible shared value for them; `budget_min` keeps the whole-request
       * floor as its default and is overridden per part below.
       */
      const base = {
        user_id: user.id,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        email: profile?.email ?? user.email ?? null,
        phone: profile?.phone ?? (phone.trim() || null),
        preferred_contractor_id: preferredPro,
        preferred_schedule: schedule,
        location,
        photo_path: photoPath,
        status: "pending",
        // The client states no budget at all any more (see BudgetPicker).
        //
        // `budget_flexible` is FALSE on purpose: `true` renders to a contractor
        // as "the client told us they're flexible", which they never did —
        // telling a pro something the client didn't say is the quiet
        // misinformation that gets priced into a bid.
        budget_flexible: false,
        // budget_min is OURS — the platform starting price for the chosen
        // services. It describes the work rather than a preference of theirs,
        // and it is the floor `targetBid()` refuses to suggest beneath.
        budget_min: budgetFloor,
        budget_max: null,
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
      };

      /**
       * ONE insert call carrying N rows, never a loop — and that is the whole
       * reason this shape was chosen. A multi-row INSERT is a single statement
       * in a single transaction, so the split either lands whole or not at all.
       * A loop that failed on part 2 would leave the client looking at an error
       * with part 1 already posted and dispatched, and `dispatched_to` is a
       * PERMANENT "already told them" list — there is no undo for the half that
       * went out.
       *
       * The per-part columns, and why each one has to be per-part:
       *  · service_needed  — the single label this part detected, which is what
       *    public.service_specialties() reads to decide who gets emailed. This
       *    is the entire point of the split.
       *  · job_description — the part's own words, with the step-3 answers and
       *    tags folded onto exactly one part (see composedPart).
       *  · budget_min      — the platform floor for THIS trade.
       *  · preferred_contractor_id — forced null. A split is only offered when
       *    no pro was requested (see the detector branch above), so this is
       *    belt-and-braces against a future caller.
       */
      const extrasOn = splitParts
        // The part that detected the service whose question set the step-3
        // answers actually belong to. findIndex returns -1 when none matches —
        // the client picked a service by hand that no part detected — and the
        // answers then ride on part 1 rather than being dropped.
        ? Math.max(0, splitParts.findIndex(p => p.service === primaryService))
        : 0;

      const rows = splitParts
        ? splitParts.map((p, i) => ({
            ...base,
            service_needed: p.service,
            job_description: composedPart(p.description, i === extrasOn),
            budget_min: floorFor(p.service, pricing),
            preferred_contractor_id: null,
          }))
        : [{
            ...base,
            service_needed: selectedServices.join(", "),
            job_description: composedDescription(),
          }];

      const { error } = await supabase.from("client_requests").insert(rows);
      if (error) throw error;
      requestGoogleReview("job_posted");
      // The request row exists now, so the draft is no longer a half-finished
      // request — it's a duplicate waiting to happen. Cleared before navigating,
      // while `submitting` still has autosave switched off.
      // Same event name the first-job signup flow sends, so "requests posted"
      // counts both paths in analytics.
      trackEvent("post_job", { flow: "returning_client" });
      clearDraft(NEWREQUEST_DRAFT_KEY);
      setLocation("/client-dashboard");
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .1)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".95rem", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"var(--ff-bg)", padding:"3rem 1rem 4rem", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    inner: { maxWidth:"580px", margin:"0 auto" },
    card: { background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"2rem" },
    label: { display:"block", fontSize:".78rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .6)", marginBottom:".6rem" },
    err: { fontSize:".78rem", color:"var(--ff-danger)", marginTop:".35rem" },
    svcBtn: { display:"flex", alignItems:"center", gap:".65rem", padding:".9rem 1rem", background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", fontSize:".88rem", cursor:"pointer", textAlign:"left" as const, width:"100%" },
    svcBtnSel: { background:"rgba(var(--ff-accent-rgb), .12)", borderColor:"rgba(var(--ff-accent-rgb), .5)", color:"var(--ff-text)" },
    schedBtn: { display:"flex", alignItems:"center", gap:"1rem", padding:"1rem 1.2rem", background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".75rem" },
    schedBtnSel: { background:"rgba(var(--ff-accent-rgb), .12)", borderColor:"rgba(var(--ff-accent-rgb), .5)", color:"var(--ff-text)" },
    addrBtn: { display:"flex", alignItems:"center", gap:".6rem", padding:".85rem 1rem", background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .85)", fontFamily:"inherit", fontSize:".9rem", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".6rem" },
    addrBtnSel: { background:"rgba(var(--ff-accent-rgb), .12)", borderColor:"rgba(var(--ff-accent-rgb), .5)", color:"var(--ff-text)" },
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
  // Moved onto the shared DeadEnd on 2026-11-09. The retry is NOT the default
  // reload: this one can re-run the reads in place, which keeps a part-typed
  // request on screen, so it keeps its own handler. That is the reason DeadEnd
  // takes `onRetry` rather than always reloading.
  if (loadError) return (
    <DeadEnd
      msg="We couldn't load your details. Check your connection and try again."
      retryLabel="Try again"
      onRetry={() => { setLoading(true); setLoadTick(t => t + 1); }}
    />
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
          <a href="/client-dashboard" style={{ color:"var(--ff-c10)", textDecoration:"none", fontWeight:600 }}>dashboard</a>.
        </p>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      {/* This page is outside `.ffdash`, and ClientOnboarding returns
          <NewRequest/> BEFORE its own <style> block ever renders — so the pulse
          keyframes have to be declared here. Copied deliberately rather than
          imported: an inline style attribute cannot express @keyframes, and the
          two forms are separate top-level screens. */}
      <style>{"@keyframes ff-co-pulse{0%{box-shadow:0 0 0 0 rgba(var(--ff-accent-rgb), .55)}70%{box-shadow:0 0 0 12px rgba(var(--ff-accent-rgb), 0)}100%{box-shadow:0 0 0 0 rgba(var(--ff-accent-rgb), 0)}}"
        + " .ff-photo-pulse{outline:2px solid rgba(var(--ff-accent-rgb), .75); outline-offset:6px; border-radius:12px; animation:ff-co-pulse 1.5s ease-out 3}"
        + " @media (prefers-reduced-motion: reduce){.ff-photo-pulse{animation:none; background:rgba(var(--ff-accent-rgb), .12)}}"}</style>
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
          <div style={{ ...s.card, marginBottom:"1rem", padding:"1rem 1.25rem", borderColor:"rgba(var(--ff-accent-rgb), .4)", background:"rgba(var(--ff-accent-rgb), .07)", display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" as const }}>
            <Ic name="star" size={16} color="var(--ff-c10)" style={{ flexShrink:0 }} />
            <div style={{ fontSize:".86rem", color:"var(--ff-text)", flex:"1 1 auto", minWidth:0 }}>
              {chosenPro
                ? "This request goes to " + (chosenPro.company_name || chosenPro.name || "your pro") + " first — they'll be notified directly to send you an estimate."
                : "You're rebooking a pro you've worked with — they'll be notified directly to send you an estimate."}
            </div>
            {/* A reservation hides the request from every other pro for 48 hours,
                so the client has to be able to change their mind before posting.
                Clearing it here is enough: the value is read off state at submit,
                not off the URL. */}
            <button type="button" onClick={() => setPreferredPro(null)} style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontFamily:"inherit", fontSize:".8rem", fontWeight:600, color:"rgba(var(--ff-muted), .75)", textDecoration:"underline", flexShrink:0 }}>
              Send to everyone instead
            </button>
          </div>
        )}

        <div style={s.card}>
          {/* ---------- 1 · Describe it in your own words ---------- */}
          {step === 1 && (<>
            {/* Contact summary (read-only) */}
            <div style={{ marginBottom:"1.75rem", paddingBottom:"1.25rem", borderBottom:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)" }}>
              <div style={s.label}>Submitting as</div>
              <div style={{ fontSize:".95rem", fontWeight:500 }}>
                {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Your account"}
                {isBusiness && lastReq?.business_name ? <span style={{ color:"rgba(var(--ff-muted), .6)", fontWeight:400 }}> · {lastReq.business_name}</span> : null}
              </div>
              <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginTop: "var(--ff-s1)" }}>
                {[profile?.email, profile?.phone].filter(Boolean).join(" · ")}
              </div>
              {!profile?.phone && (
                <div style={{ marginTop:"var(--ff-s4)" }}>
                  <label style={s.label} htmlFor="nr-phone">Phone <span style={{ opacity:.5, fontWeight:400 }}>(so we can text you when estimates arrive)</span></label>
                  <input id="nr-phone" autoComplete="tel" type="tel" placeholder="403-555-0100" value={phone}
                    style={{ ...inp, borderColor: errors.phone ? "var(--ff-danger)" : "rgba(var(--ff-fg), .1)" }}
                    onChange={e => { setPhone(fmtPhone(e.target.value)); setErrors(er => ({ ...er, phone:"" })); }} />
                  {errors.phone && <p id="nr-err-phone" style={s.err}>{errors.phone}</p>}
                </div>
              )}
              <p style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)", marginTop:".5rem" }}>Need to change your name or phone? Update it in your profile.</p>
            </div>

            {/* Rebooking is the cheapest job on the platform to win. This strip
                used to live on the client dashboard home tab, above the fold and
                below nothing — which put a marketing card in the same space as
                the money-gating attention rows. It belongs on the form that
                actually writes `preferred_contractor_id`.

                Hidden once a pro is chosen: the banner above already names them
                and offers the undo, and leaving the row on screen would invite a
                second tap that changes nothing visible. */}
            {pros.length > 0 && !preferredPro && (
              <div style={{ marginBottom:"1.75rem", paddingBottom:"1.25rem", borderBottom:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)" }}>
                <div style={s.label}>Used us before?</div>
                <p style={{ margin:"0 0 .7rem", fontSize:".8rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.45 }}>
                  Send this straight to a pro you&rsquo;ve worked with. They get first refusal for 48 hours — no need to compare estimates again.
                </p>
                <div style={{ display:"flex", gap: "var(--ff-s3)", overflowX:"auto" as const, paddingBottom:".3rem" }}>
                  {pros.slice(0, 6).map(pro => (
                    <div key={pro.contractor_id} style={{ minWidth:"178px", flex:"0 0 auto", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .1)", borderRadius:"12px", padding:".8rem", background:"rgba(var(--ff-fg), .03)" }}>
                      <div style={{ fontSize:".88rem", fontWeight:600, color:"var(--ff-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        {pro.company_name || pro.name || "Your pro"}
                      </div>
                      <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .5)", marginTop:".15rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        {pro.rating ? "⭐ " + Number(pro.rating).toFixed(1) : "New"}
                        {pro.last_service ? " · " + pro.last_service : ""}
                      </div>
                      {/* Sets state rather than navigating — we are already on the
                          form, so a trip through ?pro= would throw away everything
                          typed so far. */}
                      <button type="button" onClick={() => setPreferredPro(pro.contractor_id)} style={{ width:"100%", marginTop:".6rem", padding: "var(--ff-s2)", fontSize:".8rem", fontFamily:"inherit", fontWeight:600, cursor:"pointer", borderRadius:"8px", border:"1px solid rgba(var(--ff-accent-rgb), .4)", background:"rgba(var(--ff-accent-rgb), .12)", color:"var(--ff-c10)" }}>
                        Book again
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            <div id="nr-photo" className={photoPulse ? "ff-photo-pulse" : undefined} style={{ marginBottom:"1.2rem", scrollMarginTop:"5.5rem" }}>
              <label style={s.label}>
                Photo of the problem{" "}
                {/* The asterisk appears only after the nudge. Marking a field
                    that really is optional on first sight is a lie, and people
                    learn fast to ignore an asterisk that means nothing. */}
                {photoNudged.current && !photoFile
                  ? <span aria-hidden="true" style={{ color:"var(--ff-c10)", fontWeight:600 }}>*</span>
                  : <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span>}
              </label>
              <p style={{ margin:"0 0 .5rem", fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.45 }}>A clear photo helps contractors give you a faster, more accurate estimate — and means fewer surprises on the day.</p>
              {/* One shared control — see PhotoPicker.tsx. This form and
                  ClientOnboarding ask for the photo in the same words on the
                  same kind of screen, and their two copies of this box had
                  ALREADY drifted on the oversized-file wording. The picker owns
                  the size cap, the cancelled-picker rule and the reject reset;
                  this screen keeps the pulse wrapper, the asterisk and the
                  advisory below, because those are what genuinely differ. */}
              <PhotoPicker
                id="nr-photo-upload"
                file={photoFile}
                onPick={f => { setSubmitError(""); setPhotoFile(f); setPhotoPulse(false); }}
                onError={setSubmitError}
              />
              {/* The advisory outlives the pulse on purpose: the animation is
                  what draws the eye, the words are what answer "why does it
                  matter?", and those are two different jobs. */}
              {photoNudged.current && !photoFile && (
                <div style={{ background:"rgba(var(--ff-accent-rgb), .08)", border:"1px solid rgba(var(--ff-accent-rgb), .28)", borderRadius:"8px", padding:".8rem 1rem", marginTop:".6rem", fontSize:".82rem", lineHeight:1.6, color:"rgba(var(--ff-muted), .85)" }}>
                  <strong style={{ color:"var(--ff-text)" }}>A photo gets you a real number, faster.</strong>{" "}
                  Pros price what they can see. With a photo you&rsquo;ll usually get firm estimates the same day; without one you&rsquo;re more likely to get a wide ballpark, questions before anyone will quote, or a pro who wants to come out and look first.
                  <div style={{ marginTop: "var(--ff-s2)", opacity:.8 }}>It&rsquo;s still optional — press Next again to carry on without one, and you can add a photo from your dashboard any time after you post.</div>
                </div>
              )}
            </div>
          </>)}

          {/* ---------- 2 · Confirm what we read ---------- */}
          {step === 2 && (<>
            <p style={s.label}>The service we picked</p>
            {selectedServices.length > 0 ? (
              <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginBottom:".6rem" }}>
                {selectedServices.map(sv => (
                  <button key={sv} type="button" onClick={() => toggleService(sv)}
                    style={{ display:"inline-flex", alignItems:"center", gap:".5rem", padding:".6rem 1rem", borderRadius:"999px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", background:"rgba(var(--ff-accent-rgb), .15)", border:"1px solid var(--ff-c10)", color:"var(--ff-text)" }}>
                    {sv}
                    <span style={{ color:"var(--ff-c10)", fontSize:"1.05rem", lineHeight:1 }}>×</span>
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
                <div style={{ display:"flex", gap: "var(--ff-s2)", flexWrap:"wrap" as const }}>
                  {tags.map(t => (
                    <button key={t} type="button" onClick={() => removeTag(t)}
                      style={{ display:"inline-flex", alignItems:"center", gap:".4rem", padding:".4rem .75rem", borderRadius:"999px", fontFamily:"inherit", fontSize:".8rem", cursor:"pointer", background:"rgba(var(--ff-fg), .05)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .14)", color:"rgba(var(--ff-muted), .85)" }}>
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
                <p style={{ fontSize:".95rem", fontWeight:500, color:"var(--ff-text)", marginBottom: "var(--ff-s3)", lineHeight:1.45 }}>
                  {q.prompt}
                  {q.multi && <span style={{ fontWeight:400, color:"rgba(var(--ff-muted), .55)", fontSize:".82rem" }}> · pick any that apply</span>}
                </p>
                <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                  {q.options.map(opt => {
                    const on = isAnswered(q, opt);
                    return (
                      <button key={opt} type="button" onClick={() => setAnswer(q, opt)}
                        style={{ padding:".6rem 1rem", borderRadius:"10px", fontFamily:"inherit", fontSize:".88rem", fontWeight: on ? 500 : 400, cursor:"pointer",
                          background: on ? "rgba(var(--ff-accent-rgb), .15)" : "rgba(var(--ff-fg), .04)",
                          border: on ? "1px solid var(--ff-c10)" : "1px solid rgba(var(--ff-fg), .12)",
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
              <span style={{ fontSize:"1.5rem" }}><Ic name={sc.iconName as any} size={22} color="var(--ff-c10)" /></span>
              <div><div style={{ fontSize:".95rem", fontWeight:500 }}>{sc.label}</div><div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)" }}>{sc.sub}</div></div>
            </button>
          ))}
          {errors.schedule && <p id="nr-err-schedule" style={s.err}>{errors.schedule}</p>}

          {schedule === "Recurring" && (
            <div style={{ marginTop:".75rem", padding:"1rem", background:"rgba(var(--ff-accent-rgb), .06)", border:"1px solid rgba(var(--ff-accent-rgb), .2)", borderRadius:"10px", display:"flex", flexDirection:"column" as const, gap:"1rem" }}>
              <div>
                <p style={{ ...s.label, marginBottom:".6rem" }}>How often?</p>
                {recurringFrequency !== "seasonal" && recurringFrequency !== "per_km" && (
                  <div style={{ marginBottom:".8rem" }}>
                    <input type="range" min={0} max={SLIDER_STOPS.length - 1} step={1}
                      value={sliderIdx} onChange={e => pickSlider(parseInt(e.target.value, 10))}
                      aria-label="How often"
                      style={{ width:"100%", accentColor:"var(--ff-c10)", cursor:"pointer" }} />
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop: "var(--ff-s1)" }}>
                      {SLIDER_STOPS.map((stop, i) => (
                        <span key={stop} onClick={() => pickSlider(i)}
                          style={{ fontSize:".68rem", cursor:"pointer", textAlign:"center" as const, flex:1,
                            color: i === sliderIdx ? "var(--ff-c10)" : "rgba(var(--ff-muted), .5)",
                            fontWeight: i === sliderIdx ? 600 : 400 }}>
                          {SLIDER_SHORT[stop]}
                        </span>
                      ))}
                    </div>
                    <p style={{ fontSize:".85rem", color:"var(--ff-text)", marginTop: "var(--ff-s2)", fontWeight:500 }}>
                      {freqLabel(SLIDER_STOPS[sliderIdx])}
                    </p>
                  </div>
                )}
                <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                  <button type="button" onClick={() => setRecurringFrequency("seasonal")}
                    style={{ padding:".55rem 1.05rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid",
                      background: recurringFrequency==="seasonal" ? "rgba(var(--ff-accent-rgb), .2)" : "rgba(var(--ff-fg), .04)",
                      borderColor: recurringFrequency==="seasonal" ? "var(--ff-c10)" : "rgba(var(--ff-fg), .12)",
                      color: recurringFrequency==="seasonal" ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)" }}>
                    Seasonal
                  </button>
                  {selectedServices.some(isPerKmService) && (
                    <button type="button" onClick={() => setRecurringFrequency("per_km")}
                      style={{ padding:".55rem 1.05rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid",
                        background: recurringFrequency==="per_km" ? "rgba(var(--ff-accent-rgb), .2)" : "rgba(var(--ff-fg), .04)",
                        borderColor: recurringFrequency==="per_km" ? "var(--ff-c10)" : "rgba(var(--ff-fg), .12)",
                        color: recurringFrequency==="per_km" ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)" }}>
                      Per distance (km)
                    </button>
                  )}
                  {(recurringFrequency==="seasonal" || recurringFrequency==="per_km") && (
                    <button type="button" onClick={() => pickSlider(sliderIdx)}
                      style={{ padding:".55rem 1.05rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", background:"rgba(var(--ff-fg), .04)", color:"rgba(var(--ff-muted), .7)" }}>
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
                        background: prepayPref===n ? "rgba(var(--ff-accent-rgb), .2)" : "rgba(var(--ff-fg), .04)",
                        borderColor: prepayPref===n ? "var(--ff-c10)" : "rgba(var(--ff-fg), .12)",
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
                        style={{ padding:".5rem .9rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .15)", background:"rgba(var(--ff-fg), .05)", color:"rgba(var(--ff-muted), .8)" }}>
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
                    style={{ padding:".55rem 1rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor: newDate ? "pointer" : "default", border:"1px solid var(--ff-c10)", background:"rgba(var(--ff-accent-rgb), .15)", color:"var(--ff-text)", opacity: newDate ? 1 : .5 }}>
                    + Add date
                  </button>
                </div>
                {recurringDates.length > 0 && (
                  <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" as const, marginTop:".6rem" }}>
                    {recurringDates.map(d => (
                      <span key={d} style={{ display:"inline-flex", alignItems:"center", gap:".4rem", padding:".35rem .6rem", borderRadius:"999px", fontSize:".8rem", background:"rgba(var(--ff-accent-rgb), .12)", border:"1px solid rgba(var(--ff-accent-rgb), .3)", color:"var(--ff-text)" }}>
                        {new Date(d + "T00:00:00").toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" })}
                        <button type="button" onClick={() => removeDate(d)} aria-label="Remove date"
                          style={{ border:"none", background:"none", color:"var(--ff-c10)", cursor:"pointer", fontSize:"1rem", lineHeight:1, padding:0 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Approximate location — postal code + area, never a street address.

              ONE QUESTION, NOT TWO. Both parts are load-bearing on the server —
              mask_location() builds the pro-facing string from a postal code AND
              a zone, and list_open_jobs() reads the zone out of the raw text to
              rank in-zone jobs — but only one of them has to be ASKED. The area
              is derived from the FSA and shown back as a tag the client can
              override. Dropping the area instead of deriving it would be the
              silent failure: formatApproxLocation filters empties, so the stored
              string would still be non-empty and pass every blank check, and the
              request would then rank out-of-zone for every contractor forever
              with nothing anywhere saying so.

              The chips did not go away, they demoted to a fallback — shown when
              the client says the guess is wrong, or when the FSA isn't one we
              map. The area is never dropped, only derived.

              "Same as last time" is offered ONLY when the previous request's
              location parses into both halves — see `prevApprox`. A returning
              client whose last request predates this form has a street address
              on file, and re-posting it is precisely what this change removes. */}
          <p style={{ ...s.label, marginTop:"1.75rem" }}>Where is this job? <span style={{ color:"rgba(var(--ff-muted), .4)", textTransform:"none", letterSpacing:0 }}>(postal code &mdash; we'll ask for the address once you've picked a pro)</span></p>
          {prevApprox.text && (
            <button style={{ ...s.addrBtn, ...(locChoice === "last" ? s.addrBtnSel : {}) }} onClick={() => { setLocChoice("last"); setErrors(e => ({ ...e, location:"" })); }}>
              <span><Ic name={locChoice === "last" ? "radio-on" : "radio-off"} size={16} color="var(--ff-c10)" /></span>
              <span>Same as last time — <span style={{ color:"rgba(var(--ff-muted), .6)" }}>{prevApprox.text}</span></span>
            </button>
          )}
          {prevApprox.text && (
            <button style={{ ...s.addrBtn, ...(locChoice === "new" ? s.addrBtnSel : {}) }} onClick={() => { setLocChoice("new"); setErrors(e => ({ ...e, location:"" })); }}>
              <span><Ic name={locChoice === "new" ? "radio-on" : "radio-off"} size={16} color="var(--ff-c10)" /></span>
              <span>Somewhere else</span>
            </button>
          )}
          {enteringNew && (
            <>
              <input
                autoComplete="postal-code" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={7}
                style={{ ...inp, marginTop:".4rem", borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)", letterSpacing:".06em" }}
                placeholder="e.g. T2P 1J9"
                value={postalCode}
                onChange={e => onPostal(e.target.value.toUpperCase())}
              />
              {/* The derived tag. It prints the TOKEN that actually gets stored
                  ("NW Calgary", "Downtown"), not the chip label, so what the
                  client reads here is what the pro will read on the job. */}
              {!showAreaChips && derivedArea && (
                <div style={{ display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" as const, marginTop:".6rem" }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:".35rem", padding:".4rem .75rem", borderRadius:"999px", fontSize:".82rem", fontWeight:500,
                    background:"rgba(var(--ff-accent-rgb), .13)", border:"1px solid rgba(var(--ff-accent-rgb), .45)", color:"var(--ff-text)" }}>
                    {areaToken(derivedArea) || derivedArea}
                  </span>
                  <button type="button" onClick={() => setAreaOverride(true)}
                    style={{ background:"none", border:"none", padding:0, fontFamily:"inherit", fontSize:".8rem", cursor:"pointer", textDecoration:"underline", color:"rgba(var(--ff-muted), .7)" }}>
                    Not right? Pick the area
                  </button>
                </div>
              )}
              {showAreaChips && (
                <>
                  <p style={{ ...s.label, marginTop:"1rem", marginBottom:".5rem" }}>Which part of town?</p>
                  {!derivedArea && (
                    <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:"-.25rem", marginBottom:".55rem", lineHeight:1.5 }}>
                      We don't recognise that postal code, so pick the closest area — it's what decides which pros see your job.
                    </p>
                  )}
                  <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                    {AREAS.map(a => {
                      const on = area === a;
                      return (
                        <button key={a} type="button" onClick={() => { setArea(on ? "" : a); setErrors(e => ({ ...e, location:"" })); }}
                          style={{ padding:".55rem .9rem", borderRadius:"999px", fontFamily:"inherit", fontSize:".85rem", fontWeight: on ? 500 : 400, cursor:"pointer",
                            background: on ? "rgba(var(--ff-accent-rgb), .15)" : "rgba(var(--ff-fg), .04)",
                            border: on ? "1px solid var(--ff-c10)" : "1px solid rgba(var(--ff-fg), .12)",
                            color: on ? "var(--ff-text)" : "rgba(var(--ff-muted), .8)" }}>
                          {a}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
          <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .55)", marginTop:".55rem", lineHeight:1.5 }}>
            Pros bidding on your job see the area and postal code only. Your full address goes to the one pro you choose, and not before.
          </p>
          {errors.location && <p id="nr-err-location" style={s.err}>{errors.location}</p>}

          {/* Vehicle (only for vehicle services) */}
          {isVehicle && (
            <>
              <p style={{ ...s.label, marginTop:"1.75rem" }}>Which vehicle?</p>
              {savedVehicles.map(v => {
                const label = [v.year, v.make, v.model].filter(Boolean).join(" ") || "Saved vehicle";
                return (
                  <button key={v.id} style={{ ...s.addrBtn, ...(vehChoice === v.id ? s.addrBtnSel : {}) }} onClick={() => setVehChoice(v.id)}>
                    <span><Ic name={vehChoice === v.id ? "radio-on" : "radio-off"} size={16} color="var(--ff-c10)" /></span>
                    <span>{label}</span>
                  </button>
                );
              })}
              <button style={{ ...s.addrBtn, ...(vehChoice === "new" ? s.addrBtnSel : {}) }} onClick={() => setVehChoice("new")}>
                <span><Ic name={vehChoice === "new" ? "radio-on" : "radio-off"} size={16} color="var(--ff-c10)" /></span>
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
                    <input type="checkbox" checked={saveNewVehicle} onChange={e => setSaveNewVehicle(e.target.checked)} style={{ width:"15px", height:"15px", accentColor:"var(--ff-c10)" }} />
                    Save this vehicle for next time
                  </label>
                </>
              )}
            </>
          )}

          {isBusiness && (
            <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".88rem", color:"rgba(var(--ff-fg), .85)", marginTop:"1rem" }}>
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} style={{ width:"16px", height:"16px", accentColor:"var(--ff-c10)" }} />
              This is recurring / scheduled maintenance
            </label>
          )}

          {/* What this usually costs — read-only. The client names no number. */}
          <BudgetPicker services={selectedServices} pricing={pricing} />

          <div style={{ display:"flex", alignItems:"flex-start", gap:".75rem", marginTop:"1.5rem", padding:"1rem", background:"rgba(var(--ff-fg), .03)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
            <input
              type="checkbox"
              id="nr-agree-terms"
              checked={agreedToTerms}
              onChange={e => { setAgreedToTerms(e.target.checked); if (e.target.checked) setSubmitError(""); }}
              style={{ marginTop:"2px", accentColor:"var(--ff-c10)", width:"16px", height:"16px", flexShrink:0, cursor:"pointer" }}
            />
            <label htmlFor="nr-agree-terms" style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, cursor:"pointer", fontWeight:300 }}>
              I agree to Freddy Fix It&rsquo;s{" "}
              <a href="/user-agreement" target="_blank" rel="noopener noreferrer" style={{ color:"var(--ff-c10)", textDecoration:"none" }}>User Agreement</a>
              {" "}and{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"var(--ff-c10)", textDecoration:"none" }}>Privacy Policy</a>.
            </label>
          </div>
          </>)}

          {/* Deliberately OUTSIDE the step blocks: the photo-size guard on screen 1
              and submit() on screen 4 both write here. */}
          {submitError &&<div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginTop:"1rem" }}>{submitError}</div>}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .1)" }} onClick={back}>{step === 1 ? "← Dashboard" : "← Back"}</button>
          {step < TOTAL
            ? <button style={{ ...s.navBtn, background:"var(--ff-c10)", color:"#fff" }} onClick={next}>Next →</button>
            : <button style={{ ...s.navBtn, background:"linear-gradient(135deg,var(--ff-c10),#f09020)", color:"#fff", opacity: submitting ? .6 : 1 }} onClick={() => submit()} disabled={submitting}>
                {submitting ? <><span className="ff-btn-spin" aria-hidden="true" />Submitting…</> : "Submit Request →"}
              </button>
          }
        </div>
      </div>

      {/* The multi-trade split prompt. Both answers re-enter submit() with an
          explicit verdict, so the detector cannot run a second time and the
          dialog cannot re-open on the same press. */}
      <SplitJobDialog
        parts={splitSuggestion}
        onKeepOne={() => { setSplitSuggestion(null); submit("one"); }}
        onSplit={parts => { setSplitSuggestion(null); submit(parts); }}
      />
    </div>
  );
}
