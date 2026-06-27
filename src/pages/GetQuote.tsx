import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
import { SERVICES } from "@/pages/ClientOnboarding";

// Public, no-signup lead capture. A visitor can request a ballpark quote with
// just their contact details + what they need — we store it as a quote_lead
// (via a SECURITY DEFINER RPC so logged-out users can submit) and the admin
// follows up. After submitting we nudge them to create an account to track it.
export default function GetQuote() {
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [location, setLoc] = useState("");
  const [details, setDetails] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Please enter your name";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk && phone.trim().length < 7) e.contact = "Add a valid email or phone so we can reach you";
    if (!service) e.service = "Pick the service you need";
    if (details.trim().length < 10) e.details = "Tell us a little more (min 10 characters)";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true); setSubmitError("");
    try {
      const { error } = await supabase.rpc("submit_quote_lead", {
        p_name: name.trim(),
        p_email: email.trim() || null,
        p_phone: phone.trim() || null,
        p_service: service,
        p_location: location.trim() || null,
        p_details: details.trim(),
      });
      if (error) throw error;
      trackEvent("generate_lead", { form: "get_quote", service });
      setDone(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const inp = { width:"100%", padding:".75rem 1rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:"8px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".95rem", outline:"none", boxSizing:"border-box" as const };
  const s = {
    wrap: { minHeight:"100vh", background:"#1a2236", padding:"3rem 1rem 4rem", fontFamily:"'DM Sans',sans-serif", color:"#f0f4ff" },
    inner: { maxWidth:"560px", margin:"0 auto" },
    card: { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"14px", padding:"2rem" },
    label: { display:"block", fontSize:".78rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(190,205,235,.6)", marginBottom:".6rem", marginTop:"1.25rem" },
    err: { fontSize:".78rem", color:"#f87171", marginTop:".35rem" },
    btn: { padding:".85rem 1.5rem", borderRadius:"8px", fontFamily:"inherit", fontSize:".95rem", fontWeight:600, cursor:"pointer", border:"none", background:"linear-gradient(135deg,#ea6b14,#f09020)", color:"#fff", width:"100%" },
  };

  if (done) return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ height:"3.75rem" }} />
      <div style={s.inner}>
        <div style={{ ...s.card, textAlign:"center" }}>
          <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>✅</div>
          <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.2rem", letterSpacing:".05em", marginBottom:".5rem" }}>Quote request sent!</h1>
          <p style={{ color:"rgba(190,205,235,.7)", lineHeight:1.6, marginBottom:"1.5rem" }}>
            Thanks {name.trim().split(" ")[0]} — we've got your request and will reach out shortly with a ballpark price.
          </p>
          <p style={{ color:"rgba(190,205,235,.55)", fontSize:".9rem", lineHeight:1.6, marginBottom:"1.5rem" }}>
            Want to track your request, message your contractor, and approve the time in one place? Create a free account.
          </p>
          <button style={s.btn} onClick={() => setLocation("/client-onboarding")}>Create a free account →</button>
          <button onClick={() => setLocation("/")} style={{ background:"none", border:"none", color:"rgba(190,205,235,.5)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer", marginTop:"1.25rem" }}>← Back home</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ height:"3.75rem" }} />
      <div style={s.inner}>
        <button onClick={() => setLocation("/")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(190,205,235,.5)", fontFamily:"inherit", fontSize:".82rem", textTransform:"uppercase", letterSpacing:".08em", padding:0, marginBottom:"1.5rem", display:"block" }}>
          ← Home
        </button>
        <p style={{ fontSize:".75rem", textTransform:"uppercase", letterSpacing:".15em", color:"#ea6b14", marginBottom:".4rem" }}>Free Quote</p>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.6rem", letterSpacing:".06em", marginBottom:".4rem" }}>Get a free quote</h1>
        <p style={{ color:"rgba(190,205,235,.6)", fontSize:".95rem", marginBottom:"2rem", lineHeight:1.6 }}>
          No account needed. Tell us what you need and how to reach you — we'll get back with a ballpark price.
        </p>

        <div style={s.card}>
          <label style={{ ...s.label, marginTop:0 }}>Your name</label>
          <input style={{ ...inp, borderColor: errors.name ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="First and last name" value={name} onChange={e => { setName(e.target.value); setErrors(x => ({ ...x, name:"" })); }} />
          {errors.name && <p style={s.err}>{errors.name}</p>}

          <label style={s.label}>Email</label>
          <input style={{ ...inp, borderColor: errors.contact ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="you@email.com" value={email} onChange={e => { setEmail(e.target.value); setErrors(x => ({ ...x, contact:"" })); }} />

          <label style={s.label}>Phone <span style={{ opacity:.5, textTransform:"none", letterSpacing:0 }}>(optional if email given)</span></label>
          <input style={{ ...inp, borderColor: errors.contact ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="(403) 555-0123" value={phone} onChange={e => { setPhone(e.target.value); setErrors(x => ({ ...x, contact:"" })); }} />
          {errors.contact && <p style={s.err}>{errors.contact}</p>}

          <label style={s.label}>What do you need?</label>
          <select style={{ ...inp, borderColor: errors.service ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)", appearance:"none" as const }} value={service} onChange={e => { setService(e.target.value); setErrors(x => ({ ...x, service:"" })); }}>
            <option value="" style={{ background:"#1a2236" }}>Choose a service…</option>
            {SERVICES.map((sv: any) => (
              <option key={sv.label} value={sv.label} style={{ background:"#1a2236" }}>{sv.label}</option>
            ))}
          </select>
          {errors.service && <p style={s.err}>{errors.service}</p>}

          <label style={s.label}>Area / neighbourhood <span style={{ opacity:.5, textTransform:"none", letterSpacing:0 }}>(optional)</span></label>
          <input style={inp} placeholder="e.g. NW Calgary, Beltline…" value={location} onChange={e => setLoc(e.target.value)} />

          <label style={s.label}>Tell us about the job</label>
          <textarea style={{ ...inp, resize:"vertical", minHeight:"110px", borderColor: errors.details ? "rgba(239,68,68,.6)" : "rgba(255,255,255,.1)" }} placeholder="What needs doing? The more detail, the better the quote." value={details} onChange={e => { setDetails(e.target.value); setErrors(x => ({ ...x, details:"" })); }} />
          {errors.details && <p style={s.err}>{errors.details}</p>}

          {submitError && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"8px", padding:".75rem 1rem", fontSize:".83rem", color:"#fca5a5", marginTop:"1.25rem" }}>{submitError}</div>}

          <div style={{ marginTop:"1.75rem" }}>
            <button style={{ ...s.btn, opacity: submitting ? .6 : 1 }} onClick={submit} disabled={submitting}>
              {submitting ? "Sending…" : "Get my free quote →"}
            </button>
          </div>
          <p style={{ fontSize:".75rem", color:"rgba(190,205,235,.45)", marginTop:"1rem", textAlign:"center", lineHeight:1.5 }}>
            We only use your details to prepare and send your quote.
          </p>
        </div>
      </div>
    </div>
  );
}
