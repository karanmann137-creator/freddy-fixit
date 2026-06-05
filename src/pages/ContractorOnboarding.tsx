import { Ic } from "@/components/Ic";
import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

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
  { iconName: "wind", label: "Air Conditioning" },
  { iconName: "trowel", label: "Concrete / Masonry" },
  { iconName: "sparkles", label: "Cleaning Services" },
];

const AREAS = ["NW Calgary","NE Calgary","SW Calgary","SE Calgary","Downtown / Beltline","Airdrie","Cochrane","Chestermere"];

const AVAILABILITY_OPTIONS = [
  { iconName: "sun", label: "Weekday Mornings",   sub: "Mon–Fri, 7am–12pm" },
  { iconName: "cloud-sun", label: "Weekday Afternoons", sub: "Mon–Fri, 12pm–5pm" },
  { iconName: "moon", label: "Weekday Evenings",   sub: "Mon–Fri, 5pm–9pm" },
  { iconName: "calendar", label: "Weekends",           sub: "Sat & Sun, flexible hours" },
  { iconName: "zap", label: "Urgent / On-Call",   sub: "Available for same-day jobs" },
  { iconName: "refresh", label: "Fully Flexible",     sub: "Available anytime" },
];

const STEP_TITLES = ["Your Details", "Your Specialties", "Service Area", "Availability", "Profile Photo"];
const STEP_SUBS   = [
  "Basic contact information",
  "What services do you offer? Select all that apply",
  "Which parts of Calgary do you cover?",
  "When are you generally available?",
  "Add a profile photo (optional)",
];

export default function ContractorOnboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const TOTAL = 5;
  const [form, setForm] = useState({ firstName:"", lastName:"", email:"", phone:"", companyName:"", password:"", yearsOfExperience:"", photoUrl:"", licensed:false, licenseNumber:"", hasInsurance:false, insuranceProvider:"", insuranceExpiry:"", hasWcb:false, workReferences:"" });
  const [selectedSpec,  setSelectedSpec]  = useState<string[]>([]);
  const [selectedArea,  setSelectedArea]  = useState<string[]>([]);
  const [selectedAvail, setSelectedAvail] = useState<string[]>([]);
  const [errors, setErrors]   = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);

  const setF = (key: string, val: string | number) => { setForm(f => ({ ...f, [key]: val })); setErrors(e => ({ ...e, [key]: "" })); };
  const setFB = (key: string, val: boolean) => { setForm(f => ({ ...f, [key]: val })); };
  const toggleSpec  = (l: string) => { setSelectedSpec(prev  => prev.includes(l)  ? prev.filter(x => x !== l)  : [...prev, l]);  setErrors(e => ({ ...e, spec: "" })); };
  const toggleArea  = (z: string) => { setSelectedArea(prev  => prev.includes(z)  ? prev.filter(x => x !== z)  : [...prev, z]);  setErrors(e => ({ ...e, area: "" })); };
  const toggleAvail = (a: string) => { setSelectedAvail(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]); setErrors(e => ({ ...e, avail: "" })); };

  const validate = () => {
    const errs: Record<string,string> = {};
    if (step === 1) {
      if (!form.firstName.trim()) errs.firstName = "Required";
      if (!form.lastName.trim())  errs.lastName  = "Required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Valid email required";
      if (form.phone.replace(/\D/g,"").length < 10) errs.phone = "10-digit phone required";
      if (form.password.length < 8) errs.password = "Minimum 8 characters";
    }
    if (step === 2 && selectedSpec.length === 0)  errs.spec  = "Select at least one specialty";
    if (step === 3 && selectedArea.length === 0)  errs.area  = "Select at least one area";
    if (step === 4 && selectedAvail.length === 0) errs.avail = "Select at least one availability window";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validate()) { setStep(s => s + 1); window.scrollTo(0,0); } };
  const back = () => { if (step === 1) setLocation("/"); else { setStep(s => s - 1); window.scrollTo(0,0); } };

  const handleSubmit = async () => {
    if (!agreedToTerms) { setSubmitError("You must agree to the User Agreement and Privacy Policy to continue."); return; }
    setLoading(true); setSubmitError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Account creation failed.");
      const userId = authData.user.id;
      await supabase.from("profiles").insert({ id: userId, email: form.email, first_name: form.firstName, last_name: form.lastName, phone: form.phone, role: "contractor" });
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
      await supabase.from("contractors").insert({ id: userId, company_name: form.companyName || null, specialties: selectedSpec, years_of_experience: form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience), service_area: selectedArea, availability: { windows: selectedAvail }, photo_url: photoPublicUrl, licensed: form.licensed, license_number: form.licenseNumber || null, has_liability_insurance: form.hasInsurance, insurance_provider: form.insuranceProvider || null, insurance_expiry: form.insuranceExpiry || null, has_wcb: form.hasWcb, work_references: form.workReferences || null, status: "pending" });
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
    chip: { display:"flex", alignItems:"center", gap:".5rem", padding:".75rem 1rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px", color:"rgba(190,205,235,.75)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", textAlign:"left" as const, width:"100%" },
    chipSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"#f0f4ff" },
    availBtn: { display:"flex", alignItems:"center", gap:"1rem", padding:"1rem 1.25rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"10px", color:"rgba(190,205,235,.8)", fontFamily:"inherit", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".75rem" },
    availBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"#f0f4ff" },
    navBtn: { flex:1, padding:".85rem 1.5rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:".4rem" },
  };

  if (success) return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ ...s.inner, textAlign:"center", paddingTop:"4rem" }}>
        <div style={{ width:"72px", height:"72px", background:"rgba(234,107,20,.15)", border:"2px solid rgba(234,107,20,.4)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 2rem" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ea6b14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"3rem", letterSpacing:".06em", marginBottom:".5rem" }}>Welcome to <span style={{ color:"#ea6b14" }}>the Team!</span></h1>
        <p style={{ color:"rgba(190,205,235,.65)", marginBottom:"2rem" }}>Your profile has been submitted. We'll review it within 24 hours.</p>
        <div style={{ display:"flex", gap:".75rem", justifyContent:"center" }}>
          <button style={{ ...s.navBtn, background:"rgba(255,255,255,.06)", color:"rgba(190,205,235,.8)", border:"1px solid rgba(255,255,255,.1)" }} onClick={() => setLocation("/")}>← Home</button>
          <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={() => setLocation("/contractor-dashboard")}>My Dashboard →</button>
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
        <p style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".15em", color:"#ea6b14", marginBottom:".4rem" }}>Contractor Registration · Step {step} of {TOTAL}</p>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:".4rem" }}>{STEP_TITLES[step-1]}</h1>
        <p style={{ color:"rgba(190,205,235,.6)", fontSize:".9rem", marginBottom:"2rem" }}>{STEP_SUBS[step-1]}</p>
        <div style={{ display:"flex", gap:"6px", marginBottom:"2.5rem" }}>
          {Array.from({length:TOTAL},(_,i) => (
            <div key={i} style={{ height:"3px", flex:1, borderRadius:"99px", background: i+1===step ? "#ea6b14" : i+1<step ? "rgba(234,107,20,.45)" : "rgba(255,255,255,.1)" }} />
          ))}
        </div>

        <div style={s.card}>
          {/* Step 1 — Contact */}
          {step === 1 && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>First Name</label>
                  <input style={{ ...inp, borderColor: errors.firstName ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="Mike" value={form.firstName} onChange={e => setF("firstName",e.target.value)} />
                  {errors.firstName && <p style={s.err}>{errors.firstName}</p>}
                </div>
                <div style={{ marginBottom:"1.2rem" }}>
                  <label style={s.label}>Last Name</label>
                  <input style={{ ...inp, borderColor: errors.lastName ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="Taylor" value={form.lastName} onChange={e => setF("lastName",e.target.value)} />
                  {errors.lastName && <p style={s.err}>{errors.lastName}</p>}
                </div>
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Email</label>
                <input style={{ ...inp, borderColor: errors.email ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} type="email" placeholder="mike@email.com" value={form.email} onChange={e => setF("email",e.target.value)} />
                {errors.email && <p style={s.err}>{errors.email}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Phone</label>
                <input style={{ ...inp, borderColor: errors.phone ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} type="tel" placeholder="403-555-0100" value={form.phone} onChange={e => setF("phone",e.target.value)} />
                {errors.phone && <p style={s.err}>{errors.phone}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Password (for your account)</label>
                <input style={{ ...inp, borderColor: errors.password ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} type="password" placeholder="Min 8 characters" value={form.password} onChange={e => setF("password",e.target.value)} />
                {errors.password && <p style={s.err}>{errors.password}</p>}
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Years of Experience</label>
                <input style={inp} type="number" min={0} max={50} value={form.yearsOfExperience} placeholder="e.g. 5" onChange={e => setF("yearsOfExperience", e.target.value)} />
              </div>
              <div style={{ marginBottom:"1.2rem" }}>
                <label style={s.label}>Company Name <span style={{ color:"rgba(190,205,235,.45)", fontWeight:300 }}>(optional)</span></label>
                <input style={inp} placeholder="e.g. Kelly Home Repairs" value={form.companyName} onChange={e => setF("companyName",e.target.value)} />
              </div>
              <div style={{ marginBottom:"1.2rem", paddingTop:".9rem", borderTop:"1px solid rgba(255,255,255,.08)" }}>
                <label style={{ ...s.label, display:"block", marginBottom:".75rem" }}>Credentials</label>
                <label style={{ display:"flex", alignItems:"center", gap:".6rem", cursor:"pointer", fontSize:".9rem", color:"rgba(190,205,235,.85)" }}>
                  <input type="checkbox" checked={form.licensed} onChange={e=>setFB("licensed",e.target.checked)} style={{ width:"18px", height:"18px", accentColor:"#ea6b14", cursor:"pointer", flexShrink:0 }} />
                  <span>I'm a licensed contractor</span>
                </label>
                {form.licensed && <input style={{ ...inp, marginTop:".5rem" }} placeholder="License number" value={form.licenseNumber} onChange={e=>setF("licenseNumber",e.target.value)} />}
                <label style={{ display:"flex", alignItems:"center", gap:".6rem", cursor:"pointer", fontSize:".9rem", color:"rgba(190,205,235,.85)", marginTop:".9rem" }}>
                  <input type="checkbox" checked={form.hasInsurance} onChange={e=>setFB("hasInsurance",e.target.checked)} style={{ width:"18px", height:"18px", accentColor:"#ea6b14", cursor:"pointer", flexShrink:0 }} />
                  <span>I carry liability insurance</span>
                </label>
                {form.hasInsurance && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".75rem", marginTop:".5rem" }}>
                    <input style={inp} placeholder="Insurance provider" value={form.insuranceProvider} onChange={e=>setF("insuranceProvider",e.target.value)} />
                    <input style={inp} placeholder="Expiry (e.g. 2026-12)" value={form.insuranceExpiry} onChange={e=>setF("insuranceExpiry",e.target.value)} />
                  </div>
                )}
                <label style={{ display:"flex", alignItems:"center", gap:".6rem", cursor:"pointer", fontSize:".9rem", color:"rgba(190,205,235,.85)", marginTop:".9rem" }}>
                  <input type="checkbox" checked={form.hasWcb} onChange={e=>setFB("hasWcb",e.target.checked)} style={{ width:"18px", height:"18px", accentColor:"#ea6b14", cursor:"pointer", flexShrink:0 }} />
                  <span>I have WCB / WorkSafe coverage</span>
                </label>
                <div style={{ marginTop:"1rem" }}>
                  <label style={s.label}>References or past-work links <span style={{ color:"rgba(190,205,235,.45)", fontWeight:300 }}>(optional)</span></label>
                  <textarea style={{ ...inp, minHeight:"70px", resize:"vertical", fontFamily:"inherit" }} placeholder="Links to past work, or names/numbers of references" value={form.workReferences} onChange={e=>setF("workReferences",e.target.value)} />
                </div>
              </div>
              <p style={{ fontSize:".78rem", color:"rgba(190,205,235,.4)", fontWeight:300 }}>We'll create a free account so you can manage your jobs.</p>
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
              <p style={s.label}>Calgary Zones You Serve</p>
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

          {/* Step 4 — Availability (simplified) */}
          {step === 4 && (
            <div>
              <p style={{ fontSize:".85rem", color:"rgba(190,205,235,.5)", marginBottom:"1.5rem", fontWeight:300, lineHeight:1.6 }}>
                Select all the windows that generally work for you. You can update this anytime from your dashboard.
              </p>
              {AVAILABILITY_OPTIONS.map(a => (
                <button key={a.label} style={{ ...s.availBtn, ...(selectedAvail.includes(a.label) ? s.availBtnSel : {}) }} onClick={() => toggleAvail(a.label)}>
                  <span style={{ fontSize:"1.5rem", flexShrink:0 }}><Ic name={a.iconName as any} size={20} color="#ea6b14" style={{ marginRight:8, flexShrink:0 }} /></span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:".95rem", fontWeight:500 }}>{a.label}</div>
                    <div style={{ fontSize:".78rem", color:"rgba(190,205,235,.5)", marginTop:".1rem" }}>{a.sub}</div>
                  </div>
                  {selectedAvail.includes(a.label) && <span style={{ color:"#ea6b14", fontSize:"1.1rem", flexShrink:0 }}>✓</span>}
                </button>
              ))}
              {errors.avail && <p style={s.err}>{errors.avail}</p>}
              {selectedAvail.length > 0 && <p style={{ fontSize:".78rem", color:"#ea6b14" }}>✓ {selectedAvail.length} window{selectedAvail.length > 1 ? "s" : ""} selected</p>}
            </div>
          )}

          {/* Step 5 — Photo */}
          {step === 5 && (
            <div>
              <div style={{ border:"2px dashed rgba(255,255,255,.12)", borderRadius:"12px", padding:"2rem 1.5rem", textAlign:"center", marginBottom:"1rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="camera" size={48} color="#ea6b14" /></div>
                <p style={{ color:"rgba(190,205,235,.6)", fontSize:".9rem", marginBottom:".5rem" }}>A profile photo builds trust with clients</p>
                <label htmlFor="co-photo-upload" style={{ display:"inline-flex", alignItems:"center", gap:".5rem", marginTop:".75rem", padding:".6rem 1.25rem", background:"rgba(234,107,20,.12)", border:"1px solid rgba(234,107,20,.3)", borderRadius:"8px", cursor:"pointer", fontSize:".85rem", color:"#ea6b14", fontWeight:500 }}>
                  <Ic name="camera" size={16} color="#ea6b14" />
                  {photoFile ? photoFile.name : "Choose a photo"}
                  <input id="co-photo-upload" type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { setSubmitError("Photo must be under 5MB."); return; } setPhotoFile(f); }} style={{ display:"none" }} />
                </label>
              </div>
              <p style={{ fontSize:".78rem", color:"rgba(190,205,235,.4)", textAlign:"center" }}>This step is optional — you can add a photo later from your dashboard.</p>
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
                  {" "}I confirm that I hold all licences, permits, and insurance required to perform the services I offer in Alberta.
                </label>
              </div>
              {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"#fca5a5", marginTop:"1rem" }}>{submitError}</div>}
            </div>
          )}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(255,255,255,.06)", color:"rgba(190,205,235,.8)", border:"1px solid rgba(255,255,255,.1)" }} onClick={back}>
            {step===1 ? "← Home" : "← Back"}
          </button>
          {step < TOTAL
            ? <button style={{ ...s.navBtn, background:"#ea6b14", color:"#fff" }} onClick={next}>Next →</button>
            : <button style={{ ...s.navBtn, background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", opacity: loading ? .6 : 1 }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Submitting…" : "Complete Registration →"}
              </button>
          }
        </div>

        <p style={{ textAlign:"center", marginTop:"1.25rem", fontSize:".82rem", color:"rgba(190,205,235,.4)" }}>
          Already have an account?{" "}
          <button onClick={() => setLocation("/login")} style={{ background:"none", border:"none", cursor:"pointer", color:"#ea6b14", fontFamily:"inherit", fontSize:".82rem", padding:0 }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
