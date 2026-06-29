import { useState } from "react";
import { supabase } from "@/lib/supabase";

const REASONS = [
  "Work was not completed",
  "Work was poor quality",
  "Damage was caused",
  "Contractor never showed up",
  "Charged more than agreed",
  "Something else",
];

const REMEDIES = [
  "Have the work redone or fixed",
  "A partial refund",
  "A full refund",
  "Not sure / other",
];

export default function ReportProblem({
  jobId,
  userId,
  onClose,
  onSubmitted,
}: {
  jobId: string;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [reason, setReason] = useState(REASONS[0]);
  const [serviceDate, setServiceDate] = useState("");
  const [agreedScope, setAgreedScope] = useState("");
  const [description, setDescription] = useState("");
  const [remedy, setRemedy] = useState(REMEDIES[0]);
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [declarant, setDeclarant] = useState("");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)].slice(0, 5));
  };

  const submit = async () => {
    if (!description.trim()) { setErr("Please describe what went wrong."); return; }
    if (!declared) { setErr("Please confirm the declaration before submitting."); return; }
    if (!declarant.trim()) { setErr("Please type your full name to sign the declaration."); return; }
    setBusy(true);
    setErr(null);
    try {
      const paths: string[] = [];
      for (const f of files) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const key = `${userId}/${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("problem-photos").upload(key, f, { upsert: false });
        if (upErr) throw new Error("Photo upload failed: " + upErr.message);
        paths.push(key);
      }
      const { error } = await supabase.rpc("open_dispute", {
        p_job_id: jobId,
        p_reason: reason,
        p_description: description.trim(),
        p_service_date: serviceDate || null,
        p_agreed_scope: agreedScope.trim() || null,
        p_requested_remedy: remedy,
        p_amount_in_dispute: amount ? Number(amount) : null,
        p_declarant_name: declarant.trim(),
        p_photo_paths: paths,
      });
      if (error) throw new Error(error.message);
      onSubmitted();
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  };

  const label = { fontSize: ".72rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", marginBottom: ".35rem", display: "block" };
  const field = { width: "100%", padding: ".6rem .8rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".88rem", boxSizing: "border-box" as const };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "480px", maxHeight: "90vh", overflowY: "auto",
          background: "var(--ff-bg)", border: "1px solid rgba(var(--ff-fg), .12)",
          borderRadius: "16px", padding: "1.5rem", color: "var(--ff-text)",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)",
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.4rem", letterSpacing: ".05em", color: "#ea6b14", marginBottom: ".4rem" }}>
          File a Claim
        </div>
        <div style={{ fontSize: ".84rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
          This is an official claim under the Homeowner Protection Promise. Your payment stays <strong>held and protected</strong> while we review it &mdash; nothing is released to the contractor in the meantime. The contractor is given a chance to respond before our team decides.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>What went wrong?</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...field, cursor: "pointer" }}>
            {REASONS.map(r => <option key={r} value={r} style={{ background: "var(--ff-bg)" }}>{r}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Date of service</label>
          <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} style={{ ...field, cursor: "pointer" }} />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>What was agreed?</label>
          <textarea
            value={agreedScope}
            rows={2}
            placeholder="What the contractor agreed to do (scope, price, timeline)…"
            onChange={e => setAgreedScope(e.target.value)}
            style={{ ...field, resize: "vertical" as const }}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Describe the issue *</label>
          <textarea
            value={description}
            rows={4}
            placeholder="Tell us exactly what happened, in your own words…"
            onChange={e => setDescription(e.target.value)}
            style={{ ...field, resize: "vertical" as const }}
          />
        </div>

        <div style={{ display: "flex", gap: ".8rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={label}>What outcome do you want?</label>
            <select value={remedy} onChange={e => setRemedy(e.target.value)} style={{ ...field, cursor: "pointer" }}>
              {REMEDIES.map(r => <option key={r} value={r} style={{ background: "var(--ff-bg)" }}>{r}</option>)}
            </select>
          </div>
          <div style={{ width: "130px" }}>
            <label style={label}>Amount ($)</label>
            <input type="number" min="0" step="0.01" value={amount} placeholder="Optional" onChange={e => setAmount(e.target.value)} style={field} />
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Add photos (optional, up to 5)</label>
          <input type="file" accept="image/*" multiple onChange={e => addFiles(e.target.files)} style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .7)" }} />
          {files.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: ".6rem" }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: ".4rem", padding: ".3rem .6rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)", borderRadius: "6px", fontSize: ".76rem" }}>
                  <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(var(--ff-muted), .6)", cursor: "pointer", fontSize: ".9rem", lineHeight: 1, padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: "10px", padding: ".9rem 1rem", marginBottom: "1rem" }}>
          <label style={{ display: "flex", gap: ".6rem", alignItems: "flex-start", cursor: "pointer", fontSize: ".82rem", lineHeight: 1.5, color: "rgba(var(--ff-fg), .9)" }}>
            <input type="checkbox" checked={declared} onChange={e => setDeclared(e.target.checked)} style={{ marginTop: ".2rem", accentColor: "#ea6b14" }} />
            <span>I declare that the information in this claim is true and accurate to the best of my knowledge. I understand that filing a false claim may result in my account being removed.</span>
          </label>
          <div style={{ marginTop: ".8rem" }}>
            <label style={label}>Sign &mdash; type your full name *</label>
            <input value={declarant} placeholder="Your full legal name" onChange={e => setDeclarant(e.target.value)} style={field} />
          </div>
        </div>

        {err && <div style={{ fontSize: ".82rem", color: "#f87171", marginBottom: ".75rem" }}>{err}</div>}

        <div style={{ display: "flex", gap: ".6rem", marginTop: ".5rem" }}>
          <button
            onClick={submit}
            disabled={busy}
            style={{ flex: 1, padding: ".75rem 1rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, cursor: busy ? "default" : "pointer", opacity: busy ? .7 : 1 }}
          >
            {busy ? "Submitting…" : "Submit claim"}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: ".75rem 1.1rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)", borderRadius: "8px", color: "rgba(var(--ff-muted), .7)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
