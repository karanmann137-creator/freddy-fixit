import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Msg = {
  id: string; job_id: string; sender_id: string; content: string; created_at: string;
  attachment_path?: string | null; attachment_type?: string | null;
};

// Client-side upload guardrails ("check them before they hit backend").
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO = 50 * 1024 * 1024; // 50 MB
const BUCKET = "message-media";

// Slide-in chat drawer for a single job's client<->contractor conversation.
// Opened from a button so messages don't clutter the job card. Pass readOnly
// to show history without an input (e.g. once the job is completed).
export default function JobChat({
  jobId, meId, title, readOnly = false, onClose,
}: { jobId: string; meId: string; title: string; readOnly?: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ file: File; kind: "image" | "video"; preview: string } | null>(null);
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sign any attachment paths we don't already have a URL for.
  const signMissing = async (msgs: Msg[]) => {
    const paths = msgs.map(m => m.attachment_path).filter((p): p is string => !!p);
    const need = paths.filter(p => !mediaUrls[p]);
    if (!need.length) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, 60 * 60);
    if (!data) return;
    setMediaUrls(prev => {
      const next = { ...prev };
      data.forEach(d => { if (d.path && d.signedUrl) next[d.path] = d.signedUrl; });
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    supabase.from("messages").select("*").eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data as Msg[]) ?? [];
        setMessages(rows);
        signMissing(rows);
      });
    const channel = supabase.channel("jobchat:" + jobId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${jobId}` },
        payload => {
          const m = payload.new as Msg;
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
          if (m.attachment_path) signMissing([m]);
        })
      .subscribe();
    setTimeout(() => inputRef.current?.focus(), 120);
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [jobId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pending]);

  const pickFile = (file: File | undefined) => {
    setErr("");
    if (!file) return;
    const isImage = IMAGE_TYPES.includes(file.type);
    const isVideo = VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) {
      setErr("Only images (JPG, PNG, WebP, GIF, HEIC) or videos (MP4, WebM, MOV) can be sent.");
      return;
    }
    if (isImage && file.size > MAX_IMAGE) {
      setErr("That image is over 10 MB. Please send a smaller one.");
      return;
    }
    if (isVideo && file.size > MAX_VIDEO) {
      setErr("That video is over 50 MB. Please send a shorter or smaller clip.");
      return;
    }
    setPending({ file, kind: isImage ? "image" : "video", preview: URL.createObjectURL(file) });
  };

  const clearPending = () => {
    if (pending) URL.revokeObjectURL(pending.preview);
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const content = input.trim();
    if (sending) return;
    if (!content && !pending) return;
    setSending(true);
    setErr("");
    let attachment_path: string | null = null;
    let attachment_type: string | null = null;
    try {
      if (pending) {
        const ext = (pending.file.name.split(".").pop() || (pending.kind === "image" ? "jpg" : "mp4")).toLowerCase();
        const path = `${jobId}/${meId}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pending.file, {
          contentType: pending.file.type, upsert: false,
        });
        if (upErr) { setErr("Upload failed — please try again."); setSending(false); return; }
        attachment_path = path;
        attachment_type = pending.kind;
      }
      const { error: insErr } = await supabase.from("messages").insert({
        job_id: jobId, sender_id: meId, content, attachment_path, attachment_type,
      });
      if (insErr) { setErr("Could not send — please try again."); setSending(false); return; }
      setInput("");
      clearPending();
    } finally {
      setSending(false);
    }
  };

  const canSend = (!!input.trim() || !!pending) && !sending;

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
          background: "var(--ff-bg)", borderLeft: "1px solid rgba(var(--ff-fg), .1)",
          display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(0,0,0,.5)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "1rem 1.25rem", background: "rgba(234,107,20,.1)",
          borderBottom: "1px solid rgba(var(--ff-fg), .08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".7rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(234,107,20,.2)", border: "1px solid rgba(234,107,20,.4)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem",
            }}>💬</div>
            <div>
              <div style={{ fontSize: ".95rem", fontWeight: 600, color: "var(--ff-text)" }}>{title}</div>
              {readOnly && <div style={{ fontSize: ".72rem", color: "rgba(var(--ff-muted), .5)" }}>Conversation closed — job completed</div>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close chat" style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(var(--ff-muted), .55)", fontSize: "1.3rem", lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "1.1rem",
          display: "flex", flexDirection: "column", gap: ".6rem",
        }}>
          {messages.length === 0 && (
            <p style={{ textAlign: "center", fontSize: ".85rem", color: "rgba(var(--ff-muted), .35)", marginTop: "2rem" }}>
              No messages yet. Say hello 👋
            </p>
          )}
          {messages.map(m => {
            const mine = m.sender_id === meId;
            const url = m.attachment_path ? mediaUrls[m.attachment_path] : undefined;
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "78%", padding: m.attachment_path && !m.content ? ".35rem" : ".6rem .9rem",
                  borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: mine ? "linear-gradient(135deg,#ea6b14,#f09020)" : "rgba(var(--ff-fg), .07)",
                  border: mine ? "none" : "1px solid rgba(var(--ff-fg), .08)",
                  color: "var(--ff-text)", fontSize: ".88rem", lineHeight: 1.5, whiteSpace: "pre-wrap",
                }}>
                  {m.attachment_path && (
                    <div style={{ marginBottom: m.content ? ".4rem" : 0 }}>
                      {url ? (
                        m.attachment_type === "video" ? (
                          <video src={url} controls playsInline
                            style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, display: "block" }} />
                        ) : (
                          <a href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt="attachment"
                              style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, display: "block" }} />
                          </a>
                        )
                      ) : (
                        <div style={{
                          padding: ".8rem 1rem", fontSize: ".8rem", opacity: .7,
                        }}>Loading {m.attachment_type === "video" ? "video" : "image"}…</div>
                      )}
                    </div>
                  )}
                  {m.content}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input or closed notice */}
        {readOnly ? (
          <div style={{
            padding: "1rem 1.25rem", borderTop: "1px solid rgba(var(--ff-fg), .08)",
            fontSize: ".82rem", color: "rgba(var(--ff-muted), .5)", textAlign: "center",
          }}>
            This job is complete, so messaging is closed.
          </div>
        ) : (
          <div style={{ borderTop: "1px solid rgba(var(--ff-fg), .08)" }}>
            {err && (
              <div style={{
                padding: ".55rem 1rem", fontSize: ".78rem", color: "#fca5a5",
                background: "rgba(239,68,68,.08)",
              }}>{err}</div>
            )}
            {pending && (
              <div style={{
                display: "flex", alignItems: "center", gap: ".6rem",
                padding: ".6rem 1rem .2rem",
              }}>
                {pending.kind === "image"
                  ? <img src={pending.preview} alt="preview" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />
                  : <video src={pending.preview} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />}
                <div style={{ flex: 1, fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pending.file.name}
                </div>
                <button onClick={clearPending} aria-label="Remove attachment" style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(var(--ff-muted), .6)", fontSize: "1.1rem",
                }}>✕</button>
              </div>
            )}
            <div style={{
              padding: ".85rem 1rem", display: "flex", gap: ".5rem", alignItems: "center",
            }}>
              <input
                ref={fileRef}
                type="file"
                accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
                style={{ display: "none" }}
                onChange={e => pickFile(e.target.files?.[0])}
              />
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Attach photo or video"
                disabled={sending}
                style={{
                  padding: ".55rem .7rem", borderRadius: "9px",
                  background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)",
                  color: "rgba(var(--ff-muted), .8)", cursor: sending ? "default" : "pointer", fontSize: "1.1rem", lineHeight: 1,
                }}
              >📎</button>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                placeholder={pending ? "Add a caption…" : "Type a message…"}
                style={{
                  flex: 1, padding: ".7rem .9rem",
                  background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)",
                  borderRadius: "9px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem", outline: "none",
                }}
              />
              <button
                onClick={send}
                disabled={!canSend}
                style={{
                  padding: ".7rem 1.1rem", borderRadius: "9px", border: "none",
                  background: canSend ? "#ea6b14" : "rgba(var(--ff-fg), .08)",
                  color: canSend ? "#fff" : "rgba(var(--ff-muted), .3)",
                  cursor: canSend ? "pointer" : "default",
                  fontFamily: "inherit", fontSize: ".9rem", fontWeight: 600,
                }}
              >{sending ? "…" : "Send"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
