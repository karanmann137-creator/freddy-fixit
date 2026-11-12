import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";
import { Sk } from "@/components/Skeleton";
import VerifyCodeModal from "@/components/VerifyCodeModal";
import { mfaOwed } from "@/lib/mfa";
import { ensureUiStyles } from "./ui/uiStyles";

// Admin compose box for emailing one or many contractors a custom message.
// Sends through the admin-message edge fn (admin-gated; looks up recipient
// emails server-side and logs every send to public.admin_messages). Reusable
// for a single recipient (per-card "Email" button) or a bulk broadcast.
export type MsgRecipient = { id: string; name: string; email?: string | null };

export default function AdminMessageModal({ recipients, onClose, onSent }: {
  recipients: MsgRecipient[];
  onClose: () => void;
  onSent?: (r: any) => void;
}) {
  ensureUiStyles();
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [err, setErr]         = useState("");
  const [showLog, setShowLog] = useState(false);
  const [log, setLog]         = useState<any[] | null>(null);
  // A failed read is not an empty result: supabase.rpc() RESOLVES with
  // {data,error}, so discarding the error here rendered "No messages sent yet."
  // for a history we could not read — which on this surface reads as "that
  // broadcast never went out" and invites sending it twice.
  const [logFailed, setLogFailed] = useState(false);
  // A lapsed two-step window turns the admin-message edge fn into a 403 whose
  // remedy lived nowhere on this modal: it says "Verify your sign-in code
  // first", and there was no code to verify. Same shape, same fix, same naming
  // as AdminDashboard's `verifyGate` — `retry` resumes the send once the code
  // lands, `what` names it so the ask never feels like it came out of nowhere.
  const [verifyGate, setVerifyGate] = useState<{ retry: () => void; what: string } | null>(null);

  const withEmail = recipients.filter(r => r.email);
  const noEmail   = recipients.filter(r => !r.email);

  useEffect(() => {
    // `|| logFailed` so hiding and re-opening the history retries it. Without
    // it the failure line would be permanent — log is [] rather than null after
    // a failure, so nothing would ever ask again, and a warning with no way out
    // is the dead end this file is being fixed for.
    if (showLog && (log === null || logFailed)) {
      supabase.rpc("admin_list_messages", { p_limit: 50 }).then(({ data, error }) => {
        setLogFailed(!!error);
        setLog(error ? [] : (Array.isArray(data) ? data : []));
      });
    }
  }, [showLog]);

  const send = async () => {
    setErr("");
    if (!subject.trim()) { setErr("Add a subject."); return; }
    if (!body.trim())    { setErr("Write a message."); return; }
    if (!withEmail.length) { setErr("None of the selected contractors have an email on file."); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-message", {
        body: { recipient_ids: withEmail.map(r => r.id), subject: subject.trim(), body },
      });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      setResult(data);
      setLog(null); // force the log to refresh next time it's opened
      onSent?.(data);
    } catch (e: any) {
      let msg = e?.message || String(e);
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch { /* error body was not JSON; keep the default message */ }
      // Ask the SERVER whether a code is actually owed — never match on `msg`.
      // admin_action_allowed's refusal string is not the state, and the state
      // can answer for itself (see mfaOwed). On a genuine lapse the modal takes
      // over and the send resumes by itself, so the refusal never has to be
      // shown as an instruction the owner cannot act on.
      if (await mfaOwed()) { setVerifyGate({ retry: () => { void send(); }, what: "sending this message" }); return; }
      setErr(msg);
    } finally { setSending(false); }
  };

  // The card and overlay objects are GONE — .ffu-scrim/.ffu-modal carry both.
  // The child literals went with them: this card was `background:"#1a2236"`
  // with `#f0f4ff` text, i.e. the dark palette written out by hand, and
  // AdminDashboard follows the theme (`--ff-bg`/`--ff-text`). So in light mode
  // it was already a navy card on an off-white page — and converting it to
  // .ffu-modal, whose background is the THEME's `--ff-glass`, would have put
  // near-white text on near-white glass. The conversion was only safe once the
  // six literals became tokens, which is the Von Restorff/light-mode rule in
  // CLAUDE.md reached from the other direction.
  const label = { fontSize: ".78rem", color: "rgb(var(--ff-muted))", marginBottom: ".3rem", display: "block" };
  const inp = {
    width: "100%", padding: ".6rem .8rem", background: "rgba(var(--ff-fg), .06)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .14)",
    borderRadius: 8, color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem", boxSizing: "border-box" as const,
  };
  const btn = {
    padding: ".6rem 1.1rem", background: "var(--ff-c10)", color: "#fff", border: "none", borderRadius: 8,
    fontFamily: "inherit", fontSize: ".88rem", fontWeight: 600, cursor: "pointer",
  };
  const ghost = {
    padding: ".6rem 1.1rem", background: "rgba(var(--ff-fg), .06)", color: "var(--ff-text)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .14)",
    borderRadius: 8, fontFamily: "inherit", fontSize: ".88rem", cursor: "pointer",
  };
  const chip = {
    fontSize: ".74rem", padding: ".2rem .55rem", background: "rgba(var(--ff-accent-rgb), .12)", border: "1px solid rgba(var(--ff-accent-rgb), .3)",
    borderRadius: 99, color: "var(--ff-c10)",
  };

  return (
    <>
    <div onClick={onClose} className="ffu-scrim">
      <div
        onClick={e => e.stopPropagation()}
        className="ffu-modal"
        role="dialog"
        aria-modal="true"
        style={{ ["--ffu-modal-w" as any]: "560px" }}
      >
        <span className="ffu-grab" aria-hidden="true" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.5rem", letterSpacing: ".04em", color: "var(--ff-c10)" }}>
            Email {withEmail.length === 1 ? withEmail[0].name || "contractor" : `${withEmail.length} contractors`}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgb(var(--ff-muted))", fontSize: "1.3rem", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {result ? (
          <div>
            <div style={{ padding: ".9rem 1rem", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.35)", borderRadius: 10, marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "var(--ff-s1)" }}>✓ Sent to {result.sent} contractor{result.sent === 1 ? "" : "s"}.</div>
              {result.failed > 0 && (
                <div style={{ fontSize: ".82rem", color: "#f0b8b8" }}>{result.failed} couldn't be sent (no email on file or a delivery error).</div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={btn} onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "var(--ff-s4)" }}>
              <span style={label}>To</span>
              <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap" }}>
                {withEmail.slice(0, 12).map(r => (
                  <span key={r.id} style={chip}>{r.name || r.email}</span>
                ))}
                {withEmail.length > 12 && <span style={chip}>+{withEmail.length - 12} more</span>}
              </div>
              {noEmail.length > 0 && (
                <div style={{ fontSize: ".74rem", color: "#f0b8b8", marginTop: ".4rem" }}>
                  {noEmail.length} selected contractor{noEmail.length === 1 ? " has" : "s have"} no email on file and will be skipped.
                </div>
              )}
            </div>

            <div style={{ marginBottom: "var(--ff-s4)" }}>
              <span style={label}>Subject</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
                placeholder="e.g. A new job just posted in your area" style={inp} />
            </div>

            <div style={{ marginBottom: ".5rem" }}>
              <span style={label}>Message</span>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={8}
                placeholder="Write your message. Each contractor gets it addressed to them by first name."
                style={{ ...inp, resize: "vertical" as const, lineHeight: 1.5 }} />
            </div>

            <div style={{ fontSize: ".74rem", color: "rgb(var(--ff-muted))", marginBottom: "var(--ff-s4)" }}>
              Sent from noreply@freddyfixit.ca — replies go to hello@freddyfixit.ca.
            </div>

            {err && (
              <div style={{ padding: ".6rem .8rem", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.4)", borderRadius: 8, color: "#f0b8b8", fontSize: ".82rem", marginBottom: "var(--ff-s4)" }}>
                {err}
              </div>
            )}

            <div style={{ display: "flex", gap: ".6rem", justifyContent: "space-between", alignItems: "center" }}>
              <button style={{ ...ghost, fontSize: ".8rem", padding: ".45rem .8rem" }} onClick={() => setShowLog(v => !v)}>
                <Ic name="clipboard-list" size={12} style={{ marginRight: 4 }} />{showLog ? "Hide sent history" : "Sent history"}
              </button>
              <div style={{ display: "flex", gap: ".6rem" }}>
                <button style={ghost} onClick={onClose} disabled={sending}>Cancel</button>
                <button style={{ ...btn, opacity: sending ? .7 : 1 }} onClick={send} disabled={sending}>
                  {sending ? "Sending…" : `Send${withEmail.length > 1 ? ` to ${withEmail.length}` : ""}`}
                </button>
              </div>
            </div>

            {showLog && (
              <div style={{ marginTop: "1rem", borderTop: "var(--ff-hair-w) solid rgba(var(--ff-fg), .1)", paddingTop: "var(--ff-s4)", maxHeight: 260, overflowY: "auto" }}>
                {log === null && (
                  <div className="ff-on-dark" aria-busy="true" style={{ display: "grid", gap: "var(--ff-s3)", padding: ".3rem 0" }}>
                    <span className="ff-sr-only">Loading the send history</span>
                    <Sk h={26} /><Sk h={26} /><Sk h={26} />
                  </div>
                )}
                {logFailed && <div style={{ fontSize: ".8rem", color: "var(--ff-warn)" }}>Couldn&rsquo;t load the send history.</div>}
                {!logFailed && log !== null && log.length === 0 && <div style={{ fontSize: ".8rem", color: "rgb(var(--ff-muted))" }}>No messages sent yet.</div>}
                {log !== null && log.map((m: any) => (
                  <div key={m.id} style={{ padding: ".55rem 0", borderBottom: "var(--ff-hair-w) solid rgba(var(--ff-fg), .06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
                      <span style={{ fontSize: ".82rem", fontWeight: 500 }}>{m.subject}</span>
                      <span style={{ fontSize: ".72rem", color: m.status === "sent" ? "#8fd6a3" : "#f0b8b8" }}>{m.status}</span>
                    </div>
                    <div style={{ fontSize: ".74rem", color: "rgb(var(--ff-muted))" }}>
                      to {m.recipient_name || m.recipient_email} · {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    {/* Mounted as a SIBLING of the scrim, not inside it: the scrim closes this
        modal on click, and a verify prompt that dismisses the compose box —
        taking the typed message with it — is worse than the dead end it
        replaces. Without this mount the Send button would silently do nothing
        on a lapsed window, which is why check_mounts.py needles it. */}
    {verifyGate && (
      <VerifyCodeModal
        what={verifyGate.what}
        onDone={() => { const again = verifyGate.retry; setVerifyGate(null); again(); }}
        onCancel={() => setVerifyGate(null)}
      />
    )}
    </>
  );
}
