import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

// Self-service account deletion. Renders a "danger zone" card with a button
// that opens a typed-confirmation modal, then calls the `delete-account`
// edge function, signs the user out, and returns them home.
export default function DeleteAccount() {
  const [, setLocation] = useLocation();
  const [open, setOpen]               = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState("");

  const close = () => { if (!busy) { setOpen(false); setConfirmText(""); setErr(""); } };

  const handleDelete = async () => {
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) {
        // supabase-js wraps a non-2xx as FunctionsHttpError whose .message is
        // generic; the real reason (e.g. an active job) is in the response body.
        let msg = "";
        try {
          const body = await (error as any)?.context?.json?.();
          if (body?.error) msg = body.error;
        } catch (_) { /* fall back to the generic message below */ }
        throw new Error(msg || error.message);
      }
      await supabase.auth.signOut();
      setLocation("/");
    } catch (e: any) {
      setErr(e?.message || "We couldn't delete your account. Please try again, or email hello@freddyfixit.ca.");
      setBusy(false);
    }
  };

  const ready = confirmText.trim().toUpperCase() === "DELETE" && !busy;

  const s = {
    card:    { background:"rgba(239,68,68,.05)", border:"1px solid rgba(239,68,68,.25)", borderRadius:"14px", padding:"1.5rem", marginBottom:"1.5rem" },
    title:   { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".06em", color:"#ef4444", marginBottom:".75rem" },
    desc:    { color:"rgba(var(--ff-muted), .6)", fontSize:".88rem", lineHeight:1.5, marginBottom:"1.1rem" },
    danger:  { padding:".6rem 1.1rem", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.4)", borderRadius:"8px", color:"#fca5a5", fontFamily:"inherit", fontSize:".85rem", fontWeight:500, cursor:"pointer" },
    overlay: { position:"fixed" as const, inset:0, background:"rgba(10,14,24,.7)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem", zIndex:1000 },
    modal:   { background:"var(--ff-surface)", border:"1px solid rgba(var(--ff-fg), .1)", borderRadius:"16px", padding:"1.75rem", maxWidth:"440px", width:"100%", fontFamily:"'DM Sans',sans-serif", color:"var(--ff-text)" },
    mTitle:  { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".04em", marginBottom:"1rem" },
    mText:   { color:"rgba(var(--ff-muted), .75)", fontSize:".9rem", lineHeight:1.6, marginBottom:"1rem" },
    input:   { width:"100%", boxSizing:"border-box" as const, padding:".7rem 1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".95rem", letterSpacing:".05em", outline:"none", marginBottom:"1rem" },
    err:     { color:"#fca5a5", fontSize:".82rem", marginBottom:"1rem" },
    row:     { display:"flex", gap:".75rem", justifyContent:"flex-end", flexWrap:"wrap" as const },
    cancel:  { padding:".6rem 1.1rem", background:"rgba(var(--ff-fg), .06)", border:"1px solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"rgba(var(--ff-muted), .8)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer" },
    confirm: { padding:".6rem 1.1rem", background:"#ef4444", border:"none", borderRadius:"8px", color:"#fff", fontFamily:"inherit", fontSize:".85rem", fontWeight:600, cursor:"pointer" },
  };

  return (
    <>
      <div style={s.card}>
        <div style={s.title}>Delete Account</div>
        <p style={s.desc}>
          Permanently delete your Freddy Fix It account and personal data &mdash; your profile,
          your requests, messages, and any photos you uploaded. This can&rsquo;t be undone.
        </p>
        <button style={s.danger} onClick={() => setOpen(true)}>Delete my account</button>
      </div>

      {open && (
        <div style={s.overlay} onClick={close}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.mTitle}>Delete your account?</div>
            <p style={s.mText}>
              This permanently removes your profile, your requests, your messages, and any
              photos you uploaded. Completed job records are kept for our books but are no
              longer linked to your name. <strong>This cannot be undone.</strong>
            </p>
            <p style={s.mText}>Type <strong>DELETE</strong> below to confirm.</p>
            <input
              autoFocus
              style={s.input}
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              onKeyDown={e => { if (e.key === "Enter" && ready) handleDelete(); }}
            />
            {err && <p style={s.err}>{err}</p>}
            <div style={s.row}>
              <button style={s.cancel} onClick={close} disabled={busy}>Cancel</button>
              <button
                style={{ ...s.confirm, opacity: ready ? 1 : .5, cursor: ready ? "pointer" : "not-allowed" }}
                disabled={!ready}
                onClick={handleDelete}
              >
                {busy ? "Deleting\u2026" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
