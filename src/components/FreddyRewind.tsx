import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";
import { Sk } from "@/components/Skeleton";
import { ensureUiStyles } from "@/components/ui/uiStyles";

type Mode = "contractor" | "client";

// A Spotify-Wrapped-style shareable summary card. Pulls the user's lifetime
// stats from a SECURITY DEFINER RPC, renders a branded preview, and can export
// a 1080x1350 PNG (story format) plus copy/share a referral link.
//
// ── On .ffu-scrim / .ffu-modal, and why it carries .ff-anchor (2026-11-08) ──
// The last hand-rolled dialog. The conversion itself is ordinary; the class
// pair is the interesting part and it fixes a LIVE LIGHT-MODE BUG that the
// conversion exposed rather than caused.
//
// Everything inside this card is painted light-on-dark with literals: the
// share preview is a navy gradient with #f0f4ff text, the failure message is
// rgba(190,205,235,.75), the close × falls back to #f0f4ff. The card's ground,
// though, was var(--ff-bg) — off-white under data-theme="light". So in light
// mode the × and the failure copy were already near-invisible on their own
// ground, and moving to the primitive's --ff-glass would have changed nothing
// about that. The answer is to stop the ground from following the theme at all:
// .ff-on-dark re-declares the dark values on this subtree, and .ff-anchor is
// what keeps them in force under light mode too (the plain class is scoped to
// dark by default — see the long note above the selector in main.tsx).
//
// ui/Pass.tsx already applies the same pair (`forceNavy`, default true), so
// this is the second user of the modifier and not a revival of a dead one —
// main.tsx's own comment still claimed it was dormant and was corrected in the
// same pass. The test both uses pass: a subtree painted in light-on-dark
// LITERALS cannot follow the theme, so its ground must not either. One class
// instead of re-tinting a dozen values.
//
// It DOES get a .ffu-grab, unlike ProfileCompleteCelebration: the grabber
// promises a dismiss by scrim tap, and this scrim really has one (onClick on
// the scrim, stopPropagation on the card).
//
// The confetti containing-block trap does not apply here — the only canvas in
// this file is created with document.createElement for the PNG export and is
// never mounted.
export default function FreddyRewind({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  ensureUiStyles();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: d, error } = await supabase.rpc(mode === "contractor" ? "get_contractor_rewind" : "get_client_rewind");
      // A failed RPC used to fall through to `{}`, which renders as a card telling
      // the user they completed 0 jobs and earned $0 — a false and demoralising
      // statement about their actual year. Say we couldn't load it instead.
      if (error) { setFailed(true); setLoading(false); return; }
      setData(d || {});
      setLoading(false);
    })();
  }, [mode]);

  const code: string | null = data?.referral_code ?? null;
  const refUrl = code ? `https://freddyfixit.ca/?ref=${code}` : "https://freddyfixit.ca";
  const name = data?.first_name || (mode === "contractor" ? (data?.company_name || "Your") : "Your");

  const money = (n: any) => "$" + Number(n || 0).toLocaleString("en-CA", { maximumFractionDigits: 0 });

  const stats: [string, string][] = mode === "contractor"
    ? [
        [String(data?.jobs_completed ?? 0), "Jobs completed"],
        [money(data?.total_earned), "Earned on Freddy"],
        [String(data?.repeat_clients ?? 0), "Clients came back"],
        [data?.avg_rating ? `${Number(data.avg_rating).toFixed(1)}★` : "New", "Average rating"],
      ]
    : [
        [String(data?.jobs_completed ?? 0), "Jobs done"],
        [money(data?.total_spent), "Invested in home"],
        [money(data?.estimated_saved), "Saved vs. typical"],
        [String(data?.pros_hired ?? 0), "Pros hired"],
      ];
  const highlight = mode === "contractor"
    ? (data?.top_service ? `Top trade: ${data.top_service}` : "Calgary's vetted trades")
    : (data?.favorite_pro ? `Go-to pro: ${data.favorite_pro}` : "Calgary's vetted trades");

  // Draw the card onto a canvas and download it as a PNG.
  const download = async () => {
    setBusy(true);
    try {
      const W = 1080, H = 1350;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const x = c.getContext("2d")!;
      // background
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#1a2236"); g.addColorStop(1, "#111827");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      // glow
      const rg = x.createRadialGradient(W * 0.8, 120, 40, W * 0.8, 120, 700);
      rg.addColorStop(0, "rgba(var(--ff-accent-rgb), 0.28)"); rg.addColorStop(1, "rgba(var(--ff-accent-rgb), 0)");
      x.fillStyle = rg; x.fillRect(0, 0, W, H);

      x.textBaseline = "alphabetic";
      x.fillStyle = "#ea6b14";
      x.font = "800 46px 'DM Sans', Arial, sans-serif";
      x.fillText("FREDDY FIX IT", 80, 140);
      x.fillStyle = "#7f8db0";
      x.font = "600 30px 'DM Sans', Arial, sans-serif";
      x.fillText(`${new Date().getFullYear()} REWIND`, 80, 190);

      x.fillStyle = "#f0f4ff";
      x.font = "800 84px 'DM Sans', Arial, sans-serif";
      x.fillText(`${name}${String(name).endsWith("s") ? "'" : "'s"}`, 80, 320);
      x.fillText("year in fixes", 80, 415);

      // stat grid 2x2
      const gx = [80, 580], gy = [560, 900];
      stats.forEach((st, i) => {
        const px = gx[i % 2], py = gy[Math.floor(i / 2)];
        x.fillStyle = "#ea6b14";
        x.font = "800 92px 'DM Sans', Arial, sans-serif";
        x.fillText(st[0], px, py);
        x.fillStyle = "#c9d4ef";
        x.font = "600 30px 'DM Sans', Arial, sans-serif";
        x.fillText(st[1], px, py + 46);
      });

      x.fillStyle = "#f0f4ff";
      x.font = "700 38px 'DM Sans', Arial, sans-serif";
      x.fillText(highlight, 80, 1130);

      // referral footer
      x.fillStyle = "rgba(234,107,20,0.15)";
      x.fillRect(80, 1180, W - 160, 90);
      x.fillStyle = "#ea6b14";
      x.font = "700 30px 'DM Sans', Arial, sans-serif";
      x.fillText(code ? `Get your first service fee waived — code ${code}` : "Book a vetted Calgary pro at freddyfixit.ca", 110, 1237);

      const url = c.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `freddy-rewind-${new Date().getFullYear()}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const text = mode === "contractor"
      ? `My Freddy Fix It Rewind: ${data?.jobs_completed ?? 0} jobs, ${money(data?.total_earned)} earned. Join me on Freddy Fix It.`
      : `My Freddy Fix It Rewind — ${data?.jobs_completed ?? 0} home projects done. Get your first service fee waived with my code ${code}.`;
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: "Freddy Fix It Rewind", text, url: refUrl });
        return;
      }
    } catch { /* fall through to copy */ }
    try {
      await navigator.clipboard.writeText(`${text} ${refUrl}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div onClick={onClose} className="ffu-scrim">
      <div
        onClick={e => e.stopPropagation()}
        className="ffu-modal ff-on-dark ff-anchor"
        /* Variables, not maxWidth/padding — an inline declaration beats the
           sheet branch and the dialog would stop going full-bleed on a phone. */
        style={{ ["--ffu-modal-w" as any]: "420px", ["--ffu-modal-pad" as any]: "1.25rem" }}
      >
        <span className="ffu-grab" aria-hidden="true" />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:".75rem" }}>
          <div style={{ fontWeight:800, color:"var(--ff-c10)", letterSpacing:".05em" }}>{new Date().getFullYear()} REWIND</div>
          {/* .ffu-iconbtn rather than a bare glyph button: a × with no box is
              about 14px wide, and the (pointer: coarse) block in main.tsx only
              floors min-HEIGHT on a button, so the live touch target was a tall
              sliver. Same defect, same fix as the other icon buttons. */}
          <button onClick={onClose} aria-label="Close" className="ffu-iconbtn" style={{ fontSize:"1.4rem", lineHeight:1 }}>×</button>
        </div>

        {loading ? (
          <div className="ff-on-dark" aria-busy="true" style={{ padding:".5rem 0 1rem" }}>
            <span className="ff-sr-only">Loading your year</span>
            <Sk h={196} r={16} />
            <div style={{ height: 14 }} />
            <Sk w={148} h={38} r={10} style={{ margin:"0 auto" }} />
          </div>
        ) : failed ? (
          <div style={{ padding:"2.5rem 1rem", textAlign:"center", color:"rgba(190,205,235,.75)", lineHeight:1.6, fontSize:".9rem" }}>
            We couldn't pull your year together just now. Nothing is missing from your account — please close this and try again in a moment.
          </div>
        ) : (
          <>
            <div style={{ borderRadius:"16px", padding:"1.5rem", background:"linear-gradient(135deg,#1a2236,#111827)", color:"#f0f4ff", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:"-60px", right:"-60px", width:"220px", height:"220px", borderRadius:"50%", background:"radial-gradient(rgba(var(--ff-accent-rgb), .35),transparent 70%)" }} />
              <div style={{ fontWeight:800, color:"var(--ff-c10)", letterSpacing:".08em", fontSize:".8rem" }}>FREDDY FIX IT</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.4rem", lineHeight:1.05, marginTop:".4rem", marginBottom:"1.1rem" }}>
                {name}{String(name).endsWith("s") ? "'" : "'s"} year in fixes
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:"1rem 1.25rem" }}>
                {stats.map((st, i) => (
                  <div key={i}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"var(--ff-c10)", lineHeight:1 }}>{st[0]}</div>
                    <div style={{ fontSize:".72rem", color:"#c9d4ef" }}>{st[1]}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"1.2rem", fontWeight:700, fontSize:".95rem" }}>{highlight}</div>
              {code && (
                <div style={{ marginTop:"1rem", background:"rgba(var(--ff-accent-rgb), .15)", borderRadius:"10px", padding:".6rem .8rem", fontSize:".8rem", color:"var(--ff-c10)", fontWeight:700 }}>
                  {mode === "client" ? "Share your code — friends get their first service fee waived: " : "Invite a friend — they get their first service fee waived: "}<span style={{ color:"#fff" }}>{code}</span>
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:".6rem", marginTop:"1rem" }}>
              <button onClick={download} disabled={busy} style={{ flex:1, padding:".8rem", borderRadius:"10px", border:"none", background:"var(--ff-c10)", color:"#fff", fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:".4rem" }}>
                <Ic name="download" size={15} />{busy ? "Saving…" : "Save image"}
              </button>
              <button onClick={share} style={{ flex:1, padding:".8rem", borderRadius:"10px", border:"1px solid rgba(var(--ff-accent-rgb), .5)", background:"transparent", color:"var(--ff-c10)", fontWeight:700, cursor:"pointer" }}>
                {copied ? "Copied!" : "Share"}
              </button>
            </div>
            <div style={{ fontSize:".72rem", color:"rgba(190,205,235,.5)", textAlign:"center", marginTop: "var(--ff-s3)" }}>
              Post it to your story and tag us. Every share brings Calgary another vetted fix.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
