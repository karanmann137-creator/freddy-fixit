import { useEffect, useState } from "react";
import { referralPromptOptOut, type ReferralPromptReason } from "@/lib/referralPrompt";

const COPY: Record<ReferralPromptReason, { title: string; body: string }> = {
  job_done: {
    title: "Nice work — job done!",
    body: "Know someone who could use a hand around the house? Share your code — a friend's first job gets 3% off, and you earn a reward once they book.",
  },
  rehire: {
    title: "Before you book again…",
    body: "Your referral code is still unused. Send it along with this rehire — a friend's first job gets 3% off, and you earn a reward once they book.",
  },
};

export default function ReferralShareModal() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReferralPromptReason>("job_done");
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.code) return;
      setReason((detail.reason as ReferralPromptReason) || "job_done");
      setCode(detail.code as string);
      setCopied(false);
      setOpen(true);
    };
    window.addEventListener("ff:referral-share", onEvt as EventListener);
    return () => window.removeEventListener("ff:referral-share", onEvt as EventListener);
  }, []);

  if (!open || !code) return null;
  const copy = COPY[reason];

  const close = () => setOpen(false);
  const share = async () => {
    const text = `Get your first Freddy Fix It service fee waived with my code ${code}: https://freddyfixit.ca/?ref=${code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setOpen(false), 1400);
    } catch {
      // Clipboard blocked — leave the modal open with the code visible so they
      // can still read and send it themselves.
    }
  };
  const never = () => { referralPromptOptOut(); setOpen(false); };

  return (
    <div onClick={close} style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(8,12,22,.72)", backdropFilter:"blur(3px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.2rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:"380px", background:"var(--ff-bg)", border:"1px solid rgba(234,107,20,.35)", borderRadius:"16px", padding:"1.8rem 1.5rem 1.5rem", boxShadow:"0 24px 70px rgba(0,0,0,.55)", textAlign:"center", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)", position:"relative" }}>
        <button onClick={close} aria-label="Close" style={{ position:"absolute", top:".7rem", right:".9rem", background:"none", border:"none", color:"rgba(var(--ff-muted), .6)", fontSize:"1.4rem", lineHeight:1, cursor:"pointer", fontFamily:"inherit" }}>×</button>
        <div style={{ fontSize:"1.8rem", marginBottom:".5rem" }} aria-hidden>🎁</div>
        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.55rem", letterSpacing:".02em", margin:"0 0 .5rem", color:"var(--ff-text)" }}>{copy.title}</h3>
        <p style={{ fontSize:".92rem", lineHeight:1.5, color:"rgba(var(--ff-muted), .85)", margin:"0 0 1rem" }}>{copy.body}</p>
        <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:"1.05rem", letterSpacing:".08em", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"9px", padding:".55rem", marginBottom:"1.1rem" }}>{code}</div>
        <button onClick={share} style={{ width:"100%", padding:".8rem 1rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"10px", fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:".95rem", cursor:"pointer", marginBottom:".6rem" }}>{copied ? "Copied! Go ahead and send it →" : "Copy my code & message"}</button>
        <div style={{ display:"flex", gap:".5rem", justifyContent:"center" }}>
          <button onClick={close} style={{ flex:1, padding:".6rem", background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .85)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Maybe later</button>
          <button onClick={never} style={{ flex:1, padding:".6rem", background:"none", color:"rgba(var(--ff-muted), .5)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Don't ask again</button>
        </div>
      </div>
    </div>
  );
}
