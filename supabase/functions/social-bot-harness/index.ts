// Supabase Edge Function: social-bot-harness
//
// Replays FIXTURES against social-bot-brain and grades the result. It lives as an
// edge function rather than a local script for one blunt reason: the brain is
// only reachable from inside the platform, so a script on a laptop or in a build
// sandbox cannot call it at all.
//
//   POST /social-bot-harness        header: x-ff-bot-key: <same shared secret>
//   { only?: string[], concurrency?: number, cleanup?: boolean, verbose?: boolean }
//
// It talks to the brain over HTTP exactly the way ManyChat will, using real
// external_user_ids prefixed HARNESS_ and a fresh run id per invocation. Nothing
// is stubbed, so dedupe, state accumulation, the tool loop and the sanitizer are
// all exercised for real. Rows are deleted afterwards unless cleanup:false.
//
// The linter is the point. The system prompt ASKS for the voice; only a
// deterministic check tells you whether it arrived.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { FIXTURES, type Fixture } from "./fixtures.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOCIAL_BOT_KEY   = Deno.env.get("SOCIAL_BOT_KEY") ?? "";
const BRAIN_URL        = `${SUPABASE_URL}/functions/v1/social-bot-brain`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ff-bot-key",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

async function botKey(): Promise<string> {
  if (SOCIAL_BOT_KEY) return SOCIAL_BOT_KEY;
  const { data } = await admin.rpc("social_bot_secret");
  return typeof data === "string" ? data : "";
}

// ── Voice linter ─────────────────────────────────────────────────────────────

const BANNED_OPENERS = [
  "great question", "i'd be happy to help", "i would be happy to help", "absolutely",
  "thanks for reaching out", "feel free to", "i'm sorry to hear that", "i am sorry to hear",
  "that sounds frustrating", "certainly", "of course!", "happy to help",
];

const HEDGES = ["roughly", "around", "about", "usually", "typically", "ballpark", "depends", "range", "starting"];

const POSTED_CLAIMS = [
  "job is posted", "i've posted", "i have posted", "your job is live", "posted your job",
  "i posted", "it's posted", "job's posted",
];

const MAX_WORDS = 25;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Per-message rules. Returns violation labels. */
function lintMessage(m: string): string[] {
  const v: string[] = [];
  const lower = m.toLowerCase();

  if (/[—–]/.test(m)) v.push("em_or_en_dash");
  if (/;/.test(m)) v.push("semicolon");
  if (/\*\*|^#{1,6}\s|^\s*[-*•]\s+|^\s*\d+[.)]\s+/m.test(m)) v.push("markdown");
  if (/\[.+?\]\(.+?\)/.test(m)) v.push("markdown_link");
  if (wordCount(m) > MAX_WORDS) v.push(`too_long_${wordCount(m)}w`);
  if ((m.match(/\?/g) || []).length > 1) v.push("stacked_questions");
  if (BANNED_OPENERS.some((b) => lower.startsWith(b))) v.push("banned_opener");
  if (POSTED_CLAIMS.some((p) => lower.includes(p))) v.push("claims_job_posted");
  if (/\bi'?m a (person|human|real)\b|\bnot a bot\b/.test(lower)) v.push("claims_to_be_human");
  if (/\b(sin|social insurance)\b|\bcard number\b|\bcvv\b/.test(lower)) v.push("asks_for_sensitive");

  // A dollar figure with no hedge anywhere in the message reads as a quote.
  if (/\$\s?\d/.test(m) && !HEDGES.some((h) => lower.includes(h))) v.push("firm_price");

  return v;
}

/** Whole-conversation rules. */
function lintConversation(all: string[]): string[] {
  const v: string[] = [];
  const joined = all.join(" ");
  const bangs = (joined.match(/!/g) || []).length;
  if (bangs > 1) v.push(`exclamations_${bangs}`);

  const sorries = (joined.toLowerCase().match(/\b(sorry|apologi[sz]e)\b/g) || []).length;
  if (sorries > 1) v.push(`apologies_${sorries}`);

  // Disclosure has to happen once, in the first reply, and never again.
  const disclosureRe = /\b(assistant|automated|i'?m a bot|freddy'?s bot)\b/i;
  const disclosed = all.filter((m) => disclosureRe.test(m)).length;
  if (all.length && !disclosureRe.test(all[0])) v.push("no_disclosure_first_message");
  if (disclosed > 1) v.push(`disclosed_${disclosed}x`);

  return v;
}

// ── Expectation checks ───────────────────────────────────────────────────────

function checkExpectations(f: Fixture, r: { replies: string[]; intent: string; state: any; actions: string[]; handoff: boolean }): string[] {
  const fail: string[] = [];
  const e = f.expect;
  const joined = r.replies.join(" ").toLowerCase();

  if (e.intent && r.intent !== e.intent) fail.push(`intent=${r.intent} want ${e.intent}`);

  if (e.action) {
    if (e.action === "none") {
      if (r.actions.length) fail.push(`actions=[${r.actions}] want none`);
    } else if (!r.actions.includes(e.action)) {
      fail.push(`missing action ${e.action} (got [${r.actions}])`);
    }
  }

  if (e.handoff === true && !r.handoff) fail.push("no handoff");
  if (e.handoff === false && r.handoff) fail.push("unexpected handoff");

  for (const k of e.slots ?? []) {
    if (!r.state?.[k]) fail.push(`slot ${k} empty`);
  }

  for (const bad of e.mustNotSay ?? []) {
    if (joined.includes(bad.toLowerCase())) fail.push(`said "${bad}"`);
  }

  if (e.mustSay?.length && !e.mustSay.some((s) => joined.includes(s.toLowerCase()))) {
    fail.push(`said none of [${e.mustSay.join(", ")}]`);
  }

  return fail;
}

// ── Runner ───────────────────────────────────────────────────────────────────

type Turn = { in: string; out: string[]; ms: number; error?: string };

async function runFixture(f: Fixture, runId: string, key: string) {
  const uid = `HARNESS_${runId}_${f.id}`;
  const turns: Turn[] = [];
  const actions = new Set<string>();
  let intent = "unknown";
  let state: any = {};
  let handoff = false;
  let hardError: string | undefined;

  for (let i = 0; i < f.turns.length; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(BRAIN_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ff-bot-key": key },
        body: JSON.stringify({
          channel: f.channel,
          external_user_id: uid,
          display_name: f.name ?? null,
          external_message_id: `${uid}_m${i}`,
          text: f.turns[i],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        hardError = `HTTP ${res.status} ${JSON.stringify(body).slice(0, 160)}`;
        turns.push({ in: f.turns[i], out: [], ms: Date.now() - t0, error: hardError });
        break;
      }
      for (const a of body.actions ?? []) if (a?.kind) actions.add(a.kind);
      if (body.intent) intent = body.intent;
      if (body.state) state = body.state;
      if (body.handoff) handoff = true;
      turns.push({ in: f.turns[i], out: body.messages ?? [], ms: Date.now() - t0 });

      // Once a human has it, the bot goes quiet. Sending more turns proves nothing.
      if (body.handoff) break;
    } catch (e) {
      hardError = String(e).slice(0, 200);
      turns.push({ in: f.turns[i], out: [], ms: Date.now() - t0, error: hardError });
      break;
    }
  }

  const replies = turns.flatMap((t) => t.out);
  const msgViolations: Record<string, string[]> = {};
  for (const m of replies) {
    const v = lintMessage(m);
    if (v.length) msgViolations[m.slice(0, 70)] = v;
  }
  const convoViolations = lintConversation(replies);
  const expectFails = hardError ? [`ERROR ${hardError}`] : checkExpectations(f, {
    replies, intent, state, actions: [...actions], handoff,
  });

  return {
    id: f.id,
    why: f.why,
    uid,
    ok: !expectFails.length && !convoViolations.length && !Object.keys(msgViolations).length,
    intent,
    actions: [...actions],
    handoff,
    slots: Object.keys(state ?? {}),
    expectFails,
    voice: { convo: convoViolations, messages: msgViolations },
    turns,
  };
}

/** Bounded parallelism. All 30 at once would hit the model's rate limit and
 *  produce failures that are about us, not about the bot. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Constant-time, because this endpoint checks the SAME secret the brain does.
  // A plain === here would leak the brain's key byte by byte and undo its care.
  const key = await botKey();
  const given = new TextEncoder().encode(req.headers.get("x-ff-bot-key") ?? "");
  const want = new TextEncoder().encode(key);
  let diff = key ? 0 : 1;
  if (given.length !== want.length) diff = 1;
  else for (let i = 0; i < given.length; i++) diff |= given[i] ^ want[i];
  if (diff !== 0) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const only: string[] | null = Array.isArray(body?.only) && body.only.length ? body.only : null;
  const concurrency = Math.max(1, Math.min(10, Number(body?.concurrency ?? 6)));
  const cleanup = body?.cleanup !== false;
  const verbose = body?.verbose === true;

  const chosen = only ? FIXTURES.filter((f) => only.includes(f.id)) : FIXTURES;
  if (!chosen.length) return json({ error: "no fixtures matched" }, 400);

  const runId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();

  const results = await pool(chosen, concurrency, (f) => runFixture(f, runId, key));

  // Tally which voice rules are breaking, which is the number that actually
  // tells you what to change in the prompt.
  const ruleCounts: Record<string, number> = {};
  for (const r of results) {
    for (const v of r.voice.convo) {
      const k = v.replace(/_\d+.*$/, "_N");
      ruleCounts[k] = (ruleCounts[k] ?? 0) + 1;
    }
    for (const vs of Object.values(r.voice.messages)) {
      for (const v of vs) {
        const k = v.replace(/_\d+w$/, "_Nw");
        ruleCounts[k] = (ruleCounts[k] ?? 0) + 1;
      }
    }
  }

  let deleted = 0;
  if (cleanup) {
    const { data } = await admin
      .from("social_conversations")
      .delete()
      .like("external_user_id", `HARNESS_${runId}_%`)
      .select("id");
    deleted = data?.length ?? 0;
  }

  const passed = results.filter((r) => r.ok).length;

  return json({
    run_id: runId,
    fixtures: chosen.length,
    passed,
    failed: chosen.length - passed,
    seconds: Math.round((Date.now() - t0) / 1000),
    rule_counts: ruleCounts,
    cleaned_up: deleted,
    results: results.map((r) => (verbose ? r : {
      id: r.id, ok: r.ok, intent: r.intent, actions: r.actions, handoff: r.handoff,
      expectFails: r.expectFails, voice: r.voice,
      replies: r.turns.flatMap((t) => t.out),
    })),
  });
});
