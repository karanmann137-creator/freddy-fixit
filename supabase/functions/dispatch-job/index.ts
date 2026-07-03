import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL     = "noreply@freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const cors  = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const RESERVE_MS = 48 * 60 * 60 * 1000; // preferred-pro reservation window

// ── Calgary geography (email ranking only) ───────────────────────────────────
function extractZones(location: string): string[] {
  const loc = location.toUpperCase();
  const zones: string[] = [];
  for (const q of ["NW", "NE", "SW", "SE"])
    if (loc.includes(q)) zones.push(q);
  for (const s of ["AIRDRIE","COCHRANE","CHESTERMERE","OKOTOKS","STRATHMORE"])
    if (loc.includes(s)) zones.push(s.charAt(0) + s.slice(1).toLowerCase());
  return zones;
}

const TRADE_MAP: Record<string, string[]> = {
  plumbing:    ["plumbing","pipe","drain","water","leak","faucet","toilet"],
  electrical:  ["electrical","electric","wiring","outlet","breaker","light"],
  hvac:        ["hvac","furnace","heating","cooling","duct","boiler","thermostat"],
  carpentry:   ["carpentry","wood","cabinet","door","window","deck","fence","trim","frame"],
  painting:    ["painting","paint","stain","drywall","patch"],
  drywall:     ["drywall","plaster","patch","ceiling","wall"],
  flooring:    ["floor","tile","hardwood","laminate","carpet","grout"],
  roofing:     ["roof","shingle","gutter","soffit","fascia","siding"],
  landscaping: ["landscap","lawn","garden","sod","fence","yard"],
  snow:        ["snow","ice","salt","shovel","plow"],
  concrete:    ["concrete","masonry","brick","stone","patio","driveway","foundation"],
  vehicle:     ["oil change","tire","battery","brake","vehicle","car","truck"],
  cleaning:    ["clean","wash","pressure","sanitize"],
  garage:      ["garage","door opener"],
  ac:          ["air condition","ac ","a/c","cooling"],
  general:     ["general","handyman","repair","fix","maintenance"],
};

// Scoring is used ONLY to order the emails, not to decide who matches.
function score(c: any, request: any): number {
  const svc   = request.service_needed?.toLowerCase() ?? "";
  const specs = (c.specialties ?? []).map((s: string) => s.toLowerCase());
  const area  = (c.service_area ?? []).map((a: string) => a.toUpperCase());
  const zones = extractZones(request.location ?? "");

  let s = 0;
  for (const [trade, keywords] of Object.entries(TRADE_MAP)) {
    if (keywords.some(k => svc.includes(k)) && specs.some(sp => sp.includes(trade) || keywords.some(k => sp.includes(k)))) { s += 40; break; }
  }
  if (zones.some(z => area.some(a => a.includes(z)))) s += 30;
  else if (area.some(a => a === "CALGARY" || a.includes("ALL"))) s += 20;
  s += c.rating != null ? (c.rating / 10) * 20 : 10;
  const rr = (c.jobs_dispatched ?? 0) > 0 ? Math.min((c.total_jobs ?? 0) / c.jobs_dispatched, 1) : 0.5;
  s += rr * 10;
  return s;
}

// ── Main ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { request_id } = await req.json();
    if (!request_id) return new Response(JSON.stringify({ error: "request_id required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: request } = await admin
      .from("client_requests")
      .select("id, service_needed, location, preferred_schedule, job_description, dispatched_to, status, preferred_contractor_id, created_at")
      .eq("id", request_id).single();
    if (!request) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    if (request.status !== "pending") return new Response(JSON.stringify({ status: "not_pending" }), { headers: { ...cors, "Content-Type": "application/json" } });

    const alreadyNotified: string[] = request.dispatched_to ?? [];

    // Is this request still reserved for a specific pro (rehire flow)?
    const reserved = !!request.preferred_contractor_id &&
      !!request.created_at &&
      (Date.now() - new Date(request.created_at).getTime() < RESERVE_MS);

    // Same matcher as the feed + in-app notifier: map the client's service label
    // to the required contractor specialties. No row -> passthrough (match all).
    const { data: mapRow } = await admin
      .from("service_specialty_map")
      .select("specialties")
      .eq("service", request.service_needed).maybeSingle();
    const required: string[] | null = mapRow?.specialties ?? null;
    const specialtyMatch = (c: any) =>
      required === null || (c.specialties ?? []).some((s: string) => required.includes(s));

    // Contractors who dismissed this job shouldn't be emailed about it.
    const { data: hidden } = await admin
      .from("hidden_jobs").select("contractor_id").eq("request_id", request_id);
    const hiddenIds = new Set((hidden ?? []).map((h: any) => h.contractor_id));

    const { data: contractors } = await admin
      .from("contractors")
      .select(`id, specialties, service_area, availability, rating, total_jobs, jobs_dispatched,
               profile:profiles!contractors_id_fkey(first_name, last_name, email)`)
      .eq("status", "active");

    if (!contractors?.length)
      return new Response(JSON.stringify({ status: "no_contractors" }), { headers: { ...cors, "Content-Type": "application/json" } });

    let matched: any[];
    if (reserved) {
      // Reservation window: only the requested pro gets the email.
      matched = contractors.filter(c =>
        c.id === request.preferred_contractor_id &&
        !alreadyNotified.includes(c.id) &&
        !hiddenIds.has(c.id));
    } else {
      matched = contractors
        .filter(c => !alreadyNotified.includes(c.id) && !hiddenIds.has(c.id) && specialtyMatch(c))
        .sort((a, b) => score(b, request) - score(a, request));
    }

    if (!matched.length)
      return new Response(JSON.stringify({ status: "no_match" }), { headers: { ...cors, "Content-Type": "application/json" } });

    const notifiedIds: string[] = [];

    for (const c of matched) {
      const email = c.profile?.email;
      if (!email) continue;

      const name = c.profile?.first_name ?? "there";
      const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
        <h2 style="color:#ea6b14;">New job request 🔧</h2>
        <p>Hi ${name}, there's a new job that matches your skills. Jobs close after 3 bids — first come, first served.</p>
        <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;width:120px;">SERVICE</td><td style="padding:.5rem 0;font-weight:500;">${request.service_needed}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">LOCATION</td><td style="padding:.5rem 0;">${request.location}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">TIMING</td><td style="padding:.5rem 0;">${request.preferred_schedule}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">DETAILS</td><td style="padding:.5rem 0;font-size:.9rem;">${request.job_description ?? "—"}</td></tr>
        </table>
        <a href="https://freddyfixit.ca/contractor-dashboard" style="display:inline-block;margin-top:.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">View &amp; Bid on Job →</a>
        <p style="margin-top:1.5rem;font-size:.78rem;color:rgba(190,205,235,.35);">You're receiving this because you're an active Freddy Fix It contractor. Questions? hello@freddyfixit.ca</p>
      </div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: `Freddy Fix It <${FROM_EMAIL}>`,
          to: email,
          subject: `New ${request.service_needed} job in ${(request.location ?? "").split(",")[0]}`,
          html,
        }),
      });

      if (res.ok) {
        notifiedIds.push(c.id);
        await admin.from("contractors").update({ jobs_dispatched: (c.jobs_dispatched ?? 0) + 1 }).eq("id", c.id);
      }
    }

    if (notifiedIds.length) {
      await admin.from("client_requests")
        .update({ dispatched_to: [...alreadyNotified, ...notifiedIds] })
        .eq("id", request_id);
    }

    return new Response(JSON.stringify({ status: "dispatched", notified: notifiedIds.length, reserved }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
