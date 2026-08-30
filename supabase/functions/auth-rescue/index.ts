// Supabase Edge Function: auth-rescue
//
// v1 (2026-08-30). Rescues an account that GoTrue's own mailer stranded.
//
// THE PROBLEM THIS EXISTS FOR
// There are two email systems and only one of them is Resend. Welcome mail,
// dispatch, receipts, reminders and the newsletter are ours. But signup
// CONFIRMATION and PASSWORD RESET are sent by Supabase's GoTrue mailer -- a
// different sender, on a domain we do not own, whose deliverability we cannot
// see, monitor or fix. In Aug 2026 that path failed silently: people signed up,
// got our Resend welcome, never got the GoTrue confirmation, and were locked out
// with NO error visible to them or to us. Three accounts sat stranded, one an
// approved contractor receiving job emails for five days he could not act on. We
// only found out because somebody phoned. It happened again on 2026-08-28 to a
// single client; health check 7 caught that one, but catching it only ever
// produced an alert, never a fix.
//
// "Just reset your password" is NOT a workaround. Password reset runs through
// the same mailer and fails the same way.
//
// WHAT THIS DOES INSTEAD
// It mints the link itself through the GoTrue ADMIN API (generateLink), which
// returns an action link and sends NOTHING, then delivers that link over OUR
// Resend domain -- the same domain that reliably carries every receipt and
// dispatch email on the platform. GoTrue's mailer is removed from the path
// entirely; only its token minting is used.
//
// WHY A MAGIC LINK AND NOT A FORCED CONFIRM
// Force-confirming (admin.updateUserById{ email_confirm: true }) would unlock the
// account without ever proving the person owns the address. A magic link proves
// exactly what the confirmation email proved -- they must receive it at that
// address to use it -- so this is a change of CARRIER, not a weakening of the
// check. Clicking it both signs them in and confirms the address.
//
// GATING: an admin JWT, or the single-use x-ff-internal token Postgres mints via
// issue_internal_token('edge-internal'). verify_jwt is false because the hourly
// sweep calls it from the DB, which has no user JWT. Without a gate anyone could
// POST a user_id and make our DKIM-signed domain mail a sign-in link to a
// stranger -- the gate is the entire security of this function.
//
// NOT gated on outbound_paused(), deliberately, for the same reason GoTrue auth
// mail and both welcome emails are not: the pause is about not soliciting
// people, never about refusing to let someone into an account they already made.
// Silencing this during a pause reproduces the Aug 2026 incident exactly.
//
// Secret needed: RESEND_API_KEY (SUPABASE_URL / SERVICE_ROLE_KEY auto-injected).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL       = "Freddy Fix It <noreply@freddyfixit.ca>";
const REPLY_TO         = "hello@freddyfixit.ca";
const ADMIN_EMAIL      = "hello@freddyfixit.ca";
const SITE             = "https://freddyfixit.ca";
const MAILING_ADDRESS  = "Freddy FixIt Contractors Inc., 20 Whiteram Mews NE, Calgary, AB";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ff-internal",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// Redeeming the token is what proves the caller is Postgres. Single-use, 10-min
// life, so a leaked one is worth nothing by the time it leaks.
async function internalOk(req: Request): Promise<boolean> {
  const t = req.headers.get("x-ff-internal") ?? "";
  if (!t) return false;
  try {
    const { data, error } = await admin.rpc("consume_internal_token", {
      p_token: t,
      p_purpose: "edge-internal",
    });
    return !error && data === true;
  } catch { return false; }
}

// The anon key is a valid project-signed JWT and ships in the public JS bundle,
// so verify_jwt would prove nothing. Identity is resolved in code, from
// profiles -- never from the request body.
async function adminOk(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return false;
  try {
    const { data: u, error } = await admin.auth.getUser(jwt);
    if (error || !u?.user) return false;
    const { data: p } = await admin
      .from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    return (p as any)?.role === "admin";
  } catch { return false; }
}

function shell(inner: string) {
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">'
    + '<tr><td align="center">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">'
    + '<tr><td style="background:#1a2236;padding:20px 28px;">'
    + '<span style="color:#f0f4ff;font-size:20px;font-weight:700;letter-spacing:.4px;">Freddy Fix It</span>'
    + '</td></tr>'
    + '<tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6;">' + inner + '</td></tr>'
    + '<tr><td style="padding:16px 28px 24px;color:#6b7280;font-size:12px;line-height:1.5;border-top:1px solid #e5e7eb;">'
    + MAILING_ADDRESS + '<br>Reply to this email and a real person will read it.'
    + '</td></tr></table></td></tr></table></body></html>';
}

function button(href: string, label: string) {
  return '<p style="margin:26px 0;"><a href="' + esc(href)
    + '" style="background:#ea6b14;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:9px;font-weight:700;display:inline-block;font-size:15px;">'
    + esc(label) + '</a></p>';
}

// Copy differs by WHY we are writing, because the two situations owe the person
// different things. "stuck" is a nudge for a link that may simply be in spam.
// "apology" is for someone we actually stranded, and it says so plainly rather
// than implying they did something wrong.
function bodyFor(kind: string, firstName: string, link: string) {
  const hi = firstName ? "Hi " + esc(firstName) + "," : "Hi,";
  if (kind === "apology") {
    return {
      subject: "Sorry - your Freddy Fix It account was stuck. Here is your way in.",
      html: shell(
        '<p style="margin:0 0 14px;">' + hi + '</p>'
        + '<p style="margin:0 0 14px;">You created a Freddy Fix It account and then never heard from us again. That was our fault, not yours. The confirmation email we rely on to let you in never reached your inbox, and because nothing in our system flagged it at the time, we did not spot it straight away.</p>'
        + '<p style="margin:0 0 14px;">We are sorry. You did not do anything wrong, and there was nothing you could have done differently.</p>'
        + '<p style="margin:0 0 4px;">This link signs you straight in and finishes setting up your account - no password needed:</p>'
        + button(link, "Sign in to Freddy Fix It")
        + '<p style="margin:0 0 14px;color:#6b7280;font-size:13px;">The link works once and expires in 24 hours. If it has expired by the time you read this, just reply to this email and we will send a fresh one straight away.</p>'
        + '<p style="margin:0 0 14px;">We have also changed how we send these, so this particular failure cannot strand anyone again.</p>'
        + '<p style="margin:0;">- Freddy Fix It, Calgary</p>'),
    };
  }
  return {
    subject: "Finish setting up your Freddy Fix It account",
    html: shell(
      '<p style="margin:0 0 14px;">' + hi + '</p>'
      + '<p style="margin:0 0 14px;">You started a Freddy Fix It account but have not been able to get in yet - the confirmation email may have landed in spam, or not arrived at all.</p>'
      + '<p style="margin:0 0 4px;">Here is a link that signs you in directly, no password needed:</p>'
      + button(link, "Sign in to Freddy Fix It")
      + '<p style="margin:0 0 14px;color:#6b7280;font-size:13px;">The link works once and expires in 24 hours. If it has expired, reply to this email and we will send another.</p>'
      + '<p style="margin:0;">- Freddy Fix It, Calgary</p>'),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty body is fine */ }

  if (!(await internalOk(req)) && !(await adminOk(req)))
    return json({ ok: false, error: "forbidden" }, 403);

  if (!RESEND_API_KEY) return json({ ok: false, error: "mailer not configured" }, 500);

  const userId = String(payload?.user_id ?? "");
  const kind   = payload?.kind === "apology" ? "apology" : "stuck";
  const test   = payload?.test === true;
  if (!userId) return json({ ok: false, error: "missing user_id" }, 400);

  // Identity comes from the DB, never from the body -- otherwise the caller
  // chooses who receives a sign-in link, which is the whole hole.
  const { data: who, error: whoErr } = await admin
    .rpc("auth_rescue_target", { p_user: userId });
  if (whoErr) return json({ ok: false, error: whoErr.message }, 500);
  const target: any = Array.isArray(who) ? who[0] : who;
  if (!target?.email) return json({ ok: false, error: "no such user" }, 404);

  // generateLink returns the action link and sends nothing. That is the point:
  // the token is GoTrue's, the delivery is ours.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
    options: { redirectTo: SITE + "/auth/callback" },
  } as any);
  if (linkErr) return json({ ok: false, error: "link: " + linkErr.message }, 500);
  const link = (linkData as any)?.properties?.action_link;
  if (!link) return json({ ok: false, error: "no action link returned" }, 500);

  const { subject, html } = bodyFor(kind, target.first_name ?? "", link);
  const to = test ? ADMIN_EMAIL : target.email;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      reply_to: REPLY_TO,
      subject,
      html,
    }),
  });
  const sent = res.ok;
  const detail = sent ? "" : await res.text().catch(() => "");

  // Log even a failure: the sweep counts attempts off this table, and a failure
  // that is not recorded is one that retries forever at the same broken address.
  if (!test) {
    try {
      await admin.rpc("auth_rescue_logged", {
        p_user: userId, p_kind: kind, p_ok: sent,
        p_detail: detail ? detail.slice(0, 300) : null,
      });
    } catch { /* logging must never mask the send result */ }
  }

  return sent
    ? json({ ok: true, kind, test })
    : json({ ok: false, error: "resend: " + detail.slice(0, 200) }, 502);
});
