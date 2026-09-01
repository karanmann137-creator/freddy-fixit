/**
 * The combined thank-you shown once a client confirms a finished job.
 *
 * ONE modal, TWO asks, review first — see `src/lib/completionPrompt.ts` for why
 * this replaced the old either/or. The headline is the owner's copy verbatim:
 * "Loved the service? Rate us on Google and give your friends a discount."
 *
 * Either half can be absent (opted out, inside its cooldown, or no shareable
 * code), so the layout does not assume both. When the review half is missing
 * the referral copy button becomes the primary action rather than leaving an
 * orange button that does the secondary thing — a modal whose loudest control
 * is not its point reads as a mis-click waiting to happen.
 *
 * "Don't ask again" opts out of exactly the halves that were SHOWN. Opting
 * someone out of an ask they were never offered would silently cancel a future
 * prompt they never saw and never refused.
 *
 * This lives outside `.ffdash` (it is mounted in App.tsx), so every colour
 * resolves through the page's own `--ff-*` values and it must not assume dark
 * tokens — same rule `SettingsModal` follows.
 */

import { useEffect, useState } from "react";
import { GOOGLE_REVIEW_URL, reviewOptOut } from "@/lib/reviewPrompt";
import { referralPromptOptOut } from "@/lib/referralPrompt";

export default function CompletionThanksModal() {
  const [open, setOpen]     = useState(false);
  const [review, setReview] = useState(false);
  const [code, setCode]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const r = !!d.review;
      const c = (d.code as string | null) ?? null;
      if (!r && !c) return;
      setReview(r);
      setCode(c);
      setCopied(false);
      setOpen(true);
    };
    window.addEventListener("ff:completion-thanks", onEvt as EventListener);
    return () => window.removeEventListener("ff:completion-thanks", onEvt as EventListener);
  }, []);

  if (!open) return null;

  const close = () => setOpen(false);

  // Opts out of only what was on screen. See the note above.
  const never = () => {
    if (review) reviewOptOut();
    if (code) referralPromptOptOut();
    setOpen(false);
  };

  const goReview = () => {
    window.open(GOOGLE_REVIEW_URL, "_blank", "noopener,noreferrer");
    // Deliberately NOT closed. The review opens in a new tab, so closing this
    // one would take the referral half off screen the instant they act on the
    // first ask — which is the whole reason the two are in one modal.
    setReview(false);
    if (!code) setOpen(false);
  };

  const share = async () => {
    if (!code) return;
    const text = "Get your first Freddy Fix It service fee waived with my code " + code + ": https://freddyfixit.ca/?ref=" + code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setOpen(false), 1400);
    } catch {
      // Clipboard blocked — leave the modal open with the code visible so they
      // can still read it and send it themselves.
    }
  };

  const primary: React.CSSProperties = {
    width: "100%", padding: ".8rem 1rem", background: "#ea6b14", color: "#fff", border: "none",
    borderRadius: "10px", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: ".95rem",
    cursor: "pointer", marginBottom: ".6rem",
  };
  const secondary: React.CSSProperties = {
    width: "100%", padding: ".7rem 1rem", background: "rgba(var(--ff-fg), .06)", color: "var(--ff-text)",
    border: "1px solid rgba(var(--ff-fg), .14)", borderRadius: "10px", fontFamily: "'DM Sans',sans-serif",
    fontWeight: 600, fontSize: ".9rem", cursor: "pointer", marginBottom: ".6rem",
  };

  return (
    <div onClick={close} style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(8,12,22,.72)", backdropFilter:"blur(3px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.2rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:"390px", maxHeight:"90vh", overflowY:"auto", background:"var(--ff-bg)", border:"1px solid rgba(234,107,20,.35)", borderRadius:"16px", padding:"1.8rem 1.5rem 1.5rem", boxShadow:"0 24px 70px rgba(0,0,0,.55)", textAlign:"center", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)", position:"relative" }}>
        <button type="button" onClick={close} aria-label="Close" style={{ position:"absolute", top:".7rem", right:".9rem", background:"none", border:"none", color:"rgba(var(--ff-muted), .6)", fontSize:"1.4rem", lineHeight:1, cursor:"pointer", fontFamily:"inherit" }}>×</button>

        <div style={{ fontSize:"1.6rem", letterSpacing:".12em", marginBottom:".5rem" }} aria-hidden>
          {"★★★★★".split("").map((s, i) => <span key={i} style={{ color:"#ea6b14" }}>{s}</span>)}
        </div>

        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.55rem", letterSpacing:".02em", margin:"0 0 .5rem", color:"var(--ff-text)" }}>Loved the service?</h3>
        <p style={{ fontSize:".92rem", lineHeight:1.5, color:"rgba(var(--ff-muted), .85)", margin:"0 0 1.3rem" }}>
          {review && code
            ? "Rate us on Google and give your friends a discount."
            : review
            ? "A 30-second Google review helps other Calgary homeowners hire with confidence."
            : "Give your friends a discount — their first job's service fee is on us."}
        </p>

        {/* Review first, always — it is the ask that costs the client nothing. */}
        {review && (
          <button type="button" onClick={goReview} style={primary}>Leave a Google review</button>
        )}

        {code && (
          <div style={{ marginTop: review ? ".9rem" : 0, paddingTop: review ? ".9rem" : 0, borderTop: review ? "1px solid rgba(var(--ff-fg), .1)" : "none" }}>
            <p style={{ fontSize:".85rem", lineHeight:1.5, color:"rgba(var(--ff-muted), .85)", margin:"0 0 .7rem" }}>
              Your code waives the <strong style={{ color:"var(--ff-text)" }}>3% service fee on a friend's first job</strong>. It's good for one friend.
            </p>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontWeight:700, fontSize:"1.35rem", letterSpacing:".12em", color:"#ea6b14", background:"rgba(234,107,20,.08)", border:"1px dashed rgba(234,107,20,.45)", borderRadius:"9px", padding:".5rem", marginBottom:".8rem" }}>{code}</div>
            <button type="button" onClick={() => void share()} style={review ? secondary : primary}>
              {copied ? "Copied — go ahead and send it →" : "Copy my invite link"}
            </button>
          </div>
        )}

        <div style={{ display:"flex", gap:".5rem", justifyContent:"center", marginTop:".2rem" }}>
          <button type="button" onClick={close} style={{ flex:1, padding:".6rem", background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .85)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Maybe later</button>
          <button type="button" onClick={never} style={{ flex:1, padding:".6rem", background:"none", color:"rgba(var(--ff-muted), .5)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"9px", fontFamily:"inherit", fontSize:".82rem", cursor:"pointer" }}>Don't ask again</button>
        </div>
      </div>
    </div>
  );
}
