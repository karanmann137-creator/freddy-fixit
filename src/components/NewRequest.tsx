import { Ic } from "@/components/Ic";
import VoiceDictate from "@/components/VoiceDictate";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { requestGoogleReview } from "@/lib/reviewPrompt";
import { SERVICES, SCHEDULES } from "@/pages/ClientOnboarding";
import { useServicePricing, fromText } from "@/lib/servicePricing";
import { recurrenceOptionsFor, FREQ_LABELS, type Freq } from "@/lib/recurrence";

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
  const pricing = useServicePricing();
  const [schedule, setSchedule] = useState("");
  const [sameAddress, setSameAddress] = useState(true);
  const [newLocation, setNewLocation] = useState("");

  // Saved addresses & vehicles (reused across requests).
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [savedVehicles, setSavedVehicles] = useState<any[]>([]);
  const [addrChoice, setAddrChoice] = useState<string>("last"); // saved id | "last" | "new"
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [vehChoice, setVehChoice] = useState<string>("new");    // saved id | "new"
  const [vehYear, setVehYear] = useState("");
  const [vehMake, setVehMake] = useState("");
  const [vehModel, setVehModel] = useState("");
  const [saveNewVehicle, setSaveNewVehicle] = useState(true);
  const [description, setDescription] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<Freq | "">("");
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
  const applySeason = (sp: typeof SEASON_PRESETS[0]) => {
    const yr = new Date().getFullYear();
    const startYr = sp.label === "Winter" && new Date().getMonth() >= 11 ? yr + 1 : yr;
    const endYr   = sp.label === "Winter" ? startYr + 1 : startYr;
    setRecurringStartDate(startYr + sp.start);
    setRecurringEndDate(endYr + sp.end);
  };
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLocation("/login"); return; }
      const [{ data: prof }, { data: reqs }, { data: addrs }, { data: vehs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("client_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("saved_addresses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("saved_vehicles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setProfile(prof);
      const last = (reqs ?? [])[0] ?? null;
      setLastReq(last);
      setSavedAddresses(addrs ?? []);
      setSavedVehicles(vehs ?? []);
      // Default address choice: last-used if we have one, else first saved, else fresh entry.
      if (last?.location) { setAddrChoice("last"); setSameAddress(true); }
      else if ((addrs ?? []).length) { setAddrChoice((addrs as any[])[0].id); setSameAddress(true); }
      else { setAddrChoice("new"); setSameAddress(false); }
      if ((vehs ?? []).length) setVehChoice((vehs as any[])[0].id);
      if (last?.client_type === "business") setRecurring(!!last.recurring);
      setLoading(false);
    })();
  }, []);

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
    if (SERVICES.some(sv => sv.label === mapped)) setSelectedServices([mapped]);
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

  const validate = () => {
    const e: Record<string, string> = {};
    if (selectedServices.length === 0) e.services = "Please select at least one service";
    if (!schedule) e.schedule = "Please choose a timeframe";
    const loc = resolveLocation();
    if (!loc) e.location = addrChoice === "new" ? "Address required" : "No address on file — please enter one";
    if (description.trim().length < 10) e.description = "Please add a few more details (min 10 characters)";
    setErrors(e);
    return Object.keys(e).length === 0;
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
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = user.id + "/" + crypto.randomUUID() + "." + ext;
        const up = await supabase.storage.from("problem-photos").upload(path, photoFile, { upsert: false });
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
        job_description: description.trim(),
        photo_path: photoPath,
        status: "pending",
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
        billing_preference: isBusiness ? (lastReq?.billing_preference ?? null) : null,
        vehicle_details: vehicleDetails,
      });
      if (error) throw error;
      requestGoogleReview("job_posted");
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

  if (loading) return <div style={{ minHeight:"100vh", background:"var(--ff-bg)" }} />;

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={s.inner}>
        <button onClick={() => setLocation("/client-dashboard")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"2rem", display:"block" }}>
          ← Dashboard
        </button>
        <p style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".15em", color:"#ea6b14", marginBottom:".4rem" }}>New Request</p>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.8rem", letterSpacing:".06em", marginBottom:".4rem" }}>
          Welcome back{profile?.first_name ? ", " + profile.first_name : ""}
        </h1>
        <p style={{ color:"rgba(var(--ff-muted), .6)", fontSize:".9rem", marginBottom:"2rem" }}>
          We've got your details on file — just tell us about this job.
        </p>

        {preferredPro && (
          <div style={{ ...s.card, marginBottom:"1rem", borderColor:"rgba(234,107,20,.4)", background:"rgba(234,107,20,.07)", display:"flex", alignItems:"center", gap:".6rem" }}>
            <Ic name="star" size={16} color="#ea6b14" />
            <div style={{ fontSize:".86rem", color:"var(--ff-text)" }}>You're rebooking a pro you've worked with — they'll be notified directly to send you a quote.</div>
          </div>
        )}

        <div style={s.card}>
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

          {/* Services */}
          <p style={s.label}>What do you need? <span style={{ color:"rgba(var(--ff-muted), .4)", textTransform:"none", letterSpacing:0 }}>(select all that apply)</span></p>
          <div style={{ maxWidth:"100%", overflowX:"hidden", display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:".75rem", marginBottom:".5rem" }}>
            {SERVICES.map(sv => (
              <button key={sv.label} style={{ ...s.svcBtn, ...(selectedServices.includes(sv.label) ? s.svcBtnSel : {}) }} onClick={() => toggleService(sv.label)}>
                <span style={{ fontSize:"1.2rem", flexShrink:0 }}><Ic name={sv.iconName as any} size={20} color="#ea6b14" style={{ marginRight:8, flexShrink:0 }} /></span>
                <span style={{ display:"flex", flexDirection:"column", minWidth:0 }}>
                  <span>{sv.label}</span>
                  {fromText(pricing[sv.label]) && <span style={{ fontSize:".68rem", color:"rgba(var(--ff-muted), .55)", marginTop:"1px" }}>{fromText(pricing[sv.label])}</span>}
                </span>
                {selectedServices.includes(sv.label) && <span style={{ marginLeft:"auto", color:"#ea6b14", fontSize:"1rem" }}>✓</span>}
              </button>
            ))}
          </div>
          {errors.services && <p style={s.err}>{errors.services}</p>}

          {/* Schedule */}
          <p style={{ ...s.label, marginTop:"1.75rem" }}>When do you need it?</p>
          {SCHEDULES.map(sc => (
            <button key={sc.label} style={{ ...s.schedBtn, ...(schedule === sc.label ? s.schedBtnSel : {}) }} onClick={() => { setSchedule(sc.label); setErrors(e => ({ ...e, schedule:"" })); }}>
              <span style={{ fontSize:"1.5rem" }}><Ic name={sc.iconName as any} size={22} color="#ea6b14" /></span>
              <div><div style={{ fontSize:".95rem", fontWeight:500 }}>{sc.label}</div><div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .5)" }}>{sc.sub}</div></div>
            </button>
          ))}
          {errors.schedule && <p style={s.err}>{errors.schedule}</p>}

          {schedule === "Recurring" && (
            <div style={{ marginTop:".75rem", padding:"1rem", background:"rgba(234,107,20,.06)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"10px", display:"flex", flexDirection:"column" as const, gap:"1rem" }}>
              <div>
                <p style={{ ...s.label, marginBottom:".6rem" }}>How often?</p>
                <div style={{ display:"flex", gap:".6rem", flexWrap:"wrap" as const }}>
                  {recurrenceOptionsFor(selectedServices).map(f => (
                    <button key={f} type="button"
                      onClick={() => setRecurringFrequency(f)}
                      style={{ padding:".6rem 1.1rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", border:"1px solid",
                        background: recurringFrequency===f ? "rgba(234,107,20,.2)" : "rgba(var(--ff-fg), .04)",
                        borderColor: recurringFrequency===f ? "#ea6b14" : "rgba(var(--ff-fg), .12)",
                        color: recurringFrequency===f ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)" }}>
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
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
                  Prepaid visits are held securely and released one visit at a time. Set this up after your first quote is approved — unused visits are refundable.
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
                    <input style={{ ...inp, marginTop:".4rem", borderColor: errors.location ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="e.g. 123 Main St NW" value={newLocation} onChange={e => { setNewLocation(e.target.value); setErrors(er => ({ ...er, location:"" })); }} />
                    <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", marginTop:".5rem" }}>
                      <input type="checkbox" checked={saveNewAddress} onChange={e => setSaveNewAddress(e.target.checked)} style={{ width:"15px", height:"15px", accentColor:"#ea6b14" }} />
                      Save this address for next time
                    </label>
                  </>
                )}
              </>
            );
          })()}
          {errors.location && <p style={s.err}>{errors.location}</p>}

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

          {/* Description */}
          <div style={{ marginTop:"1.75rem", marginBottom:"1.2rem" }}>
            <label style={s.label}>Describe the job</label>
            <textarea style={{ ...inp, resize:"vertical", minHeight:"120px", borderColor: errors.description ? "rgba(239,68,68,.6)" : "rgba(var(--ff-fg), .1)" }} placeholder="Tell us what's broken or what you need done." value={description} onChange={e => { setDescription(e.target.value); setErrors(er => ({ ...er, description:"" })); }} />
            <VoiceDictate onAppend={(t) => { setDescription(d => (d.trim() ? d.trim() + " " : "") + t); setErrors(er => ({ ...er, description:"" })); }} />
            {errors.description && <p style={s.err}>{errors.description}</p>}
          </div>

          {/* Photo */}
          <div style={{ marginBottom:"1.2rem" }}>
            <label style={s.label}>Photo of the problem <span style={{ opacity:.5, fontWeight:400 }}>(optional)</span></label>
            <p style={{ margin:"0 0 .5rem", fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", lineHeight:1.45 }}>A clear photo helps contractors give you a faster, more accurate quote — and means fewer surprises on the day.</p>
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
              <input id="nr-photo-upload" type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5*1024*1024) { setSubmitError("Photo must be under 5MB."); return; } setSubmitError(""); setPhotoFile(f); }} style={{ display:"none" }} />
            </label>
          </div>

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

          {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"var(--ff-danger)", marginTop:"1rem" }}>{submitError}</div>}
        </div>

        <div style={{ display:"flex", gap:".75rem", marginTop:"2rem" }}>
          <button style={{ ...s.navBtn, background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"1px solid rgba(var(--ff-fg), .1)" }} onClick={() => setLocation("/client-dashboard")}>← Cancel</button>
          <button style={{ ...s.navBtn, background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", opacity: submitting ? .6 : 1 }} onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Request →"}
          </button>
        </div>
      </div>
    </div>
  );
}
