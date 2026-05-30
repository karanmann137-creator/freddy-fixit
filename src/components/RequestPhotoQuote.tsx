import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  requestId: string;
  photoPath?: string | null;
  estimatedQuote?: number | string | null;
  quoteNotes?: string | null;
  canQuote?: boolean;
}

export default function RequestPhotoQuote({ requestId, photoPath, estimatedQuote, quoteNotes, canQuote = false }: Props) {
  const initialQuote = estimatedQuote == null ? null : Number(estimatedQuote);
  const [url, setUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState(initialQuote == null ? "" : String(initialQuote));
  const [notes, setNotes] = useState(quoteNotes ?? "");
  const [savedQuote, setSavedQuote] = useState<number | null>(initialQuote);
  const [savedNotes, setSavedNotes] = useState<string | null>(quoteNotes ?? null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let active = true;
    if (photoPath) {
      supabase.storage.from("problem-photos").createSignedUrl(photoPath, 3600).then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    }
    return () => { active = false; };
  }, [photoPath]);

  const save = async () => {
    setSaving(true); setMsg("");
    const amt = amount.trim() === "" ? null : Number(amount);
    if (amt != null && (isNaN(amt) || amt < 0)) { setMsg("Enter a valid amount."); setSaving(false); return; }
    const { error } = await supabase.rpc("set_quote", { p_request_id: requestId, p_amount: amt, p_notes: notes.trim() || null });
    if (error) setMsg("Couldn't save — " + error.message);
    else { setSavedQuote(amt); setSavedNotes(notes.trim() || null); setMsg("Saved \u2713"); }
    setSaving(false);
  };

  if (!photoPath && !canQuote && savedQuote == null) return null;

  return (
    <div style={box} onClick={e => e.stopPropagation()}>
      {photoPath && (
        <div style={{ marginBottom: (canQuote || savedQuote != null) ? ".9rem" : 0 }}>
          <div style={lbl}>Problem photo</div>
          {url
            ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Problem" style={thumb} /></a>
            : <div style={{ ...thumb, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(190,205,235,.4)", fontSize:".8rem" }}>Loading...</div>}
        </div>
      )}

      {canQuote ? (
        <div>
          <div style={lbl}>Estimated quote</div>
          <div style={{ display:"flex", gap:".4rem", alignItems:"center", marginBottom:".5rem" }}>
            <span style={{ color:"rgba(190,205,235,.6)" }}>$</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" style={inp} />
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for the client (optional)" style={{ ...inp, minHeight:"54px", resize:"vertical" }} />
          <div style={{ marginTop:".5rem" }}>
            <button onClick={save} disabled={saving} style={btn}>{saving ? "Saving..." : "Save quote"}</button>
            {msg && <span style={{ marginLeft:".6rem", fontSize:".8rem", color: msg.includes("\u2713") ? "#9fe6b0" : "#fca5a5" }}>{msg}</span>}
          </div>
        </div>
      ) : savedQuote != null && (
        <div>
          <div style={lbl}>Estimated quote</div>
          <div style={{ fontSize:"1.3rem", fontWeight:600, color:"#ea6b14" }}>${Number(savedQuote).toFixed(2)}</div>
          {savedNotes && <div style={{ fontSize:".82rem", color:"rgba(190,205,235,.7)", marginTop:".3rem" }}>{savedNotes}</div>}
        </div>
      )}
    </div>
  );
}

const box: React.CSSProperties = { marginTop:".75rem", padding:".9rem", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"10px" };
const lbl: React.CSSProperties = { fontSize:".72rem", textTransform:"uppercase", letterSpacing:".06em", color:"rgba(190,205,235,.5)", marginBottom:".4rem" };
const thumb: React.CSSProperties = { width:"100%", maxWidth:"260px", height:"160px", objectFit:"cover", borderRadius:"8px", border:"1px solid rgba(255,255,255,.1)", cursor:"pointer", display:"block" };
const inp: React.CSSProperties = { width:"100%", padding:".5rem .7rem", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:"7px", color:"#f0f4ff", fontFamily:"inherit", fontSize:".88rem", outline:"none", boxSizing:"border-box" };
const btn: React.CSSProperties = { padding:".5rem 1rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"7px", fontFamily:"inherit", fontSize:".82rem", fontWeight:500, cursor:"pointer" };
