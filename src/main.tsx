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

    /* ── The display face ──────────────────────────────────────────
       Every band headline on every page you *read* resolves through
       this ONE token. It exists because the face was previously
       hardcoded as the literal "'Fraunces', Georgia, serif" in 19
       places across 12 files, so changing it meant 19 edits and any
       one of them being missed rendered a page in two display faces
       with no error anywhere.

       It is Archivo, not Fraunces, and the reason is structural
       rather than aesthetic. Every band on Home states itself TWICE:
       the headline in the display face, and the card titles inside
       that same band in Bebas Neue. With Fraunces — a high-contrast
       serif — those two voices were unrelated, so each band read as
       a collision rather than a hierarchy, with DM Sans body making
       three faces per band. Archivo is Bebas's closest relative on
       Google Fonts: same grotesque skeleton, same tight apertures,
       so a headline and the card titles under it finally read as one
       family at two sizes.

       ⚠ Archivo at 500 is NOT Fraunces at 500. A grotesque needs more
       weight and much tighter tracking to carry display sizes, which
       is why the display sites pair this with --ff-display-wght (700)
       and letter-spacing near -0.028em. Swapping the face here without
       revisiting those two makes every headline look underset.

       Fraunces is no longer requested by index.html — nothing in src/
       references it. If it comes back, re-add it to that <link>. */
    --ff-font-display: 'Archivo', 'Helvetica Neue', Arial, sans-serif;
    --ff-display-wght: 700;

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
    /* The four status hues as TRIPLETS, for exactly the reason
       --ff-accent-rgb exists and documented at length down there: a tint or a
       border is an alpha over the hue, and the three dashboards carried 54 of
       them across 15 distinct alphas. Snapping those alphas to two named steps
       would have moved every one of them, so the alpha stays at the call site
       and only the colour is tokenised.

       MIGRATION TOKENS, not colours to reach for -- same status as
       --ff-accent-rgb. A new tint wants a plain var(--ff-success); reach for
       the triplet only when you genuinely need an alpha.

       ⚠️ Read the pairs as a SET, not four numbers: the light values are
       DARKER than the dark ones, because the dark theme needs a pale hue to
       carry on navy and the light theme needs a deep one to carry on off-white.
       That is why the literals these replaced were a live bug in both themes at
       once -- #22c55e is neither #86efac nor #15803d, so a hardcoded "success"
       green was the wrong green on navy AND the wrong green on off-white, and
       sat beside a var(--ff-success) spelling of the same meaning in the same
       file. 111 raw sites against 76 token uses when this landed. */
    --ff-success-rgb: 134,239,172;
    --ff-warn-rgb: 251,191,36;
    --ff-danger-rgb: 248,113,113;
    --ff-info-rgb: 147,197,253;

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
    /* The accent as an RGB TRIPLE, for the same reason --ff-bg-rgb exists
       (2026-11-08). -soft and -line cover the two tinted uses the ramp was
       designed around, but the tree had FOUR HUNDRED AND FIFTY-ONE
       rgba(234,107,20,A) literals at fifteen distinct alphas — glows, pulse
       keyframes, gradient stops, 2px selected borders, radial washes. Folding
       all of those onto two fixed alphas would have been a visual redesign
       dressed up as a token migration, and the alphas are load-bearing in
       places (the photo-pulse keyframe animates from .55 to 0).

       So: keep the alpha, tokenise the colour. rgba(var(--ff-accent-rgb), A)
       renders byte-identically in dark mode and picks up #d65f10's triple in
       light, which is the actual bug those 451 literals were — every one of
       them painted the DARK orange on the off-white ground.

       Reach for -soft / -line first; this is for the alpha the ramp has no
       name for. And note that a var() inside a custom-property DECLARATION is
       substituted where it is declared, so -soft and -line above stay spelled
       out — writing them as rgba(var(--ff-accent-rgb), …) would be the
       .ff-on-dark alias trap. tools/check_tokens.py enforces that. */
    --ff-accent-rgb: 234,107,20;
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
    /* One easing scale. Theme-independent, so deliberately NOT duplicated
       inside .ff-on-dark. See CLAUDE.md, Brand tokens. */
    --ff-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --ff-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
    --ff-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
    /* The fourth member, added 2026-11-08. It is NOT a fourth ease — it is
       the only way to get an OVERSHOOT in pure CSS, because its y control
       points exceed 1. The three above all land exactly on their target and
       stop, which is what makes a release read as mushy: the finger comes
       off, the element returns to 1.0 and nothing settles.

       Why it has to be CSS and not a spring: src/components/ui/ is forbidden
       Framer Motion (only Home / ClientSuccess / ContractorSuccess import it),
       and the press lives in that folder. A '{ type: "spring", duration,
       bounce }' here would mean either importing Framer into the primitives
       or re-implementing the press per page — which is the exact drift the
       folder exists to end.

       Use it ONLY on the way back UP from a press. On the way down an
       overshoot would push the element past the pressed size and read as a
       bounce under the thumb. The asymmetry is the whole feel. */
    --ff-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

    /* ── Apple material language ────────────────────────────────────────
       Added 2026-11-08 at the owner's request ("more appleish buttons/flow,
       better usability esp on mobile"). Three materials, three tokens, and
       the point of tokenising them is the same as every other scale here:
       a frosted nav and a frosted sheet must blur by the SAME amount or the
       two read as different materials, and "nav blur" written inline in two
       files is two numbers that will diverge.

       --ff-glass is theme-DEPENDENT and therefore carries a literal inside
       .ff-on-dark, like the seven colour aliases. It is deliberately not
       rgba(var(--ff-bg-rgb), …): a translucent ground that resolves through
       an alias would freeze to the light value where it is declared, which
       is the documented failure the literals exist to prevent.

       --ff-glass-blur is a filter value, not a colour, so it stays at :root
       and is NOT duplicated. 'saturate(180%)' before the blur is what makes
       this read as Apple's material rather than as a grey wash — a plain
       blur desaturates whatever is behind it, and the orange accent showing
       through a sheet is the thing you most want to survive.

       ⚠️ backdrop-filter MUST be paired with the -webkit- prefix: iOS Safari
       16 and earlier support only the prefixed form, and iOS is the platform
       this whole pass is for. A frosted surface that falls back to fully
       transparent is unreadable, so --ff-glass is an OPAQUE-ENOUGH colour on
       its own (0.72-0.78, not 0.2) and the blur is pure enhancement. That is
       the one rule here: the surface must be legible with the blur removed. */
    --ff-glass: rgba(26,34,54,0.72);
    --ff-glass-blur: saturate(180%) blur(20px);
    /* A true hairline. 1px on a 3× screen is three device pixels, which is
       why our borders look heavier than iOS's. 0.5px is honoured on retina
       and rounded up to 1px everywhere else, so it degrades to exactly what
       we have today. Geometry, not colour — :root only. */
    --ff-hair-w: 0.5px;
    /* Layered shadow. Apple stacks a tight contact shadow under a wide soft
       one; a single large blur reads as a glow rather than as height. This is
       a THIRD scale beside --ff-lift-* rather than a replacement, because the
       existing three are load-bearing in ~80 places and re-pointing them
       would change every card on the site in one unreviewable diff. Reach for
       these on things that FLOAT — sheets, popovers, the primary button. */
    --ff-mat-1: 0 1px 1px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.18);
    --ff-mat-2: 0 1px 2px rgba(0,0,0,0.20), 0 8px 24px rgba(0,0,0,0.26);
    --ff-mat-3: 0 1px 3px rgba(0,0,0,0.24), 0 12px 32px rgba(0,0,0,0.34), 0 32px 64px rgba(0,0,0,0.30);

    /* ── One spacing / radius / height scale ───────────────────────────
       Added 2026-10-30 alongside src/components/ui/. These are geometry,
       not colour: they are theme-independent, so like the easing and
       shadow scales above they live in plain :root and are deliberately
       NOT duplicated inside .ff-on-dark. Adding a colour alias at :root
       without a matching literal in that class renders the wrong theme
       silently (see the long note on the class below) — a px value
       cannot, because there is nothing theme-dependent to get wrong.

       The reason to have them at all: the dashboards were written with
       ad-hoc rem values, so "the gap between two rows" was a slightly
       different number in each of the three files and no two cards lined
       up. The ui/ primitives use ONLY these, which is what makes a
       Contractor/Admin port a reskin rather than a rewrite.

       --ff-gut is the single left inset that a row's icon column, its
       separator and its hanging text all share. A separator that starts
       at a different x than the text above it is the specific defect
       this token exists to make impossible. */
    --ff-s1: 4px;
    --ff-s2: 8px;
    --ff-s3: 12px;
    --ff-s4: 16px;
    --ff-s5: 20px;
    --ff-s6: 24px;
    --ff-s8: 32px;
    --ff-s10: 40px;
    --ff-r1: 10px;
    --ff-r2: 14px;
    --ff-r3: 18px;
    --ff-r4: 26px;
    /* 48px row / 44px control. 44 is the published MINIMUM thumb target and
       is what a control measures on a mouse-driven desktop; the (pointer:
       coarse) block further down raises the floor to 48 so that on a phone a
       control and a row are the same height. The two numbers disagreeing on
       desktop is deliberate — a 48px button under a mouse reads as oversized,
       and nothing on desktop is being hit with a thumb.

       ⚠️ Don't "fix" this by setting --ff-h-ctl to 48: that would grow every
       desktop control too, and the floor is a min-height, so anything already
       taller is untouched either way. */
    --ff-h-row: 48px;
    --ff-h-ctl: 44px;
    --ff-gut: 40px;
    /* ⚠️ A FALLBACK, NOT THE VALUE. TopNav measures its own rendered height
       with a ResizeObserver and overwrites this on :root in px — see the long
       note in TopNav.tsx. Anything that needs to sit directly under the fixed
       bar (PageTitle's compact header, today's only caller) reads this.

       It is declared here at all so that a first paint before the observer
       fires, or a document where TopNav is not mounted, gets a sane number
       instead of 0 and an overlap. 4.25rem is the desktop bar: 1rem padding
       top and bottom plus a ~2.2rem tallest child (the pill buttons). Under
       560px the real bar is nearer 3.2rem, which is why the measured value
       matters and this one is only a floor-of-last-resort — the compact header
       does not mount until the page has been scrolled, by which point the
       measurement is long since published.

       There WAS a --ff-h-nav: 42px here, declared 2026-10-30 and read by
       nothing in src/ — grep returned exactly one hit, its own declaration.
       It is deleted rather than left, because --ff-h-nav and --ff-topnav-h are
       one transposition apart and a dead token that close to a live one is the
       setup for silently reading the wrong number later. Its intent was
       probably "height of a sidebar nav item"; if that port needs a token it
       can have --ff-h-navitem, which cannot be confused with this.

       ⚠️ No backticks anywhere in this comment, and that is not a style
       preference — this whole stylesheet is a backtick template literal, so a
       backtick here CLOSES it. It did, for exactly one run: five TS1005s at
       this line and the two after it, from a comment. The repo rule is in
       CLAUDE.md under Authoring; this is the site that proves it still bites. */
    --ff-topnav-h: 4.25rem;
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
    --ff-success-rgb: 21,128,61;
    --ff-warn-rgb: 180,83,9;
    --ff-danger-rgb: 220,38,38;
    --ff-info-rgb: 37,99,235;
    --ff-accent-600: #b8500b;
    --ff-accent-500: #d65f10;
    --ff-accent-400: #ea6b14;
    --ff-accent-soft: rgba(214,95,16,0.10);
    --ff-accent-line: rgba(214,95,16,0.28);
    --ff-accent-rgb: 214,95,16;
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
    /* Material counterparts. --ff-glass-blur and --ff-hair-w are absent here
       on purpose: a filter value and a px width have nothing theme-dependent
       to get wrong, which is the same reason the easing and spacing scales
       aren't duplicated either. */
    --ff-glass: rgba(233,238,248,0.76);
    --ff-mat-1: 0 1px 1px rgba(15,23,42,0.04), 0 2px 8px rgba(15,23,42,0.05);
    --ff-mat-2: 0 1px 2px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.08);
    --ff-mat-3: 0 1px 3px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.11), 0 32px 64px rgba(15,23,42,0.09);
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

     The .ff-anchor modifier below opts a subtree back into forced navy
     under light mode. It briefly existed as a one-off exception for the
     Freddy Verified band specifically, then was removed the same day once
     the owner confirmed the preference is truly "everywhere" and not
     "everywhere except this one band" — see Home.tsx.

     ⚠️ This comment said "nothing currently applies .ff-anchor, so that
     half of the selector is dormant" until 2026-11-08, and by then it was
     FALSE in two places: ui/Pass.tsx applies it (via its forceNavy prop,
     default true) and components/FreddyRewind.tsx applies it. Both are the case
     the modifier was kept for and both are correct; the comment was just
     never revisited. Read it as live, and grep before claiming otherwise.

     What it is FOR, stated positively so the next use can be judged: a
     subtree whose contents are painted light-on-dark with literals rather
     than tokens. Those literals cannot follow the theme, so the ground
     must not either — one class instead of re-tinting a dozen values. It
     is NOT a way to get navy because navy looks nicer here; that decision
     was made site-wide in 2026-08-24 and went the other way.

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
    /* Restored here for the same reason the four solid hues above are: a
       subtree inside .ff-on-dark is painted on navy under BOTH themes, so a
       status tint in it must read the dark triplet even when the page around
       it is light. Literals, not var(--ff-success-rgb) -- that would be the
       alias trap, and check_tokens.py refuses it. */
    --ff-success-rgb: 134,239,172;
    --ff-warn-rgb: 251,191,36;
    --ff-danger-rgb: 248,113,113;
    --ff-info-rgb: 147,197,253;
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
    --ff-accent-rgb: 234,107,20;
    --ff-ink-2: rgba(255,255,255,0.82);
    --ff-ink-3: rgba(190,205,235,0.68);
    --ff-ink-4: rgba(190,205,235,0.45);
    --ff-hair: rgba(255,255,255,0.09);
    --ff-card-bg: rgba(255,255,255,.055);
    --ff-card-border: rgba(255,255,255,.05);
    --ff-lift-1: 0 1px 2px rgba(0,0,0,0.18);
    --ff-lift-2: 0 8px 28px rgba(0,0,0,0.28);
    --ff-lift-3: 0 22px 60px rgba(0,0,0,0.42);
    /* Material counterparts, byte-identical to the :root (dark) values above.
       --ff-glass is a translucent GROUND, so it is exactly the alias trap the
       note above describes: writing rgba(var(--ff-bg-rgb), 0.72) here would
       substitute --ff-bg-rgb where it is DECLARED, freezing a navy sheet to
       the light ground. Hence the literal. --ff-glass-blur and --ff-hair-w
       are absent because neither is theme-dependent. */
    --ff-glass: rgba(26,34,54,0.72);
    --ff-mat-1: 0 1px 1px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.18);
    --ff-mat-2: 0 1px 2px rgba(0,0,0,0.20), 0 8px 24px rgba(0,0,0,0.26);
    --ff-mat-3: 0 1px 3px rgba(0,0,0,0.24), 0 12px 32px rgba(0,0,0,0.34), 0 32px 64px rgba(0,0,0,0.30);
    color: var(--ff-text);
  }
  /* The fixed nav paints its own ground with var(--ff-bg) directly (not
     through .ff-on-dark any more — 2026-08-24) so it's navy in dark mode and
     off-white in light mode, matching the rest of the page. Either way body
     text can never scroll illegibly under it. It starts transparent over the
     hero (Home adds the :not() rule) and fades in on scroll, which is what
     stops it cutting a hard seam across the hero's radial glow. */
  /* --ff-hair-w, and this is the ONE "solid transparent" border on the site
     that moved off 1px (2026-11-08). migrate_hairlines.py refuses a
     transparent border on principle, because a transparent border is usually
     RESERVING layout for a border that appears in another state, and changing
     its width changes the layout of the state that has no visible border at
     all. Here the two states are the SAME declaration -- only border-COLOR is
     overridden below -- so the width moves for both arms together and nothing
     can shift. Worth the exception precisely because this is the heaviest line
     on the site: at 1px it was three device pixels on a 3x phone, drawn across
     the full width of every page. */
  .ff-nav-wrap {
    background-color: var(--ff-bg);
    border-bottom: var(--ff-hair-w) solid transparent;
    transition: background-color .25s var(--ff-ease-out), border-color .25s var(--ff-ease-out), box-shadow .25s var(--ff-ease-out), transform .25s var(--ff-ease-out);
  }
  .ff-nav-wrap.ff-nav-lifted {
    border-bottom-color: var(--ff-hair);
    box-shadow: 0 8px 24px rgba(9,13,22,0.28);
  }
  /* ⚠️ A STACK OF CHROME GETS ONE SEPARATOR, AT ITS BOTTOM EDGE (2026-11-08).
     PageTitle's compact bar is fixed at "top: var(--ff-topnav-h)", i.e. flush
     under this nav, and it is the same frosted material. With both showing,
     the page had TWO hairlines 44px apart plus the nav's drop shadow falling
     onto the bar directly beneath it -- the nav reading as if it floated above
     the title bar when the two are a single band of chrome. Apple's stacked
     bars separate the stack from the CONTENT, never the layers from each other.

     So when a title bar is stuck, the nav gives up its own bottom edge and its
     shadow, and the title bar's border-bottom becomes the single separator for
     the pair. The class comes from PageTitle (it owns the stuck state and is
     the only thing that knows); the rule lives here, beside the other two,
     because every decision about this nav's bottom border belongs in one
     place. Note it is scoped to ".ff-nav-lifted" -- unlifted, there is no
     border or shadow to suppress, and scoping it keeps the selector from
     claiming to do something it does not. */
  html.ff-ptitle-stuck .ff-nav-wrap.ff-nav-lifted {
    border-bottom-color: transparent;
    box-shadow: none;
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

  /* THE FONT FLOOR. Until this line existed there was no global font-family
     anywhere on the platform: not on body in index.html, not in this
     stylesheet. Every family was declared per component in an inline style
     object, so any page or subtree that simply forgot one fell through to the
     browser default, which is a SERIF (Times) — and because a fair number of
     controls declare fontFamily: "inherit" (OnboardingVideo, JobPhotos,
     DismissX, DeleteAccount), one forgotten ancestor took its descendants
     down with it. That is why the site read as inconsistent "on some pages"
     rather than being uniformly wrong: the mistake was invisible wherever a
     parent happened to remember.

     One declaration on body is enough because font-family inherits. Form
     controls are named separately because they do NOT inherit it — a button
     or input with no family falls back to the UA font, not to body's.

     This is a floor, not an override: inline styles beat this stylesheet (see
     the note above img/video), so every deliberate per-component family still
     wins. It only catches the omissions. */
  body { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; }
  button, input, select, textarea { font-family: inherit; }

  /* Responsive safety net. Inline styles beat this stylesheet, so a fixed inline
     width still applies — these only bite when the container is genuinely
     narrower than the element, i.e. the phone case. svg is left out on purpose —
     Ic renders sized icons that must not shrink in flex rows. */
  img, video, canvas { max-width: 100%; }
  input, select, textarea { max-width: 100%; }

  /* ── Field focus, and why it is HERE rather than per page (2026-11-08) ──────
     Until today fourteen files carried 'outline: "none"' inline on their field
     style objects — ChatWidget, DashSearch, DeleteAccount, Footer, JobChat,
     NewRequest, ProfileBar, TwoStepPanel, VerifyCodeModal, Login,
     UpdatePassword, GetQuote and both onboarding pages. Not one of them had a
     :focus-visible rule beside it. That is the accessibility bug in its purest
     form: thirteen of the platform's sign-in, verification and account-deletion
     fields had NO visible focus indicator at all for a keyboard user, and
     nothing anywhere threw.

     The inline declarations are gone, and the ring lives here, because:

       1. An inline style attribute BEATS this stylesheet. So a rule here could
          never have overridden those fourteen — removing them was the only
          route, and once removed the ring has to come from somewhere.
       2. One rule covers every field on the platform, including the ones
          nobody has written yet. Fourteen per-page copies is how you get
          thirteen of them missing.

     :focus for the halo (a text field should look focused when you CLICK into
     it — you are about to type), :focus-visible for the outline ring on top,
     which is the keyboard-only part. Same split as ServicePicker's own sheet.

     box-shadow, not border-color, for the halo. Every one of those field style
     objects sets the 'border' SHORTHAND inline, which sets border-color inline
     too, so a border-color from this sheet loses. box-shadow is unset inline at
     all of them, so it is the one property that reliably lands. Where a page
     wants the border to move as well it does it in its own scoped sheet, as
     ServicePicker does.

     Checkboxes and radios are excluded: they are not text fields and the UA
     already rings them legibly. */
  input:not([type="checkbox"]):not([type="radio"]):focus,
  select:focus, textarea:focus {
    box-shadow: 0 0 0 3px var(--ff-accent-soft);
  }
  input:not([type="checkbox"]):not([type="radio"]):focus-visible,
  select:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--ff-accent-400);
    outline-offset: 2px;
  }

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
    /* 48px, not 44, as of 2026-11-08. 44 is the floor Apple publishes as the
       MINIMUM; 48 is what iOS actually ships for a list row or a bar button,
       and the owner asked for "generous" targets. --ff-h-row was already 48,
       so this makes the control floor and the row height agree instead of
       being 44 and 48 for no reason anyone could state.

       ⚠️ The selector was 'a.ff-tap, label.ff-tap' until 2026-11-08 — opt-IN,
       with exactly ONE element in all of src/ opting in (ui/Pass.tsx:108).
       Every other tappable link and label on the site was therefore under the
       floor, which is the bug, not the default. It is now opt-OUT for those
       two as well, and the escape hatch is .ff-tap-auto, which is why that
       class is listed for a and label too. The direction matters: a missed
       opt-in is an invisible accessibility failure, while a missed opt-out is
       a visibly too-tall link that someone fixes in a minute.

       .ff-tap did NOT become dead when the default flipped — it changed jobs.
       Its new and only job is the force-ON for a control link that happens to
       sit inside one of the prose containers listed in the restore rule below.
       The one pre-existing use of it (ui/Pass.tsx:108) is on a <button>, which
       now gets the floor unconditionally, so that use is redundant — left in
       place because removing a class from the sheet's selector list while it
       is still in the JSX is the kind of change that looks complete and is
       not, and because it costs nothing. */
    button, [role="button"], select { min-height: 48px; }
    a:not(.ff-tap-auto), label:not(.ff-tap-auto) {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
    }
    /* ⚠️ READ THIS BEFORE DELETING THE RULE BELOW — it is not a refinement,
       it is what makes the rule above safe to apply at all.

       min-height does NOTHING to a plain inline element, so the floor needs
       inline-flex to bite. But an inline-flex element will not break its text
       across lines: its text node becomes a single anonymous flex item. A
       blanket floor on 'a' therefore turns every link inside a sentence into
       an unwrappable 48px-tall box that overflows its column — which on the
       legal pages, where whole clauses are links, is a worse bug than the one
       being fixed.

       So prose links are restored to inline. The restore is keyed on the
       CONTAINER, because that is the only thing that distinguishes "link that
       is a control" from "link that is a word": a nav item or a card link is a
       child of a layout element, a prose link lives in running text.

       Direction of failure, which is the whole argument for doing it this way:
       a link wrongly treated as prose is merely under the floor — the status
       quo for all but one element in src/ before today — while a link wrongly
       treated as a control visibly wrecks a paragraph. So the ambiguous case
       loses, and '.ff-tap' forces the floor back on for a control that does
       happen to sit in a list item or a label.

       :where() so the restore carries ZERO specificity from its ancestors and
       the single class .ff-tap can always beat it. With a plain descendant
       selector the restore would be specificity 0,0,1,2 and .ff-tap would
       lose, making the escape hatch silently dead. */
    :where(p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, figcaption, small, label)
      a:not(.ff-tap) {
      min-height: 0;
      display: inline;
      vertical-align: baseline;
    }
    /* Opt-out for anything genuinely inline that is NOT in one of the prose
       containers above — e.g. a link styled as a word inside a <div> or a
       <span> of copy. */
    button.ff-tap-auto, [role="button"].ff-tap-auto { min-height: 0; }
    a.ff-tap-auto, label.ff-tap-auto {
      min-height: 0;
      display: inline;
      vertical-align: baseline;
    }

    /* Text fields, and the reason for the !important.
       iOS Safari ZOOMS THE WHOLE VIEWPORT whenever you focus a field whose
       computed font-size is under 16px. Our inputs are written inline at
       .85rem, and --ff-font-scale is 1.1, so that lands at ~15px — one pixel
       under the threshold, on every form on the site. Tapping the bid price
       field zoomed the page in and shifted the form half off-screen, which is
       most of what "bidding doesn't work on my phone" actually was. Safari
       does not zoom back out on blur, so the pro then had to pinch out by
       hand between every field.

       Inline styles beat this stylesheet (see the note above img/video), and
       the size is written inline at roughly forty call sites, so !important
       on one line is the honest fix rather than forty edits that the next
       new input would silently miss. It is scoped to coarse pointers, so a
       mouse-driven desktop keeps the smaller field exactly as designed.

       16px, not 1rem: 1rem is 17.6px here, which would visibly re-flow every
       form. 16px is the threshold itself and sits a pixel off what's already
       drawn. Checkboxes and radios are excluded from BOTH rules — a 44px-tall
       checkbox breaks the walkthrough opt-in row, and they never trigger the
       zoom in the first place. */
    input:not([type="checkbox"]):not([type="radio"]),
    select, textarea { font-size: 16px !important; }
    input:not([type="checkbox"]):not([type="radio"]),
    textarea { min-height: 44px; }
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
  .ff-enter { animation: ff-enter 0.22s var(--ff-ease-out) both; }
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
  .ff-enter-b { animation: ff-enter-b 0.22s var(--ff-ease-out) both; }

  @keyframes ff-fade { from { opacity: 0; } to { opacity: 1; } }
  .ff-fade { animation: ff-fade 0.22s var(--ff-ease-out) both; }

  /* Images. The pattern is opacity 0 until data-ff-in is set, and the three
     ways that attribute gets set (ref callback for an already-complete image,
     onLoad, onError) are all in FadeImg -- see src/components/FadeImg.tsx.
     An image that somehow reaches none of them would be invisible, so the
     safety animation forces it visible after 4s no matter what. A slightly
     late image is a cosmetic miss; an image that never appears is a bug. */
  @keyframes ff-img-safety { from { opacity: 0; } to { opacity: 1; } }
  img[data-ff-fade] {
    opacity: 0;
    transition: opacity 0.22s var(--ff-ease-out);
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
  .ff-toast-in { animation: ff-toast-in 0.22s var(--ff-ease-out) both; }

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
    .ff-lift { transition: transform 0.18s var(--ff-ease-out), box-shadow 0.18s var(--ff-ease-out), border-color 0.18s var(--ff-ease-out); }
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

  /* ── The other two accessibility preferences (2026-11-08) ──────────────
     THREE INDEPENDENT QUERIES, NOT ONE. The material pass earlier today
     shipped --ff-glass / --ff-glass-blur onto four primitives and left four
     hand-rolled blurs in Home.tsx, and at that point this file answered
     exactly one of the three preferences an OS can express: reduce-motion was
     covered in 13 places, while prefers-reduced-transparency and
     prefers-contrast appeared ZERO times in all of src/. Translucency is not
     a motion problem and contrast is not a transparency problem — a user who
     turns on Reduce Transparency has not asked for less animation, and one
     who turns on Increase Contrast wants a border they can see, which no
     amount of removing blur gives them. Hence two separate blocks.

     ⚠️ THE KILL IS A BLANKET AND IT IS DELIBERATE. Four of the eight
     backdrop-filter sites in src/ write a LITERAL blur (Home's hero panel at
     blur(10px), its three before/after pills at blur(4px)) rather than going
     through --ff-glass-blur, so setting the token to "none" would silently
     miss half the surfaces on the busiest page. The universal selector with
     !important is the only rule that cannot be out-specified by an inline
     style or a per-page style block — the same reasoning as the reduced-
     motion blanket directly above, and the same reasoning as the 16px font
     floor in the (pointer: coarse) block. The token is set to "none" as well,
     so a surface that reads it computes the right thing rather than being
     overridden after the fact.

     What this does NOT do is make the surfaces opaque, because --ff-glass is
     theme-dependent and carries a literal in each of the three palette blocks
     — reaching in from here would need the value spelled a fourth and fifth
     time. The opaque grounds live beside the classes that consume them, in
     src/components/ui/uiStyles.ts, where they are expressed as the existing
     theme tokens and are therefore correct in both themes by construction. */
  @media (prefers-reduced-transparency: reduce) {
    *, *::before, *::after {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    :root { --ff-glass-blur: none; }
  }

  /* Increase Contrast implies Reduce Transparency and then asks for more: a
     blurred ground is low-contrast by definition, so the blur goes first, and
     then the hairline doubles. --ff-hair-w is geometry at plain :root rather
     than a colour, so overriding it here needs no theme counterpart — and
     0.5px is a HAIRLINE, which is the one thing a user asking for higher
     contrast is least able to see. 1px is where it already was before the
     material pass, so this degrades to the previously-shipped appearance
     rather than to something nobody has looked at. */
  @media (prefers-contrast: more) {
    *, *::before, *::after {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    :root { --ff-glass-blur: none; --ff-hair-w: 1px; }
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
