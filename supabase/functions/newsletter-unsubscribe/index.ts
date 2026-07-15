// newsletter-unsubscribe v1 — public one-click unsubscribe endpoint.
// GET or POST (Gmail one-click sends POST per RFC 8058) with ?t=<unsub_token>.
// Marks the matching newsletter_subscribers row unsubscribed. Always returns the
// same friendly page whether or not the token matched (no existence leak).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAGE = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Unsubscribed — Freddy Fix It</title></head>" +
  '<body style="margin:0;background:#0f1524;font-family:Arial,Helvetica,sans-serif">' +
  '<div style="max-width:520px;margin:60px auto;padding:0 16px">' +
  '<div style="background:#1a2236;border:1px solid rgba(234,107,20,.35);border-radius:12px;padding:34px 28px;color:#f0f4ff;text-align:center">' +
  '<div style="font-size:22px;font-weight:bold;color:#ea6b14;letter-spacing:.5px;margin-bottom:14px">FREDDY FIX IT</div>' +
  '<h1 style="font-size:20px;margin:0 0 12px">You’re unsubscribed</h1>' +
  '<p style="line-height:1.6;color:#c6cde0;margin:0 0 18px">You won’t receive any more tips emails from us. ' +
  "If this was a mistake, you can re-subscribe any time from the form in the footer at freddyfixit.ca.</p>" +
  '<a href="https://freddyfixit.ca" style="color:#ea6b14">Back to freddyfixit.ca</a>' +
  "</div></div></body></html>";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const t = url.searchParams.get("t") ?? "";
  if (UUID_RE.test(t)) {
    try {
      await sb.from("newsletter_subscribers")
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq("unsub_token", t)
        .is("unsubscribed_at", null);
    } catch { /* always show the same page */ }
  }
  return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
