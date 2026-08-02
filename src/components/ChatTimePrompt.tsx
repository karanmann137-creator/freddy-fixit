import { useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";
import { formatWhen } from "@/lib/chatParse";

/**
 * The scheduling prompt that pops when the OTHER person named a time in the
 * job chat.
 *
 * The detection happens on the sender's side (they typed it) and is persisted
 * onto the job row by `chat_propose_time`, so this side needs no polling and
 * no open chat window — the dashboards already load the job.
 *
 * Accepting calls `chat_agree_time`, which is careful never to skip a payment
 * step. It returns which branch it took:
 *   scheduled        — the job was already booked and paid; the time moved and
 *                      the visit is confirmed
 *   proposal_updated — an estimate is sitting with the client; only the
 *                      proposed time moved. Approval + payment still happen
 *                      normally
 *   penciled         — no formal schedule yet; the time is pencilled in
 *   ignored          — nothing to do (job finished, or the time has passed)
 */
export default function ChatTimePrompt({
  job, title, onResolved, onSuggest, onClose,
}: {
  job: any;
  title: string;                 // e.g. "Kitchen Faucet Repair"
  onResolved: (outcome: string) => void;
  onSuggest: () => void;         // open the chat so they can type another time
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"" | "accept" | "decline">("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string>("");

  const when = formatWhen(job.chat_time_at);

  const accept = async () => {
    if (busy) return;
    setBusy("accept"); setErr("");
    const { data, error } = await supabase.rpc("chat_agree_time", { p_job_id: job.id });
    setBusy("");
    if (error) { setErr(error.message || "Couldn't save that time — please try again."); return; }
    const outcome = String(data ?? "ignored");
    setDone(outcome);
    onResolved(outcome);
  };

  const suggest = async () => {
    if (busy) return;
    setBusy("decline"); setErr("");
    const { error } = await supabase.rpc("chat_decline_time", { p_job_id: job.id });
    setBusy("");
    if (error) { setErr(error.message || "Something went wrong — please try again."); return; }
    onResolved("declined");
    onSuggest();
  };

  const doneCopy: Record<string, string> = {
    scheduled: "Booked. It's on your calendar and both of you have been told.",
    proposal_updated: "Time updated on the estimate. Nothing is charged until the estimate is approved in the usual way.",
    penciled: "Pencilled in. It'll show on your calendar — the formal schedule and payment still go through the normal steps.",
    ignored: "Nothing to update on this job.",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,11,20,.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem", fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, background: "var(--ff-bg)",
          border: "1px solid rgba(234,107,20,.45)", borderRadius: 14,
          boxShadow: "0 24px 70px rgba(0,0,0,.5)", overflow: "hidden",
        }}
      >
        <div style={{
          padding: "1rem 1.25rem", background: "rgba(234,107,20,.1)",
          borderBottom: "1px solid rgba(var(--ff-fg), .08)",
          display: "flex", alignItems: "center", gap: ".7rem",
        }}>
          <Ic name="calendar" size={18} style={{ color: "#ea6b14" }} />
          <div style={{ fontSize: ".95rem", fontWeight: 600, color: "var(--ff-text)" }}>
            {done ? "All set" : "A time was suggested in the chat"}
          </div>
        </div>

        <div style={{ padding: "1.25rem" }}>
          {done ? (
            <>
              <p style={{ fontSize: ".9rem", lineHeight: 1.6, color: "var(--ff-text)", margin: "0 0 .4rem" }}>
                <Ic name="check" size={14} style={{ marginRight: 6, color: "var(--ff-success)" }} />
                {when}
              </p>
              <p style={{ fontSize: ".84rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .75)", margin: 0 }}>
                {doneCopy[done] ?? doneCopy.ignored}
              </p>
              <button onClick={onClose} style={{ ...btn(true), marginTop: "1rem" }}>Done</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .6)", marginBottom: ".25rem" }}>{title}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ea6b14", marginBottom: ".7rem" }}>{when}</div>

              {job.chat_time_msg && (
                <div style={{
                  fontSize: ".84rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .8)",
                  background: "rgba(var(--ff-fg), .05)", borderLeft: "3px solid rgba(234,107,20,.5)",
                  borderRadius: 6, padding: ".6rem .75rem", margin: "0 0 .9rem", whiteSpace: "pre-wrap",
                }}>
                  “{job.chat_time_msg}”
                </div>
              )}

              <p style={{ fontSize: ".82rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .7)", margin: "0 0 1rem" }}>
                Accepting puts this visit on your calendar. If it doesn't work, suggest another
                time in the chat and they'll get the same prompt.
              </p>

              {err && (
                <div style={{
                  fontSize: ".8rem", color: "#fca5a5", background: "rgba(239,68,68,.08)",
                  borderRadius: 8, padding: ".55rem .7rem", marginBottom: ".8rem",
                }}>{err}</div>
              )}

              <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                <button onClick={accept} disabled={!!busy} style={btn(true, !!busy)}>
                  {busy === "accept" ? "Saving…" : "Accept this time"}
                </button>
                <button onClick={suggest} disabled={!!busy} style={btn(false, !!busy)}>
                  <Ic name="message-square" size={13} style={{ marginRight: 5 }} />
                  {busy === "decline" ? "…" : "Suggest another time"}
                </button>
              </div>
              <button onClick={onClose} disabled={!!busy} style={{
                marginTop: ".8rem", background: "none", border: "none", padding: 0,
                color: "rgba(var(--ff-muted), .55)", fontSize: ".8rem",
                cursor: busy ? "default" : "pointer", fontFamily: "inherit",
              }}>
                Decide later
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function btn(primary: boolean, disabled = false): CSSProperties {
  return {
    padding: ".65rem 1.05rem", borderRadius: 9, fontFamily: "inherit",
    fontSize: ".87rem", fontWeight: 600, cursor: disabled ? "default" : "pointer",
    opacity: disabled ? .6 : 1,
    border: primary ? "none" : "1px solid rgba(var(--ff-fg), .18)",
    background: primary ? "#ea6b14" : "rgba(var(--ff-fg), .06)",
    color: primary ? "#fff" : "var(--ff-text)",
  };
}
