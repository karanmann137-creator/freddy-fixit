// Supabase Edge Function: notify-client
// Sends an SMS to a client when a contractor bids, schedules, or completes a job.
// Deploy: supabase functions deploy notify-client --no-verify-jwt
// Secrets needed: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const TWILIO_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const FROM_NUMBER  = Deno.env.get("TWILIO_FROM_NUMBER")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType = "bid_received" | "job_scheduled" | "job_completed";

async function sendSms(to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
    },
    body: new URLSearchParams({ To: to, From: FROM_NUMBER, Body: body }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Twilio error:", err);
    throw new Error("SMS failed: " + err);
  }
  return res.json();
}

function buildMessage(event: EventType, data: {
  clientName: string;
  contractorName: string;
  service: string;
  amount?: number;
  scheduledAt?: string;
}): string {
  const { clientName, contractorName, service, amount, scheduledAt } = data;
  switch (event) {
    case "bid_received":
      return `Hi ${clientName}! ${contractorName} placed a bid of $${amount} for your ${service} job on Freddy Fix It. Log in to review: freddyfixit.ca/client-dashboard`;
    case "job_scheduled":
      const when = scheduledAt ? new Date(scheduledAt).toLocaleString("en-CA", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" }) : "the agreed time";
      return `Hi ${clientName}! Your ${service} job with ${contractorName} is booked for ${when}${amount ? " ($" + amount + ")" : ""}. Freddy Fix It`;
    case "job_completed":
      return `Hi ${clientName}! ${contractorName} has marked your ${service} job complete. Log in to confirm and leave a review: freddyfixit.ca/client-dashboard`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { event, job_id } = await req.json() as { event: EventType; job_id: string };

    if (!event || !job_id) {
      return new Response(JSON.stringify({ error: "event and job_id are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Load job with client and contractor details
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select(`
        id, status, amount, scheduled_at,
        request:client_requests!jobs_request_id_fkey(service_needed),
        client:profiles!jobs_client_id_fkey(first_name, phone),
        contractor:profiles!jobs_contractor_id_fkey(first_name, last_name)
      `)
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const clientPhone: string | null = job.client?.phone ?? null;
    if (!clientPhone) {
      return new Response(JSON.stringify({ status: "skipped", reason: "no client phone" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Normalize phone to E.164
    const digits = clientPhone.replace(/\D/g, "");
    const e164 = digits.startsWith("1") ? "+" + digits : "+1" + digits;

    const message = buildMessage(event, {
      clientName: job.client?.first_name ?? "there",
      contractorName: [job.contractor?.first_name, job.contractor?.last_name].filter(Boolean).join(" ") || "Your contractor",
      service: job.request?.service_needed ?? "repair",
      amount: job.amount ?? undefined,
      scheduledAt: job.scheduled_at ?? undefined,
    });

    await sendSms(e164, message);

    return new Response(JSON.stringify({ status: "sent", to: e164 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
