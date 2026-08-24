import { useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Ic } from "@/components/Ic";
import { supabase } from "@/lib/supabase";

type HomeReview = {
  id: string;
  price_score: number | null;
  experience_score: number | null;
  result_score: number | null;
  comment: string | null;
  created_at: string;
  reviewer_first_name: string | null;
  contractor_name: string | null;
};

const BEFORE_AFTER = [
  { label:"Bathroom Renovation", before:"/before-after/bathroom-before.webp", after:"/before-after/bathroom-after.webp" },
  { label:"Kitchen Remodel",     before:"/before-after/kitchen-before.webp",  after:"/before-after/kitchen-after.webp" },
  { label:"Landscaping",         before:"/before-after/landscaping-before.webp", after:"/before-after/landscaping-after.webp" },
  { label:"Appliance Install",   before:"/before-after/appliance-before.webp",   after:"/before-after/appliance-after.webp" },
  { label:"Furniture Assembly",  before:"/before-after/furniture-before.webp",   after:"/before-after/furniture-after.webp" },
  { label:"Auto / Tires & PPF",  before:"/before-after/auto-before.webp",        after:"/before-after/auto-after.webp" },
];

// Each before/after ships in two widths: a 688px "-sm" file and the 1100px
// default. The slider box is capped at 900px, so nothing ever needs more than
// 1100, and a phone pulls roughly a fifth of the bytes it used to.
const BA_SIZES = "(max-width: 940px) 100vw, 900px";
const baSrcSet = (p: string) => p.replace(".webp", "-sm.webp") + " 688w, " + p + " 1100w";

function BeforeAfter() {
  const [idx, setIdx] = useState(0);
  const [pct, setPct] = useState(55);
  const wrap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let p = ((clientX - r.left) / r.width) * 100;
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    setPct(p);
  };
  const clientXOf = (e: any) => (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
  const onDown = (e: any) => { dragging.current = true; moveTo(clientXOf(e)); };
  const onMove = (e: any) => { if (dragging.current) moveTo(clientXOf(e)); };
  const onUp = () => { dragging.current = false; };

  const pair = BEFORE_AFTER[idx];

  return (
    <div style={{ maxWidth:"900px", margin:"0 auto" }}>
      <div className="ff-ba-tabs">
        {BEFORE_AFTER.map((p, i) => (
          <button key={p.label} className={"ff-ba-tab" + (i === idx ? " ff-ba-tab-on" : "")} onClick={() => { setIdx(i); setPct(55); }}>
            {p.label}
          </button>
        ))}
      </div>

      <div
        ref={wrap}
        className="ff-ba-wrap"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
      >
        {/* Below the fold and behind a tab, so nothing here competes with the
            hero for bandwidth. The wrapper already fixes a 16/9 aspect ratio,
            so lazy-loading costs no layout shift. */}
        <img className="ff-ba-img" src={pair.after} srcSet={baSrcSet(pair.after)} sizes={BA_SIZES}
          alt={pair.label + " after"} draggable={false} decoding="async" loading="lazy" />
        <img className="ff-ba-img" src={pair.before} srcSet={baSrcSet(pair.before)} sizes={BA_SIZES}
          alt={pair.label + " before"} draggable={false} decoding="async" loading="lazy"
          style={{ clipPath: "inset(0 " + (100 - pct) + "% 0 0)" }} />

        <span className="ff-ba-badge ff-ba-badge-before" style={{ opacity: pct > 12 ? 1 : 0 }}>Before</span>
        <span className="ff-ba-badge ff-ba-badge-after" style={{ opacity: pct < 88 ? 1 : 0 }}>After</span>

        <div className="ff-ba-handle" style={{ left: pct + "%" }}>
          <div className="ff-ba-knob">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ff-bg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" /><polyline points="9 18 3 12 9 6" style={{ display:"none" }} />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ff-bg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </div>
        </div>
      </div>
      <p className="ff-ba-note">Illustrative examples. Drag the slider to reveal the transformation.</p>
    </div>
  );
}

const SERVICES = [
  { iconName:"wrench", label:"General Repairs",      desc:"Handyman services for anything around the house" },
  { iconName:"pipe", label:"Plumbing",              desc:"Leaks, installs, and everything in between" },
  { iconName:"zap", label:"Electrical",            desc:"Safe, certified electrical work done right" },
  { iconName:"thermometer", label:"HVAC",                  desc:"Heating, cooling, and ventilation maintenance" },
  { iconName:"hammer", label:"Carpentry",             desc:"Custom builds, repairs, and finishing work" },
  { iconName:"paint-roller", label:"Painting",              desc:"Interior and exterior painting services" },
  { iconName:"layers", label:"Drywall & Flooring",    desc:"From patch jobs to full installs" },
  { iconName:"car", label:"Vehicle Maintenance",   desc:"Oil changes, tires, brakes and more" },
  { iconName:"tree", label:"Landscaping",           desc:"Lawn care, cleanup, and yard work" },
  { iconName:"snowflake", label:"Snow Removal",          desc:"Residential and commercial snow clearing" },
  { iconName:"cloud-rain", label:"Gutters",               desc:"Cleaning, repair, and new installs to protect your home" },
  { iconName:"door", label:"Windows & Doors",        desc:"Repairs, replacements, and weatherproofing" },
  { iconName:"building", label:"Siding & Roofing",       desc:"Repairs, replacements, and leak protection" },
  { iconName:"garage-door", label:"Garage",                 desc:"Garage doors, openers, builds, and repairs" },
  { iconName:"trowel", label:"Concrete / Masonry",   desc:"Driveways, patios, foundations, and masonry work" },
  { iconName:"wind", label:"Air Conditioning",       desc:"AC installs, tune-ups, and repairs" },
  { iconName:"sparkles", label:"Cleaning Services",       desc:"Deep cleans, move-outs, and regular upkeep" },
  { iconName:"key", label:"Locksmith",               desc:"Lock changes, rekeying, lockouts, and security installs" },
  { iconName:"refrigerator", label:"Appliance Repair / Install", desc:"Repairs and installations for all major appliances" },
  { iconName:"sun", label:"Solar",                 desc:"Panel installs, repairs, and cleaning" },
];

const HOW_IT_WORKS = [
  { step:"01", iconName:"clipboard-list", title:"Submit a Request",    desc:"Tell us what needs fixing — takes less than 2 minutes. Choose your service, location, and preferred timing." },
  { step:"02", iconName:"link", title:"Get Matched",         desc:"We match you with a vetted local contractor in your area based on your service needs and schedule." },
  { step:"03", iconName:"wrench", title:"Job Done",            desc:"Your contractor shows up and gets it done. Simple, reliable, no hassle." },
];

const FAQS = [
  { q:"How does Freddy Fix It work?", a:"Tell us what you need, add a photo and a few details, and we'll match you with a local pro. You approve the price and timing, the work gets done, and you confirm and rate it when you're happy." },
  { q:"Is it free to post a job?", a:"Yes — posting a request is completely free. You only pay for the work itself, once a contractor is scheduled and the job is complete." },
  { q:"Are your contractors vetted?", a:"Yes. Every contractor on the platform has been reviewed and approved by our team, and we collect their qualifications and insurance details during onboarding." },
  { q:"How do I pay for the work?", a:"You pay securely through the platform once the job is scheduled and completed. Your payment is held safely and only released to the contractor after you confirm the work is done right — so you're never out of pocket for unfinished work." },
  { q:"What areas do you serve?", a:"Your local area and the surrounding communities, including Airdrie, Cochrane, and Chestermere." },
  { q:"What kinds of jobs can I request?", a:"General repairs and handyman work, carpentry, painting, drywall, landscaping, snow removal, gutters, windows & doors, and more." },
  { q:"How fast will I hear back?", a:"You'll get a response within 24 hours — often sooner." },
  { q:"What if I'm not happy with the work?", a:"Reach out to us at hello@freddyfixit.ca and we'll help make it right." },
  { q:"I'm a contractor — how do I join, and what does it cost?", a:"Signing up is free, with no monthly charges and no upfront cost. We take a small service fee from completed jobs. Once you're approved, you'll be notified about nearby jobs that match your trade, bid or get assigned, agree on price and timing, and get paid when the work's done." },
];

const SHOW_PRO_IDS = [
  "61fbcfd2-d0cc-4c04-94f8-c4d0bc4b70fb", // FREDDYFIXIT
  "58ac39b5-fa19-4629-9fb7-2d97262e6c99", // Iron peak group
  "23d832ce-656a-4b0c-99cc-e7ce42aa4327", // Phase Canada Inc
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [reviews, setReviews] = useState<HomeReview[]>([]);
  const [topPros, setTopPros] = useState<any[]>([]);

  // Pull real, completed-job reviews (with a written comment) to display as
  // social proof. Empty result = graceful fallback to the trust cards below.
  // Also pull a few approved pros (company/name, rating, job count — no photos)
  // for the "meet our pros" strip; section hides itself when empty.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ data }, { data: pros }] = await Promise.all([
          supabase.rpc("get_homepage_reviews", { p_limit: 6 }),
          supabase.rpc("get_top_pros", { p_limit: 6 }),
        ]);
        if (alive && Array.isArray(data)) setReviews(data as HomeReview[]);
        if (alive && Array.isArray(pros)) {
          // Hand-picked homepage pros (owner request 2026-07-20): FreddyFixIt + two
          // established companies only. Referenced by id — never by client PII.
          const order = SHOW_PRO_IDS;
          setTopPros(
            pros
              .filter((p: any) => order.includes(p.contractor_id))
              .sort((a: any, b: any) => order.indexOf(a.contractor_id) - order.indexOf(b.contractor_id))
          );
        }
      } catch {
        /* non-blocking: homepage renders fine without reviews */
      }
    })();
    return () => { alive = false; };
  }, []);

  // Initials avatar seed — company name first, else first name.
  const proInitials = (p: any) => {
    const src = String(p.company_name || p.first_name || "Pro").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  };

  const reviewAvg = (r: HomeReview) => {
    const vals = [r.price_score, r.experience_score, r.result_score].filter(
      (v): v is number => v != null
    );
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", background:"var(--ff-bg)", color:"var(--ff-text)", overflowX:"clip" as const }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Hero ────────────────────────────────────────────────────────────
           60/30/10, applied literally. The ground and every surface are navy
           (60), the type and hairlines are ink (30), and orange appears on
           exactly two things: the primary button, and one word of the
           headline (10). Everything that used to spend the accent budget on
           decoration is gone — the eight scattered orange trade icons, the
           orange divider, the twin orange corner glows, the orange icon on
           the contractor pill, the orange sparkle line. That was the real
           problem with the old hero: with seven orange things competing,
           none of them read as the thing to do next.

           The other change is what leads. The largest element used to be the
           company name, which tells a first-time visitor nothing — the brand
           is already floating top-left in the fixed TopNav, so repeating it
           here in 6rem type spent the whole first impression on a word the
           visitor cannot act on. Now the largest element is the promise. */
        /* The nav paints itself navy on every page (main.tsx). Here it opens
           over a navy hero, and a solid bar on top of a radial glow cuts a hard
           horizontal seam right through it. So while the page is at the top the
           bar is transparent and the glow runs unbroken behind it; the moment
           it lifts, main.tsx's paint takes over and body content never scrolls
           illegibly underneath. Specificity 0,2,0 beats the 0,1,0 base rule,
           and living in Home's own <style> means it unmounts with the page —
           no other route can inherit a transparent nav. */
        .ff-nav-wrap:not(.ff-nav-lifted) { background-color: transparent; }
        .ff-hero {
          position: relative; overflow: hidden;
          min-height: 100vh;
          min-height: 100svh;   /* iOS counts the URL bar in vh, which pushed the button under the fold */
          display: flex; flex-direction: column;
          background: var(--ff-c60);
          background-image: radial-gradient(ellipse 85% 55% at 50% 118%, rgba(9,13,22,0.92) 0%, transparent 72%);
          /* Top padding clears the fixed TopNav (~4.5rem tall incl. its own
             padding) so the eyebrow never sits under the wordmark. */
          padding: 5rem clamp(1.15rem, 5vw, 2rem) clamp(2rem, 7vh, 3.5rem);
        }
        /* One warm glow behind the headline instead of two in the corners, and
           it drifts over 22s — slow enough to read as light rather than motion. */
        .ff-hero-glow {
          position: absolute; top: -30%; left: 50%; margin-left: -65%;
          width: 130%; height: 78%; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse at center, rgba(234,107,20,0.30) 0%, rgba(234,107,20,0.09) 44%, transparent 70%);
          animation: ff-glow 22s ease-in-out infinite;
        }
        @keyframes ff-glow {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.85; }
          50%      { transform: translate3d(0, -18px, 0) scale(1.07); opacity: 1; }
        }
        /* faint diagonal weave, masked to the centre so edges stay clean */
        .ff-hero::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.42; z-index: 0;
          background-image:
            repeating-linear-gradient(45deg, transparent 0 26px, rgba(var(--ff-fg), 0.03) 26px, rgba(var(--ff-fg), 0.03) 27px),
            repeating-linear-gradient(-45deg, transparent 0 26px, rgba(var(--ff-fg), 0.025) 26px, rgba(var(--ff-fg), 0.025) 27px);
          -webkit-mask-image: radial-gradient(circle at 50% 40%, #000 26%, transparent 80%);
                  mask-image: radial-gradient(circle at 50% 40%, #000 26%, transparent 80%);
        }
        /* Trade icons as texture only — ink, never orange, so they read as
           watermark rather than accent and don't spend the 10% budget.

           The mask is what lets there be twelve of them without the hero
           getting busy: it erases the icon field through the whole middle of
           the section and only fades them up toward the edges. So the icons
           are dense where the eye isn't and absent where the words are, which
           is the opposite of scattering them evenly and hoping the opacity is
           low enough. Nothing ever sits behind the headline. */
        .ff-hero-icons { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
          -webkit-mask-image: radial-gradient(ellipse 60% 54% at 50% 48%, transparent 30%, #000 82%);
                  mask-image: radial-gradient(ellipse 60% 54% at 50% 48%, transparent 30%, #000 82%); }
        .ff-hero-icons span { position: absolute; color: rgb(var(--ff-fg)); opacity: 0.055; }
        /* Heavier hand for the backdrop. main.tsx gives every 24x24 icon on the
           site a sketch filter tuned for 16-20px UI glyphs; these run 38-70px,
           where that same displacement is too small to read as drawn at all.
           ff-sketch-lg is the same pipeline with a longer wavelength and about
           double the throw. Specificity: one class plus two elements outranks
           the global attribute rule in main.tsx, so this replaces it cleanly
           rather than fighting it. Three variants across the twelve siblings,
           because a dozen shapes sharing one noise field is precisely what
           makes a filter look like a filter instead of a hand. */
        .ff-hero-icons span svg { display: block; filter: url(#ff-sketch-lg); }
        .ff-hero-icons span:nth-child(3n) svg { filter: url(#ff-sketch-c); }
        .ff-hero-icons span:nth-child(4n) svg { filter: url(#ff-sketch-b); }
        @media (max-width: 600px) { .ff-hero-icons span.ff-hi-hide { display: none; } }

        /* The mark alone, at size. The FREDDYFIXIT word is deliberately gone:
           <TopNav/> is fixed and already spells the name out top-left over
           this very section, and a logotype set twice on one screen reads as
           a template rather than a brand. The mark carries the identity here;
           the name is two inches away if anyone needs it.

           It also does NOT animate. Everything below it rises in, but the
           logo is the first thing on the page and a mark that arrives late
           undercuts the exact steadiness it is there to project. */
        .ff-herolock { display: block; line-height: 0; }
        .ff-herolock svg { display: block;
          width: clamp(76px, 20vw, 132px); height: clamp(76px, 20vw, 132px); }

        /* ── Hero layout: axial + modular ─────────────────────────────
           AXIAL — one vertical centre line, and every block is centred on
           it with nothing offset, so the eye travels straight down: mark,
           promise, action. That symmetry is what lets a deliberately short
           hero read as composed instead of merely sparse.

           MODULAR — one spacing unit (--ff-mod) and every vertical gap is a
           whole multiple of it: 1× inside a group, 2× between groups. What
           this replaces is seven blocks that each carried their own
           hand-picked margin (1.15rem, then 1.1rem, then a clamp, then
           0.75rem, then another clamp), which is precisely why the old
           spacing never felt intentional. The rhythm is now arithmetic, and
           re-tuning the whole hero is one number. */
        .ff-hero-body {
          --ff-mod: clamp(0.62rem, 1.9vh, 0.95rem);
          position: relative; z-index: 1; flex: 1; width: 100%; max-width: 46rem; margin: 0 auto;
          display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: min-content;
          justify-items: center; align-content: center; row-gap: var(--ff-mod);
          text-align: center;
        }
        /* Group breaks, expressed in modules rather than eyeballed pixels. */
        .ff-hero-body > .ff-h1       { margin-top: var(--ff-mod); }
        .ff-hero-body > .ff-cta      { margin-top: calc(var(--ff-mod) * 2); }
        .ff-hero-body > .ff-hero-alt { margin-top: calc(var(--ff-mod) * 2); }
        /* One column, so the flex-era justify-content that used to push the
           body into the thumb arc becomes align-content. The "safe" keyword
           matters: on a short phone a plain "end" would overflow the TOP of
           the section and slide the logo up under the fixed nav. */
        @media (max-width: 640px) {
          .ff-hero-body { --ff-mod: clamp(0.5rem, 1.4vh, 0.8rem);
            align-content: end; align-content: safe end; padding-bottom: 3vh; }
        }

        .ff-h1 { font-family: 'Bebas Neue', sans-serif; font-weight: 400;
          font-size: clamp(3rem, 11.5vw, 5.6rem); line-height: 0.9; letter-spacing: 0.02em;
          color: var(--ff-ink-1); margin: 0; }
        .ff-h1 em { font-style: normal; color: var(--ff-c10); }
        /* The three steps. Bebas so it reads as a continuation of the headline
           rather than as body copy, but a third of its size and widely tracked
           so it can't compete with it. Deliberately NOT orange: the 10 of
           60/30/10 is spent on the h1 accent and the CTA, and a third orange
           thing in a 400px-tall hero is what turns an accent into wallpaper. */
        .ff-steps { font-family: 'Bebas Neue', sans-serif; font-weight: 400;
          font-size: clamp(1.05rem, 3.4vw, 1.5rem); line-height: 1.1; letter-spacing: 0.14em;
          color: var(--ff-ink-2); margin: 0; }
        .ff-sub { font-size: clamp(1rem, 2.5vw, 1.15rem); font-weight: 300; line-height: 1.62;
          color: var(--ff-ink-3); max-width: 33rem; margin: 0; }
        .ff-sub strong { color: var(--ff-ink-2); font-weight: 500; }

        /* The one accent action on the page. 56px tall is the floor, not the
           target — it clears the 44px thumb minimum with room for a mis-tap. */
        .ff-cta { display: inline-flex; align-items: center; justify-content: center; gap: 0.55rem;
          width: 100%; max-width: 23rem; min-height: 56px;
          padding: 1rem 1.5rem; border: none; border-radius: 14px; cursor: pointer;
          background: linear-gradient(180deg, var(--ff-accent-400) 0%, var(--ff-accent-500) 100%);
          color: #fff; font-family: 'Bebas Neue', sans-serif; font-size: 1.55rem; letter-spacing: 0.06em;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 10px 30px rgba(234,107,20,0.28);
          transition: transform 0.18s cubic-bezier(0.2,0.7,0.3,1), box-shadow 0.18s ease, filter 0.18s ease; }
        .ff-cta:hover { transform: translateY(-2px); filter: brightness(1.04);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), 0 16px 40px rgba(234,107,20,0.38); }
        .ff-cta:active { transform: translateY(0) scale(0.994); }
        .ff-cta:focus-visible { outline: 2px solid var(--ff-accent-400); outline-offset: 3px; }
        .ff-cta-note { margin: 0; font-size: 0.8rem; letter-spacing: 0.04em; color: var(--ff-ink-4); }

        /* A notch larger than the contractor line's neighbours, so a tradesperson
           scanning the page actually registers it — but still well under the
           subheading, so it never competes with the orange button. */
        .ff-hero-alt { font-size: 0.95rem; color: var(--ff-ink-4); }
        .ff-hero-alt button { background: none; border: none; padding: 0; cursor: pointer; font: inherit;
          color: var(--ff-ink-2); font-weight: 500; text-decoration: underline; text-underline-offset: 3px;
          transition: color 0.18s; }
        .ff-hero-alt button:hover { color: var(--ff-c10); }

        .ff-scroll-hint { position: absolute; bottom: 0.7rem; left: 50%; transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 0.35rem; z-index: 1;
          color: var(--ff-ink-4); opacity: 0.6; font-size: 0.68rem; letter-spacing: 0.18em; text-transform: uppercase;
          animation: bounce 2.4s ease-in-out infinite; }
        @media (max-width: 640px) { .ff-scroll-hint { display: none; } }
        @keyframes bounce { 0%, 100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(6px); } }

        /* Entrance. The headline rises but never starts transparent — an
           invisible LCP element is an LCP element the browser doesn't count,
           so fading in the biggest text on the page measurably hurts the
           score it is meant to win. Everything else fades. */
        @keyframes ff-rise { from { opacity: 0; transform: translate3d(0, 14px, 0); } to { opacity: 1; transform: none; } }
        @keyframes ff-lift { from { transform: translate3d(0, 10px, 0); } to { transform: none; } }
        .ff-anim { animation: ff-rise 0.62s cubic-bezier(0.22,0.61,0.36,1) both; }
        .ff-anim-lcp { animation: ff-lift 0.5s cubic-bezier(0.22,0.61,0.36,1) both; }
        .ff-d1 { animation-delay: 0.05s; } .ff-d2 { animation-delay: 0.12s; }
        .ff-d3 { animation-delay: 0.19s; } .ff-d4 { animation-delay: 0.26s; }
        .ff-d5 { animation-delay: 0.33s; }

        /* ── Services ── */
        .ff-services { background: var(--ff-surface); position: relative; overflow: hidden; }
        .ff-services::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image:
            radial-gradient(ellipse 70% 30% at 50% 0%, rgba(234,107,20,0.10) 0%, transparent 65%),
            repeating-linear-gradient(45deg, transparent 0 28px, rgba(var(--ff-fg), 0.02) 28px, rgba(var(--ff-fg), 0.02) 29px),
            repeating-linear-gradient(-45deg, transparent 0 28px, rgba(var(--ff-fg), 0.016) 28px, rgba(var(--ff-fg), 0.016) 29px);
        }
        .ff-services-inner { max-width: 1000px; margin: 0 auto; padding: clamp(3rem, 9vw, 6rem) clamp(1rem, 4vw, 2rem); position: relative; z-index: 1; }
        .ff-services-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem; margin-top: 3rem; }
        @media (max-width: 900px) { .ff-services-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 500px) { .ff-services-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .ff-service-card { background: rgba(var(--ff-fg), 0.04); border: 1px solid rgba(var(--ff-fg), 0.08); border-radius: 12px; padding: 1.5rem 1rem; text-align: center; transition: all 0.25s; width: 100%; }
        .ff-service-card:hover { border-color: rgba(234,107,20,0.4); transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .ff-service-icon { font-size: 2rem; margin-bottom: 0.75rem; }
        .ff-service-label { font-family: 'Bebas Neue', sans-serif; font-size: 1rem; letter-spacing: 0.06em; color: var(--ff-text); margin-bottom: 0.4rem; }
        .ff-service-desc { font-size: 0.72rem; color: rgba(var(--ff-muted), 0.5); font-weight: 300; line-height: 1.5; }

        /* ── How it works ── */
        /* The page alternates ground / surface band by band so the eye gets a
           seam to rest on. Before-and-After and FAQ sit on the ground; How It
           Works and Services sit on the surface between them. .ff-how-surface
           is the same specificity as .ff-how and simply comes later, so it
           wins without needing !important. */
        .ff-how { background: var(--ff-bg); position: relative; overflow: hidden; }
        .ff-how-surface { background: var(--ff-surface); }
        .ff-how::before { content: ''; position: absolute; inset: 0; background-image: repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(var(--ff-fg), 0.01) 60px, rgba(var(--ff-fg), 0.01) 61px), repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(var(--ff-fg), 0.01) 60px, rgba(var(--ff-fg), 0.01) 61px); pointer-events: none; }
        .ff-how-inner { max-width: 1000px; margin: 0 auto; padding: clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 2rem); position: relative; z-index: 1; }
        .ff-how-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2rem; margin-top: 3rem; }
        @media (max-width: 700px) { .ff-how-grid { grid-template-columns: minmax(0, 1fr); } }
        .ff-how-card { background: rgba(var(--ff-fg), 0.03); border: 1px solid rgba(var(--ff-fg), 0.07); border-radius: 14px; padding: 1.25rem 1.5rem; position: relative; }
        .ff-how-step { font-family: 'Bebas Neue', sans-serif; font-size: 2.5rem; letter-spacing: 0.06em; color: rgba(234,107,20,0.2); line-height: 1; margin-bottom: 0.5rem; }
        .ff-how-icon { font-size: 1.6rem; margin-bottom: 0.5rem; }
        .ff-how-title { font-family: 'Bebas Neue', sans-serif; font-size: 1.3rem; letter-spacing: 0.06em; color: var(--ff-text); margin-bottom: 0.75rem; }
        .ff-how-desc { font-size: 0.85rem; color: rgba(var(--ff-muted), 0.6); font-weight: 300; line-height: 1.7; }
        .ff-how-connector { display: none; }
        @media (min-width: 700px) { .ff-how-connector { display: block; position: absolute; top: 2.5rem; right: -1rem; width: 2rem; height: 2px; background: linear-gradient(90deg, rgba(234,107,20,0.3), transparent); } }

        /* ── About ── */
        .ff-about { background: var(--ff-surface); position: relative; overflow: hidden; }
        .ff-about::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.55;
          background-image:
            radial-gradient(ellipse 60% 40% at 12% 0%, rgba(234,107,20,0.16) 0%, transparent 60%),
            repeating-linear-gradient(45deg, transparent 0 28px, rgba(var(--ff-fg), 0.022) 28px, rgba(var(--ff-fg), 0.022) 29px),
            repeating-linear-gradient(-45deg, transparent 0 28px, rgba(var(--ff-fg), 0.018) 28px, rgba(var(--ff-fg), 0.018) 29px);
        }
        .ff-about-inner { max-width: 900px; margin: 0 auto; padding: clamp(3rem, 9vw, 6rem) clamp(1rem, 4vw, 2rem); position: relative; z-index: 1; }
        .ff-about-eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.2em; color: #ea6b14; margin-bottom: 1.5rem; }
        .ff-about-headline { font-family: 'Bebas Neue', sans-serif; font-size: clamp(2.8rem, 7vw, 5rem); letter-spacing: 0.06em; line-height: 1; color: var(--ff-text); margin-bottom: 2rem; }
        .ff-about-headline span { color: #ea6b14; }
        .ff-about-body { font-size: 1.1rem; color: rgba(var(--ff-muted), 0.7); font-weight: 300; line-height: 1.8; max-width: 680px; margin-bottom: 3rem; }
        .ff-about-body strong { color: var(--ff-text); font-weight: 500; }
        .ff-about-tagline { font-family: 'Bebas Neue', sans-serif; font-size: clamp(1.4rem, 4vw, 2rem); letter-spacing: 0.06em; color: rgba(234,107,20,0.85); border-left: 3px solid #ea6b14; padding-left: 1.25rem; line-height: 1.3; margin-bottom: 4rem; }
        .ff-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; }
        @media (max-width: 600px) { .ff-stats { grid-template-columns: minmax(0, 1fr); } }
        .ff-stat { background: rgba(var(--ff-fg), 0.03); border: 1px solid rgba(var(--ff-fg), 0.07); border-radius: 12px; padding: 1.75rem; }
        .ff-stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 3rem; letter-spacing: 0.06em; color: #ea6b14; line-height: 1; margin-bottom: 0.4rem; }
        .ff-stat-label { font-size: 0.82rem; color: rgba(var(--ff-muted), 0.5); font-weight: 300; line-height: 1.4; }

        /* ── Reviews ── */
        .ff-reviews-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; }
        @media (max-width: 760px) { .ff-reviews-grid { grid-template-columns: minmax(0, 1fr); } }
        .ff-reviews-grid > div { min-width: 0; }

        /* ── Before / After ── */
        .ff-ba-tabs { display: flex; justify-content: center; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .ff-ba-tab { font-family: 'DM Sans', sans-serif; font-size: 0.82rem; font-weight: 500; letter-spacing: 0.04em; color: rgba(var(--ff-muted), 0.7); background: rgba(var(--ff-fg), 0.04); border: 1px solid rgba(var(--ff-fg), 0.1); border-radius: 999px; padding: 0.55rem 1.25rem; cursor: pointer; transition: all 0.2s; }
        .ff-ba-tab:hover { color: var(--ff-text); border-color: rgba(234,107,20,0.4); }
        .ff-ba-tab-on { color: var(--ff-text); background: rgba(234,107,20,0.18); border-color: rgba(234,107,20,0.6); }
        .ff-ba-wrap { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; border: 1px solid rgba(var(--ff-fg), 0.08); cursor: ew-resize; user-select: none; touch-action: none; box-shadow: 0 14px 44px rgba(0,0,0,0.4); background: var(--ff-surface-0e); }
        .ff-ba-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; -webkit-user-drag: none; }
        .ff-ba-badge { position: absolute; top: 1rem; font-family: 'Bebas Neue', sans-serif; font-size: 0.95rem; letter-spacing: 0.1em; color: var(--ff-text); background: rgba(var(--ff-bg-rgb), 0.7); backdrop-filter: blur(4px); border: 1px solid rgba(var(--ff-fg), 0.12); padding: 0.3rem 0.85rem; border-radius: 999px; pointer-events: none; transition: opacity 0.2s; }
        .ff-ba-badge-before { left: 1rem; }
        .ff-ba-badge-after { right: 1rem; color: #ea6b14; border-color: rgba(234,107,20,0.4); }
        .ff-ba-handle { position: absolute; top: 0; bottom: 0; width: 3px; background: rgba(var(--ff-fg), 0.9); transform: translateX(-50%); pointer-events: none; box-shadow: 0 0 12px rgba(0,0,0,0.5); }
        .ff-ba-knob { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 44px; height: 44px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; gap: 1px; box-shadow: 0 2px 12px rgba(0,0,0,0.4); }
        .ff-ba-note { text-align: center; margin-top: 1.25rem; font-size: 0.8rem; color: rgba(var(--ff-muted), 0.45); font-weight: 300; letter-spacing: 0.02em; }

        /* ── Footer ── */
        .ff-footer-bar { background: var(--ff-surface-2); border-top: 1px solid rgba(var(--ff-fg), 0.06); padding: 2rem 1.5rem; text-align: center; font-size: 0.75rem; color: rgba(var(--ff-muted), 0.25); letter-spacing: 0.05em; }
      `}</style>

      {/* ── Hero ──
          One job: in about three seconds, tell a stranger what this is, why
          they should trust it, and give them exactly one thing to press.
          Everything here is subordinate to that — which is why there is one
          button and not three, and why the brand is a lockup rather than the
          headline. The whole entrance is CSS, not framer-motion, so the text
          paints on the HTML/CSS pass instead of waiting for the JS bundle. */}
      {/* Navy in both themes. The hero's whole design — the warm glow, the
          near-black bottom gradient, the ink watermark icons — assumes a dark
          ground; on light mode's white it read as a smudge. It is also the
          first screen a visitor sees, so it is where the brand colour earns
          the most. */}
      <div className="ff-hero ff-on-dark">
        <div className="ff-hero-glow" aria-hidden="true" />
        {/* Watermark texture. Ink, not orange — the accent budget is spent on
            the button, and these used to be eight competing orange shapes. */}
        {/* Twelve trade marks instead of four. They can be this many and still
            read as clean because of the mask on .ff-hero-icons, which erases
            the middle of the field entirely — density lives out at the edges
            where nothing has to be read, and the centre column stays empty.
            Positions are deliberately off the axis and the sizes vary, since a
            tidy ring of same-size icons looks like a border, not texture. The
            six marked ff-hi-hide drop on phones, where there is no margin to
            spare beside the text. */}
        <div className="ff-hero-icons" aria-hidden="true">
          <span style={{ top:"11%", left:"6%", transform:"rotate(-18deg)" }}><Ic name="wrench" size={64} color="currentColor" /></span>
          <span className="ff-hi-hide" style={{ top:"9%", left:"27%", transform:"rotate(9deg)" }}><Ic name="trowel" size={40} color="currentColor" /></span>
          <span className="ff-hi-hide" style={{ top:"18%", right:"25%", transform:"rotate(-7deg)" }}><Ic name="droplet" size={38} color="currentColor" /></span>
          <span className="ff-hi-hide" style={{ top:"20%", right:"8%", transform:"rotate(14deg)" }}><Ic name="pipe" size={70} color="currentColor" /></span>
          <span style={{ top:"38%", left:"3%", transform:"rotate(6deg)" }}><Ic name="zap" size={44} color="currentColor" /></span>
          <span style={{ top:"42%", right:"4%", transform:"rotate(-16deg)" }}><Ic name="thermometer" size={46} color="currentColor" /></span>
          <span className="ff-hi-hide" style={{ top:"62%", left:"22%", transform:"rotate(-11deg)" }}><Ic name="key" size={36} color="currentColor" /></span>
          <span className="ff-hi-hide" style={{ top:"66%", right:"9%", transform:"rotate(-12deg)" }}><Ic name="hammer" size={62} color="currentColor" /></span>
          <span style={{ top:"74%", left:"5%", transform:"rotate(10deg)" }}><Ic name="paint-roller" size={56} color="currentColor" /></span>
          <span className="ff-hi-hide" style={{ top:"80%", right:"27%", transform:"rotate(8deg)" }}><Ic name="snowflake" size={40} color="currentColor" /></span>
          <span style={{ top:"88%", left:"33%", transform:"rotate(-6deg)" }}><Ic name="toolbox" size={48} color="currentColor" /></span>
          <span style={{ top:"86%", right:"14%", transform:"rotate(13deg)" }}><Ic name="tree" size={42} color="currentColor" /></span>
        </div>

        <div className="ff-hero-body">
          {/* The mark, large and dead centre on the axis, with no entrance
              animation — see .ff-herolock. role="img" + a label because the
              wordmark that used to name the company is gone, so this SVG is
              now the only thing carrying the brand in this section. */}
          <div className="ff-herolock" role="img" aria-label="Freddy Fix It">
            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon points="65.9,50.7 50.7,65.9 29.3,65.9 14.1,50.7 14.1,29.3 29.3,14.1 50.7,14.1 65.9,29.3" fill="rgba(234,107,20,0.10)" stroke="#ea6b14" strokeWidth="3"/>
              <path d="M28 54 L28 38 L40 28 L52 38 L52 54 Z" stroke="var(--ff-text)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M36 54 L36 43 L44 43 L44 54" stroke="#ea6b14" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>

          {/* Tagline sits directly under the mark and above the headline — a
              short trust line read before anything else on the page. Reuses
              .ff-sub so the type size matches the rest of the hero body. */}
          <p className="ff-sub ff-anim">
            A Canadian and Family-Owned business.
          </p>

          {/* Says what the visitor GETS, not what we are like. "Fix it once,
              fix it right" was a promise about workmanship we cannot make on a
              contractor's behalf; this is a description of the mechanism, and
              every word of it is enforced in code. "You pick the price" rather
              than "your price" on purpose — the client does not name a number,
              they choose among the ones pros send back, and a headline that
              overstates that is the first thing a disappointed user quotes. */}
          <h1 className="ff-h1 ff-anim-lcp">
            Pros come to you.<br /><em>You pick the price.</em>
          </h1>

          {/* The whole product in three words each. It sits between the
              headline and the button, so a visitor who reads nothing else
              still leaves knowing the shape of the thing. */}
          <p className="ff-steps ff-anim ff-d1">
            Describe it. Compare it. Book it.
          </p>

          <button className="ff-cta ff-anim ff-d2" onClick={() => setLocation("/client-onboarding")}>
            Get Free Estimates
          </button>
          <div className="ff-cta-note ff-anim ff-d2">No signup to start · Takes about 2 minutes</div>

          {/* Contractor sign-up sits ABOVE the tick row, not buried under it.
              Supply is the harder side of a marketplace to fill, and a pro who
              scrolls past this is a pro we pay to reach some other way. It is
              still plainly secondary to the orange button — bigger than the
              ticks, but a text link, not a second competing action. */}
          {/* The three-tick row that used to close the hero is GONE, and that
              is the simplification. It was a third trust block saying what the
              subheading and the proof line had already said — "Vetted Calgary
              pros" duplicated both, and "No fees to post a job" duplicated the
              CTA note directly above it. Three overlapping reassurances read
              as anxious rather than confident. One sentence that is specific
              and checkable does more than three that are generic.

              The trust bar immediately below the hero still carries the same
              points for anyone who scrolls, so nothing was actually lost. */}
          <div className="ff-hero-alt ff-anim ff-d4">
            A tradesperson?{" "}
            <button onClick={() => setLocation("/contractor-onboarding")}>Join Freddy's team →</button>
          </div>
        </div>

        <div className="ff-scroll-hint" aria-hidden="true">
          <span>Scroll</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* ── Trust proof bar ── */}
      <div style={{ background:"rgba(var(--ff-fg), .03)", borderTop:"1px solid rgba(var(--ff-fg), .07)", borderBottom:"1px solid rgba(var(--ff-fg), .07)", padding:"1.4rem 1rem" }}>
        <div style={{ maxWidth:"1000px", margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap:"1rem" }}>
          {[
            /* Same correction as the hero tick row: we cannot say every pro is
               licensed, insured and WCB-verified, because most have not filed
               all three. What IS true of every one of them is that a person
               reviewed and approved them before they could quote. */
            { icon:"user-check", label:"Reviewed & approved before they quote" },
            { icon:"dollar", label:"Payment held until you approve" },
            { icon:"map-pin", label:"Calgary local — zones & nearby towns" },
            { icon:"sparkles", label:"Free estimates, no signup" },
          ].map((t) => (
            <div key={t.label} style={{ display:"flex", alignItems:"center", gap:".55rem", justifyContent:"center", textAlign:"center" as const }}>
              <Ic name={t.icon as any} size={19} color="#ea6b14" />
              <span style={{ fontSize:".85rem", fontWeight:500, color:"rgba(var(--ff-fg), .82)" }}>{t.label}</span>
            </div>
          ))}
        </div>
        <p style={{ maxWidth:"620px", margin:"1.15rem auto 0", textAlign:"center" as const, fontSize:".88rem", lineHeight:1.6, color:"rgba(var(--ff-muted), .7)" }}>
          We're not a directory that sells your details to the highest bidder. We match you with vetted local pros — and your payment's held until you approve the work.
        </p>
      </div>

      {/* ── Before / After ── */}
      <div className="ff-how">
        <div className="ff-how-inner">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <p className="ff-about-eyebrow" style={{ textAlign:"center" }}>See the Difference</p>
            <h2 className="ff-about-headline" style={{ textAlign:"center", marginBottom:"3rem" }}>Before &amp; <span>After.</span></h2>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <BeforeAfter />
          </motion.div>
        </div>
      </div>

      {/* ── How It Works ── */}
      <div className="ff-how ff-how-surface">
        <div className="ff-how-inner">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <p className="ff-about-eyebrow" style={{ textAlign:"center" }}>The Process</p>
            <h2 className="ff-about-headline" style={{ textAlign:"center" }}>How It <span>Works</span></h2>
          </motion.div>
          <div className="ff-how-grid">
            {HOW_IT_WORKS.map((h, i) => (
              <motion.div key={h.step} className="ff-how-card"
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:"0.75rem", marginBottom:"0.75rem" }}>
                  <div className="ff-how-step">{h.step}</div><div className="ff-how-title">{h.title}</div>
                </div>
                <div className="ff-how-icon" style={{ marginBottom:".5rem" }}><Ic name={h.iconName as any} size={22} color="#ea6b14" /></div>
                <div className="ff-how-desc">{h.desc}</div>
                {i < HOW_IT_WORKS.length - 1 && <div className="ff-how-connector" />}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div style={{ background:"var(--ff-bg)", padding:"6rem 2rem" }}>
        <style>{"details.ff-faq>summary::-webkit-details-marker{display:none}details.ff-faq>summary{list-style:none}details.ff-faq .ff-faq-icon{transition:transform .2s ease;display:inline-block}details.ff-faq[open] .ff-faq-icon{transform:rotate(45deg)}details.ff-faq[open]{border-color:rgba(234,107,20,.3)}"}</style>
        <div style={{ maxWidth:"800px", margin:"0 auto" }}>
          <p style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".2em", color:"#ea6b14", marginBottom:"1.5rem", textAlign:"center" }}>Good to Know</p>
          <h2 style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:"clamp(2.5rem, 6vw, 4rem)", letterSpacing:".06em", color:"var(--ff-text)", textAlign:"center", marginBottom:"3rem" }}>Frequently Asked <span style={{ color:"#ea6b14" }}>Questions.</span></h2>
          <div style={{ display:"flex", flexDirection:"column", gap:".75rem" }}>
            {FAQS.map((f, i) => (
              <details key={i} className="ff-faq" style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"12px", padding:"1.2rem 1.5rem" }}>
                <summary style={{ cursor:"pointer", fontSize:".98rem", fontWeight:500, color:"var(--ff-text)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:"1rem" }}>
                  <span>{f.q}</span>
                  <span className="ff-faq-icon" style={{ color:"#ea6b14", fontSize:"1.4rem", lineHeight:1, fontWeight:300 }}>+</span>
                </summary>
                <p style={{ fontSize:".9rem", color:"rgba(var(--ff-muted), .75)", fontWeight:300, lineHeight:1.7, marginTop:"1rem", marginBottom:0 }}>{f.a}</p>
              </details>
            ))}
          </div>
          <p style={{ textAlign:"center", marginTop:"2.5rem", fontSize:".9rem", color:"rgba(var(--ff-muted), .6)", fontWeight:300 }}>Still have questions? <a href="mailto:hello@freddyfixit.ca" style={{ color:"#ea6b14", textDecoration:"none" }}>Get in touch.</a></p>
        </div>
      </div>

      {/* ── Services ── */}
      <div className="ff-services">
        <div className="ff-services-inner">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <p className="ff-about-eyebrow" style={{ textAlign:"center" }}>What We Cover</p>
            <h2 className="ff-about-headline" style={{ textAlign:"center" }}>Every Fix. <span>Every Time.</span></h2>
          </motion.div>
          <div className="ff-services-grid">
            {SERVICES.map((s, i) => (
              <motion.div key={s.label} className="ff-service-card" onClick={() => window.location.href="/client-onboarding?service=" + encodeURIComponent(s.label)} style={{ cursor:"pointer" }}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.05 }}>
                <div className="ff-service-icon"><Ic name={s.iconName as any} size={28} color="#ea6b14" /></div>
                <div className="ff-service-label">{s.label}</div>
                <div className="ff-service-desc">{s.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Freddy Verified ──
           The one navy band between the hero and the footer. Everything inside
           is already token-driven, so ff-on-dark flips the whole section — its
           cards, hairlines and muted text — with no per-element change.
           --ff-bg, NOT --ff-surface: under the scope --ff-surface is #151d2e,
           which is exactly what a normal surface band already renders as in
           dark mode, so this band would have vanished into the Services band
           above it. --ff-bg gives hero navy in both themes and keeps the seam.
           It is placed here on purpose — the trust claim is the thing worth
           interrupting the page for. */}
      <div className="ff-on-dark" style={{ background:"var(--ff-bg)", padding:"6rem 2rem", position:"relative" as const, overflow:"hidden" as const }}>
        <div style={{ maxWidth:"960px", margin:"0 auto", position:"relative" as const, zIndex:1 }}>
          <p style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".2em", color:"#ea6b14", marginBottom:"1.5rem", textAlign:"center" as const }}>Our Vetting Standard</p>
          <h2 style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:"clamp(2.5rem, 6vw, 4rem)", letterSpacing:".06em", color:"var(--ff-text)", textAlign:"center" as const, marginBottom:"1rem" }}>The Freddy <span style={{ color:"#ea6b14" }}>Verified</span> Promise.</h2>
          <p style={{ textAlign:"center" as const, fontSize:"1rem", color:"rgba(var(--ff-muted), .7)", fontWeight:300, maxWidth:"620px", margin:"0 auto 3rem", lineHeight:1.7 }}>
            Anyone can call themselves a handyman. Before a pro can take a single job on Freddy, they clear our verification checklist — and every job is payment-protected on top of it.
          </p>
          <div style={{ display:"flex", justifyContent:"center" as const, marginBottom:"3rem" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:".7rem", background:"rgba(234,107,20,.1)", border:"1px solid rgba(234,107,20,.4)", borderRadius:"999px", padding:".7rem 1.4rem", boxShadow:"0 0 32px rgba(234,107,20,.18)" }}>
              <svg width="30" height="30" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink:0 }}>
                <polygon points="65.9,50.7 50.7,65.9 29.3,65.9 14.1,50.7 14.1,29.3 29.3,14.1 50.7,14.1 65.9,29.3" fill="rgba(234,107,20,0.08)" stroke="#ea6b14" strokeWidth="2"/>
                <path d="M28 54 L28 38 L40 28 L52 38 L52 54 Z" stroke="var(--ff-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M36 54 L36 43 L44 43 L44 54" stroke="#ea6b14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:"1.4rem", letterSpacing:".08em", color:"#ea6b14" }}>Freddy Verified</span>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(250px, 100%), 1fr))", gap:"1rem", maxWidth:"820px", margin:"0 auto" }}>
            {[
              { t:"Licence & trade certification", d:"We confirm the right trade licence or certification for the work they do." },
              { t:"Liability insurance", d:"Active coverage on file, so you're protected if something goes wrong." },
              { t:"WCB coverage", d:"Workers' Compensation on file — no liability landing on you." },
              { t:"Reference & work history checks", d:"We review past work and references before approving a pro." },
              { t:"Admin background review", d:"A real person on our team reviews and approves every contractor." },
              { t:"Payment held until you approve", d:"Your money stays protected and is only released once you're happy." },
            ].map((it) => (
              <div key={it.t} style={{ display:"flex", gap:".85rem", alignItems:"flex-start" as const, background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"12px", padding:"1.15rem 1.3rem" }}>
                <span style={{ flexShrink:0, marginTop:"1px" }}><Ic name="check-circle" size={22} color="#ea6b14" /></span>
                <div>
                  <div style={{ fontSize:".96rem", fontWeight:500, color:"var(--ff-text)", marginBottom:".25rem" }}>{it.t}</div>
                  <div style={{ fontSize:".84rem", color:"rgba(var(--ff-muted), .65)", fontWeight:300, lineHeight:1.55 }}>{it.d}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ textAlign:"center" as const, marginTop:"2.5rem", fontSize:".9rem", color:"rgba(var(--ff-muted), .6)", fontWeight:300 }}>
            A verified badge means our review process was completed — not a guarantee of outcome. You always pick your own pro.
          </p>
        </div>
      </div>

      {/* ── About ── */}
      <div className="ff-about">
        <div className="ff-about-inner">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <p className="ff-about-eyebrow">Why Freddy Fix It</p>
            <h2 className="ff-about-headline">Build Strong.<br /><span>Maintain Stronger.</span></h2>
            <p className="ff-about-body">
              We connect <strong>busy Calgarians</strong> with trusted local tradespeople for business, home repairs and vehicle maintenance —{" "}
              <strong>compare estimates without calling.</strong>
            </p>
            <p className="ff-about-tagline">
              Honest local pros, fair prices, and work you can count on.
            </p>
          </motion.div>
          <motion.div className="ff-stats" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.2 }}>
            <div className="ff-stat">
              <div className="ff-stat-num">24/7</div>
              <div className="ff-stat-label">Post your job request online anytime — no phone tag</div>
            </div>
            <div className="ff-stat">
              <div className="ff-stat-num">100%</div>
              <div className="ff-stat-label">Vetted and verified local tradespeople</div>
            </div>
            <div className="ff-stat">
              <div className="ff-stat-num">$0</div>
              <div className="ff-stat-label">No booking fees — pay only for the work done</div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Footer ── */}

      {/* ── Testimonials ──
           Ground, so the last band before the navy footer is not the same tone
           as About directly above it. */}
      <div style={{ background:"var(--ff-bg)", padding:"6rem 2rem" }}>
        <div style={{ maxWidth:"900px", margin:"0 auto" }}>
          <p style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".2em", color:"#ea6b14", marginBottom:"1.5rem", textAlign:"center" }}>Why Calgary Trusts Us</p>
          <h2 style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:"clamp(2.5rem, 6vw, 4rem)", letterSpacing:".06em", color:"var(--ff-text)", textAlign:"center", marginBottom:"3rem" }}>Built On <span style={{ color:"#ea6b14" }}>Trust.</span></h2>

          {reviews.length > 0 && (
            <div style={{ marginBottom:"3rem" }}>
              <p style={{ textAlign:"center", color:"rgba(var(--ff-muted), .6)", fontSize:".95rem", marginBottom:"1.75rem" }}>What Calgary homeowners are saying about completed jobs:</p>
              <div className="ff-reviews-grid">
                {reviews.map((r) => {
                  const avg = reviewAvg(r);
                  return (
                    <div key={r.id} style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"14px", padding:"1.75rem", display:"flex", flexDirection:"column" as const }}>
                      <div style={{ display:"flex", alignItems:"center", gap:".5rem", marginBottom:".85rem" }}>
                        <Ic name="message-square" size={18} color="#ea6b14" />
                        {avg != null && (
                          <span style={{ fontWeight:600, color:"#ea6b14", fontSize:".95rem" }}>{avg}/10</span>
                        )}
                      </div>
                      {r.comment && (
                        <p style={{ fontSize:".92rem", color:"rgba(var(--ff-muted), .82)", fontWeight:300, lineHeight:1.7, margin:"0 0 1rem" }}>&ldquo;{r.comment}&rdquo;</p>
                      )}
                      <div style={{ marginTop:"auto", fontSize:".8rem", color:"rgba(var(--ff-muted), .5)" }}>
                        <span style={{ color:"var(--ff-text)", fontWeight:500 }}>{r.reviewer_first_name || "Calgary homeowner"}</span>
                        {r.contractor_name ? " · " + r.contractor_name : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {topPros.length > 0 && (
            <div style={{ marginBottom:"3rem" }}>
              <p style={{ textAlign:"center", color:"rgba(var(--ff-muted), .6)", fontSize:".95rem", marginBottom:"1.75rem" }}>A few of the vetted pros ready to take your job:</p>
              <div className="ff-reviews-grid">
                {topPros.map((p: any) => (
                  <div key={p.contractor_id} style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"14px", padding:"1.5rem", display:"flex", gap:".9rem", alignItems:"center" }}>
                    <div style={{ width:"52px", height:"52px", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(234,107,20,.14)", border:"1px solid rgba(234,107,20,.4)", color:"#ea6b14", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.25rem", letterSpacing:".05em" }}>
                      {proInitials(p)}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:".98rem", fontWeight:600, color:"var(--ff-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{p.company_name || p.first_name || "Vetted pro"}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", marginTop:".15rem" }}>
                        {p.rating ? "⭐ " + Number(p.rating).toFixed(1) + "/10" : "Vetted & approved"}
                        {Number(p.total_jobs) > 0 ? " · " + p.total_jobs + " job" + (Number(p.total_jobs) === 1 ? "" : "s") + " done" : ""}
                      </div>
                      {Array.isArray(p.specialties) && p.specialties.length > 0 && (
                        <div style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .45)", marginTop:".2rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{p.specialties.slice(0, 3).join(" · ")}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ff-reviews-grid">
            <div style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"2rem" }}>
              <div style={{ marginBottom:"1rem" }}><Ic name="user-check" size={26} color="#ea6b14" /></div>
              <div style={{ fontSize:"1.05rem", fontWeight:600, color:"var(--ff-text)", marginBottom:".6rem" }}>Vetted &amp; Accountable</div>
              <p style={{ fontSize:".9rem", color:"rgba(var(--ff-muted), .75)", fontWeight:300, lineHeight:1.7, marginBottom:0 }}>Every pro is screened before they take a job — licensed, insured, WCB-covered, and reference-checked. We do the background work so you don't have to.</p>
            </div>
            <div style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"14px", padding:"2rem" }}>
              <div style={{ marginBottom:"1rem" }}><Ic name="dollar" size={26} color="#ea6b14" /></div>
              <div style={{ fontSize:"1.05rem", fontWeight:600, color:"var(--ff-text)", marginBottom:".6rem" }}>Your Payment Is Protected</div>
              <p style={{ fontSize:".9rem", color:"rgba(var(--ff-muted), .75)", fontWeight:300, lineHeight:1.7, marginBottom:0 }}>Pay through the platform and your money is held until you confirm the work is done right. If something goes sideways, there's a built-in dispute process.</p>
            </div>
            <div style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"2rem" }}>
              <div style={{ marginBottom:"1rem" }}><Ic name="map-pin" size={26} color="#ea6b14" /></div>
              <div style={{ fontSize:"1.05rem", fontWeight:600, color:"var(--ff-text)", marginBottom:".6rem" }}>Local &amp; Honest</div>
              <p style={{ fontSize:".9rem", color:"rgba(var(--ff-muted), .75)", fontWeight:300, lineHeight:1.7, marginBottom:0 }}>We're a Calgary-based team building this the right way. Reviews come from real, completed jobs — verified through the platform, never invented.</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
