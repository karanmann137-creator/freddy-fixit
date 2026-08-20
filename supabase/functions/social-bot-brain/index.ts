// Supabase Edge Function: social-bot-brain
//
// The ONLY place Freddy's social conversation logic lives. Facebook Messenger,
// Instagram DM and Reddit all speak the same contract to this function, so the
// persona, the slot filling and the job-posting rules can never drift between
// channels. Transports are thin; this is the brain.
//
//   POST /social-bot-brain          header: x-ff-bot-key: <SOCIAL_BOT_KEY>
//   { channel: "fb"|"ig"|"reddit", external_user_id, text,
//     display_name?, external_message_id? }
//   → { messages: string[], actions: [...], handoff, duplicate, conversation_id }
//
// verify_jwt = false ON PURPOSE. verify_jwt is not authentication here — the anon
// key is a valid project-signed JWT that ships in the public JS bundle, and the
// caller (ManyChat, or our own meta-webhook) has no Supabase JWT at all. Auth is
// the shared secret above, compared in constant time.
//
// NOTHING in this function creates a job, a profile or a contractor. The most it
// can do is write a PROPOSAL into social_actions and wait for a human. That is
// deliberate: a bad job post fires dispatch email to up to 7 contractors and
// cannot be un-sent.
//
// Secrets: ANTHROPIC_API_KEY (+ auto-injected SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY). Optional: SOCIAL_BOT_MODEL, SOCIAL_BOT_KEY — when
// SOCIAL_BOT_KEY is unset the shared secret comes from social_bot_config instead,
// which only service_role can read. Rotate with admin_rotate_social_bot_key().

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SOCIAL_BOT_KEY    = Deno.env.get("SOCIAL_BOT_KEY") ?? "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL             = Deno.env.get("SOCIAL_BOT_MODEL") ?? "claude-sonnet-5";

const SITE = "https://freddyfixit.ca";

// Guardrails
const MAX_INBOUND_CHARS = 1200;
const MAX_TURNS         = 30;   // then hand off — nobody needs 30 turns to book a tap
const MAX_TOOL_ROUNDS   = 4;
const MAX_MESSAGES_OUT  = 2;
const RATE_LIMIT        = 20;   // per external user
const RATE_WINDOW       = 300;  // seconds

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ff-bot-key",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

// ── Shared secret ────────────────────────────────────────────────────────────
// The env var wins when it is set. When it is not, the key is read from
// social_bot_config, which only service_role can select. That is the same trust
// boundary as Deno.env (both need the service-role key to reach), and it means
// the key can be created and rotated over SQL instead of a dashboard trip.
let cachedKey = SOCIAL_BOT_KEY;
let keyLoadedAt = SOCIAL_BOT_KEY ? Number.MAX_SAFE_INTEGER : 0;

async function botKey(): Promise<string> {
  if (SOCIAL_BOT_KEY) return SOCIAL_BOT_KEY;
  if (cachedKey && Date.now() - keyLoadedAt < 10 * 60_000) return cachedKey;
  const { data, error } = await admin.rpc("social_bot_secret");
  if (!error && typeof data === "string" && data) {
    cachedKey = data;
    keyLoadedAt = Date.now();
  }
  return cachedKey;
}

// A plain === leaks the shared secret one byte at a time to anyone willing to
// measure. Cheap to do right.
function timingSafeEqual(given: string, expected: string): boolean {
  if (!expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── Service catalogue, fetched once per cold start ───────────────────────────
// Inlined into the system prompt rather than exposed as a tool: it is 23 short
// rows, and a tool call here would cost a whole extra round trip per conversation
// to tell the model something that never changes mid-chat.
let SERVICES: { label: string; low: number | null; high: number | null; unit: string | null }[] = [];
let servicesLoadedAt = 0;

async function loadServices() {
  if (SERVICES.length && Date.now() - servicesLoadedAt < 30 * 60_000) return;
  const { data, error } = await admin.rpc("get_service_pricing");
  if (error || !Array.isArray(data)) return;               // keep the stale list rather than none
  SERVICES = data.map((r: any) => ({
    label: String(r.label ?? r.service ?? ""),
    low:  r.typical_low  ?? null,
    high: r.typical_high ?? null,
    unit: r.unit ?? null,
  })).filter((s) => s.label);
  servicesLoadedAt = Date.now();
}

const serviceLabels = () => SERVICES.map((s) => s.label);

function serviceBlock(): string {
  if (!SERVICES.length) return "(catalogue unavailable — do not guess a label, ask what they need and hand off)";
  return SERVICES.map((s) => {
    const r = s.low && s.high ? ` — usually $${s.low} to $${s.high}${s.unit ? " " + s.unit : ""}` : "";
    return `${s.label}${r}`;
  }).join("\n");
}

// ── Prompt injection, reused from chat/index.ts ──────────────────────────────
const INJECTION_PATTERNS = [
  /ignore (previous|all|your) (instructions?|prompt|system)/i,
  /you are now/i,
  /forget (everything|all)/i,
  /new (system|instruction|persona|role)/i,
  /\[system\]/i,
  /DAN mode/i,
  /repeat (your|the) (system )?prompt/i,
];
const isInjection = (t: string) => INJECTION_PATTERNS.some((re) => re.test(t));

// ── System prompt ────────────────────────────────────────────────────────────

function systemPrompt(ctx: {
  channel: string; state: Record<string, unknown>; disclosed: boolean;
  intent: string; turn: number; name?: string | null;
}): string {
  const missing = REQUIRED_SLOTS.filter((k) => !ctx.state[k]);
  return `You are the Freddy Fix It assistant, replying inside a ${ctx.channel === "ig" ? "Instagram" : ctx.channel === "reddit" ? "Reddit" : "Facebook Messenger"} direct message.

WHO WE ARE
Freddy Fix It is a Calgary home and vehicle services marketplace. Someone posts what they need, up to 7 local vetted pros send free estimates, they pick one. The money is held and only released once they confirm the work is done. Posting is free. Contractors pay no lead fees and no pay per lead.

YOUR JOB
Work out who you are talking to, then help.
- CLIENT: something is broken or they want work done. Collect enough to post the job, then call propose_job_post.
- CONTRACTOR: a tradesperson looking for work. Ask their trade and whether they are working in Calgary, then call send_contractor_link.
- NEITHER: answer in one short message and stop. Do not sell to them.

HOW YOU WRITE. These are hard rules, not style preferences.
- You are texting a neighbour. Short. One idea per message.
- Under 25 words per message. Never more than 2 messages in a turn. Separate the two with a blank line.
- NO em dashes. NO semicolons. At most one exclamation mark in the entire conversation.
- NO bullet points, numbered lists, bold, headers, or markdown of any kind. Nobody types markdown into a DM.
- Contractions always. Sentence fragments are fine. Starting lowercase is fine.
- ONE question per turn. Never stack two questions together.
- Answer their question first, then ask yours.
- No emoji unless they used one first, and then at most one back.
- NEVER open with: "Great question", "I'd be happy to help", "Absolutely", "Thanks for reaching out", "Feel free to", "I'm sorry to hear that", "That sounds frustrating".
- NEVER repeat their own words back at them as a summary. Not "So you have a leaky faucet!".
- Never apologise twice in one conversation.
- Never claim to be a person.

${ctx.disclosed ? "You have already said you are an assistant. Do not mention it again." :
`DISCLOSURE: this is your first message. Make clear you are an automated assistant, in voice, in the first few words. Something like "hey, freddy's assistant here". Say it once and never again.`}

WHAT YOU MUST NOT DO
- Never quote a firm price. Only the ballpark ranges below, and always say roughly or around.
- Never promise a specific contractor, a specific date, or that someone will call.
- Never ask for card numbers, banking details, or a SIN.
- Never give step by step instructions for gas, electrical or structural work. Say it needs a licensed pro.
- Never say a job is posted. You do not post jobs. You send a link they tap to confirm.
- If they are angry, describing a dispute, out of the Calgary area, or asking something you cannot answer, call hand_off.
- Gas smell, flooding, or no heat in winter: tell them to call 911 or ATCO first, then call hand_off.

SERVICES. service_needed must be EXACTLY one of these labels, copied character for character:
${serviceBlock()}

POSTING A JOB
Call set_slots the moment you learn something, do not wait until the end.
Needed before you can post: service_needed, job_description, location, preferred_schedule, first_name, and one of email or phone.
${missing.length ? `Still missing: ${missing.join(", ")}.` : "You have everything. Call propose_job_post now."}
Collect it over two or three natural turns. Never interrogate.
After propose_job_post, tell them you will send a link to confirm the details. Nothing more.

CONTEXT
What you know so far: ${JSON.stringify(ctx.state)}
Their name if known: ${ctx.name || "unknown"}
Turn ${ctx.turn} of this conversation.`;
}

const REQUIRED_SLOTS = ["service_needed", "job_description", "location", "preferred_schedule", "first_name"];
const INTENTS = ["client", "contractor", "unknown", "other"];

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "set_slots",
    description: "Record something you learned about the job or the person. Call it as soon as you learn anything, not at the end. Only pass the fields you actually learned.",
    input_schema: {
      type: "object",
      properties: {
        service_needed:     { type: "string", description: "EXACTLY one label from the services list." },
        job_description:    { type: "string", description: "What is wrong, in their words, one or two sentences." },
        location:           { type: "string", description: "Calgary quadrant, neighbourhood, or town." },
        preferred_schedule: { type: "string", description: "When they want it done." },
        first_name:         { type: "string" },
        email:              { type: "string" },
        phone:              { type: "string" },
        intent:             { type: "string", enum: ["client", "contractor", "other"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "propose_job_post",
    description: "Queue this job for a human to approve. Only call once you have every required slot. This does NOT post the job and does NOT create an account.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "send_contractor_link",
    description: "Route a tradesperson to contractor signup. Does not create an account.",
    input_schema: {
      type: "object",
      properties: {
        trade: { type: "string", description: "Their trade in their own words." },
        notes: { type: "string", description: "Anything useful for the owner." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "hand_off",
    description: "Stop replying and get a human. Use for anger, disputes, emergencies, out of area, or anything you cannot answer.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

// ── Deterministic voice sanitizer ────────────────────────────────────────────
// The prompt asks for this voice; the sanitizer guarantees it. A model that
// slips one em dash under load should not put an em dash in front of a customer.

function sanitize(raw: string): string {
  let t = raw;

  // Em/en dash: " to " between numbers, otherwise a comma.
  t = t.replace(/(\d)\s*[—–]\s*(\d)/g, "$1 to $2");
  t = t.replace(/\s*[—–]\s*/g, ", ");

  // Markdown has no business in a DM.
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  t = t.replace(/`{1,3}([^`]*)`{1,3}/g, "$1");
  t = t.replace(/^#{1,6}\s*/gm, "");
  t = t.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "");
  t = t.replace(/\[(.+?)\]\((.+?)\)/g, "$1 $2");

  t = t.replace(/;/g, ",");
  t = t.replace(/!{2,}/g, "!");
  t = t.replace(/\?{2,}/g, "?");
  t = t.replace(/\.{4,}/g, "...");

  // At most one "!" per message.
  const bangs = (t.match(/!/g) || []).length;
  if (bangs > 1) {
    let seen = 0;
    t = t.replace(/!/g, () => (++seen === 1 ? "!" : "."));
  }

  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function splitMessages(raw: string): string[] {
  const parts = sanitize(raw)
    .split(/\n\s*\n/)
    .map((p) => sanitize(p.replace(/\n+/g, " ")))
    .filter(Boolean);
  return parts.slice(0, MAX_MESSAGES_OUT);
}

// ── Claude ───────────────────────────────────────────────────────────────────

async function callClaude(system: string, messages: any[]): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system, tools: TOOLS, messages }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!timingSafeEqual(req.headers.get("x-ff-bot-key") ?? "", await botKey())) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not set" }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const channel = String(body?.channel ?? "").trim();
  const uid     = String(body?.external_user_id ?? "").trim();
  const text    = String(body?.text ?? "").slice(0, MAX_INBOUND_CHARS).trim();
  const name    = body?.display_name ? String(body.display_name).slice(0, 120) : null;
  const extMsg  = body?.external_message_id ? String(body.external_message_id).slice(0, 200) : null;

  if (!["fb", "ig", "reddit"].includes(channel)) return json({ error: "bad channel" }, 400);
  if (!uid)  return json({ error: "external_user_id required" }, 400);
  if (!text) return json({ messages: [], actions: [], handoff: false, duplicate: false });

  // Rate limit per person. Reuses chat_rate_check — it keys on any text, not an IP.
  try {
    const { data: ok } = await admin.rpc("chat_rate_check", {
      p_ip: `social:${channel}:${uid}`, p_limit: RATE_LIMIT, p_window_secs: RATE_WINDOW,
    });
    if (ok === false) {
      return json({ messages: ["give me a sec, i'm catching up."], actions: [], handoff: false, duplicate: false });
    }
  } catch { /* fail open — never take the bot down over the limiter */ }

  await loadServices();

  // One round trip: upsert conversation, record inbound (deduped), get history.
  const { data: turn, error: turnErr } = await admin.rpc("social_upsert_turn", {
    p_channel: channel, p_external_user_id: uid, p_display_name: name,
    p_external_message_id: extMsg, p_text: text,
  });
  if (turnErr || !turn) return json({ error: "could not record turn" }, 500);

  const convoId = turn.conversation_id as string;

  // Meta redelivers on any non-200. Answering twice is how these bots read as broken.
  if (turn.duplicate) return json({ messages: [], actions: [], handoff: false, duplicate: true, conversation_id: convoId });

  // A human has the thread. Stay out of the way.
  if (turn.handed_off) return json({ messages: [], actions: [], handoff: true, duplicate: false, conversation_id: convoId });

  const state: Record<string, any> = (turn.state ?? {}) as any;
  let intent = String(turn.intent ?? "unknown");
  const disclosed = Boolean(turn.disclosed);
  const turnCount = Number(turn.turn_count ?? 1);

  // supabase-js query builders are thenable but are NOT Promises — they have no
  // .catch(). Swallowing failures needs a real try/catch or the handler throws
  // inside the very path that exists to keep it from throwing.
  const quiet = async (p: PromiseLike<unknown>) => { try { await p; } catch { /* ignore */ } };

  const bail = async (msg: string, reason: string) => {
    const out = [msg];
    await quiet(admin.rpc("social_propose_action", {
      p_conversation_id: convoId, p_kind: "handoff", p_payload: { reason },
    }));
    await quiet(admin.rpc("social_record_outbound", {
      p_conversation_id: convoId, p_messages: out, p_state: state,
      p_intent: intent, p_disclosed: true, p_handed_off: true,
    }));
    return json({ messages: out, actions: [{ kind: "handoff", reason }], handoff: true, duplicate: false, conversation_id: convoId });
  };

  if (isInjection(text)) return await bail("let me get a person on this one.", "prompt injection attempt");
  if (turnCount > MAX_TURNS) return await bail("i'll get a person to pick this up with you.", "turn cap reached");

  // ── Conversation ───────────────────────────────────────────────────────────
  const messages: any[] = (turn.history ?? []).map((m: any) => ({
    role: m.direction === "in" ? "user" : "assistant",
    content: String(m.body ?? ""),
  })).filter((m: any) => m.content);

  // The current inbound is already the last history row.
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    messages.push({ role: "user", content: text });
  }
  // Anthropic requires the first message to be from the user.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const actions: any[] = [];
  let handoff = false;
  let replyText = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const sys = systemPrompt({ channel, state, disclosed, intent, turn: turnCount, name });
      const res = await callClaude(sys, messages);

      const textBlocks = (res.content ?? []).filter((b: any) => b.type === "text");
      const toolUses   = (res.content ?? []).filter((b: any) => b.type === "tool_use");

      replyText = textBlocks.map((b: any) => b.text).join("\n\n").trim() || replyText;

      if (!toolUses.length) break;

      messages.push({ role: "assistant", content: res.content });
      const results: any[] = [];

      for (const tu of toolUses) {
        const input = tu.input ?? {};
        let out: any = { ok: true };

        if (tu.name === "set_slots") {
          for (const [k, v] of Object.entries(input)) {
            // The column has a CHECK constraint. An off-list value would abort
            // social_record_outbound and take the whole state write with it.
            if (k === "intent") {
              if (INTENTS.includes(String(v))) intent = String(v);
              continue;
            }
            if (typeof v === "string" && v.trim()) state[k] = v.trim().slice(0, 500);
          }
          // A service_needed outside the catalogue matches no contractor and the
          // request dies silently, so it is rejected here rather than stored.
          if (state.service_needed && serviceLabels().length &&
              !serviceLabels().includes(String(state.service_needed))) {
            const bad = state.service_needed;
            delete state.service_needed;
            out = { ok: false, error: `"${bad}" is not a valid label. Copy one exactly from the services list.` };
          } else {
            out = { ok: true, known: state, still_missing: REQUIRED_SLOTS.filter((k) => !state[k]) };
          }

        } else if (tu.name === "propose_job_post") {
          const missing = REQUIRED_SLOTS.filter((k) => !state[k]);
          if (!state.email && !state.phone) missing.push("email or phone");
          if (missing.length) {
            out = { ok: false, error: `Not yet. Still missing: ${missing.join(", ")}. Ask for one of them.` };
          } else {
            const { data: a, error: e } = await admin.rpc("social_propose_action", {
              p_conversation_id: convoId, p_kind: "post_job", p_payload: state,
            });
            if (e) out = { ok: false, error: "could not queue it" };
            else {
              actions.push({ kind: "post_job", id: a?.id, claim_token: a?.claim_token });
              out = { ok: true, note: "Queued for a human to approve. Tell them you'll send a link to confirm. Do not say it is posted." };
            }
          }

        } else if (tu.name === "send_contractor_link") {
          intent = "contractor";
          const { data: a } = await admin.rpc("social_propose_action", {
            p_conversation_id: convoId, p_kind: "invite_contractor",
            p_payload: { trade: input.trade ?? null, notes: input.notes ?? null, name: state.first_name ?? name },
          });
          actions.push({ kind: "invite_contractor", id: a?.id });
          out = { ok: true, url: `${SITE}/for-contractors`, note: "Give them that link. Mention no lead fees and no pay per lead." };

        } else if (tu.name === "hand_off") {
          handoff = true;
          const { data: a } = await admin.rpc("social_propose_action", {
            p_conversation_id: convoId, p_kind: "handoff", p_payload: { reason: input.reason ?? "unspecified" },
          });
          actions.push({ kind: "handoff", id: a?.id, reason: input.reason });
          out = { ok: true, note: "A person will pick it up. Say so in one short line and stop." };

        } else {
          out = { ok: false, error: "unknown tool" };
        }

        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      }

      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    console.error("social-bot-brain:", String(e));
    return await bail("i'm having trouble on my end. let me get a person.", `model error: ${String(e).slice(0, 200)}`);
  }

  const outMessages = splitMessages(replyText);
  if (!outMessages.length) outMessages.push("still with you, one sec.");

  // p_handed_off is null unless we are handing off — the RPC coalesces, so null
  // means "leave it as it was" rather than un-handing-off a live escalation.
  await quiet(admin.rpc("social_record_outbound", {
    p_conversation_id: convoId, p_messages: outMessages, p_state: state,
    p_intent: intent, p_disclosed: true, p_handed_off: handoff ? true : null,
  }));

  return json({
    messages: outMessages, actions, handoff, duplicate: false,
    conversation_id: convoId, intent, state,
  });
});
