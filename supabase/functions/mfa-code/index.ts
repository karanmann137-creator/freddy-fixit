import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM           = "noreply@freddyfixit.ca";
const admin          = createClient(SUPABASE_URL, SERVICE_KEY);

// No CORS allow-list and no browser entry point: this function is reachable
// ONLY from Postgres. mfa_request_code() mints the token and posts here.
const cors = { "Access-Control-Allow-Origin": "null" };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// AUTH. verify_jwt is NOT authentication here — the anon key is a valid
// project-signed JWT that ships in the public JS bundle, so it proves nothing.
// public.mfa_request_code mints a single-use 10-minute token via
// issue_internal_token('edge-internal') and sends it as x-ff-internal;
// redeeming it through the service-role client is what proves the caller is
// Postgres. This matters more here than anywhere else on the platform: a
// function that emails an arbitrary body to an arbitrary address, from our
// sending domain, in the shape of a security code, is a phishing kit. That is
// precisely what send-reminder was before it was closed.
async function callerIsInternal(req: Request): Promise<boolean> {
  const t = req.headers.get("x-ff-internal") ?? "";
  if (!t) return false;
  const { data, error } = await admin.rpc("consume_internal_token", {
    p_token: t,
    p_purpose: "edge-internal",
  });
  return !error && data === true;
}

const PURPOSE_COPY: Record<string, { subject: string; lead: string }> = {
  enroll: {
    subject: "Your Freddy Fix It verification code",
    lead: "Enter this code to finish turning on two-step sign-in.",
  },
  login: {
    subject: "Your Freddy Fix It sign-in code",
    lead: "Enter this code to finish signing in.",
  },
  disable: {
    subject: "Your Freddy Fix It verification code",
    lead: "Enter this code to turn OFF two-step sign-in.",
  },
};

function html(name: string, code: string, purpose: string) {
  const c = PURPOSE_COPY[purpose] ?? PURPOSE_COPY.login;
  const hi = name ? `Hi ${esc(name)},` : "Hi,";
  // The code is 6 digits generated in Postgres; esc() anyway, on principle.
  const digits = esc(code);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08);">
        <tr><td style="background:#1a2236;padding:20px 28px;">
          <div style="color:#f0f4ff;font-size:19px;font-weight:700;letter-spacing:.3px;">Freddy Fix It</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 14px;font-size:16px;color:#1f2937;">${hi}</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#374151;">${esc(c.lead)}</p>
          <div style="text-align:center;margin:0 0 22px;">
            <div style="display:inline-block;background:#f4f6fb;border:1px solid #e3e8f2;border-radius:12px;padding:16px 28px;">
              <span style="font-size:34px;letter-spacing:9px;font-weight:700;color:#1a2236;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${digits}</span>
            </div>
          </div>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#6b7280;">
            This code expires in <strong>10 minutes</strong> and can be used once.
          </p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#6b7280;">
            If you didn't ask for this, someone may have your password. Change it,
            and reply to this email so we can help.
          </p>
          <p style="margin:0;font-size:14px;line-height:1.55;color:#6b7280;">
            We will never phone, text or email you to ask for this code. Anyone who
            does is not us.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #eef1f6;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9099ab;">
            Freddy FixIt Contractors Inc. &middot; 20 Whiteram Mews NE, Calgary, AB<br/>
            This is a security message about your account, so it is sent whatever
            your email preferences are.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!(await callerIsInternal(req))) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, name, code, purpose } = await req.json();
    if (!email || !code) {
      return new Response(JSON.stringify({ error: "missing email or code" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const c = PURPOSE_COPY[String(purpose)] ?? PURPOSE_COPY.login;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Freddy Fix It <${FROM}>`,
        to: String(email),
        subject: c.subject,
        html: html(String(name ?? ""), String(code), String(purpose ?? "login")),
        // Deliberately NO List-Unsubscribe. This is transactional account
        // security mail, not a mailing list, and CASL's consent rules do not
        // reach it. Offering an unsubscribe on a sign-in code would let someone
        // opt out of being able to sign in.
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("resend failed", t);
      return new Response(JSON.stringify({ error: "send_failed" }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // The code is never echoed back, not even to an internal caller.
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mfa-code error", e);
    return new Response(JSON.stringify({ error: "error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
