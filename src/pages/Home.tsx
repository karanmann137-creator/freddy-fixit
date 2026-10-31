import { useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Ic } from "@/components/Ic";
import FadeImg from "@/components/FadeImg";
import OnboardingVideo from "@/components/OnboardingVideo";

const BEFORE_AFTER = [
  { label:"Bathroom Renovation", before:"/before-after/bathroom-before.webp", after:"/before-after/bathroom-after.webp" },
  { label:"Landscaping",         before:"/before-after/landscaping-before.webp", after:"/before-after/landscaping-after.webp" },
  { label:"Furniture Assembly",  before:"/before-after/furniture-before.webp",   after:"/before-after/furniture-after.webp" },
  { label:"Kitchen Remodel",     before:"/before-after/kitchen-before.webp",  after:"/before-after/kitchen-after.webp" },
  { label:"Appliance Install",   before:"/before-after/appliance-before.webp",   after:"/before-after/appliance-after.webp" },
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
  const axis = useRef<"x" | "y" | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const wheelLock = useRef(0);

  const moveTo = (clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let p = ((clientX - r.left) / r.width) * 100;
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    setPct(p);
  };
  // Works for mousedown/mousemove/mouseup (clientX/Y), touchstart/touchmove
  // (touches[0]) and touchend (changedTouches[0], since touches is empty by then).
  const pointOf = (e: any) => {
    if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  };
  const step = (dir: 1 | -1) => {
    setIdx((i) => (i + dir + BEFORE_AFTER.length) % BEFORE_AFTER.length);
    setPct(55);
  };

  const onDown = (e: any) => {
    dragging.current = true;
    axis.current = null;
    start.current = pointOf(e);
  };
  const onMove = (e: any) => {
    if (!dragging.current) return;
    const p = pointOf(e);
    const dx = p.x - start.current.x;
    const dy = p.y - start.current.y;
    if (!axis.current) {
      // Wait for a small, deliberate movement before committing to an axis,
      // so a light tap or a slightly wobbly swipe doesn't misfire the other gesture.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
    }
    // Horizontal = live-drag the reveal slider. Vertical = tracked but only
    // committed on release, so a swipe that changes its mind mid-gesture can
    // still cancel by not crossing the threshold in onUp.
    if (axis.current === "x") moveTo(p.x);
  };
  const onUp = (e: any) => {
    if (dragging.current && axis.current === "y") {
      const dy = pointOf(e).y - start.current.y;
      if (dy < -32) step(1);
      else if (dy > 32) step(-1);
    }
    dragging.current = false;
    axis.current = null;
  };
  const onWheel = (e: any) => {
    const now = Date.now();
    if (now - wheelLock.current < 500 || Math.abs(e.deltaY) < 24) return;
    wheelLock.current = now;
    step(e.deltaY > 0 ? 1 : -1);
  };

  const pair = BEFORE_AFTER[idx];

  return (
    <div style={{ maxWidth:"900px", margin:"0 auto" }}>
      <div className="ff-ba-dots">
        {BEFORE_AFTER.map((p, i) => (
          <span key={p.label} className={"ff-ba-dot" + (i === idx ? " ff-ba-dot-on" : "")} />
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
        onWheel={onWheel}
      >
        {/* Below the fold and behind a swipe, so nothing here competes with the
            hero for bandwidth. The wrapper already fixes a 16/9 aspect ratio,
            so lazy-loading costs no layout shift. */}
        <FadeImg className="ff-ba-img" src={pair.after} srcSet={baSrcSet(pair.after)} sizes={BA_SIZES}
          alt={pair.label + " after"} draggable={false} decoding="async" loading="lazy" />
        <FadeImg className="ff-ba-img" src={pair.before} srcSet={baSrcSet(pair.before)} sizes={BA_SIZES}
          alt={pair.label + " before"} draggable={false} decoding="async" loading="lazy"
          style={{ clipPath: "inset(0 " + (100 - pct) + "% 0 0)" }} />

        <span className="ff-ba-label">{pair.label}</span>
        <span className="ff-ba-badge ff-ba-badge-before" style={{ opacity: pct > 12 ? 1 : 0 }}>Before</span>
        <span className="ff-ba-badge ff-ba-badge-after" style={{ opacity: pct < 88 ? 1 : 0 }}>After</span>

        <div className="ff-ba-vhint">
          <button
            type="button"
            className="ff-ba-vbtn"
            aria-label="Previous project"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); step(-1); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            type="button"
            className="ff-ba-vbtn"
            aria-label="Next project"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); step(1); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

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
      <p className="ff-ba-note">Illustrative examples. Swipe up or down to browse projects, drag left or right to reveal the transformation.</p>
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

// The hero panel types these out one after another, so the box demonstrates
// what a request looks like instead of describing it. Every line is drawn from
// the real service vocabulary (see service_specialty_map) and is written the
// way somebody actually types on a phone — a symptom and a room, not a trade
// name. A visitor who reads two of these knows what to write in the box.
const HERO_EXAMPLES = [
  "My kitchen tap has been dripping for a week",
  "Garage door won't close all the way",
  "Need the gutters cleared before the snow",
  "Basement light keeps flickering",
  "Fence panel came down in the wind",
  "Furnace is making a loud rattling noise",
  "Bathroom drain is backing up",
  "Need a TV mounted on the living room wall",
];

// What the hero box accepts, and what it will carry in the URL. Kept short on
// purpose: this is the one-sentence version of the problem, and the real
// description field on the request form has room for the rest. It also keeps
// the query string well inside every browser's URL limit, so the handoff can
// never silently truncate somebody's words.
const HERO_DESC_MAX = 400;

export default function Home() {
  const [, setLocation] = useLocation();

  // ── Hero panel typewriter ────────────────────────────────────────────
  // Types each HERO_EXAMPLES line out, holds it, deletes it, moves on — into
  // the box's PLACEHOLDER, because the box is a real textarea the client can
  // type into. `typed` is therefore the prompt; `heroDesc` is their answer.
  const [typed, setTyped] = useState("");
  const [heroDesc, setHeroDesc] = useState("");
  const [heroBoxFocused, setHeroBoxFocused] = useState(false);
  /**
   * Is the animation allowed to run?
   *
   * The moment somebody puts a cursor in the box, the examples have done
   * their job and become interference — text appearing and vanishing under
   * a live caret reads as the field fighting you. So it stops on focus AND
   * on any typed character, and resumes only if the box is empty and left
   * alone again. Focus alone is not enough on its own: most browsers keep
   * showing a placeholder on an empty focused field, so a half-typed
   * example would freeze there mid-word until the first keystroke.
   */
  const heroBoxIdle = !heroBoxFocused && heroDesc.trim() === "";
  // Gate on visibility, the same reasoning as NotificationBell's poll: a
  // timer that keeps firing while the section is off screen is pure waste,
  // and the point of the effect is that it animates WHILE somebody is
  // looking at it. Starts true and falls back to true when
  // IntersectionObserver is missing — failing open means the text is
  // present rather than an empty box.
  const [heroSeen, setHeroSeen] = useState(true);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) setHeroSeen(e.isIntersecting); },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // Clearing on the way out matters as much as stopping. Leaving the last
    // partial line in `typed` would park a frozen half-sentence in the
    // placeholder of a box the client has just clicked into — and would show
    // it again, mid-word, the moment they scrolled back.
    if (!heroSeen || !heroBoxIdle) { setTyped(""); return; }

    // Reduced motion gets whole strings swapped on a slow interval instead
    // of a per-character animation — the examples still cycle, nothing
    // moves. matchMedia is guarded because it isn't universal.
    let reduced = false;
    try { reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { /* default: animate */ }

    let i = 0;
    if (reduced) {
      setTyped(HERO_EXAMPLES[0]);
      const id = window.setInterval(() => {
        i = (i + 1) % HERO_EXAMPLES.length;
        setTyped(HERO_EXAMPLES[i]);
      }, 4000);
      return () => window.clearInterval(id);
    }

    let pos = 0;
    let deleting = false;
    let timer: number | undefined;

    const tick = () => {
      const full = HERO_EXAMPLES[i];
      if (!deleting) {
        pos += 1;
        setTyped(full.slice(0, pos));
        if (pos >= full.length) { deleting = true; timer = window.setTimeout(tick, 2200); return; }
        timer = window.setTimeout(tick, 38);
      } else {
        pos -= 4;
        if (pos <= 0) {
          pos = 0;
          setTyped("");
          deleting = false;
          i = (i + 1) % HERO_EXAMPLES.length;
          timer = window.setTimeout(tick, 420);
          return;
        }
        setTyped(full.slice(0, pos));
        timer = window.setTimeout(tick, 16);
      }
    };
    timer = window.setTimeout(tick, 600);
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [heroSeen, heroBoxIdle]);

  // ONE definition of the contractor line, rendered into two breakpoint-
  // exclusive slots: inside the left column on desktop, and below the describe
  // panel on a phone. Only one of the two is ever displayed, so the copy and
  // the handler cannot drift the way two pasted copies would.
  const joinLine = (
    <>
      A tradesperson?{" "}
      <button onClick={() => setLocation("/contractor-onboarding")}>Join Freddy's team →</button>
    </>
  );

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", background:"var(--ff-bg)", color:"var(--ff-text)", overflowX:"clip" as const }}>
      <style>{`
        /* ⚠ No @import here on purpose. This block used to open with a second
           font request that was a strict SUBSET of the <link> in index.html
           (that one asks for DM Sans up to 700, this asked only to 600), so it
           could never load anything the page didn't already have — it only
           blocked this stylesheet while the browser revalidated a request it
           had already made. Worse, it asked for Fraunces, which nothing in
           src/ renders any more: the display face resolves through
           --ff-font-display. Add a face to index.html, never here. */
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
          /* Top padding clears the fixed TopNav (~4.5rem tall incl. its own
             padding) so the eyebrow never sits under the wordmark. */
          padding: 5rem clamp(1.15rem, 5vw, 2rem) clamp(2rem, 7vh, 3.5rem);
        }
        /* Bottom vignette. Dark mode keeps the exact original near-black
           glow — rgba(9,13,22,0.92), byte-identical — because that's what
           makes the navy hero read as premium/moody rather than flat; this
           rule must never change dark mode's rendering. Light mode's hero
           now falls through to an off-white ground (.ff-on-dark, see
           main.tsx), so the same near-black value would render as a dark
           smudge across the bottom of it. Light gets a much subtler
           equivalent in the same ink used for text (#0f172a, --ff-text in
           light mode) at 6% instead of 92% — just enough depth behind the
           button/tick-row area to keep the hero from reading perfectly flat,
           without introducing a tinted ground (the page-ground rule
           elsewhere in this codebase exists for exactly that reason). Scoped
           by data-theme rather than a token because this gradient is a
           one-off decorative value nothing else references. */
        :root:not([data-theme="light"]) .ff-hero {
          background-image: radial-gradient(ellipse 85% 55% at 50% 118%, rgba(9,13,22,0.92) 0%, transparent 72%);
        }
        :root[data-theme="light"] .ff-hero {
          background-image: radial-gradient(ellipse 85% 55% at 50% 118%, rgba(15,23,42,0.06) 0%, transparent 72%);
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
        /* ── The mark, tiled, as the ground the hero sits on ──────────
           This REPLACES two things: twelve hand-placed trade icons (wrench,
           pipe, hammer…) that used to scatter across this same layer, and
           the big .ff-herolock mark that sat at the top of the left column.
           One identity, stated once, as texture.

           A tiled pattern and a scattered icon field are two different
           textures competing for the same 5%-of-ink layer, and the result
           reads as noise rather than as either — so the twelve went, rather
           than being dimmed to make room.

           HALF-DROP, not a square grid. The tile carries two marks offset
           diagonally by half the tile, so each row sits half a step off the
           one above it. That kills the vertical channels a square grid
           creates, and an octagon wants it anyway — offset rows are how
           octagons pack. A straight grid behind a 54/46 split also reads as
           a misalignment that isn't there.

           The mask is inherited unchanged from the layer this replaces: it
           erases the field through the whole middle of the section and fades
           it up toward the edges, so the pattern is dense where the eye isn't
           and absent where the words are. Nothing ever sits behind the
           headline.

           NO sketch filter, and it stays off BY CONSTRUCTION rather than by
           an override. The twelve icons it replaces were wobbled by the
           global 'svg[viewBox="0 0 24 24"] { filter: url(#ff-sketch-a) }'
           rule in main.tsx — a selector keyed on the viewBox, not on a class.
           This <svg> carries no viewBox at all (see the note on the markup
           for why: userSpaceOnUse needs real pixels), so the rule simply
           never matches it and no 'filter: none' is needed.

           That is also the right outcome on its own terms. An feTurbulence
           displacement over a rect filling the whole viewport is a different
           proposition from one over a 70px glyph, and it would repaint on
           every resize. The .ff-herolock mark never carried a filter either,
           so clean is the consistent choice as well as the cheap one. */
        .ff-hero-ptn { position: absolute; inset: 0; width: 100%; height: 100%;
          z-index: 0; pointer-events: none;
          -webkit-mask-image: radial-gradient(ellipse 60% 54% at 50% 48%, transparent 30%, #000 82%);
                  mask-image: radial-gradient(ellipse 60% 54% at 50% 48%, transparent 30%, #000 82%); }
        /* ⚠ Strokes are declared HERE, not as presentation attributes on the
           <pattern> children, for two reasons: var() in an SVG presentation
           attribute is not dependable across browsers, and these have to
           resolve per THEME. .ff-hero is .ff-on-dark but deliberately NOT
           .ff-anchor, so this band genuinely flips in light mode — --ff-c10
           becomes #d65f10 and --ff-fg becomes a dark triple, and both halves
           of the mark follow on their own. A literal #ea6b14 here would have
           painted orange marks on an off-white ground.

           The orange is a KNOWING exception to "orange appears once per
           screen". It is spent at 13% on a masked backdrop, an order of
           magnitude under the headline accent and the button — but it is
           still a third orange thing on this hero, and if the <em> in "You
           pick the price" ever starts feeling weak, this stroke-opacity is
           the first number to pull down. */
        .ff-hero-ptn .ff-ptn-a { stroke: var(--ff-c10); stroke-opacity: 0.13; }
        .ff-hero-ptn .ff-ptn-b { stroke: rgb(var(--ff-fg)); stroke-opacity: 0.05; }
        /* ⚠ The mask geometry CANNOT be the same stacked, and this is not a
           taste adjustment. The desktop hole is an ellipse 60% of the width,
           because two columns inside a 60rem measure leave real margin on
           both sides for the pattern to live in. Stacked, the headline and
           the panel run to ~90% of the viewport width — so that same 60% hole
           leaves tiles sitting directly behind text on both edges, and the
           ones it does clear are narrow vertical slivers of a 120px tile,
           which read as a rendering fault rather than as texture.

           So on phones the hole opens to 94% wide and the pattern survives
           only as bands at the top and bottom of the section, where it is
           whole rows of marks and nothing has to be read over it. The tile
           size is deliberately NOT changed to suit: 'patternTransform' is an
           SVG attribute, not a CSS property, so it can't be media-queried
           from here, and the CSS 'transform' route on a <pattern> element is
           not dependable. Masking is the lever that actually works. */
        @media (max-width: 900px) {
          .ff-hero-ptn {
            -webkit-mask-image: radial-gradient(ellipse 94% 46% at 50% 50%, transparent 46%, #000 96%);
                    mask-image: radial-gradient(ellipse 94% 46% at 50% 50%, transparent 46%, #000 96%);
          }
        }

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
           re-tuning the whole hero is one number.

           TWO COLUMNS above 900px — 58/42, deliberately not half and half.
           An even split reads as two things of equal weight with no answer
           to "which do I do first?"; the wider side carries the promise and
           the narrower one carries the box, so the eye lands left, reads,
           and moves right into the thing it can act on. Both tracks are
           minmax(0, …) because a bare fr is minmax(auto, fr) and the
           headline's longest word would otherwise set a floor the grid
           can't shrink under. Below 900px the two stack and the whole
           thing returns to the centred single column it was. */
        .ff-hero-body {
          --ff-mod: clamp(0.62rem, 1.9vh, 0.95rem);
          position: relative; z-index: 1; flex: 1; width: 100%; max-width: 46rem; margin: 0 auto;
          display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: min-content;
          justify-items: center; align-content: center; row-gap: var(--ff-mod);
          text-align: center;
        }
        /* The left column keeps the modular stack the whole hero used to
           have, so the rhythm is unchanged — it just no longer spans the
           full width.

           Flex column, NOT grid, and that swap is what makes the raise
           below possible at all. 'margin-top: auto' absorbs the free space
           of a flex container, but in a grid it can only absorb space
           inside the ROW the item sits in — and 'grid-auto-rows:
           min-content' gives every row exactly its content's height, so
           there is never any to absorb. The rhythm is identical either
           way: 'gap' replaces 'row-gap', 'align-items' replaces
           'justify-items', and the per-item margin rules below still add
           on top of the gap exactly as they did. */
        .ff-hero-left {
          display: flex; flex-direction: column; align-items: center;
          gap: var(--ff-mod); width: 100%; min-width: 0;
        }
        /* Group breaks, expressed in modules rather than eyeballed pixels.
           The headline deliberately has NO break above it: the tagline and
           the promise are one thought, and with the mark gone from the top of
           this column there is nothing left for a break to separate the
           headline FROM. It used to earn 2 modules (its own + the gap)
           because it opened a new group under the logo. */
        .ff-hero-left > .ff-cta      { margin-top: calc(var(--ff-mod) * 2); }
        .ff-hero-left > .ff-hero-alt { margin-top: calc(var(--ff-mod) * 2); }

        @media (min-width: 901px) {
          /* 60rem, not 72rem, and 54/46, not 58/42. Both halves pull in
             toward the page's centre line instead of being flung at the two
             outer margins — which is what made a 1400px-wide window read as
             two unrelated things rather than one composition. The split is
             still uneven, so the question "which do I do first?" still has
             an answer; it is just no longer a chasm.

             The column gap comes down with it (4.5rem → 2.6rem). A gap wider
             than the panel's own padding by an order of magnitude is what a
             gutter looks like, not a relationship. */
          .ff-hero-body {
            max-width: 60rem;
            grid-template-columns: minmax(0, 54fr) minmax(0, 46fr);
            column-gap: clamp(1.6rem, 3.2vw, 2.6rem);
            align-items: center; justify-items: stretch;
            text-align: left;
          }
          .ff-hero-left { align-items: flex-start; }
          .ff-hero-left > .ff-sub { margin-left: 0; margin-right: 0; }
        }
        /* ⚠ THE RAISE IS GONE, AND IT SHOULD STAY GONE. What stood here was
           a 'min-width: 901px and min-height: 640px' block that stretched
           the left column to the full height of the hero and gave
           '.ff-cta' a 'margin-top: auto', so the orange button was shoved
           to the floor of a 100vh section and the panel got a matching
           'margin-bottom' to chase it down there.

           The intent was "anchor the action low". The effect was that every
           leftover pixel of viewport height — which on a tall desktop
           window is a lot — collected into ONE void between the three steps
           and the button, while every other gap in the hero stayed at its
           module. That is what made the spacing read as mismanaged: nothing
           was mis-sized, the blocks were being pushed apart on purpose.

           The modular stack now simply centres in its row, so the gaps the
           --ff-mod rhythm describes are the gaps you actually see, at every
           window height. If "anchor the action low" is ever wanted again,
           it needs to be a bounded spread (a max'd spacer), never an
           unbounded 'auto' on a viewport-height column. */
        /* One column, so the flex-era justify-content that used to push the
           body into the thumb arc becomes align-content. On a short phone a
           plain "end" would overflow the TOP of the section, so the stacked
           layout stays centred and .ff-hero's min-height lets it grow
           instead of being clipped by the section's overflow:hidden. */
        @media (max-width: 640px) {
          .ff-hero-body { --ff-mod: clamp(0.5rem, 1.4vh, 0.8rem); }
        }

        /* Not Bebas. Bebas is a condensed all-caps display face — it has no
           lowercase at all, so the headline was being SHOUTED at a first-time
           visitor in 5.6rem type. Real upper and lower case reads as a
           sentence somebody wrote rather than a poster, which is the whole
           point: the promise is meant to be read, not announced. It is also
           smaller than the Bebas original, because lowercase carries far more
           width per character than condensed caps — the line occupies about
           the same space on screen at two-thirds the font-size.

           The face is --ff-font-display (Archivo), which replaced Fraunces
           site-wide. Fraunces solved the shouting but created a second
           problem one band down: the card titles inside every band are Bebas,
           so a high-contrast serif headline above them read as a collision
           rather than a hierarchy. Archivo shares Bebas's grotesque skeleton,
           so the two now relate.

           ⚠ Weight comes from --ff-display-wght (700), NOT the 500 this
           carried under Fraunces. That is not a reversal of the "less bold"
           ask — a grotesque at 500 in 3.6rem type reads as under-set body
           copy, where Fraunces' stroke contrast carried the same weight as
           display. Tracking tightens with it for the same reason. Don't put
           font-variation-settings here: setting 'wght' there would override
           the font-weight declaration outright. */
        .ff-h1 { font-family: var(--ff-font-display); font-weight: var(--ff-display-wght);
          font-size: clamp(2.35rem, 5.2vw, 3.6rem); line-height: 1.04; letter-spacing: -0.028em;
          color: var(--ff-ink-1); margin: 0; }
        .ff-h1 em { font-style: normal; color: var(--ff-c10); }
        /* The three steps. Now DM Sans, since the headline it used to echo is
           no longer Bebas — kept small and widely tracked so it still reads as
           a caption under the promise rather than as body copy. Deliberately
           NOT orange: the 10 of 60/30/10 is spent on the h1 accent and the
           CTA, and a third orange thing in a hero is what turns an accent
           into wallpaper. */
        .ff-steps { font-family: 'DM Sans', sans-serif; font-weight: 500;
          font-size: clamp(0.92rem, 2.4vw, 1.05rem); line-height: 1.2; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--ff-ink-2); margin: 0; }
        .ff-sub { font-size: clamp(1rem, 2.5vw, 1.15rem); font-weight: 300; line-height: 1.62;
          color: var(--ff-ink-3); max-width: 33rem; margin: 0; }
        .ff-sub strong { color: var(--ff-ink-2); font-weight: 500; }

        /* The one accent action on the page. 56px tall is the floor, not the
           target — it clears the 44px thumb minimum with room for a mis-tap. */
        .ff-cta { display: inline-flex; align-items: center; justify-content: center; gap: 0.55rem;
          width: 100%; max-width: 23rem; min-height: 56px;
          padding: 1rem 1.5rem; border: none; border-radius: 14px; cursor: pointer;
          background: linear-gradient(180deg, var(--ff-accent-400) 0%, var(--ff-accent-500) 100%);
          color: #fff; font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 1.05rem; letter-spacing: 0.02em;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 10px 30px rgba(234,107,20,0.28);
          transition: transform 0.18s cubic-bezier(0.2,0.7,0.3,1), box-shadow 0.18s ease, filter 0.18s ease; }
        .ff-cta:hover { transform: translateY(-2px); filter: brightness(1.04);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), 0 16px 40px rgba(234,107,20,0.38); }
        .ff-cta:active { transform: translateY(0) scale(0.994); }
        .ff-cta:focus-visible { outline: 2px solid var(--ff-accent-400); outline-offset: 3px; }

        /* ── Hero panel: "describe your problem" ──────────────────────────
           A dark translucent card sitting on the navy ground, so it reads as
           a surface on the hero rather than a box bolted onto it. It is not
           a form: there is no <input>, because a real field on the homepage
           would need validation, submission and an error state for a job
           that is actually posted three screens later in onboarding. The
           box demonstrates and then hands off — tapping anywhere in it, or
           pressing Next, goes to the same place the orange button does.

           That also sidesteps the iOS zoom trap entirely: the 16px computed
           font-size floor applies to inputs, and there is no input here. */
        /* ⚠ The bezel is DELIBERATELY thin (0.68rem of padding, where this
           used to carry up to 1.6rem). The frame is not the point — the
           words inside it are — and a wide inset made the panel read as a
           picture mount around the textarea rather than as one control.
           Radius comes down with it: a 20px corner on a 0.68rem inset
           bulges, because the curve eats more than half the padding it has
           to live inside. 18px outer against the box's 13px keeps the two
           curves concentric, which is the only reason those two numbers are
           related at all. */
        .ff-hero-panel {
          width: 100%; min-width: 0; display: flex; flex-direction: column; gap: 0.6rem;
          padding: clamp(0.55rem, 1.1vw, 0.68rem);
          background: rgba(var(--ff-fg), 0.045);
          border: 1px solid rgba(var(--ff-fg), 0.12);
          border-radius: 18px;
          -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
          box-shadow: 0 24px 60px rgba(0,0,0,0.30);
          text-align: left;
        }
        /* Slightly bigger than the hero's body copy on purpose — it is the
           instruction, and it has to out-rank the example text underneath
           it or the panel reads as a quote rather than a prompt.

           ⚠ THE DISPLAY FACE, not DM Sans, and that is the whole answer to
           "the font in the textbox doesn't match the main text". The headline
           beside it is the display face; this label is the panel's own
           headline, so in DM Sans it read as a form field borrowed from a
           dashboard and dropped onto a page you read. The brand rule puts the
           display face on pages you READ and Bebas on pages you OPERATE — the
           hero is the former, and a label is only "small UI" when it sits in
           an operating surface.

           ⚠ This is the ONE display site that keeps font-weight 500 rather
           than --ff-display-wght, and it is deliberate. At 1.22rem the label
           sits only a little above body copy, and 700 here made it compete
           with the h1 two columns over instead of reading as its subordinate.
           The weight bump exists to stop a grotesque looking under-set at
           DISPLAY size; this isn't display size.

           line-height 1.32 and the slight negative tracking survive the face
           change from Fraunces: Archivo also has real descenders and also
           sets wider than DM Sans at the same size. 1.22rem was picked to
           hold the same optical weight against the box beneath it. The
           textarea itself stays DM Sans — it is body copy the client will
           type into, not a heading. */
        .ff-panel-label { font-family: var(--ff-font-display); font-weight: 500;
          font-size: 1.22rem; line-height: 1.32; letter-spacing: -0.01em;
          color: var(--ff-ink-1); margin: 0; }
        /* A REAL textarea, not a button dressed as one. The examples type
           themselves into the PLACEHOLDER, so the same animation that used
           to be a demonstration is now an invitation — the client can put
           the cursor in and answer it. min-height holds two lines so the
           card never changes height as lines of different length cycle
           through; a panel that grows and shrinks on its own is the kind
           of movement that reads as a bug.

           1rem here is load-bearing, not cosmetic. '--ff-font-scale' is
           1.1, so this computes to ~17.6px — safely over the 16px floor
           below which iOS Safari zooms the viewport on focus and never
           zooms back out. The '@media (pointer: coarse)' rule in main.tsx
           is the belt to that braces. Do not shrink it to .85rem to match
           the rest of the codebase's habit; that computes to ~15px, which
           is exactly the bug that made bidding unusable on a phone. */
        .ff-panel-box {
          display: block; width: 100%; min-height: 6.4rem; text-align: left;
          padding: 0.85rem 0.95rem; resize: vertical;
          background: rgba(var(--ff-bg-rgb), 0.35);
          border: 1px solid rgba(var(--ff-fg), 0.10);
          border-radius: 13px;
          font-family: 'DM Sans', sans-serif; font-weight: 400; font-size: 1rem; line-height: 1.5;
          color: var(--ff-ink-1);
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        /* The example lines are a prompt, not an answer, so they sit a
           step back from what the client types. opacity:1 because Firefox
           dims placeholders on its own and would compound it. */
        .ff-panel-box::placeholder { color: var(--ff-ink-3); opacity: 1; }
        .ff-hero-panel:hover .ff-panel-box { border-color: rgba(var(--ff-fg), 0.18); }
        /* :focus first, :focus-visible after — a mouse user gets the warm
           border, a keyboard user gets that plus the ring, and the later
           rule is what makes the ring survive the outline:none above it. */
        .ff-panel-box:focus { outline: none; border-color: var(--ff-accent-400);
          background: rgba(var(--ff-bg-rgb), 0.5); }
        .ff-panel-box:focus-visible { outline: 2px solid var(--ff-accent-400); outline-offset: 2px; }
        /* Smaller than the orange hero button, deliberately. There are two
           routes to the same screen on one hero; the left one is the primary
           and this is the shortcut from the demonstration, so it must not
           read as a competing second decision. */
        .ff-panel-next {
          align-self: flex-end; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
          min-height: 44px; padding: 0.5rem 1.05rem;
          border: none; border-radius: 11px; cursor: pointer;
          background: linear-gradient(180deg, var(--ff-accent-400) 0%, var(--ff-accent-500) 100%);
          color: #fff; font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 0.88rem; letter-spacing: 0.02em;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 18px rgba(234,107,20,0.24);
          transition: transform 0.18s cubic-bezier(0.2,0.7,0.3,1), filter 0.18s ease; }
        .ff-panel-next:hover { transform: translateY(-1px); filter: brightness(1.04); }
        .ff-panel-next:active { transform: translateY(0) scale(0.994); }
        .ff-panel-next:focus-visible { outline: 2px solid var(--ff-accent-400); outline-offset: 3px; }
        /* Stacked, the panel is below the fold on most phones and a
           full-width card there adds height for no gain, so it is capped to
           the same measure the button uses and centred with it. */
        @media (max-width: 900px) {
          .ff-hero-panel { max-width: 30rem; margin: calc(var(--ff-mod) * 2) auto 0; }
        }

        /* Desktop only. ⚠ THIS USED TO DROP THE PANEL and it no longer does.
           What stood here was 'align-self: end' plus a
           'margin-bottom: calc(var(--ff-mod) * 3 + 1.25rem)' whose only job
           was to subtract the blocks sitting under the orange button, so the
           panel's bottom edge would line up with the button rather than with
           the foot of the column.

           It was the panel's half of the raise that was deleted above: the
           left column was stretched to the hero's full height and the button
           pushed to its floor, and this margin chased the panel down to meet
           it. With the raise gone there is nothing down there to line up
           with — keeping it would have hung the panel below its own row for
           no reason, which is the same void complaint from the other side.

           'center' now, matching the grid's 'align-items: center'. It is
           stated explicitly rather than left to inherit because this rule is
           declared after the max-width block on purpose, so the
           equal-specificity ties resolve in source order and the override is
           visible where someone looking for it would read. */
        @media (min-width: 901px) {
          .ff-hero-panel {
            align-self: center;
            margin-bottom: 0;
          }
          /* A bigger area to type in. Height only — font-size is deliberately
             untouched at 1rem; see the note on .ff-panel-box above. */
          .ff-panel-box { min-height: 8.8rem; }
          /* And a smaller Next, so the shortcut reads as even more clearly
             subordinate to the orange button beside it. */
          .ff-panel-next {
            min-height: 38px; padding: 0.4rem 0.9rem;
            border-radius: 10px; font-size: 0.82rem;
          }
        }
        /* A wide touch screen is still a thumb. The 44px floor main.tsx sets
           under 'pointer: coarse' loses to the class selector above, so it is
           restored here rather than left to be quietly overridden. */
        @media (min-width: 901px) and (pointer: coarse) {
          .ff-panel-next { min-height: 44px; }
        }

        /* A notch larger than the contractor line's neighbours, so a tradesperson
           scanning the page actually registers it — but still well under the
           subheading, so it never competes with the orange button. */
        .ff-hero-alt { font-size: 0.95rem; color: var(--ff-ink-4); }
        .ff-hero-alt button { background: none; border: none; padding: 0; cursor: pointer; font: inherit;
          color: var(--ff-ink-2); font-weight: 500; text-decoration: underline; text-underline-offset: 3px;
          transition: color 0.18s; }
        .ff-hero-alt button:hover { color: var(--ff-c10); }

        /* The contractor line moves below the describe box on a phone: it is
           an aside for a different audience, and above the box it sat between
           the orange button and the one thing a client is meant to do next.
           Both copies are always in the markup and CSS picks one — the media
           query is declared AFTER the base rule so equal specificity resolves
           by source order. display:none (not visibility or opacity) keeps the
           hidden one out of the tab order and the a11y tree, so a screen
           reader never meets the line twice. 900px mirrors the two-column
           switch at min-width:901px exactly. The extra margin-top reproduces
           the group break the left column gets from its own child rule, on
           top of the grid's row-gap. */
        .ff-alt-narrow { display: none; }
        @media (max-width: 900px) {
          .ff-hero-left > .ff-alt-wide { display: none; }
          .ff-alt-narrow { display: block; margin-top: var(--ff-mod); }
        }

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
        /* Mobile-only reorder: trust strip moves below the "Why Freddy Fix It" (About)
           section, ahead of Freddy Verified. Desktop is untouched — no order is set
           outside this media query, so ties resolve by source order there. */
        @media (max-width: 900px) {
          .ff-mobile-reorder { display: flex; flex-direction: column; }
          .ff-mobile-reorder > .ff-how { order: 0; }
          .ff-mobile-reorder > .ff-about { order: 1; }
          .ff-mobile-reorder > .ff-trust-strip { order: 2; }
          .ff-mobile-reorder > .ff-on-dark { order: 3; }
        }
        /* Named properties, not the all keyword: :hover below changes exactly
           three things, and a blanket transition would also animate whatever a
           future edit adds. See CLAUDE.md, Brand tokens. */
        .ff-service-card { background: rgba(var(--ff-fg), 0.04); border: 1px solid rgba(var(--ff-fg), 0.08); border-radius: 12px; padding: 1.5rem 1rem; text-align: center; transition: border-color 0.25s var(--ff-ease-out), transform 0.25s var(--ff-ease-out), box-shadow 0.25s var(--ff-ease-out); width: 100%; }
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
        /* The largest display type on the site (up to 5rem), so it is the site
           where under-tracking shows first — hence the full -0.028em rather
           than the -0.015em that was right for Fraunces. */
        .ff-about-headline { font-family: var(--ff-font-display); font-weight: var(--ff-display-wght); font-size: clamp(2.8rem, 7vw, 5rem); letter-spacing: -0.028em; line-height: 1.02; color: var(--ff-text); margin-bottom: 2rem; }
        .ff-about-headline span { color: #ea6b14; }
        .ff-about-body { font-size: 1.1rem; color: rgba(var(--ff-muted), 0.7); font-weight: 300; line-height: 1.8; max-width: 680px; margin-bottom: 3rem; }
        .ff-about-body strong { color: var(--ff-text); font-weight: 500; }
        /* A pull-quote, so weight stays 500 rather than --ff-display-wght for
           the same reason .ff-panel-label does: at 2rem it is set BELOW the
           5rem headline it follows, and 700 here flattened the two into one
           shout. letter-spacing comes off "normal" only slightly — a grotesque
           set loose at quote size looks accidental, set tight it looks like a
           heading, and this is neither. */
        .ff-about-tagline { font-family: var(--ff-font-display); font-weight: 500; font-size: clamp(1.4rem, 4vw, 2rem); letter-spacing: -0.012em; color: rgba(234,107,20,0.85); border-left: 3px solid #ea6b14; padding-left: 1.25rem; line-height: 1.3; margin-bottom: 4rem; }
        .ff-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; }
        @media (max-width: 600px) { .ff-stats { grid-template-columns: minmax(0, 1fr); } }
        .ff-stat { background: rgba(var(--ff-fg), 0.03); border: 1px solid rgba(var(--ff-fg), 0.07); border-radius: 12px; padding: 1.75rem; }
        .ff-stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 3rem; letter-spacing: 0.06em; color: #ea6b14; line-height: 1; margin-bottom: 0.4rem; }
        .ff-stat-label { font-size: 0.82rem; color: rgba(var(--ff-muted), 0.5); font-weight: 300; line-height: 1.4; }

        /* ── Video showcase ── */
        .ff-video-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.75rem; }
        @media (max-width: 760px) { .ff-video-grid { grid-template-columns: minmax(0, 1fr); } }
        .ff-video-grid > div { min-width: 0; }

        /* ── Before / After ── */
        .ff-ba-dots { display: flex; justify-content: center; gap: 0.4rem; margin-bottom: 1.25rem; }
        /* The active dot widens 7px -> 20px, so this one genuinely animates a
           LAYOUT property and is named rather than rewritten: a scaleX would
           keep it on the compositor but also stretch the 4px border-radius into
           an ellipse, so the pill would stop looking like a pill. Three dots on
           a 250ms transition is not a performance problem; a distorted radius
           is a visible one. */
        .ff-ba-dot { width: 7px; height: 7px; border-radius: 4px; background: rgba(var(--ff-fg), 0.18); transition: width 0.25s var(--ff-ease-out), background-color 0.25s var(--ff-ease-out); }
        .ff-ba-dot-on { width: 20px; background: #ea6b14; }
        .ff-ba-wrap { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; border: 1px solid rgba(var(--ff-fg), 0.08); cursor: grab; user-select: none; touch-action: none; box-shadow: 0 14px 44px rgba(0,0,0,0.4); background: var(--ff-surface-0e); }
        .ff-ba-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; -webkit-user-drag: none; }
        .ff-ba-label { position: absolute; top: 1rem; left: 50%; transform: translateX(-50%); font-family: 'Bebas Neue', sans-serif; font-size: 0.85rem; letter-spacing: 0.08em; color: var(--ff-text); background: rgba(var(--ff-bg-rgb), 0.7); backdrop-filter: blur(4px); border: 1px solid rgba(var(--ff-fg), 0.12); padding: 0.3rem 0.85rem; border-radius: 999px; pointer-events: none; white-space: nowrap; }
        .ff-ba-badge { position: absolute; top: 1rem; font-family: 'Bebas Neue', sans-serif; font-size: 0.95rem; letter-spacing: 0.1em; color: var(--ff-text); background: rgba(var(--ff-bg-rgb), 0.7); backdrop-filter: blur(4px); border: 1px solid rgba(var(--ff-fg), 0.12); padding: 0.3rem 0.85rem; border-radius: 999px; pointer-events: none; transition: opacity 0.2s; }
        .ff-ba-badge-before { left: 1rem; }
        .ff-ba-badge-after { right: 1rem; color: #ea6b14; border-color: rgba(234,107,20,0.4); }
        .ff-ba-vhint { position: absolute; right: 0.85rem; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
        .ff-ba-vbtn { width: 30px; height: 30px; border-radius: 50%; background: rgba(var(--ff-bg-rgb), 0.7); backdrop-filter: blur(4px); border: 1px solid rgba(var(--ff-fg), 0.14); color: var(--ff-text); display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.75; transition: opacity 0.2s, background 0.2s; }
        .ff-ba-vbtn:hover { opacity: 1; background: rgba(234,107,20,0.25); border-color: rgba(234,107,20,0.5); }
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
          button and not three, and why the brand is now the tiled ground
          behind the section rather than a mark competing with the headline
          for the top of the column. The whole entrance is CSS, not framer-motion, so the text
          paints on the HTML/CSS pass instead of waiting for the JS bundle. */}
      {/* Navy in dark mode, off-white in light mode (2026-08-24 — owner
          direction: light mode should read off-white almost everywhere, navy
          reserved for text/icons/borders/accents, not full-bleed section
          backgrounds — see the .ff-on-dark rewrite in main.tsx). .ff-hero's
          own background is var(--ff-c60), which already resolves per-theme
          with no change needed here.
          FOLLOW-UP RESOLVED (2026-08-24): the bottom radial-gradient — on
          .ff-hero itself, not ::before, which is actually the diagonal
          weave texture below — is now theme-scoped instead of one literal
          rgba(9,13,22,0.92). Dark mode's rule is byte-identical to before;
          light mode gets a much subtler ink-tinted equivalent. See the two
          data-theme rules just above .ff-hero-glow. */}
      <div className="ff-hero ff-on-dark">
        <div className="ff-hero-glow" aria-hidden="true" />
        {/* Watermark texture — the mark itself, tiled, half-drop. This is the
            whole identity layer now: it replaced twelve hand-placed trade
            glyphs (wrench, pipe, hammer…) that used to scatter across this
            same masked field, AND the big .ff-herolock mark that sat at the
            top of the left column. One mark, stated once, as ground.

            ⚠ aria-hidden and NOTHING ELSE. The old lockup carried
            role="img" + aria-label="Freddy Fix It" because it was the only
            thing naming the company in this section — but TopNav renders
            "FREDDYFIXIT" as real text above it, so the name is still in the
            accessibility tree and a decorative tile must not repeat it.
            Labelling this would make a screen reader announce the brand twice,
            the second time for a texture.

            No viewBox, deliberately: with userSpaceOnUse the tile's 120 is
            120 real CSS pixels, so density is fixed and does not rescale with
            the viewport. A viewBox here would make the tile size a fraction of
            the hero and the pattern would visibly stretch on every resize.

            Strokes carry CLASSES, not stroke attributes — see .ff-ptn-a /
            .ff-ptn-b in the style block, which is where the theme tokens and
            the opacity budget live. The two marks in the tile are identical;
            the second is the half-drop offset that kills the vertical
            channels a square grid would leave. */}
        <svg className="ff-hero-ptn" aria-hidden="true" focusable="false">
          <defs>
            <pattern id="ff-mark-tile" width="120" height="120" patternUnits="userSpaceOnUse">
              <g fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <g transform="translate(2,2) scale(0.7)">
                  <polygon className="ff-ptn-a" points="65.9,50.7 50.7,65.9 29.3,65.9 14.1,50.7 14.1,29.3 29.3,14.1 50.7,14.1 65.9,29.3"/>
                  <path className="ff-ptn-b" d="M28 54 L28 38 L40 28 L52 38 L52 54 Z"/>
                  <path className="ff-ptn-a" d="M36 54 L36 43 L44 43 L44 54"/>
                </g>
                <g transform="translate(62,62) scale(0.7)">
                  <polygon className="ff-ptn-a" points="65.9,50.7 50.7,65.9 29.3,65.9 14.1,50.7 14.1,29.3 29.3,14.1 50.7,14.1 65.9,29.3"/>
                  <path className="ff-ptn-b" d="M28 54 L28 38 L40 28 L52 38 L52 54 Z"/>
                  <path className="ff-ptn-a" d="M36 54 L36 43 L44 43 L44 54"/>
                </g>
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ff-mark-tile)"/>
        </svg>

        <div className="ff-hero-body" ref={heroRef}>
          <div className="ff-hero-left">
            {/* ⚠ THE LOCKUP IS GONE FROM HERE ON PURPOSE. A 70px mark used to
                open this column, and the brand is now the tiled ground behind
                the whole section (see .ff-hero-ptn above) — so repeating it at
                the top of the left column would state the same thing twice,
                once loudly. The headline's group break went with it: there is
                nothing left above the tagline for a break to separate it from.
                Don't put a mark back in this column without taking the tile
                out, or the hero carries two copies of its own identity. */}
            {/* Tagline opens the column now, above the headline — a
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
            <div className="ff-hero-alt ff-anim ff-d4 ff-alt-wide">{joinLine}</div>
          </div>

          {/* The right column shows rather than tells AND takes the answer:
              the examples type themselves into the placeholder, so a visitor
              learns what to write by watching somebody write it, and can then
              write it here rather than being sent somewhere else to start
              over. The label is the field's own <label>, so the examples
              cycling in the placeholder are never announced as the field's
              name — a name that changes every 38ms is a stream of fragments
              to a screen reader. */}
          <div className="ff-hero-panel ff-anim ff-d3">
            <label className="ff-panel-label" htmlFor="ff-hero-desc">Describe your problem</label>
            <textarea
              id="ff-hero-desc"
              className="ff-panel-box"
              value={heroDesc}
              onChange={(e) => setHeroDesc(e.target.value)}
              onFocus={() => setHeroBoxFocused(true)}
              onBlur={() => setHeroBoxFocused(false)}
              placeholder={typed}
              rows={3}
              maxLength={HERO_DESC_MAX}
            />
            {/* Carries what they wrote through to the request form, so the
                first thing we do with somebody's words is not ask for them
                again. An empty box is not an error — it goes to the same
                screen the orange button goes to, and they type it there. */}
            <button
              type="button"
              className="ff-panel-next"
              onClick={() => {
                const d = heroDesc.trim().slice(0, HERO_DESC_MAX);
                setLocation(d
                  ? "/client-onboarding?desc=" + encodeURIComponent(d)
                  : "/client-onboarding");
              }}
            >
              Next
            </button>
          </div>

          {/* Phone only — a third grid child sitting under the describe panel.
              On desktop it is display:none, so it generates no box and never
              becomes a grid item; that is what keeps the two-column "raise"
              block (grid-auto-rows: minmax(min-content,1fr)) untouched. */}
          <div className="ff-hero-alt ff-anim ff-d4 ff-alt-narrow">{joinLine}</div>
        </div>

        <div className="ff-scroll-hint" aria-hidden="true">
          <span>Scroll</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* ── ff-mobile-reorder: on mobile only, the trust strip moves to sit
           between About ("Why Freddy Fix It") and Freddy Verified. Desktop
           order is unaffected — no rule sets `order` outside the max-width:900px
           block, so these four siblings keep their default order:0 and fall
           back to source order, which is unchanged. ── */}
      <div className="ff-mobile-reorder">

      {/* ── Trust proof bar ── */}
      <div className="ff-trust-strip" style={{ background:"rgba(var(--ff-fg), .03)", borderTop:"1px solid rgba(var(--ff-fg), .07)", borderBottom:"1px solid rgba(var(--ff-fg), .07)", padding:"1.4rem 1rem" }}>
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

      {/* ── Freddy Verified ──
           2026-08-24: the owner reviewed again and asked for off-white
           consistently everywhere, this band included — the earlier
           .ff-anchor exception (forcing navy here even in light mode) is
           removed, so it now falls through to the same light-mode-off-white
           behavior as TopNav/hero/Footer via the scoping mechanism in
           main.tsx. Navy in dark mode, off-white ground in light mode.
           Everything inside is already token-driven, so ff-on-dark flips the
           whole section — its cards, hairlines and muted text — with no
           per-element change.
           --ff-bg, NOT --ff-surface: under the scope --ff-surface is #151d2e,
           which is exactly what a normal surface band already renders as in
           dark mode, so this band would have vanished into the About band
           above it. --ff-bg gives hero navy in both themes and keeps the seam.
           Placed right after Before & After on purpose — the trust claim and
           the "why us" story lead the page, ahead of the process/FAQ/services
           detail bands. */}
      <div className="ff-on-dark" style={{ background:"var(--ff-bg)", padding:"6rem 2rem", position:"relative" as const, overflow:"hidden" as const }}>
        <div style={{ maxWidth:"960px", margin:"0 auto", position:"relative" as const, zIndex:1 }}>
          <p style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".2em", color:"#ea6b14", marginBottom:"1.5rem", textAlign:"center" as const }}>Our Vetting Standard</p>
          <h2 style={{ fontFamily:"var(--ff-font-display)", fontWeight:"var(--ff-display-wght)" as any, fontSize:"clamp(2.5rem, 6vw, 4rem)", letterSpacing:"-0.028em", color:"var(--ff-text)", textAlign:"center" as const, marginBottom:"1rem" }}>The Freddy <span style={{ color:"#ea6b14" }}>Verified</span> Promise.</h2>
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

      </div>
      {/* ── /ff-mobile-reorder ── */}

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
          <h2 style={{ fontFamily:"var(--ff-font-display)", fontWeight:"var(--ff-display-wght)" as any, fontSize:"clamp(2.5rem, 6vw, 4rem)", letterSpacing:"-0.028em", color:"var(--ff-text)", textAlign:"center", marginBottom:"3rem" }}>Frequently Asked <span style={{ color:"#ea6b14" }}>Questions.</span></h2>
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

      {/* ── Footer ── */}

      {/* ── Video showcase ──
           Ground, so the last band before the navy footer is not the same tone
           as About directly above it. Replaces the old "Built On Trust" reviews
           block — same slot in the band-rhythm stack, same background token. */}
      <div style={{ background:"var(--ff-bg)", padding:"6rem 2rem" }}>
        <div style={{ maxWidth:"900px", margin:"0 auto" }}>
          <p style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".2em", color:"#ea6b14", marginBottom:"1.5rem", textAlign:"center" }}>See It In Action</p>
          <h2 style={{ fontFamily:"var(--ff-font-display)", fontWeight:"var(--ff-display-wght)" as any, fontSize:"clamp(2.5rem, 6vw, 4rem)", letterSpacing:"-0.028em", color:"var(--ff-text)", textAlign:"center", marginBottom:".9rem" }}>How Freddy <span style={{ color:"#ea6b14" }}>Works.</span></h2>
          <p style={{ textAlign:"center", color:"rgba(var(--ff-muted), .6)", fontSize:".95rem", marginBottom:"3rem", maxWidth:"560px", marginLeft:"auto", marginRight:"auto" }}>Two short walkthroughs — one for homeowners booking a job, one for pros signing up to take them.</p>

          <div className="ff-video-grid">
            <div style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(234,107,20,.2)", borderRadius:"14px", padding:"1.75rem" }}>
              <div style={{ marginBottom:"1rem" }}><Ic name="user-check" size={26} color="#ea6b14" /></div>
              <div style={{ fontSize:"1.05rem", fontWeight:600, color:"var(--ff-text)", marginBottom:".6rem" }}>For Homeowners</div>
              <p style={{ fontSize:".9rem", color:"rgba(var(--ff-muted), .75)", fontWeight:300, lineHeight:1.7, marginBottom:"1.25rem" }}>Post a job, compare estimates, and pay securely — see the whole flow in under 30 seconds.</p>
              <OnboardingVideo
                src="/onboarding-videos/freddy-client-onboarding.mp4"
                title="Booking a job on Freddy"
                seconds={25}
              />
            </div>
            <div style={{ background:"rgba(var(--ff-fg), .04)", border:"1px solid rgba(var(--ff-fg), .08)", borderRadius:"14px", padding:"1.75rem" }}>
              <div style={{ marginBottom:"1rem" }}><Ic name="hammer" size={26} color="#ea6b14" /></div>
              <div style={{ fontSize:"1.05rem", fontWeight:600, color:"var(--ff-text)", marginBottom:".6rem" }}>For Contractors</div>
              <p style={{ fontSize:".9rem", color:"rgba(var(--ff-muted), .75)", fontWeight:300, lineHeight:1.7, marginBottom:"1.25rem" }}>Sign up, get vetted, and start bidding on local jobs — here's what to expect.</p>
              <OnboardingVideo
                src="/onboarding-videos/freddy-contractor-onboarding.mp4"
                title="Joining Freddy as a pro"
                seconds={31}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
