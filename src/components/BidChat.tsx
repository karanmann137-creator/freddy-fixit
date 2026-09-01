import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { blockedReason, BLOCKED_HELP } from "@/lib/chatParse";
import { messageTime, daySeparator, isNewDay } from "@/lib/chatUnread";
import { Ic } from "@/components/Ic";
import { Sk } from "@/components/Skeleton";

/**
 * Bid-stage chat: a private thread between the client and ONE pro who bid,
 * before any job exists.
 *
 * Two rules are load-bearing and enforced in the database, not here:
 *  - the CLIENT opens the thread; a pro can only reply. A pro who could message
 *    first would turn a posted request into a cold-call list.
 *  - a pro sees only their own thread. RLS matches a contractor on
 *    thread_contractor_id, so pro A can never read pro B's conversation.
 *
 * Deliberately TEXT ONLY. Attachments would need storage RLS keyed on a job id
 * that doesn't exist yet, and a pre-hire question doesn't need a photo — the
 * client's request photos are already attached to the request itself.
 */

type Msg = {
  id: string;
  request_id: string;
  thread_contractor_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  blocked?: boolean | null;
  flag_reasons?: string[] | null;
};

export default function BidChat({
  requestId, contractorId, meId, role, title, otherName, onClose, onRead,
}: {
  requestId: string;
  contractorId: string;
  meId: string;
  role: "client" | "contractor";
  title?: string | null;
  otherName?: string | null;
  onClose: () => void;
  onRead?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, request_id, thread_contractor_id, sender_id, content, created_at, blocked, flag_reasons")
      .eq("request_id", requestId)
      .eq("thread_contractor_id", contractorId)
      .order("created_at", { ascending: true });
    setLoading(false);
    // A failed read is not an empty conversation — say so rather than showing
    // a confident "no messages yet" over messages that exist.
    if (error) { setFailed(true); return; }
    setFailed(false);
    setMsgs((data ?? []) as Msg[]);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load();
    supabase.rpc("mark_bid_thread_read", { p_request_id: requestId, p_contractor_id: contractorId })
      .then(() => { if (alive) onRead?.(); });

    // Realtime can only filter on one column, so filter on the request and
    // narrow to this pro's thread in the handler.
    const ch = supabase
      .channel("bidchat-" + requestId + "-" + contractorId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` },
        (payload: any) => {
          const m = payload.new as Msg;
          if (m.thread_contractor_id !== contractorId) return;
          setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
          if (m.sender_id !== meId) {
            supabase.rpc("mark_bid_thread_read", { p_request_id: requestId, p_contractor_id: contractorId })
              .then(() => onRead?.());
          }
        })
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, contractorId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ request_id: requestId, thread_contractor_id: contractorId, sender_id: meId, content: body })
      .select("id, request_id, thread_contractor_id, sender_id, content, created_at, blocked, flag_reasons")
      .maybeSingle();
    setSending(false);
    if (error) {
      setErr(role === "contractor"
        ? "Couldn't send. You can only reply here once the client has messaged you."
        : "Couldn't send your message — please try again.");
      return;
    }
    setText("");
    if (data) setMsgs(prev => prev.some(x => x.id === (data as any).id) ? prev : [...prev, data as Msg]);
  };

  const box: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 90, display: "flex",
    alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.55)",
  };
  const panel: React.CSSProperties = {
    width: "min(560px, 100%)", maxHeight: "min(78vh, 680px)", display: "flex", flexDirection: "column",
    background: "#151d2e", border: "1px solid rgba(240,244,255,.12)",
    borderRadius: "16px 16px 0 0", overflow: "hidden",
  };

  return (
    <div style={box} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ padding: ".85rem 1rem", borderBottom: "1px solid rgba(240,244,255,.1)", display: "flex", alignItems: "center", gap: ".6rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: ".95rem", fontWeight: 700, color: "#f0f4ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {otherName || (role === "client" ? "Contractor" : "Client")}
            </div>
            {title && <div style={{ fontSize: ".74rem", color: "rgba(240,244,255,.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title} · before you book</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "rgba(240,244,255,.6)", cursor: "pointer", padding: ".2rem" }}>
            <Ic name="x-circle" size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {loading ? (
            <div className="ff-on-dark" aria-busy="true" style={{ padding: ".5rem 0" }}>
              <span className="ff-sr-only">Loading this conversation</span>
              <Sk w="58%" h={30} r={10} />
              <div style={{ height: 10 }} />
              <Sk w="46%" h={26} r={10} style={{ marginLeft: "auto" }} />
              <div style={{ height: 10 }} />
              <Sk w="66%" h={30} r={10} />
            </div>
          ) : failed ? (
            <div style={{ fontSize: ".85rem", color: "var(--ff-warn)", textAlign: "center", padding: "1.5rem 0", lineHeight: 1.5 }}>
              We couldn't load this conversation. Check your connection and try again.
            </div>
          ) : msgs.length === 0 ? (
            <div style={{ fontSize: ".85rem", color: "rgba(240,244,255,.5)", textAlign: "center", padding: "1.5rem 0", lineHeight: 1.5 }}>
              {role === "client"
                ? "Ask anything before you decide — what's included, how long it'll take, when they could start."
                : "The client hasn't messaged you yet. You'll be able to reply here as soon as they do."}
            </div>
          ) : msgs.map((m, i) => {
            const mine = m.sender_id === meId;
            const sep = isNewDay(m.created_at, msgs[i - 1]?.created_at);
            const reason = m.blocked ? blockedReason(m.flag_reasons) : "";
            return (
              <div key={m.id}>
                {sep && (
                  <div style={{ textAlign: "center", fontSize: ".7rem", color: "rgba(240,244,255,.35)", margin: ".5rem 0" }}>
                    {daySeparator(m.created_at)}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "80%" }}>
                    <div style={{
                      padding: ".55rem .75rem", borderRadius: "12px", fontSize: ".86rem", lineHeight: 1.45,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                      background: mine ? "rgba(234,107,20,.18)" : "rgba(240,244,255,.07)",
                      border: "1px solid " + (mine ? "rgba(234,107,20,.35)" : "rgba(240,244,255,.1)"),
                      color: "#f0f4ff",
                      textDecoration: m.blocked ? "line-through" : "none",
                      opacity: m.blocked ? .55 : 1,
                    }}>{m.content}</div>
                    <div style={{ fontSize: ".68rem", color: "rgba(240,244,255,.4)", marginTop: ".2rem", textAlign: mine ? "right" : "left" }}>
                      {m.blocked ? "Only you can see this message" : messageTime(m.created_at)}
                    </div>
                    {m.blocked && (
                      <div style={{ fontSize: ".72rem", color: "var(--ff-warn)", marginTop: ".2rem", lineHeight: 1.4, textAlign: mine ? "right" : "left" }}>
                        {reason || BLOCKED_HELP}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div style={{ padding: ".75rem 1rem", borderTop: "1px solid rgba(240,244,255,.1)" }}>
          {err && <div style={{ fontSize: ".76rem", color: "var(--ff-warn)", marginBottom: ".4rem", lineHeight: 1.4 }}>{err}</div>}
          <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-end" }}>
            <textarea
              value={text}
              rows={1}
              placeholder={role === "client" ? "Ask this pro a question…" : "Reply…"}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              style={{
                flex: 1, minWidth: 0, resize: "vertical", padding: ".55rem .7rem", borderRadius: "10px",
                background: "rgba(240,244,255,.06)", border: "1px solid rgba(240,244,255,.15)",
                color: "#f0f4ff", fontFamily: "inherit", fontSize: ".88rem", maxHeight: "7rem",
              }}
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              style={{
                background: "#ea6b14", color: "#fff", border: "none", borderRadius: "10px",
                padding: ".55rem 1rem", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 700,
                cursor: sending || !text.trim() ? "default" : "pointer",
                opacity: sending || !text.trim() ? .5 : 1,
              }}
            >{sending ? "…" : "Send"}</button>
          </div>
          <div style={{ fontSize: ".68rem", color: "rgba(240,244,255,.35)", marginTop: ".4rem", lineHeight: 1.4 }}>
            Keep it on Freddy Fix It — phone numbers, emails and off-platform payment are blocked, and only messages here are covered if something goes wrong.
          </div>
        </div>
      </div>
    </div>
  );
}
