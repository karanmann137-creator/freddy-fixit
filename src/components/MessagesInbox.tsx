// The Messages tab on both dashboards — every conversation in one list.
//
// Deliberately a DUMB component. It renders whatever `my_conversations()`
// returned and hands a row back on tap; it never queries, never counts and
// never decides what "unread" means. The dashboard owns the `useConversations`
// hook, so the sidebar badge and this list are literally the same array and
// can't disagree.
//
// Rows are keyed on job_id because that's what the chat drawer opens and what
// `mark_job_read` clears — one id the whole feature agrees on.

import { Ic } from "@/components/Ic";
import { inboxTime, type Conversation } from "@/lib/chatUnread";

/** "Sam R." / a company name / a sensible fallback — never a blank row. */
export function partyName(c: Conversation): string {
  return c.other_company || c.other_name || (c.i_am === "client" ? "Your contractor" : "Your client");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function MessagesInbox({
  conversations, loading, error, onOpen, onRetry, meId,
}: {
  conversations: Conversation[];
  loading: boolean;
  error?: boolean;
  onOpen: (c: Conversation) => void;
  onRetry?: () => void;
  meId?: string | null;
}) {
  const card: React.CSSProperties = {
    background: "rgba(var(--ff-fg), .055)",
    border: "1px solid rgba(var(--ff-fg), .05)",
    borderRadius: "12px",
    padding: "clamp(1rem, 4vw, 1.5rem)",
  };

  if (loading) {
    return <div style={{ ...card, color: "rgba(var(--ff-muted), .6)", fontSize: ".9rem" }}>Loading your messages…</div>;
  }

  if (error) {
    return (
      <div style={{ ...card, borderColor: "rgba(239,68,68,.35)", background: "rgba(239,68,68,.08)" }}>
        <p style={{ color: "var(--ff-text)", fontSize: ".9rem", margin: 0 }}>
          We couldn't load your messages just now.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: ".7rem", padding: ".5rem .9rem", borderRadius: "8px", cursor: "pointer",
              background: "rgba(234,107,20,.14)", border: "1px solid rgba(234,107,20,.4)",
              color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".85rem",
            }}
          >Try again</button>
        )}
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: "1.6rem", marginBottom: ".4rem" }}>💬</div>
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", lineHeight: 1.1,
          letterSpacing: ".01em", color: "var(--ff-text)", margin: "0 0 .35rem",
        }}>No conversations yet</h2>
        <p style={{ fontSize: ".88rem", color: "rgba(var(--ff-muted), .7)", margin: 0 }}>
          Once a job is underway you can message the other person here — questions, photos,
          running late, all of it stays on the job.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
      {conversations.map(c => {
        const name = partyName(c);
        const unread = c.unread > 0;
        // A snippet the reader sent reads oddly without a marker, and an
        // attachment-only message has no text at all.
        const mine = !!meId && c.last_sender_id === meId;
        const snippet = c.last_snippet
          ? (mine ? "You: " : "") + c.last_snippet
          : c.last_has_attachment ? (mine ? "You sent a photo" : "Sent a photo")
          : "No messages yet — say hello";

        return (
          <button
            key={c.job_id}
            onClick={() => onOpen(c)}
            style={{
              display: "flex", alignItems: "flex-start", gap: ".75rem", width: "100%",
              textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              padding: "clamp(.7rem, 3vw, .9rem)", borderRadius: "12px",
              background: unread ? "rgba(234,107,20,.08)" : "rgba(var(--ff-fg), .055)",
              border: unread ? "1px solid rgba(234,107,20,.18)" : "1px solid rgba(var(--ff-fg), .05)",
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
              background: "rgba(234,107,20,.16)", border: "1px solid rgba(234,107,20,.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Bebas Neue', sans-serif", fontSize: "1rem", letterSpacing: ".04em",
              color: "#ea6b14",
            }}>{initials(name)}</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: ".5rem" }}>
                <span style={{
                  flex: 1, minWidth: 0, color: "var(--ff-text)", fontSize: ".92rem",
                  fontWeight: unread ? 600 : 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{name}</span>
                <span style={{ flexShrink: 0, fontSize: ".72rem", color: "rgba(var(--ff-muted), .5)" }}>
                  {inboxTime(c.last_message_at)}
                </span>
              </div>

              <div style={{
                marginTop: ".15rem", fontSize: ".82rem", lineHeight: 1.45,
                color: unread ? "var(--ff-text)" : "rgba(var(--ff-muted), .7)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{snippet}</div>

              <div style={{
                marginTop: ".3rem", display: "flex", alignItems: "center", gap: ".4rem",
                flexWrap: "wrap", fontSize: ".72rem", color: "rgba(var(--ff-muted), .5)",
              }}>
                {c.service_needed && (
                  <span style={{
                    padding: ".14rem .45rem", borderRadius: 999,
                    background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .08)",
                    maxWidth: "min(200px, 60%)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{c.service_needed}</span>
                )}
                {c.location && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: ".2rem",
                    minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    <Ic name="map-pin" size={11} />{c.location}
                  </span>
                )}
              </div>
            </div>

            {unread && (
              <span style={{
                flexShrink: 0, minWidth: 20, height: 20, padding: "0 .35rem",
                borderRadius: 999, background: "#ea6b14", color: "#fff",
                fontSize: ".7rem", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{c.unread > 9 ? "9+" : c.unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
