import { Ic } from "@/components/Ic";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { AVAIL_DAYS, WEEKDAYS, TIME_OPTIONS, DEFAULT_START, DEFAULT_END } from "@/lib/availability";
import { trackEvent } from "@/lib/analytics";
import OAuthButtons from "@/components/OAuthButtons";
import GuideBubble from "@/components/GuideBubble";

const SPECIALTIES = [
  { iconName: "wrench", label: "General Repairs" },
  { iconName: "pipe", label: "Plumbing" },
  { iconName: "zap", label: "Electrical" },
  { iconName: "thermometer", label: "HVAC" },
  { iconName: "hammer", label: "Carpentry" },
  { iconName: "paint-roller", label: "Painting" },
  { iconName: "layers", label: "Drywall" },
  { iconName: "layers", label: "Flooring / Tile" },
  { iconName: "circle-dashed", label: "Tire Swap / Rotation" },
  { iconName: "car", label: "Oil Change" },
  { iconName: "battery", label: "Battery / Brakes" },
  { iconName: "car", label: "Vehicle Maintenance" },
  { iconName: "tree", label: "Landscaping" },
  { iconName: "snowflake", label: "Snow Removal" },
  { iconName: "cloud-rain", label: "Gutters" },
  { iconName: "door", label: "Windows & Doors" },
  { iconName: "building", label: "Siding & Roofing" },
  { iconName: "garage-door", label: "Garage" },
  { iconName: "trowel", label: "Concrete / Masonry" },
  { iconName: "wind", label: "Air Conditioning" },
  { iconName: "sparkles", label: "Cleaning Services" },
  { iconName: "key", label: "Locksmith" },
  { iconName: "refrigerator", label: "Appliance Repair / Install" },
];

const AREAS = ["NW","NE","SW","SE","Downtown / Beltline","Airdrie","Cochrane","Chestermere"];

// Primary work classification. This decides which credentials we actually
// require: only regulated trades (electrical, gas, plumbing, HVAC) need a
// provincial licence; for moving/assembly/cleaning a licence isn't required
// and insurance is recommended rather than mandatory.
const WORK_TYPES = [
  { id:"regulated",     label:"Regulated trade",             sub:"Electrical, gas, plumbing, HVAC — needs a provincial certificate", licence:"required",    insurance:"required"    },
  { id:"skilled",       label:"Skilled trade",               sub:"Carpentry, drywall, painting, flooring, roofing, concrete, appliance install", licence:"optional", insurance:"required" },
  { id:"handyman",      label:"General handyman & repairs",  sub:"Multi-skill repairs and small jobs around the home",               licence:"optional",    insurance:"recommended" },
  { id:"moving",        label:"Moving, assembly & delivery", sub:"Furniture & appliance moving, assembly, hauling — no trade licence needed", licence:"none", insurance:"recommended" },
  { id:"home_services", label:"Cleaning, yard & seasonal",   sub:"Cleaning, landscaping, snow removal, gutters",                     licence:"none",        insurance:"recommended" },
];

const STEP_TITLES = ["Your Details", "Your Specialties", "Service Area", "Availability", "Your Trade", "Credentials", "Profile Photo", "Documents"];
const STEP_SUBS   = [
  "Just the basics — takes about a minute",
  "What services do you offer? Select all that apply",
  "Which areas do you cover?",
  "When are you generally available?",
  "What best describes your work? This sets what we'll need from you",
  "Tell us about your qualifications",
  "Add a profile photo (optional)",
  "Upload now, or skip and add them later from your dashboard",
];

// Plain-language "Freddy walks you through it" copy, one per step (see GuideBubble).
const CONTRACTOR_GUIDE: { message: string; why?: string; tip?: string }[] = [
  { message: "Hi, I'm Freddy. I'll walk you through this step by step — it takes about two minutes, and you can stop and pick up later. Let's start with the basics.",
    why: "Your email is your login and how we send you new job leads.",
    tip: "Phone is optional — add it if you'd like clients to reach you faster." },
  { message: "Now tell me what kind of work you do. Tap everything you're comfortable taking on — you can change this anytime.",
    why: "We only show you jobs that match your specialties, so your leads stay relevant." },
  { message: "Which parts of Calgary do you want to work in? Choose every area you'll travel to.",
    why: "Jobs inside your areas float to the top of your list." },
  { message: "When are you usually free to work? A rough guide is perfectly fine.",
    why: "Clients see this so they know when to expect you." },
  { message: "What best describes your work? This one matters — it decides what paperwork we'll need from you next.",
    why: "Regulated trades (like electrical or gas) need a certificate; general work needs less." },
  { message: "Tell me about your qualifications — licence, insurance, WCB. Just fill in what applies to you.",
    why: "This builds trust with clients and is required for some trades." },
  { message: "Add a friendly photo of yourself or your logo. It's optional, but pros with a photo get picked more often.",
    why: "Clients feel more comfortable hiring someone they can see." },
  { message: "Last step — upload your documents. You can snap a photo with your phone, or add them later from your dashboard.",
    why: "We verify these so clients know you're the real deal." },
];

type DocFiles = { insurance: File|null; wcb: File|null; certification: File|null; gov_id: File|null };

// Format a North-American phone as the user types: 403-555-0100.
function fmtPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3) + "-" + d.slice(3);
  return d.slice(0,3) + "-" + d.slice(3,6) + "-" + d.slice(6);
}

export default function ContractorOnboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const TOTAL = 8;
  const [form, setForm] = useState({ firstName:"", lastName:"", email:"", phone:"", companyName:"", password:"", yearsOfExperience:"", photoUrl:"", workType:"", licensed:false, licenseNumber:"", hasInsurance:false, insuranceProvider:"", insuranceExpiry:"", hasWcb:false, workReferences:"" });
  const [selectedSpec,  setSelectedSpec]  = useState<string[]>([]);
  const [selectedArea,  setSelectedArea]  = useState<string[]>([]);
  const [availDays, setAvailDays] = useState<string[]>([...WEEKDAYS]);
  const [availStart, setAvailStart] = useState<string>(DEFAULT_START);
  const [availEnd, setAvailEnd]     = useState<string>(DEFAULT_END);
  const [errors, setErrors]   = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [docFiles, setDocFiles] = useState<DocFiles>({ insurance: null, wcb: null, certification: null, gov_id: null });
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // If the visitor is already signed in (e.g. they just used Google/Apple), we
  // skip account creation and simply complete their contractor profile.
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setAuthedUserId(data.user.id);
        setForm(f => ({ ...f, email: data.user!.email ?? f.email }));
      }
    });
  }, []);

  // Restore a saved draft so a contractor who dropped off mid-signup (e.g. an
  // upload failed) can pick up where they left off. Files can't be persisted,
  // and the password is never stored.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ff_contractor_draft");
      if (raw) {
        const d = JSON.parse(raw);
        if (d.form) setForm(f => ({ ...f, ...d.form, password: "", email: d.form.email || f.email }));
        if (Array.isArray(d.selectedSpec)) setSelectedSpec(d.selectedSpec);
        if (Array.isArray(d.selectedArea)) setSelectedArea(d.selectedArea);
        if (Array.isArray(d.availDays)) setAvailDays(d.availDays);
        if (d.availStart) setAvailStart(d.availStart);
        if (d.availEnd) setAvailEnd(d.availEnd);
        if (typeof d.step === "number" && d.step >= 1 && d.step <= TOTAL) setStep(d.step);
        setRestored(true);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || success || verifyEmail) return;
    try {
      localStorage.setItem("ff_contractor_draft", JSON.stringify({
        form: { ...form, password: "" }, selectedSpec, selectedArea,
        availDays, availStart, availEnd, step,
      }));
    } catch {}
  }, [hydrated, success, verifyEmail, form, selectedSpec, selectedArea, availDays, availStart, availEnd, step]);

  const wt = WORK_TYPES.find(w => w.id === form.workType);
  const insuranceRequired = wt?.insurance === "required";
  // Shared validation for credential/document uploads: PDF or any image
  // (incl. iPhone HEIC/HEIF), max 10MB. Returns an error string or null.
  const docFileError = (f: File): string | null => {
    const t = (f.type || "").toLowerCase();
    const n = f.name.toLowerCase();
    const okType = t.startsWith("image/") || t === "application/pdf" || /\.(pdf|jpe?g|png|webp|gif|heic|heif)$/.test(n);
    if (!okType) return "Please upload a PDF or a photo (JPG, PNG, HEIC). Other file types aren't accepted.";
    if (f.size > 10 * 1024 * 1024) return "File must be under 10MB. Try a smaller photo or PDF.";
    return null;
  };

  const setF = (key: string, val: string | number) => { setForm(f => ({ ...f, [key]: val })); setErrors(e => ({ ...e, [key]: "" })); };
  const setFB = (key: string, val: boolean) => { setForm(f => ({ ...f, [key]: val })); };
  const toggleSpec  = (l: string) => { setSelectedSpec(prev  => prev.includes(l)  ? prev.filter(x => x !== l)  : [...prev, l]);  setErrors(e => ({ ...e, spec: "" })); };
  const toggleArea  = (z: string) => { setSelectedArea(prev  => prev.includes(z)  ? prev.filter(x => x !== z)  : [...prev, z]);  setErrors(e => ({ ...e, area: "" })); };
  const toggleDay = (d: string) => { setAvailDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]); setErrors(e => ({ ...e, avail: "" })); };
  const setDays = (days: string[]) => { setAvailDays(days); setErrors(e => ({ ...e, avail: "" })); };

  const validate = () => {
    const errs: Record<string,string> = {};
    if (step === 1) {
      if (!form.firstName.trim()) errs.firstName = "Required";
      if (!form.lastName.trim())  errs.lastName  = "Required";
      if (!authedUserId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Valid email required";
      if (form.phone.trim() && form.phone.replace(/\D/g,"").length < 10) errs.phone = "Enter a 10-digit phone or leave it blank";
      if (!authedUserId && form.password.length < 8) errs.password = "Minimum 8 characters";
    }
    if (step === 2 && selectedSpec.length === 0)  errs.spec  = "Select at least one specialty";
    if (step === 3 && selectedArea.length === 0)  errs.area  = "Select at least one area";
    if (step === 4) {
      if (availDays.length === 0) errs.avail = "Pick at least one day you're available";
      else if (availEnd <= availStart) errs.avail = "End time must be after the start time";
    }
    if (step === 5 && !form.workType)             errs.workType = "Select what best describes your work";
    if (step === 8) {
      if (!docFiles.gov_id) errs.docs = "Upload your government-issued photo ID";
      else if (insuranceRequired && (!docFiles.insurance || !docFiles.wcb)) errs.docs = "Upload your insurance and WCB certificates";
      else if (wt?.licence === "required" && !docFiles.certification) errs.docs = "Upload your trade certification";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validate()) { setStep(s => s + 1); window.scrollTo(0,0); } };
  const back = () => { if (step === 1) setLocation("/"); else { setStep(s => s - 1); window.scrollTo(0,0); } };

  const handleSubmit = async () => {
    if (!agreedToTerms) { setSubmitError("You must agree to the User Agreement and Privacy Policy to continue."); return; }
    setLoading(true); setSubmitError("");
    try {
      // All onboarding answers are passed as signup metadata so a database
      // trigger can create the profile + contractor row even when email
      // confirmation is on (no session is returned until the email is verified).
      const metadata: Record<string, any> = {
        role: "contractor",
        first_name: form.firstName, last_name: form.lastName, phone: form.phone,
        company_name: form.companyName,
        specialties: selectedSpec,
        service_area: selectedArea,
        availability: { days: availDays, start: availStart, end: availEnd },
        work_type: form.workType,
        years_of_experience: form.yearsOfExperience,
        licensed: form.licensed, license_number: form.licenseNumber,
        has_liability_insurance: form.hasInsurance, insurance_provider: form.insuranceProvider,
        insurance_expiry: form.insuranceExpiry, has_wcb: form.hasWcb,
        work_references: form.workReferences,
      };

      let userId = authedUserId;
      if (!userId) {
        // Block duplicate accounts (client or contractor) by email or phone.
        try {
          const { data: avail } = await supabase.rpc("check_signup_availability", { p_email: form.email, p_phone: form.phone });
          if ((avail as any)?.email_taken) { setSubmitError("An account with this email already exists. Please sign in instead."); window.scrollTo(0,0); setLoading(false); return; }
          if ((avail as any)?.phone_taken) { setSubmitError("An account with this phone number already exists. Please sign in, or use a different number."); window.scrollTo(0,0); setLoading(false); return; }
        } catch {}
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: metadata, emailRedirectTo: `${window.location.origin}/auth/callback?role=contractor` },
        });
        if (authErr) throw authErr;
        if (!authData.user) throw new Error("Account creation failed.");
        if (((authData.user.identities?.length) ?? 0) === 0) { setSubmitError("An account with this email already exists. Please sign in instead."); window.scrollTo(0,0); setLoading(false); return; }
        // Weekly pro-tips opt-in (CASL express consent — checkbox is never pre-checked).
        if (newsletterOptIn) {
          try { await supabase.rpc("newsletter_subscribe", { p_email: form.email, p_audience: "contractor", p_name: form.firstName, p_source: "signup_checkbox" }); } catch {}
        }
        userId = authData.user.id;
        // No session => email confirmation is required. The trigger has already
        // saved their profile + contractor details; show the verify screen.
        if (!authData.session) { try { localStorage.removeItem("ff_contractor_draft"); } catch {} trackEvent("sign_up", { method: "contractor" }); setVerifyEmail(true); window.scrollTo(0,0); setLoading(false); return; }
      } else {
        // Already signed in (OAuth): set their role so the trigger's default doesn't stick.
        await supabase.from("profiles").update({ role: "contractor", first_name: form.firstName, last_name: form.lastName, phone: form.phone }).eq("id", userId);
      }
      let photoPublicUrl: string | null = null;
      if (photoFile) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const filePath = userId + "/avatar." + ext;
        const { error: upErr } = await supabase.storage.from("contractor-photos").upload(filePath, photoFile, { upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("contractor-photos").getPublicUrl(filePath);
          photoPublicUrl = pub?.publicUrl ?? null;
        }
      }
      // Upload verification documents
      const docUrls: Record<string, string> = {};
      const docKeys: Array<keyof DocFiles> = ["insurance", "wcb", "certification", "gov_id"];
      for (const key of docKeys) {
        const file = docFiles[key];
        if (!file) continue;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${userId}/${key}.${ext}`;
        const { error: docErr } = await supabase.storage.from("contractor-docs").upload(path, file, { upsert: true });
        if (!docErr) docUrls[key] = path;
      }

      await supabase.from("contractors").upsert({ id: userId, company_name: form.companyName || null, specialties: selectedSpec, years_of_experience: form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience), service_area: selectedArea, availability: { days: availDays, start: availStart, end: availEnd }, work_type: form.workType || null, photo_url: photoPublicUrl, licensed: form.licensed, license_number: form.licenseNumber || null, has_liability_insurance: form.hasInsurance, insurance_provider: form.insuranceProvider || null, insurance_expiry: form.insuranceExpiry || null, has_wcb: form.hasWcb, work_references: form.workReferences || null, status: "pending", doc_urls: docUrls });

      // Trigger automated document review (non-blocking)
      if (Object.keys(docUrls).length > 0) {
        supabase.functions.invoke("review-contractor", { body: { contractor_id: userId } }).catch(() => {});
      }

      try { localStorage.removeItem("ff_contractor_draft"); } catch {}
      trackEvent("sign_up", { method: "contractor" });
      setSuccess(true); window.scrollTo(0,0);
    } catch (err: any) {
      setSubmitError(err.message?.includes("already registered") ? "An account with this email already exists. Please sign in instead." : err.message ?? "Something went wrong.");
    } finally { setLoading(false); }
  };

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".95rem", outline:"none", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"var(--ff-bg)", backgroundImage:"linear-gradient(rgba(var(--ff-bg-rgb), 0.90), rgba(var(--ff-bg-rgb), 0.95)), radial-gradient(ellipse 50% 32% at 18% -4%, rgba(234,107,20,0.30) 0%, transparent 68%), radial-gradient(ellipse 55% 36% at 84% -8%, rgba(234,107,20,0.18) 0%, transparent 70%), repeating-linear-gradient(45deg, transparent 0 26px, rgba(var(--ff-fg), 0.022) 26px, rgba(var(--ff-fg), 0.022) 27px), repeating-linear-gradient(-45deg, transparent 0 26px, rgba(var(--ff-fg), 0.018) 26px, rgba(var(--ff-fg), 0.018) 27px), url(\"https://images.unsplash.com/photo-1685320198649-781e83a61de4?auto=format&fit=crop&w=1600&q=65\")", backgroundSize:"auto, auto, auto, auto, auto, cover", backgroundPosition:"center, center, center, center, center, center", backgroundAttachment:"fixed", padding:"3rem 1rem 4rem", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    inner: { maxWidth:"580px", margin:"0 auto" },
    card: { background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"2rem" },
    label: { display:"block", fontSize:".78rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .6)", marginBottom:".6rem" },
    err: { fontSize:".78rem", color:"var(--ff-danger)", marginTop:".35rem" },
    chip: { display:"flex", alignItems:"center", gap:".5rem", padding:".75rem 1rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px", color:"rgba(var(--ff-muted), .75)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", textAlign:"left" as const, width:"100%" },
    chipSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
    availBtn: { display:"flex", alignItems:"center", gap:"1rem", padding:"1rem 1.25rem", background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"10px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".75rem" },
    availBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"var(--ff-text)" },
    navBtn: { flex:1, padding:".85rem 1.5rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:".4rem" },
  };

  if (verifyEmail) return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ ...s.inner, textAlign:"center", paddingTop:"4rem" }}>
        <div style={{ width:"72px", height:"72px", background:"rgba(234,107,20,.15)", border:"2px solid rgba(234,107,20,.4)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 2rem" }}>
          <Ic name="mail" size={32} color="#ea6b14" />
        </div>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.6rem", letterSpacing:".06em", marginBottom:".5rem" }}>Verify Your <span style={{ color:"#ea6b14" }}>Email</span></h1>
        <p style={{ color:"rgba(var(--ff-muted), .7)", marginBottom:".5rem", lineHeight:1.6 }}>We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account and sign in.</p>
        <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".85rem", marginBottom:"2rem", fontWeight:300 }}>Your details are saved. After verifying, sign in and upload any remaining documents from your dashboard.</p>
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
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"3rem", letterSpacing:".06em", marginBottom:".5rem" }}>Welcome to <span style={{ color:"#ea6b14" }}>the Team!</span></h1>
        <p style={{ color:"rgba(var(--ff-muted), .65)", marginBottom:"2rem" }}>Your profile has been submitted. We'll review it within 24 hours.</p>
        <div style={{ display:"flex", gap:".75rem", justifyContent:"center" }}>
          <button style={{ ...s.navBtn, background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"1px solid rgba(var(--ff-fg), .1)" }} onClick={() => setLocation("/")}>← Home</button>
          <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={() => setLocation("/contractor-dashboard")}>My Dashboard →</button>
        </div>
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
        <p style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".15em", color:"#ea6b14", marginBottom:".4rem" }}>Contractor Registration · Step {step} of {TOTAL}</p>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:".4rem" }}>{STEP_TITLES[step-1]}</h1>
        <p style={{ color:"rgba(var(--ff-muted), .6)", fontSize:".9rem", marginBottom:".5rem" }}>{STEP_SUBS[step-1]}</p>
        <p style={{ color:"rgba(var(--ff-muted), .4)", fontSize:".8rem", marginBottom:"2rem" }}>Takes about 2 minutes · free to join, no monthly fees</p>
        <div style={{ display:"flex", gap:"6px", marginBottom:"2.5rem" }}>
          {Array.from({length:TOTAL},(_,i) => (
            <div key={i} style={{ height:"3px", flex:1, borderRadius:"99px", background: i+1===step ? "#ea6b14" : i+1<step ? "rgba(234,107,20,.45)" : "rgba(var(--ff-fg), .1)" }} />
          ))}
        </div>

        <GuideBubble step={step} total={TOTAL}
          message={CONTRACTOR_GUIDE[step-1]?.message || ""}
          why={CONTRACTOR_GUIDE[step-1]?.why}
          tip={CONTRACTOR_GUIDE[step-1]?.tip} />

        {restored && (
          <div style={{ display:"flex", alignItems:"center", gap:".75rem", background:"rgba(234,107,20,.08)", border:"1px solid rgba(234,107,20,.25)", borderRadius:"8px", padding:".7rem 1rem", marginBottom:"1.5rem", fontSize:".82rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>
            <span style={{ flex:1 }}>We saved your progress — pick up where you left off. You'll just need to re-attach any files.</span>
            <button onClick={() => { try { localStorage.removeItem("ff_contractor_draft"); } catch {} window.location.reload(); }} style={{ background:"none", border:"none", color:"#ea6b14", cursor:"pointer", fontFamily:"inherit", fontSize:".78rem", textDecoration:"underline", flexShrink:0 }}>Start over</button>
          </div>
        )}

        <div style={s.card}>
          {/* Step 1 — Contact */}
          {step === 1 && (
            <div>
              {!authedUserId && (
                <>
                  <OAuthButtons role="contractor" label="sign up in one tap with" />
                  <p style={{ textAlign:"center", fontSize:".78rem", color:"rgba(var(--ff-muted), .4)", margin:"1.25rem 0" }}>or with your email</p>
                </>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>First Name</label>
                  <input autoComplete="given-name" style={{ ...inp, borderColor: errors.firstName ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="Mike" value={form.firstName} onChange={e => setF("firstName",e.target.value)} />
                  {errors.firstName && <p style={s.err}>{errors.firstName}</p>}
                </div>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>Last Name</label>
                  <input autoComplete="family-name" style={{ ...inp, borderColor: errors.lastName ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="Taylor" value={form.lastName} onChange={e => setF("lastName",e.target.value)} />
                  {errors.lastName && <p style={s.err}>{errors.lastName}</p>}
                </div>
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Email</label>
                <input autoComplete="email" style={{ ...inp, borderColor: errors.email ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} type="email" placeholder="mike@email.com" value={form.email} onChange={e => setF("email",e.target.value)} />
                {errors.email && <p style={s.err}>{errors.email}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Phone <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                <input autoComplete="tel" style={{ ...inp, borderColor: errors.phone ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} type="tel" placeholder="403-555-0100" value={form.phone} onChange={e => setF("phone",fmtPhone(e.target.value))} />
                {errors.phone && <p style={s.err}>{errors.phone}</p>}
              </div>
              {!authedUserId && (
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>Password (for your account)</label>
                  <input autoComplete="new-password" style={{ ...inp, borderColor: errors.password ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} type="password" placeholder="Min 8 characters" value={form.password} onChange={e => setF("password",e.target.value)} />
                  {errors.password && <p style={s.err}>{errors.password}</p>}
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>Years of Experience <span style={{ color:"rgba(var(--ff-muted), .45)", fontWeight:300 }}>(optional)</span></label>
                  <input style={inp} type="number" min={0} max={50} value={form.yearsOfExperience} placeholder="e.g. 5" onChange={e => setF("yearsOfExperience", e.target.value)} />
                </div>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>Company <span style={{ color:"rgba(var(--ff-muted), .45)", fontWeight:300 }}>(optional)</span></label>
                  <input style={inp} placeholder="Kelly Home Repairs" value={form.companyName} onChange={e => setF("companyName",e.target.value)} />
                </div>
              </div>
              <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .4)", fontWeight:300 }}>Free account — no monthly fees, no upfront cost.</p>
            </div>
          )}

          {/* Step 2 — Specialties */}
          {step === 2 && (
            <div>
              <p style={s.label}>Select All That Apply</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".7rem" }}>
                {SPECIALTIES.map(sp => (
                  <button key={sp.label} style={{ ...s.chip, ...(selectedSpec.includes(sp.label) ? s.chipSel : {}) }} onClick={() => toggleSpec(sp.label)}>
                    <span style={{ fontSize:"1.1rem", flexShrink:0 }}><Ic name={sp.iconName as any} size={18} color="#ea6b14" style={{ marginRight:6, flexShrink:0 }} /></span>
                    <span>{sp.label}</span>
                    {selectedSpec.includes(sp.label) && <span style={{ marginLeft:"auto", color:"#ea6b14" }}>✓</span>}
                  </button>
                ))}
              </div>
              {errors.spec && <p style={s.err}>{errors.spec}</p>}
              {selectedSpec.length > 0 && <p style={{ fontSize:".78rem", color:"#ea6b14", marginTop:".75rem" }}>✓ {selectedSpec.length} specialt{selectedSpec.length > 1 ? "ies" : "y"} selected</p>}

            </div>
          )}

          {/* Step 3 — Service Area */}
          {step === 3 && (
            <div>
              <p style={s.label}>Zones You Serve</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".7rem" }}>
                {AREAS.map(z => (
                  <button key={z} style={{ ...s.chip, ...(selectedArea.includes(z) ? s.chipSel : {}) }} onClick={() => toggleArea(z)}>
                    <span><Ic name="map-pin" size={14} color="#ea6b14" /></span><span>{z}</span>
                    {selectedArea.includes(z) && <span style={{ marginLeft:"auto", color:"#ea6b14" }}>✓</span>}
                  </button>
                ))}
              </div>
              {errors.area && <p style={s.err}>{errors.area}</p>}
              {selectedArea.length > 0 && <p style={{ fontSize:".78rem", color:"#ea6b14", marginTop:".75rem" }}>✓ {selectedArea.length} area{selectedArea.length > 1 ? "s" : ""} selected</p>}
            </div>
          )}

          {/* Step 4 — Availability: which days + typical hours */}
          {step === 4 && (() => {
            const isWeekdays = availDays.length === 5 && WEEKDAYS.every(d => availDays.includes(d));
            const isEvery = availDays.length === 7;
            const presetBtn = (sel: boolean) => ({
              padding:".5rem 1rem", borderRadius:"99px", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem", fontWeight:600,
              border: sel ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .14)",
              background: sel ? "#ea6b14" : "rgba(var(--ff-fg), .05)", color: sel ? "#fff" : "var(--ff-text)",
            });
            return (
            <div>
              <p style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .5)", marginBottom:"1.25rem", fontWeight:300, lineHeight:1.6 }}>
                Which days do you usually work? You can fine-tune this anytime from your dashboard.
              </p>
              <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginBottom:"1rem" }}>
                <button type="button" onClick={() => setDays([...WEEKDAYS])} style={presetBtn(isWeekdays)}>Weekdays</button>
                <button type="button" onClick={() => setDays([...AVAIL_DAYS])} style={presetBtn(isEvery)}>Every day</button>
              </div>
              <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .55)", marginBottom:".6rem" }}>
                Tap the days you're available
              </div>
              <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                {AVAIL_DAYS.map(day => {
                  const on = availDays.includes(day);
                  return (
                    <button type="button" key={day} onClick={() => toggleDay(day)} aria-label={day}
                      style={{ display:"flex", alignItems:"center", gap:".35rem", padding:".55rem .9rem", borderRadius:"99px", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem", fontWeight:600,
                        border: on ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .14)",
                        background: on ? "rgba(234,107,20,.16)" : "rgba(var(--ff-fg), .05)",
                        color: on ? "#ea6b14" : "rgba(var(--ff-muted), .6)" }}>
                      {on && <span style={{ fontSize:".78rem" }}>✓</span>}{day.slice(0,3)}
                    </button>
                  );
                })}
              </div>

              {availDays.length > 0 && (
                <div style={{ marginTop:"1.4rem", paddingTop:"1.3rem", borderTop:"1px solid rgba(var(--ff-fg), .07)" }}>
                  <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .55)", marginBottom:".7rem" }}>
                    What hours on those days?
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:".6rem", flexWrap:"wrap" as const }}>
                    <select value={availStart} onChange={e => { setAvailStart(e.target.value); setErrors(er => ({ ...er, avail: "" })); }}
                      style={{ ...inp, width:"auto", minWidth:"120px", cursor:"pointer" }}>
                      {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <span style={{ color:"rgba(var(--ff-muted), .6)", fontSize:".85rem" }}>to</span>
                    <select value={availEnd} onChange={e => { setAvailEnd(e.target.value); setErrors(er => ({ ...er, avail: "" })); }}
                      style={{ ...inp, width:"auto", minWidth:"120px", cursor:"pointer" }}>
                      {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {errors.avail && <p style={s.err}>{errors.avail}</p>}
            </div>
            );
          })()}

          {/* Step 5 — Trade / work type */}
          {step === 5 && (
            <div>
              <p style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"1.5rem", fontWeight:300, lineHeight:1.6 }}>
                Pick the option that best fits most of your work. This is how we know what to ask for next — for example, a furniture mover or assembler doesn&rsquo;t need a trade licence, while electrical or plumbing work does.
              </p>
              {WORK_TYPES.map(w => (
                <button key={w.id} style={{ ...s.availBtn, ...(form.workType === w.id ? s.availBtnSel : {}) }} onClick={() => { setForm(f => ({ ...f, workType: w.id })); setErrors(e => ({ ...e, workType: "" })); }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:".95rem", fontWeight:500 }}>{w.label}</div>
                    <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)", marginTop:".15rem", lineHeight:1.45 }}>{w.sub}</div>
                  </div>
                  {form.workType === w.id && <span style={{ color:"#ea6b14", fontSize:"1.1rem", flexShrink:0 }}>✓</span>}
                </button>
              ))}
              {errors.workType && <p style={s.err}>{errors.workType}</p>}
              {wt && (
                <div style={{ background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.15)", borderRadius:"8px", padding:".9rem 1rem", fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, marginTop:"1rem" }}>
                  {wt.licence === "required"
                    ? "This is a regulated trade in Alberta — we'll ask for your provincial trade licence and proof of liability insurance."
                    : wt.licence === "optional"
                      ? "No provincial trade licence is required to sign up. Liability insurance is expected for this kind of work; a trade certificate is optional but helps you stand out."
                      : "No trade licence is required for this kind of work. Liability insurance is recommended — it protects you and reassures clients — but it's optional and you can add it later."}
                </div>
              )}
            </div>
          )}

          {/* Step 6 — Credentials */}
          {step === 6 && (
            <div>
              <p style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"1.5rem", fontWeight:300, lineHeight:1.6 }}>
                {wt && wt.licence === "none"
                  ? "Your work isn't a licensed trade, so a licence isn't required. Let clients know if you carry insurance — it's optional here, but it builds trust."
                  : "Let clients know what you bring to the table. You can update any of this later from your dashboard."}
              </p>
              <label style={{ display:"flex", alignItems:"center", gap:".6rem", cursor:"pointer", fontSize:".9rem", color:"rgba(var(--ff-muted), .85)" }}>
                <input type="checkbox" checked={form.licensed} onChange={e=>setFB("licensed",e.target.checked)} style={{ width:"18px", height:"18px", accentColor:"#ea6b14", cursor:"pointer", flexShrink:0 }} />
                <span>I'm a licensed contractor</span>
              </label>
              {form.licensed && <input style={{ ...inp, marginTop:".5rem" }} placeholder="License number" value={form.licenseNumber} onChange={e=>setF("licenseNumber",e.target.value)} />}
              <label style={{ display:"flex", alignItems:"center", gap:".6rem", cursor:"pointer", fontSize:".9rem", color:"rgba(var(--ff-muted), .85)", marginTop:".9rem" }}>
                <input type="checkbox" checked={form.hasInsurance} onChange={e=>setFB("hasInsurance",e.target.checked)} style={{ width:"18px", height:"18px", accentColor:"#ea6b14", cursor:"pointer", flexShrink:0 }} />
                <span>I carry liability insurance</span>
              </label>
              {form.hasInsurance && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".75rem", marginTop:".5rem" }}>
                    <input style={inp} placeholder="Insurance provider" value={form.insuranceProvider} onChange={e=>setF("insuranceProvider",e.target.value)} />
                    <input style={inp} placeholder="Expiry (e.g. 2026-12)" value={form.insuranceExpiry} onChange={e=>setF("insuranceExpiry",e.target.value)} />
                  </div>
                  <div style={{ marginTop:".6rem" }}>
                    <label style={{
                      display:"flex", alignItems:"center", gap:".75rem",
                      padding:".75rem 1rem",
                      background: docFiles.insurance ? "rgba(234,107,20,.08)" : "rgba(var(--ff-fg), .04)",
                      border: `1px solid ${docFiles.insurance ? "rgba(234,107,20,.4)" : "rgba(var(--ff-fg), .1)"}`,
                      borderRadius:"8px", cursor:"pointer", transition:"all .2s",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={docFiles.insurance ? "#ea6b14" : "rgba(var(--ff-muted), .5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span style={{ fontSize:".88rem", color: docFiles.insurance ? "#ea6b14" : "rgba(var(--ff-muted), .6)", flex:1 }}>
                        {docFiles.insurance ? docFiles.insurance.name : "Upload insurance certificate — or snap a photo (PDF/JPG/PNG, max 10MB)"}
                      </span>
                      {docFiles.insurance && <span style={{ color:"#22c55e", fontSize:"1rem" }}>✓</span>}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={e => {
                          const f = e.target.files?.[0] ?? null;
                          if (f) { const err = docFileError(f); if (err) { setSubmitError(err); e.target.value=""; return; } }
                          setDocFiles(prev => ({ ...prev, insurance: f }));
                          setSubmitError("");
                        }}
                        style={{ display:"none" }}
                      />
                    </label>
                    <p style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .4)", marginTop:".4rem" }}>Optional here — you can also add it later on the Documents step. Certificate showing min. $1M coverage in Alberta.</p>
                  </div>
                </>
              )}
              <label style={{ display:"flex", alignItems:"center", gap:".6rem", cursor:"pointer", fontSize:".9rem", color:"rgba(var(--ff-muted), .85)", marginTop:".9rem" }}>
                <input type="checkbox" checked={form.hasWcb} onChange={e=>setFB("hasWcb",e.target.checked)} style={{ width:"18px", height:"18px", accentColor:"#ea6b14", cursor:"pointer", flexShrink:0 }} />
                <span>I have WCB / WorkSafe coverage</span>
              </label>
              <div style={{ marginTop:"1rem" }}>
                <label style={s.label}>References or past-work links <span style={{ color:"rgba(var(--ff-muted), .45)", fontWeight:300 }}>(optional)</span></label>
                <textarea style={{ ...inp, minHeight:"70px", resize:"vertical", fontFamily:"inherit" }} placeholder="Links to past work, or names/numbers of references" value={form.workReferences} onChange={e=>setF("workReferences",e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 8 — Documents */}
          {step === 8 && (
            <div>
              <p style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"1rem", fontWeight:300, lineHeight:1.6 }}>
                Upload your credentials and our AI reviews them instantly. These are required to complete your registration. You'll be approved to take jobs once they're verified.
              </p>
              {([
                { key:"insurance",    label:"Liability Insurance Certificate", required:insuranceRequired,  hint:"Certificate of Insurance showing min. $1M coverage in Alberta" },
                { key:"wcb",          label:"WCB / Workers Comp Certificate",  required:insuranceRequired,  hint:"WCB clearance letter issued within the last 90 days" },
                { key:"certification",label:"Trade Certification",             required: wt?.licence === "required", hint:"Red Seal, provincial licence, or other trade credential" },
                { key:"gov_id",       label:"Government-Issued Photo ID",      required:true,  hint:"Driver's licence or passport — name must be clearly visible" },
              ] as Array<{ key: keyof DocFiles; label: string; required: boolean; hint: string }>).map(doc => (
                <div key={doc.key} style={{ marginBottom:"1.25rem" }}>
                  <label style={{ ...s.label, display:"flex", alignItems:"center", gap:".4rem" }}>
                    {doc.label}
                    {doc.required
                      ? <span style={{ color:"#ea6b14", fontSize:".7rem" }}>Required</span>
                      : <span style={{ color:"rgba(var(--ff-muted), .35)", fontSize:".7rem" }}>Optional</span>
                    }
                  </label>
                  <p style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .4)", marginBottom:".5rem" }}>{doc.hint}</p>
                  <label style={{
                    display:"flex", alignItems:"center", gap:".75rem",
                    padding:".75rem 1rem",
                    background: docFiles[doc.key] ? "rgba(234,107,20,.08)" : "rgba(var(--ff-fg), .04)",
                    border: `1px solid ${docFiles[doc.key] ? "rgba(234,107,20,.4)" : "rgba(var(--ff-fg), .1)"}`,
                    borderRadius:"8px", cursor:"pointer", transition:"all .2s",
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={docFiles[doc.key] ? "#ea6b14" : "rgba(var(--ff-muted), .5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <span style={{ fontSize:".88rem", color: docFiles[doc.key] ? "#ea6b14" : "rgba(var(--ff-muted), .6)", flex:1 }}>
                      {docFiles[doc.key] ? docFiles[doc.key]!.name : "Choose file or take a photo (PDF or image, max 10MB)"}
                    </span>
                    {docFiles[doc.key] && <span style={{ color:"#22c55e", fontSize:"1rem" }}>✓</span>}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null;
                        if (f) { const err = docFileError(f); if (err) { setSubmitError(err); e.target.value=""; return; } }
                        setDocFiles(prev => ({ ...prev, [doc.key]: f }));
                        setSubmitError("");
                      }}
                      style={{ display:"none" }}
                    />
                  </label>
                </div>
              ))}
              {errors.docs && <p style={s.err}>{errors.docs}</p>}
              <div style={{ background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.15)", borderRadius:"8px", padding:".9rem 1rem", fontSize:".8rem", color:"rgba(var(--ff-muted), .65)", lineHeight:1.6 }}>
                🔒 Documents are stored securely and only used for verification. They are never shared with clients.
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
                  {" "}I confirm that I hold all licences, permits, and insurance required to perform the services I offer in Alberta.
                </label>
              </div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:".75rem", margin:".5rem 0", padding:".85rem 1rem", background:"rgba(var(--ff-fg), .03)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
                <input type="checkbox" id="newsTips" checked={newsletterOptIn} onChange={e => setNewsletterOptIn(e.target.checked)} style={{ marginTop:"2px", accentColor:"#ea6b14", width:"16px", height:"16px", flexShrink:0, cursor:"pointer" }} />
                <label htmlFor="newsTips" style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, cursor:"pointer", fontWeight:300 }}>
                  Email me practical tips on winning more jobs on Freddy Fix It (about once a week &mdash; unsubscribe anytime).
                </label>
              </div>
              {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginTop:"1rem" }}>{submitError}</div>}
            </div>
          )}

          {/* Step 7 — Photo */}
          {step === 7 && (
            <div>
              <div style={{ border:"2px dashed rgba(var(--ff-fg), .12)", borderRadius:"12px", padding:"2rem 1.5rem", textAlign:"center", marginBottom:"1rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="camera" size={48} color="#ea6b14" /></div>
                <p style={{ color:"rgba(var(--ff-muted), .6)", fontSize:".9rem", marginBottom:".5rem" }}>A profile photo builds trust with clients</p>
                <label htmlFor="co-photo-upload" style={{ display:"inline-flex", alignItems:"center", gap:".5rem", marginTop:".75rem", padding:".6rem 1.25rem", background:"rgba(234,107,20,.12)", border:"1px solid rgba(234,107,20,.3)", borderRadius:"8px", cursor:"pointer", fontSize:".85rem", color:"#ea6b14", fontWeight:500 }}>
                  <Ic name="camera" size={16} color="#ea6b14" />
                  {photoFile ? photoFile.name : "Choose a photo"}
                  <input id="co-photo-upload" type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { setSubmitError("Photo must be under 5MB. Please choose a smaller one."); e.target.value = ""; setPhotoFile(null); return; } setSubmitError(""); setPhotoFile(f); }} style={{ display:"none" }} />
                </label>
              </div>
              {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginBottom:"1rem" }}>{submitError}</div>}
              <p style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .4)", textAlign:"center" }}>This step is optional — you can add a photo later from your dashboard.</p>
            </div>
          )}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"1px solid rgba(var(--ff-fg), .1)" }} onClick={back}>
            {step===1 ? "← Home" : "← Back"}
          </button>
          {step < TOTAL
            ? <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={next}>Next →</button>
            : <button style={{ ...s.navBtn, background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", opacity: loading ? .6 : 1 }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Uploading your details…" : "Complete Registration →"}
              </button>
          }

        </div>

        <p style={{ textAlign:"center", marginTop:"1.25rem", fontSize:".82rem", color:"rgba(var(--ff-muted), .4)" }}>
          Already have an account?{" "}
          <button onClick={() => setLocation("/login")} style={{ background:"none", border:"none", cursor:"pointer", color:"#ea6b14", fontFamily:"inherit", fontSize:".82rem", padding:0 }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
