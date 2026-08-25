import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";
import FadeImg from "@/components/FadeImg";

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

// Anchor ids for the sections a contractor can still be missing. The dashboard
// scrolls to one of these and passes it as `highlight` so the section pulses.
export const GAP_ANCHORS = {
  photo: "cpc-photo",
  area: "cpc-area",
  work_type: "cpc-worktype",
  credentials: "cpc-credentials",
  docs: "cpc-docs",
} as const;

export default function ContractorProfileCompletion({
  profile, contractor, onSaved, highlight,
}: { profile: any; contractor: any; onSaved: (patch: any) => void; highlight?: string | null }) {
  const [area, setArea] = useState<string[]>(contractor?.service_area ?? []);
  const [companyName, setCompanyName] = useState<string>(contractor?.company_name ?? "");
  const [workType, setWorkType] = useState<string>(contractor?.work_type ?? "");
  const [licensed, setLicensed] = useState<boolean>(!!contractor?.licensed);
  const [licenseNumber, setLicenseNumber] = useState<string>(contractor?.license_number ?? "");
  const [hasInsurance, setHasInsurance] = useState<boolean>(!!contractor?.has_liability_insurance);
  const [insuranceProvider, setInsuranceProvider] = useState<string>(contractor?.insurance_provider ?? "");
  const [insuranceExpiry, setInsuranceExpiry] = useState<string>(contractor?.insurance_expiry ?? "");
  const [hasWcb, setHasWcb] = useState<boolean>(!!contractor?.has_wcb);
  const [operatesAlone, setOperatesAlone] = useState<boolean>(!!contractor?.operates_alone);
  const [workReferences, setWorkReferences] = useState<string>(contractor?.work_references ?? "");
  const [docFiles, setDocFiles] = useState<Record<DocKey, File | null>>({ insurance: null, wcb: null, certification: null, gov_id: null });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const existingDocs: Record<string, string> = contractor?.doc_urls ?? {};

  // Section wrapper props: a scroll anchor, plus the pulse ring when the
  // dashboard is pointing the contractor at this particular gap.
  const sect = (anchor: string) => ({
    id: anchor,
    className: highlight === anchor ? "ff-pulse" : undefined,
    style: { marginBottom: "1.5rem", borderRadius: "10px", scrollMarginTop: "5.5rem" } as React.CSSProperties,
  });

  const toggleArea = (z: string) => setArea(prev => prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z]);

  const pickDoc = (key: DocKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return; // picker cancelled — keep any previously chosen file
    setMsg(null);
    const t = (f.type || "").toLowerCase();
    const n = f.name.toLowerCase();
    const okType = t.startsWith("image/") || t === "application/pdf" || /\.(pdf|jpe?g|png|webp|gif|heic|heif)$/.test(n);
    if (!okType) { setMsg({ kind: "err", text: "Please upload a PDF or a photo (JPG, PNG, HEIC)." }); e.target.value = ""; return; }
    if (f.size > 10 * 1024 * 1024) { setMsg({ kind: "err", text: DOC_LABELS[key] + " must be under 10MB." }); e.target.value = ""; return; }
    setDocFiles(prev => ({ ...prev, [key]: f }));
  };

  // iPhone photos frequently arrive with an EMPTY f.type, so a strict MIME
  // whitelist silently rejects perfectly good pictures — fall back to the
  // filename extension. And a cancelled picker returns no file at all, so we
  // return early rather than wiping a selection the contractor already made.
  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg(null);
    const t = (f.type || "").toLowerCase();
    const okType = t.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(f.name.toLowerCase());
    // Reset the input on reject, otherwise re-picking the SAME file fires no
    // onChange and the contractor gets no feedback at all the second time.
    if (!okType) { setMsg({ kind: "err", text: "Please choose a photo (JPG, PNG or HEIC)." }); e.target.value = ""; return; }
    if (f.size > 10 * 1024 * 1024) { setMsg({ kind: "err", text: "Your photo must be under 10MB." }); e.target.value = ""; return; }
    setPhotoFile(f);
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
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
        // Gentle profile: the AI reviewer and the owner both have to read the
        // small print on these. PDFs pass through untouched.
        const doc = await compressImage(file, "document");
        const ext = (doc.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${profile.id}/${key}.${ext}`;
        const { error: upErr } = await supabase.storage.from("contractor-docs").upload(path, doc, { upsert: true, contentType: doc.type || undefined });
        if (upErr) { setMsg({ kind: "err", text: `Couldn't upload ${DOC_LABELS[key]}: ${upErr.message}` }); setBusy(false); return; }
        docUrls[key] = path;
        uploadedAny = true;
      }

      // Profile photo. Same bucket + path convention as signup so a contractor
      // who added one there just overwrites it. The bucket is public, so the
      // URL can be stored directly and shown to clients with no signing.
      let photoUrl: string | null = contractor?.photo_url ?? null;
      if (photoFile) {
        const smallPhoto = await compressImage(photoFile, "avatar");
        const pext = (smallPhoto.name.split(".").pop() || "jpg").toLowerCase();
        const ppath = `${profile.id}/avatar.${pext}`;
        const { error: pErr } = await supabase.storage.from("contractor-photos").upload(ppath, smallPhoto, { upsert: true, contentType: smallPhoto.type || undefined });
        if (pErr) { setMsg({ kind: "err", text: "Couldn't upload your photo: " + pErr.message }); setBusy(false); return; }
        const { data: pub } = supabase.storage.from("contractor-photos").getPublicUrl(ppath);
        // Overwriting the same path leaves the old image in the CDN cache, so
        // stamp the URL — without this a replaced photo looks like it didn't save.
        photoUrl = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : photoUrl;
      }

      const patch = {
        photo_url: photoUrl,
        service_area: area,
        company_name: companyName || null,
        work_type: workType || null,
        licensed,
        license_number: licenseNumber || null,
        has_liability_insurance: hasInsurance,
        insurance_provider: insuranceProvider || null,
        insurance_expiry: insuranceExpiry || null,
        has_wcb: operatesAlone ? false : hasWcb,
        operates_alone: operatesAlone,
        work_references: workReferences || null,
        doc_urls: docUrls,
      };
      const { error } = await supabase.from("contractors").update(patch).eq("id", profile.id);
      if (error) { setMsg({ kind: "err", text: "Couldn't save: " + error.message }); setBusy(false); return; }

      if (uploadedAny) {
        supabase.functions.invoke("review-contractor", { body: { contractor_id: profile.id } }).catch(() => {});
      }
      setDocFiles({ insurance: null, wcb: null, certification: null, gov_id: null });
      setPhotoFile(null);
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
      {/* Profile photo — the one thing on this page a client actually sees. */}
      <div {...sect(GAP_ANCHORS.photo)}>
        <span style={lbl}>Profile photo</span>
        <div style={{ display: "flex", alignItems: "center", gap: ".9rem", flexWrap: "wrap" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", flex: "0 0 auto",
            background: "rgba(234,107,20,.14)", border: "1px solid rgba(var(--ff-fg), .12)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            {(photoPreview || contractor?.photo_url)
              ? <FadeImg src={photoPreview || contractor.photo_url} alt="Your profile photo" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} />
              : <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ea6b14" }}>
                  {((profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "")).toUpperCase() || "?"}
                </span>}
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            {/* accept without `capture` so a pro can attach a photo they already took. */}
            <input type="file" accept="image/*" onChange={pickPhoto} style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)", maxWidth: "100%" }} />
            <p style={{ fontSize: ".74rem", color: "rgba(var(--ff-muted), .55)", margin: ".4rem 0 0", lineHeight: 1.5 }}>
              Clients see this next to your estimate. A clear photo of your face — or your logo — gets picked noticeably more often than a blank circle.
              {photoFile ? " Press Save below to finish." : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Service area */}
      <div {...sect(GAP_ANCHORS.area)}>
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
      <div {...sect(GAP_ANCHORS.work_type)}>
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
      <div {...sect(GAP_ANCHORS.credentials)}>
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
        {checkRow(operatesAlone, (v) => { setOperatesAlone(v); if (v) setHasWcb(false); }, "I operate alone (no employees) — WCB not required")}
        {operatesAlone
          ? <p style={{ fontSize: ".74rem", color: "rgba(var(--ff-muted), .55)", margin: "-.2rem 0 .2rem 1.6rem", lineHeight: 1.5 }}>Solo operators with no workers are WCB-exempt in Alberta.</p>
          : checkRow(hasWcb, setHasWcb, "I have WCB coverage")}
      </div>

      {/* References */}
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={lbl}>References (optional)</span>
        <textarea style={{ ...inp, resize: "vertical" }} rows={2} placeholder="Names / phone numbers of past clients who can vouch for your work" value={workReferences} onChange={e => setWorkReferences(e.target.value)} />
      </div>

      {/* Documents */}
      <div {...sect(GAP_ANCHORS.docs)}>
        <span style={lbl}>Verification documents (JPG/PNG/PDF, under 10MB each)</span>
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {(Object.keys(DOC_LABELS) as DocKey[]).map(key => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px", fontSize: ".82rem", color: "var(--ff-text)" }}>
                {DOC_LABELS[key]}
                {existingDocs[key] && !docFiles[key] && <span style={{ color: "#22c55e", marginLeft: ".4rem", fontSize: ".76rem" }}>✓ on file</span>}
                {docFiles[key] && <span style={{ color: "#ea6b14", marginLeft: ".4rem", fontSize: ".76rem" }}>{docFiles[key]!.name}</span>}
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={e => pickDoc(key, e)} style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)" }} />
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
