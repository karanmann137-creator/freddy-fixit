import { Ic } from "@/components/Ic";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { SERVICES, SCHEDULES } from "@/pages/ClientOnboarding";

// Shown when an already-signed-in client starts another request. Unlike the
// first-time onboarding flow, this never creates an account — it reuses the
// session + saved details and only asks what's actually new: the service,
// timing, address (defaulting to "same as last time"), description, and photo.
export default function NewRequest() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [lastReq, setLastReq] = useState<any>(null);

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [schedule, setSchedule] = useState("");
  const [sameAddress, setSameAddress] = useState(true);
  const [newLocation, setNewLocation] = useState("");
  const [description, setDescription] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }
      const [{ data: prof }, { data: reqs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("client_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      ]);
      setProfile(prof);
      const last = (reqs ?? [])[0] ?? null;
      setLastReq(last);
      if (!last?.location) setSameAddress(false);       // nothing to reuse → enter fresh
      if (last?.client_type === "business") setRecurring(!!last.recurring);
      setLoading(false);
    })();
  }, []);

  const prevAddress = lastReq?.location ?? "";
  const isBusiness = lastReq?.client_type === "business";

  const toggleService = (label: string) => {
    setSelectedServices(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
    setErrors(e => ({ ...e, services: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (selectedServices.length === 0) e.services = "Please select at least one service";
    if (!schedule) e.schedule = "Please choose a timeframe";
    const loc = sameAddress ? prevAddress : newLocation.trim();
    if (!loc) e.location = sameAddress ? "No previous address on file — please enter one" : "Address required";
    if (description.trim().length < 10) e.description = "Please add a few more details (min 10 characters)";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true); setSubmitError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }

      let photoPath: string | null = null;
      if (photoFile) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = user.id + "/" + crypto.randomUUID() + "." + ext;
        const up = await supabase.storage.from("problem-photos").upload(path, photoFile, { upsert: false });
        if (!up.error) photoPath = path;
      }

      const location = sameAddress ? prevAddress : newLocation.trim();
      const { error } = await supabase.from("client_requests").insert({
        user_id: user.id,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        email: profile?.email ?? user.email ?? null,
        phone: profile?.phone ?? null,
        service_needed: selectedServices.join(", "),
        preferred_schedule: schedule,
        location,
        job_description: description.trim(),
        photo_path: photoPath,
        status: "pending",
        client_type: lastReq?.client_type ?? "individual",
        business_name: isBusiness ? (lastReq?.business_name ?? null) : null,
        business_type: isBusiness ? (lastReq?.business_type ?? null) : null,
        locations: isBusiness ? (lastReq?.locations ?? null) : null,
        recurring: isBusiness ? recurring : false,
        billing_preference: isBusiness ? (lastReq?.billing_preference ?? null) : null,
      });
      if (error) throw error;
      setLocation("/client-dashboard");
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
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
    addrBtn: { display:"flex", alignItems:"center", gap:".6rem", padding:".85rem 1rem", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"10px", color:"rgba(190,205,235,.85)", fontFamily:"inherit", fontSize:".9rem", cursor:"pointer", textAlign:"left" as const, width:"100%", marginBottom:".6rem" },
    addrBtnSel: { background:"rgba(234,107,20,.12)", borderColor:"rgba(234,107,20,.5)", color:"#f0f4ff" },
    navBtn: { flex:1, padding:".85rem 1.5rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".9rem", fontWeight:500, cursor:"pointer", border:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:".4rem" },
  };

  if (loading) return <div style={{ minHeight:"100vh", background:"#1a2236" }} />;

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <button onClick={() => setLocation("/client-dashboard")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(190,205,235,.5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"2rem", display:"block" }}>
          ← Dashboard
        </button>
        <p style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".15em", color:"#ea6b14", marginBottom:".4rem" }}>New Request</p>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:".4rem" }}>
          Welcome back{profile?.first_name ? ", " + profile.first_name : ""}
        </h1>
        <p style={{ color:"rgba(190,205,235,.6)", fontSize:".9rem", marginBottom:"2rem" }}>
          We've got your details on file — just tell us about this job.
        </p>

        <div style={s.card}>
          {/* Contact summary (read-only) */}
          <div style={{ marginBottom:"1.75rem", paddingBottom:"1.25rem", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
            <div style={s.label}>Submitting as</div>
            <div style={{ fontSize:".95rem", fontWeight:500 }}>
              {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Your account"}
              {isBusiness && lastReq?.business_name ? <span style={{ color:"rgba(190,205,235,.6)", fontWeight:400 }}> · {lastReq.business_name}</span> : null}
            </div>
            <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.55)", marginTop:".2rem" }}>
              {[profile?.email, profile?.phone].filter(Boolean).join(" · ")}
            </div>
            <p style={{ fontSize:".75rem", color:"rgba(190,205,235,.4)", marginTop:".5rem" }}>Need to change your name or phone? Update it in your profile.</p>
          </div>

          {/* Services */}
          <p style={s.label}>What do you need? <span style={{ color:"rgba(190,205,235,.4)", textTransform:"none", letterSpacing:0 }}>(select all that apply)</span></p>
          <div style={{ maxWidth:"100%", overflowX:"hidden", display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:".75rem", marginBottom:".5rem" }}>
            {SERVICES.map(sv => (
              <button key={sv.label} style={{ ...s.svcBtn, ...(selectedServices.includes(sv.label) ? s.svcBtnSel : {}) }} onClick={() => toggleService(sv.label)}>
                <span style={{ fontSize:"1.2rem", flexShrink:0 }}><Ic name={sv.iconName as any} size={20} color="#ea6b14" style={{ marginRight:8, flexShrink:0 }} /></span>
                <span>{sv.label}</span>
                {selectedServices.includes(sv.label) && <span style={{ marginLeft:"auto", color:"#ea6b14", fontSize:"1rem" }}>✓</span>}
              </button>
            ))}
          </div>
          {errors.services && <p style={s.err}>{errors.services}</p>}

          {/* Schedule */}
          <p style={{ ...s.label, marginTop:"1.75rem" }}>When do you need it?</p>
          {SCHEDULES.map(sc => (
            <button key={sc.label} style={{ ...s.schedBtn, ...(schedule === sc.label ? s.schedBtnSel : {}) }} onClick={() => { setSchedule(sc.label); setErrors(e => ({ ...e, schedule:"" })); }}>
              <span style={{ fontSize:"1.5rem" }}>{sc.icon}</span>
              <div><div style={{ fontSize:".95rem", fontWeight:500 }}>{sc.label}</div><div style={{ fontSize:".78rem", color:"rgba(190,205,235,.5)" }}>{sc.sub}</div></div>
            </button>
          ))}
          {errors.schedule && <p style={s.err}>{errors.schedule}</p>}

          {/* Address */}
          <p style={{ ...s.label, marginTop:"1.75rem" }}>Where is this job?</p>
          {prevAddress ? (
            <>
              <button style={{ ...s.addrBtn, ...(sameAddress ? s.addrBtnSel : {}) }} onClick={() => { setSameAddress(true); setErrors(e => ({ ...e, location:"" })); }}>
                <span><Ic name={sameAddress ? "radio-on" : "radio-off"} size={16} color="#ea6b14" /></span>
                <span>Same address as last time — <span style={{ color:"rgba(190,205,235,.6)" }}>{prevAddress}</span></span>
              </button>
              <button style={{ ...s.addrBtn, ...(!sameAddress ? s.addrBtnSel : {}) }} onClick={() => { setSameAddress(false); setErrors(e => ({ ...e, location:"" })); }}>
                <span><Ic name={!sameAddress ? "radio-on" : "radio-off"} size={16} color="#ea6b14" /></span>
                <span>A different address</span>
              </button>
              {!sameAddress && (
                <input style={{ ...inp, marginTop:".4rem", borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="e.g. 123 Main St NW, Calgary" value={newLocation} onChange={e => { setNewLocation(e.target.value); setErrors(er => ({ ...er, location:"" })); }} />
              )}
            </>
          ) : (
            <input style={{ ...inp, borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="e.g. 123 Main St NW, Calgary" value={newLocation} onChange={e => { setNewLocation(e.target.value); setErrors(er => ({ ...er, location:"" })); }} />
          )}
          {errors.location && <p style={s.err}>{errors.location}</p>}

          {isBusiness && (
            <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".88rem", color:"rgba(240,244,255,.85)", marginTop:"1rem" }}>
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} style={{ width:"16px", height:"16px", accentColor:"#ea6b14" }} />
              This is recurring / scheduled maintenance
            </label>
          )}

          {/* Description */}
          <div style={{ marginTop:"1.75rem", marginBottom:"1.2rem" }}>
            <label style={s.label}>Describe the job</label>
            <textarea style={{ ...inp, resize:"vertical", minHeight:"120px", borderColor: errors.description ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="Tell us what's broken or what you need done." value={description} onChange={e => { setDescription(e.target.value); setErrors(er => ({ ...er, description:"" })); }} />
            {errors.description && <p style={s.err}>{errors.description}</p>}
          </div>

          {/* Photo */}
          <div style={{ marginBottom:"1.2rem" }}>
            <label style={s.label}>Photo of the problem <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
            <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { setSubmitError("Photo must be under 5MB."); return; } setSubmitError(""); setPhotoFile(f); }} style={{ ...inp, padding:".6rem", cursor:"pointer" }} />
            <p style={{ fontSize:".78rem", color:"rgba(190,205,235,.55)", marginTop:".4rem" }}>A photo helps us give you a faster, more accurate quote. Max 5MB.</p>
            {photoFile && <p style={{ fontSize:".78rem", color:"#9fe6b0", marginTop:".3rem" }}>Attached: {photoFile.name}</p>}
          </div>

          {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"#fca5a5", marginTop:"1rem" }}>{submitError}</div>}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(255,255,255,.06)", color:"rgba(190,205,235,.8)", border:"1px solid rgba(255,255,255,.1)" }} onClick={() => setLocation("/client-dashboard")}>← Cancel</button>
          <button style={{ ...s.navBtn, background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", opacity: submitting ? .6 : 1 }} onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Request →"}
          </button>
        </div>
      </div>
    </div>
  );
}
