// Supabase Edge Function: meta-lead-scout
// Watches Freddy Fix It's OWN Facebook Page + Instagram business account for
// (a) people asking about repairs/pricing/booking in comments or Page DMs and
// (b) contractors asking to join/work, drafts a reply for each, and emails an
// approval digest to the admin. NOTHING is ever posted automatically — the
// owner reviews and replies by hand from the Page.
//
// Meta's API only permits automation on your own Page/IG account — this fn
// never scans other people's posts, groups, or profiles (that would violate
// Meta's Platform Terms and risk the Page).
//
// DORMANT until secrets are set: META_PAGE_TOKEN (long-lived Page access
// token) + META_PAGE_ID (+ optional META_IG_ID for Instagram). Setup guide:
// ~/Desktop/Website/Meta-Setup-Guide.docx. Once configured, schedule via
// pg_cron like reddit-lead-scout was planned (every 2h, net.http_post anon).
// Test: POST { "test": true } → runs a scan and always sends a digest email.
// verify_jwt = false (called by the DB, not users).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_PAGE_TOKEN  = Deno.env.get("META_PAGE_TOKEN") ?? "";
const META_PAGE_ID     = Deno.env.get("META_PAGE_ID") ?? "";
const META_IG_ID       = Deno.env.get("META_IG_ID") ?? "";
const FROM_EMAIL  = "noreply@freddyfixit.ca";
const ADMIN_EMAIL = "hello@freddyfixit.ca";
const GRAPH = "https://graph.facebook.com/v23.0";
const MAX_LEADS_PER_RUN = 12;
const MAX_AGE_HOURS = 48;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Classification (own-Page audience — looser than the Reddit scout) ───────
const CLIENT_ASK = /(how much|price|pricing|cost|estimate|book(ing)?|available|availab\w*|do you (do|fix|service|cover|come|install|repair)|can you (fix|help|come|do)|need (a|an|some(one)?|help)|looking for|interested in|dm me|pm me|send me (a )?(quote|estimate|price)|broke|broken|leak\w*|not working)/i;
const CONTRACTOR_ASK = /(hiring|join(ing)? (you|freddy|the (platform|team))|sign ?(me )?up|how do i (join|register|sign up)|work (with|for) you|apply|subcontract\w*|i'?m a (plumber|electrician|handyman|contractor|roofer|painter|landscaper|tradesman)|looking for (work|jobs|clients)|take on (more )?(work|jobs))/i;

type Lead = {
  external_id: string; subreddit: string; author: string; title: string;
  url: string; snippet: string; lead_type: "client" | "contractor"; drafted_reply: string;
};

// Replies are FROM the official Freddy account — no disclosure line needed.
const CLIENT_REPLY = `Thanks for reaching out! The fastest way is to post the job (free) at freddyfixit.ca — up to 7 vetted Calgary pros send you free estimates, and your payment is only released once you approve the finished work. Happy to answer anything here too!`;
const CONTRACTOR_REPLY = `We'd love to have you! Joining is free at freddyfixit.ca/for-contractors — no lead fees or pay-per-lead, job alerts matched to your trade and area, and the payout releases as soon as the client confirms the work. Any questions, just ask.`;

function classify(text: string): "client" | "contractor" | null {
  if (CONTRACTOR_ASK.test(text)) return "contractor";
  if (CLIENT_ASK.test(text)) return "client";
  return null;
}

const scanStatus: Record<string, string> = {};
const cutoffMs = () => Date.now() - MAX_AGE_HOURS * 3600 * 1000;

async function graphGet(path: string, params: string): Promise<any | null> {
  const key = path.split("/").pop() || path;
  try {
    const res = await fetch(`${GRAPH}/${path}?${params}&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`);
    const json = await res.json().catch(() => ({}));
    scanStatus[key] = `HTTP ${res.status}${json?.error ? " " + String(json.error.message).slice(0, 120) : ""}`;
    if (!res.ok) return null;
    return json;
  } catch (e) {
    scanStatus[key] = `ERR ${String(e).slice(0, 120)}`;
    return null;
  }
}

function mkLead(
  external_id: string, source: string, author: string, parent: string,
  url: string, text: string,
): Lead | null {
  if (!external_id || !text) return null;
  const lead_type = classify(text);
  if (!lead_type) return null;
  return {
    external_id, subreddit: source, author: author || "unknown",
    title: (parent || text).replace(/\s+/g, " ").slice(0, 300),
    url, snippet: text.replace(/\s+/g, " ").slice(0, 280), lead_type,
    drafted_reply: lead_type === "client" ? CLIENT_REPLY : CONTRACTOR_REPLY,
  };
}

// 1) Comments on the Page's own posts.
async function scanPageComments(): Promise<Lead[]> {
  const json = await graphGet(`${META_PAGE_ID}/feed`,
    "limit=25&fields=id,message,permalink_url,comments.limit(50){id,message,from,created_time,permalink_url}");
  const out: Lead[] = [];
  for (const post of json?.data ?? []) {
    for (const c of post?.comments?.data ?? []) {
      if (!c?.id || c?.from?.id === META_PAGE_ID) continue; // skip our own replies
      if (new Date(c.created_time).getTime() < cutoffMs()) continue;
      const lead = mkLead(String(c.id), "fb-comment", c?.from?.name ?? "",
        String(post.message ?? ""), String(c.permalink_url ?? post.permalink_url ?? ""),
        String(c.message ?? ""));
      if (lead) out.push(lead);
    }
  }
  return out;
}

// 2) Page DMs (needs pages_messaging — tolerated if the permission is missing).
async function scanPageDMs(): Promise<Lead[]> {
  const json = await graphGet(`${META_PAGE_ID}/conversations`,
    "limit=25&fields=id,link,updated_time,messages.limit(5){id,message,from,created_time}");
  const out: Lead[] = [];
  for (const convo of json?.data ?? []) {
    for (const m of convo?.messages?.data ?? []) {
      if (!m?.id || m?.from?.id === META_PAGE_ID) continue;
      if (new Date(m.created_time).getTime() < cutoffMs()) continue;
      const lead = mkLead(String(m.id), "fb-dm", m?.from?.name ?? "",
        "Page message", convo?.link ? `https://www.facebook.com${convo.link}` : "https://business.facebook.com/latest/inbox",
        String(m.message ?? ""));
      if (lead) { out.push(lead); break; } // one lead per conversation
    }
  }
  return out;
}

// 3) Comments on the IG business account's posts.
async function scanIgComments(): Promise<Lead[]> {
  if (!META_IG_ID) return [];
  const json = await graphGet(`${META_IG_ID}/media`,
    "limit=25&fields=id,caption,permalink,comments.limit(50){id,text,username,timestamp}");
  const out: Lead[] = [];
  for (const media of json?.data ?? []) {
    for (const c of media?.comments?.data ?? []) {
      if (!c?.id) continue;
      if (new Date(c.timestamp).getTime() < cutoffMs()) continue;
      const lead = mkLead(String(c.id), "ig-comment", c?.username ?? "",
        String(media.caption ?? ""), String(media.permalink ?? ""), String(c.text ?? ""));
      if (lead) out.push(lead);
    }
  }
  return out;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>\"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const SOURCE_LABEL: Record<string, string> = {
  "fb-comment": "Facebook comment", "fb-dm": "Facebook message", "ig-comment": "Instagram comment",
};

function digestHtml(leads: Array<Lead & { id: string }>): string {
  const cards = leads.map((l) => `
    <div style="background:#151d2e;border:1px solid ${l.lead_type === "client" ? "#ea6b14" : "#3b82f6"};border-radius:10px;padding:1rem;margin:0 0 1rem;">
      <p style="margin:0 0 .35rem;font-size:12px;letter-spacing:.5px;color:${l.lead_type === "client" ? "#ea6b14" : "#60a5fa"};font-weight:700;">
        ${l.lead_type === "client" ? "CLIENT LEAD" : "CONTRACTOR LEAD"} — ${esc(SOURCE_LABEL[l.subreddit] ?? l.subreddit)} · ${esc(l.author)}</p>
      <p style="margin:.25rem 0;font-size:13px;color:#9aa4bf;">On: ${esc(l.title)}</p>
      <p style="margin:.25rem 0 .75rem;font-size:15px;font-weight:600;color:#f0f4ff;">"${esc(l.snippet)}${l.snippet.length >= 280 ? "…" : ""}"</p>
      <p style="margin:.5rem 0 .25rem;font-size:12px;color:#9aa4bf;">Suggested reply (post it from the Freddy account):</p>
      <div style="background:#0f1526;border-radius:8px;padding:.75rem;font-size:13px;line-height:1.5;color:#e2e8f0;">${esc(l.drafted_reply)}</div>
      <a href="${esc(l.url)}" style="display:inline-block;margin-top:.75rem;padding:.5rem 1rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open →</a>
    </div>`).join("");
  return `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:1.5rem;border-radius:12px;">
    <h2 style="color:#ea6b14;margin:0 0 .35rem;">Lead scout — ${leads.length} new lead${leads.length === 1 ? "" : "s"} on Facebook/Instagram</h2>
    <p style="margin:0 0 1.25rem;font-size:13px;color:#9aa4bf;">Nothing has been posted. Review each one — open it, tweak the suggested reply so it sounds like you, and reply from the Freddy Page/account.</p>
    ${cards || `<p style="font-size:14px;color:#9aa4bf;">No matching comments or messages this scan — the bot is running fine, there was just nothing to flag.</p>`}
    <p style="margin-top:1rem;font-size:11px;color:#6b7280;">Freddy lead scout · watches the Freddy Fix It Page + Instagram comments and Page messages · own-Page only (Meta rules).</p>
  </div>`;
}

let lastResend = "";

async function sendEmail(subject: string, html: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    lastResend = `HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}`;
    return res.ok;
  } catch (e) {
    lastResend = `ERR ${String(e).slice(0, 200)}`;
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const isTest = body?.test === true;

    if (!META_PAGE_TOKEN || !META_PAGE_ID) {
      return new Response(JSON.stringify({
        ok: true, configured: false,
        note: "Set META_PAGE_TOKEN + META_PAGE_ID (and optionally META_IG_ID) secrets to activate.",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // 1) Scan all sources.
    const found: Lead[] = [
      ...(await scanPageComments()),
      ...(await scanPageDMs()),
      ...(await scanIgComments()),
    ];

    // 2) Insert new ones only (dedupe on platform+external_id), cap per run.
    const fresh: Array<Lead & { id: string }> = [];
    for (const lead of found.slice(0, 50)) {
      if (fresh.length >= MAX_LEADS_PER_RUN) break;
      const platform = lead.subreddit === "ig-comment" ? "instagram" : "facebook";
      const { data, error } = await admin
        .from("social_leads")
        .insert({ platform, ...lead })
        .select("id")
        .maybeSingle();
      if (!error && data) fresh.push({ ...lead, id: data.id });
      // unique-violation = already seen → silently skip
    }

    // 3) Email the digest (skip when empty, unless testing).
    let emailed = false;
    if (fresh.length > 0 || isTest) {
      emailed = await sendEmail(
        `Freddy lead scout — ${fresh.length} new Facebook/Instagram lead${fresh.length === 1 ? "" : "s"}${isTest ? " [TEST]" : ""}`,
        digestHtml(fresh),
      );
      if (emailed && fresh.length > 0) {
        await admin.from("social_leads")
          .update({ status: "emailed", emailed_at: new Date().toISOString() })
          .in("id", fresh.map((l) => l.id));
      }
    }

    const result: Record<string, unknown> = { ok: true, configured: true, scanned: found.length, new: fresh.length, emailed };
    if (isTest) { result.scanStatus = scanStatus; result.resend = lastResend; }
    return new Response(JSON.stringify(result),
      { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("meta-lead-scout error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
