// Supabase Edge Function: reddit-lead-scout
// Scans Calgary + home-improvement subreddits for (a) homeowners looking for
// repair/maintenance help and (b) contractors trying to fill their schedule,
// drafts a reply for each, and emails an approval digest to the admin.
// NOTHING is ever posted automatically — the owner reviews, edits, and posts
// each reply by hand (keeps the Reddit account safe and every reply on-brand).
//
// Called by pg_cron every 2 hours via net.http_post (anon bearer) — see
// kick_reddit_lead_scout(). verify_jwt = false (called by the DB, not users);
// it only reads public Reddit JSON, writes to social_leads (service role),
// and emails the fixed internal admin address.
// Test: POST { "test": true } → runs a scan and always sends a digest email
// (even when 0 leads) so delivery can be verified.
// Secrets needed: RESEND_API_KEY + REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET
// (SUPABASE_URL / SERVICE_ROLE_KEY auto-injected). Reddit blocks unauthenticated
// JSON from datacenter IPs (HTTP 403), so reads go through OAuth app-only auth
// (client_credentials → oauth.reddit.com) when the Reddit secrets are set;
// falls back to public www.reddit.com JSON when they aren't.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDDIT_CLIENT_ID     = Deno.env.get("REDDIT_CLIENT_ID") ?? "";
const REDDIT_CLIENT_SECRET = Deno.env.get("REDDIT_CLIENT_SECRET") ?? "";
const FROM_EMAIL       = "noreply@freddyfixit.ca";
const ADMIN_EMAIL      = "hello@freddyfixit.ca";
const UA               = "web:ca.freddyfixit.leadscout:v1.0 (lead monitoring; contact hello@freddyfixit.ca)";
const MAX_LEADS_PER_RUN = 12;
const MAX_AGE_HOURS     = 24;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Sources ──────────────────────────────────────────────────────────────────
// local: everything is Calgary-area already. global: post must mention the area.
const LOCAL_SUBS  = ["Calgary", "askCalgary", "CalgaryHomeowners", "airdrie"];
const GLOBAL_SUBS = ["HomeImprovement", "HomeMaintenance", "Plumbing", "electricians",
                     "hvacadvice", "handyman", "Renovations", "Construction", "skilledtrades"];
// Subs where a poster is more likely a tradesperson than a homeowner.
const TRADE_SUBS = new Set(["Plumbing", "electricians", "hvacadvice", "Construction",
                            "skilledtrades", "handyman"]);

// ── Classification (keyword heuristics — the owner is the real filter) ──────
const GEO   = /(calgary|yyc|airdrie|cochrane|okotoks|chestermere|strathmore|alberta)/i;
const TRADE = /(plumb\w*|electric\w*|handyman|hvac|furnace|air condition\w*|\ba\/c\b|roof\w*|paint(er|ing)|landscap\w*|renovat\w*|drywall|floor\w*|fence|deck\b|garage door|hot water (tank|heater)|appliance|gutter|siding|concrete|snow removal|contractor|leak\w*)/i;
const CLIENT_ASK = /(any(one|body)? (know|recommend|used|suggest)|recommend\w*|looking for (a|an|someone)|who (do|should|can|would) (i|we|you) (call|hire|use|recommend)|need (a|an|someone) |suggestions? for|can (someone|anyone) (fix|help)|how much (would|does|should|to)|is this (normal|bad|a problem|fixable)|(broke|broken|leaking|not working|stopped working|quit working))/i;
const CONTRACTOR_ASK = /(slow (season|month|winter)|fill\w* (my|our|the) (schedule|calendar|books)|find\w* (more )?(client|work|job|lead)s?\b|get\w* (more )?(client|job|lead)s?\b|grow\w* (my|our) (business|company)|start\w* (a|my) (own )?(business|company)|new (to|in) (town|calgary|yyc|the city)|advertis\w*|lead gen\w*|word of mouth|\bangi\b|homestars|thumbtack|jobber|where do (you|y'?all) (get|find))/i;

type Lead = {
  external_id: string; subreddit: string; author: string; title: string;
  url: string; snippet: string; lead_type: "client" | "contractor"; drafted_reply: string;
};

// ── Reply drafts (always disclose affiliation — Reddit norms + trust) ───────
const CLIENT_REPLIES = [
  (t: string) => `If you're still looking — you could post this on freddyfixit.ca (full disclosure: I'm with them). You post the job once and up to 5 vetted Calgary pros send free estimates, and your payment is only released once you approve the finished work. Hope the ${t} gets sorted either way!`,
  (t: string) => `Not sure if you've found someone yet, but freddyfixit.ca might save you some phone tag (disclosure — I'm with Freddy). Up to 5 free estimates from vetted Calgary pros, and the payment's held until the job's done right. Good luck with the ${t}!`,
];
const CONTRACTOR_REPLIES = [
  () => `If Calgary work is what you're after: freddyfixit.ca is free for contractors — no lead fees or pay-per-lead like Angi/HomeStars. You get job alerts matched to your trade and area, bid what you want, and the payout releases as soon as the client confirms. (Disclosure: I'm with Freddy.)`,
  () => `Worth a look: freddyfixit.ca (disclosure — I'm with them). Free to join, no buying leads, jobs matched to your trade in Calgary, and secure payment held upfront so you're never chasing an invoice.`,
];

function tradeWord(text: string): string {
  const m = text.match(TRADE);
  return m ? m[0].toLowerCase().replace(/\w*$/, (w) => w) : "repair";
}

function classify(sub: string, title: string, body: string): "client" | "contractor" | null {
  const text = `${title}\n${body}`;
  if (GLOBAL_SUBS.includes(sub) && !GEO.test(text)) return null;
  const isTradeSub = TRADE_SUBS.has(sub);
  const client = CLIENT_ASK.test(text) && (TRADE.test(text) || isTradeSub);
  const contractor = CONTRACTOR_ASK.test(text) && (TRADE.test(text) || isTradeSub);
  if (isTradeSub) return contractor ? "contractor" : client ? "client" : null;
  return client ? "client" : contractor ? "contractor" : null;
}

function draft(lead_type: "client" | "contractor", externalId: string, text: string): string {
  const pick = externalId.charCodeAt(externalId.length - 1) % 2;
  return lead_type === "client" ? CLIENT_REPLIES[pick](tradeWord(text)) : CONTRACTOR_REPLIES[pick]();
}

const scanStatus: Record<string, string> = {};

// App-only OAuth token (Reddit blocks unauthenticated JSON from datacenter IPs).
let redditToken: string | null = null;
async function getRedditToken(): Promise<string | null> {
  if (redditToken !== null) return redditToken || null;
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) { redditToken = ""; return null; }
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: "grant_type=client_credentials",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      scanStatus["_oauth"] = `token HTTP ${res.status} ${JSON.stringify(data).slice(0, 120)}`;
      redditToken = "";
      return null;
    }
    redditToken = String(data.access_token);
    return redditToken;
  } catch (e) {
    scanStatus["_oauth"] = `token ERR ${String(e).slice(0, 120)}`;
    redditToken = "";
    return null;
  }
}

async function scanSub(sub: string): Promise<Lead[]> {
  try {
    const token = await getRedditToken();
    const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
    const headers: Record<string, string> = { "User-Agent": UA };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${base}/r/${sub}/new.json?limit=30`, { headers });
    scanStatus[sub] = `HTTP ${res.status}`;
    if (!res.ok) { console.warn(`r/${sub}: HTTP ${res.status}`); return []; }
    const json = await res.json();
    const out: Lead[] = [];
    const cutoff = Date.now() / 1000 - MAX_AGE_HOURS * 3600;
    for (const child of json?.data?.children ?? []) {
      const p = child?.data;
      if (!p?.id || p.created_utc < cutoff || p.stickied || p.over_18) continue;
      const title = String(p.title ?? ""), body = String(p.selftext ?? "");
      const lead_type = classify(sub, title, body);
      if (!lead_type) continue;
      const text = `${title} ${body}`;
      out.push({
        external_id: String(p.id),
        subreddit: sub,
        author: String(p.author ?? ""),
        title: title.slice(0, 300),
        url: `https://www.reddit.com${p.permalink}`,
        snippet: (body || title).replace(/\s+/g, " ").slice(0, 280),
        lead_type,
        drafted_reply: draft(lead_type, String(p.id), text),
      });
    }
    return out;
  } catch (e) {
    scanStatus[sub] = `ERR ${String(e).slice(0, 120)}`;
    console.warn(`r/${sub} fetch failed:`, e);
    return [];
  }
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>\"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function digestHtml(leads: Array<Lead & { id: string }>): string {
  const cards = leads.map((l) => `
    <div style="background:#151d2e;border:1px solid ${l.lead_type === "client" ? "#ea6b14" : "#3b82f6"};border-radius:10px;padding:1rem;margin:0 0 1rem;">
      <p style="margin:0 0 .35rem;font-size:12px;letter-spacing:.5px;color:${l.lead_type === "client" ? "#ea6b14" : "#60a5fa"};font-weight:700;">
        ${l.lead_type === "client" ? "CLIENT LEAD" : "CONTRACTOR LEAD"} — r/${esc(l.subreddit)} · u/${esc(l.author)}</p>
      <p style="margin:.25rem 0;font-size:15px;font-weight:600;color:#f0f4ff;">${esc(l.title)}</p>
      <p style="margin:.25rem 0 .75rem;font-size:13px;color:#9aa4bf;">${esc(l.snippet)}${l.snippet.length >= 280 ? "…" : ""}</p>
      <p style="margin:.5rem 0 .25rem;font-size:12px;color:#9aa4bf;">Suggested reply (edit as you like, then paste it on Reddit):</p>
      <div style="background:#0f1526;border-radius:8px;padding:.75rem;font-size:13px;line-height:1.5;color:#e2e8f0;">${esc(l.drafted_reply)}</div>
      <a href="${esc(l.url)}" style="display:inline-block;margin-top:.75rem;padding:.5rem 1rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open on Reddit →</a>
    </div>`).join("");
  return `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:1.5rem;border-radius:12px;">
    <h2 style="color:#ea6b14;margin:0 0 .35rem;">Lead scout — ${leads.length} new lead${leads.length === 1 ? "" : "s"} on Reddit</h2>
    <p style="margin:0 0 1.25rem;font-size:13px;color:#9aa4bf;">Nothing has been posted. Review each one — open the post, tweak the suggested reply so it sounds like you, and post it from your own account. Skip anything that feels off.</p>
    ${cards || `<p style="font-size:14px;color:#9aa4bf;">No matching posts this scan — the bot is running fine, there was just nothing to flag.</p>`}
    <p style="margin-top:1rem;font-size:11px;color:#6b7280;">Freddy lead scout · scans r/${[...LOCAL_SUBS, ...GLOBAL_SUBS].join(", r/")} every 2 hours · replies always disclose the Freddy affiliation.</p>
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
    if (!res.ok) console.error("Resend error:", lastResend);
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

    // 1) Scan all subs (sequential — gentle on Reddit's rate limits).
    let found: Lead[] = [];
    for (const sub of [...LOCAL_SUBS, ...GLOBAL_SUBS]) found = found.concat(await scanSub(sub));

    // 2) Insert new ones only (dedupe on platform+external_id), cap per run.
    const fresh: Array<Lead & { id: string }> = [];
    for (const lead of found.slice(0, 50)) {
      if (fresh.length >= MAX_LEADS_PER_RUN) break;
      const { data, error } = await admin
        .from("social_leads")
        .insert({ platform: "reddit", ...lead })
        .select("id")
        .maybeSingle();
      if (!error && data) fresh.push({ ...lead, id: data.id });
      // unique-violation = already seen → silently skip
    }

    // 3) Email the digest (skip when empty, unless testing).
    let emailed = false;
    if (fresh.length > 0 || isTest) {
      emailed = await sendEmail(
        `Freddy lead scout — ${fresh.length} new Reddit lead${fresh.length === 1 ? "" : "s"}${isTest ? " [TEST]" : ""}`,
        digestHtml(fresh),
      );
      if (emailed && fresh.length > 0) {
        await admin.from("social_leads")
          .update({ status: "emailed", emailed_at: new Date().toISOString() })
          .in("id", fresh.map((l) => l.id));
      }
    }

    const result: Record<string, unknown> = { ok: true, scanned: found.length, new: fresh.length, emailed };
    if (isTest) { result.scanStatus = scanStatus; result.resend = lastResend; }
    return new Response(
      JSON.stringify(result),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("reddit-lead-scout error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
