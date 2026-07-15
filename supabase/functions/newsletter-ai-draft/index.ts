// newsletter-ai-draft v1 — AI-drafted newsletter issues (DORMANT until the
// ANTHROPIC_API_KEY secret is set; returns {ok:true,configured:false} until then).
// Admin-gated: caller must be a logged-in admin (anon-key getUser → profiles.role).
// Payload: { audience: 'client'|'contractor', topic?: string }.
// Drafts ONE new issue in the established bank style and inserts it into
// newsletter_content as status='draft' (created_by='ai', seq = max+1). Drafts are
// NEVER auto-sent — the owner reviews and flips status to 'queued' to schedule it.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SYSTEM = "You write the weekly email newsletter for Freddy Fix It, a Calgary home-services " +
  "marketplace (freddyfixit.ca). Clients post a request and get up to 7 estimates from vetted local pros. " +
  "Style: warm, plain-spoken, genuinely useful, Calgary-specific (weather, seasons, chinooks, hail), " +
  "~180-250 words of markdown body (use **bold**, - bullets, short paragraphs), ONE soft call-to-action " +
  "referencing freddyfixit.ca, never pushy, no fabricated statistics, and always say 'estimate' never 'quote'. " +
  "End with a one-line 'This week:' action the reader can take.";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  // Admin gate.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const anonClient = createClient(SB_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: userData } = await anonClient.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: prof } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
  if (prof?.role !== "admin") return json({ ok: false, error: "admin only" }, 403);

  if (!ANTHROPIC_KEY) return json({ ok: true, configured: false, note: "Set the ANTHROPIC_API_KEY secret to enable AI drafting." });

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { /* ignore */ }
  const audience = payload.audience === "contractor" ? "contractor" : "client";
  const topic = typeof payload.topic === "string" ? payload.topic.slice(0, 300) : "";

  // Recent subjects so the model avoids repeats.
  const { data: recent } = await sb.from("newsletter_content")
    .select("subject").eq("audience", audience)
    .order("seq", { ascending: false }).limit(20);
  const covered = (recent ?? []).map((r) => r.subject).join("; ");

  const audienceLine = audience === "contractor"
    ? "Audience: Calgary trade contractors and handymen on the platform (business advice — winning bids, pricing, reviews, getting paid, seasonal demand)."
    : "Audience: Calgary home and vehicle owners (practical maintenance tips, seasonal prep, what things cost, when to call a pro).";

  const userMsg = audienceLine +
    (topic ? " Requested topic: " + topic + "." : " Pick a fresh, seasonally-relevant topic.") +
    " Already covered (do NOT repeat): " + covered +
    '. Respond with ONLY a JSON object: {"subject": "...", "preheader": "...", "body_md": "...", "blog_title": "..."}';

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    return json({ ok: false, error: "anthropic " + resp.status, detail: errBody.slice(0, 400) }, 502);
  }
  const data = await resp.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return json({ ok: false, error: "no JSON in model output", raw: text.slice(0, 400) }, 502);
  let draft: { subject?: string; preheader?: string; body_md?: string; blog_title?: string };
  try { draft = JSON.parse(match[0]); } catch { return json({ ok: false, error: "unparseable JSON", raw: text.slice(0, 400) }, 502); }
  if (!draft.subject || !draft.body_md) return json({ ok: false, error: "draft missing subject/body" }, 502);

  const { data: maxRow } = await sb.from("newsletter_content")
    .select("seq").eq("audience", audience)
    .order("seq", { ascending: false }).limit(1).maybeSingle();
  const seq = (maxRow?.seq ?? 0) + 1;

  const { error: insErr } = await sb.from("newsletter_content").insert({
    audience,
    seq,
    subject: draft.subject.slice(0, 200),
    preheader: (draft.preheader ?? "").slice(0, 200),
    body_md: draft.body_md,
    blog_title: draft.blog_title ? draft.blog_title.slice(0, 200) : null,
    blog_tag: audience === "contractor" ? "Contractor" : "Tips",
    status: "draft",
    created_by: "ai",
  });
  if (insErr) return json({ ok: false, error: insErr.message }, 500);

  return json({ ok: true, configured: true, audience, seq, subject: draft.subject, status: "draft" });
});
