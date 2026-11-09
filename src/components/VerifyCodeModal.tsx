import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";
import { mfaReason } from "@/lib/mfa";
import { ensureUiStyles } from "./ui/uiStyles";

// Re-verify a lapsed two-step window, in place.
//
// WHY THIS EXISTS (2026-11-04). `mfa_ok()` only counts a code verified in the
// last 12 hours, but until this component the ONLY screen that could refresh
// that window was the password form on /login — and that form is skipped
// entirely by Google sign-in. The admin enrolled on Nov 3, came back the next
// day on a live session, and every `admin_guard()` RPC refused with a message
// pointing at a code there was no way to request. He could not approve a
// contractor. A control that can never succeed is worse than no control.
//
// So: one modal, mounted wherever a refusal can happen, that requests a code
// for purpose 'login' and verifies it. `mfa_verify` stamps `last_verified_at`
// on any non-enroll purpose, which is exactly what the gate reads.
//
// It does NOT sign anyone out and it does NOT weaken the gate. The session was
// always valid; what lapsed was the second factor, and this is the way to
// present it again.

type Props = {
  /** Called after a successful verify. The caller retries whatever was refused. */
  onDone: () => void;
  /** Called when the person backs out. The refused action stays undone. */
  onCancel: () => void;
  /** One line naming what is waiting on this. Keeps the prompt from feeling random. */
  what?: string;
};

export default function VerifyCodeModal({ onDone, onCancel, what }: Props) {
  ensureUiStyles();
  const [code, setCode]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [note, setNote]         = useState("");
  const [recovery, setRecovery] = useState(false);
  const [sent, setSent]         = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requested = useRef(false);

  // Send the first code automatically. The ref guard matters: React 18 runs
  // effects twice in development, and two codes means the first email is
  // superseded before it lands, which reads as "the code doesn't work".
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    sendCode();
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, [recovery]);

  async function sendCode() {
    setErr(""); setNote(""); setBusy(true);
    try {
      const { data, error } = await supabase.rpc("mfa_request_code", { p_purpose: "login" });
      if (error) throw error;
      if (!(data as any)?.ok) { setErr(mfaReason((data as any)?.reason)); return; }
      setSent(true);
      setNote("Code sent — check your email. It expires in 10 minutes.");
    } catch (e: any) {
      setErr(e?.message || "Couldn't send the code. Try again in a moment.");
    } finally { setBusy(false); }
  }

  async function verify() {
    setErr(""); setNote(""); setBusy(true);
    try {
      const { data, error } = recovery
        ? await supabase.rpc("mfa_use_recovery", { p_code: code.trim() })
        : await supabase.rpc("mfa_verify", { p_code: code, p_purpose: "login" });
      if (error) throw error;
      const d = data as any;
      if (!d?.ok) { setErr(mfaReason(d?.reason, d?.attempts_left)); return; }
      onDone();
    } catch (e: any) {
      setErr(e?.message || "Couldn't check that code.");
    } finally { setBusy(false); }
  }

  const ready = recovery ? code.trim().length > 0 : code.length === 6;

  // ⚠️ THE SCRIM HAS NO onClick, AND THAT IS THE POINT. Every other converted
  // dialog closes on a scrim tap; this one is the second factor, so a stray tap
  // outside the card must not dismiss it — the only ways out are a correct
  // code, a recovery code, or the explicit Cancel. The .ffu-scrim class is
  // purely the layout/backdrop here. If someone later adds the usual
  // `onClick={onCancel}` "for consistency", they have made the gate
  // dismissible by accident.
  const title: React.CSSProperties = {
    fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.6rem", letterSpacing: ".04em",
    margin: "0 0 .5rem", display: "flex", alignItems: "center", gap: ".5rem", lineHeight: 1.1,
  };
  const body: React.CSSProperties = {
    fontSize: ".95rem", color: "rgb(var(--ff-muted))", lineHeight: 1.5, margin: "0 0 1rem",
  };
  const codeInput: React.CSSProperties = {
    width: "100%", padding: ".75rem .9rem", borderRadius: "10px",
    background: "rgba(var(--ff-fg), .06)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .16)",
    color: "var(--ff-text)", fontFamily: "'SFMono-Regular',Menlo,Consolas,monospace",
    fontSize: "1.25rem", letterSpacing: recovery ? ".12em" : ".35em", textAlign: "center",
    boxSizing: "border-box", marginBottom: ".8rem", minHeight: "44px",
  };
  const btn = (kind: "primary" | "quiet"): React.CSSProperties => ({
    flex: 1, padding: ".75rem 1rem", borderRadius: "10px", minHeight: "44px",
    background: kind === "primary" ? "var(--ff-c10)" : "rgba(var(--ff-fg), .06)",
    color: kind === "primary" ? "#fff" : "rgb(var(--ff-muted))",
    border: kind === "primary" ? "none" : "var(--ff-hair-w) solid rgba(var(--ff-fg), .14)",
    fontFamily: "'Bebas Neue',sans-serif", letterSpacing: ".06em", fontSize: "1rem",
    cursor: busy ? "default" : "pointer",
  });
  const linkBtn: React.CSSProperties = {
    background: "none", border: "none", padding: ".4rem 0", marginTop: ".6rem",
    color: "var(--ff-c10)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer",
    textDecoration: "underline", textUnderlineOffset: "3px",
  };

  return (
    <div className="ffu-scrim">
      <div
        className="ffu-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Verify your sign-in code"
        style={{ ["--ffu-modal-w" as any]: "420px" }}
      >
        {/* No <span className="ffu-grab"/> here, deliberately. The grabber is
            the signal "this panel is dismissible, and the dismiss is the scrim
            tap" (see uiStyles.ts). This panel is not, so the grabber would be
            promising a gesture that does nothing. */}
        <p style={title}><Ic name="key" size={18} /> Verify it&rsquo;s you</p>

        <p style={body}>
          {what
            ? <>Two-step sign-in is on, and your last code has expired, so {what} is on hold.{" "}</>
            : <>Two-step sign-in is on and your last code has expired.{" "}</>}
          {recovery
            ? "Enter one of your recovery codes."
            : "We've emailed a 6-digit code to the address on your account."}
        </p>

        {err  && <p style={{ fontSize: ".9rem", color: "var(--ff-danger)", margin: "0 0 .7rem", lineHeight: 1.45 }}>{err}</p>}
        {note && !err && <p style={{ fontSize: ".9rem", color: "#22c55e", margin: "0 0 .7rem", lineHeight: 1.45 }}>{note}</p>}

        <input
          ref={inputRef}
          style={codeInput}
          value={code}
          onChange={e => setCode(recovery
            ? e.target.value.toUpperCase().slice(0, 16)
            : e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={e => { if (e.key === "Enter" && ready && !busy) { e.preventDefault(); verify(); } }}
          placeholder={recovery ? "RECOVERY CODE" : "000000"}
          inputMode={recovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          aria-label={recovery ? "Recovery code" : "6-digit code"}
        />

        <div style={{ display: "flex", gap: ".5rem" }}>
          <button onClick={verify} disabled={busy || !ready}
                  style={{ ...btn("primary"), opacity: busy || !ready ? .6 : 1 }}>
            {busy ? "Checking…" : "Verify"}
          </button>
          {!recovery && (
            <button onClick={sendCode} disabled={busy} style={{ ...btn("quiet"), opacity: busy ? .6 : 1 }}>
              {sent ? "Resend" : "Send code"}
            </button>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <button style={linkBtn}
                  onClick={() => { setRecovery(r => !r); setCode(""); setErr(""); setNote(""); }}>
            {recovery ? "Use an emailed code instead" : "Use a recovery code instead"}
          </button>
          <button style={{ ...linkBtn, color: "rgb(var(--ff-muted))" }} onClick={onCancel}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
