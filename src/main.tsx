import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initAnalytics } from "./lib/analytics";
import { initPrefs } from "./lib/theme";

// Global CSS: theme variables (dark default), light overrides, text-size scaling, reset.
// Dark values are EXACTLY the original hard-coded colors, so dark mode is unchanged.
const style = document.createElement("style");
style.textContent = `
  :root {
    --ff-font-scale: 1.1;
    --ff-fg: 255,255,255;        /* foreground "ink" used in rgba overlays/text */
    --ff-muted: 190,205,235;     /* muted secondary text */
    --ff-text: #f0f4ff;          /* solid primary text */
    --ff-bg: #1a2236;            /* app background */
    --ff-bg-rgb: 26,34,54;
    --ff-surface: #151d2e;       /* section / card */
    --ff-surface-141: #141d2e;
    --ff-surface-2: #111827;     /* footer / deep */
    --ff-surface-0e: #0e1422;
    --ff-surface-1f: #1f2937;
    --ff-success: #86efac;
    --ff-warn: #fbbf24;
    --ff-danger: #f87171;
    --ff-info: #93c5fd;

    /* ── 60 / 30 / 10 ──────────────────────────────────────────────
       The palette is unchanged; what's new is the RATIO discipline and
       the names to enforce it with. The failure mode this fixes is not
       the colours themselves, it's that orange was doing everything —
       headings, dividers, icons, links, stat numbers, background
       glows — so nothing read as important because everything did.

       60%  --ff-c60  page and section ground. Navy, near-monochrome.
       30%  --ff-c30  raised surfaces, cards, hairlines, secondary text.
       10%  --ff-c10  accent. Reserved for ONE action per view plus the
                      few marks that certify trust. If you are reaching
                      for orange a third time in a section, the answer
                      is --ff-c30.

       Use the ramp rather than a raw hex: 600 is the pressed state, 500
       the brand orange, 400 the hover, and -soft/-line are the tinted
       fill and border that used to be written out as rgba literals in
       twenty places. */
    --ff-c60: var(--ff-bg);
    --ff-c30: var(--ff-surface);
    --ff-c10: #ea6b14;
    --ff-accent-600: #c9560c;
    --ff-accent-500: #ea6b14;
    --ff-accent-400: #f78b3d;
    --ff-accent-soft: rgba(234,107,20,0.12);
    --ff-accent-line: rgba(234,107,20,0.32);
    /* Ink ramp — four steps instead of ad-hoc rgba(var(--ff-muted), .N).
       Hierarchy is the point: a page should use at most three of these. */
    --ff-ink-1: var(--ff-text);
    --ff-ink-2: rgba(var(--ff-fg), 0.82);
    --ff-ink-3: rgba(var(--ff-muted), 0.68);
    --ff-ink-4: rgba(var(--ff-muted), 0.45);
    --ff-hair: rgba(var(--ff-fg), 0.09);
    /* Card/panel surface — a dedicated pair so dashboard "cards" can be
       given a real, distinct backdrop in light mode without touching the
       ink-opacity overlays text and hairlines rely on. Dark keeps the
       original rgba(var(--ff-fg)) expression byte-for-byte, so dark mode
       is pixel-identical. */
    --ff-card-bg: rgba(var(--ff-fg), .055);
    --ff-card-border: rgba(var(--ff-fg), .05);
    /* One shadow scale, so "raised" means the same thing everywhere. */
    --ff-lift-1: 0 1px 2px rgba(0,0,0,0.18);
    --ff-lift-2: 0 8px 28px rgba(0,0,0,0.28);
    --ff-lift-3: 0 22px 60px rgba(0,0,0,0.42);
  }
  :root[data-theme="light"] {
    --ff-fg: 55,96,153;           /* slate ink replaces white */
    --ff-muted: 71,85,105;
    --ff-text: #284e88;
    --ff-bg: #e9eef8;
    --ff-bg-rgb: 233,238,248;
    --ff-surface: #dbe2f2;
    --ff-surface-141: #dbe2f2;
    --ff-surface-2: #dbe2f2;
    --ff-surface-0e: #e1e7f4;
    --ff-surface-1f: #dbe2f2;
    --ff-success: #15803d;
    --ff-warn: #b45309;
    --ff-danger: #dc2626;
    --ff-info: #2563eb;
    --ff-accent-600: #b8500b;
    --ff-accent-500: #d65f10;
    --ff-accent-400: #ea6b14;
    --ff-accent-soft: rgba(214,95,16,0.10);
    --ff-accent-line: rgba(214,95,16,0.28);
    --ff-c10: #d65f10;
    --ff-ink-2: rgba(var(--ff-fg), 0.86);
    --ff-ink-3: rgba(var(--ff-muted), 0.78);
    --ff-ink-4: rgba(var(--ff-muted), 0.58);
    --ff-hair: rgba(var(--ff-fg), 0.12);
    --ff-card-bg: #dfe6f3;
    --ff-card-border: rgba(40,78,136,.16);
    --ff-lift-1: 0 1px 2px rgba(15,23,42,0.06);
    --ff-lift-2: 0 8px 28px rgba(15,23,42,0.10);
    --ff-lift-3: 0 22px 60px rgba(15,23,42,0.16);
  }

  /* ── Navy in dark mode; off-white in light mode ─────────────────────
     Light mode used to have almost no brand colour in it, because --ff-bg
     and --ff-surface both read as near-white. The first fix (2026-08-19)
     was to force navy chrome (nav, hero, footer, the Freddy Verified band)
     in BOTH themes via this .ff-on-dark class, unconditionally.

     2026-08-24: the owner reviewed the live site and asked for the opposite
     in light mode — off-white basically everywhere, navy reserved for text,
     icons, borders and small accents, not full-bleed section backgrounds.
     So .ff-on-dark's forced-navy values are now scoped to dark mode by
     default (see the selector below); nav, hero, footer AND the Freddy
     Verified band all fall through to the ordinary light-mode tokens
     (off-white ground) when data-theme="light".

     The .ff-anchor modifier below (opt back into forced navy under light
     mode) briefly existed as a one-off exception for the Freddy Verified
     band specifically, then was removed the same day once the owner
     confirmed the preference is truly "everywhere" and not "everywhere
     except this one band" — see Home.tsx. Nothing currently applies
     .ff-anchor, so that half of the selector is dormant. It's left in
     place rather than deleted in case a future band genuinely needs a
     forced-navy exception; deleting it costs nothing today but re-adding
     it correctly (typo-free selector, byte-identical dark values) later
     is easy to get subtly wrong under time pressure.

     This is still a scope class rather than a rewrite because every
     component already reads its colour from these variables: custom
     properties resolve at the point of USE, so re-declaring the dark
     values on a wrapper makes that entire subtree — its cards, its
     hairlines, its rgba(var(--ff-fg)) overlays, everything — render
     exactly as it does in dark mode, with no per-component changes.

     In dark mode every value below is already the value in effect, so
     the class is a no-op there and dark mode cannot regress. */
  /* :root:not([data-theme="light"]) matches exactly what plain :root used
     to match, since dark is the default (no data-theme attribute at all —
     see src/lib/theme.ts), and the property list below is byte-identical
     to before, so dark mode cannot regress. */
  :root:not([data-theme="light"]) .ff-on-dark,
  :root[data-theme="light"] .ff-on-dark.ff-anchor {
    --ff-fg: 255,255,255;
    --ff-muted: 190,205,235;
    --ff-text: #f0f4ff;
    --ff-bg: #1a2236;
    --ff-bg-rgb: 26,34,54;
    --ff-surface: #151d2e;
    --ff-surface-141: #141d2e;
    --ff-surface-2: #111827;
    --ff-surface-0e: #0e1422;
    --ff-surface-1f: #1f2937;
    --ff-success: #86efac;
    --ff-warn: #fbbf24;
    --ff-danger: #f87171;
    --ff-info: #93c5fd;
    /* These five are spelled out as literals rather than left to alias
       --ff-bg / --ff-surface / --ff-text. A var() inside a custom-property
       DECLARATION is substituted where it is declared, not where it is used,
       so --ff-c60: var(--ff-bg) froze to the light value at :root and would
       have inherited into here still white. */
    --ff-c60: #1a2236;
    --ff-c30: #151d2e;
    --ff-c10: #ea6b14;
    --ff-ink-1: #f0f4ff;
    --ff-accent-600: #c9560c;
    --ff-accent-500: #ea6b14;
    --ff-accent-400: #f78b3d;
    --ff-accent-soft: rgba(234,107,20,0.12);
    --ff-accent-line: rgba(234,107,20,0.32);
    --ff-ink-2: rgba(255,255,255,0.82);
    --ff-ink-3: rgba(190,205,235,0.68);
    --ff-ink-4: rgba(190,205,235,0.45);
    --ff-hair: rgba(255,255,255,0.09);
    --ff-card-bg: rgba(255,255,255,.055);
    --ff-card-border: rgba(255,255,255,.05);
    --ff-lift-1: 0 1px 2px rgba(0,0,0,0.18);
    --ff-lift-2: 0 8px 28px rgba(0,0,0,0.28);
    --ff-lift-3: 0 22px 60px rgba(0,0,0,0.42);
    color: var(--ff-text);
  }
  /* The fixed nav paints its own ground with var(--ff-bg) directly (not
     through .ff-on-dark any more — 2026-08-24) so it's navy in dark mode and
     off-white in light mode, matching the rest of the page. Either way body
     text can never scroll illegibly under it. It starts transparent over the
     hero (Home adds the :not() rule) and fades in on scroll, which is what
     stops it cutting a hard seam across the hero's radial glow. */
  .ff-nav-wrap {
    background-color: var(--ff-bg);
    border-bottom: 1px solid transparent;
    transition: background-color .25s ease, border-color .25s ease, box-shadow .25s ease, transform .25s ease;
  }
  .ff-nav-wrap.ff-nav-lifted {
    border-bottom-color: var(--ff-hair);
    box-shadow: 0 8px 24px rgba(9,13,22,0.28);
  }
  /* Dashboards only (TopNav gates this via onSidebarDash) — slides the bar
     out of view on scroll-down, back in on scroll-up. The 3.75rem spacer
     the dashboards render stays in place so content never reflows/jumps;
     only the bar itself moves. */
  .ff-nav-wrap.ff-nav-hidden {
    transform: translateY(-100%);
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: calc(100% * var(--ff-font-scale, 1)); }
  html, body { margin: 0; padding: 0; background: var(--ff-bg); }
  /* Responsive safety net. Inline styles beat this stylesheet, so a fixed inline
     width still applies — these only bite when the container is genuinely
     narrower than the element, i.e. the phone case. svg is left out on purpose —
     Ic renders sized icons that must not shrink in flex rows. */
  img, video, canvas { max-width: 100%; }
  input, select, textarea { max-width: 100%; }

  /* Horizontal scroll, killed at the root.
     This is overflow-x: CLIP, not hidden, and the difference is the whole
     reason it is safe to put here. 'hidden' makes the element a scroll
     container, which silently kills every position:sticky inside it — the
     dashboard sidebar depends on sticky, so 'hidden' here would break it.
     'clip' does not create a scroll container: sticky keeps working and the
     overflow simply cannot be scrolled to. Applied to both html and body
     because a stray wide child can escape either one. */
  html, body { overflow-x: clip; max-width: 100%; }
  /* The other half of the problem is content that cannot wrap: a pasted URL,
     a long email address, a job code. break-word only breaks when a word
     genuinely cannot fit, so ordinary prose is untouched. */
  body { overflow-wrap: break-word; }
  /* Tables and preformatted text are the two elements that will happily push
     a page wider than the phone rather than wrap. */
  table, pre { max-width: 100%; }
  pre { overflow-x: auto; }

  /* Thumb targets. Apple and Google both land on ~44px as the smallest
     control a thumb hits reliably; a lot of our chips and icon buttons sit
     nearer 30. Scoped to coarse pointers so a mouse-driven desktop layout
     is untouched, and it's min-height only — forcing min-width too would
     blow tight button rows off the side of the screen, which is the exact
     bug the block above exists to prevent. */
  @media (pointer: coarse) {
    button, [role="button"], a.ff-tap, label.ff-tap, select { min-height: 44px; }
    /* Opt-out for anything genuinely inline, e.g. a link styled as a word
       inside a sentence that must not become a 44px-tall gap. */
    button.ff-tap-auto, [role="button"].ff-tap-auto { min-height: 0; }
  }

  /* ── Hand-drawn icons ──────────────────────────────────────────────
     Every icon on the site is drawn with a slightly unsteady line, as if
     someone sketched it rather than exported it. It is done with one SVG
     displacement filter rather than by redrawing sixty glyphs, which means
     it is a handful of lines to tune and a single line to remove.

     The selector is the whole trick: EVERY icon we own is a 24x24 stroke
     drawing — the Ic set, the hero backdrop, the stray inline SVGs in
     onboarding and the nav — so one attribute selector reaches all of them
     at once with no edits to sixty call sites. Just as importantly, it
     reaches nothing it shouldn't: the Freddy logo mark is 80x80 and the
     Google sign-in "G" is 18x18, so both stay perfectly crisp. A brand mark
     that wobbles looks like a rendering bug, and a wobbly Google logo is a
     trademark problem.

     Three seeds exist so icons sitting next to each other don't share the
     same wobble — identical noise across a row is the tell that reads as
     "filter" rather than "hand". The large variant is for the oversized
     hero backdrop icons, where a wobble tuned for 16px would vanish.

     color-interpolation-filters="sRGB" is NOT optional. The default is
     linearRGB, which silently shifts every icon's colour — orange icons
     come out washed out and the 60/30/10 accent stops matching the buttons
     beside it. It is set on all four filters.

     Displacement is in CSS pixels, so a small icon wobbles more relative to
     its size than a large one. That is deliberate and it is how a real pen
     behaves: the hand shakes by about the same physical amount whether the
     drawing is big or small. Keep scale under ~1.5 for the UI filters — the
     stroke on a 16px icon is only about 1.2px, and a displacement larger
     than the stroke stops looking drawn and starts looking broken. */
  svg[viewBox="0 0 24 24"] { filter: url(#ff-sketch-a); }
  svg[viewBox="0 0 24 24"]:nth-of-type(2n) { filter: url(#ff-sketch-b); }
  svg[viewBox="0 0 24 24"]:nth-of-type(3n) { filter: url(#ff-sketch-c); }
  /* Softens the few square joins left in the set, so nothing reads as
     machined next to a shaky line. */
  svg[viewBox="0 0 24 24"] * { stroke-linecap: round; stroke-linejoin: round; }

  /* -- Skeleton loaders & entrance motion --------------------------------
     One shimmer, one entrance, one image fade, shared by every surface that
     loads. They live here rather than in a component because the dashboards,
     the panels and the lazy-route fallback all need them and a second copy is
     how upsertMeta ended up pasted into six files and then drifted.

     Everything below is deliberately token-driven: .ff-sk paints with
     rgba(var(--ff-fg), ...), so it is a pale grey on the light ground and a
     pale white-on-navy in dark mode with no per-theme rule, and it inherits
     .ff-on-dark correctly wherever a skeleton sits inside a navy scope.

     The reduced-motion block at the bottom of this sheet already flattens
     every animation here to 0.001ms, so a skeleton degrades to a plain static
     block and an entrance degrades to an instant appearance. Nothing below
     needs its own prefers-reduced-motion rule. */

  @keyframes ff-shimmer {
    from { background-position: -340px 0; }
    to   { background-position: calc(340px + 100%) 0; }
  }
  .ff-sk {
    background-color: rgba(var(--ff-fg), 0.08);
    background-image: linear-gradient(90deg,
      rgba(var(--ff-fg), 0) 0,
      rgba(var(--ff-fg), 0.10) 50%,
      rgba(var(--ff-fg), 0) 100%);
    background-size: 340px 100%;
    background-repeat: no-repeat;
    animation: ff-shimmer 1.45s linear infinite;
    border-radius: 6px;
    /* A skeleton is scenery, never content. Screen readers and text selection
       both skip it, so a shell does not read out as a wall of blank rows. */
    user-select: none;
  }
  .ff-sk-circle { border-radius: 50%; }

  /* The entrance. 220ms and 10px, applied once when a subtree mounts.
     'both' matters: without it the element is briefly painted at its natural
     opacity before the animation's first frame lands, which reads as a flash. */
  @keyframes ff-enter {
    from { opacity: 0; transform: translate3d(0, 10px, 0); }
    to   { opacity: 1; transform: none; }
  }
  .ff-enter { animation: ff-enter 0.22s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
  /* Fade with no movement, for anything already in its final position -- a
     skeleton handing over to real content in the same box, where 10px of
     travel would look like the layout moving rather than settling. */
  /* ff-enter-b is a byte-identical twin of ff-enter, and it exists so a tab
     switch can REPLAY the animation without remounting anything. Swapping
     between two classes that name the SAME keyframes changes nothing as far as
     the engine is concerned, so the animation just keeps running; swapping the
     animation-name is what restarts it. The alternative -- keying the content
     div on the active tab -- would unmount the whole subtree on every click,
     which re-fires mount effects and would pop the dismissed profile modal
     back up. Cheaper to duplicate five lines of CSS. */
  @keyframes ff-enter-b {
    from { opacity: 0; transform: translate3d(0, 10px, 0); }
    to   { opacity: 1; transform: none; }
  }
  .ff-enter-b { animation: ff-enter-b 0.22s cubic-bezier(0.22, 0.61, 0.36, 1) both; }

  @keyframes ff-fade { from { opacity: 0; } to { opacity: 1; } }
  .ff-fade { animation: ff-fade 0.22s ease both; }

  /* Images. The pattern is opacity 0 until data-ff-in is set, and the three
     ways that attribute gets set (ref callback for an already-complete image,
     onLoad, onError) are all in FadeImg -- see src/components/FadeImg.tsx.
     An image that somehow reaches none of them would be invisible, so the
     safety animation forces it visible after 4s no matter what. A slightly
     late image is a cosmetic miss; an image that never appears is a bug. */
  @keyframes ff-img-safety { from { opacity: 0; } to { opacity: 1; } }
  img[data-ff-fade] {
    opacity: 0;
    transition: opacity 0.22s ease;
    animation: ff-img-safety 0.01s linear 4s both;
  }
  img[data-ff-fade][data-ff-in="1"] {
    opacity: 1;
    animation: none;
  }

  /* Toast. The inline style on the toast carries translateX(-50%) for
     centring; an animation overrides inline styles while it runs and 'both'
     holds the final frame, so translate(-50%, 0) is where it comes to rest --
     identical to what the inline rule asked for. */
  @keyframes ff-toast-in {
    from { opacity: 0; transform: translate(-50%, 14px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }
  .ff-toast-in { animation: ff-toast-in 0.22s cubic-bezier(0.22, 0.61, 0.36, 1) both; }

  /* Inline button spinner, sized in em so it tracks the button's own font
     size and needs no per-button tuning. */
  @keyframes ff-btn-spin { to { transform: rotate(360deg); } }
  .ff-btn-spin {
    display: inline-block;
    width: 0.85em; height: 0.85em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    opacity: 0.85;
    animation: ff-btn-spin 0.7s linear infinite;
    vertical-align: -0.1em;
    margin-right: 0.45em;
  }

  /* Card lift. Hover only, and gated to fine pointers -- on a touch screen
     :hover sticks after a tap, so a phone would leave whichever card was last
     touched permanently raised. */
  @media (hover: hover) and (pointer: fine) {
    .ff-lift { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
    .ff-lift:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(9, 13, 22, 0.18); }
  }

  /* Screen-reader-only. A skeleton is aria-hidden, so without this a person on
     a screen reader gets total silence while the page loads. Not display:none --
     that would hide it from assistive tech too, which is the whole point. */
  .ff-sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* One honest global respect for reduced motion. Individual components still
     opt out where they need to; this catches everything that forgot. */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
`;
document.head.appendChild(style);

// The four filters the rules above point at. They live in one hidden SVG
// appended to <body> once, because a CSS `filter: url(#id)` resolves against
// the document, so a single definition serves every icon on every page.
//
// Each filter is the same two-primitive pipeline: feTurbulence generates a
// smooth noise field, and feDisplacementMap pushes each pixel of the icon
// sideways by the amount of noise underneath it. Low baseFrequency = long,
// lazy waves (a relaxed hand); higher = tighter jitter. R and G are used as
// the x and y channels so the horizontal and vertical wobble are independent
// — using the same channel for both would slide the whole glyph diagonally
// instead of bending it.
//
// x/y/width/height are widened to -15%/130% because displacement moves ink
// OUTSIDE the element's natural box, and the default filter region would
// slice the overhang off, leaving flat-shaved edges on round icons.
//
// color-interpolation-filters="sRGB" is deliberate and load-bearing: the SVG
// default is linearRGB, which would silently lighten every icon and stop the
// orange matching the buttons next to it.
//
// The container is width/height 0 and aria-hidden so it can never affect
// layout, be read aloud, or interact with the overflow-x:clip rules above.
const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
defs.setAttribute("aria-hidden", "true");
defs.setAttribute("focusable", "false");
defs.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none");
defs.innerHTML = [
  // Three near-identical UI filters. They differ only in seed and amount so
  // that icons sitting side by side don't share one wobble — identical noise
  // across a row is the tell that reads as "filter" rather than "hand".
  ['ff-sketch-a', '0.07', '2', '3', '1.2'],
  ['ff-sketch-b', '0.085', '2', '17', '1.05'],
  ['ff-sketch-c', '0.062', '2', '41', '1.35'],
  // Oversized variant for the hero backdrop icons (36-70px). A 1.2px shake
  // is invisible at that size, and those icons are decorative and low-opacity
  // so a heavier hand costs nothing in legibility.
  ['ff-sketch-lg', '0.035', '3', '7', '2.6'],
].map(([id, freq, oct, seed, scale]) =>
  '<filter id="' + id + '" x="-15%" y="-15%" width="130%" height="130%" ' +
  'filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">' +
  '<feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="' + oct +
  '" seed="' + seed + '" result="ff-noise" />' +
  '<feDisplacementMap in="SourceGraphic" in2="ff-noise" scale="' + scale +
  '" xChannelSelector="R" yChannelSelector="G" />' +
  '</filter>'
).join("");
document.body.appendChild(defs);

// Apply saved theme + text size before first paint to avoid a flash.
initPrefs();

// Initialize analytics (no-op until a real GA4 ID is set in src/lib/analytics.ts).
initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
