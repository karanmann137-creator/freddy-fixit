// newsletter-send v1 — weekly value-content newsletter.
// Kicked by pg_cron (net.http_post, anon bearer) with {"audience":"client"|"contractor"}.
// Picks the lowest-seq 'queued' newsletter_content row for that audience, renders the
// markdown body into a branded email, sends it to every active subscriber of that
// audience (per-subscriber unsubscribe link + List-Unsubscribe headers + CASL footer),
// marks the row 'sent', and auto-publishes a blog_posts row when blog_title is set.
// {test:true} sends a preview of the next queued email for BOTH audiences to the
// admin inbox only (nothing is marked sent, no blog row is created).
// Abuse guard (endpoint is anon-callable): a real send is refused if the last send
// for that audience was under 5 days ago.
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const ADMIN_EMAIL = "hello@freddyfixit.ca";
const FROM = "Freddy Fix It Tips <tips@freddyfixit.ca>";
const REPLY_TO = "hello@freddyfixit.ca";
const MAILING_ADDRESS = "Freddy FixIt Contractors Inc. • 20 Whiteram Mews NE, Calgary, AB";
const SITE = "https://freddyfixit.ca";
const MIN_GAP_DAYS = 5;

const NAVY = "#1a2236";
const ORANGE = "#ea6b14";
const TEXT = "#f0f4ff";
const MUTED = "#9aa4bf";

const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Tiny markdown renderer: **bold**, [text](url), ## headings, - bullets, 1. numbered, paragraphs.
function mdToHtml(md: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2" style="color:' + ORANGE + ';text-decoration:underline">$1</a>',
      );
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let items: string[] = [];
  let listTag: "ul" | "ol" | null = null;
  const liStyle = 'style="margin:0 0 6px;line-height:1.55"';
  const flushList = () => {
    if (items.length && listTag) {
      out.push(
        "<" + listTag + ' style="margin:0 0 14px;padding-left:22px">' +
          items.map((li) => "<li " + liStyle + ">" + li + "</li>").join("") +
          "</" + listTag + ">",
      );
    }
    items = [];
    listTag = null;
  };
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push('<p style="margin:0 0 14px;line-height:1.6">' + para.join(" ") + "</p>");
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); flushPara(); continue; }
    const num = line.match(/^\d+\.\s+(.*)$/);
    if (line.startsWith("- ")) {
      flushPara();
      if (listTag !== "ul") flushList();
      listTag = "ul";
      items.push(inline(line.slice(2)));
    } else if (num) {
      flushPara();
      if (listTag !== "ol") flushList();
      listTag = "ol";
      items.push(inline(num[1]));
    } else if (line.startsWith("## ")) {
      flushList(); flushPara();
      out.push('<h3 style="margin:18px 0 8px;font-size:17px;color:' + TEXT + '">' + inline(line.slice(3)) + "</h3>");
    } else {
      flushList();
      para.push(inline(line));
    }
  }
  flushList(); flushPara();
  return out.join("");
}

function emailHtml(subject: string, preheader: string, bodyMd: string, audience: string, unsubUrl: string): string {
  const cta = audience === "contractor"
    ? { label: "Open my dashboard", url: SITE + "/contractor-dashboard" }
    : { label: "Get a free estimate", url: SITE + "/get-a-quote" };
  return '<!doctype html><html><body style="margin:0;padding:0;background:#0f1524">' +
    '<div style="display:none;max-height:0;overflow:hidden">' + esc(preheader) + "</div>" +
    '<div style="max-width:600px;margin:0 auto;padding:24px 14px;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="background:' + NAVY + ';border:1px solid rgba(234,107,20,.35);border-radius:12px;overflow:hidden">' +
    '<div style="background:' + ORANGE + ';padding:14px 24px">' +
    '<span style="font-size:20px;font-weight:bold;color:#fff;letter-spacing:.5px">FREDDY FIX IT</span>' +
    '<span style="float:right;font-size:12px;color:#fff;opacity:.9;padding-top:6px">' +
    (audience === "contractor" ? "Pro Tips" : "Home & Vehicle Tips") + "</span></div>" +
    '<div style="padding:26px 24px;color:' + TEXT + '">' +
    '<h2 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:' + TEXT + '">' + esc(subject) + "</h2>" +
    '<div style="font-size:15px;color:' + TEXT + '">' + mdToHtml(bodyMd) + "</div>" +
    '<div style="margin:22px 0 4px"><a href="' + cta.url + '" style="background:' + ORANGE +
    ';color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold;display:inline-block">' +
    cta.label + "</a></div></div>" +
    '<div style="padding:16px 24px;border-top:1px solid rgba(240,244,255,.08);font-size:11px;color:' + MUTED + ';line-height:1.6">' +
    "You’re receiving this because you signed up for tips from Freddy Fix It or have used our marketplace. " +
    '<a href="' + unsubUrl + '" style="color:' + MUTED + '">Unsubscribe</a> any time, or reply to this email with “unsubscribe”.<br>' +
    esc(MAILING_ADDRESS) + " • " + '<a href="' + SITE + '" style="color:' + MUTED + '">freddyfixit.ca</a>' +
    "</div></div></div></body></html>";
}

async function sendOne(to: string, subject: string, html: string, unsubUrl: string): Promise<{ ok: boolean; body: unknown }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject,
      html,
      headers: {
        "List-Unsubscribe": "<" + unsubUrl + ">",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  let body: unknown = null;
  try { body = await r.json(); } catch { /* ignore */ }
  return { ok: r.ok, body };
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function unsubUrlFor(token: string): string {
  return SB_URL + "/functions/v1/newsletter-unsubscribe?t=" + token;
}

async function nextQueued(audience: string) {
  const { data } = await sb
    .from("newsletter_content")
    .select("id, audience, seq, subject, preheader, body_md, blog_title, blog_tag")
    .eq("audience", audience)
    .eq("status", "queued")
    .order("seq", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { /* empty body ok */ }

  // ---------- TEST MODE: preview next queued email for both audiences to admin only ----------
  if (payload.test === true) {
    const results: Record<string, unknown> = {};
    for (const aud of ["client", "contractor"]) {
      const row = await nextQueued(aud);
      if (!row) { results[aud] = "nothing queued"; continue; }
      const html = emailHtml(row.subject, row.preheader ?? "", row.body_md, aud, unsubUrlFor("test-token"));
      const r = await sendOne(ADMIN_EMAIL, "[TEST " + aud + " #" + row.seq + "] " + row.subject, html, unsubUrlFor("test-token"));
      results[aud] = { seq: row.seq, subject: row.subject, resend: r.body, ok: r.ok };
    }
    return new Response(JSON.stringify({ ok: true, test: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---------- REAL SEND ----------
  const audience = payload.audience === "contractor" ? "contractor" : payload.audience === "client" ? "client" : null;
  if (!audience) {
    return new Response(JSON.stringify({ ok: false, error: "audience must be 'client' or 'contractor'" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Rate guard — refuse if the last send for this audience was < MIN_GAP_DAYS ago.
  const { data: lastSent } = await sb
    .from("newsletter_content")
    .select("sent_at")
    .eq("audience", audience)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastSent?.sent_at && Date.now() - new Date(lastSent.sent_at).getTime() < MIN_GAP_DAYS * 86400_000) {
    return new Response(JSON.stringify({ ok: true, skipped: "sent recently" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const row = await nextQueued(audience);
  if (!row) {
    return new Response(JSON.stringify({ ok: true, skipped: "nothing queued for " + audience }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: subs } = await sb
    .from("newsletter_subscribers")
    .select("email, first_name, unsub_token")
    .eq("audience", audience)
    .is("unsubscribed_at", null);

  let sent = 0, failed = 0;
  let lastErr: unknown = null;
  for (const s of subs ?? []) {
    const u = unsubUrlFor(s.unsub_token);
    const r = await sendOne(s.email, row.subject, emailHtml(row.subject, row.preheader ?? "", row.body_md, audience, u), u);
    if (r.ok) sent++;
    else { failed++; lastErr = r.body; }
  }

  // Mark the content row sent + publish blog post (if this issue has a blog title).
  let blogSlug: string | null = null;
  if (row.blog_title) {
    blogSlug = slugify(row.blog_title);
    await sb.from("blog_posts").upsert({
      slug: blogSlug,
      title: row.blog_title,
      tag: row.blog_tag ?? "Tips",
      description: row.preheader ?? "",
      body_md: row.body_md,
      published_at: new Date().toISOString(),
    }, { onConflict: "slug" });
  }
  await sb.from("newsletter_content")
    .update({ status: "sent", sent_at: new Date().toISOString(), blog_slug: blogSlug })
    .eq("id", row.id);

  return new Response(JSON.stringify({ ok: true, audience, seq: row.seq, sent, failed, blogSlug, lastErr }), {
    headers: { "Content-Type": "application/json" },
  });
});
