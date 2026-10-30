# Chat & messaging

## Chat guard
Blocks circumvention (phone / email / messaging_app / social / payment / off_platform). `chat_flag_reasons(text)` returns tokens; the BEFORE INSERT trigger `messages_chat_guard` → `chat_guard()` **sets `new.blocked := true` rather than RAISEing**, because a RAISE would roll back the row that is itself the evidence.

`messages.blocked` + `flag_reasons`; the SELECT policy is `blocked is not true or sender_id = auth.uid()`, so the recipient never sees it — and since realtime respects RLS, that governs the live stream too. `notify_new_message()` returns early on `NEW.blocked`, **before** touching `message_email_log`, so a blocked message can't email anyone or burn the 15-minute throttle a legitimate follow-up needs.

Client side: `src/lib/chatParse.ts` `blockedReason()` + `BLOCKED_HELP`; the sender keeps their text, sees a red banner and a struck-through "Only you can see this message" bubble. Admin: `admin_list_chat_flags(p_limit)` behind a **Flagged chat** tab.

## Scheduling from the chat
Detection **must** be client-side (Postgres can't resolve "thursday at 2pm" against the reader's local calendar). `detectDateTime()` in `chatParse.ts` is deliberately conservative — it needs **both** a day anchor and a time of day, since a false positive books an appointment nobody agreed to. `findTime` requires am/pm, noon/midnight or a colon; `findDay` tries ISO → "august 5" → "5 august" → today/tomorrow → weekday → slash-date last, guarded so `3/4 inch coupling` isn't March 4th. Verified 11/11 should-fire, 16/16 should-not-fire.

The sender's browser fires `chat_propose_time` fire-and-forget after its own message sends (a scheduling hiccup must never make a delivered message look failed), stamping `jobs.chat_time_at/_by/_proposed_at/_msg/_resolved_at` — so the prompt reaches the other side with **no polling and no open chat window**. `ChatTimePrompt.tsx` is role-agnostic and mounted in both dashboards keyed on `chat_time_by !== me`.

`chat_agree_time` branches so it can **never skip a payment step**: `scheduled` (booked and paid — the time simply moves), `proposal_updated` (estimate with the client — only the proposed time moves), `penciled` (no estimate yet), `ignored`. All three live branches write `scheduled_at`, so the calendar updates for free. Dismissing only hides the modal; an attention row persists.

## Inbox + unread
**Read state is per-person, not per-message:** `message_reads` holds one row per `(job_id, user_id)` with `last_read_at`. One write per open regardless of message count, survives messages landing mid-read, and gives each party an independent position. (The legacy per-row `messages.is_read` is dead — nothing reads or writes it.)

**`my_conversations()`** returns every job the caller is party to **plus** its unread count **plus** the running total in one call — inbox rows, sidebar badge and per-job pills all read the same array, so a "3 unread" badge can't open onto an empty list. Blocked messages are excluded from both count and snippet. **`mark_job_read(p_job_id)`** returns early unless the caller is the job's client or contractor, which is what makes admin peeking safe.

`src/lib/chatUnread.ts` — `useConversations(userId)` (`unreadFor`, `markRead` optimistic-then-reconcile, `refresh`), the time formatters, and **`chatReadOnly(job)` / `chatClosedReason(job)`**: chat closes only once `status==='completed' && payment_status==='released'`, or the job is cancelled. The old `status==='completed'` test **cut off messaging during the 3-day dispute window**, precisely when a client most needs their pro.

`MessagesInbox.tsx` is deliberately dumb — renders what it's handed, never queries or counts. Rows keyed on `job_id`. Unread also appears in *Needs your attention*, capped at 3 (contractor) / 2 (client) so chat can't bury money-gating rows.

Admin needed no DB work — the existing `Admin full access to messages` ALL policy means a **Read chat** button on the Jobs tab opens `JobChat` with `role="admin"`, `readOnly`; `markRead()` is a no-op for admins.

## Bid-stage chat (2026-08-18)
A private thread between the client and **ONE** pro who bid, **before any job exists** — so a client can ask several pros a question and compare answers, not just prices.

Two rules are load-bearing and enforced in the **database, not the UI**:
- **The CLIENT opens the thread; a pro can only reply.** A pro who could message first would turn a posted request into a cold-call list.
- **A pro sees only their own thread.** RLS matches a contractor on `thread_contractor_id`, so pro A can never read pro B's conversation.

Built on `public.messages` **on purpose**, not a parallel table — so `chat_guard()` circumvention blocking, the `blocked` flag and sender-only visibility all apply unchanged. Bid stage is exactly where the incentive to go off-platform is highest, because there is no job yet to lose.

`messages.request_id` + `messages.thread_contractor_id`, with CHECK `messages_one_thread` = `((job_id is not null) <> (request_id is not null)) and (request_id is null or thread_contractor_id is not null)` — a message belongs to a job **or** a request, never both. Index `messages_request_thread_idx`. Read state in `bid_thread_reads (request_id, contractor_id, user_id, last_read_at)`, the same per-person model as `message_reads`.

**The "has the client written yet?" test cannot live inline in the send policy** — an INSERT WITH CHECK on `messages` containing a subquery on `messages` is *infinite recursion*. It lives in `SECURITY DEFINER` **`bid_thread_open(request_id, contractor_id)`**, which also made the test stricter: it requires that the **request owner** specifically has spoken, not merely somebody other than the caller.

`my_bid_threads()` returns threads + unread + snippet in one call. Its client side is one row per pro who bid on any of my requests, so a thread can be **started** from the list; its contractor side returns only threads the client has already opened, so an empty result genuinely means nobody has written. `mark_bid_thread_read(request, contractor)` returns early unless the caller is one of the two parties.

**⚠️ The two branches were asymmetric, and that asymmetry was the bug (2026-09-16).** The client branch filtered `r.status = 'pending'`; the contractor branch had **no status filter at all**. So the moment a client picked somebody, every bid conversation vanished from their side — while the losing pros kept their threads and went on replying into a conversation the client could no longer see. Fixed with one added predicate: a request that has left `'pending'` still yields any thread that **actually has messages** (`or exists (select 1 from messages m2 …)`), so picking a pro doesn't leave six dead rows in the inbox either. Deliberately an `or exists` on the existing client branch rather than a **third UNION branch** — a new branch would need its own `limit 1` subselect for `bid_amount`, which could disagree with the join-derived `b.amount` and defeat the UNION's dedup, producing two rows for one thread. Migration `20260916_my_bid_threads_keep_started_threads_after_pick.sql`.

`notify_new_message()` gained a request branch **before** the untouched job branch. It **does not** touch `message_email_log` (PK is `(job_id, recipient_id)`, and `job_id` is null here) — it throttles on the `notifications` table instead, 15 min per recipient. Type is `bid_message`, routed to `available` (contractor) / `requests` (client) in `notificationRoutes.ts`.

**`BidChat.tsx` is deliberately TEXT ONLY.** Attachments would need storage RLS keyed on a job id that doesn't exist yet, and a pre-hire question doesn't need a photo — the client's request photos are already on the request.

Verified end to end with a rolled-back RLS probe under real JWT claims, 16/16: contractor-initiates blocked, client-opens OK, pro-replies OK, pro2 reading pro1's thread returns 0 rows, pro2 hijack blocked, unread 1 → 0 after mark_read.

**Bid threads now live in the MESSAGES INBOX on both dashboards, not just on a card (2026-09-16).** The reported bug was "the contractors have no way of replying to a chat when a client messages before picking someone", and it was five faults stacked, only one of which was the DB asymmetry above. The Messages tab rendered `my_conversations()` alone — which is **job-scoped**, and at bid stage there is no job — so a bid thread had **no home in the inbox at all**; the pro's only entry point was a button nested inside one Available Jobs card, which disappears the moment they hide the job or the request leaves `list_open_jobs()`; bid threads had no realtime; and the sidebar Messages badge excluded bid unread, so nothing anywhere told a pro a client had written.

**`src/lib/bidThreads.ts` is the bid-side twin of `chatUnread.ts`** — `useBidThreads(userId)` returns `{threads, started, byKey, byRequest, totalUnread, loading, error, refresh, markRead, unreadFor}`, with a realtime channel on `messages` INSERT plus a `CHAT_CHANGED_EVENT` listener, **both debounced 400ms** so a burst is one refetch. A failed read sets `error` and **keeps the previous list** — a failed read is not an empty result.

Three things about the merge are load-bearing:

- **The synthetic row key is `bid:<request>:<pro>`, and `job_id` deliberately holds that same non-uuid string.** `conversationKey(c)` in `chatUnread.ts` is the one key function for both kinds. Putting the synthetic key in `job_id` means any job-scoped path that mistakenly receives a bid row fails **loudly** with a bad-uuid error rather than silently marking the wrong thread read.
- **`openConversation` branches on `c.kind === "bid"` FIRST**, before any job lookup, for the same reason.
- **Loading and error compose differently, because they mean different things.** `inboxLoading = (convLoading || bid.loading) && inboxRows.length === 0` (show rows the moment either call answers), but `inboxError = convError && bid.error` — `MessagesInbox` renders its error state *instead of* the list, so one failing call must not hide the other's rows. Its error branch returns EARLY for that reason.

`BidChat.send()` now calls `announceChatChange()` after a successful insert. The realtime channel covers the **recipient's** dashboard, but the **sender's own** inbox row sitting behind the open drawer would keep a stale snippet and timestamp until something else refreshed it.

## Media in chat
Private **`message-media`** bucket (image/jpeg,png,webp,gif,heic,heif + video/mp4,webm,quicktime; 50MB cap), `messages.attachment_path` / `attachment_type`, path convention `<job_id>/<file>` with storage RLS keyed on the first path segment. `JobChat.tsx` validates type and size **before** upload (images ≤10MB, videos ≤50MB), supports caption-only or attachment-only messages, and renders via 1-hour signed URLs cached in state.

**Bid-stage chat carries photos too, in the SAME bucket under a second path convention (2026-08-28).** `BidChat` was "deliberately TEXT ONLY" because storage RLS on `message-media` keys on a **job id that does not exist yet** at bid stage. A parallel bucket was the obvious move and the wrong one — it would have duplicated the sender-only-visibility and `chat_guard` plumbing. Instead bid media lives at **`<request_id>/<contractor_id>/<file>`**, gated by `bid_media_path_ok(name)`, which **re-derives both load-bearing bid-thread rules from the path itself**: the client may only write into the folder of a pro who actually bid, and the pro may only write into their own folder and only once `bid_thread_open()` says the client has spoken first. So an upload can never get ahead of the rule it exists to serve, and pro A can never write into pro B's folder.

**⚠️ The uuid first segment is mandatory, and not for tidiness.** The existing `message_media_*` policies do `(split_part(name,'/',1))::uuid` — a **cast, not a match**. One object whose first segment isn't a uuid raises 22P02 *during policy evaluation*, which breaks reads of the **whole bucket for everyone**, not just that row. `bid_media_path_ok` uses a `CASE` so its regex shape test short-circuits ahead of its own two casts, for the same reason.

`bid_media_select` is keyed on the **message row**, not the path (`exists (select 1 from messages m where m.attachment_path = objects.name and m.request_id is not null)`), so it inherits `messages` RLS's pro-A-cannot-read-pro-B answer instead of restating it and drifting. The consequence to remember: **an object is unreadable until a message points at it**, which is why the composer previews from a local `URL.createObjectURL` and `signMissing()` only ever runs after the insert. Verified 9/9 with a rolled-back probe under real JWT claims (client-into-bidder-folder OK, client-into-non-bidder blocked, pro-before-client blocked, pro-after-client OK, pro2 hijack blocked, non-uuid shape denied as 42501 not 22P02, unlinked object unreadable).

`my_bid_threads()` and `my_conversations()` already fell back to `'Sent a photo'` on `attachment_path is not null`, so inbox snippets needed no DB change. BidChat is **images only** on purpose — a pre-hire question doesn't need a video, and 50MB uploads from someone who hasn't been hired yet is a bill with no job attached.

## Image safety scanning
`src/lib/imageSafety.ts` → `scanImage(bucket, path)` → `{verdict, categories, detail}`, backed by the **`scan-image`** edge function (v1, `verify_jwt=true`) and the **`image_scans`** ledger, unique on `(bucket, path)` so a re-scan reads the stored row instead of paying for a second model call.

**It fails open in two places, deliberately.** The function returns `"unknown"` for every condition it can't resolve — no key, download error, model timeout, unreadable format — and returns those as **HTTP 200** so no caller can learn to read a status code as a rejection. The library is the second layer: any network/parse failure on the browser side also returns `"unknown"`, and every caller treats `"unknown"` as *send it*. The browser gives up at **12s** while the function aborts at 20s, because the person is holding a Send button — and giving up early is safe rather than wasteful, since the function keeps running and still writes its verdict. This is the same rule `imageCompress.ts` follows when every failure path returns the ORIGINAL file, and for the same reason: a completion photo is a payment gate, a problem photo is a client's remedy, and losing one to a scanner outage is a far worse failure than briefly letting through a photo a human can still deal with.

**`shouldBlock(r, { evidence: true })` is the surface distinction.** On evidence surfaces — dispute exhibits (`ReportProblem`, `RespondToClaim`) and completion photos (`JobPhotos`, `MilestonePanel`) — a **`gore` reject does NOT block**, because a claim can legitimately be about an injury the work caused and a finished-work photo is what releases money. Refusing either would use a moderation tool to destroy somebody's only route to being paid or made whole. They are still **scanned**, so the verdict reaches `image_scans` for an admin either way. `sexual` and `hate` block on every surface without exception; neither is ever evidence of anything on a home-services platform. A `flag` verdict (readable contact details) is never a block — it's recorded for the admin queue, exactly like `chat_guard()`'s text-side flags, because a photo of a furnace label carrying the manufacturer's support number is innocent.

**The scan is NOT a security boundary.** It runs *after* the object is in storage — it has to, since the function reads the object — so a caller that skips it changes nothing about who can upload. Storage RLS governs that. This is moderation, and it is advisory by construction.

Wired at every image upload: `ClientOnboarding`, `NewRequest`, `RequestPhotoQuote`, `JobChat`, `BidChat`, plus the four evidence surfaces. **Refusal copy differs by what the person can still do**: `NewRequest` stops *before* the request insert, clears `photoFile` and says "press Submit again to post without a photo" — nothing is half-created and the page is still on screen. `ClientOnboarding` posts first and explains on the success screen, because the account and the request are already made and refusing there would strand a signup.

## Client photo nudge (2026-08-28)
A request photo is **optional and stays optional** — it is a nudge, never a gate. Pressing Next on ClientOnboarding step 2 with no photo pulses `#co-photo`, adds an asterisk and shows the advisory once; a second press proceeds. The nudge sits **after** `validate()`, so a real error still wins. `photoNudged` is a **useRef, not state**, because a re-render between the two presses would race the click handler. The asterisk appears **only after the nudge** — marking a genuinely optional field on first sight is a lie. That page is outside `.ffdash`, so it carries its own `@keyframes ff-co-pulse` / `.ff-photo-pulse` rather than reusing the dashboard's `.ff-pulse`.

Afterwards the gap is recoverable rather than lost: a `pending` request with no `photo_path` pushes a **"Your request has no photo"** attention row (below every money row, above the conversational ones) whose CTA calls `focusPhoto`, and `RequestPhotoQuote` takes `canUpload` so the photo can be added from the dashboard at any time. **`focusPhoto` must `setReqDetailOpen(true)` before scrolling** — the photo panel lives inside the request-detail block, which is collapsed exactly when estimates are on screen, so without that the CTA scrolls to nothing. Scoped to `pending` because once a pro is picked the photo has done its job.

**`NewRequest` carries the same nudge (2026-08-31).** The returning-client form is where most repeat requests are actually posted, so nudging only on ClientOnboarding covered the smaller half of the traffic. Same three rules — after `validate()`, `useRef` not state, asterisk only after the first press — and the second press still posts. It stays a nudge on this form too: a returning client posting a job they've posted before is exactly who should not be blocked over a photo.

**Switching requests must clear the previously-selected job (2026-08-31).** `ClientDashboard` keeps the open job in state, and picking a different request left the old `job` mounted underneath the new request's header — so the payment panel, the agreement and the attention anchors all belonged to a job the client was no longer looking at. That is a money surface reading from the wrong row, which is worse than a blank one. The selected-request setter now clears the job alongside it, and the read that repopulates it is keyed on the new request. **A failed read still is not an empty result** — the existing `jobLoadFailed` banner is preserved, so "couldn't load" and "no job yet" stay distinguishable.

---

