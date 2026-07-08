import { useState } from "react";
import { supabase } from "@/lib/supabase";
import DeleteAccount from "@/components/DeleteAccount";
import {
  getTheme, setTheme, getTextScale, setTextScale,
  TEXT_SCALES, SCALE_LABELS, type Theme,
} from "@/lib/theme";

type Role = "client" | "contractor" | "admin" | null;

// The settings body on its own — reusable so it can live inside the modal
// (below) or be embedded directly as a dashboard tab.
export function SettingsPanel({ role }: { role: Role }) {
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [scale, setScaleState] = useState<number>(getTextScale());
  const [busyPay, setBusyPay] = useState(false);

  const chooseTheme = (t: Theme) => { setTheme(t); setThemeState(t); };
  const chooseScale = (v: number) => { setTextScale(v); setScaleState(v); };

  async function managePayout() {
    setBusyPay(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-connect-account", { body: {} });
      if (error) throw error;
      if (data?.url) { window.location.href = data.url; return; }
      throw new Error(data?.error || "Could not open Stripe");
    } catch (e: any) {
      alert("Couldn't open payout settings: " + (e?.message || String(e)));
      setBusyPay(false);
    }
  }

  const segWrap: React.CSSProperties = { display: "flex", gap: ".4rem", flexWrap: "wrap" };
  const seg = (active: boolean): React.CSSProperties => ({
    flex: "1 1 auto", minWidth: "70px", padding: ".6rem .5rem", borderRadius: "10px",
    border: active ? "1px solid #ea6b14" : "1px solid rgba(var(--ff-fg), .14)",
    background: active ? "rgba(234,107,20,.15)" : "rgba(var(--ff-fg), .04)",
    color: active ? "#ea6b14" : "rgb(var(--ff-muted))",
    fontFamily: "'DM Sans',sans-serif", fontSize: ".85rem", fontWeight: active ? 700 : 500, cursor: "pointer",
  });
  const sectionTitle: React.CSSProperties = {
    fontFamily: "'DM Sans',sans-serif", fontSize: ".72rem", letterSpacing: ".08em", textTransform: "uppercase",
    color: "rgb(var(--ff-muted))", margin: "0 0 .6rem", fontWeight: 600,
  };
  const card: React.CSSProperties = {
    background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .1)",
    borderRadius: "12px", padding: "1rem 1.05rem", marginBottom: "1.1rem",
  };

  return (
    <>
      {/* Appearance */}
      <div style={card}>
        <p style={sectionTitle}>Appearance</p>
        <div style={segWrap}>
          <button style={seg(theme === "dark")} onClick={() => chooseTheme("dark")}>🌙 Dark</button>
          <button style={seg(theme === "light")} onClick={() => chooseTheme("light")}>☀️ Light</button>
        </div>
      </div>

      {/* Text size */}
      <div style={card}>
        <p style={sectionTitle}>Text size</p>
        <div style={segWrap}>
          {TEXT_SCALES.map(v => (
            <button key={v} style={seg(scale === v)} onClick={() => chooseScale(v)}>{SCALE_LABELS[v]}</button>
          ))}
        </div>
        <p style={{ fontSize:".82rem", color:"rgb(var(--ff-muted))", margin:".7rem 0 0", lineHeight:1.4 }}>
          Adjusts text across the whole site. Current: <strong style={{ color:"var(--ff-text)" }}>{SCALE_LABELS[scale]}</strong>
        </p>
      </div>

      {/* Payment + account — only when signed in */}
      {role && (
        <>
          <div style={card}>
            <p style={sectionTitle}>Payment method</p>
            {role === "contractor" ? (
              <>
                <p style={{ fontSize:".88rem", color:"rgb(var(--ff-muted))", margin:"0 0 .8rem", lineHeight:1.5 }}>
                  Update the bank account where your payouts land, managed securely by Stripe.
                </p>
                <button onClick={managePayout} disabled={busyPay} style={{ width:"100%", padding:".75rem 1rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"10px", fontFamily:"inherit", fontWeight:700, fontSize:".9rem", cursor: busyPay ? "default" : "pointer", opacity: busyPay ? .7 : 1 }}>
                  {busyPay ? "Opening Stripe…" : "Manage payout account"}
                </button>
              </>
            ) : role === "client" ? (
              <p style={{ fontSize:".88rem", color:"rgb(var(--ff-muted))", margin:0, lineHeight:1.5 }}>
                You pay securely per job at checkout, and we hold your payment securely until the work is done and you confirm it — so you're protected if anything goes wrong. No card is stored on your account, so there's nothing to change here.
              </p>
            ) : (
              <p style={{ fontSize:".88rem", color:"rgb(var(--ff-muted))", margin:0, lineHeight:1.5 }}>No payment method is associated with admin accounts.</p>
            )}
          </div>

          <div style={card}>
            <p style={sectionTitle}>Account</p>
            <DeleteAccount />
          </div>
        </>
      )}
    </>
  );
}

export default function SettingsModal({
  open, onClose, role,
}: {
  open: boolean;
  onClose: () => void;
  role: "client" | "contractor" | "admin" | null;
}) {
  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(8,12,22,.72)", backdropFilter:"blur(3px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.2rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:"460px", background:"var(--ff-surface)", border:"1px solid rgba(var(--ff-fg),.14)", borderRadius:"16px", padding:"1.6rem 1.45rem 1.3rem", boxShadow:"0 24px 70px rgba(0,0,0,.5)", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)", position:"relative", maxHeight:"90vh", overflowY:"auto" }}>
        <button onClick={onClose} aria-label="Close" style={{ position:"absolute", top:".7rem", right:".9rem", background:"none", border:"none", color:"rgb(var(--ff-muted))", fontSize:"1.4rem", lineHeight:1, cursor:"pointer", fontFamily:"inherit" }}>×</button>

        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.7rem", letterSpacing:".02em", margin:"0 0 1.2rem" }}>Settings</h3>

        <SettingsPanel role={role} />
      </div>
    </div>
  );
}
