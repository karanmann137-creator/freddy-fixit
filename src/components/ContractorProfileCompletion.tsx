import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Editors for the profile fields we moved OFF the fast-track signup
// ("Name + specialties only"). A contractor who signed up quickly finishes
// here: service area, trade + credentials, and verification documents.
// Availability has its own editor lower on the profile tab.

const AREAS = ["NW", "NE", "SW", "SE", "Downtown / Beltline", "Airdrie", "Cochrane", "Chestermere"];

const WORK_TYPES = [
  { id: "regulated",     label: "Regulated trade",             sub: "Electrical, gas, plumbing, HVAC — needs a provincial certificate" },
  { id: "skilled",       label: "Skilled trade",               sub: "Carpentry, drywall, painting, flooring, roofing, concrete, appliance install" },
  { id: "handyman",      label: "General handyman & repairs",  sub: "Multi-skill repairs and small jobs around the home" },
  { id: "moving",        label: "Moving, assembly & delivery", sub: "Furniture & appliance moving, assembly, hauling — no trade licence needed" },
  { id: "home_services", label: "Cleaning, yard & seasonal",   sub: "Cleaning, landscaping, snow removal, gutters" },
];

const DOC_LABELS: Record<string, string> = {
  insurance: "Proof of liability insurance",
  wcb: "WCB coverage",
  certification: "Trade licence / certification",
  gov_id: "Government ID",
};

type DocKey = "insurance" | "wcb" | "certification" | "gov_id";

export default function ContractorProfileCompletion({
  profile, contractor, onSaved,
}: { profile: any; contractor: any; onSaved: (patch: any) => void }) {
  const [area, setArea] = useState<string[]>(contractor?.service_area ?? []);
  const [companyName, setCompanyName] = useState<string>(contractor?.company_name ?? "");
  const [workType, setWorkType] = useState<string>(contractor?.work_type ?? "");
  const [licensed, setLicensed] = useState<boolean>(!!contractor?.licensed);
  const [licenseNumber, setLicenseNumber] = useState<string>(contractor?.license_number ?? "");
  const [hasInsurance, setHasInsurance] = useState<boolean>(!!contractor?.has_liability_insurance);
  const [insuranceProvider, setInsuranceProvider] = useState<string>(contractor?.insurance_provider ?? "");
  const [insuranceExpiry, setInsuranceExpiry] = useState<string>(contractor?.insurance_expiry ?? "");
  const [hasWcb, setHasWcb] = useState<boolean>(!!contractor?.has_wcb);
  const [workReferences, setWorkReferences] = useState<string>(contractor?.work_references ?? "");
  const [docFiles, setDocFiles] = useState<Record<DocKey, File | null>>({ insurance: null, wcb: null, certification: null, gov_id: null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const existingDocs: Record<string, string> = contractor?.doc_urls ?? {};

  const toggleArea = (z: string) => setArea(prev => prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z]);

  const pickDoc = (key: DocKey, f: File | null) => {
    setMsg(null);
    if (f && f.size > 10 * 1024 * 1024) { setMsg({ kind: "err", text: DOC_LABELS[key] + " must be under 10MB." }); return; }
    setDocFiles(prev => ({ ...prev, [key]: f }));
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      // Upload any newly-chosen documents.
      const docUrls: Record<string, string> = { ...existingDocs };
      let uploadedAny = false;
      for (const key of Object.keys(docFiles) as DocKey[]) {
        const file = docFiles[key];
        if (!file) continue;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${profile.id}/${key}.${ext}`;
        const { error: upErr } = await supabase.storage.from("contractor-docs").upload(path, file, { upsert: true });
        if (upErr) { setMsg({ kind: "err", text: `Couldn't upload ${DOC_LABELS[key]}: ${upErr.message}` }); setBusy(false); return; }
        docUrls[key] = path;
        uploadedAny = true;
      }

      const patch = {
        service_area: area,
        company_name: companyName || null,
        work_type: workType || null,
        licensed,
        license_number: licenseNumber || null,
        has_liability_insurance: hasInsurance,
        insurance_provider: insuranceProvider || null,
        insurance_expiry: insuranceExpiry || null,
        has_wcb: hasWcb,
        work_references: workReferences || null,
        doc_urls: docUrls,
      };
      const { error } = await supabase.from("contractors").update(patch).eq("id", profile.id);
      if (error) { setMsg({ kind: "err", text: "Couldn't save: " + error.message }); setBusy(false); return; }

      if (uploadedAny) {
        supabase.functions.invoke("review-contractor", { body: { contractor_id: profile.id } }).catch(() => {});
      }
      setDocFiles({ insurance: null, wcb: null, certification: null, gov_id: null });
      onSaved(patch);
      setMsg({ kind: "ok", text: "Saved. Thanks — we'll review anything new within 24 hours." });
    } finally {
      setBusy(false);
    }
  };

  const lbl: React.CSSProperties = { display: "block", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(var(--ff-muted), .55)", marginBottom: ".5rem" };
  const inp: React.CSSProperties = { width: "100%", padding: ".55rem .7rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".85rem", boxSizing: "border-box" };
  const chip = (on: boolean): React.CSSProperties => ({ padding: ".5rem .85rem", borderRadius: "99px", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600, border: on ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .14)", background: on ? "rgba(234,107,20,.16)" : "rgba(var(--ff-fg), .05)", color: on ? "#ea6b14" : "rgba(var(--ff-muted), .7)" });
  const checkRow = (checked: boolean, onChange: (v: boolean) => void, text: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: ".55rem", fontSize: ".85rem", color: "var(--ff-text)", cursor: "pointer", marginBottom: ".6rem" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: "#ea6b14", width: 16, height: 16 }} />
      {text}
    </label>
  );

  return (
    <div>
      {/* Service area */}
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={lbl}>Service area — which parts of Calgary do you cover?</span>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          {AREAS.map(z => <button key={z} type="button" onClick={() => toggleArea(z)} style={chip(area.includes(z))}>{z}</button>)}
        </div>
      </div>

      {/* Business name */}
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={lbl}>Business name (optional)</span>
        <input style={inp} placeholder="e.g. Bow River Handyman" value={companyName} onChange={e => setCompanyName(e.target.value)} />
      </div>

      {/* Work type */}
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={lbl}>What best describes your work?</span>
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {WORK_TYPES.map(w => (
            <button key={w.id} type="button" onClick={() => setWorkType(w.id)}
              style={{ textAlign: "left", padding: ".7rem .9rem", borderRadius: "10px", cursor: "pointer", fontFamily: "inherit",
                border: workType === w.id ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .12)",
                background: workType === w.id ? "rgba(234,107,20,.1)" : "rgba(var(--ff-fg), .04)", color: "var(--ff-text)" }}>
              <div style={{ fontSize: ".88rem", fontWeight: 600 }}>{w.label}</div>
              <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .6)", marginTop: ".15rem" }}>{w.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Credentials */}
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={lbl}>Licensing & insurance</span>
        {checkRow(licensed, setLicensed, "I hold a provincial trade licence")}
        {licensed && <input style={{ ...inp, marginBottom: ".8rem" }} placeholder="Licence number" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />}
        {checkRow(hasInsurance, setHasInsurance, "I carry liability insurance")}
        {hasInsurance && (
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: ".8rem" }}>
            <input style={{ ...inp, flex: "1 1 160px" }} placeholder="Insurance provider" value={insuranceProvider} onChange={e => setInsuranceProvider(e.target.value)} />
            <input style={{ ...inp, flex: "1 1 130px" }} type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} />
          </div>
        )}
        {checkRow(hasWcb, setHasWcb, "I have WCB coverage")}
      </div>

      {/* References */}
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={lbl}>References (optional)</span>
        <textarea style={{ ...inp, resize: "vertical" }} rows={2} placeholder="Names / phone numbers of past clients who can vouch for your work" value={workReferences} onChange={e => setWorkReferences(e.target.value)} />
      </div>

      {/* Documents */}
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={lbl}>Verification documents (JPG/PNG/PDF, under 10MB each)</span>
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {(Object.keys(DOC_LABELS) as DocKey[]).map(key => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px", fontSize: ".82rem", color: "var(--ff-text)" }}>
                {DOC_LABELS[key]}
                {existingDocs[key] && !docFiles[key] && <span style={{ color: "#22c55e", marginLeft: ".4rem", fontSize: ".76rem" }}>✓ on file</span>}
                {docFiles[key] && <span style={{ color: "#ea6b14", marginLeft: ".4rem", fontSize: ".76rem" }}>{docFiles[key]!.name}</span>}
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={e => pickDoc(key, e.target.files?.[0] ?? null)} style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)" }} />
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div style={{ padding: ".65rem .85rem", borderRadius: "8px", fontSize: ".82rem", marginBottom: ".9rem",
          background: msg.kind === "ok" ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
          border: msg.kind === "ok" ? "1px solid rgba(34,197,94,.25)" : "1px solid rgba(239,68,68,.25)",
          color: msg.kind === "ok" ? "#22c55e" : "var(--ff-danger)" }}>{msg.text}</div>
      )}
      <button onClick={save} disabled={busy}
        style={{ padding: ".7rem 1.4rem", borderRadius: "8px", border: "none", background: "#ea6b14", color: "#fff", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>
        {busy ? "Saving…" : "Save profile details"}
      </button>
    </div>
  );
}
