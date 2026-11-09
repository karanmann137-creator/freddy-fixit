import { useEffect, useState } from "react";
import { GOOGLE_REVIEW_URL, reviewOptOut, type ReviewReason } from "@/lib/reviewPrompt";
import { ensureUiStyles } from "./ui/uiStyles";

const COPY: Record<ReviewReason, { title: string; body: string }> = {
  signup:   { title: "Welcome to Freddy Fix It!", body: "If you've got a sec, a quick Google review helps Calgary neighbours find a trades team they can trust." },
  job_posted: { title: "Thanks for posting your job!", body: "Enjoying Freddy Fix It so far? A quick Google review goes a long way for a small local business." },
  job_done: { title: "Glad your job is done!", body: "Happy with how it went? A 30-second Google review helps other Calgary homeowners hire with confidence." },
};

export default function GoogleReviewModal() {
  ensureUiStyles();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReviewReason>("job_done");

  useEffect(() => {
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setReason((detail.reason as ReviewReason) || "job_done");
      setOpen(true);
    };
    window.addEventListener("ff:google-review", onEvt as EventListener);
    return () => window.removeEventListener("ff:google-review", onEvt as EventListener);
  }, []);

  if (!open) return null;
  const copy = COPY[reason];

  const close = () => setOpen(false);
  const leave = () => { window.open(GOOGLE_REVIEW_URL, "_blank", "noopener,noreferrer"); setOpen(false); };
  const never = () => { reviewOptOut(); setOpen(false); };

  return (
    <div onClick={close} className="ffu-scrim">
      <div
        onClick={e => e.stopPropagation()}
        className="ffu-modal"
        role="dialog"
        aria-modal="true"
        style={{ ["--ffu-modal-w" as any]: "380px", textAlign:"center" }}
      >
        <span className="ffu-grab" aria-hidden="true" />
        <button onClick={close} aria-label="Close" style={{ position:"absolute", top:".7rem", right:".9rem", background:"none", border:"none", color:"rgba(var(--ff-muted), .6)", fontSize:"1.4rem", lineHeight:1, cursor:"pointer", fontFamily:"inherit" }}>×</button>
        <div style={{ fontSize:"1.6rem", letterSpacing:".12em", marginBottom:".5rem" }} aria-hidden>
          {"★★★★★".split("").map((s,i) => <span key={i} style={{ color:"var(--ff-c10)" }}>{s}</span>)}
        </div>
        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.55rem", letterSpacing:".02em", margin:"0 0 .5rem", color:"var(--ff-text)" }}>{copy.title}</h3>
        <p style={{ fontSize:".92rem", lineHeight:1.5, color:"rgba(var(--ff-muted), .85)", margin:"0 0 1.4rem" }}>{copy.body}</p>
        <button onClick={leave} style={{ width:"100%", padding:".8rem 1rem", background:"var(--ff-c10)", color:"#fff", border:"none", borderRadius:"10px", fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:".95rem", cursor:"pointer", marginBottom:".6rem" }}>Leave a Google review</button>
        <div style={{ display:"flex", gap:".5rem", justifyContent:"center" }}>
          <button onClick={close} style={{ flex:1, padding:".6rem", background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .85)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Maybe later</button>
          <button onClick={never} style={{ flex:1, padding:".6rem", background:"none", color:"rgba(var(--ff-muted), .5)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Don't ask again</button>
        </div>
      </div>
    </div>
  );
}
