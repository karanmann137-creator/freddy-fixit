import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";
import { scanImage, shouldBlock, rejectMessage } from "@/lib/imageSafety";
import FadeImg from "@/components/FadeImg";

/**
 * The anchor the "add a photo" attention row scrolls to. It is exported so the
 * row and the panel can never name different ids — the same reason
 * ContractPanel exports CONTRACT_ANCHOR.
 */
export const PHOTO_ANCHOR = "ffc-photo";

interface Props {
  requestId: string;
  photoPath?: string | null;
  estimatedQuote?: number | null;
  quoteNotes?: string | null;
  canQuote?: boolean;
  canUpload?: boolean;
  /** Renders the orange pulse ring, driven by the dashboard's pulseAnchor. */
  highlight?: boolean;
}

export default function RequestPhotoQuote({ requestId, photoPath, estimatedQuote, quoteNotes, canQuote, canUpload, highlight }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(photoPath ?? null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(estimatedQuote?.toString() ?? "");
  const [notes, setNotes] = useState(quoteNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Was alert(). An alert is a dead end on a phone — it can't be re-read, and
  // it can't sit next to the button that would fix it.
  const [uploadErr, setUploadErr] = useState("");
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
    setUploadErr("");
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setUploading(false); setUploadErr("Please sign in again to add a photo."); return; }
    const small = await compressImage(file, "photo");
    const ext = (small.name.split(".").pop() || "jpg").toLowerCase();
    const path = uid + "/" + crypto.randomUUID() + "." + ext;
    const up = await supabase.storage.from("problem-photos").upload(path, small, { upsert: false, contentType: small.type || undefined });
    if (up.error) { setUploading(false); setUploadErr("Couldn't upload that photo: " + up.error.message); return; }
    // Safety scan before the photo is linked to the request. It fails open —
    // only a real "reject" verdict stops it, and an outage or a timeout comes
    // back "unknown" and attaches the photo as normal. A request photo is what
    // gets someone an accurate estimate; losing one to a scanner problem would
    // be a worse outcome than the thing the scan is guarding against.
    const scan = await scanImage("problem-photos", path);
    if (shouldBlock(scan)) { setUploading(false); setUploadErr(rejectMessage(scan)); return; }
    const { error } = await supabase.from("client_requests").update({ photo_path: path }).eq("id", requestId);
    setUploading(false);
    if (error) { setUploadErr("Couldn't attach that photo: " + error.message); return; }
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
    <div id={PHOTO_ANCHOR} className={highlight ? "ff-pulse" : undefined} style={{ ...s.wrap, scrollMarginTop: "5.5rem" }}>
      {photoUrl && (
        <div>
          <div style={s.label}>Job photo</div>
          <FadeImg src={photoUrl} alt="Job photo" style={s.photo} />
        </div>
      )}

      {canUpload && (
        <div>
          {/* The advisory only appears while there is genuinely no photo, and it
              says the same thing the onboarding nudge says — that a photo buys a
              firm number rather than a ballpark. Same promise in both places, or
              one of them is teaching the wrong lesson. */}
          {!photoUrl && (
            <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.28)", borderRadius: "8px", padding: ".8rem 1rem", marginBottom: ".65rem", fontSize: ".82rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .85)" }}>
              <strong style={{ color: "var(--ff-text)" }}>Add a photo to get firmer estimates.</strong>{" "}
              Pros price what they can see. Without one you're more likely to get a wide ballpark, or a pro who wants to visit before quoting. It only takes a second and you can add it now.
            </div>
          )}
          <label style={{ ...s.btn, display: "inline-block", background: photoUrl ? "rgba(var(--ff-fg), .07)" : "#ea6b14", color: photoUrl ? "rgba(var(--ff-muted), .8)" : "#fff", border: photoUrl ? "1px solid rgba(var(--ff-fg), .1)" : "none", cursor: uploading ? "default" : "pointer" }}>
            {uploading ? "Uploading…" : photoUrl ? "Replace photo" : "Upload a photo"}
            <input type="file" accept="image/*" disabled={uploading} style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (!f) return; uploadPhoto(f); e.target.value = ""; }} />
          </label>
          {uploadErr && <div style={{ fontSize: ".8rem", color: "var(--ff-danger)", marginTop: ".45rem", lineHeight: 1.5 }}>{uploadErr}</div>}
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
