import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Contractor's side of the story on an open claim. Mirrors the client's claim
// form: a written response plus optional photos, submitted via respond_to_dispute.
export default function RespondToClaim({
  disputeId,
  userId,
  claim,
  onClose,
  onSubmitted,
}: {
  disputeId: string;
  userId: string;
  claim: any;
  onClose: () => void;
  onSubmitted: (response: string) => void;
}) {
  const [response, setResponse] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)].slice(0, 5));
  };

  const submit = async () => {
    if (!response.trim()) { setErr("Please write your response."); return; }
    setBusy(true);
    setErr(null);
    try {
      const paths: string[] = [];
      for (const f of files) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const key = `${userId}/resp-${disputeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("problem-photos").upload(key, f, { upsert: false });
        if (upErr) throw new Error("Photo upload failed: " + upErr.message);
        paths.push(key);
      }
      const { error } = await supabase.rpc("respond_to_dispute", {
        p_dispute_id: disputeId,
        p_response: response.trim(),
        p_photos: paths,
      });
      if (error) throw new Error(error.message);
      onSubmitted(response.trim());
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
          width: "100%", maxWidth: "460px", maxHeight: "90vh", overflowY: "auto",
          background: "var(--ff-bg)", border: "1px solid rgba(var(--ff-fg), .12)",
          borderRadius: "16px", padding: "1.5rem", color: "var(--ff-text)",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)",
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.4rem", letterSpacing: ".05em", color: "#ea6b14", marginBottom: ".4rem" }}>
          Respond to Claim
        </div>
        <div style={{ fontSize: ".84rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.5, marginBottom: "1rem" }}>
          The client filed a claim on this job. Share your side &mdash; what was done, and anything that helps explain what happened. Our team reviews both sides before deciding.
        </div>

        {claim?.reason && (
          <div style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: "10px", padding: ".75rem .9rem", marginBottom: "1rem" }}>
            <div style={{ ...label, marginBottom: ".25rem" }}>The client's claim</div>
            <div style={{ fontSize: ".85rem", fontWeight: 600, marginBottom: ".2rem" }}>{claim.reason}</div>
            {claim.description && <div style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .8)", lineHeight: 1.5 }}>{claim.description}</div>}
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Your response *</label>
          <textarea
            value={response}
            rows={5}
            placeholder="Explain your side in your own words…"
            onChange={e => setResponse(e.target.value)}
            style={{ ...field, resize: "vertical" as const }}
          />
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

        {err && <div style={{ fontSize: ".82rem", color: "#f87171", marginBottom: ".75rem" }}>{err}</div>}

        <div style={{ display: "flex", gap: ".6rem", marginTop: ".5rem" }}>
          <button
            onClick={submit}
            disabled={busy}
            style={{ flex: 1, padding: ".75rem 1rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, cursor: busy ? "default" : "pointer", opacity: busy ? .7 : 1 }}
          >
            {busy ? "Submitting…" : "Submit response"}
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
