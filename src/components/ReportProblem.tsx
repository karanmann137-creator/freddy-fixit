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
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)].slice(0, 5));
  };

  const submit = async () => {
    if (!description.trim()) { setErr("Please describe what went wrong."); return; }
    setBusy(true);
    setErr(null);
    try {
      // Upload any photos to problem-photos/<uid>/<file>
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
        p_photo_paths: paths,
      });
      if (error) throw new Error(error.message);
      onSubmitted();
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  };

  const label = { fontSize: ".72rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(190,205,235,.5)", marginBottom: ".35rem", display: "block" };
  const field = { width: "100%", padding: ".6rem .8rem", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: "8px", color: "#f0f4ff", fontFamily: "inherit", fontSize: ".88rem", boxSizing: "border-box" as const };

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
          width: "100%", maxWidth: "440px", maxHeight: "90vh", overflowY: "auto",
          background: "#1a2236", border: "1px solid rgba(255,255,255,.12)",
          borderRadius: "16px", padding: "1.5rem", color: "#f0f4ff",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)",
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.4rem", letterSpacing: ".05em", color: "#ea6b14", marginBottom: ".4rem" }}>
          Report a Problem
        </div>
        <div style={{ fontSize: ".84rem", color: "rgba(190,205,235,.7)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
          Your payment stays <strong>held and protected</strong> while we review this. Our team will look into it and decide on a refund — nothing is released to the contractor in the meantime.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>What went wrong?</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...field, cursor: "pointer" }}>
            {REASONS.map(r => <option key={r} value={r} style={{ background: "#1a2236" }}>{r}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Tell us what happened</label>
          <textarea
            value={description}
            rows={4}
            placeholder="Describe the issue in your own words…"
            onChange={e => setDescription(e.target.value)}
            style={{ ...field, resize: "vertical" as const }}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Add photos (optional, up to 5)</label>
          <input type="file" accept="image/*" multiple onChange={e => addFiles(e.target.files)} style={{ fontSize: ".82rem", color: "rgba(190,205,235,.7)" }} />
          {files.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: ".6rem" }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: ".4rem", padding: ".3rem .6rem", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "6px", fontSize: ".76rem" }}>
                  <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(190,205,235,.6)", cursor: "pointer", fontSize: ".9rem", lineHeight: 1, padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <div style={{ fontSize: ".82rem", color: "#f87171", marginBottom: ".75rem" }}>{err}</div>}

        <div style={{ display: "flex", gap: ".6rem", marginTop: ".5rem" }}>
          <button
            onClick={submit}
            disabled={busy}
            style={{ flex: 1, padding: ".75rem 1rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, cursor: busy ? "default" : "pointer", opacity: busy ? .7 : 1 }}
          >
            {busy ? "Submitting…" : "Submit report"}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: ".75rem 1.1rem", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "8px", color: "rgba(190,205,235,.7)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
