import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

// Shows ONCE per browser if a user still has unfinished profile info.
// Contractors: payouts (Stripe), licence & insurance, company name.
// Clients: contact details. Always carries the escrow reassurance.
const SEEN_KEY = "ff_profile_complete_prompt_v1";

type Item = { key: string; label: string; detail: string };

export default function ProfileCompletionModal({
  role, profile, contractor, onSetupPayouts,
}: {
  role: "client" | "contractor";
  profile: any;
  contractor?: any;
  onSetupPayouts?: () => void;
}) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  // Only decide once the data we need has actually loaded.
  const ready = role === "contractor" ? !!contractor : !!profile;

  const items = useMemo<Item[]>(() => {
    if (!ready) return [];
    const list: Item[] = [];
    if (role === "contractor") {
      if (!contractor?.stripe_payouts_enabled) {
        list.push({ key: "payouts", label: "Set up your payouts", detail: "Connect your bank through Stripe so we can pay you the moment a job is confirmed done." });
      }
      if (!contractor?.has_liability_insurance || !contractor?.licensed) {
        list.push({ key: "credentials", label: "Add your licence & insurance", detail: "Upload your trade licence (if your trade needs one) and proof of liability insurance so clients can hire you with confidence." });
      }
      if (!contractor?.company_name) {
        list.push({ key: "company", label: "Add your business name", detail: "Your company name appears on your public profile and quotes." });
      }
    } else {
      if (!profile?.phone) {
        list.push({ key: "phone", label: "Add your phone number", detail: "So your contractor can reach you to coordinate the visit." });
      }
      if (!profile?.first_name || !profile?.last_name) {
        list.push({ key: "name", label: "Complete your name", detail: "Helps your contractor know who they're working with." });
      }
    }
    return list;
  }, [ready, role, contractor, profile]);

  useEffect(() => {
    if (!ready || items.length === 0) return;
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch {}
    setOpen(true);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {} // mark seen so it never re-pops
  }, [ready, items.length]);

  if (!open) return null;

  const close = () => setOpen(false);
  const primary = () => {
    close();
    if (role === "contractor") {
      if (!contractor?.stripe_payouts_enabled && onSetupPayouts) { onSetupPayouts(); return; }
      setLocation("/contractor-dashboard");
    } else {
      setLocation("/client-dashboard");
    }
  };
  const primaryLabel =
    role === "contractor"
      ? (!contractor?.stripe_payouts_enabled ? "Set up payouts" : "Finish my profile")
      : "Update my details";

  const escrow = role === "contractor"
    ? "Heads up: clients' payments are held securely by us and released to you automatically once the job is confirmed complete — so everyone's protected."
    : "Your money is safe: we hold your payment securely and only release it to the contractor once the job is done and you've confirmed it — so you're covered if anything goes wrong.";

  return (
    <div onClick={close} style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(8,12,22,.72)", backdropFilter:"blur(3px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.2rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:"440px", background:"var(--ff-bg)", border:"1px solid rgba(234,107,20,.35)", borderRadius:"16px", padding:"1.7rem 1.5rem 1.4rem", boxShadow:"0 24px 70px rgba(0,0,0,.55)", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)", position:"relative", maxHeight:"90vh", overflowY:"auto" }}>
        <button onClick={close} aria-label="Close" style={{ position:"absolute", top:".7rem", right:".9rem", background:"none", border:"none", color:"rgba(var(--ff-muted), .6)", fontSize:"1.4rem", lineHeight:1, cursor:"pointer", fontFamily:"inherit" }}>×</button>

        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.7rem", letterSpacing:".02em", margin:"0 0 .35rem", color:"var(--ff-text)" }}>Finish setting up your profile</h3>
        <p style={{ fontSize:".92rem", lineHeight:1.5, color:"rgba(var(--ff-muted), .85)", margin:"0 0 1.1rem" }}>
          {role === "contractor"
            ? "A couple of things still need your attention before you're fully ready to take jobs and get paid:"
            : "Just a couple of details left so your jobs run smoothly:"}
        </p>

        <div style={{ display:"flex", flexDirection:"column", gap:".6rem", marginBottom:"1.1rem" }}>
          {items.map(it => (
            <div key={it.key} style={{ display:"flex", gap:".7rem", alignItems:"flex-start", padding:".75rem .85rem", background:"rgba(234,107,20,.08)", border:"1px solid rgba(234,107,20,.3)", borderRadius:"12px" }}>
              <span style={{ flexShrink:0, width:"22px", height:"22px", borderRadius:"50%", background:"#ea6b14", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".8rem", fontWeight:700, marginTop:"1px" }}>!</span>
              <div>
                <div style={{ fontWeight:600, fontSize:".95rem", color:"var(--ff-text)", marginBottom:".15rem" }}>{it.label}</div>
                <div style={{ fontSize:".82rem", lineHeight:1.45, color:"rgba(var(--ff-muted), .78)" }}>{it.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:".6rem", alignItems:"flex-start", padding:".8rem .9rem", background:"rgba(120,200,160,.08)", border:"1px solid rgba(120,200,160,.3)", borderRadius:"12px", marginBottom:"1.2rem" }}>
          <span aria-hidden style={{ flexShrink:0, fontSize:"1.1rem" }}>🛡️</span>
          <div style={{ fontSize:".84rem", lineHeight:1.5, color:"rgba(214,235,224,.92)" }}>{escrow}</div>
        </div>

        <button onClick={primary} style={{ width:"100%", padding:".85rem 1rem", background:"#ea6b14", color:"#fff", border:"none", borderRadius:"10px", fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:".95rem", cursor:"pointer", marginBottom:".55rem" }}>{primaryLabel}</button>
        <button onClick={close} style={{ width:"100%", padding:".6rem", background:"rgba(var(--ff-fg), .06)", color:"rgba(var(--ff-muted), .8)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"9px", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer" }}>I'll do it later</button>
      </div>
    </div>
  );
}
