import { useEffect, useRef } from "react";
import { ensureUiStyles } from "./ui/uiStyles";

// Full-screen confetti + congratulations moment, shown once when a contractor
// fills in the last missing piece of their profile. Self-contained canvas
// confetti — no external dependency.
//
// ── On .ffu-scrim / .ffu-modal (2026-11-08) ────────────────────────────────
// This was one of the last two hand-rolled dialogs. It now mounts the shared
// primitive, which it was never going to get by itself: a bottom sheet below
// 560px with the safe-area inset under the buttons, --ff-mat-3, and a
// max-height/overflow-y the hand-rolled card did not have AT ALL — a 440px
// celebration card with two stacked buttons overflows a landscape phone with
// no way to reach "Maybe later".
//
// What it keeps, and why it is not a full conversion: the card is deliberately
// HAND-PAINTED DARK in both themes (see the note on the tick below), so the
// gradient ground stays an inline override of the primitive's --ff-glass. Two
// things were dropped rather than carried over, both on purpose:
//
//   · THE ACCENT CARD BORDER. Kept inline it would have broken the sheet —
//     the mobile branch zeroes border-left/right/bottom, and an inline
//     `border` SHORTHAND beats the sheet, so the sheet would have kept four
//     borders and stopped reading as attached to the edge of the device. It is
//     also the fourth orange thing on this one screen (ring gradient, ring
//     border, tick, primary button), where the rule is one — so the primitive's
//     neutral hairline is the better answer twice over.
//   · ffPop, its bespoke .85 → 1.03 → 1 entrance. An inline `animation` beats
//     the sheet too, which would have killed ffu-sheet-in and left a card
//     scaling up from the bottom edge instead of rising from it. The primitive's
//     ffu-modal-in springs from .96, so the overshoot is not lost.
//
// NO .ffu-grab here, and that is a decision rather than an omission: the
// grabber is the signal "this panel is dismissible", and the dismiss it
// promises is the scrim tap. This scrim has no onClick — a celebration exits
// through one of its two named buttons — so the grabber would be a false
// affordance.
export default function ProfileCompleteCelebration({
  onClose, onBrowse,
}: { onClose: () => void; onBrowse: () => void }) {
  ensureUiStyles();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr; };
    resize();
    const colors = ["var(--ff-c10)", "#f09020", "#ffd166", "#f0f4ff", "#22c55e", "#4f9dff"];
    const pieces = Array.from({ length: 180 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: (5 + Math.random() * 6) * dpr,
      h: (8 + Math.random() * 10) * dpr,
      vx: (-1 + Math.random() * 2) * dpr,
      vy: (2 + Math.random() * 4.5) * dpr,
      rot: Math.random() * Math.PI * 2,
      vr: -0.25 + Math.random() * 0.5,
      color: colors[(Math.random() * colors.length) | 0],
    }));
    let raf = 0;
    let running = true;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.03 * dpr;
        if (p.y > canvas.height + 40) { p.y = -20; p.x = Math.random() * canvas.width; p.vy = (2 + Math.random() * 4.5) * dpr; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (running) raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    const stop = window.setTimeout(() => { running = false; cancelAnimationFrame(raf); }, 6500);
    return () => { running = false; cancelAnimationFrame(raf); clearTimeout(stop); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div className="ffu-scrim">
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{"@keyframes ffRing{0%{transform:scale(.6);opacity:0}55%{opacity:1}100%{transform:scale(1);opacity:1}}"}</style>
      {/* The confetti stays a SIBLING of the card, inside the scrim, and is
          therefore clipped to the scrim's padding box rather than the viewport
          — .ffu-scrim carries a backdrop-filter, and a backdrop-filter ancestor
          becomes the containing block for a position:fixed descendant. That is
          pre-existing (the hand-rolled overlay blurred too, at padding 1.5rem)
          and the primitive IMPROVES it: the sheet branch takes the padding to 0
          below 560px, so on a phone the confetti now reaches all four edges.
          Hoisting it out of the scrim to fix the desktop inset was considered
          and rejected — it would need a z-index above the scrim, which would
          rain confetti over the card's text instead of behind it. */}
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none" }} />
      <div
        className="ffu-modal"
        style={{
          // Width and padding go in as VARIABLES, never as maxWidth/padding —
          // an inline declaration would beat the sheet branch's own max-width
          // and padding and un-sheet the dialog on a phone. See the long note
          // in uiStyles.ts above .ffu-modal.
          ["--ffu-modal-w" as any]: "440px",
          ["--ffu-modal-pad" as any]: "2.5rem 2rem",
          background: "linear-gradient(180deg,#1e2740,#151d2e)",
          textAlign: "center",
        }}
      >
        <div style={{ width: "84px", height: "84px", margin: "0 auto 1.5rem", borderRadius: "50%", background: "radial-gradient(circle at 50% 40%,rgba(var(--ff-accent-rgb), .28),rgba(var(--ff-accent-rgb), .08))", border: "2px solid rgba(var(--ff-accent-rgb), .55)", display: "flex", alignItems: "center", justifyContent: "center", animation: "ffRing .5s ease both" }}>
          {/* The tick was the odd one out, not the ring. This card is hand-painted
              dark (the gradient and the #f0f4ff text are literals on purpose, and
              .ff-on-dark would not help — its forced-navy values are scoped to
              dark mode, so under data-theme="light" it falls straight through).
              But the ring's gradient and border already read --ff-accent-rgb,
              which IS theme-dependent, so in light mode the ring went to #d65f10
              while the tick inside it stayed #ea6b14. Matching the tick to its own
              ring is the whole change; the difference on navy is slight, the
              disagreement was not. */}
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ff-c10)" }}><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "2.6rem", letterSpacing: ".05em", color: "#f0f4ff", margin: "0 0 .5rem" }}>Congratulations!</h2>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.05rem", color: "#f0f4ff", margin: "0 0 .4rem", fontWeight: 500 }}>You completed your profile.</p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: ".92rem", color: "rgba(240,244,255,.62)", margin: "0 0 1.75rem", lineHeight: 1.55 }}>You're all set. We'll review your profile so you can start bidding for jobs.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <button onClick={onBrowse} style={{ padding: ".8rem 1.25rem", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,var(--ff-c10),#f09020)", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" }}>Browse available jobs</button>
          <button onClick={onClose} style={{ padding: ".6rem 1.25rem", borderRadius: "10px", border: "1px solid rgba(240,244,255,.16)", background: "transparent", color: "rgba(240,244,255,.7)", fontFamily: "'DM Sans',sans-serif", fontSize: ".88rem", cursor: "pointer" }}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}
