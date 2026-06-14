import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  requestId: string;
  photoPath?: string | null;
  estimatedQuote?: number | null;
  quoteNotes?: string | null;
  canQuote?: boolean;
}

export default function RequestPhotoQuote({ requestId, photoPath, estimatedQuote, quoteNotes, canQuote }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(estimatedQuote?.toString() ?? "");
  const [notes, setNotes] = useState(quoteNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<number | null>(estimatedQuote ?? null);
  const [currentNotes, setCurrentNotes] = useState<string | null>(quoteNotes ?? null);

  useEffect(() => {
    if (!photoPath) return;
    supabase.storage.from("request-photos").createSignedUrl(photoPath, 3600)
      .then(({ data }) => setPhotoUrl(data?.signedUrl ?? null));
  }, [photoPath]);

  const saveQuote = async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { alert("Enter a valid quote amount."); return; }
    setBusy(true);
    const { error } = await supabase
      .from("client_requests")
      .update({ estimated_quote: parsed, quote_notes: notes || null })
      .eq("id", requestId);
    setBusy(false);
    if (error) { alert("Couldn't save quote: " + error.message); return; }
    setCurrentQuote(parsed);
    setCurrentNotes(notes || null);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!photoPath && !canQuote && !currentQuote) return null;

  const s: Record<string, React.CSSProperties> = {
    wrap: { marginTop: "1rem", display: "flex", flexDirection: "column", gap: ".75rem" },
    photo: { width: "100%", maxWidth: "320px", borderRadius: "10px", display: "block", border: "1px solid rgba(255,255,255,.08)" },
    quoteBox: { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: "8px", padding: ".85rem 1rem" },
    label: { fontSize: ".7rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(190,205,235,.4)", marginBottom: ".3rem" },
    amount: { fontSize: "1.2rem", fontWeight: 600, color: "#f0f4ff" },
    noteText: { fontSize: ".82rem", color: "rgba(190,205,235,.65)", marginTop: ".35rem", lineHeight: 1.5 },
    input: { width: "100%", padding: ".55rem .75rem", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: "7px", color: "#f0f4ff", fontFamily: "inherit", fontSize: ".88rem", boxSizing: "border-box" as const },
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

      {(currentQuote || canQuote) && (
        <div style={s.quoteBox}>
          {!editing ? (
            <>
              <div style={s.label}>Estimated quote</div>
              {currentQuote ? (
                <div style={s.amount}>${currentQuote.toLocaleString()}</div>
              ) : (
                <div style={{ fontSize: ".82rem", color: "rgba(190,205,235,.4)" }}>No quote yet</div>
              )}
              {currentNotes && <div style={s.noteText}>{currentNotes}</div>}
              {saved && <div style={{ fontSize: ".78rem", color: "#22c55e", marginTop: ".4rem" }}>✓ Quote saved</div>}
              {canQuote && (
                <button style={{ ...s.btn, marginTop: ".65rem", background: "rgba(255,255,255,.07)", color: "rgba(190,205,235,.8)", border: "1px solid rgba(255,255,255,.1)" }}
                  onClick={() => { setAmount(currentQuote?.toString() ?? ""); setNotes(currentNotes ?? ""); setEditing(true); }}>
                  {currentQuote ? "Edit quote" : "Add quote"}
                </button>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: ".55rem" }}>
              <div>
                <div style={s.label}>Quote amount ($)</div>
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
                  {busy ? "Saving…" : "Save quote"}
                </button>
                <button style={{ ...s.btn, background: "rgba(255,255,255,.06)", color: "rgba(190,205,235,.7)", border: "1px solid rgba(255,255,255,.1)" }}
                  disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
