import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  const { email, phone, name, role } = await req.json();
  const firstName = name ?? 'there';
  const isContractor = role === 'contractor';

  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
  const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
  const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_FROM');

  const results: Record<string, string> = {};

  // ── Email via Resend ──
  if (RESEND_KEY && email) {
    const subject = isContractor
      ? `Welcome to Freddy Fix It, ${firstName}!`
      : `Your request is in — welcome to Freddy Fix It!`;

    const html = isContractor
      ? `<div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#ea6b14">Welcome aboard, ${firstName}!</h2>
          <p>Your contractor application is being reviewed. We'll notify you as soon as your account is activated.</p>
          <p>In the meantime, complete your profile to stand out to clients.</p>
          <a href="https://freddyfixit.ca/contractor-dashboard" style="display:inline-block;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;margin-top:1rem">Go to Dashboard</a>
          <p style="color:#888;font-size:.8rem;margin-top:2rem">Freddy Fix It · Calgary Home Services</p>
        </div>`
      : `<div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#ea6b14">Your request is in, ${firstName}!</h2>
          <p>We've received your job request and contractors in your area are being notified. You'll hear back with bids soon.</p>
          <a href="https://freddyfixit.ca/client-dashboard" style="display:inline-block;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;text-decoration:none;border-radius:8px;margin-top:1rem">Track your request</a>
          <p style="color:#888;font-size:.8rem;margin-top:2rem">Freddy Fix It · Calgary Home Services</p>
        </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Freddy Fix It <noreply@freddyfixit.ca>', to: [email], subject, html }),
    });
    results.email = res.ok ? 'sent' : `failed:${res.status}`;
  } else {
    results.email = RESEND_KEY ? 'no_email' : 'no_key';
  }

  // ── SMS via Twilio ──
  if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM && phone) {
    const smsBody = isContractor
      ? `Hi ${firstName}, your Freddy Fix It contractor account is under review. We'll text you once you're approved!`
      : `Hi ${firstName}, your Freddy Fix It request is live! Contractors will reach out with bids. Track it at freddyfixit.ca`;

    const params = new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: smsBody });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    results.sms = res.ok ? 'sent' : `failed:${res.status}`;
  } else {
    results.sms = TWILIO_SID ? 'no_phone' : 'no_twilio_config';
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
