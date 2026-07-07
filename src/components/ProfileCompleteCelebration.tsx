import { useEffect, useRef } from "react";

// Full-screen confetti + congratulations moment, shown once when a contractor
// fills in the last missing piece of their profile. Self-contained canvas
// confetti — no external dependency.
export default function ProfileCompleteCelebration({
  onClose, onBrowse,
}: { onClose: () => void; onBrowse: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr; };
    resize();
    const colors = ["#ea6b14", "#f09020", "#ffd166", "#f0f4ff", "#22c55e", "#4f9dff"];
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
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "rgba(8,11,20,.66)", backdropFilter: "blur(4px)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{"@keyframes ffPop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}@keyframes ffRing{0%{transform:scale(.6);opacity:0}55%{opacity:1}100%{transform:scale(1);opacity:1}}"}</style>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none" }} />
      <div style={{ position: "relative", width: "min(440px,100%)", background: "linear-gradient(180deg,#1e2740,#151d2e)", border: "1px solid rgba(234,107,20,.35)", borderRadius: "18px", padding: "2.5rem 2rem", textAlign: "center", boxShadow: "0 24px 70px rgba(0,0,0,.5)", animation: "ffPop .45s cubic-bezier(.2,.8,.2,1) both" }}>
        <div style={{ width: "84px", height: "84px", margin: "0 auto 1.5rem", borderRadius: "50%", background: "radial-gradient(circle at 50% 40%,rgba(234,107,20,.28),rgba(234,107,20,.08))", border: "2px solid rgba(234,107,20,.55)", display: "flex", alignItems: "center", justifyContent: "center", animation: "ffRing .5s ease both" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ea6b14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "2.6rem", letterSpacing: ".05em", color: "#f0f4ff", margin: "0 0 .5rem" }}>Congratulations!</h2>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.05rem", color: "#f0f4ff", margin: "0 0 .4rem", fontWeight: 500 }}>You completed your profile.</p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: ".92rem", color: "rgba(240,244,255,.62)", margin: "0 0 1.75rem", lineHeight: 1.55 }}>You're all set. We'll review your profile so you can start bidding for jobs.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <button onClick={onBrowse} style={{ padding: ".8rem 1.25rem", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,#ea6b14,#f09020)", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" }}>Browse available jobs</button>
          <button onClick={onClose} style={{ padding: ".6rem 1.25rem", borderRadius: "10px", border: "1px solid rgba(240,244,255,.16)", background: "transparent", color: "rgba(240,244,255,.7)", fontFamily: "'DM Sans',sans-serif", fontSize: ".88rem", cursor: "pointer" }}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}
