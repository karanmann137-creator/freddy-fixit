import { useState, useRef, useEffect } from "react";

const SUPABASE_URL = "https://kvypmjxbbaaknvddwwai.supabase.co";
const ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4";

type Msg = { role: "user" | "assistant"; content: string };

const INITIAL: Msg[] = [
  { role: "assistant", content: "Hi! I'm Freddy 👋 I'm an automated AI assistant. I can help you book a repair, answer questions about the platform, or get you connected with a contractor. For a real person, email hello@freddyfixit.ca anytime." },
];

export default function ChatWidget() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Msg[]>(INITIAL);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ANON_KEY,
          "Authorization": `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.reply || "Sorry, I couldn't get a response. Try hello@freddyfixit.ca." },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again or reach us at hello@freddyfixit.ca." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: "5.5rem", right: "1.5rem",
          width: "360px", maxHeight: "520px",
          background: "var(--ff-bg)", border: "1px solid rgba(var(--ff-fg), .12)",
          borderRadius: "16px", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)", zIndex: 9999,
          fontFamily: "'DM Sans', sans-serif",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "1rem 1.25rem", background: "rgba(234,107,20,.12)",
            borderBottom: "1px solid rgba(var(--ff-fg), .08)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(234,107,20,.2)", border: "1px solid rgba(234,107,20,.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.1rem",
              }}>🔧</div>
              <div>
                <div style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--ff-text)" }}>Freddy</div>
                <div style={{ fontSize: ".72rem", color: "#ea6b14", display: "flex", alignItems: "center", gap: ".3rem" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  AI assistant · Online
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(var(--ff-muted), .5)", fontSize: "1.2rem", lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "1rem",
            display: "flex", flexDirection: "column", gap: ".75rem",
            scrollbarWidth: "thin", scrollbarColor: "rgba(var(--ff-fg), .1) transparent",
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "80%", padding: ".6rem .9rem",
                  borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: m.role === "user"
                    ? "linear-gradient(135deg, #ea6b14, #f09020)"
                    : "rgba(var(--ff-fg), .06)",
                  color: "var(--ff-text)",
                  fontSize: ".88rem", lineHeight: 1.5,
                  border: m.role === "assistant" ? "1px solid rgba(var(--ff-fg), .08)" : "none",
                  whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: ".6rem .9rem", borderRadius: "12px 12px 12px 2px",
                  background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .08)",
                  display: "flex", gap: ".3rem", alignItems: "center",
                }}>
                  {[0,1,2].map(j => (
                    <span key={j} style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "#ea6b14", opacity: .6,
                      animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: ".75rem 1rem", borderTop: "1px solid rgba(var(--ff-fg), .08)",
            display: "flex", gap: ".5rem", alignItems: "center",
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask Freddy anything…"
              style={{
                flex: 1, padding: ".6rem .9rem",
                background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)",
                borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit",
                fontSize: ".88rem", outline: "none",
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                padding: ".6rem .9rem", borderRadius: "8px", border: "none",
                background: input.trim() && !loading ? "#ea6b14" : "rgba(var(--ff-fg), .08)",
                color: input.trim() && !loading ? "#fff" : "rgba(var(--ff-muted), .3)",
                cursor: input.trim() && !loading ? "pointer" : "default",
                fontFamily: "inherit", fontSize: ".88rem", fontWeight: 600,
                transition: "all .2s",
              }}
            >
              ↑
            </button>
          </div>

          {/* AI disclosure */}
          <div style={{
            padding: "0 1rem .6rem", textAlign: "center",
            fontSize: ".66rem", color: "rgba(var(--ff-muted), .4)", lineHeight: 1.4,
          }}>
            Freddy is an automated AI assistant and can make mistakes.
          </div>

          <style>{`
            @keyframes bounce {
              0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
              40% { transform: scale(1.1); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        style={{
          position: "fixed", bottom: "1.5rem", right: "1.5rem",
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: open ? "rgba(var(--ff-fg), .1)" : "linear-gradient(135deg, #ea6b14, #f09020)",
          color: "#fff", fontSize: open ? "1.2rem" : "1.4rem",
          cursor: "pointer", zIndex: 9999,
          boxShadow: "0 4px 20px rgba(234,107,20,.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .25s ease",
        }}
      >
        {open ? "✕" : "💬"}
      </button>
    </>
  );
}
