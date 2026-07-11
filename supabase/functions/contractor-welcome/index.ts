// Supabase Edge Function: contractor-welcome
// Sends a warm welcome email to a contractor right after they finish signing up.
// CAMPAIGN WINDOW: the DB trigger that fires this (contractor_welcome_email on
// public.contractors) auto-expires at midnight Sept 11→12, 2026 (Calgary) — two
// months from launch. The function itself stays deployed but stops being called.
// Fired fire-and-forget from a Postgres AFTER INSERT trigger via net.http_post
// (anon bearer). verify_jwt = false (called by the DB, not an end user); it only
// reads via service role and emails the contractor's own signup address.
// Secret needed: RESEND_API_KEY (SUPABASE_URL / SERVICE_ROLE_KEY auto-injected).
// Test without a real signup: POST { "test": true } → sends the email to the admin.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL       = "noreply@freddyfixit.ca";
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

function welcomeHtml(firstName: string) {
  const hi = firstName ? `Welcome to the team, ${esc(firstName)}!` : "Welcome to the team!";
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
    <h2 style="color:#ea6b14;margin:0 0 1rem;">${hi}</h2>
    <p style="font-size:15px;line-height:1.6;margin:.5rem 0;">We're excited you've decided to join Freddy Fix It and work with us. You're now part of Calgary's vetted network of trades and handymen.</p>
    <p style="font-size:15px;line-height:1.6;margin:.75rem 0;"><strong>What happens next:</strong> we're actively bringing clients onto the platform, and we expect jobs to start coming in consistently over the next 3–5 weeks.</p>
    <p style="font-size:15px;line-height:1.6;margin:.75rem 0;">Whenever a client posts a job that matches your trade and service area, we'll email you right away so you can get your bid in early — no lead fees, ever.</p>
    <p style="font-size:15px;line-height:1.6;margin:.75rem 0;">In the meantime, the best thing you can do is finish your profile and set up payouts — pros with complete profiles get approved and hired faster.</p>
    <a href="${SITE}/contractor-dashboard" style="display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">Open your dashboard</a>
    <p style="font-size:15px;line-height:1.6;margin:1.25rem 0 0;">Thanks again — we look forward to working with you.<br>— The Freddy Fix It team</p>
    <p style="margin-top:1.5rem;font-size:12px;color:#9aa4bf;">You're receiving this because you created a contractor account at freddyfixit.ca.<br>${esc(MAILING_ADDRESS)}</p>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) console.error("Resend error:", JSON.stringify(data));
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));

    // Admin test hook: sends the exact email to the admin inbox, no contractor involved.
    if (body?.test === true) {
      const ok = await sendEmail(ADMIN_EMAIL, "[TEST] Welcome to Freddy Fix It — here's what happens next", welcomeHtml("Test"));
      return new Response(JSON.stringify({ ok }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const id = String(body?.id || "");
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: "missing id" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Look up the contractor's name + email (profile first, auth as fallback).
    let email: string | null = null, first = "";
    const { data: p } = await admin.from("profiles").select("first_name,email").eq("id", id).maybeSingle();
    if (p) { first = p.first_name ?? ""; email = p.email ?? null; }
    if (!email) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      email = u?.user?.email ?? null;
      if (!first) first = String((u?.user?.user_metadata as any)?.first_name ?? "");
    }
    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: "no email for contractor" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const ok = await sendEmail(email, "Welcome to Freddy Fix It — here's what happens next", welcomeHtml(first));
    return new Response(JSON.stringify({ ok }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("contractor-welcome error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
