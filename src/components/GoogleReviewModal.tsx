import { useEffect, useState } from "react";
import { GOOGLE_REVIEW_URL, reviewOptOut, type ReviewReason } from "@/lib/reviewPrompt";

const COPY: Record<ReviewReason, { title: string; body: string }> = {
  signup:   { title: "Welcome to Freddy Fix It!", body: "If you've got a sec, a quick Google review helps Calgary neighbours find a trades team they can trust." },
  job_posted: { title: "Thanks for posting your job!", body: "Enjoying Freddy Fix It so far? A quick Google review goes a long way for a small local business." },
  job_done: { title: "Glad your job is done!", body: "Happy with how it went? A 30-second Google review helps other Calgary homeowners hire with confidence." },
};

export default function GoogleReviewModal() {
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
    <div onClick={close} style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(8,12,22,.72)", backdropFilter:"blur(3px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.2rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:"380px", background:"var(--ff-bg)", border:"1px solid rgba(234,107,20,.35)", borderRadius:"16px", padding:"1.8rem 1.5rem 1.5rem", boxShadow:"0 24px 70px rgba(0,0,0,.55)", textAlign:"center", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)", position:"relative" }}>
        <button onClick={close} aria-label="Close" style={{ position:"absolute", top:".7rem", right:".9rem", background:"none", border:"none", color:"rgba(var(--ff-muted), .6)", fontSize:"1.4rem", lineHeight:1, cursor:"pointer", fontFamily:"inherit" }}>×</button>
        <div style={{ fontSize:"1.6rem", letterSpacing:".12em", marginBottom:".5rem" }} aria-hidden>
          {"★★★★★".split("").map((s,i) => <span key={i} style={{ color:"#ea6b14" }}>{s}</span>)}
        </div>
        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.55rem", letterSpacing:".02em", margin:"0 0 .5rem", color:"var(--ff-text)" }}>{copy.title}</h3>
        <p style={{ fontSize:".92rem", lineHeight:1.5, color:"rgba(var(--ff-muted), .85)", margin:"0 0 1.4rem" }}>{copy.body}</p>
        <button onClick={leave} style={{ width:"100%", padding:".8rem 1rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"10px", fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:".95rem", cursor:"pointer", marginBottom:".6rem" }}>Leave a Google review</button>
        <div style={{ display:"flex", gap:".5rem", justifyContent:"center" }}>
          <button onClick={close} style={{ flex:1, padding:".6rem", background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .85)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Maybe later</button>
          <button onClick={never} style={{ flex:1, padding:".6rem", background:"none", color:"rgba(var(--ff-muted), .5)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Don't ask again</button>
        </div>
      </div>
    </div>
  );
}
