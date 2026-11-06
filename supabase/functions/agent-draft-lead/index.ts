// Supabase Edge Function: agent-draft-lead
//
// Drafts the follow-up message for ONE lead-response finding, on demand.
//
//   POST /agent-draft-lead   { action_id: uuid }
//   → { ok: true, draft: { text, email_subject, email_body, model } }
//
// WHY THIS IS A SEPARATE FUNCTION FROM THE AGENT ITSELF
// The detector, agent_lead_response_run(), is a plain Postgres function on
// pg_cron with no network client at all, so it cannot spend a token even by
// accident. Drafting needs a model, so it has to live out here — but it runs
// only when the owner clicks "Draft message" on a specific lead. That means the
// spend lands on leads he has already decided to chase, not on every lead the
// cron happens to find, and a quiet day costs nothing. Keep that split: do not
// move drafting into the scheduled run.
//
// verify_jwt = true, which is NOT authentication — the anon key is a valid
// project-signed JWT and ships in the public JS bundle. The admin check below,
// in code, is the gate.
//
// NO SECOND FACTOR, deliberately, unlike admin-message / admin-delete-account /
// admin-update-email. Those three are irreversible (an email cannot be un-sent,
// an account cannot be un-deleted). This one writes a draft onto a payload: it
// is reversible, re-runnable, and sends nothing to anybody. What a stolen
// session could do here is run up a token bill, so that is what is capped —
// MAX_PER_HOUR below — rather than gated behind a sign-in code the owner would
// have to clear every time he wanted a draft.
//
// Secrets: ANTHROPIC_API_KEY (already set for social-bot-brain).
// Optional: LEAD_DRAFT_MODEL. SUPABASE_URL / SERVICE_ROLE / ANON auto-injected.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY          = Deno.env.get("SUPABASE_ANON_KEY")!;

// Haiku only. The registry row declares model='haiku' as this agent's CEILING,
// and every candidate here is a Haiku, so a fallback can never quietly breach
// it. The fallback exists because neither model string has been exercised
// against this project's key yet — social-bot-brain names one but has never
// run — and a button that reports "model not found" to a non-technical owner is
// a broken button. Retried ONLY on a 404 (model not found), never on a 401, a
// 429 or a 500, so a billing or rate problem fails loudly instead of being
// retried three times.
const MODEL_CANDIDATES = [
  Deno.env.get("LEAD_DRAFT_MODEL") ?? "",
  "claude-haiku-5-5",
  "claude-3-5-haiku-latest",
].filter(Boolean);

const MAX_PER_HOUR = 30;   // per admin. Generous for real use, useless for abuse.

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ── The prompt ───────────────────────────────────────────────────────────────
// One call, both outputs. A text and an email are the same message in two
// lengths, so splitting them into two calls would double the spend to re-send
// the same context.

const KIND_BRIEF: Record<string, string> = {
  stale_estimates:
    "This client posted a request, real contractors sent estimates, and the client never picked one. " +
    "The estimates are still there and still valid to look at. Nothing went wrong on their end — " +
    "most likely they got busy. The goal is to get them to open the link and choose a pro.",
  stranded_request:
    "Something went wrong on OUR side: this client's request lost its job record, so their estimates " +
    "stopped being visible to them for a while. It is fixed now. Apologise plainly, once, without " +
    "technical detail or excuses, and point them at the link to pick a pro.",
  unreachable_trade:
    "Nobody on the platform currently covers the trade this client asked for, so they never got any " +
    "estimates. Be honest about that. Do not promise a date. Offer to let them know when we have " +
    "someone, and do not pretend estimates are coming.",
  no_bids_exhausted:
    "This request went out to contractors more than once and nobody bid. Be honest that we could not " +
    "find them someone yet. Ask whether the job is still needed, and whether anything about it has " +
    "changed (timing, budget, scope) that might help us match it.",
};

function systemPrompt(): string {
  return `You write short follow-up messages for Freddy Fix It, a Calgary home services marketplace. The owner, Freddy, sends these himself to one customer at a time. You are drafting on his behalf — he will read it, edit it, and send it.

HOW HE SOUNDS
- A local tradesman texting a customer back. Warm, direct, zero corporate voice.
- Contractions always. Short sentences. Plain words.
- NO em dashes. NO semicolons. NO bullet points, headers, bold, or markdown of any kind.
- No more than one exclamation mark, and usually none.
- Never open with "I hope this finds you well", "I wanted to reach out", "Just following up", "Thanks for your patience", or "I'm sorry to hear".
- Never use the words escrow, platform, leads, pipeline, or onboarding.
- Say "held securely", never "escrow", if money comes up at all.
- Do not invent a price, a date, a contractor's name, or a discount.
- Do not claim anyone will call them.
- Sign off as Freddy. No title, no company signature block.

WHAT YOU PRODUCE
A text message and an email saying the same thing at different lengths.
- text: under 220 characters, one or two sentences, includes the link if there is one. It must read like a real person typed it on a phone.
- email_subject: under 55 characters. No emoji. Not clickbait. Something a real person would write.
- email_body: 40 to 90 words. Plain text, not HTML. Line breaks are fine. Include the link on its own line if there is one.

Return ONLY a JSON object, no prose around it, no code fence:
{"text": "...", "email_subject": "...", "email_body": "..."}`;
}

function userPrompt(kind: string, p: Record<string, unknown>): string {
  const brief = KIND_BRIEF[kind] ?? "Follow up with this customer about their request.";
  const first = String(p.client ?? "").trim().split(/\s+/)[0] || "there";
  const lines = [
    `SITUATION: ${brief}`,
    "",
    `Customer's first name: ${first}`,
    `What they asked for: ${String(p.service ?? "unknown")}`,
    `When they posted it: ${String(p.posted ?? "unknown")}`,
  ];
  if (p.description) lines.push(`How they described the job: ${String(p.description).slice(0, 400)}`);
  if (p.detail)      lines.push(`Extra context: ${String(p.detail).slice(0, 300)}`);
  if (p.link && String(p.link).startsWith("http")) {
    lines.push(`Link to include: ${String(p.link)}`);
  } else {
    lines.push("There is NO link to include. Do not invent one.");
  }
  lines.push("", "Draft the text and the email now. JSON only.");
  return lines.join("\n");
}

// ── Anthropic ────────────────────────────────────────────────────────────────

type Drafted = { text: string; email_subject: string; email_body: string; model: string };

function parseDraft(raw: string): Omit<Drafted, "model"> | null {
  // A model told "JSON only" still occasionally wraps it in a fence or a
  // sentence. Pull the outermost object rather than failing the whole click.
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  s = s.slice(a, b + 1);
  let o: any;
  try { o = JSON.parse(s); } catch { return null; }
  const text  = String(o?.text ?? "").trim();
  const subj  = String(o?.email_subject ?? "").trim();
  const body  = String(o?.email_body ?? "").trim();
  if (!text || !subj || !body) return null;
  return { text: text.slice(0, 600), email_subject: subj.slice(0, 160), email_body: body.slice(0, 2500) };
}

// Belt and braces on the voice rules the prompt asks for, same reasoning as
// social-bot-brain's sanitizer: a model that slips an em dash under load should
// not put an em dash in front of a customer.
function sanitize(t: string): string {
  let s = t;
  s = s.replace(/(\d)\s*[—–]\s*(\d)/g, "$1 to $2").replace(/\s*[—–]\s*/g, ", ");
  s = s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  s = s.replace(/^#{1,6}\s*/gm, "").replace(/^\s*(?:[-*•])\s+/gm, "");
  s = s.replace(/;/g, ",").replace(/!{2,}/g, "!");
  const bangs = (s.match(/!/g) || []).length;
  if (bangs > 1) { let seen = 0; s = s.replace(/!/g, () => (++seen === 1 ? "!" : ".")); }
  return s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function draft(kind: string, payload: Record<string, unknown>): Promise<Drafted> {
  let lastErr = "no model candidates configured";

  for (const model of MODEL_CANDIDATES) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system: systemPrompt(),
        messages: [{ role: "user", content: userPrompt(kind, payload) }],
      }),
    });

    if (res.status === 404) {                    // this model string, not this key
      lastErr = `model ${model} not available on this key`;
      continue;
    }
    if (!res.ok) {
      // 401 (bad key), 429 (rate), 5xx — a different model will not help, and
      // retrying would just spend three times to fail once.
      throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const body = await res.json();
    const raw  = (body?.content ?? []).filter((c: any) => c?.type === "text")
                   .map((c: any) => c.text).join("\n").trim();
    const d    = parseDraft(raw);
    if (!d) { lastErr = `${model} did not return usable JSON`; continue; }

    return {
      text:          sanitize(d.text),
      email_subject: sanitize(d.email_subject),
      email_body:    sanitize(d.email_body),
      model,
    };
  }
  throw new Error(lastErr);
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ ok: false, error: "POST only" }, 405);

  let runId: string | null = null;

  try {
    // ── Admin gate (in code — verify_jwt proves nothing) ────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ ok: false, error: "missing auth" }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await asUser.auth.getUser();
    const uid = ures?.user?.id;
    if (!uid) return json({ ok: false, error: "not signed in" }, 401);
    const { data: me } = await admin.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (me?.role !== "admin") return json({ ok: false, error: "not authorized" }, 403);

    // Resolve the caller BEFORE reading the target row, so a 404 here can't be
    // used to probe whether an action id exists.
    const body = await req.json().catch(() => ({}));
    const actionId = String((body as any)?.action_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(actionId)) return json({ ok: false, error: "action_id required" }, 400);

    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "The drafting key isn't set up yet — ANTHROPIC_API_KEY is missing." }, 503);
    }

    // Spend cap, not a security gate. Fails OPEN: a limiter that takes the
    // feature down over its own bug is worse than a few extra drafts.
    try {
      const { data: ok } = await admin.rpc("chat_rate_check", {
        p_ip: `lead-draft:${uid}`, p_limit: MAX_PER_HOUR, p_window_secs: 3600,
      });
      if (ok === false) {
        return json({ ok: false, error: `That's ${MAX_PER_HOUR} drafts in an hour. Give it a few minutes.` }, 429);
      }
    } catch { /* fail open */ }

    const { data: ctx, error: ctxErr } = await admin.rpc("agent_lead_draft_context", { p_action_id: actionId });
    if (ctxErr) return json({ ok: false, error: "Couldn't load that lead." }, 500);
    if (!(ctx as any)?.ok) return json({ ok: false, error: (ctx as any)?.reason || "Couldn't draft for that lead." }, 409);

    const kind    = String((ctx as any).kind ?? "");
    const payload = ((ctx as any).payload ?? {}) as Record<string, unknown>;

    // The run row is the only evidence this agent spent anything, so it is
    // opened BEFORE the model call and closed on both paths.
    const { data: rid } = await admin.rpc("agent_run_start", { p_agent: "lead-response", p_trigger: "manual" });
    runId = (rid as string) ?? null;

    const d = await draft(kind, payload);

    const { data: saved, error: saveErr } = await admin.rpc("agent_lead_draft_save", {
      p_action_id: actionId,
      p_draft: { text: d.text, email_subject: d.email_subject, email_body: d.email_body, model: d.model },
    });
    if (saveErr || !(saved as any)?.ok) {
      // The draft exists and cost real money; hand it back even though it did
      // not persist, and say so rather than pretending it was stored.
      if (runId) {
        await admin.rpc("agent_run_finish", {
          p_run_id: runId, p_status: "warn", p_summary: `Drafted a ${kind} follow-up but could not save it`,
          p_details: { model_calls: 1, model_used: d.model, kind, saved: false }, p_error: null,
        }).then(() => {}, () => {});
      }
      return json({ ok: true, draft: d, saved: false, note: "Draft is below, but it didn't save — copy it now." });
    }

    if (runId) {
      await admin.rpc("agent_run_finish", {
        p_run_id: runId, p_status: "ok", p_summary: `Drafted a ${kind} follow-up for the owner to send`,
        p_details: { model_calls: 1, model_used: d.model, kind, saved: true }, p_error: null,
      }).then(() => {}, () => {});
    }

    return json({ ok: true, draft: d, saved: true });

  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("agent-draft-lead:", msg);
    // Close the run as an error rather than leaving it open — errors_7d in
    // admin_agent_overview is what surfaces this to the owner.
    if (runId) {
      await admin.rpc("agent_run_finish", {
        p_run_id: runId, p_status: "error", p_summary: "Drafting failed",
        p_details: { model_calls: 0 }, p_error: msg,
      }).then(() => {}, () => {});
    }
    return json({ ok: false, error: msg }, 502);
  }
});
