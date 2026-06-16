import { Ic } from "@/components/Ic";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import NewRequest from "@/components/NewRequest";
import OAuthButtons from "@/components/OAuthButtons";

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
  { iconName: "package", label: "Other" },
];

export const SCHEDULES = [
  { iconName: "zap", label: "Urgent / ASAP",  sub: "Within 24 hours" },
  { iconName: "calendar", label: "This Week",       sub: "Next 2–5 days" },
  { iconName: "calendar", label: "Flexible",        sub: "I'm not in a rush" },
  { iconName: "refresh", label: "Recurring",       sub: "Regular maintenance" },
];

const STEP_TITLES = ["What Do You Need?", "Job Details", "Almost Done"];
const STEP_SUBS   = ["Choose your service and preferred timing", "Where and what needs fixing?", "Create a free account to track your request"];

const HOME_TO_SERVICE: Record<string,string> = {
  "General Repairs": "General Handyman",
  "Plumbing": "Plumbing Repair",
  "Electrical": "Electrical Work",
  "HVAC": "HVAC Maintenance",
  "Drywall & Flooring": "Drywall / Flooring",
};

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

  // Pre-select a service if the home page linked here with ?service=…
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("service");
    if (!raw) return;
    const mapped = HOME_TO_SERVICE[raw] ?? raw;
    if (SERVICES.some(sv => sv.label === mapped)) setSelectedServices([mapped]);
  }, []);
  const [step, setStep] = useState(1);
  const TOTAL = 3;
  const [form, setForm] = useState({ firstName:"", lastName:"", email:"", phone:"", password:"", preferredSchedule:"", location:"", jobDescription:"", businessName:"", businessType:"", locations:"", billingPreference:"" });
  const [clientType, setClientType] = useState<"individual"|"business">("individual");
  const [recurring, setRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"weekly"|"biweekly"|"monthly"|"seasonal"|"">("");
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
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const set = (key: string, val: string) => { setForm(f => ({ ...f, [key]: val })); setErrors(e => ({ ...e, [key]: "" })); };

  const toggleService = (label: string) => {
    setSelectedServices(prev => prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]);
    setErrors(e => ({ ...e, serviceNeeded: "" }));
  };

  const validate = () => {
    const errs: Record<string,string> = {};
    if (step === 1) {
      if (selectedServices.length === 0) errs.serviceNeeded = "Please select at least one service";
      if (!form.preferredSchedule) errs.preferredSchedule = "Please select a schedule";
    }
    if (step === 2) {
      if (!form.location.trim()) errs.location = "Location required";
      if (form.jobDescription.trim().length < 10) errs.jobDescription = "Min 10 characters";
    }
    if (step === 3) {
      if (!form.firstName.trim()) errs.firstName = "Required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Valid email required";
      if (form.phone.replace(/\D/g,"").length < 10) errs.phone = "10-digit phone required";
      if (form.password.length < 8) errs.password = "Minimum 8 characters";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validate()) { setStep(s => s + 1); window.scrollTo(0,0); } };
  const back = () => { if (step === 1) setLocation("/"); else { setStep(s => s - 1); window.scrollTo(0,0); } };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!agreedToTerms) { setSubmitError("Please agree to the User Agreement and Privacy Policy to continue."); window.scrollTo(0,0); return; }
    setLoading(true); setSubmitError("");
    try {
      // Pass the whole request as signup metadata so a DB trigger creates the
      // profile + client_request even when email confirmation is on (no session
      // is returned until the email is verified).
      const metadata: Record<string, any> = {
        role: "client",
        first_name: form.firstName, last_name: form.lastName, phone: form.phone,
        service_needed: selectedServices.join(", "),
        preferred_schedule: form.preferredSchedule,
        location: form.location,
        job_description: form.jobDescription,
        client_type: clientType,
        business_name: clientType === "business" ? form.businessName : "",
        business_type: clientType === "business" ? form.businessType : "",
        locations: clientType === "business" ? form.locations : "",
        recurring: recurring || form.preferredSchedule === "Recurring",
        recurring_frequency: recurringFrequency,
        recurring_start_date: recurringStartDate,
        recurring_end_date: recurringEndDate,
        billing_preference: clientType === "business" ? form.billingPreference : "",
      };
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: metadata, emailRedirectTo: `${window.location.origin}/auth/callback?role=client` },
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Account creation failed.");
      const userId = authData.user.id;
      // No session => email confirmation required. The trigger saved their
      // request already; show the verify screen.
      if (!authData.session) { setVerifyEmail(true); window.scrollTo(0,0); setLoading(false); return; }

      // Session exists: attach the optional photo to the request the trigger made.
      if (photoFile) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = userId + "/" + crypto.randomUUID() + "." + ext;
        const up = await supabase.storage.from("problem-photos").upload(path, photoFile, { upsert: false });
        if (!up.error) {
          const { data: reqRow } = await supabase.from("client_requests").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (reqRow) await supabase.from("client_requests").update({ photo_path: path }).eq("id", reqRow.id);
        }
      }
      setSuccess(true); window.scrollTo(0,0);
    } catch (err: any) {
      setSubmitError(err.message?.includes("already registered") ? "An account with this email already exists. Please sign in instead." : err.message ?? "Something went wrong.");
    } finally { setLoading(false); }
  };

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".95rem", outline:"none", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"#1a2236", padding:"3rem 1rem 4rem", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" },
    inner: { maxWidth:"580px", margin:"0 auto" },
    card: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"14px", padding:"2rem" },
    label: { display:"block", fontSize:".78rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.6)", marginBottom:".6rem" },
    err: { fontSize:".78rem", color:"#f87171", marginTop:".35rem" },
    svcBtn: { display:"flex", alignItems:"center", gap:".65rem", padding:".9rem 1rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"10px", color:"rgba(190,205,235,.8)", fontFamily:"inherit", fontSize:".88rem", cursor:"pointer", textAlign:"left" as const, width:"100%" },
    svcBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"#f0f4ff" },
    schedBtn: { display:"flex", alignItems:"center", gap:"1rem", padding:"1rem 1.2rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"10px", color:"rgba(190,205,235,.8)", fontFamily:"inherit", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".75rem" },
    schedBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"#f0f4ff" },
    navBtn: { flex:1, padding:".85rem 1.5rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:".4rem" },
  };

  if (mode === "loading") return (
    <>
      <style>{`@keyframes ff-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ minHeight:"100vh", background:"#1a2236", display:"flex", alignItems:"center", justifyContent:"center" }}>
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
        <p style={{ color:"rgba(190,205,235,.7)", marginBottom:".5rem", lineHeight:1.6 }}>We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account.</p>
        <p style={{ color:"rgba(190,205,235,.5)", fontSize:".85rem", marginBottom:"2rem", fontWeight:300 }}>Your request is saved — we'll start matching you with contractors right away.{photoFile ? " Once you've verified, you can add your photo from your dashboard." : ""}</p>
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
        <p style={{ color:"rgba(190,205,235,.65)", marginBottom:"2rem" }}>We'll be in touch within a few hours.</p>
        <div style={{ display:"flex", gap:".75rem", justifyContent:"center" }}>
          <button style={{ ...s.navBtn, background:"rgba(255,255,255,.06)", color:"rgba(190,205,235,.8)", border:"1px solid rgba(255,255,255,.1)" }} onClick={() => setLocation("/")}>← Home</button>
          <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={() => setLocation("/client-dashboard")}>My Dashboard →</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <button onClick={back} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(190,205,235,.5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"2rem", display:"block" }}>
          {step === 1 ? "← Home" : "← Back"}
        </button>
        <p style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".15em", color:"#ea6b14", marginBottom:".4rem" }}>Step {step} of {TOTAL}</p>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:".4rem" }}>{STEP_TITLES[step-1]}</h1>
        <p style={{ color:"rgba(190,205,235,.6)", fontSize:".9rem", marginBottom:".5rem" }}>{STEP_SUBS[step-1]}</p>
        <p style={{ color:"rgba(190,205,235,.4)", fontSize:".8rem", marginBottom:"2rem" }}>Takes about 2 minutes · posting is free</p>
        <div style={{ display:"flex", gap:"6px", marginBottom:"2.5rem" }}>
          {Array.from({length:TOTAL},(_,i) => <div key={i} style={{ height:"3px", flex:1, borderRadius:"99px", background: i+1===step ? "#ea6b14" : i+1<step ? "rgba(234,107,20,.45)" : "rgba(255,255,255,.1)" }} />)}
        </div>

        <div style={s.card}>
          {step === 3 && (
            <div>
              <OAuthButtons role="client" label="sign up in one tap with" />
              <p style={{ textAlign:"center", fontSize:".78rem", color:"rgba(190,205,235,.4)", margin:"1.25rem 0" }}>or with your email</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>First Name</label>
                  <input style={{ ...inp, borderColor: errors.firstName ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="Alex" value={form.firstName} onChange={e => set("firstName",e.target.value)} />
                  {errors.firstName && <p style={s.err}>{errors.firstName}</p>}
                </div>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>Last Name <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                  <input style={inp} placeholder="Johnson" value={form.lastName} onChange={e => set("lastName",e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Email</label>
                <input style={{ ...inp, borderColor: errors.email ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} type="email" placeholder="alex@email.com" value={form.email} onChange={e => set("email",e.target.value)} />
                {errors.email && <p style={s.err}>{errors.email}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Phone</label>
                <input style={{ ...inp, borderColor: errors.phone ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} type="tel" placeholder="403-555-0100" value={form.phone} onChange={e => set("phone",e.target.value)} />
                {errors.phone && <p style={s.err}>{errors.phone}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Password (for your account)</label>
                <input style={{ ...inp, borderColor: errors.password ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} type="password" placeholder="Min 8 characters" value={form.password} onChange={e => set("password",e.target.value)} />
                {errors.password && <p style={s.err}>{errors.password}</p>}
              </div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:".75rem", margin:"1.5rem 0 .5rem", padding:"1rem", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px" }}>
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={agreedToTerms}
                  onChange={e => { setAgreedToTerms(e.target.checked); if (e.target.checked) setSubmitError(""); }}
                  style={{ marginTop:"2px", accentColor:"#ea6b14", width:"16px", height:"16px", flexShrink:0, cursor:"pointer" }}
                />
                <label htmlFor="agreeTerms" style={{ fontSize:".82rem", color:"rgba(190,205,235,.7)", lineHeight:1.6, cursor:"pointer", fontWeight:300 }}>
                  I am 18 or older and I agree to Freddy Fix It&rsquo;s{" "}
                  <a href="/user-agreement" target="_blank" rel="noopener noreferrer" style={{ color:"#ea6b14", textDecoration:"none" }}>User Agreement</a>
                  {" "}and{" "}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"#ea6b14", textDecoration:"none" }}>Privacy Policy</a>.
                </label>
              </div>
              {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"#fca5a5", marginTop:"1rem" }}>{submitError}</div>}
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ marginBottom:"1.5rem" }}>
                <label style={s.label}>I am requesting as</label>
                <div style={{ display:"flex", gap:".6rem", marginTop:".4rem" }}>
                  {([["individual","Just me / household"],["business","A small business"]] as const).map(([val,lbl]) => (
                    <button key={val} type="button" onClick={() => setClientType(val)}
                      style={{ flex:1, padding:".7rem .5rem", borderRadius:"10px", cursor:"pointer", fontFamily:"inherit", fontSize:".85rem", fontWeight:500,
                        background: clientType===val ? "rgba(234,107,20,.15)" : "rgba(255,255,255,.04)",
                        border: clientType===val ? "1px solid #ea6b14" : "1px solid rgba(255,255,255,.12)",
                        color: clientType===val ? "#f0f4ff" : "rgba(190,205,235,.7)" }}>{lbl}</button>
                  ))}
                </div>
              </div>
              <p style={s.label}>Services Needed <span style={{ color:"rgba(190,205,235,.4)", textTransform:"none", letterSpacing:0 }}>(select all that apply)</span></p>
              <div style={{ maxWidth:"100%", overflowX:"hidden", display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:".75rem", marginBottom:"1.5rem" }}>
                {SERVICES.map(sv => (
                  <button key={sv.label} style={{ ...s.svcBtn, ...(selectedServices.includes(sv.label) ? s.svcBtnSel : {}) }} onClick={() => toggleService(sv.label)}>
                    <span style={{ fontSize:"1.2rem", flexShrink:0 }}><Ic name={sv.iconName as any} size={20} color="#ea6b14" style={{ marginRight:8, flexShrink:0 }} /></span>
                    <span>{sv.label}</span>
                    {selectedServices.includes(sv.label) && <span style={{ marginLeft:"auto", color:"#ea6b14", fontSize:"1rem" }}>✓</span>}
                  </button>
                ))}
              </div>
              {errors.serviceNeeded && <p style={s.err}>{errors.serviceNeeded}</p>}
              {selectedServices.length > 0 && (
                <p style={{ fontSize:".78rem", color:"#ea6b14", marginBottom:"1.5rem" }}>✓ {selectedServices.length} service{selectedServices.length > 1 ? "s" : ""} selected</p>
              )}
              <p style={{ ...s.label, marginTop:"1.5rem" }}>When Do You Need It?</p>
              {SCHEDULES.map(sc => (
                <button key={sc.label} style={{ ...s.schedBtn, ...(form.preferredSchedule===sc.label ? s.schedBtnSel : {}) }} onClick={() => set("preferredSchedule",sc.label)}>
                  <span style={{ fontSize:"1.5rem" }}><Ic name={sc.iconName as any} size={20} color="#ea6b14" style={{ marginRight:8, flexShrink:0 }} /></span>
                  <div><div style={{ fontSize:".95rem", fontWeight:500 }}>{sc.label}</div><div style={{ fontSize:".78rem", color:"rgba(190,205,235,.5)" }}>{sc.sub}</div></div>
                </button>
              ))}
              {errors.preferredSchedule && <p style={s.err}>{errors.preferredSchedule}</p>}

              {form.preferredSchedule === "Recurring" && (
                <div style={{ marginTop:"1rem", padding:"1rem", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"10px", display:"flex", flexDirection:"column" as const, gap:"1rem" }}>
                  <div>
                    <p style={{ ...s.label, marginBottom:".6rem" }}>How often?</p>
                    <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                      {(["weekly","biweekly","monthly","seasonal"] as const).map(f => (
                        <button key={f} type="button"
                          onClick={() => setRecurringFrequency(f)}
                          style={{ padding:".6rem 1.1rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid",
                            background: recurringFrequency===f ? "rgba(234,107,20,.2)" : "rgba(255,255,255,.04)",
                            borderColor: recurringFrequency===f ? "#ea6b14" : "rgba(255,255,255,.12)",
                            color: recurringFrequency===f ? "#f0f4ff" : "rgba(190,205,235,.7)" }}>
                          {{ weekly:"Every Week", biweekly:"Every 2 Weeks", monthly:"Once a Month", seasonal:"Seasonal" }[f]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {recurringFrequency === "seasonal" && (
                    <div>
                      <p style={{ ...s.label, marginBottom:".6rem" }}>Quick season presets</p>
                      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                        {SEASON_PRESETS.map(sp => (
                          <button key={sp.label} type="button" onClick={() => applySeason(sp)}
                            style={{ padding:".5rem .9rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer", border:"1px solid rgba(255,255,255,.15)", background:"rgba(255,255,255,.05)", color:"rgba(190,205,235,.8)" }}>
                            {sp.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const }}>
                    <div style={{ flex:"1 1 140px" }}>
                      <label style={{ ...s.label, marginBottom:".35rem" }}>Start date <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                      <input type="date" value={recurringStartDate} onChange={e => setRecurringStartDate(e.target.value)}
                        style={{ ...inp, padding:".6rem .8rem", fontSize:".88rem" }} />
                    </div>
                    <div style={{ flex:"1 1 140px" }}>
                      <label style={{ ...s.label, marginBottom:".35rem" }}>End date <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                      <input type="date" value={recurringEndDate} onChange={e => setRecurringEndDate(e.target.value)}
                        style={{ ...inp, padding:".6rem .8rem", fontSize:".88rem" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              {clientType === "business" && (
                <div style={{ marginBottom:"1.75rem", paddingBottom:"1.25rem", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
                  <div style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".12em", color:"#ea6b14", marginBottom:".9rem" }}>Business details</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
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
                  <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".88rem", color:"rgba(240,244,255,.85)" }}>
                    <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} style={{ width:"16px", height:"16px", accentColor:"#ea6b14" }} />
                    This is recurring / scheduled maintenance
                  </label>
                </div>
              )}
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Your Address / Location in Calgary</label>
                <input style={{ ...inp, borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="e.g. 123 Main St NW, Calgary" value={form.location} onChange={e => set("location",e.target.value)} />
                {errors.location && <p style={s.err}>{errors.location}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Describe the Job</label>
                <textarea style={{ ...inp, resize:"vertical", minHeight:"120px", borderColor: errors.jobDescription ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="Tell us what's broken or what you need done." value={form.jobDescription} onChange={e => set("jobDescription",e.target.value)} />
                {errors.jobDescription && <p style={s.err}>{errors.jobDescription}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Photo of the Problem <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
                <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { setSubmitError("Photo must be under 5MB."); return; } setSubmitError(""); setPhotoFile(f); }} style={{ ...inp, padding:".6rem", cursor:"pointer" }} />
                <p style={{ fontSize:".78rem", color:"rgba(190,205,235,.55)", marginTop:".4rem" }}>A photo helps us give you a faster, more accurate quote. Max 5MB.</p>
                {photoFile && <p style={{ fontSize:".78rem", color:"#9fe6b0", marginTop:".3rem" }}>Attached: {photoFile.name}</p>}
              </div>
              {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"#fca5a5", marginTop:"1rem" }}>{submitError}</div>}
            </div>
          )}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(255,255,255,.06)", color:"rgba(190,205,235,.8)", border:"1px solid rgba(255,255,255,.1)" }} onClick={back}>{step===1 ? "← Home" : "← Back"}</button>
          {step < TOTAL
            ? <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={next}>Next →</button>
            : <button style={{ ...s.navBtn, background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", opacity: loading ? .6 : 1 }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Submitting…" : "Submit Request →"}
              </button>
          }
        </div>
        <p style={{ textAlign:"center", marginTop:"1.25rem", fontSize:".82rem", color:"rgba(190,205,235,.4)" }}>
          Already have an account? <button onClick={() => setLocation("/login")} style={{ background:"none", border:"none", cursor:"pointer", color:"#ea6b14", fontFamily:"inherit", fontSize:".82rem", padding:0 }}>Sign in</button>
        </p>
      </div>
    </div>
  );
}
