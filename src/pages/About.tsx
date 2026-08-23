import { useEffect } from "react";
import { useLocation } from "wouter";
import { Ic } from "@/components/Ic";
import { upsertMeta } from "@/lib/seo";

const META_TITLE = "About Freddy Fix It | Calgary's Vetted Home & Vehicle Repair Marketplace";
const META_DESC =
  "Why we built Freddy Fix It: post a job once, compare estimates from reviewed Calgary tradespeople, get every job in writing, and keep your money held until the work is actually done.";

/* Every claim on this page is tied to something the platform actually enforces
   in code, and the wording is chosen so it stays true on the platform's worst
   day, not just its best one:

     "a person reviews every pro"  -> a contractor row is inert until an admin
                                      sets status='active'; nothing they do
                                      reaches a client before that.
     "verified their ID"           -> contract_ready() refuses to send an
                                      agreement until Stripe has completed
                                      identity verification, and every payment
                                      function 428s without a signed agreement.
     "every job in writing"        -> contract_required() is true for EVERY job.
     "money is held"               -> funds sit at 'held' and only move on
                                      client confirmation (or auto-confirm).
     "contractors never buy leads" -> there is no lead-purchase path anywhere.

   What is deliberately ABSENT is any number: jobs completed, homeowners served,
   years in business, star ratings. At time of writing the platform has a
   two-figure roster and effectively no completed job history, so every one of
   those would be a lie or a rounding of one. The honesty is also the pitch —
   "we're early and we're picky" is a better story than a fabricated 10,000.
   Do NOT add stats here until the database can produce them. */

const PRINCIPLES: { icon: string; title: string; body: string }[] = [
  {
    icon: "clipboard-list",
    title: "You compare. You choose.",
    body:
      "Describe the job once — photos and all — and local pros who actually work that trade send you their price. You pick the one you want. Nobody gets assigned a stranger, and nobody has to make five phone calls to find out what fair looks like.",
  },
  {
    icon: "user-check",
    title: "A real person checks every pro.",
    body:
      "Every tradesperson is reviewed and approved by hand before they can quote a single job. This isn't a directory you can buy a listing in. And before anyone can be paid, they've had their government ID verified by a regulated third party.",
  },
  {
    icon: "check-circle",
    title: "Everything goes in writing.",
    body:
      "Every job on Freddy has a written agreement — the scope, the price, the dates — signed by both of you and emailed to you both. No handshake deals, no invoice at the end that doesn't match what you remember agreeing to.",
  },
  {
    icon: "dollar",
    title: "The money waits for the work.",
    body:
      "You pay a deposit to book your pro and the balance when the work is finished, and we hold it. It's released to them only once you confirm the job was done properly. Your pro isn't chasing you for payment, and you aren't handing cash to someone before they've earned it.",
  },
];

export default function About() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const url = "https://freddyfixit.ca/about";
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
      "@type": "AboutPage",
      "url": url,
      "mainEntity": {
        "@type": "Organization",
        "name": "Freddy Fix It",
        "legalName": "Freddy FixIt Contractors Inc.",
        "url": "https://freddyfixit.ca",
        "email": "hello@freddyfixit.ca",
        "areaServed": ["Calgary", "Airdrie", "Cochrane", "Chestermere", "Okotoks", "Strathmore"],
        "description": META_DESC,
      },
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-about-ld", "1");
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);

    return () => {
      document.title = prevTitle;
      const ex = document.head.querySelector('script[data-about-ld="1"]');
      if (ex) ex.remove();
    };
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", color: "var(--ff-text)", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{".ab-h{font-family:'Bebas Neue',sans-serif;letter-spacing:.05em} .ab-p{line-height:1.85;color:rgba(var(--ff-muted), .85);font-weight:300} .ab-cta{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:#ea6b14;color:#fff;border:none;font-family:'Bebas Neue',sans-serif;letter-spacing:.06em;font-size:1.15rem;padding:.85rem 2.1rem;border-radius:10px;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 8px 26px rgba(234,107,20,.28)} .ab-cta:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(234,107,20,.4)} .ab-cta2{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:rgba(var(--ff-fg), .05);color:var(--ff-text);border:1px solid rgba(var(--ff-fg), .16);font-family:'Bebas Neue',sans-serif;letter-spacing:.06em;font-size:1.15rem;padding:.85rem 2.1rem;border-radius:10px;cursor:pointer;transition:background .15s} .ab-cta2:hover{background:rgba(var(--ff-fg), .1)} .ab-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px, 100%), 1fr));gap:1rem} .ab-card{background:rgba(var(--ff-fg), .04);border:1px solid rgba(var(--ff-fg), .08);border-radius:14px;padding:1.6rem 1.5rem} .ab-rule{width:44px;height:3px;background:#ea6b14;border-radius:2px;margin:0 auto 1.4rem} .ab-btns{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap}"}</style>

      <section style={{ maxWidth: "760px", margin: "0 auto", padding: "6rem clamp(1rem, 4vw, 1.5rem) 2.5rem", textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: ".45rem", fontSize: ".8rem", fontWeight: 500, letterSpacing: ".08em", textTransform: "uppercase", color: "#ea6b14", marginBottom: "1rem" }}>
          <Ic name="home" size={15} color="#ea6b14" />About Freddy Fix It
        </span>
        <h1 className="ab-h" style={{ fontSize: "clamp(2.4rem,6.5vw,3.9rem)", lineHeight: 1.02, color: "var(--ff-text)", marginBottom: "1.1rem" }}>
          Fixing your home shouldn't<br /><span style={{ color: "#ea6b14" }}>feel like a gamble.</span>
        </h1>
        <p className="ab-p" style={{ fontSize: "1.12rem", maxWidth: "600px", margin: "0 auto" }}>
          We're a Calgary company building the thing we kept wishing existed — one place to say what's broken, see real prices from local tradespeople, and know exactly who's coming and what you're paying for.
        </p>
      </section>

      <section style={{ maxWidth: "700px", margin: "0 auto", padding: "1.5rem clamp(1rem, 4vw, 1.5rem) 2.5rem" }}>
        <h2 className="ab-h" style={{ fontSize: "1.9rem", color: "var(--ff-text)", marginBottom: ".9rem", textAlign: "center" }}>Why we started</h2>
        <div className="ab-rule" />
        <p className="ab-p" style={{ fontSize: "1rem", marginBottom: "1.1rem" }}>
          Everyone in this city has a version of the same story. Something gives out on a Sunday. You call five numbers off a search page. Two call back. One turns up a week later, says a figure out loud with nothing written down, and you have no idea whether it's fair — because you've got nothing to compare it to.
        </p>
        <p className="ab-p" style={{ fontSize: "1rem", marginBottom: "1.1rem" }}>
          Talk to the tradespeople and you hear the mirror image. The careful ones — the ones who answer the phone, clean up after themselves, and would rather explain the job than upsell it — are buying leads that go nowhere and chasing money for work they finished weeks ago.
        </p>
        <p className="ab-p" style={{ fontSize: "1rem" }}>
          Two groups of people who genuinely want to find each other, kept apart by the same three missing things: no way to compare, nothing in writing, and no one holding the money in between. Freddy Fix It is our attempt to put all three back.
        </p>
      </section>

      <section style={{ maxWidth: "980px", margin: "0 auto", padding: "1.5rem clamp(1rem, 4vw, 1.5rem) 2.5rem" }}>
        <h2 className="ab-h" style={{ fontSize: "1.9rem", color: "var(--ff-text)", marginBottom: ".9rem", textAlign: "center" }}>What we hold ourselves to</h2>
        <div className="ab-rule" />
        <div className="ab-grid">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="ab-card">
              <Ic name={p.icon as any} size={26} color="#ea6b14" />
              <h3 className="ab-h" style={{ color: "var(--ff-text)", fontSize: "1.2rem", margin: ".75rem 0 .5rem" }}>{p.title}</h3>
              <p className="ab-p" style={{ fontSize: ".94rem" }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: "980px", margin: "0 auto", padding: "1.5rem clamp(1rem, 4vw, 1.5rem) 2.5rem" }}>
        <div style={{ background: "rgba(234,107,20,.07)", border: "1px solid rgba(234,107,20,.28)", borderRadius: "16px", padding: "2rem 1.75rem", textAlign: "center" }}>
          <Ic name="wrench" size={26} color="#ea6b14" />
          <h2 className="ab-h" style={{ fontSize: "1.7rem", color: "var(--ff-text)", margin: ".6rem 0 .7rem" }}>We're not in the lead-selling business</h2>
          <p className="ab-p" style={{ fontSize: "1rem", maxWidth: "620px", margin: "0 auto" }}>
            Contractors join for free and never pay for a lead, a listing, or a job they didn't win. The only time we earn anything is on work that actually got done and the client was happy with — which means the only way we grow is if the trades on here do good work. We wanted our incentives pointing the same direction as yours, not the other way around.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: "700px", margin: "0 auto", padding: "1.5rem clamp(1rem, 4vw, 1.5rem) 2.5rem" }}>
        <h2 className="ab-h" style={{ fontSize: "1.9rem", color: "var(--ff-text)", marginBottom: ".9rem", textAlign: "center" }}>Who you're dealing with</h2>
        <div className="ab-rule" />
        <p className="ab-p" style={{ fontSize: "1rem", marginBottom: "1.1rem" }}>
          Freddy Fix It is run by Freddy FixIt Contractors Inc., based in Calgary. Not a franchise, not a call centre in another province. We work across Calgary, Airdrie, Cochrane, Chestermere, Okotoks and Strathmore, and the pros you'll meet here live in those places too.
        </p>
        <p className="ab-p" style={{ fontSize: "1rem", marginBottom: "1.1rem" }}>
          To be straight with you: we're early. We'd rather build this slowly with tradespeople we'd send to our own parents' house than sign up everyone with a truck and a phone number. That means our list is shorter than it could be. It also means that when someone here quotes your job, a person has already looked them over. If we ever have to choose between growing faster and keeping that standard, we're keeping the standard.
        </p>
        <p className="ab-p" style={{ fontSize: "1rem" }}>
          One last honest thing: we're not the contractor. The pros on Freddy are independent local businesses running their own show. What we are is the layer around them — the review before they can quote, the agreement you both sign, and the hand on the money until you say the job is done.
        </p>
      </section>

      <section style={{ textAlign: "center", padding: "1rem clamp(1rem, 4vw, 1.5rem) 5rem" }}>
        <h2 className="ab-h" style={{ fontSize: "2rem", color: "var(--ff-text)", marginBottom: "1.3rem" }}>Got something that needs fixing?</h2>
        <div className="ab-btns">
          <button className="ab-cta" onClick={() => setLocation("/client-onboarding")}>Get free estimates &rarr;</button>
          <button className="ab-cta2" onClick={() => setLocation("/for-contractors")}>I'm a tradesperson</button>
        </div>
        <p style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .55)", marginTop: "1.1rem" }}>
          Questions first? Email <a href="mailto:hello@freddyfixit.ca" style={{ color: "#ea6b14" }}>hello@freddyfixit.ca</a> — no signup needed.
        </p>
      </section>
    </div>
  );
}
