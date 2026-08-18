import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";
import { blockedReason, BLOCKED_HELP, detectDateTime, formatWhen } from "@/lib/chatParse";
import { markJobRead, announceChatChange, messageTime, daySeparator, isNewDay } from "@/lib/chatUnread";
import { jobCode } from "@/lib/jobCode";
import { Ic, type IconName } from "@/components/Ic";

type Msg = {
  id: string; job_id: string; sender_id: string; content: string; created_at: string;
  attachment_path?: string | null; attachment_type?: string | null;
  // Written by the `messages_chat_guard` trigger. RLS only ever shows a
  // blocked row back to the person who sent it — the other side never sees it.
  blocked?: boolean | null; flag_reasons?: string[] | null;
};

// Client-side upload guardrails ("check them before they hit backend").
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO = 50 * 1024 * 1024; // 50 MB
const BUCKET = "message-media";

type Role = "client" | "contractor" | "admin";

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  scheduled: "Scheduled",
  in_progress: "In progress",
  pending_confirmation: "Waiting on the client",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Claim open",
};

/**
 * The job's own timeline, read straight off the row's timestamps and folded
 * into the conversation so chat stops being a silo. Nothing here writes — it's
 * pure derivation, so it can never disagree with the dashboard or break a flow.
 */
type Evt = { at: string; text: string; icon: IconName };
function jobEvents(job: any, role: Role): Evt[] {
  if (!job) return [];
  const pro = role === "contractor";
  const out: Evt[] = [];
  const add = (at: any, text: string, icon: IconName) => { if (at) out.push({ at: String(at), text, icon }); };

  add(job.walkthrough_approved_at, "Walkthrough booked for " + formatWhen(job.walkthrough_at), "calendar");
  add(job.walkthrough_done_at, "Walkthrough done", "check-circle");
  add(job.schedule_proposed_at, pro ? "You sent an estimate" : "Estimate received", "dollar");
  add(job.client_approved_at, pro ? "Client approved the estimate" : "You approved the estimate", "check-circle");
  add(job.paid_at, pro ? "Client paid — the money is held safely" : "You paid — the money is held safely", "dollar");
  add(job.client_rescheduled_at, pro ? "Client asked for a different time" : "You asked for a different time", "calendar");
  add(job.reschedule_accepted_at, pro ? "You accepted the new time" : "Your pro accepted the new time", "check-circle");
  add(job.client_confirmed_visit_at, pro ? "Client confirmed the visit" : "You confirmed the visit", "check");
  add(job.on_my_way_at, pro ? "You marked yourself on the way" : "Your pro is on the way", "car");
  add(job.before_photo_at, "Before photo added", "camera");
  add(job.after_photo_at, "Finished-work photo added", "camera");
  add(job.contractor_completed_at, pro ? "You marked the work complete" : "Your pro marked the work complete", "check-circle");
  add(job.client_confirmed_at, pro ? "Client confirmed the work" : "You confirmed the work", "check-circle");
  add(job.released_at, pro ? "Payment released to you" : "Payment released to your pro", "dollar");
  add(job.disputed_at, "A claim was opened on this job", "alert-triangle");

  return out;
}

// Fill-the-box replies — deliberately NOT send-on-tap, so a pro can adjust the
// wording before it goes. Kept generic; nothing here promises a time or a price.
const CANNED: string[] = [
  "On my way — see you shortly.",
  "Running about 15 minutes behind, sorry about that.",
  "Could you send a photo of the area so I can come prepared?",
  "I've uploaded photos of the work — take a look when you get a chance.",
];

// Slide-in chat drawer for a single job's client<->contractor conversation.
// Pass the job row for context, the timeline and the safe quick actions;
// readOnly shows history without an input.
export default function JobChat({
  jobId, meId, title, readOnly = false, onClose,
  job = null, role = "client", closedReason, onJump, onJobPatch,
}: {
  jobId: string;
  meId: string;
  title: string;
  readOnly?: boolean;
  onClose: () => void;
  job?: any;
  role?: Role;
  closedReason?: string;
  onJump?: () => void;
  onJobPatch?: (patch: Record<string, any>) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ file: File; kind: "image" | "video"; preview: string } | null>(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeVal, setTimeVal] = useState("");
  const [cannedOpen, setCannedOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [localJob, setLocalJob] = useState<any>(job);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocalJob(job); }, [job]);

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

  // Opening the conversation IS reading it. An admin peeking is a no-op —
  // mark_job_read ignores anyone who isn't a party to the job, so it can never
  // clear the real recipient's badge.
  const markRead = () => {
    if (role === "admin") return;
    markJobRead(jobId).then(announceChatChange).catch(() => { /* badge corrects on next refresh */ });
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
          // It arrived while they were looking at it, so it's already read.
          if (m.sender_id !== meId) markRead();
        })
      .subscribe();
    markRead();
    setTimeout(() => inputRef.current?.focus(), 120);
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [jobId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pending]);

  const growInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };
  useEffect(growInput, [input]);

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

  /** Drop text into the composer rather than sending it, so it can be edited. */
  const fillInput = (text: string) => {
    setInput(prev => (prev.trim() ? prev.trimEnd() + " " + text : text));
    setCannedOpen(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const suggestTime = () => {
    if (!timeVal) return;
    const d = new Date(timeVal);
    if (isNaN(d.getTime())) return;
    // Written as a normal sentence on purpose: detectDateTime picks it back up
    // and turns it into the same accept/suggest prompt a typed time would.
    fillInput("How about " + formatWhen(d) + "?");
    setTimeOpen(false);
    setTimeVal("");
  };

  const send = async () => {
    const content = input.trim();
    if (sending) return;
    if (!content && !pending) return;
    setSending(true);
    setErr("");
    setNotice("");
    let attachment_path: string | null = null;
    let attachment_type: string | null = null;
    try {
      if (pending) {
        // Videos and animated GIFs come back untouched; a photo comes back a
        // fraction of the size, which is what makes sending one over cell data
        // in a basement bearable.
        const outFile = await compressImage(pending.file, "photo");
        const ext = (outFile.name.split(".").pop() || (pending.kind === "image" ? "jpg" : "mp4")).toLowerCase();
        const path = `${jobId}/${meId}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, outFile, {
          contentType: outFile.type || undefined, upsert: false,
        });
        if (upErr) { setErr("Upload failed — please try again."); setSending(false); return; }
        attachment_path = path;
        attachment_type = pending.kind;
      }
      // Select the row back so we can see what the `messages_chat_guard`
      // trigger decided. A blocked row still inserts (that's the copy the
      // admin reviews) but RLS hides it from the other party.
      const { data: row, error: insErr } = await supabase.from("messages").insert({
        job_id: jobId, sender_id: meId, content, attachment_path, attachment_type,
      }).select("*").single();
      if (insErr) { setErr("Could not send — please try again."); setSending(false); return; }

      const saved = row as Msg;
      setMessages(prev => prev.some(x => x.id === saved.id) ? prev : [...prev, saved]);
      clearPending();

      if (saved.blocked) {
        // Leave the text in the box so they can edit it out and resend.
        setErr(blockedReason(saved.flag_reasons) + " " + BLOCKED_HELP);
        return;
      }

      setInput("");
      setNotice("");
      announceChatChange();

      // A concrete day + time in the message becomes an appointment the other
      // side can accept in one tap. Fire-and-forget — the RPC quietly ignores
      // finished jobs, past times and a repeat of the same suggestion.
      const parsed = detectDateTime(content);
      if (parsed) {
        supabase.rpc("chat_propose_time", {
          p_job_id: jobId,
          p_at: parsed.at.toISOString(),
          p_snippet: content.slice(0, 200),
        }).then(({ data }: any) => {
          if (data === "proposed") setNotice("Asked them to confirm " + formatWhen(parsed.at) + ".");
        });
      }
    } finally {
      setSending(false);
    }
  };

  /**
   * One-tap actions only. Anything that moves money or closes a job stays on
   * the job card, where the confirm dialogs and the warning copy live.
   */
  const runAction = async (rpc: string, patch: Record<string, any>, ok: string) => {
    if (acting) return;
    setActing(true);
    setErr("");
    const { error } = await supabase.rpc(rpc, { p_job_id: jobId });
    setActing(false);
    if (error) { setErr("Couldn't do that: " + error.message); return; }
    setLocalJob((j: any) => (j ? { ...j, ...patch } : j));
    onJobPatch?.(patch);
    setNotice(ok);
  };

  const j = localJob;
  const canAct = !readOnly && role !== "admin";
  const showOnMyWay = canAct && role === "contractor" && j?.status === "scheduled" && !j?.on_my_way_at;
  const showConfirmTime = canAct && role === "client" && j?.status === "scheduled" && !!j?.scheduled_at && !j?.client_confirmed_visit_at;
  const canSend = (!!input.trim() || !!pending) && !sending;

  // Messages and job events on one timeline, oldest first.
  const timeline: Array<{ at: string; msg?: Msg; evt?: Evt }> = [
    ...messages.map(m => ({ at: m.created_at, msg: m })),
    ...jobEvents(j, role).map(e => ({ at: e.at, evt: e })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const chip: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: ".35rem",
    padding: ".38rem .65rem", borderRadius: 999,
    background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)",
    color: "rgba(var(--ff-muted), .85)", fontFamily: "inherit", fontSize: ".76rem",
    cursor: "pointer", whiteSpace: "nowrap",
  };
  const chipHot: React.CSSProperties = {
    ...chip,
    background: "rgba(234,107,20,.12)", border: "1px solid rgba(234,107,20,.35)",
    color: "var(--ff-text)", fontWeight: 500,
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
          background: "var(--ff-bg)", borderLeft: "1px solid rgba(var(--ff-fg), .1)",
          display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(0,0,0,.5)",
        }}
      >
        {/* Header + job context */}
        <div style={{
          padding: ".9rem 1.1rem", background: "rgba(234,107,20,.1)",
          borderBottom: "1px solid rgba(var(--ff-fg), .08)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".6rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".7rem", minWidth: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: "rgba(234,107,20,.2)", border: "1px solid rgba(234,107,20,.4)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem",
              }}>💬</div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: ".95rem", fontWeight: 600, color: "var(--ff-text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{title}</div>
                <div style={{ fontSize: ".72rem", color: "rgba(var(--ff-muted), .6)" }}>
                  {(j?.request?.service_needed || j?.service_needed || "Job")}
                  {" · "}
                  <span style={{ fontFamily: "monospace" }}>{jobCode(jobId)}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close chat" style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(var(--ff-muted), .55)", fontSize: "1.3rem", lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>

          {j && (
            <div style={{
              marginTop: ".65rem", display: "flex", alignItems: "center",
              gap: ".4rem", flexWrap: "wrap", fontSize: ".73rem", color: "rgba(var(--ff-muted), .75)",
            }}>
              {j.status && (
                <span style={{
                  padding: ".2rem .5rem", borderRadius: 999,
                  background: "rgba(var(--ff-fg), .08)", border: "1px solid rgba(var(--ff-fg), .1)",
                }}>{STATUS_LABEL[j.status] ?? j.status}</span>
              )}
              {j.scheduled_at && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: ".25rem" }}>
                  <Ic name="calendar" size={12} />{formatWhen(j.scheduled_at)}
                </span>
              )}
              {(j.request?.location || j.location) && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: ".25rem",
                  minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  <Ic name="map-pin" size={12} />{j.request?.location || j.location}
                </span>
              )}
              {onJump && (
                <button onClick={() => { onClose(); onJump(); }} style={{
                  ...chip, marginLeft: "auto", padding: ".25rem .55rem", fontSize: ".72rem",
                }}>Open the job →</button>
              )}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "1.1rem",
          display: "flex", flexDirection: "column", gap: ".55rem",
        }}>
          {timeline.length === 0 && (
            <p style={{ textAlign: "center", fontSize: ".85rem", color: "rgba(var(--ff-muted), .35)", marginTop: "2rem" }}>
              No messages yet. Say hello 👋
            </p>
          )}
          {timeline.map((item, i) => {
            const prev = i > 0 ? timeline[i - 1].at : null;
            const sep = isNewDay(item.at, prev) ? daySeparator(item.at) : null;

            const separator = sep ? (
              <div key={"sep-" + item.at + i} style={{
                alignSelf: "center", margin: ".5rem 0 .1rem",
                fontSize: ".7rem", color: "rgba(var(--ff-muted), .45)",
                padding: ".18rem .6rem", borderRadius: 999, background: "rgba(var(--ff-fg), .05)",
              }}>{sep}</div>
            ) : null;

            if (item.evt) {
              const e = item.evt;
              return (
                <div key={"e-" + i} style={{ display: "contents" }}>
                  {separator}
                  <div style={{
                    alignSelf: "center", display: "flex", alignItems: "center", gap: ".35rem",
                    fontSize: ".72rem", color: "rgba(var(--ff-muted), .5)", textAlign: "center",
                    padding: ".15rem 0",
                  }}>
                    <Ic name={e.icon} size={12} />
                    <span>{e.text}</span>
                    <span style={{ opacity: .6 }}>· {messageTime(e.at)}</span>
                  </div>
                </div>
              );
            }

            const m = item.msg as Msg;
            const mine = m.sender_id === meId;
            const url = m.attachment_path ? mediaUrls[m.attachment_path] : undefined;
            // A blocked row only ever comes back to the person who sent it —
            // RLS never shows it to the other side. Show it struck through so
            // they can see exactly what didn't land and edit it.
            const blocked = !!m.blocked;
            return (
              <div key={m.id} style={{ display: "contents" }}>
                {separator}
                <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "78%", padding: m.attachment_path && !m.content ? ".35rem" : ".6rem .9rem",
                    borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    background: blocked
                      ? "rgba(239,68,68,.1)"
                      : mine ? "linear-gradient(135deg,#ea6b14,#f09020)" : "rgba(var(--ff-fg), .07)",
                    border: blocked
                      ? "1px dashed rgba(239,68,68,.45)"
                      : mine ? "none" : "1px solid rgba(var(--ff-fg), .08)",
                    color: "var(--ff-text)", fontSize: ".88rem", lineHeight: 1.5, whiteSpace: "pre-wrap",
                    opacity: blocked ? .75 : 1,
                    textDecoration: blocked ? "line-through" : "none",
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
                  <div style={{
                    marginTop: ".18rem", fontSize: ".68rem", color: "rgba(var(--ff-muted), .45)",
                    padding: "0 .2rem",
                  }}>{messageTime(m.created_at)}</div>
                  {blocked && (
                    <div style={{
                      maxWidth: "78%", marginTop: ".2rem",
                      fontSize: ".73rem", lineHeight: 1.5, color: "#fca5a5",
                      textAlign: mine ? "right" : "left",
                    }}>
                      {blockedReason(m.flag_reasons)} Only you can see this message.
                    </div>
                  )}
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
            {role === "admin"
              ? "Read-only — you're viewing this conversation as an admin."
              : (closedReason ?? "This job is finished, so messaging is closed.")}
          </div>
        ) : (
          <div style={{ borderTop: "1px solid rgba(var(--ff-fg), .08)" }}>
            {err && (
              <div style={{
                padding: ".55rem 1rem", fontSize: ".78rem", color: "#fca5a5",
                background: "rgba(239,68,68,.08)", lineHeight: 1.55,
              }}>{err}</div>
            )}
            {notice && (
              <div style={{
                padding: ".55rem 1rem", fontSize: ".78rem", color: "var(--ff-success)",
                background: "rgba(34,197,94,.08)", lineHeight: 1.55,
              }}>{notice}</div>
            )}

            {/* Safe quick actions. Nothing here moves money or closes a job —
                those stay on the job card with their confirm dialogs. */}
            <div style={{
              display: "flex", gap: ".4rem", flexWrap: "wrap",
              padding: ".7rem 1rem 0",
            }}>
              <button onClick={() => { setTimeOpen(o => !o); setCannedOpen(false); }} style={timeOpen ? chipHot : chip}>
                <Ic name="calendar" size={12} />Suggest a time
              </button>
              {showOnMyWay && (
                <button
                  disabled={acting}
                  onClick={() => runAction("contractor_on_my_way", { on_my_way_at: new Date().toISOString() }, "We let the client know you're on your way.")}
                  style={chipHot}
                ><Ic name="car" size={12} />I'm on my way</button>
              )}
              {showConfirmTime && (
                <button
                  disabled={acting}
                  onClick={() => runAction("confirm_visit", { client_confirmed_visit_at: new Date().toISOString() }, "Confirmed — your pro has been told.")}
                  style={chipHot}
                ><Ic name="check" size={12} />Confirm this time</button>
              )}
              {role === "contractor" && (
                <button onClick={() => { setCannedOpen(o => !o); setTimeOpen(false); }} style={cannedOpen ? chipHot : chip}>
                  <Ic name="message-square" size={12} />Quick replies
                </button>
              )}
            </div>

            {timeOpen && (
              <div style={{ display: "flex", gap: ".4rem", alignItems: "center", padding: ".55rem 1rem 0", flexWrap: "wrap" }}>
                <input
                  type="datetime-local"
                  value={timeVal}
                  onChange={e => setTimeVal(e.target.value)}
                  style={{
                    flex: "1 1 170px", minWidth: 0, padding: ".45rem .6rem",
                    background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)",
                    borderRadius: 8, color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".82rem",
                  }}
                />
                <button onClick={suggestTime} disabled={!timeVal} style={{ ...chipHot, opacity: timeVal ? 1 : .5 }}>
                  Add to message
                </button>
              </div>
            )}

            {cannedOpen && (
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", padding: ".55rem 1rem 0" }}>
                {CANNED.map(c => (
                  <button key={c} onClick={() => fillInput(c)} style={{ ...chip, whiteSpace: "normal", textAlign: "left" }}>
                    {c}
                  </button>
                ))}
              </div>
            )}

            {pending && (
              <div style={{
                display: "flex", alignItems: "center", gap: ".6rem",
                padding: ".6rem 1rem .2rem",
              }}>
                {pending.kind === "image"
                  ? <img src={pending.preview} alt="preview" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />
                  : <video src={pending.preview} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pending.file.name}
                </div>
                <button onClick={clearPending} aria-label="Remove attachment" style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(var(--ff-muted), .6)", fontSize: "1.1rem",
                }}>✕</button>
              </div>
            )}
            <div style={{
              padding: ".7rem 1rem .85rem", display: "flex", gap: ".5rem", alignItems: "flex-end",
            }}>
              <input
                ref={fileRef}
                type="file"
                accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
                style={{ display: "none" }}
                onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Attach photo or video"
                disabled={sending}
                style={{
                  padding: ".55rem .7rem", borderRadius: "9px", flexShrink: 0,
                  background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)",
                  color: "rgba(var(--ff-muted), .8)", cursor: sending ? "default" : "pointer", fontSize: "1.1rem", lineHeight: 1,
                }}
              >📎</button>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  // Enter sends; Shift+Enter (and mobile's own return key, which
                  // doesn't fire this on most keyboards) makes a new line.
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder={pending ? "Add a caption…" : "Type a message…  (Shift+Enter for a new line)"}
                style={{
                  flex: 1, minWidth: 0, padding: ".7rem .9rem", resize: "none", maxHeight: 140,
                  background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)",
                  borderRadius: "9px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem",
                  outline: "none", lineHeight: 1.45,
                }}
              />
              <button
                onClick={send}
                disabled={!canSend}
                style={{
                  padding: ".7rem 1.1rem", borderRadius: "9px", border: "none", flexShrink: 0,
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
