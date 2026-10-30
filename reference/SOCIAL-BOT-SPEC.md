# Freddy Social Bot — build spec

**Goal:** one automated conversational agent on Facebook, Instagram and Reddit that onboards clients
and contractors, holds a natural human conversation, and posts a job on the client's behalf from what
was discussed in the chat.

**Decisions locked (2026-08-19):**

| Decision | Choice |
|---|---|
| Meta path | Native app **and** partner rail in parallel. ManyChat delivers while App Review runs, then cut over. |
| Autonomy | Bot converses fully unsupervised. Posting a job waits for one-tap owner approval. |
| Job posting | Magic link — client taps to confirm, accepts the User Agreement themselves. |
| Reddit | Own subreddit + inbound DMs only. Existing draft-queue scout stays for everywhere else. |

---

## 1. What is actually permitted

This is the part that decides the architecture, so it goes first.

**Meta — inbound is fully automatable, outbound is not.**
The Messenger Platform and Instagram Messaging API exist precisely to let a business run an automated
agent. What is sanctioned:

- Someone DMs your Page or IG account → you may reply automatically, forever, as long as each reply
  is inside the **24-hour window** that their message opened.
- Someone comments on **your own** post → you may send them **one** private reply that opens a DM
  thread (`POST /{object-id}/private_replies`). A comment or post may only be replied to once, ever.
  The edge is write-only — you cannot read back what you sent, so track it yourself. On Facebook the
  window is "a limited time, usually several months, subject to change"; on Instagram it is 7 days
  from the comment. Treat both as 7 days and you are never wrong.
- Someone clicks an `m.me` link, a Click-to-Messenger ad, or the Page's Send Message button →
  thread opens, bot answers.

What is **not** permitted and would cost you the Page: messaging people who never contacted you,
scanning or replying inside other people's posts or Groups, and using message tags to push
promotional content.

Two things that changed recently and must not be built on:
- **Recurring Notifications were discontinued globally on 2026-02-10 except AU, EU, JP, KR, UK.**
  Canada is not on that list. There is no re-engagement drip available.
- Message tags `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` return error 100
  as of 2026-04-27. `HUMAN_AGENT` survives (7-day window, App Review gated) but it is for a *human*
  replying late. The bot must never send under it — that misuse is what triggers messaging
  restrictions on the Page.

**Reddit — automated cold contact is banned outright.**
The Responsible Builder Policy (updated 2026-06-05) says apps "must get a user's explicit consent to
engage in private communications" and "must not engage in spamming activity through automated posts,
comments, or direct messages." Commercial data use needs express written approval. So the compliant
automation surface is: **your own subreddit, and people who DM you first.** Everything else stays in
the human-approval draft queue that `reddit-lead-scout` already builds.

---

## 2. Architecture — one brain, three mouths

The single biggest thing to get right: **conversation logic lives in exactly one place.** Three
copies of the persona will drift within a month.

```
FB Messenger ─┐
Instagram DM ─┼─► transport adapter ─► social-bot-brain ─► Claude + tools ─► reply
Reddit       ─┘        (thin)            (all the logic)         │
                                                                 ├─► social_actions (approval queue)
                                                                 └─► client_requests (via magic link)
```

`social-bot-brain` is an edge function with a fixed HTTP contract:

```
POST /social-bot-brain
{ channel: "fb"|"ig"|"reddit", external_user_id, text, display_name?, attachments? }
→ { messages: string[], actions: [{kind, payload}], handoff: boolean }
```

Every transport speaks that contract. ManyChat's **External Request** block speaks it. The native
`meta-webhook` speaks it. `reddit-bot` speaks it. Swapping ManyChat out later is a config change.

**Reuse `supabase/functions/chat/index.ts`.** It already has the Anthropic wiring, the Freddy system
prompt, prompt-injection patterns, and per-caller rate limiting via `chat_rate_check`. The brain is
that function plus persistent state, tool use, and channel-aware formatting. Do not start from blank.

---

## 3. Schema

```sql
create table public.social_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('fb','ig','reddit')),
  external_user_id text not null,          -- PSID / IGSID / reddit username
  display_name text,
  intent text default 'unknown' check (intent in ('client','contractor','unknown','other')),
  state jsonb not null default '{}'::jsonb, -- slot accumulator
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  window_expires_at timestamptz,            -- last_inbound_at + 24h (Meta)
  handed_off boolean not null default false,
  disclosed boolean not null default false, -- bot disclosure sent once
  consent_at timestamptz,
  linked_user_id uuid references auth.users(id) on delete set null,
  created_request_id uuid references public.client_requests(id) on delete set null,
  turn_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (channel, external_user_id)
);

create table public.social_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.social_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  external_message_id text,
  body text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, external_message_id)
);

create table public.social_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.social_conversations(id) on delete cascade,
  kind text not null check (kind in ('post_job','invite_contractor','handoff')),
  payload jsonb not null,
  claim_token uuid not null default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','sent','claimed','expired','failed')),
  approved_by uuid, approved_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  result jsonb,
  created_at timestamptz not null default now()
);
```

**`unique (conversation_id, external_message_id)` is load-bearing.** Meta redelivers a webhook event
on any non-200 response, and it retries with backoff. Without that constraint the bot answers the
same message three times and reads as broken. This is the single most common failure mode of these
bots.

RLS: all three tables are admin-read only (`is_admin()`), no anon grants. The bot writes with the
service role from the edge function.

---

## 4. The reply loop

```
1. meta-webhook receives POST
2. verify X-Hub-Signature-256 = HMAC-SHA256(raw body, META_APP_SECRET)   ← constant-time compare
3. upsert social_conversations, insert social_messages (ON CONFLICT DO NOTHING → dedupe)
4. return 200 IMMEDIATELY
5. EdgeRuntime.waitUntil(handle())  ← Claude runs after the response
6. handle(): load last 12 turns + state → Claude with tools → validate tool calls
7. sender_action: typing_on → sleep(min(4s, 800ms + 40ms × chars)) → Send API
8. record outbound, bump window_expires_at
```

**Step 4 before step 5 is not optional.** Meta expects a 200 within a few seconds and will disable a
webhook that keeps timing out. Never make Meta wait on an LLM call.

**Tools available to the model** (each one validated server-side before it does anything):

| Tool | Does |
|---|---|
| `set_slots` | Writes into `state`. Free-form, safe. |
| `lookup_price` | Calls `get_service_pricing()`. Bot quotes real ranges, never invents a number. |
| `check_coverage` | Parses Calgary quadrant/town out of a location string. |
| `list_services` | Returns the canonical `service_needed` labels. **Constrained enum.** |
| `propose_job_post` | Writes a `social_actions` row, kind `post_job`. Does NOT create anything. |
| `send_contractor_link` | Sends `/for-contractors`. Does NOT create a contractor account. |
| `hand_off` | Sets `handed_off`, silences the bot, emails you. |

`list_services` being a constrained enum matters more than it looks. `service_needed` must match a
`service_specialty_map` label or **no contractor is matched and no dispatch email fires** — the
request lands and dies silently. The bot must pick from the list, never free-text it.

---

## 5. Voice

The tone spec is a hard constraint in the system prompt, and it is the difference between this
converting and being ignored.

**Rules:**
- One idea per message. Two short messages beat one paragraph.
- Under 25 words per message. Never more than 2 messages per turn.
- **No em dashes. No semicolons. No exclamation marks** past one genuine one at hello.
- **Never** bullets, numbered lists, bold, or headers. Nobody types markdown into an Instagram DM.
- Contractions always. Sentence fragments are fine. Lowercase openers are fine.
- **One question per message.** Never stack "what's your address and when are you free".
- Answer their question first, then ask yours.
- No emoji unless they use one first, then at most one back.
- Banned openers: "Great question!", "I'd be happy to help", "Absolutely!", "Thanks for reaching out!",
  "Feel free to". Banned move: repeating their words back ("So you've got a leaky faucet!").
- Never claim to be human. Never volunteer that it's a bot after the disclosure either.

**Disclosure.** Policy requires telling people they're talking to an automated experience at the start
of the thread. Meta accepts phrasing like "I'm the [Page] bot." Do it once, in the greeting, in voice:

> hey, freddy's assistant here. what's going on at the house?

Not: *"You are interacting with an automated experience."*

**Calibration examples:**

| Bad | Good |
|---|---|
| "Great question! I'd be happy to help you with your leaky faucet — could you tell me your address, when you're available, and your budget?" | "leaky faucet, got it. what part of the city are you in?" |
| "Absolutely! Our platform connects you with up to 7 vetted Calgary contractors who provide free estimates!!" | "you'll get free estimates from a few local pros. no cost to post it." |
| "Based on our pricing data, plumbing repairs typically range from $150-$400 depending on scope." | "most plumbing calls land around $150 to $400. depends what's behind the wall." |
| "I'm sorry to hear that. That sounds frustrating. Let me help you find a solution." | "that's annoying. how long's it been leaking?" |

---

## 6. Posting the job — magic link

Slots required for a live `client_requests` row: `service_needed` (from the enum), `job_description`,
`location`, `preferred_schedule`, `first_name`, and one of `email` / `phone`.

Flow:

1. Bot fills slots across the conversation. When complete it calls `propose_job_post` → writes a
   `social_actions` row, status `pending`. **Nothing is created yet.**
2. You get one email / admin row: the drafted request, the transcript, Approve / Edit / Reject.
3. On approve, bot sends the person `freddyfixit.ca/claim/<claim_token>`.
4. That page shows the request pre-filled, read-only-ish, with the User Agreement checkbox and the
   CASL newsletter opt-in unticked. One tap posts it.
5. Submit creates the auth user (or attaches by email to an existing profile), writes
   `client_requests`, and normal dispatch fires from there. `social_conversations.created_request_id`
   is stamped.

**Why the link and not direct creation.** The client accepts the User Agreement with their own tap.
Given the open Alberta prepaid-contracting exposure, having the bot accept a contract on someone's
behalf is not a corner worth cutting. It is also the CASL/PIPA-clean way to capture consent.

**Precedent already in the DB:** `client_requests.pick_token` plus `get_bids_by_token` /
`accept_bid_by_token` already let a logged-out client pick a bid from a token link. Build `/claim`
the same shape — same page pattern, same token discipline.

**Two gates now, one later.** Owner approval is a training-wheels gate. After ~25 clean conversations,
drop it and keep only the client's own tap.

---

## 7. Contractor onboarding

The bot **qualifies and routes, it does not create accounts.**

Qualifies on: trade, serves Calgary, currently taking work, has WCB / insurance. Then sends
`/for-contractors` and the onboarding link, and drops a `social_actions` row so you see the lead.

Do not let the bot create contractor rows. Admin approval already gates jobs, the 5-step onboarding
collects vetting answers the bot cannot verify, and a half-populated contractor is exactly the
problem the 8→5 step merge was designed to stop.

One thing the bot should say, because it is the highest-converting fact and pros do not know it:
no lead fees, no pay-per-lead.

---

## 8. Meta implementation notes

**Permissions to request in one App Review submission** (messaging does not approve in isolation):
`pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`,
`instagram_business_basic`, `instagram_business_manage_messages`. Add `Human Agent` separately if you
want the 7-day human window in Page Inbox.

**What gets you approved:**
- A **live public callback URL** with webhook verification working. No callback = automatic reject.
- A screencast showing a test user DM the Page/IG account and your app reply *through the API*.
  Reviewers must be able to reproduce it. A flow they cannot reproduce fails.
- Business Verification completed on the Meta Business account.
- Privacy policy URL and a data-deletion callback. `/privacy-policy` exists but needs a Meta line
  added alongside the Stripe/Supabase/Resend/Google/Komoot disclosures.

**Rate limits to respect:** IG is 2 calls/sec per professional account, 750/hr for private replies to
comments on posts and reels, 100/sec for private replies to Live comments. Build a per-conversation
send queue rather than firing in parallel.

**Handover Protocol.** Wire it so that when you open a thread in Page Inbox, the bot goes quiet.
Without it you and the bot talk over each other in front of a customer.

**Also configure:** ice breakers (3 taps: "get an estimate" / "join as a pro" / "talk to a person"),
persistent menu, and the greeting text. These do a surprising amount of the qualification for free.

**Secrets:** `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_TOKEN` (long-lived), `META_PAGE_ID`,
`META_IG_ID`. `META_PAGE_TOKEN` and `META_PAGE_ID` are already referenced by `meta-lead-scout`.

---

## 9. Reddit implementation notes

- Register the app and create a developer profile so it carries the **App profile label** — required
  by policy, and unlabelled bots get removed.
- The bot account is **single purpose**. No mixed use with a personal account.
- It acts only in **r/FreddyFixIt** (create it) and on **inbound DMs where the person wrote first**.
- Sticky post + user flair declaring it is a bot.
- `reddit-lead-scout` stays exactly as it is: human-approved drafts for everywhere else. Do not
  automate it. That is the line that gets accounts and domains suspended.
- Free tier is 100 queries/minute per OAuth client for non-commercial use. Own-subreddit moderation
  and inbound DMs sit inside that. Do not scrape.

---

## 10. Phasing

| Phase | Ships | Gate |
|---|---|---|
| 0 | Schema, `social-bot-brain`, voice spec, replay harness against ~30 canned conversations | none |
| 1 | ManyChat rail live on FB + IG. Bot converses. Job posts queue for approval. | you approve each post |
| 2 | Native `meta-webhook` + App Review submitted | Meta |
| 3 | Comment → private reply auto-DM. Click-to-Messenger ads. | after phase 1 is clean |
| 4 | r/FreddyFixIt + inbound Reddit DMs | none |
| 5 | Cut over to native, cancel ManyChat | Meta approval |

**Replay harness first.** Write ~30 real conversation transcripts (client, contractor, tyre-kicker,
abusive, off-topic, someone trying to get free advice, someone whose job is out of area) and run the
brain against them offline. Tuning tone against a file costs nothing; tuning it against real
customers costs the customers.

---

## 11. Risks

- **Page restriction kills the whole channel.** Never message first outside a private reply, disclose
  once, rate limit. One spam report cluster is enough.
- **A bad job post cannot be un-sent** — it fires dispatch emails to up to 7 contractors. That is what
  the approval gate is for. Keep it until the transcripts are boring.
- **Prompt injection.** `chat/index.ts` already has patterns; reuse them. And never let model output
  alone write to the DB — every tool call is validated server-side against the enum and the schema.
- **LLM cost.** Cap turns per conversation (~30), classify intent with Haiku, converse with Sonnet.
- **`service_needed` drift.** If the bot ever writes a label outside `service_specialty_map`, the
  request is invisible to all three matchers. Constrain the tool, and assert it in the claim page too.

---

## 12. Open items for the owner

- Meta Business Verification, if not already done.
- Facebook Page + Instagram professional account linked to the same Business portfolio.
- Decide the ManyChat plan (Pro is $39/mo up to 2,500 contacts, ~$0.05 per contact over).
- Confirm `ANTHROPIC_API_KEY` is set in Supabase. `chat/index.ts` requires it and is live on the
  site, but CLAUDE.md records `newsletter-ai-draft` as dormant waiting on the same key — one of those
  two is stale. Worth checking before phase 0, since the brain needs it and setting it also unblocks
  the newsletter drafter.
- Add Meta to the third-party disclosure list in `/privacy-policy`.
