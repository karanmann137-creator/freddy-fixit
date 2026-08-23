// Supabase Edge Function: client-welcome
// Sends a welcome email to a client right after they create an account.
//
// v1 (2026-08-23): clients had NEVER had a welcome email. Contractors have had
// one since launch; a client signed up, got a GoTrue confirmation email from a
// sender they don't recognise, and heard nothing from us at all.
//
// The most load-bearing paragraph in here is the one about that confirmation
// email. In Aug 2026 the GoTrue mailer broke silently: people signed up, got our
// Resend mail, never got the confirmation, and were locked out with no error
// visible to them OR to us. Three accounts sat stranded and we only found out
// because one of them phoned. This email now names that second email, says it
// comes from a different sender, says to check spam, and gives a human address to
// reply to -- so the same failure produces a reply instead of silence.
//
// The copy is MODE-AWARE. While the site is 'paused' or 'waitlist' a client's
// request is parked (enforce_platform_pause sets waitlisted := true) and no
// contractor is dispatched, so promising estimates "within a day" would be a lie.
//
// Fired fire-and-forget from an AFTER INSERT trigger on public.profiles via
// net.http_post. verify_jwt = false (called by the DB, not an end user); it only
// reads via service role and emails the client's own signup address.
// Secret needed: RESEND_API_KEY (SUPABASE_URL / SERVICE_ROLE_KEY auto-injected).
// Test without a real signup: POST { "test": true } -> sends the email to the admin.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>\"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// Reads the same platform_settings row the admin Platform tab writes. Defaults to
// 'open' on any failure, because the open copy is a superset of the waitlist copy
// -- worst case someone hears about estimates a few days early, which is far
// better than telling an open-for-business client that we are closed.
async function platformMode(): Promise<string> {
  try {
    const { data } = await admin.from("platform_settings").select("value").eq("key", "mode").maybeSingle();
    const v = (data as any)?.value;
    const s = typeof v === "string" ? v : String(v ?? "").replace(/^"|"$/g, "");
    return s || "open";
  } catch { return "open"; }
}

function welcomeHtml(firstName: string, mode: string, referralCode: string) {
  const hi     = firstName ? `Welcome, ${esc(firstName)}!` : "Welcome to Freddy Fix It!";
  const closed = mode === "paused" || mode === "waitlist";

  const next = closed ? `
    <p style="font-size:15px;line-height:1.6;margin:.75rem 0;"><strong>Where things stand:</strong> we're not taking new jobs in Calgary quite yet &mdash; we're finishing the vetting on our first group of trades so that every pro you're offered has been checked out properly. It's the part that's worth getting right.</p>
    <p style="font-size:15px;line-height:1.6;margin:.75rem 0;">Your account is set up and you're on the list. When we open, you'll be among the first people we email &mdash; there's nothing else you need to do.</p>` : `
    <p style="font-size:15px;line-height:1.6;margin:.75rem 0;"><strong>What happens next:</strong> we send your job to vetted local trades who cover your area, and they come back with estimates &mdash; usually within a day. You compare them and pick whoever you like.</p>
    <p style="font-size:15px;line-height:1.6;margin:.75rem 0;">Getting estimates is <strong>free</strong>, and you're never obliged to hire anyone. When you do book, you pay a deposit up front and the rest once the work is done &mdash; and your money is held securely and only sent to your pro after you confirm the job is finished.</p>`;

  const cta = closed
    ? `<a href="${SITE}/client-dashboard" style="display:inline-block;margin-top:.5rem;padding:.75rem 1.5rem;background:rgba(240,244,255,.1);border:1px solid rgba(240,244,255,.25);color:#f0f4ff;text-decoration:none;border-radius:8px;font-weight:500;">Open your dashboard</a>`
    : `<a href="${SITE}/client-dashboard" style="display:inline-block;margin-top:.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Open your dashboard</a>`;

  // One friend per code, matching apply_referral_code exactly. Saying "invite
  // your friends" here and then refusing the second one would be our mistake
  // showing up as their embarrassment.
  const referral = referralCode ? `
    <div style="margin:1.5rem 0 0;padding:1rem 1.1rem;background:rgba(234,107,20,.10);border:1px solid rgba(234,107,20,.35);border-radius:10px;">
      <p style="font-size:15px;line-height:1.6;margin:0 0 .5rem;"><strong style="color:#ea6b14;">Invite a friend.</strong> Give them your code and we'll cover the 3% service fee on their first job. It's good for one friend, so pick someone who actually needs a hand with something.</p>
      <div style="font-family:monospace;font-size:20px;letter-spacing:.14em;color:#ea6b14;border:1px dashed rgba(234,107,20,.5);border-radius:8px;padding:.5rem .9rem;display:inline-block;">${esc(referralCode)}</div>
    </div>` : "";

  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
    <h2 style="color:#ea6b14;margin:0 0 1rem;">${hi}</h2>
    <p style="font-size:15px;line-height:1.6;margin:.5rem 0;">Thanks for creating an account. Freddy Fix It connects Calgary homeowners with local trades and handymen who've been vetted &mdash; ID checked, insurance and WCB on file where they have it, and reviewed before they're let near a job.</p>

    <div style="margin:1.5rem 0;padding:1rem 1.1rem;background:rgba(234,107,20,.12);border:1px solid rgba(234,107,20,.4);border-radius:10px;">
      <p style="font-size:15px;line-height:1.6;margin:0;"><strong style="color:#ea6b14;">Watch for a second email.</strong> There's a separate message on its way asking you to confirm your email address. It comes from a <strong>different sender than this one</strong>, so check your junk or spam folder &mdash; and you won't be able to sign in until you've clicked the link in it. <strong>If it hasn't shown up in a few minutes, just reply to this email</strong> and a real person will sort it out.</p>
    </div>

    ${next}
    ${cta}
    ${referral}

    <p style="font-size:15px;line-height:1.6;margin:1.5rem 0 0;">Any questions, reply to this email &mdash; it goes to a person, not a black hole.</p>
    <p style="font-size:15px;line-height:1.6;margin:1rem 0 0;">&mdash; The Freddy Fix It team</p>
    <p style="margin-top:1.5rem;font-size:12px;color:#9aa4bf;">You're receiving this because you created an account at freddyfixit.ca.<br>${esc(MAILING_ADDRESS)}</p>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, reply_to: REPLY_TO }),
  });
  const data = await res.json();
  if (!res.ok) console.error("Resend error:", JSON.stringify(data));
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const mode = await platformMode();
    const subject = mode === "paused" || mode === "waitlist"
      ? "Welcome to Freddy Fix It — you're on the list"
      : "Welcome to Freddy Fix It — here's what happens next";

    // Admin test hook: sends the exact email, in the current site mode, to the
    // admin inbox. No client involved and nothing is written.
    if (body?.test === true) {
      const ok = await sendEmail(ADMIN_EMAIL, `[TEST] ${subject}`, welcomeHtml("Test", mode, "TESTCODE"));
      return new Response(JSON.stringify({ ok, mode }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const id = String(body?.id || "");
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: "missing id" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Profile first, auth as fallback -- an orphan repaired by ensure_profile()
    // may have arrived here with almost nothing filled in.
    let email: string | null = null, first = "", code = "", role = "";
    const { data: p } = await admin.from("profiles")
      .select("first_name,email,role,referral_code").eq("id", id).maybeSingle();
    if (p) {
      first = (p as any).first_name ?? "";
      email = (p as any).email ?? null;
      role  = (p as any).role ?? "";
      code  = (p as any).referral_code ?? "";
    }
    if (!email) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      email = u?.user?.email ?? null;
      if (!first) first = String((u?.user?.user_metadata as any)?.first_name ?? "");
      if (!role)  role  = String((u?.user?.user_metadata as any)?.role ?? "");
    }
    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: "no email for client" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }
    // Defence in depth: the trigger's WHEN clause already restricts this to
    // clients, but a contractor must never get the client email -- it describes a
    // completely different side of the platform.
    if (role && role !== "client") {
      return new Response(JSON.stringify({ ok: false, error: `not a client (${role})` }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const ok = await sendEmail(email, subject, welcomeHtml(first, mode, code));
    return new Response(JSON.stringify({ ok, mode }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("client-welcome error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
