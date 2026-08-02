import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Ic } from "@/components/Ic";

// ─────────────────────────────────────────────────────────────────────────────
// Location SEO landing pages. Each entry targets local searches people type
// ("handyman airdrie", "calgary nw plumber", etc.). CTA sends people into the
// normal client-onboarding flow. Trust cues + JSON-LD mirror ServiceLanding.
// ─────────────────────────────────────────────────────────────────────────────
type FAQ = { q: string; a: string };
type Area = {
  name: string;         // display name, e.g. "Calgary NW"
  region: string;       // areaServed for schema, e.g. "Northwest Calgary, AB"
  kind: "zone" | "town";
  metaTitle: string;
  metaDesc: string;
  h1: string;
  intro: string[];
  places: string[];     // neighbourhoods / nearby spots for local relevance
};

export const AREAS: Record<string, Area> = {
  "calgary-nw": {
    name: "Calgary NW",
    region: "Northwest Calgary, AB",
    kind: "zone",
    metaTitle: "Handyman & Trades in NW Calgary | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Need a handyman, plumber or electrician in Northwest Calgary? Post your job free and get up to 5 fixed-price estimates from vetted local pros. Payment held until the work is done right.",
    h1: "Home Services in Northwest Calgary",
    intro: [
      "Freddy Fix It connects Northwest Calgary homeowners with vetted, licensed and insured local tradespeople — for everything from a quick handyman fix to plumbing, electrical, HVAC and full renovations.",
      "Post your job in a couple of minutes, get up to five fixed-price estimates from pros who work your area, and book the one you like best. Your payment is held securely and only released once you confirm the work is done right.",
    ],
    places: ["Tuscany", "Royal Oak", "Ranchlands", "Varsity", "Brentwood", "Bowness", "Arbour Lake", "Silver Springs"],
  },
  "calgary-ne": {
    name: "Calgary NE",
    region: "Northeast Calgary, AB",
    kind: "zone",
    metaTitle: "Handyman & Trades in NE Calgary | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Looking for a handyman, plumber or electrician in Northeast Calgary? Get up to 5 fixed-price estimates from vetted local pros. Free to post, payment protected until you approve.",
    h1: "Home Services in Northeast Calgary",
    intro: [
      "From Saddle Ridge to Marlborough, Freddy Fix It matches Northeast Calgary homeowners with vetted, licensed and insured pros for repairs, installs, seasonal work and bigger projects.",
      "Describe what you need, compare up to five fixed-price estimates from local tradespeople, and choose your pro. Funds are held safely and released only when you confirm the job is complete.",
    ],
    places: ["Saddle Ridge", "Martindale", "Falconridge", "Marlborough", "Skyview Ranch", "Redstone", "Cityscape", "Coral Springs"],
  },
  "calgary-sw": {
    name: "Calgary SW",
    region: "Southwest Calgary, AB",
    kind: "zone",
    metaTitle: "Handyman & Trades in SW Calgary | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Need home repairs in Southwest Calgary? Post your job free and get up to 5 fixed-price estimates from vetted, insured local pros. Payment held until you are satisfied.",
    h1: "Home Services in Southwest Calgary",
    intro: [
      "Freddy Fix It connects Southwest Calgary homeowners with vetted, licensed and insured local tradespeople — handyman work, plumbing, electrical, painting, landscaping and more.",
      "Post your job, get up to five fixed-price estimates from pros who work the southwest, and book with confidence. Your payment is held securely until you confirm the work is done right.",
    ],
    places: ["Signal Hill", "Aspen Woods", "Springbank Hill", "Killarney", "Marda Loop", "Lakeview", "Bridlewood", "Evergreen"],
  },
  "calgary-se": {
    name: "Calgary SE",
    region: "Southeast Calgary, AB",
    kind: "zone",
    metaTitle: "Handyman & Trades in SE Calgary | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Find a handyman, plumber or electrician in Southeast Calgary. Get up to 5 fixed-price estimates from vetted local pros. Free to post, payment protected until you approve.",
    h1: "Home Services in Southeast Calgary",
    intro: [
      "From Seton to Inglewood, Freddy Fix It matches Southeast Calgary homeowners with vetted, licensed and insured pros for repairs, installs and renovations of every size.",
      "Tell us what you need, compare up to five fixed-price estimates from local tradespeople, and pick the pro you like. Payment is held safely and released only when you confirm the job is complete.",
    ],
    places: ["Seton", "Auburn Bay", "Mahogany", "Cranston", "McKenzie Towne", "Douglasdale", "Inglewood", "Copperfield"],
  },
  "airdrie": {
    name: "Airdrie",
    region: "Airdrie, AB",
    kind: "town",
    metaTitle: "Handyman & Trades in Airdrie | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Need a handyman, plumber or electrician in Airdrie? Post your job free and get up to 5 fixed-price estimates from vetted, insured local pros. Payment held until the work is done right.",
    h1: "Home Services in Airdrie",
    intro: [
      "Freddy Fix It connects Airdrie homeowners with vetted, licensed and insured local tradespeople — for handyman jobs, plumbing, electrical, HVAC, landscaping, snow removal and full renovations.",
      "Post your job in a couple of minutes, get up to five fixed-price estimates from pros who serve Airdrie, and book the one you like best. Your payment is held securely until you confirm the work is done.",
    ],
    places: ["Bayside", "Kings Heights", "Cooper's Crossing", "Sagewood", "Windsong", "Luxstone", "Ravenswood", "Prairie Springs"],
  },
  "cochrane": {
    name: "Cochrane",
    region: "Cochrane, AB",
    kind: "town",
    metaTitle: "Handyman & Trades in Cochrane | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Looking for a handyman, plumber or electrician in Cochrane? Get up to 5 fixed-price estimates from vetted local pros. Free to post, payment protected until you approve.",
    h1: "Home Services in Cochrane",
    intro: [
      "From Sunset Ridge to Heartland, Freddy Fix It matches Cochrane homeowners with vetted, licensed and insured pros for repairs, installs, seasonal work and bigger projects.",
      "Describe what you need, compare up to five fixed-price estimates from local tradespeople, and choose your pro. Funds are held safely and released only when you confirm the job is complete.",
    ],
    places: ["Sunset Ridge", "Heartland", "Fireside", "Riversong", "The Willows", "Bow Ridge", "GlenEagles", "Cochrane Lake"],
  },
  "okotoks": {
    name: "Okotoks",
    region: "Okotoks, AB",
    kind: "town",
    metaTitle: "Handyman & Trades in Okotoks | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Need home repairs in Okotoks? Post your job free and get up to 5 fixed-price estimates from vetted, insured local pros. Payment held until you are satisfied.",
    h1: "Home Services in Okotoks",
    intro: [
      "Freddy Fix It connects Okotoks homeowners with vetted, licensed and insured local tradespeople — handyman work, plumbing, electrical, painting, landscaping and more.",
      "Post your job, get up to five fixed-price estimates from pros who serve Okotoks, and book with confidence. Your payment is held securely until you confirm the work is done right.",
    ],
    places: ["Drake Landing", "Air Ranch", "Cimarron", "Sheep River", "Crystal Shores", "Wedderburn", "Suntree", "Mountainview"],
  },
  "chestermere": {
    name: "Chestermere",
    region: "Chestermere, AB",
    kind: "town",
    metaTitle: "Handyman & Trades in Chestermere | Vetted Local Pros — Freddy Fix It",
    metaDesc: "Find a handyman, plumber or electrician in Chestermere. Get up to 5 fixed-price estimates from vetted local pros. Free to post, payment protected until you approve.",
    h1: "Home Services in Chestermere",
    intro: [
      "From Westmere to Rainbow Falls, Freddy Fix It matches Chestermere homeowners with vetted, licensed and insured pros for repairs, installs and renovations of every size.",
      "Tell us what you need, compare up to five fixed-price estimates from local tradespeople, and pick the pro you like. Payment is held safely and released only when you confirm the job is complete.",
    ],
    places: ["Westmere", "Rainbow Falls", "Kinniburgh", "The Cove", "Dawson's Landing", "Lakepointe", "Sunset", "Clearwater"],
  },
};

export const AREA_SLUGS = Object.keys(AREAS);

// Popular services surfaced on every area page for internal linking + relevance.
const POPULAR: { label: string; slug: string }[] = [
  { label: "Handyman", slug: "handyman" },
  { label: "Plumbers", slug: "plumbing" },
  { label: "Electricians", slug: "electrical" },
  { label: "HVAC & Furnace", slug: "hvac" },
  { label: "Painters", slug: "painting" },
  { label: "Drywall & Flooring", slug: "drywall-flooring" },
  { label: "Landscaping", slug: "landscaping" },
  { label: "Snow Removal", slug: "snow-removal" },
];

function upsertMeta(selector: string, attr: "name" | "property" | "rel", key: string, content: string, valueAttr: "content" | "href" = "content") {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = document.createElement(selector.startsWith("link") ? "link" : "meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, content);
}

const ORANGE = "#ea6b14";
const TEXT = "var(--ff-text)";
const MUTED = "rgba(var(--ff-muted), .82)";

function areaFaqs(a: Area): FAQ[] {
  return [
    { q: "How much does a handyman cost in " + a.name + "?", a: "Most work is estimated by the job rather than the hour, so you see one fixed price before you book. You get up to five estimates from local pros to compare, with no obligation." },
    { q: "Are the contractors in " + a.name + " vetted?", a: "Yes. Every contractor on Freddy Fix It is reviewed for licensing, insurance and WCB coverage where it applies, and you can read real reviews on their profile before you book." },
    { q: "What if the work isn't done right?", a: "Your payment is held until you confirm the job is complete. If something's wrong, you can file a claim and our team helps resolve it — including a refund where warranted." },
  ];
}

export default function AreaLanding() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const slug = params.slug ?? "";
  const area = AREAS[slug];

  useEffect(() => {
    if (!area) { setLocation("/areas"); return; }
    const faqs = areaFaqs(area);
    const url = "https://freddyfixit.ca/areas/" + slug;
    const prevTitle = document.title;
    document.title = area.metaTitle;
    upsertMeta('meta[name="description"]', "name", "description", area.metaDesc);
    upsertMeta('link[rel="canonical"]', "rel", "canonical", url, "href");
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[property="og:title"]', "property", "og:title", area.metaTitle);
    upsertMeta('meta[property="og:description"]', "property", "og:description", area.metaDesc);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", area.metaTitle);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", area.metaDesc);

    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          "name": area.h1,
          "serviceType": "Home repairs and maintenance",
          "areaServed": { "@type": "Place", "name": area.region },
          "provider": {
            "@type": "LocalBusiness",
            "name": "Freddy Fix It",
            "url": "https://freddyfixit.ca/",
            "email": "hello@freddyfixit.ca",
            "areaServed": area.region,
            "priceRange": "$$",
          },
          "url": url,
          "description": area.metaDesc,
        },
        {
          "@type": "FAQPage",
          "mainEntity": faqs.map((f) => ({
            "@type": "Question",
            "name": f.q,
            "acceptedAnswer": { "@type": "Answer", "text": f.a },
          })),
        },
      ],
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-area-ld", "1");
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);

    return () => {
      document.title = prevTitle;
      const ex = document.head.querySelector('script[data-area-ld="1"]');
      if (ex) ex.remove();
    };
  }, [area, slug, setLocation]);

  if (!area) return null;

  const faqs = areaFaqs(area);
  const book = () => { window.location.href = "/client-onboarding"; };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", color: TEXT, minHeight: "100vh", padding: "6rem clamp(1rem, 4vw, 1.5rem) 5rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{"h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.05em} .al-btn{background:#ea6b14;color:#fff;border:none;padding:.85rem 1.6rem;border-radius:8px;font-size:1.02rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:transform .15s,box-shadow .15s} .al-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(234,107,20,.32)} .al-link{color:#ea6b14;text-decoration:none} .al-link:hover{text-decoration:underline} .al-card{background:var(--ff-surface);border:1px solid rgba(var(--ff-fg), .07);border-radius:12px;padding:1.1rem 1.2rem}"}</style>

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <button onClick={() => setLocation("/areas")} style={{ background: "transparent", border: "1px solid rgba(var(--ff-fg), .12)", color: "rgba(var(--ff-muted), .6)", padding: ".4rem .9rem", borderRadius: 6, cursor: "pointer", fontSize: ".82rem", fontFamily: "'DM Sans',sans-serif" }}>← All service areas</button>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1.4rem" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(234,107,20,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ic name="map-pin" size={30} color={ORANGE} />
          </div>
          <h1 style={{ fontSize: "2.4rem", margin: 0, lineHeight: 1.05 }}>{area.h1}</h1>
        </div>

        {area.intro.map((p, i) => (
          <p key={i} style={{ lineHeight: 1.8, color: MUTED, fontWeight: 300, marginTop: i === 0 ? "1.4rem" : "1rem", fontSize: "1.05rem" }}>{p}</p>
        ))}

        <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap", margin: "1.8rem 0 2.4rem" }}>
          <button className="al-btn" onClick={book}>Get up to 5 free estimates →</button>
        </div>

        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "2.6rem" }}>
          {[
            { icon: "user-check", t: "Vetted, licensed & insured" },
            { icon: "dollar", t: "Payment held until you confirm" },
            { icon: "map-pin", t: "Local to " + area.name },
          ].map((b) => (
            <div key={b.t} style={{ display: "flex", alignItems: "center", gap: ".45rem", background: "var(--ff-surface)", border: "1px solid rgba(var(--ff-fg), .07)", borderRadius: 999, padding: ".4rem .9rem", fontSize: ".86rem", color: MUTED }}>
              <Ic name={b.icon as any} size={15} color={ORANGE} />{b.t}
            </div>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.5rem", marginBottom: "1rem" }}>Popular services in {area.name}</h2>
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "2.6rem" }}>
          {POPULAR.map((s) => (
            <a key={s.slug} className="al-link" href={"/services/" + s.slug} style={{ background: "var(--ff-surface)", border: "1px solid rgba(var(--ff-fg), .07)", borderRadius: 999, padding: ".4rem .9rem", fontSize: ".88rem" }}>{s.label}</a>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.5rem", marginBottom: "1rem" }}>Areas we cover near {area.name}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))", gap: ".6rem", marginBottom: "2.6rem" }}>
          {area.places.map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: ".5rem", color: MUTED, fontSize: ".98rem" }}>
              <Ic name="check-circle" size={16} color={ORANGE} />{c}
            </div>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.5rem", marginBottom: "1rem" }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(160px, 100%), 1fr))", gap: ".8rem", marginBottom: "2.6rem" }}>
          {[
            { n: "1", t: "Post your job", d: "Tell us what you need — it takes a couple of minutes." },
            { n: "2", t: "Compare estimates", d: "Get up to 5 fixed-price estimates from vetted local pros." },
            { n: "3", t: "Book & relax", d: "Payment is held until you confirm the work is done right." },
          ].map((s) => (
            <div key={s.n} className="al-card">
              <div style={{ color: ORANGE, fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.6rem" }}>{s.n}</div>
              <div style={{ fontWeight: 600, margin: ".2rem 0 .3rem" }}>{s.t}</div>
              <div style={{ color: MUTED, fontSize: ".9rem", fontWeight: 300 }}>{s.d}</div>
            </div>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.5rem", marginBottom: "1rem" }}>Frequently asked</h2>
        <div style={{ marginBottom: "2.6rem" }}>
          {faqs.map((f) => (
            <div key={f.q} style={{ marginBottom: "1.3rem" }}>
              <div style={{ fontWeight: 600, color: TEXT, marginBottom: ".35rem" }}>{f.q}</div>
              <div style={{ color: MUTED, fontWeight: 300, lineHeight: 1.7 }}>{f.a}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "linear-gradient(135deg,rgba(234,107,20,.16),rgba(234,107,20,.04))", border: "1px solid rgba(234,107,20,.25)", borderRadius: 16, padding: "1.8rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.7rem", marginBottom: ".5rem" }}>Ready to get started in {area.name}?</h2>
          <p style={{ color: MUTED, fontWeight: 300, marginBottom: "1.2rem" }}>Post your job free and get up to 5 fixed-price estimates from vetted local pros.</p>
          <button className="al-btn" onClick={book}>Get my free estimates →</button>
        </div>
      </div>
    </div>
  );
}

// Simple index of every service area, linked from the footer + sitemap.
export function AreasIndex() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const url = "https://freddyfixit.ca/areas";
    const prevTitle = document.title;
    const title = "Service Areas | Calgary, Airdrie, Cochrane, Okotoks & Chestermere — Freddy Fix It";
    const desc = "Freddy Fix It connects homeowners across Calgary and nearby towns with vetted local tradespeople. Find handyman, plumbing, electrical and more in your area.";
    document.title = title;
    upsertMeta('meta[name="description"]', "name", "description", desc);
    upsertMeta('link[rel="canonical"]', "rel", "canonical", url, "href");
    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", desc);
    return () => { document.title = prevTitle; };
  }, []);

  const zones = AREA_SLUGS.filter((s) => AREAS[s].kind === "zone");
  const towns = AREA_SLUGS.filter((s) => AREAS[s].kind === "town");

  const grid = (slugs: string[]) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px, 100%), 1fr))", gap: ".8rem", marginBottom: "2.4rem" }}>
      {slugs.map((s) => (
        <a key={s} href={"/areas/" + s} onClick={(e) => { e.preventDefault(); setLocation("/areas/" + s); }}
          style={{ display: "flex", alignItems: "center", gap: ".7rem", background: "var(--ff-surface)", border: "1px solid rgba(var(--ff-fg), .07)", borderRadius: 12, padding: "1rem 1.15rem", textDecoration: "none", color: "var(--ff-text)" }}>
          <Ic name="map-pin" size={20} color={ORANGE} />
          <span style={{ fontWeight: 600 }}>{AREAS[s].name}</span>
        </a>
      ))}
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", color: TEXT, minHeight: "100vh", padding: "6rem clamp(1rem, 4vw, 1.5rem) 5rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{"h1,h2{font-family:'Bebas Neue',sans-serif;letter-spacing:.05em} .al-btn{background:#ea6b14;color:#fff;border:none;padding:.85rem 1.6rem;border-radius:8px;font-size:1.02rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}"}</style>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: "2.6rem", marginBottom: ".6rem" }}>Service Areas</h1>
        <p style={{ color: MUTED, fontWeight: 300, lineHeight: 1.8, fontSize: "1.05rem", marginBottom: "2.4rem" }}>
          Freddy Fix It connects homeowners across Calgary and the surrounding towns with vetted, licensed and insured local tradespeople. Pick your area to get started.
        </p>
        <h2 style={{ color: ORANGE, fontSize: "1.4rem", marginBottom: "1rem" }}>Calgary</h2>
        {grid(zones)}
        <h2 style={{ color: ORANGE, fontSize: "1.4rem", marginBottom: "1rem" }}>Nearby towns</h2>
        {grid(towns)}
        <div style={{ background: "linear-gradient(135deg,rgba(234,107,20,.16),rgba(234,107,20,.04))", border: "1px solid rgba(234,107,20,.25)", borderRadius: 16, padding: "1.8rem", textAlign: "center", marginTop: "1rem" }}>
          <h2 style={{ fontSize: "1.7rem", marginBottom: ".5rem" }}>Not sure where to start?</h2>
          <p style={{ color: MUTED, fontWeight: 300, marginBottom: "1.2rem" }}>Post your job free and get up to 5 fixed-price estimates from vetted local pros.</p>
          <button className="al-btn" onClick={() => setLocation("/client-onboarding")}>Get my free estimates →</button>
        </div>
      </div>
    </div>
  );
}
