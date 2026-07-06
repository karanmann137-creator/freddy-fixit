import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  requestId: string;
  photoPath?: string | null;
  estimatedQuote?: number | null;
  quoteNotes?: string | null;
  canQuote?: boolean;
  canUpload?: boolean;
}

export default function RequestPhotoQuote({ requestId, photoPath, estimatedQuote, quoteNotes, canQuote, canUpload }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(photoPath ?? null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(estimatedQuote?.toString() ?? "");
  const [notes, setNotes] = useState(quoteNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<number | null>(estimatedQuote ?? null);
  const [currentNotes, setCurrentNotes] = useState<string | null>(quoteNotes ?? null);

  useEffect(() => {
    if (!currentPath) { setPhotoUrl(null); return; }
    supabase.storage.from("problem-photos").createSignedUrl(currentPath, 3600)
      .then(({ data }) => setPhotoUrl(data?.signedUrl ?? null));
  }, [currentPath]);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setUploading(false); alert("Please sign in again to add a photo."); return; }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = uid + "/" + crypto.randomUUID() + "." + ext;
    const up = await supabase.storage.from("problem-photos").upload(path, file, { upsert: false });
    if (up.error) { setUploading(false); alert("Couldn't upload photo: " + up.error.message); return; }
    const { error } = await supabase.from("client_requests").update({ photo_path: path }).eq("id", requestId);
    setUploading(false);
    if (error) { alert("Couldn't attach photo: " + error.message); return; }
    setCurrentPath(path);
  };

  const saveQuote = async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { alert("Enter a valid estimate amount."); return; }
    setBusy(true);
    const { error } = await supabase
      .from("client_requests")
      .update({ estimated_quote: parsed, quote_notes: notes || null })
      .eq("id", requestId);
    setBusy(false);
    if (error) { alert("Couldn't save estimate: " + error.message); return; }
    setCurrentQuote(parsed);
    setCurrentNotes(notes || null);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!currentPath && !canQuote && !currentQuote && !canUpload) return null;

  const s: Record<string, React.CSSProperties> = {
    wrap: { marginTop: "1rem", display: "flex", flexDirection: "column", gap: ".75rem" },
    photo: { width: "100%", maxWidth: "320px", borderRadius: "10px", display: "block", border: "1px solid rgba(var(--ff-fg), .08)" },
    quoteBox: { background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: "8px", padding: ".85rem 1rem" },
    label: { fontSize: ".7rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(var(--ff-muted), .4)", marginBottom: ".3rem" },
    amount: { fontSize: "1.2rem", fontWeight: 600, color: "var(--ff-text)" },
    noteText: { fontSize: ".82rem", color: "rgba(var(--ff-muted), .65)", marginTop: ".35rem", lineHeight: 1.5 },
    input: { width: "100%", padding: ".55rem .75rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "7px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".88rem", boxSizing: "border-box" as const },
    btn: { padding: ".45rem .9rem", borderRadius: "6px", border: "none", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 500, cursor: "pointer" },
  };

  return (
    <div style={s.wrap}>
      {photoUrl && (
        <div>
          <div style={s.label}>Job photo</div>
          <img src={photoUrl} alt="Job photo" style={s.photo} />
        </div>
      )}

      {canUpload && (
        <div>
          {!photoUrl && <div style={s.label}>Add a photo</div>}
          <label style={{ ...s.btn, display: "inline-block", background: "rgba(var(--ff-fg), .07)", color: "rgba(var(--ff-muted), .8)", border: "1px solid rgba(var(--ff-fg), .1)", cursor: uploading ? "default" : "pointer" }}>
            {uploading ? "Uploading…" : photoUrl ? "Replace photo" : "Upload a photo"}
            <input type="file" accept="image/*" disabled={uploading} style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
          </label>
          {!photoUrl && <div style={{ fontSize: ".75rem", color: "rgba(var(--ff-muted), .45)", marginTop: ".35rem" }}>A photo helps contractors estimate accurately.</div>}
        </div>
      )}

      {(currentQuote || canQuote) && (
        <div style={s.quoteBox}>
          {!editing ? (
            <>
              <div style={s.label}>Estimate</div>
              {currentQuote ? (
                <div style={s.amount}>${currentQuote.toLocaleString()}</div>
              ) : (
                <div style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .4)" }}>No estimate yet</div>
              )}
              {currentNotes && <div style={s.noteText}>{currentNotes}</div>}
              {saved && <div style={{ fontSize: ".78rem", color: "#22c55e", marginTop: ".4rem" }}>✓ Estimate saved</div>}
              {canQuote && (
                <button style={{ ...s.btn, marginTop: ".65rem", background: "rgba(var(--ff-fg), .07)", color: "rgba(var(--ff-muted), .8)", border: "1px solid rgba(var(--ff-fg), .1)" }}
                  onClick={() => { setAmount(currentQuote?.toString() ?? ""); setNotes(currentNotes ?? ""); setEditing(true); }}>
                  {currentQuote ? "Edit estimate" : "Add estimate"}
                </button>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: ".55rem" }}>
              <div>
                <div style={s.label}>Estimate amount ($)</div>
                <input type="number" min="0" step="0.01" placeholder="e.g. 250" value={amount}
                  onChange={e => setAmount(e.target.value)} style={s.input} />
              </div>
              <div>
                <div style={s.label}>Notes (optional)</div>
                <textarea rows={2} placeholder="e.g. Includes parts and labour" value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ ...s.input, resize: "vertical" as const }} />
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <button style={{ ...s.btn, background: "#ea6b14", color: "#fff" }} disabled={busy} onClick={saveQuote}>
                  {busy ? "Saving…" : "Save estimate"}
                </button>
                <button style={{ ...s.btn, background: "rgba(var(--ff-fg), .06)", color: "rgba(var(--ff-muted), .7)", border: "1px solid rgba(var(--ff-fg), .1)" }}
                  disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
