import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";

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
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [err, setErr]         = useState("");
  const [showLog, setShowLog] = useState(false);
  const [log, setLog]         = useState<any[] | null>(null);

  const withEmail = recipients.filter(r => r.email);
  const noEmail   = recipients.filter(r => !r.email);

  useEffect(() => {
    if (showLog && log === null) {
      supabase.rpc("admin_list_messages", { p_limit: 50 }).then(({ data }) =>
        setLog(Array.isArray(data) ? data : []));
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
      try { if (e?.context?.json) { const b = await e.context.json(); if (b?.error) msg = b.error; } } catch {}
      setErr(msg);
    } finally { setSending(false); }
  };

  const overlay = {
    position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1000,
    display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3rem 1rem", overflowY: "auto" as const,
  };
  const card = {
    background: "#1a2236", color: "#f0f4ff", border: "1px solid rgba(240,244,255,.12)", borderRadius: 14,
    width: "min(560px, 100%)", padding: "1.5rem", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 20px 60px rgba(0,0,0,.4)",
  };
  const label = { fontSize: ".78rem", color: "#9aa4bf", marginBottom: ".3rem", display: "block" };
  const inp = {
    width: "100%", padding: ".6rem .8rem", background: "rgba(240,244,255,.06)", border: "1px solid rgba(240,244,255,.14)",
    borderRadius: 8, color: "#f0f4ff", fontFamily: "inherit", fontSize: ".9rem", boxSizing: "border-box" as const,
  };
  const btn = {
    padding: ".6rem 1.1rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8,
    fontFamily: "inherit", fontSize: ".88rem", fontWeight: 600, cursor: "pointer",
  };
  const ghost = {
    padding: ".6rem 1.1rem", background: "rgba(240,244,255,.06)", color: "#c7cfe6", border: "1px solid rgba(240,244,255,.14)",
    borderRadius: 8, fontFamily: "inherit", fontSize: ".88rem", cursor: "pointer",
  };
  const chip = {
    fontSize: ".74rem", padding: ".2rem .55rem", background: "rgba(234,107,20,.12)", border: "1px solid rgba(234,107,20,.3)",
    borderRadius: 99, color: "#f0d3b8",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.5rem", letterSpacing: ".04em", color: "#ea6b14" }}>
            Email {withEmail.length === 1 ? withEmail[0].name || "contractor" : `${withEmail.length} contractors`}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#9aa4bf", fontSize: "1.3rem", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {result ? (
          <div>
            <div style={{ padding: ".9rem 1rem", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.35)", borderRadius: 10, marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: ".2rem" }}>✓ Sent to {result.sent} contractor{result.sent === 1 ? "" : "s"}.</div>
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
            <div style={{ marginBottom: ".9rem" }}>
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

            <div style={{ marginBottom: ".9rem" }}>
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

            <div style={{ fontSize: ".74rem", color: "#9aa4bf", marginBottom: ".9rem" }}>
              Sent from noreply@freddyfixit.ca — replies go to hello@freddyfixit.ca.
            </div>

            {err && (
              <div style={{ padding: ".6rem .8rem", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.4)", borderRadius: 8, color: "#f0b8b8", fontSize: ".82rem", marginBottom: ".9rem" }}>
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
              <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(240,244,255,.1)", paddingTop: ".9rem", maxHeight: 260, overflowY: "auto" }}>
                {log === null && <div style={{ fontSize: ".8rem", color: "#9aa4bf" }}>Loading…</div>}
                {log !== null && log.length === 0 && <div style={{ fontSize: ".8rem", color: "#9aa4bf" }}>No messages sent yet.</div>}
                {log !== null && log.map((m: any) => (
                  <div key={m.id} style={{ padding: ".55rem 0", borderBottom: "1px solid rgba(240,244,255,.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
                      <span style={{ fontSize: ".82rem", fontWeight: 500 }}>{m.subject}</span>
                      <span style={{ fontSize: ".72rem", color: m.status === "sent" ? "#8fd6a3" : "#f0b8b8" }}>{m.status}</span>
                    </div>
                    <div style={{ fontSize: ".74rem", color: "#9aa4bf" }}>
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
  );
}
