import { useEffect } from "react";
import { useLocation } from "wouter";
import { Ic } from "@/components/Ic";

function upsertMeta(selector: string, attr: "name" | "property" | "rel", key: string, content: string, valueAttr: "content" | "href" = "content") {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = document.createElement(selector.startsWith("link") ? "link" : "meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, content);
}

const META_TITLE = "Get More Local Jobs in Calgary | Join Freddy Fix It Contractors";
const META_DESC = "Calgary contractors & handymen: get matched with local home and vehicle jobs. No monthly fees, no upfront cost, no lead-buying. You're paid securely when the work's done. Apply free.";

const BENEFITS = [
  { icon: "dollar", title: "No fees to join", desc: "Free to sign up. No monthly subscription, no charge to see jobs, and no buying leads. We only take a small service fee from completed jobs." },
  { icon: "map-pin", title: "Local Calgary jobs", desc: "Get notified about nearby work that matches your trade — Calgary, Airdrie, Cochrane, Chestermere and surrounding areas." },
  { icon: "check-circle", title: "Get paid, guaranteed", desc: "The client's payment is collected and held up front, then released to you once the job is confirmed done. No chasing invoices." },
  { icon: "clipboard-list", title: "You stay in control", desc: "See the job, set your own price and timing, and only take the work you want. Bid on jobs or get assigned directly." },
  { icon: "user-check", title: "Real, vetted clients", desc: "Clients submit a detailed request with photos before you're matched, so you know what you're walking into." },
  { icon: "briefcase", title: "Build your reputation", desc: "Earn public reviews on your contractor profile that win you more work over time." },
];

const STEPS = [
  { step: "01", icon: "clipboard-list", title: "Apply in minutes", desc: "Tell us your trade, service area, and qualifications. Signing up is free." },
  { step: "02", icon: "user-check", title: "Get approved", desc: "We review your licence, insurance and references. Once you're vetted, you're live." },
  { step: "03", icon: "link", title: "Get matched to jobs", desc: "Receive nearby jobs that fit your trade. Bid or accept, agree on price and timing." },
  { step: "04", icon: "dollar", title: "Do the work, get paid", desc: "Complete the job, the client confirms, and your payout is released — securely." },
];

const FAQS = [
  { q: "How much does it cost to join?", a: "Nothing. There's no signup fee, no monthly subscription, and no cost to receive or view jobs. We take a small service fee only from jobs you actually complete." },
  { q: "How do I get paid?", a: "The client's payment is collected up front and held securely. When the job is marked complete and the client confirms (or after a short auto-confirm window), your payout is released to your connected account." },
  { q: "What trades do you need?", a: "Handyman/general repairs, plumbing, electrical, HVAC, carpentry, painting, drywall & flooring, landscaping, snow removal, gutters, siding & roofing, concrete & masonry, appliance repair, garage doors, windows & doors, cleaning, locksmith, and vehicle maintenance." },
  { q: "What do I need to sign up?", a: "Your trade and service area, plus the licence, insurance and WCB details relevant to your work. We collect references during onboarding and review everything before approving you." },
  { q: "Do I have to take every job?", a: "No. You choose which jobs to bid on or accept, set your own price and timing, and take only the work that suits you." },
];

export default function ForContractors() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const url = "https://freddyfixit.ca/for-contractors";
    const prevTitle = document.title;
    document.title = META_TITLE;
    upsertMeta('meta[name="description"]', "name", "description", META_DESC);
    upsertMeta('link[rel="canonical"]', "rel", "canonical", url, "href");
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[property="og:title"]', "property", "og:title", META_TITLE);
    upsertMeta('meta[property="og:description"]', "property", "og:description", META_DESC);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", META_TITLE);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", META_DESC);

    const ld = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": FAQS.map((f) => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a },
      })),
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-fc-ld", "1");
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);

    return () => {
      document.title = prevTitle;
      const ex = document.head.querySelector('script[data-fc-ld="1"]');
      if (ex) ex.remove();
    };
  }, []);

  const go = () => setLocation("/contractor-onboarding");

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", color: "var(--ff-text)", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{".fc-cta{display:inline-flex;align-items:center;gap:.5rem;background:#ea6b14;color:#fff;border:none;font-family:'Bebas Neue',sans-serif;letter-spacing:.06em;font-size:1.15rem;padding:.85rem 2.1rem;border-radius:10px;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 8px 26px rgba(234,107,20,.28)} .fc-cta:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(234,107,20,.4)} .fc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem} .fc-card{background:rgba(var(--ff-fg), .04);border:1px solid rgba(var(--ff-fg), .08);border-radius:12px;padding:1.6rem 1.4rem} .fc-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem} .fc-faq{border-bottom:1px solid rgba(var(--ff-fg), .08);padding:1.1rem 0} .fc-faq h3{color:var(--ff-text);font-size:1.05rem;margin-bottom:.4rem;font-family:'Bebas Neue',sans-serif;letter-spacing:.04em} .fc-p{line-height:1.75;color:rgba(var(--ff-muted), .85);font-weight:300} .fc-h{font-family:'Bebas Neue',sans-serif;letter-spacing:.05em}"}</style>

      <section style={{ maxWidth: "880px", margin: "0 auto", padding: "6rem 1.5rem 2.5rem", textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: ".45rem", fontSize: ".8rem", fontWeight: 500, letterSpacing: ".08em", textTransform: "uppercase", color: "#ea6b14", marginBottom: "1rem" }}>
          <Ic name="wrench" size={15} color="#ea6b14" />For Calgary Contractors
        </span>
        <h1 className="fc-h" style={{ fontSize: "clamp(2.6rem,7vw,4.2rem)", lineHeight: 1, color: "var(--ff-text)", marginBottom: "1rem" }}>
          Get More Local Jobs.<br /><span style={{ color: "#ea6b14" }}>Keep More of Your Time.</span>
        </h1>
        <p className="fc-p" style={{ fontSize: "1.1rem", maxWidth: "620px", margin: "0 auto 1.8rem" }}>
          Freddy Fix It connects Calgary tradespeople with nearby home and vehicle jobs. No monthly fees, no buying leads — you're paid securely when the work's done.
        </p>
        <button className="fc-cta" onClick={go}>Apply free — it takes minutes &rarr;</button>
        <p style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .55)", marginTop: ".9rem" }}>Free to join · No monthly cost · No lead fees</p>
      </section>

      <section style={{ maxWidth: "980px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <h2 className="fc-h" style={{ fontSize: "2rem", textAlign: "center", color: "var(--ff-text)", marginBottom: "2rem" }}>Why join Freddy Fix It?</h2>
        <div className="fc-grid">
          {BENEFITS.map((b) => (
            <div key={b.title} className="fc-card">
              <Ic name={b.icon as any} size={26} color="#ea6b14" />
              <h3 className="fc-h" style={{ color: "var(--ff-text)", fontSize: "1.15rem", margin: ".7rem 0 .45rem" }}>{b.title}</h3>
              <p className="fc-p" style={{ fontSize: ".92rem" }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: "980px", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <h2 className="fc-h" style={{ fontSize: "2rem", textAlign: "center", color: "var(--ff-text)", marginBottom: "2rem" }}>How it works</h2>
        <div className="fc-steps">
          {STEPS.map((s) => (
            <div key={s.step} className="fc-card" style={{ textAlign: "center" }}>
              <div className="fc-h" style={{ fontSize: "1.6rem", color: "rgba(234,107,20,.5)" }}>{s.step}</div>
              <Ic name={s.icon as any} size={26} color="#ea6b14" />
              <h3 className="fc-h" style={{ color: "var(--ff-text)", fontSize: "1.1rem", margin: ".6rem 0 .4rem" }}>{s.title}</h3>
              <p className="fc-p" style={{ fontSize: ".9rem" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: "780px", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <h2 className="fc-h" style={{ fontSize: "2rem", textAlign: "center", color: "var(--ff-text)", marginBottom: "1.5rem" }}>Contractor FAQ</h2>
        {FAQS.map((f) => (
          <div key={f.q} className="fc-faq">
            <h3>{f.q}</h3>
            <p className="fc-p" style={{ fontSize: ".95rem" }}>{f.a}</p>
          </div>
        ))}
      </section>

      <section style={{ textAlign: "center", padding: "2rem 1.5rem 5rem" }}>
        <h2 className="fc-h" style={{ fontSize: "2rem", color: "var(--ff-text)", marginBottom: "1rem" }}>Ready for more work?</h2>
        <button className="fc-cta" onClick={go}>Become a Freddy Fix It contractor &rarr;</button>
        <p style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .55)", marginTop: ".9rem" }}>
          Questions? Email <a href="mailto:hello@freddyfixit.ca" style={{ color: "#ea6b14" }}>hello@freddyfixit.ca</a>
        </p>
      </section>
    </div>
  );
}
