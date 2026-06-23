import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Msg = { id: string; job_id: string; sender_id: string; content: string; created_at: string };

// Slide-in chat drawer for a single job's client<->contractor conversation.
// Opened from a button so messages don't clutter the job card. Pass readOnly
// to show history without an input (e.g. once the job is completed).
export default function JobChat({
  jobId, meId, title, readOnly = false, onClose,
}: { jobId: string; meId: string; title: string; readOnly?: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.from("messages").select("*").eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (!cancelled) setMessages((data as Msg[]) ?? []); });
    const channel = supabase.channel("jobchat:" + jobId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${jobId}` },
        payload => setMessages(prev => prev.some(m => m.id === (payload.new as Msg).id) ? prev : [...prev, payload.new as Msg]))
      .subscribe();
    setTimeout(() => inputRef.current?.focus(), 120);
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [jobId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    await supabase.from("messages").insert({ job_id: jobId, sender_id: meId, content });
    setSending(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(8,11,20,.6)", backdropFilter: "blur(2px)",
        display: "flex", justifyContent: "flex-end",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "440px", height: "100%",
          background: "#1a2236", borderLeft: "1px solid rgba(255,255,255,.1)",
          display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(0,0,0,.5)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "1rem 1.25rem", background: "rgba(234,107,20,.1)",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".7rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(234,107,20,.2)", border: "1px solid rgba(234,107,20,.4)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem",
            }}>💬</div>
            <div>
              <div style={{ fontSize: ".95rem", fontWeight: 600, color: "#f0f4ff" }}>{title}</div>
              {readOnly && <div style={{ fontSize: ".72rem", color: "rgba(190,205,235,.5)" }}>Conversation closed — job completed</div>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close chat" style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(190,205,235,.55)", fontSize: "1.3rem", lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "1.1rem",
          display: "flex", flexDirection: "column", gap: ".6rem",
        }}>
          {messages.length === 0 && (
            <p style={{ textAlign: "center", fontSize: ".85rem", color: "rgba(190,205,235,.35)", marginTop: "2rem" }}>
              No messages yet. Say hello 👋
            </p>
          )}
          {messages.map(m => {
            const mine = m.sender_id === meId;
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "78%", padding: ".6rem .9rem",
                  borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: mine ? "linear-gradient(135deg,#ea6b14,#f09020)" : "rgba(255,255,255,.07)",
                  border: mine ? "none" : "1px solid rgba(255,255,255,.08)",
                  color: "#f0f4ff", fontSize: ".88rem", lineHeight: 1.5, whiteSpace: "pre-wrap",
                }}>{m.content}</div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input or closed notice */}
        {readOnly ? (
          <div style={{
            padding: "1rem 1.25rem", borderTop: "1px solid rgba(255,255,255,.08)",
            fontSize: ".82rem", color: "rgba(190,205,235,.5)", textAlign: "center",
          }}>
            This job is complete, so messaging is closed.
          </div>
        ) : (
          <div style={{
            padding: ".85rem 1rem", borderTop: "1px solid rgba(255,255,255,.08)",
            display: "flex", gap: ".5rem", alignItems: "center",
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
              placeholder="Type a message…"
              style={{
                flex: 1, padding: ".7rem .9rem",
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: "9px", color: "#f0f4ff", fontFamily: "inherit", fontSize: ".9rem", outline: "none",
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              style={{
                padding: ".7rem 1.1rem", borderRadius: "9px", border: "none",
                background: input.trim() && !sending ? "#ea6b14" : "rgba(255,255,255,.08)",
                color: input.trim() && !sending ? "#fff" : "rgba(190,205,235,.3)",
                cursor: input.trim() && !sending ? "pointer" : "default",
                fontFamily: "inherit", fontSize: ".9rem", fontWeight: 600,
              }}
            >Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
