import { useEffect, useState } from "react";
import { referralPromptOptOut, type ReferralPromptReason } from "@/lib/referralPrompt";
import { ensureUiStyles } from "./ui/uiStyles";

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
  ensureUiStyles();
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
        <div style={{ fontSize:"1.8rem", marginBottom:".5rem" }} aria-hidden>🎁</div>
        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.55rem", letterSpacing:".02em", margin:"0 0 .5rem", color:"var(--ff-text)" }}>{copy.title}</h3>
        <p style={{ fontSize:".92rem", lineHeight:1.5, color:"rgba(var(--ff-muted), .85)", margin:"0 0 1rem" }}>{copy.body}</p>
        <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:"1.05rem", letterSpacing:".08em", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"9px", padding:".55rem", marginBottom:"1.1rem" }}>{code}</div>
        <button onClick={share} style={{ width:"100%", padding:".8rem 1rem", background:"var(--ff-c10)", color:"#fff", border:"none", borderRadius:"10px", fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:".95rem", cursor:"pointer", marginBottom:".6rem" }}>{copied ? "Copied! Go ahead and send it →" : "Copy my code & message"}</button>
        <div style={{ display:"flex", gap:".5rem", justifyContent:"center" }}>
          <button onClick={close} style={{ flex:1, padding:".6rem", background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .85)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Maybe later</button>
          <button onClick={never} style={{ flex:1, padding:".6rem", background:"none", color:"rgba(var(--ff-muted), .5)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Don't ask again</button>
        </div>
      </div>
    </div>
  );
}
