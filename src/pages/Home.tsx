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
        <img className="ff-ba-img" src={pair.after} alt={pair.label + " after"} draggable={false} />
        <img className="ff-ba-img" src={pair.before} alt={pair.label + " before"} draggable={false}
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

export default function Home() {
  const [, setLocation] = useLocation();
  const [reviews, setReviews] = useState<HomeReview[]>([]);

  // Pull real, completed-job reviews (with a written comment) to display as
  // social proof. Empty result = graceful fallback to the trust cards below.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_homepage_reviews", { p_limit: 6 });
        if (alive && Array.isArray(data)) setReviews(data as HomeReview[]);
      } catch {
        /* non-blocking: homepage renders fine without reviews */
      }
    })();
    return () => { alive = false; };
  }, []);

  const reviewAvg = (r: HomeReview) => {
    const vals = [r.price_score, r.experience_score, r.result_score].filter(
      (v): v is number => v != null
    );
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", background:"var(--ff-bg)", color:"var(--ff-text)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .ff-hero {
          min-height: 100vh;
          background: var(--ff-bg);
          background-image:
            radial-gradient(ellipse 46% 36% at 26% -6%, rgba(234,107,20,0.42) 0%, transparent 70%),
            radial-gradient(ellipse 52% 40% at 78% -10%, rgba(234,107,20,0.30) 0%, transparent 72%),
            radial-gradient(ellipse 90% 70% at 50% 118%, rgba(13,18,30,0.85) 0%, transparent 70%);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 2rem 1rem 4rem; position: relative; overflow: hidden;
        }
        /* faint diagonal woven grid, vignette-masked toward the centre */
        .ff-hero::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image:
            repeating-linear-gradient(45deg, transparent 0 25px, rgba(var(--ff-fg), 0.035) 25px, rgba(var(--ff-fg), 0.035) 26px),
            repeating-linear-gradient(-45deg, transparent 0 25px, rgba(var(--ff-fg), 0.03) 25px, rgba(var(--ff-fg), 0.03) 26px);
          -webkit-mask-image: radial-gradient(circle at 50% 35%, #000 30%, transparent 82%);
                  mask-image: radial-gradient(circle at 50% 35%, #000 30%, transparent 82%);
        }
        /* soft out-of-focus bokeh dots in the lower half */
        .ff-hero::after {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background-image:
            radial-gradient(circle at 24% 90%, rgba(245,210,150,0.18) 0%, transparent 4%),
            radial-gradient(circle at 47% 97%, rgba(245,210,150,0.14) 0%, transparent 3%),
            radial-gradient(circle at 63% 82%, rgba(245,210,150,0.16) 0%, transparent 5%),
            radial-gradient(circle at 81% 78%, rgba(245,210,150,0.13) 0%, transparent 3.5%),
            radial-gradient(circle at 35% 84%, rgba(245,210,150,0.12) 0%, transparent 2.5%);
        }
        /* scattered, faint trade icons hinting at the jobs we do */
        .ff-hero-icons { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .ff-hero-icons span { position: absolute; color: #ea6b14; opacity: 0.07; }
        .ff-hero-icons span svg { display: block; }
        @media (max-width: 600px) { .ff-hero-icons span.ff-hi-hide { display: none; } }
        .ff-inner { max-width: 680px; width: 100%; position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; }
        .ff-logo-mark { width: 80px; height: 80px; margin-bottom: 1.5rem; filter: drop-shadow(0 0 18px rgba(234,107,20,0.6)); }
        .ff-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(3.5rem, 10vw, 6rem); letter-spacing: 0.08em; line-height: 0.9; text-align: center; margin: 0 0 0.5rem; color: var(--ff-text); text-shadow: 0 0 40px rgba(234,107,20,0.3); }
        .ff-title span { color: #ea6b14; text-shadow: 0 0 30px rgba(234,107,20,0.7), 0 0 60px rgba(234,107,20,0.3); }
        .ff-tagline { font-size: 1rem; font-weight: 300; color: rgba(var(--ff-muted), 0.75); text-align: center; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 3rem; }
        .ff-divider { width: 48px; height: 2px; background: linear-gradient(90deg, transparent, #ea6b14, transparent); margin: 0 auto 3rem; }
        .ff-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; width: 100%; margin-bottom: 1.5rem; }
        @media (max-width: 480px) { .ff-cards { grid-template-columns: 1fr; } }
        .ff-card-client { border-color: rgba(234,107,20,0.55) !important; box-shadow: 0 0 0 1px rgba(234,107,20,0.25), 0 8px 30px rgba(234,107,20,0.12); }
        .ff-card { background: rgba(var(--ff-fg), 0.04); border: 1px solid rgba(var(--ff-fg), 0.08); border-radius: 12px; padding: 2rem 1.5rem; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; transition: all 0.25s ease; position: relative; overflow: hidden; text-align: center; }
        .ff-card::before { content: ''; position: absolute; inset: 0; opacity: 0; transition: opacity 0.25s ease; border-radius: 12px; }
        .ff-card-contractor::before { background: radial-gradient(ellipse at 50% 0%, rgba(234,107,20,0.15) 0%, transparent 70%); }
        .ff-card-client::before { background: radial-gradient(ellipse at 50% 0%, rgba(100,150,220,0.15) 0%, transparent 70%); }
        .ff-card:hover { transform: translateY(-3px); border-color: rgba(234,107,20,0.4); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .ff-card:hover::before { opacity: 1; }
        .ff-card-icon { font-size: 2.2rem; line-height: 1; }
        .ff-card-title { font-family: 'Bebas Neue', sans-serif; font-size: 1.4rem; letter-spacing: 0.08em; color: var(--ff-text); }
        .ff-card-sub { font-size: 0.8rem; color: rgba(var(--ff-muted), 0.55); font-weight: 300; line-height: 1.4; }
        .ff-card-cta { margin-top: 0.5rem; font-size: 0.78rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: #ea6b14; }
        .ff-whatsapp { display: flex; align-items: center; gap: 0.5rem; background: rgba(37,211,102,0.12); border: 1px solid rgba(37,211,102,0.25); border-radius: 999px; padding: 0.6rem 1.4rem; color: #25d366; font-size: 0.85rem; font-weight: 500; cursor: pointer; text-decoration: none; transition: all 0.2s; margin-top: 1rem; }
        .ff-whatsapp:hover { background: rgba(37,211,102,0.2); }
        .ff-signin { display: flex; align-items: center; gap: 0.5rem; background: rgba(var(--ff-fg), 0.05); border: 1px solid rgba(var(--ff-fg), 0.1); border-radius: 999px; padding: 0.6rem 1.4rem; color: rgba(var(--ff-muted), 0.7); font-size: 0.85rem; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; margin-top: 0.75rem; }
        .ff-signin:hover { background: rgba(var(--ff-fg), 0.1); color: var(--ff-text); }
        .ff-scroll-hint { position: absolute; bottom: 0.6rem; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 0.4rem; color: rgba(var(--ff-muted), 0.3); font-size: 0.72rem; letter-spacing: 0.15em; text-transform: uppercase; animation: bounce 2s infinite; }
        @keyframes bounce { 0%, 100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(6px); } }

        /* ── Services ── */
        .ff-services { background: var(--ff-surface); position: relative; overflow: hidden; }
        .ff-services::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
          background-image:
            radial-gradient(ellipse 70% 30% at 50% 0%, rgba(234,107,20,0.10) 0%, transparent 65%),
            repeating-linear-gradient(45deg, transparent 0 28px, rgba(var(--ff-fg), 0.02) 28px, rgba(var(--ff-fg), 0.02) 29px),
            repeating-linear-gradient(-45deg, transparent 0 28px, rgba(var(--ff-fg), 0.016) 28px, rgba(var(--ff-fg), 0.016) 29px);
        }
        .ff-services-inner { max-width: 1000px; margin: 0 auto; padding: 6rem 2rem; position: relative; z-index: 1; }
        .ff-services-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin-top: 3rem; }
        @media (max-width: 900px) { .ff-services-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 500px) { .ff-services-grid { grid-template-columns: repeat(2, 1fr); } }
        .ff-service-card { background: rgba(var(--ff-fg), 0.04); border: 1px solid rgba(var(--ff-fg), 0.08); border-radius: 12px; padding: 1.5rem 1rem; text-align: center; transition: all 0.25s; width: 100%; }
        .ff-service-card:hover { border-color: rgba(234,107,20,0.4); transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .ff-service-icon { font-size: 2rem; margin-bottom: 0.75rem; }
        .ff-service-label { font-family: 'Bebas Neue', sans-serif; font-size: 1rem; letter-spacing: 0.06em; color: var(--ff-text); margin-bottom: 0.4rem; }
        .ff-service-desc { font-size: 0.72rem; color: rgba(var(--ff-muted), 0.5); font-weight: 300; line-height: 1.5; }

        /* ── How it works ── */
        .ff-how { background: var(--ff-bg); position: relative; overflow: hidden; }
        .ff-how::before { content: ''; position: absolute; inset: 0; background-image: repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(var(--ff-fg), 0.01) 60px, rgba(var(--ff-fg), 0.01) 61px), repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(var(--ff-fg), 0.01) 60px, rgba(var(--ff-fg), 0.01) 61px); pointer-events: none; }
        .ff-how-inner { max-width: 1000px; margin: 0 auto; padding: 4rem 2rem; position: relative; z-index: 1; }
        .ff-how-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 3rem; }
        @media (max-width: 700px) { .ff-how-grid { grid-template-columns: 1fr; } }
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
        .ff-about-inner { max-width: 900px; margin: 0 auto; padding: 6rem 2rem; position: relative; z-index: 1; }
        .ff-about-eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.2em; color: #ea6b14; margin-bottom: 1.5rem; }
        .ff-about-headline { font-family: 'Bebas Neue', sans-serif; font-size: clamp(2.8rem, 7vw, 5rem); letter-spacing: 0.06em; line-height: 1; color: var(--ff-text); margin-bottom: 2rem; }
        .ff-about-headline span { color: #ea6b14; }
        .ff-about-body { font-size: 1.1rem; color: rgba(var(--ff-muted), 0.7); font-weight: 300; line-height: 1.8; max-width: 680px; margin-bottom: 3rem; }
        .ff-about-body strong { color: var(--ff-text); font-weight: 500; }
        .ff-about-tagline { font-family: 'Bebas Neue', sans-serif; font-size: clamp(1.4rem, 4vw, 2rem); letter-spacing: 0.06em; color: rgba(234,107,20,0.85); border-left: 3px solid #ea6b14; padding-left: 1.25rem; line-height: 1.3; margin-bottom: 4rem; }
        .ff-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
        @media (max-width: 600px) { .ff-stats { grid-template-columns: 1fr; } }
        .ff-stat { background: rgba(var(--ff-fg), 0.03); border: 1px solid rgba(var(--ff-fg), 0.07); border-radius: 12px; padding: 1.75rem; }
        .ff-stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 3rem; letter-spacing: 0.06em; color: #ea6b14; line-height: 1; margin-bottom: 0.4rem; }
        .ff-stat-label { font-size: 0.82rem; color: rgba(var(--ff-muted), 0.5); font-weight: 300; line-height: 1.4; }

        /* ── Reviews ── */
        .ff-reviews-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
        @media (max-width: 760px) { .ff-reviews-grid { grid-template-columns: 1fr; } }

        /* ── Before / After ── */
        .ff-ba-tabs { display: flex; justify-content: center; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .ff-ba-tab { font-family: 'DM Sans', sans-serif; font-size: 0.82rem; font-weight: 500; letter-spacing: 0.04em; color: rgba(var(--ff-muted), 0.7); background: rgba(var(--ff-fg), 0.04); border: 1px solid rgba(var(--ff-fg), 0.1); border-radius: 999px; padding: 0.55rem 1.25rem; cursor: pointer; transition: all 0.2s; }
        .ff-ba-tab:hover { color: var(--ff-text); border-color: rgba(234,107,20,0.4); }
        .ff-ba-tab-on { color: #fff; background: rgba(234,107,20,0.18); border-color: rgba(234,107,20,0.6); }
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

      {/* ── Hero ── */}
      <div className="ff-hero">
        {/* faint trade icons hinting at the jobs we do */}
        <div className="ff-hero-icons" aria-hidden="true">
          <span style={{ top:"12%", left:"8%", transform:"rotate(-18deg)" }}><Ic name="wrench" size={64} color="#ea6b14" /></span>
          <span className="ff-hi-hide" style={{ top:"20%", right:"10%", transform:"rotate(14deg)" }}><Ic name="pipe" size={72} color="#ea6b14" /></span>
          <span style={{ top:"58%", left:"6%", transform:"rotate(10deg)" }}><Ic name="paint-roller" size={58} color="#ea6b14" /></span>
          <span className="ff-hi-hide" style={{ top:"62%", right:"7%", transform:"rotate(-12deg)" }}><Ic name="hammer" size={66} color="#ea6b14" /></span>
          <span className="ff-hi-hide" style={{ top:"40%", left:"15%", transform:"rotate(8deg)" }}><Ic name="zap" size={48} color="#ea6b14" /></span>
          <span style={{ top:"78%", left:"42%", transform:"rotate(-6deg)" }}><Ic name="car" size={54} color="#ea6b14" /></span>
          <span className="ff-hi-hide" style={{ top:"34%", right:"16%", transform:"rotate(-10deg)" }}><Ic name="thermometer" size={50} color="#ea6b14" /></span>
          <span className="ff-hi-hide" style={{ top:"82%", right:"20%", transform:"rotate(-6deg)" }}><Ic name="home" size={50} color="#ea6b14" /></span>
        </div>
        <motion.div className="ff-inner" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <motion.svg className="ff-logo-mark" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"
            initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }}>
            
            <polygon points="65.9,50.7 50.7,65.9 29.3,65.9 14.1,50.7 14.1,29.3 29.3,14.1 50.7,14.1 65.9,29.3" fill="rgba(234,107,20,0.08)" stroke="#ea6b14" strokeWidth="2"/>
            <path d="M28 54 L28 38 L40 28 L52 38 L52 54 Z" stroke="var(--ff-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M36 54 L36 43 L44 43 L44 54" stroke="#ea6b14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            
          </motion.svg>

          <motion.h1 className="ff-title" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
            FREDDY<br /><span>FIXIT</span>
          </motion.h1>

          <motion.p className="ff-tagline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.35 }}>
            Vetted Handymen & Trades — On Demand
          </motion.p>

          <div className="ff-divider" />

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }}
            style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:".7rem", marginBottom:"1.7rem" }}>
            <span style={{ display:"inline-flex", alignItems:"center", gap:".45rem", fontSize:"1rem", fontWeight:500, color:"rgba(var(--ff-fg), .9)" }}>
              <Ic name="clipboard-list" size={17} color="#ea6b14" />Free estimate — no signup
            </span>
            <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:".45rem 1.4rem", maxWidth:"560px" }}>
              {[
                { icon:"user-check", label:"Vetted, licensed & insured" },
                { icon:"dollar", label:"Payment held until you confirm" },
                { icon:"map-pin", label:"Calgary local" },
              ].map((t) => (
                <span key={t.label} style={{ display:"inline-flex", alignItems:"center", gap:".4rem", fontSize:".78rem", fontWeight:300, letterSpacing:".01em", color:"rgba(var(--ff-muted), .62)" }}>
                  <Ic name={t.icon as any} size={14} color="#ea6b14" />{t.label}
                </span>
              ))}
            </div>
          </motion.div>
          <motion.div className="ff-cards" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45 }}>
            <div className="ff-card ff-card-client" onClick={() => setLocation("/client-onboarding")}>
              <div className="ff-card-icon"><Ic name="home" size={32} color="#ea6b14" /></div>
              <div className="ff-card-title">I Need a Fix</div>
              <div className="ff-card-sub">Home repairs &amp; vehicle maintenance — get a free estimate</div>
              <div className="ff-card-cta">Get my free estimate →</div>
            </div>
            <div className="ff-card ff-card-contractor" onClick={() => setLocation("/contractor-onboarding")}>
              <div className="ff-card-icon"><Ic name="wrench" size={32} color="#ea6b14" /></div>
              <div className="ff-card-title">I'm a Contractor</div>
              <div className="ff-card-sub">Join our Calgary network and get more local jobs</div>
              <div className="ff-card-cta">Get started →</div>
            </div>
          </motion.div>

          <motion.a href="https://wa.me/18255618331" target="_blank" rel="noopener noreferrer" className="ff-whatsapp"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Chat with us on WhatsApp
          </motion.a>
        </motion.div>

        <div className="ff-scroll-hint">
          <span>Scroll</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
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

      {/* ── How It Works ── */}
      <div className="ff-how">
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
              Power-packed maintenance & repair solutions and on-site services that dominate deadlines and crush downtime.
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

      {/* ── Testimonials ── */}
      <div style={{ background:"var(--ff-surface)", padding:"6rem 2rem" }}>
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
