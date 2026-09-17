// Bid-stage conversations — the pre-hire thread between a client and ONE pro
// who bid, before any job exists.
//
// WHY THIS FILE EXISTS. `my_conversations()` is job-scoped and `my_bid_threads()`
// is request-scoped, so they are two RPCs feeding what a user experiences as one
// inbox. Until this landed each dashboard called `my_bid_threads()` itself, in
// its own shape, with no realtime and no place in the Messages tab — so a
// contractor whose client wrote first had the reply button buried inside one
// Available Jobs card, and nothing anywhere told them a message had arrived.
// Hiding the job, or the request leaving the open-jobs feed, took the only
// route to the conversation with it.
//
// So the adapter below is the point of the module: a bid thread is converted
// into the SAME `Conversation` shape the job inbox already renders, and both
// dashboards merge the two lists. One renderer, one row shape, one badge total
// — the "ONE payload drives everything" rule `chatUnread.ts` already follows,
// extended to cover the half of messaging that had no home.
//
// The two rules a bid thread obeys are enforced in the DATABASE, not here: the
// CLIENT opens the thread (a pro who could write first would turn a posted
// request into a cold-call list), and a pro sees only their own thread. This
// module never decides either; it renders what the RPC returned.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHAT_CHANGED_EVENT, type Conversation } from "@/lib/chatUnread";

/** One row of `public.my_bid_threads()`. */
export type BidThread = {
  request_id: string;
  contractor_id: string;
  service_needed: string | null;
  location: string | null;
  request_status: string;
  other_id: string | null;
  other_name: string | null;
  other_company: string | null;
  other_photo_url: string | null;
  bid_amount: number | null;
  last_message_at: string | null;
  last_snippet: string | null;
  last_sender_id: string | null;
  last_has_attachment: boolean | null;
  unread: number;
};

/**
 * A bid thread is unique by (request, pro) — a CLIENT holds one thread per
 * bidder on the same request, so keying on request_id alone collides and React
 * would reuse one row's state for another pro's conversation.
 */
export const bidRowKey = (requestId: string, contractorId: string) =>
  "bid:" + requestId + ":" + contractorId;

/**
 * Adapt a bid thread into an inbox row.
 *
 * `job_id` is deliberately the synthetic `bid:<request>:<pro>` key rather than
 * a uuid or an empty string. If any job-scoped code path ever reaches a bid row
 * by mistake — `mark_job_read`, a job lookup — it fails loudly with a bad-uuid
 * error instead of silently clearing or opening the wrong conversation.
 */
export function bidToConversation(t: BidThread, meId?: string | null): Conversation {
  // The contractor branch of the RPC only ever returns the caller's own thread,
  // so `contractor_id === me` is exactly "I am the pro here".
  const iAm: "client" | "contractor" = meId && t.contractor_id === meId ? "contractor" : "client";
  return {
    kind: "bid",
    contractor_id: t.contractor_id,
    job_id: bidRowKey(t.request_id, t.contractor_id),
    request_id: t.request_id,
    service_needed: t.service_needed,
    location: t.location,
    job_status: t.request_status,
    scheduled_at: null,
    amount: t.bid_amount,
    i_am: iAm,
    other_id: t.other_id,
    other_name: t.other_name,
    other_company: t.other_company,
    last_message_at: t.last_message_at,
    last_snippet: t.last_snippet,
    last_sender_id: t.last_sender_id,
    last_has_attachment: t.last_has_attachment,
    unread: Number(t.unread ?? 0),
  };
}

/**
 * A thread only belongs in an inbox once somebody has actually said something.
 *
 * The client branch of `my_bid_threads()` returns a row per BIDDER so a thread
 * can be STARTED from a bid row — which means a client with seven estimates
 * gets seven rows with no messages in them. Merging those into Messages would
 * fill the inbox with empty conversations nobody opened.
 */
export const bidThreadStarted = (t: BidThread) => !!t.last_message_at;

export async function loadBidThreads(): Promise<BidThread[]> {
  const { data, error } = await supabase.rpc("my_bid_threads");
  if (error) throw error;
  return (data as BidThread[]) ?? [];
}

export async function markBidThreadRead(requestId: string, contractorId: string): Promise<void> {
  await supabase.rpc("mark_bid_thread_read", { p_request_id: requestId, p_contractor_id: contractorId });
}

/* ── Dashboard hook ──────────────────────────────────────────────────── */

/**
 * Live bid-thread list for the signed-in user — the `useConversations` shape,
 * deliberately, so the two halves of the inbox behave identically.
 *
 * The realtime subscription is the fix for the reported bug's second half: the
 * old code fetched once on page load and again only when the chat drawer
 * closed, so a client's question arriving while the pro had the dashboard open
 * appeared nowhere at all until a reload.
 *
 * No `filter` on the channel — RLS on public.messages already scopes the stream
 * to threads this user is a party to, and a pro cannot be sent another pro's
 * rows. Refreshes are debounced so a burst costs one round trip.
 */
export function useBidThreads(meId?: string | null) {
  const [threads, setThreads] = useState<BidThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!meId) return;
    try {
      const rows = await loadBidThreads();
      if (!alive.current) return;
      setThreads(rows);
      setError(false);
    } catch {
      // A failed read is not an empty inbox. The previous list stays on screen
      // behind the error flag rather than a thread appearing to have vanished.
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

    const channel = supabase
      .channel("bid-inbox:" + meId)
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
  const markRead = useCallback(async (requestId: string, contractorId: string) => {
    setThreads(prev => prev.map(t =>
      (t.request_id === requestId && t.contractor_id === contractorId ? { ...t, unread: 0 } : t)));
    try { await markBidThreadRead(requestId, contractorId); } catch { /* the next refresh corrects it */ }
  }, []);

  /** Only started threads reach an inbox — see `bidThreadStarted`. */
  const started = threads.filter(bidThreadStarted);

  const byKey: Record<string, BidThread> = {};
  threads.forEach(t => { byKey[bidRowKey(t.request_id, t.contractor_id)] = t; });

  /** A contractor holds at most one thread per request — their own. */
  const byRequest: Record<string, BidThread> = {};
  threads.forEach(t => { byRequest[t.request_id] = t; });

  const totalUnread = threads.reduce((n, t) => n + (Number(t.unread) || 0), 0);

  return {
    threads,
    started,
    byKey,
    byRequest,
    totalUnread,
    loading,
    error,
    refresh,
    markRead,
    /** Unread on a specific (request, pro) thread — the client's per-bid badge. */
    unreadFor: (requestId?: string | null, contractorId?: string | null) =>
      (requestId && contractorId ? byKey[bidRowKey(requestId, contractorId)]?.unread ?? 0 : 0),
  };
}
