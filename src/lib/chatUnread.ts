// Conversation list + unread state, shared by both dashboards, the Messages
// inbox and the chat drawer.
//
// ONE payload drives everything. `my_conversations()` returns the inbox rows,
// the per-job unread counts and the sidebar total in a single call, so a badge
// can never disagree with the list it links to. (Same lesson as the contractor
// pipeline strip, where the counters and the filter had to share a matcher.)
//
// Deliberately NOT here: any new notification row or email. A message already
// sends a throttled email from `notify_new_message()`; writing a 🔔 row too
// would double it via the send-notification webhook. Unread state is a read of
// existing data, nothing more.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/** One row of `public.my_conversations()`. */
export type Conversation = {
  job_id: string;
  request_id: string | null;
  service_needed: string | null;
  location: string | null;
  job_status: string;
  scheduled_at: string | null;
  amount: number | null;
  i_am: "client" | "contractor";
  other_id: string | null;
  other_name: string | null;
  other_company: string | null;
  last_message_at: string | null;
  last_snippet: string | null;
  last_sender_id: string | null;
  last_has_attachment: boolean | null;
  unread: number;
};

/** Fired after we send or read a message so any other mounted view refreshes. */
export const CHAT_CHANGED_EVENT = "ff:chat-changed";
export const announceChatChange = () => {
  try { window.dispatchEvent(new Event(CHAT_CHANGED_EVENT)); } catch { /* SSR / detached */ }
};

export async function loadConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw error;
  return (data as Conversation[]) ?? [];
}

/**
 * Mark a whole conversation read up to now. The RPC ignores anyone who isn't a
 * party to the job, so an admin reading a chat can never clear the real
 * recipient's badge.
 */
export async function markJobRead(jobId: string): Promise<void> {
  await supabase.rpc("mark_job_read", { p_job_id: jobId });
}

/* ── Dashboard hook ──────────────────────────────────────────────────── */

/**
 * Live conversation list for the signed-in user.
 *
 * The realtime subscription is dashboard-wide, not per-drawer: previously the
 * only channel lived inside the open chat, so a message arriving while the
 * drawer was closed showed up nowhere until a reload.
 *
 * On any insert we re-run the RPC rather than counting in the browser — the
 * server already knows what's visible (a blocked message is hidden from its
 * recipient by RLS) and what's been read, so re-asking is the only way the
 * badge stays correct. Refreshes are debounced so a burst of messages costs
 * one round trip.
 */
export function useConversations(meId?: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!meId) return;
    try {
      const rows = await loadConversations();
      if (!alive.current) return;
      setConversations(rows);
      setError(false);
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [meId]);

  const debouncedRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void refresh(); }, 400);
  }, [refresh]);

  useEffect(() => {
    alive.current = true;
    if (!meId) { setLoading(false); return; }
    void refresh();

    // No `filter` — RLS on public.messages already scopes the stream to jobs
    // this user is a party to, and there's no way to filter on a list of ids.
    const channel = supabase
      .channel("chat-inbox:" + meId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, debouncedRefresh)
      .subscribe();

    window.addEventListener(CHAT_CHANGED_EVENT, debouncedRefresh);

    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(CHAT_CHANGED_EVENT, debouncedRefresh);
      supabase.removeChannel(channel);
    };
  }, [meId, refresh, debouncedRefresh]);

  /** Optimistically clear a badge, then tell the server. */
  const markRead = useCallback(async (jobId: string) => {
    setConversations(prev => prev.map(c => (c.job_id === jobId ? { ...c, unread: 0 } : c)));
    try { await markJobRead(jobId); } catch { /* the next refresh will correct it */ }
  }, []);

  const byJob: Record<string, Conversation> = {};
  conversations.forEach(c => { byJob[c.job_id] = c; });

  const totalUnread = conversations.reduce((n, c) => n + (c.unread || 0), 0);

  return {
    conversations,
    byJob,
    totalUnread,
    loading,
    error,
    refresh,
    markRead,
    unreadFor: (jobId?: string | null) => (jobId ? byJob[jobId]?.unread ?? 0 : 0),
  };
}

/* ── Display helpers ─────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "2:14 PM" — the timestamp under a chat bubble. */
export function messageTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today" / "Yesterday" / "Mon, Aug 4" — the separator between chat days. */
export function daySeparator(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = startOfDay(new Date()) - startOfDay(d);
  if (diff === 0) return "Today";
  if (diff === DAY_MS) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** True when two messages fall on different calendar days. */
export function isNewDay(iso: string, prevIso?: string | null): boolean {
  if (!prevIso) return true;
  const a = new Date(iso), b = new Date(prevIso);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
  return startOfDay(a) !== startOfDay(b);
}

/** "just now" / "14m" / "3h" / "Yesterday" / "Aug 4" — the inbox timestamp. */
export function inboxTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m";
  const dayDiff = (startOfDay(new Date()) - startOfDay(d)) / DAY_MS;
  if (dayDiff === 0) return Math.floor(mins / 60) + "h";
  if (dayDiff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Who can still write ─────────────────────────────────────────────── */

/**
 * Messaging stays open through the claim window — a client needs to be able to
 * reach their pro while deciding whether to confirm, and for the three days
 * they have to raise a problem afterwards. It only goes read-only once the job
 * is finished AND the money has moved (or the job was cancelled), which is the
 * same point the contractor side already closed at.
 */
export function chatReadOnly(job: any): boolean {
  if (!job) return true;
  if (job.status === "cancelled") return true;
  return job.status === "completed" && job.payment_status === "released";
}

/** Why the box is closed, in one sentence. */
export function chatClosedReason(job: any): string {
  if (job?.status === "cancelled") return "This job was cancelled, so messaging is closed.";
  return "This job is finished and paid out, so messaging is closed.";
}
