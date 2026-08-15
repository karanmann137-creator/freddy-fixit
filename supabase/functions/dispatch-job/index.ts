import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// v16 (2026-08-14): the DETAILS row is now run through scrubAddressText() —
// masking the LOCATION field was pointless while the description underneath
// still printed the street address the client typed. Also v15's waitlist guard.
//
// v14 (2026-07-30): the new-job email now leads with urgency — bidding is
// first-come, first-served and jobs close at the bid cap, so the subject says
// so outright. When the request is reserved for a specific pro (rehire flow)
// the copy switches to "a past client requested you" instead, because that
// pro's in-app `rehire_request` bell no longer sends its own email
// (send-notification suppresses it) — this is now their only email.
//
// ONE email per contractor per job is guaranteed by two independent guards:
// `dispatched_to` (nobody already in the array is emailed again, so
// re-invoking this function is idempotent) and send-notification's
// EMAIL_HANDLED_ELSEWHERE suppression of `job_in_field` + `rehire_request`.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL     = "noreply@freddyfixit.ca";

// Keep in step with place_bid()'s v_cap and the /7 counters on the dashboards.
const BID_CAP = 7;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const cors  = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const RESERVE_MS = 48 * 60 * 60 * 1000; // preferred-pro reservation window

// ── Calgary geography (email ranking only) ─────────────────────────────────
function extractZones(location: string): string[] {
  const loc = location.toUpperCase();
  const zones: string[] = [];
  for (const q of ["NW", "NE", "SW", "SE"])
    if (loc.includes(q)) zones.push(q);
  for (const s of ["AIRDRIE","COCHRANE","CHESTERMERE","OKOTOKS","STRATHMORE"])
    if (loc.includes(s)) zones.push(s.charAt(0) + s.slice(1).toLowerCase());
  return zones;
}

// Mask the client's address for the dispatch email — contractors only get the
// full street address after they WIN the job (RLS-gated). Mirrors the
// public.mask_location() SQL helper: "T2P 0R5 · NW Calgary".
function maskLocation(loc: string): string {
  const raw = loc ?? "";
  let pc: string | null = null;
  const pcm = raw.match(/([A-Za-z][0-9][A-Za-z]\s*[0-9][A-Za-z][0-9])/);
  if (pcm) { const z = pcm[1].replace(/\s/g, "").toUpperCase(); pc = z.slice(0, 3) + " " + z.slice(3, 6); }
  let zone: string | null = null;
  const town = raw.match(/(Airdrie|Cochrane|Chestermere|Okotoks|Strathmore)/i);
  const q = raw.match(/\b(NW|NE|SW|SE)\b/i);
  if (town) zone = town[1].charAt(0).toUpperCase() + town[1].slice(1).toLowerCase();
  else if (q) zone = q[1].toUpperCase() + " Calgary";
  else if (/downtown|beltline/i.test(raw)) zone = "Downtown / Beltline";
  const parts = [pc, zone].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Calgary area";
}

// Clients routinely paste the street address into the free-text description,
// which defeats maskLocation() entirely — the LOCATION row says "T2P 0R5 · NW
// Calgary" while the DETAILS row underneath prints "1234 17 Ave SW". This is
// the TS twin of public.scrub_address_text(); keep the two in step. Both are
// deliberately conservative: a civic address must carry a street SUFFIX word,
// so "sink on the 2nd floor" and "24 hour access" survive untouched.
const STREET_SUFFIX =
  "st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|cres|crescent|way|close|cl|court|ct|place|pl|" +
  "gate|green|grove|bay|link|mews|terrace|trail|tr|rise|point|pt|landing|manor|heights|hts|parkway|pkwy|" +
  "lane|ln|circle|cir|hill|row|common|commons|gardens|gdns|villas|square|sq";

function scrubAddressText(t: string | null | undefined): string | null {
  if (!t) return null;
  return t
    // The trailing quadrant is \b-anchored on purpose: without it, "ne" greedily
    // ate the first two letters of the next word ("Drive needs" -> "Drive ne|eds").
    .replace(
      new RegExp(
        `\\b\\d{1,6}\\s+[A-Za-z0-9'.\\-]+(\\s+[A-Za-z0-9'.\\-]+)?\\s+(${STREET_SUFFIX})\\b\\.?(\\s+(nw|ne|sw|se)\\b)?`,
        "gi",
      ),
      "[address hidden]",
    )
    .replace(/\b[A-Za-z]\d[A-Za-z][ \-]?\d[A-Za-z]\d\b/gi, "[postal code hidden]");
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

// ── Main ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { request_id } = await req.json();
    if (!request_id) return new Response(JSON.stringify({ error: "request_id required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: request } = await admin
      .from("client_requests")
      .select("id, service_needed, location, preferred_schedule, job_description, dispatched_to, status, preferred_contractor_id, created_at, waitlisted")
      .eq("id", request_id).single();
    if (!request) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    // Waitlist mode: this function is deployed verify_jwt=false, so it is
    // PUBLICLY callable — anyone holding a request UUID could POST here and
    // force the "URGENT — bid now" blast out to every matched contractor. The
    // Postgres callers are already gated on client_requests.waitlisted, but
    // this guard is the single choke point that makes that gate unbypassable.
    // 200, not an error: a waitlisted request is a normal no-op, and the DB
    // callers wrap this in an exception guard where a non-2xx is just log noise.
    if (request.waitlisted) return new Response(JSON.stringify({ status: "skipped", reason: "waitlisted" }), { headers: { ...cors, "Content-Type": "application/json" } });

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
    const area = maskLocation(request.location ?? "");

    // A reserved job is a rehire: the client asked for this pro by name, so the
    // copy leads with that rather than with the open-bidding race.
    const kicker  = reserved ? "A past client requested you" : "Urgent — bid now";
    const heading = reserved
      ? `${request.service_needed} job in ${area} — reserved for you 🔧`
      : `New ${request.service_needed} job in ${area} 🔧`;
    const subject = reserved
      ? `A past client requested you — ${request.service_needed} job in ${area}`
      : `URGENT — new ${request.service_needed} job in ${area}, bid now`;

    for (const c of matched) {
      const email = c.profile?.email;
      if (!email) continue;

      const name  = c.profile?.first_name ?? "there";
      const intro = reserved
        ? `Hi ${name}, a client you've worked with asked for you by name. This job is held for you for 48 hours before it opens to other pros — send your estimate to lock it in.`
        : `Hi ${name}, a job in your trade was just posted. Bidding is first come, first served and the job closes once it has ${BID_CAP} bids — get your estimate in early.`;

      const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;">
        <p style="margin:0 0 .4rem;color:#ea6b14;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;">${kicker}</p>
        <h2 style="color:#ea6b14;margin:0 0 .6rem;">${heading}</h2>
        <p>${intro}</p>
        <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;width:120px;">SERVICE</td><td style="padding:.5rem 0;font-weight:500;">${request.service_needed}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">LOCATION</td><td style="padding:.5rem 0;">${area}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">TIMING</td><td style="padding:.5rem 0;">${request.preferred_schedule}</td></tr>
          <tr><td style="padding:.5rem 0;color:rgba(190,205,235,.5);font-size:.82rem;">DETAILS</td><td style="padding:.5rem 0;font-size:.9rem;">${scrubAddressText(request.job_description) ?? "—"}</td></tr>
        </table>
        <a href="https://freddyfixit.ca/contractor-dashboard" style="display:inline-block;margin-top:.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Go bid on this job →</a>
        <p style="margin-top:1.5rem;font-size:.82rem;color:rgba(190,205,235,.55);">New to bidding? The <a href="https://freddyfixit.ca/contractor-guide" style="color:#ea6b14;">contractor guide</a> walks through how bidding and payment work.</p>
        <p style="margin-top:1rem;font-size:.78rem;color:rgba(190,205,235,.35);">You're receiving this because you're an active Freddy Fix It contractor. Questions? hello@freddyfixit.ca</p>
      </div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: `Freddy Fix It <${FROM_EMAIL}>`,
          to: email,
          subject,
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
