import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";

type Mode = "contractor" | "client";

// A Spotify-Wrapped-style shareable summary card. Pulls the user's lifetime
// stats from a SECURITY DEFINER RPC, renders a branded preview, and can export
// a 1080x1350 PNG (story format) plus copy/share a referral link.
export default function FreddyRewind({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: d } = await supabase.rpc(mode === "contractor" ? "get_contractor_rewind" : "get_client_rewind");
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
      rg.addColorStop(0, "rgba(234,107,20,0.28)"); rg.addColorStop(1, "rgba(234,107,20,0)");
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
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.72)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem", fontFamily:"'DM Sans',sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:"420px", maxHeight:"92vh", overflowY:"auto", background:"var(--ff-bg, #151d2e)", borderRadius:"18px", border:"1px solid rgba(234,107,20,.3)", padding:"1.25rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:".75rem" }}>
          <div style={{ fontWeight:800, color:"#ea6b14", letterSpacing:".05em" }}>{new Date().getFullYear()} REWIND</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--ff-text,#f0f4ff)", cursor:"pointer", fontSize:"1.4rem", lineHeight:1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding:"3rem 0", textAlign:"center", color:"rgba(190,205,235,.6)" }}>Loading your year…</div>
        ) : (
          <>
            <div style={{ borderRadius:"16px", padding:"1.5rem", background:"linear-gradient(135deg,#1a2236,#111827)", color:"#f0f4ff", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:"-60px", right:"-60px", width:"220px", height:"220px", borderRadius:"50%", background:"radial-gradient(rgba(234,107,20,.35),transparent 70%)" }} />
              <div style={{ fontWeight:800, color:"#ea6b14", letterSpacing:".08em", fontSize:".8rem" }}>FREDDY FIX IT</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.4rem", lineHeight:1.05, marginTop:".4rem", marginBottom:"1.1rem" }}>
                {name}{String(name).endsWith("s") ? "'" : "'s"} year in fixes
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem 1.25rem" }}>
                {stats.map((st, i) => (
                  <div key={i}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", color:"#ea6b14", lineHeight:1 }}>{st[0]}</div>
                    <div style={{ fontSize:".72rem", color:"#c9d4ef" }}>{st[1]}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"1.2rem", fontWeight:700, fontSize:".95rem" }}>{highlight}</div>
              {code && (
                <div style={{ marginTop:"1rem", background:"rgba(234,107,20,.15)", borderRadius:"10px", padding:".6rem .8rem", fontSize:".8rem", color:"#ea6b14", fontWeight:700 }}>
                  {mode === "client" ? "Share your code — friends get their first service fee waived: " : "Invite a friend — they get their first service fee waived: "}<span style={{ color:"#fff" }}>{code}</span>
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:".6rem", marginTop:"1rem" }}>
              <button onClick={download} disabled={busy} style={{ flex:1, padding:".8rem", borderRadius:"10px", border:"none", background:"#ea6b14", color:"#fff", fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:".4rem" }}>
                <Ic name="download" size={15} />{busy ? "Saving…" : "Save image"}
              </button>
              <button onClick={share} style={{ flex:1, padding:".8rem", borderRadius:"10px", border:"1px solid rgba(234,107,20,.5)", background:"transparent", color:"#ea6b14", fontWeight:700, cursor:"pointer" }}>
                {copied ? "Copied!" : "Share"}
              </button>
            </div>
            <div style={{ fontSize:".72rem", color:"rgba(190,205,235,.5)", textAlign:"center", marginTop:".7rem" }}>
              Post it to your story and tag us. Every share brings Calgary another vetted fix.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
