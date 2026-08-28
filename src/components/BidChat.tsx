import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";
import { scanImage, shouldBlock, rejectMessage } from "@/lib/imageSafety";
import { blockedReason, BLOCKED_HELP } from "@/lib/chatParse";
import { messageTime, daySeparator, isNewDay } from "@/lib/chatUnread";
import { Ic } from "@/components/Ic";
import FadeImg from "@/components/FadeImg";
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
 * PHOTOS, added 2026-08-28. This used to be text only because storage RLS on
 * `message-media` keys on a job id, and at bid stage there is no job. The
 * answer was a second path convention rather than a second bucket:
 *
 *   job media   <job_id>/<file>
 *   bid media   <request_id>/<contractor_id>/<file>
 *
 * `bid_media_path_ok(name)` gates the INSERT and re-derives BOTH of the rules
 * above from the path itself — the client may only write into the folder of a
 * pro who actually bid, and the pro may only write once `bid_thread_open()`
 * says the client has spoken first. So an upload can never get ahead of the
 * rule it exists to serve, and pro A cannot deposit a file in pro B's folder.
 *
 * The first path segment stays a uuid on purpose. The existing job-media
 * policies CAST that segment (`::uuid`), and a cast is not a match — one
 * non-uuid object name would raise 22P02 during policy evaluation and break
 * reads of the WHOLE bucket for everyone. `bid_media_path_ok` uses a CASE so
 * its regex shape test short-circuits ahead of its own casts for the same
 * reason.
 *
 * Images only, no video. A pre-hire question needs a picture of a leak, not a
 * 50MB clip, and the smaller surface is one fewer thing to get wrong before
 * anyone has been hired.
 */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const MAX_IMAGE = 10 * 1024 * 1024; // 10 MB — matches the bucket's own limit.
const BUCKET = "message-media";

type Msg = {
  id: string;
  request_id: string;
  thread_contractor_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_path?: string | null;
  attachment_type?: string | null;
  blocked?: boolean | null;
  flag_reasons?: string[] | null;
};

const COLS = "id, request_id, thread_contractor_id, sender_id, content, created_at, attachment_path, attachment_type, blocked, flag_reasons";

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
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /**
   * Mint signed URLs for any attachment we don't already hold one for. The
   * SELECT policy on a bid-media object requires a `messages` row that already
   * points at it, so this can only ever succeed AFTER the message is inserted —
   * which is why the composer previews from a local object URL instead.
   */
  const signMissing = async (rows: Msg[]) => {
    const need = rows.map(m => m.attachment_path).filter((p): p is string => !!p && !mediaUrls[p]);
    if (!need.length) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, 60 * 60);
    if (!data) return;
    setMediaUrls(prev => {
      const next = { ...prev };
      data.forEach(d => { if (d.path && d.signedUrl) next[d.path] = d.signedUrl; });
      return next;
    });
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select(COLS)
      .eq("request_id", requestId)
      .eq("thread_contractor_id", contractorId)
      .order("created_at", { ascending: true });
    setLoading(false);
    // A failed read is not an empty conversation — say so rather than showing
    // a confident "no messages yet" over messages that exist.
    if (error) { setFailed(true); return; }
    setFailed(false);
    const rows = (data ?? []) as Msg[];
    setMsgs(rows);
    signMissing(rows);
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
          if (m.attachment_path) signMissing([m]);
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

  const pickFile = (file: File | undefined) => {
    setErr(null);
    if (!file) return;
    // HEIC off an iPhone often arrives with an empty `type`, so fall back to
    // the extension rather than silently refusing a perfectly good photo.
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const looksImage = file.type ? IMAGE_TYPES.includes(file.type)
      : ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext);
    if (!looksImage) { setErr("Only photos can be sent here — JPG, PNG, WebP, GIF or HEIC."); return; }
    if (file.size > MAX_IMAGE) { setErr("That photo is over 10 MB. Please send a smaller one."); return; }
    setPending({ file, preview: URL.createObjectURL(file) });
  };

  const clearPending = () => {
    if (pending) URL.revokeObjectURL(pending.preview);
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending) || sending) return;
    setSending(true);
    setErr(null);

    let attachment_path: string | null = null;
    let attachment_type: string | null = null;

    if (pending) {
      // compressImage returns the ORIGINAL file on every failure path, so this
      // can shrink a photo but can never lose one.
      const small = await compressImage(pending.file, "photo");
      const ext = (small.name.split(".").pop() || "jpg").toLowerCase();
      // <request_id>/<contractor_id>/<file> — the shape bid_media_path_ok
      // checks. The contractor segment is whose THREAD this is, never who is
      // sending, so a client's photo lands in the same folder as the pro's.
      const path = requestId + "/" + contractorId + "/" + meId + "-" + Date.now() + "." + ext;
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(path, small, { contentType: small.type || undefined, upsert: false });
      if (upErr) {
        setSending(false);
        setErr(role === "contractor"
          ? "Couldn't attach that photo. You can only send here once the client has messaged you."
          : "Couldn't attach that photo — please try again.");
        return;
      }
      // Fail-open scan between the upload and the insert, so a rejected photo
      // is never attached to a message the other side can open.
      const scan = await scanImage(BUCKET, path);
      if (shouldBlock(scan)) { setSending(false); setErr(rejectMessage(scan)); return; }
      attachment_path = path;
      attachment_type = "image";
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({ request_id: requestId, thread_contractor_id: contractorId, sender_id: meId, content: body, attachment_path, attachment_type })
      .select(COLS)
      .maybeSingle();
    setSending(false);
    if (error) {
      setErr(role === "contractor"
        ? "Couldn't send. You can only reply here once the client has messaged you."
        : "Couldn't send your message — please try again.");
      return;
    }
    setText("");
    clearPending();
    if (data) {
      const saved = data as Msg;
      setMsgs(prev => prev.some(x => x.id === saved.id) ? prev : [...prev, saved]);
      if (saved.attachment_path) signMissing([saved]);
    }
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
                ? "Ask anything before you decide — what's included, how long it'll take, when they could start. You can send a photo too, which usually gets you a firmer number."
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
                      padding: m.attachment_path && !m.content ? ".35rem" : ".55rem .75rem",
                      borderRadius: "12px", fontSize: ".86rem", lineHeight: 1.45,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                      background: mine ? "rgba(234,107,20,.18)" : "rgba(240,244,255,.07)",
                      border: "1px solid " + (mine ? "rgba(234,107,20,.35)" : "rgba(240,244,255,.1)"),
                      color: "#f0f4ff",
                      textDecoration: m.blocked ? "line-through" : "none",
                      opacity: m.blocked ? .55 : 1,
                    }}>
                      {m.attachment_path && (
                        <div style={{ marginBottom: m.content ? ".4rem" : 0 }}>
                          {mediaUrls[m.attachment_path] ? (
                            <a href={mediaUrls[m.attachment_path]} target="_blank" rel="noreferrer">
                              <FadeImg src={mediaUrls[m.attachment_path]} alt="attachment"
                                style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, display: "block" }} />
                            </a>
                          ) : (
                            // The signed URL is still being minted. Hold a block
                            // roughly the photo's shape so the bubble doesn't
                            // jump under the reader when it lands.
                            <div aria-busy="true">
                              <span className="ff-sr-only">Loading photo</span>
                              <Sk w={180} h={130} r={8} />
                            </div>
                          )}
                        </div>
                      )}
                      {m.content}
                    </div>
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
          {pending && (
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".5rem" }}>
              <img src={pending.preview} alt="preview" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 8 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: ".76rem", color: "rgba(240,244,255,.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pending.file.name}
              </div>
              <button onClick={clearPending} aria-label="Remove photo" style={{
                background: "none", border: "none", cursor: "pointer", color: "rgba(240,244,255,.55)", fontSize: "1.05rem",
              }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-end" }}>
            <input
              ref={fileRef}
              type="file"
              /* No `capture` — a pro should be able to attach a photo they took
                 earlier, not only shoot a new one. */
              accept="image/*"
              style={{ display: "none" }}
              onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a photo"
              disabled={sending}
              style={{
                padding: ".5rem .65rem", borderRadius: "10px", flexShrink: 0,
                background: "rgba(240,244,255,.06)", border: "1px solid rgba(240,244,255,.15)",
                color: "rgba(240,244,255,.7)", cursor: sending ? "default" : "pointer",
                fontSize: "1.05rem", lineHeight: 1,
              }}
            >📎</button>
            <textarea
              value={text}
              rows={1}
              placeholder={pending ? "Add a caption…" : role === "client" ? "Ask this pro a question…" : "Reply…"}
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
              disabled={sending || (!text.trim() && !pending)}
              style={{
                background: "#ea6b14", color: "#fff", border: "none", borderRadius: "10px",
                padding: ".55rem 1rem", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 700,
                cursor: sending || (!text.trim() && !pending) ? "default" : "pointer",
                opacity: sending || (!text.trim() && !pending) ? .5 : 1,
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
