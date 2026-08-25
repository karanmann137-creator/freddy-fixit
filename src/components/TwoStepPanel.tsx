import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";
import { mfaReason, type MfaStatus } from "@/lib/mfa";

// Two-step sign-in (email OTP).
//
// Codes are delivered by Resend through the `mfa-code` edge function, NOT by
// Supabase's own mailer. That mailer sends signup confirmation and password
// reset, and in Aug 2026 it failed silently for a month — three accounts were
// stranded and we only found out because one of them phoned. A second factor on
// that same path would have turned "new signups are stuck" into "everyone is
// locked out of their own account", so it rides the mailer we monitor instead.
//
// The panel renders whether or not two-step is on, so someone who turned it on
// can always find the way back out. Every write goes through an RPC that has
// verified a code; nothing here trusts the browser.

type Stage = "idle" | "code" | "codes" | "off-code";

export default function TwoStepPanel() {
  const [st, setSt]           = useState<MfaStatus | null>(null);
  const [loadFailed, setFail] = useState(false);
  const [stage, setStage]     = useState<Stage>("idle");
  const [code, setCode]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");
  const [note, setNote]       = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [saved, setSaved]     = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc("mfa_status");
    // A failed read is not "two-step is off". Saying "off" on a network blip
    // would invite someone to turn it on again and wipe their recovery codes.
    if (error) { setFail(true); return; }
    setFail(false);
    setSt(data as MfaStatus);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (stage === "code" || stage === "off-code") codeRef.current?.focus();
  }, [stage]);

  async function requestCode(purpose: "enroll" | "disable") {
    setErr(""); setNote(""); setBusy(true);
    try {
      const { data, error } = await supabase.rpc("mfa_request_code", { p_purpose: purpose });
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason)); return false; }
      setNote("Code sent — check your email.");
      setStage(purpose === "enroll" ? "code" : "off-code");
      setCode("");
      return true;
    } catch (e: any) {
      setErr(e?.message || "Couldn't send the code. Try again in a moment.");
      return false;
    } finally { setBusy(false); }
  }

  async function verifyEnroll() {
    setErr(""); setNote(""); setBusy(true);
    try {
      const { data, error } = await supabase.rpc("mfa_verify", { p_code: code, p_purpose: "enroll" });
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason, data?.attempts_left)); return; }
      setRecovery((data.recovery_codes ?? []) as string[]);
      setSaved(false);
      setStage("codes");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Couldn't check that code.");
    } finally { setBusy(false); }
  }

  async function turnOff() {
    setErr(""); setNote("");
    // Turning it off must itself pass the factor, or a stolen session simply
    // switches it off and the whole thing was decoration.
    if (!st?.verified_recently) { await requestCode("disable"); return; }
    await doDisable();
  }

  async function verifyThenDisable() {
    setErr(""); setBusy(true);
    try {
      const { data, error } = await supabase.rpc("mfa_verify", { p_code: code, p_purpose: "disable" });
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason, data?.attempts_left)); return; }
      await doDisable();
    } catch (e: any) {
      setErr(e?.message || "Couldn't check that code.");
    } finally { setBusy(false); }
  }

  async function doDisable() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("mfa_disable");
      if (error) throw error;
      if (!data?.ok) { setErr(mfaReason(data?.reason)); return; }
      setStage("idle"); setCode(""); setRecovery([]);
      setNote("Two-step sign-in is off.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Couldn't turn it off.");
    } finally { setBusy(false); }
  }

  function downloadCodes() {
    const body =
      "Freddy Fix It — recovery codes\n" +
      "Generated " + new Date().toLocaleString() + "\n\n" +
      "Each code works once. Use one to sign in if you can't get to your email.\n" +
      "Keep this somewhere only you can reach.\n\n" +
      recovery.join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = "freddy-fixit-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  const card: React.CSSProperties = {
    background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .1)",
    borderRadius: "12px", padding: "1rem 1.05rem", marginBottom: "1.1rem",
  };
  const sectionTitle: React.CSSProperties = {
    fontFamily: "'DM Sans',sans-serif", fontSize: ".72rem", letterSpacing: ".08em",
    textTransform: "uppercase", color: "rgb(var(--ff-muted))", margin: "0 0 .6rem", fontWeight: 600,
  };
  const body: React.CSSProperties = {
    fontSize: ".88rem", color: "rgb(var(--ff-muted))", margin: "0 0 .8rem", lineHeight: 1.5,
  };
  const btn = (kind: "primary" | "quiet"): React.CSSProperties => ({
    width: "100%", padding: ".75rem 1rem", borderRadius: "10px",
    background: kind === "primary" ? "#ea6b14" : "rgba(var(--ff-fg), .06)",
    color: kind === "primary" ? "#fff" : "rgb(var(--ff-muted))",
    border: kind === "primary" ? "none" : "1px solid rgba(var(--ff-fg), .14)",
    fontFamily: "inherit", fontWeight: 700, fontSize: ".9rem",
    cursor: busy ? "default" : "pointer", opacity: busy ? .7 : 1,
  });
  const codeInput: React.CSSProperties = {
    width: "100%", padding: ".7rem .9rem", borderRadius: "10px",
    background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .14)",
    color: "var(--ff-text)", fontFamily: "'SFMono-Regular',Menlo,Consolas,monospace",
    fontSize: "1.25rem", letterSpacing: ".35em", textAlign: "center",
    boxSizing: "border-box", marginBottom: ".7rem", outline: "none",
  };
  const pill = (on: boolean): React.CSSProperties => ({
    display: "inline-block", padding: ".18rem .55rem", borderRadius: "999px",
    fontSize: ".7rem", fontWeight: 700, letterSpacing: ".04em",
    background: on ? "rgba(34,197,94,.15)" : "rgba(var(--ff-fg), .08)",
    color: on ? "#22c55e" : "rgb(var(--ff-muted))",
    border: on ? "1px solid rgba(34,197,94,.35)" : "1px solid rgba(var(--ff-fg), .14)",
  });

  if (loadFailed) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Two-step sign-in</p>
        <p style={{ ...body, margin: 0 }}>
          We couldn't check your two-step setting just now. Refresh the page to try again —
          your current setting hasn't changed.
        </p>
      </div>
    );
  }
  if (!st) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Two-step sign-in</p>
        <p style={{ ...body, margin: 0 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <p style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: ".5rem" }}>
        <Ic name="key" size={13} /> Two-step sign-in
        <span style={pill(st.enabled)}>{st.enabled ? "ON" : "OFF"}</span>
      </p>

      {err  && <p style={{ fontSize: ".83rem", color: "var(--ff-danger)", margin: "0 0 .7rem", lineHeight: 1.45 }}>{err}</p>}
      {note && <p style={{ fontSize: ".83rem", color: "#22c55e",        margin: "0 0 .7rem", lineHeight: 1.45 }}>{note}</p>}

      {/* ---- Showing the recovery codes. Happens exactly once, at enrolment. ---- */}
      {stage === "codes" ? (
        <>
          <p style={body}>
            Two-step sign-in is <strong style={{ color: "var(--ff-text)" }}>on</strong>. Save these
            recovery codes now — <strong style={{ color: "var(--ff-text)" }}>this is the only time
            they are shown</strong>. Each one works once, and they're what gets you in if you can't
            reach your email.
          </p>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: ".4rem",
            background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .14)",
            borderRadius: "10px", padding: ".8rem", marginBottom: ".8rem",
          }}>
            {recovery.map(c => (
              <span key={c} style={{
                fontFamily: "'SFMono-Regular',Menlo,Consolas,monospace", fontSize: ".9rem",
                letterSpacing: ".08em", color: "var(--ff-text)", textAlign: "center",
              }}>{c}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: ".5rem", marginBottom: ".7rem" }}>
            <button onClick={downloadCodes} style={{ ...btn("quiet"), display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem" }}>
              <Ic name="download" size={15} /> Download
            </button>
            <button
              onClick={() => { navigator.clipboard?.writeText(recovery.join("\n")); setSaved(true); setNote("Copied."); }}
              style={btn("quiet")}
            >
              Copy
            </button>
          </div>
          <button onClick={() => { setStage("idle"); setRecovery([]); setNote(""); }} disabled={!saved} style={{ ...btn("primary"), opacity: saved ? 1 : .55, cursor: saved ? "pointer" : "not-allowed" }}>
            {saved ? "Done — I've saved them" : "Download or copy them first"}
          </button>
        </>

      /* ---- Entering a code, either to finish enrolling or to turn it off. ---- */
      ) : stage === "code" || stage === "off-code" ? (
        <>
          <p style={body}>
            {stage === "code"
              ? "We emailed you a 6-digit code. Enter it to finish turning two-step on."
              : "We emailed you a 6-digit code. Enter it to turn two-step off."}
            {" "}It expires in 10 minutes.
          </p>
          <input
            ref={codeRef}
            style={codeInput}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); stage === "code" ? verifyEnroll() : verifyThenDisable(); } }}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="6-digit code"
          />
          <button
            onClick={() => (stage === "code" ? verifyEnroll() : verifyThenDisable())}
            disabled={busy || code.length !== 6}
            style={{ ...btn("primary"), opacity: busy || code.length !== 6 ? .6 : 1, marginBottom: ".5rem" }}
          >
            {busy ? "Checking…" : "Verify"}
          </button>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button onClick={() => requestCode(stage === "code" ? "enroll" : "disable")} disabled={busy} style={btn("quiet")}>
              Resend
            </button>
            <button onClick={() => { setStage("idle"); setCode(""); setErr(""); setNote(""); }} style={btn("quiet")}>
              Cancel
            </button>
          </div>
        </>

      /* ---- Resting state. ---- */
      ) : st.enabled ? (
        <>
          <p style={body}>
            When you sign in, we'll email you a 6-digit code. Someone who learns your password
            still can't get in without your email.
          </p>
          <p style={{ ...body, marginBottom: ".9rem" }}>
            <strong style={{ color: "var(--ff-text)" }}>{st.recovery_left}</strong> of your recovery
            codes are unused.
            {st.recovery_left <= 2 && " Turn two-step off and on again to get a fresh set."}
          </p>
          <button onClick={turnOff} disabled={busy} style={btn("quiet")}>
            {busy ? "Working…" : "Turn off two-step sign-in"}
          </button>
        </>
      ) : (
        <>
          <p style={body}>
            Add a second step at sign-in: after your password, we email you a 6-digit code.
            It means a stolen password on its own isn't enough to get into your account.
          </p>
          <p style={{ ...body, marginBottom: ".9rem" }}>
            You'll get 10 single-use recovery codes to save, so losing access to your email
            doesn't lock you out. If you lose those too, email{" "}
            <a href="mailto:hello@freddyfixit.ca" style={{ color: "#ea6b14" }}>hello@freddyfixit.ca</a>{" "}
            and we can switch it off for you.
          </p>
          <button onClick={() => requestCode("enroll")} disabled={busy} style={btn("primary")}>
            {busy ? "Sending code…" : "Turn on two-step sign-in"}
          </button>
        </>
      )}
    </div>
  );
}
