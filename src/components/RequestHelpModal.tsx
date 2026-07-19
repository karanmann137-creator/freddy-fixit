import { useState } from "react";
import { supabase } from "@/lib/supabase";

// "Request help" / "Report a bug" — sends a support message to the Freddy team
// (support-request edge fn → emails hello@freddyfixit.ca) with an optional job
// reference, or opens the AI chat assistant for a quick question.
// mode="bug" reuses the same pipeline with bug-report copy + a subject prefix
// so bug emails are easy to spot in the inbox.
export default function RequestHelpModal({
  userId,
  onClose,
  role = "contractor",
  mode = "help",
}: {
  userId: string;
  onClose: () => void;
  role?: "client" | "contractor";
  mode?: "help" | "bug";
}) {
  const isBug = mode === "bug";
  const [subject, setSubject] = useState("");
  const [jobCodeRef, setJobCodeRef] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim()) { setErr(isBug ? "Please describe what went wrong." : "Please describe what you need help with."); return; }
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.functions.invoke("support-request", {
        body: {
          role,
          user_id: userId,
          subject: isBug
            ? `🐞 Bug report: ${subject.trim() || "something isn't working"}`
            : subject.trim() || (role === "client" ? "Client support request" : "Contractor support request"),
          job_code: jobCodeRef.trim() || null,
          message: message.trim(),
        },
      });
      if (error) throw new Error(error.message);
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || "Couldn't send your request. Please try again or email hello@freddyfixit.ca.");
    } finally {
      setBusy(false);
    }
  };

  const openChat = () => { onClose(); window.dispatchEvent(new Event("ff:open-chat")); };

  const label = { fontSize: ".72rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", marginBottom: ".35rem", display: "block" };
  const field = { width: "100%", padding: ".6rem .8rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".88rem", boxSizing: "border-box" as const };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "'DM Sans',sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "460px", maxHeight: "90vh", overflowY: "auto", background: "var(--ff-bg)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "16px", padding: "1.5rem", color: "var(--ff-text)", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.4rem", letterSpacing: ".05em", color: "#ea6b14", marginBottom: ".4rem" }}>
          {isBug ? "Report a Bug" : "Request Help"}
        </div>

        {sent ? (
          <>
            <div style={{ fontSize: ".9rem", color: "rgba(var(--ff-muted), .8)", lineHeight: 1.6, margin: "1rem 0 1.5rem" }}>
              {isBug
                ? "Thanks for the report — our team will look into it. We'll email you if we need more detail."
                : "Thanks — your message is on its way to our team. We'll get back to you by email as soon as we can."}
            </div>
            <button onClick={onClose} style={{ width: "100%", padding: ".75rem 1rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, cursor: "pointer" }}>Done</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: ".84rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              {isBug
                ? "Found something broken or behaving strangely? Tell us what happened and we'll fix it. The more detail, the faster we can track it down."
                : "Tell us what's going on and we'll help. For a quick question you can also chat with Freddy, our AI assistant."}
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>{isBug ? "What's broken?" : "What do you need help with?"}</label>
              <input value={subject} placeholder="Short summary (optional)" onChange={e => setSubject(e.target.value)} style={field} />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Job ID (optional)</label>
              <input value={jobCodeRef} placeholder="e.g. FFX-4A9C2" onChange={e => setJobCodeRef(e.target.value)} style={field} />
              <div style={{ fontSize: ".72rem", color: "rgba(var(--ff-muted), .5)", marginTop: ".3rem" }}>{isBug ? "Add the Job ID if the bug happened on a specific job." : "Find the Job ID on the job card if your question is about a specific job."}</div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Message *</label>
              <textarea value={message} rows={4} placeholder={isBug ? "What happened, what you expected, and what page you were on…" : "Describe the issue or question…"} onChange={e => setMessage(e.target.value)} style={{ ...field, resize: "vertical" as const }} />
            </div>

            {err && <div style={{ fontSize: ".82rem", color: "var(--ff-danger)", marginBottom: ".75rem" }}>{err}</div>}

            <div style={{ display: "flex", gap: ".6rem" }}>
              <button onClick={submit} disabled={busy} style={{ flex: 1, padding: ".75rem 1rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, cursor: busy ? "default" : "pointer", opacity: busy ? .7 : 1 }}>
                {busy ? "Sending…" : "Send to our team"}
              </button>
              <button onClick={onClose} disabled={busy} style={{ padding: ".75rem 1.1rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)", borderRadius: "8px", color: "rgba(var(--ff-muted), .7)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer" }}>Cancel</button>
            </div>

            <div style={{ borderTop: "1px solid rgba(var(--ff-fg), .08)", margin: "1.1rem 0 0", paddingTop: "1rem", textAlign: "center" as const }}>
              <button onClick={openChat} style={{ background: "none", border: "none", color: "#ea6b14", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 500, cursor: "pointer" }}>
                Prefer to chat? Ask Freddy →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
