// ─────────────────────────────────────────────────────────────────────────────
// The one stylesheet for src/components/ui/.
//
// WHY A STYLESHEET AND NOT INLINE STYLES. The rest of this codebase styles
// almost everything with inline style objects, and that is fine for one-off
// layout. It cannot express :hover, :active, ::before or @keyframes, which is
// exactly why both big dashboards already carry their own scoped `.ffdash`
// <style> block. These primitives need all four — the row separator is a
// ::before, the press is an :active, the state dot pulses — so they get one
// sheet, injected once, rather than a third copy of the same trick.
//
// WHY EVERY CLASS IS PREFIXED `ffu-`. The names this design wants are `row`,
// `btn`, `pill`, `sheet`, `step`. Those are far too generic to put in a
// document-wide stylesheet in a codebase this size: `.row` alone would reach
// into unrelated markup and the breakage would be visual, silent, and on a
// page nobody opened during review. The prefix is not decoration.
//
// WHY NO VALUE IS HARD-CODED. Everything below resolves through the --ff-*
// tokens in src/main.tsx. That is what makes the Pass render navy inside
// .ff-on-dark and off-white outside it with no per-component branch, and it is
// what makes a Contractor/Admin port a matter of mounting these components
// rather than re-deriving the colours.
//
// Reduced motion is handled globally in main.tsx (every animation and
// transition is flattened to 0.001ms), so nothing here needs its own
// prefers-reduced-motion rule.
// ─────────────────────────────────────────────────────────────────────────────

const MARKER = "data-ff-ui-styles";

const CSS = `
/* ═══ the pass ════════════════════════════════════════════════════════════
   The shell at the top of every dashboard screen. Its job is to answer
   "is this on me or on them" before anything scrolls.

   It paints with var(--ff-surface-2), NOT #111827. The component puts
   'ff-on-dark ff-anchor' on this element, and that class re-declares
   --ff-surface-2 to #111827 as a literal in both themes — so the navy is
   a consequence of the scope, and dropping 'ff-anchor' is the one-token
   change that lets the pass follow light mode instead. Hard-coding the hex
   here would make that decision unreachable. */
.ffu-pass{
  background: var(--ff-surface-2);
  padding: var(--ff-s5) var(--ff-s4) var(--ff-s4);
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
}
/* The warm corner. Sits under the content (z-index), is pointer-events:none so
   it can never eat a tap, and is a radial rather than a linear gradient so it
   reads as light falling on the card instead of a band across it. */
.ffu-pass::after{
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 80% at 88% -18%, rgba(234,107,20,.20), transparent 62%);
}
.ffu-pass > *{ position: relative; z-index: 1; }

.ffu-passtop{ display:flex; align-items:center; gap:var(--ff-s3); margin-bottom:var(--ff-s5); }
.ffu-passtop .ffu-sp{ flex:1; }
.ffu-wordmark{
  font-family:'Bebas Neue', sans-serif;
  font-size:1rem; letter-spacing:.12em; line-height:1;
  color: var(--ff-text);
}
.ffu-wordmark em{ color: var(--ff-accent-500); font-style:normal; }

.ffu-iconbtn{
  width:36px; height:36px; border-radius:99px;
  display:grid; place-items:center;
  background: rgba(var(--ff-fg), .07);
  border:1px solid var(--ff-hair);
  color: var(--ff-text);
  cursor:pointer; position:relative;
  transition: transform .16s var(--ff-ease-out), background .16s var(--ff-ease-out);
}
.ffu-iconbtn:active{ transform:scale(0.97); transition-duration:.1s; }
/* The badge's border is the pass ground, not a colour — that is what cuts the
   notch out of the icon behind it. currentColor would be wrong here. */
.ffu-iconbtn .ffu-bdg{
  position:absolute; top:-2px; right:-2px;
  min-width:16px; height:16px; padding:0 4px;
  border-radius:99px;
  background: var(--ff-accent-500); color:#fff;
  font-family:'Bebas Neue', sans-serif; font-size:.62rem; letter-spacing:.04em;
  display:grid; place-items:center;
  border:2px solid var(--ff-surface-2);
}

/* ═══ state line ══════════════════════════════════════════════════════════
   The single most important element in the redesign, and the reason the
   palette discipline holds: ORANGE APPEARS EXACTLY ONCE PER SCREEN, and only
   when the answer is "you". A screen where the client is waiting on a pro has
   no orange on it anywhere — which is what makes the orange mean something on
   the screens that do. */
.ffu-stateline{
  display:inline-flex; align-items:center; gap:var(--ff-s2);
  height:26px; padding:0 var(--ff-s3);
  border-radius:99px;
  font-family:'Bebas Neue', sans-serif; font-size:.78rem; letter-spacing:.1em;
  margin-bottom: var(--ff-s3);
}
.ffu-stateline.ffu-turn{
  background: var(--ff-accent-soft); color: var(--ff-accent-400);
  border:1px solid var(--ff-accent-line);
}
.ffu-stateline.ffu-wait{
  background: rgba(var(--ff-fg), .07); color: rgba(var(--ff-muted), .95);
  border:1px solid var(--ff-hair);
}
.ffu-stateline.ffu-ok{
  background: rgba(134,239,172,.14); color: var(--ff-success);
  border:1px solid rgba(134,239,172,.26);
}
.ffu-stateline.ffu-rev{
  background: rgba(251,191,36,.14); color: var(--ff-warn);
  border:1px solid rgba(251,191,36,.26);
}
.ffu-sdot{ width:7px; height:7px; border-radius:99px; background:currentColor; flex:0 0 auto; }
.ffu-sdot.ffu-pulse{ animation: ffu-pls 2.2s var(--ff-ease-in-out) infinite; }
@keyframes ffu-pls{
  0%,100%{ opacity:1; transform:scale(1); }
  50%{ opacity:.35; transform:scale(.82); }
}

/* ═══ hero ════════════════════════════════════════════════════════════════
   DM Sans at 500, NOT Bebas, and this is a deliberate exception to the
   "dashboards are a Bebas surface" rule rather than an oversight. Bebas is a
   condensed all-caps display face: it is excellent for a four-word label and
   it is unreadable as a full sentence, which is what this line is ("Three pros
   have sent you estimates."). Every Bebas surface in the brand uses it for
   headings and labels; a sentence is neither. Negative tracking because DM
   Sans at display size sets loose. */
.ffu-hero{
  font-family:'DM Sans', system-ui, sans-serif;
  font-weight:500; font-size:1.42rem; line-height:1.26; letter-spacing:-.03em;
  color: var(--ff-text); margin:0 0 var(--ff-s2);
}
.ffu-herosub{
  margin:0; font-size:.9rem; line-height:1.5;
  color: rgba(var(--ff-muted), .92);
}
.ffu-passmeta{
  display:flex; gap:var(--ff-s5);
  margin-top:var(--ff-s5); padding-top:var(--ff-s4);
  border-top:1px solid var(--ff-hair);
}
.ffu-passmeta > div{ min-width:0; }
.ffu-mk{
  font-family:'Bebas Neue', sans-serif; font-size:.72rem; letter-spacing:.11em;
  color: rgba(var(--ff-muted), .7);
  display:block; margin-bottom:2px;
}
.ffu-mv{
  font-family:'Bebas Neue', sans-serif; font-size:1.02rem; letter-spacing:.05em;
  color: var(--ff-text); display:block; line-height:1.15;
}
.ffu-mv.ffu-accent{ color: var(--ff-accent-400); }

/* ═══ job switcher ════════════════════════════════════════════════════════
   The IA hole this closes: a client with two or more jobs previously had no
   way to reach the second one from the dashboard at all.

   The negative margin is load-bearing, not a nudge. The rail must bleed to
   both edges of the pass so a half-visible chip signals "scrollable"; without
   it the last chip stops flush at the padding and the rail reads as complete.
   The padding puts the first chip back on the text grid. */
.ffu-jobsw{
  display:flex; gap:var(--ff-s2);
  overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch;
  margin:0 calc(var(--ff-s4) * -1) var(--ff-s4);
  padding:0 var(--ff-s4) var(--ff-s1);
}
.ffu-jobsw::-webkit-scrollbar{ display:none; }
.ffu-jobchip{
  flex:0 0 auto; height:36px;
  display:inline-flex; align-items:center; gap:var(--ff-s2);
  padding:0 var(--ff-s3); border-radius:99px; cursor:pointer;
  background: rgba(var(--ff-fg), .05);
  border:1px solid var(--ff-hair);
  font-family:'Bebas Neue', sans-serif; font-size:.8rem; letter-spacing:.07em;
  color: rgba(var(--ff-muted), .88);
  white-space:nowrap;
  transition: background .16s var(--ff-ease-out), color .16s var(--ff-ease-out), transform .16s var(--ff-ease-out);
}
.ffu-jobchip:active{ transform:scale(0.97); transition-duration:.1s; }
.ffu-jobchip.ffu-on{
  background: rgba(var(--ff-fg), .13); color: var(--ff-text);
  border-color: rgba(var(--ff-fg), .18);
}
/* The per-job state dot. This is the whole value of the rail: you can see
   WHICH job wants you without opening any of them. */
.ffu-jobchip i{
  width:7px; height:7px; border-radius:99px; flex:0 0 auto;
  border:1.5px solid rgba(var(--ff-fg), .3);
  background:transparent;
}
.ffu-jobchip i.ffu-turn{ background: var(--ff-accent-400); border-color: var(--ff-accent-400); }
.ffu-jobchip i.ffu-ok{ background: var(--ff-success); border-color: var(--ff-success); }
.ffu-jobchip.ffu-add{ color: rgba(var(--ff-muted), .7); border-style:dashed; }

/* ═══ grouped sheet + rows ════════════════════════════════════════════════ */
.ffu-grp{ margin-top: var(--ff-s6); }
.ffu-grplbl{
  font-family:'Bebas Neue', sans-serif; font-size:.78rem; letter-spacing:.11em;
  color: rgba(var(--ff-muted), .78);
  padding:0 var(--ff-s3) var(--ff-s2);
  display:flex; align-items:center; gap:var(--ff-s2);
}
.ffu-grplbl .ffu-sp{ flex:1; }
.ffu-sheet{
  background: var(--ff-card-bg);
  border:1px solid var(--ff-card-border);
  border-radius: var(--ff-r3);
  overflow:hidden;
  box-shadow: var(--ff-lift-1);
}
.ffu-row{
  display:grid; grid-template-columns: var(--ff-gut) minmax(0,1fr) auto;
  align-items:center;
  min-height: var(--ff-h-row);
  padding: var(--ff-s3) var(--ff-s4);
  position:relative; text-align:left;
  transition: background .16s var(--ff-ease-out);
}
/* A row rendered as a <button> inherits none of body's font, and a <div> row
   has no cursor. Both are normalised here so the caller can pick either. */
.ffu-row{
  font-family:'DM Sans', system-ui, sans-serif;
  background:transparent; border:0; width:100%; color:inherit;
}
.ffu-row[role="button"], button.ffu-row, a.ffu-row{ cursor:pointer; }
/* The separator starts where the TEXT starts, not where the row starts. One
   --ff-gut shared by the icon column and this inset is what stops a hairline
   from disagreeing with the column above it. */
.ffu-row + .ffu-row::before{
  content:""; position:absolute; top:0;
  left: calc(var(--ff-s4) + var(--ff-gut));
  right:0; height:1px; background: var(--ff-hair);
}
/* Hover is gated to fine pointers on purpose: on a touch screen :hover sticks
   after a tap, so a phone would leave whichever row was last touched
   permanently highlighted. Same reasoning as .ff-lift in main.tsx. */
@media (hover: hover) and (pointer: fine){
  .ffu-row:hover{ background: rgba(var(--ff-fg), .035); }
}
.ffu-row:active{ background: rgba(var(--ff-fg), .05); }
.ffu-row.ffu-active{ background: var(--ff-accent-soft); }
.ffu-row.ffu-active .ffu-rt b{ color: var(--ff-text); }

/* Always rendered, even with no icon, so the text column starts at the same x
   on every row in a sheet. An icon-less row that collapses its first column
   shifts its own text left and breaks the --ff-gut contract the separator
   above it is drawn against. */
.ffu-ri-wrap{ display:block; }
.ffu-ri{
  width:26px; height:26px; border-radius: var(--ff-r1);
  display:grid; place-items:center;
  color: var(--ff-accent-500); background: var(--ff-accent-soft);
}
.ffu-ri.ffu-g{ color: var(--ff-success); background: rgba(134,239,172,.12); }
.ffu-ri.ffu-w{ color: var(--ff-warn); background: rgba(251,191,36,.14); }
.ffu-ri.ffu-n{ color: rgba(var(--ff-muted), .9); background: rgba(var(--ff-fg), .06); }

/* min-width:0 BEFORE any ellipsis can clip: a bare 1fr track is
   minmax(auto,1fr) and refuses to shrink below its content. */
.ffu-rt{ min-width:0; }
.ffu-rt b{ display:block; font-weight:500; font-size:.95rem; line-height:1.35; letter-spacing:-.01em; }
.ffu-rt span{
  display:block; font-size:.82rem; line-height:1.42;
  color: rgba(var(--ff-muted), .92); margin-top:1px;
}
.ffu-rr{
  display:flex; align-items:center; gap:var(--ff-s2); margin-left:var(--ff-s3);
  font-family:'Bebas Neue', sans-serif; font-size:.9rem; letter-spacing:.05em;
  color: rgba(var(--ff-muted), .8); white-space:nowrap;
}
.ffu-rr .ffu-amt{ color: var(--ff-text); font-size:1rem; }
.ffu-chev{ opacity:.4; }

/* ═══ stepper ═════════════════════════════════════════════════════════════
   The connector is absolutely positioned. The first version of this used
   'margin: 3px 0 -0.6rem' to pull the line up between dots, which meant the
   geometry depended on the text height of the step above it — so a two-line
   step broke the line and a one-line step left a gap. top/bottom off the dot
   centre cannot drift. */
.ffu-steps{ padding: var(--ff-s2) 0; }
.ffu-step{
  display:grid; grid-template-columns:18px minmax(0,1fr); column-gap:var(--ff-s3);
  padding: var(--ff-s3) var(--ff-s4);
  position:relative; align-items:start;
}
.ffu-step::before{
  content:""; position:absolute;
  left: calc(var(--ff-s4) + 9px); margin-left:-.75px; width:1.5px;
  top:34px; bottom:-10px;
  background: var(--ff-hair);
}
.ffu-step:last-child::before{ display:none; }
.ffu-dot{
  width:18px; height:18px; border-radius:99px;
  display:grid; place-items:center; margin-top:2px; flex:0 0 auto;
}
.ffu-dot.ffu-ok{ background: var(--ff-success); color: var(--ff-surface-0e); }
.ffu-dot.ffu-now{ background: var(--ff-accent-500); box-shadow:0 0 0 4px var(--ff-accent-soft); }
.ffu-dot.ffu-rev{ background: var(--ff-warn); box-shadow:0 0 0 4px rgba(251,191,36,.16); }
.ffu-dot.ffu-todo{ background:transparent; border:1.5px solid var(--ff-hair); }
.ffu-st{ min-width:0; }
.ffu-st b{ display:block; font-weight:500; font-size:.92rem; line-height:1.4; letter-spacing:-.01em; }
.ffu-st span{
  display:block; font-size:.8rem; line-height:1.45;
  color: rgba(var(--ff-muted), .9); margin-top:1px;
}
.ffu-step.ffu-todo .ffu-st b{ color: rgba(var(--ff-muted), .78); font-weight:400; }

/* ═══ buttons ═════════════════════════════════════════════════════════════
   The press is scale(0.97) with a shorter transition on the way down than on
   the way back up. That asymmetry is the whole feel — a symmetric press reads
   as mushy. It matches the three existing .ffdash copies exactly. */
.ffu-btn{
  min-height: var(--ff-h-ctl);
  border:0; border-radius: var(--ff-r2); cursor:pointer;
  font-family:'Bebas Neue', sans-serif; font-size:.95rem; letter-spacing:.09em;
  display:inline-flex; align-items:center; justify-content:center; gap:var(--ff-s2);
  padding:0 var(--ff-s5);
  transition: transform .16s var(--ff-ease-out), background .16s var(--ff-ease-out), opacity .16s var(--ff-ease-out);
}
.ffu-btn.ffu-full{ width:100%; }
.ffu-btn:active{ transform:scale(0.97); transition-duration:.1s; }
.ffu-btn:disabled{ opacity:.5; cursor:not-allowed; }
.ffu-btn:disabled:active{ transform:none; }
.ffu-btn.ffu-pri{ background: var(--ff-accent-500); color:#fff; box-shadow: var(--ff-lift-2); }
.ffu-btn.ffu-sec{ background: var(--ff-card-bg); color: var(--ff-text); border:1px solid var(--ff-card-border); }
.ffu-btn.ffu-ghost{ background:transparent; color: var(--ff-text); border:1px solid var(--ff-hair); }
.ffu-btn.ffu-danger{ background: transparent; color: var(--ff-danger); border:1px solid rgba(248,113,113,.32); }
@media (hover: hover) and (pointer: fine){
  .ffu-btn.ffu-pri:hover:not(:disabled){ background: var(--ff-accent-600); }
  .ffu-btn.ffu-sec:hover:not(:disabled), .ffu-btn.ffu-ghost:hover:not(:disabled){ background: rgba(var(--ff-fg), .06); }
}
.ffu-btnrow{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:var(--ff-s3); margin-top:var(--ff-s4); }
.ffu-stack{ display:grid; gap:var(--ff-s3); margin-top:var(--ff-s5); }

/* ═══ pill ════════════════════════════════════════════════════════════════ */
.ffu-pill{
  display:inline-flex; align-items:center; gap:var(--ff-s1);
  height:24px; padding:0 var(--ff-s2); border-radius:99px;
  font-family:'Bebas Neue', sans-serif; font-size:.72rem; letter-spacing:.09em;
}
.ffu-pill.ffu-w{ background: rgba(251,191,36,.14); color: var(--ff-warn); }
.ffu-pill.ffu-g{ background: rgba(134,239,172,.14); color: var(--ff-success); }
.ffu-pill.ffu-a{ background: var(--ff-accent-soft); color: var(--ff-accent-500); }
.ffu-pill.ffu-d{ background: rgba(248,113,113,.14); color: var(--ff-danger); }
.ffu-pill.ffu-n{ background: rgba(var(--ff-fg), .07); color: rgba(var(--ff-muted), .9); }

/* ═══ attention card ══════════════════════════════════════════════════════
   Money-gating rows go first inside this, and only the first few render — the
   existing dashboards cap it at three (four on the contractor side). A card
   that lists eight things you must do is a card nobody reads. */
.ffu-attn{
  background: linear-gradient(180deg, var(--ff-accent-soft), transparent);
  border:1px solid var(--ff-accent-line);
  border-radius: var(--ff-r3);
  overflow:hidden; margin-top: var(--ff-s5);
}
.ffu-attnhd{
  display:flex; align-items:center; gap:var(--ff-s2);
  padding: var(--ff-s3) var(--ff-s4);
  font-family:'Bebas Neue', sans-serif; font-size:.78rem; letter-spacing:.11em;
  color: var(--ff-accent-500);
  border-bottom:1px solid var(--ff-accent-line);
}

/* ═══ trust line ══════════════════════════════════════════════════════════
   Consumer wording is "held securely", never "escrow". */
.ffu-trust{
  display:grid; grid-template-columns:20px minmax(0,1fr); gap:var(--ff-s3);
  align-items:start; margin-top:var(--ff-s5);
  padding: var(--ff-s3) var(--ff-s4); border-radius: var(--ff-r2);
  background: rgba(134,239,172,.08); border:1px solid rgba(134,239,172,.2);
}
.ffu-trust p{ margin:0; font-size:.82rem; line-height:1.5; color: rgba(var(--ff-muted), .95); }
.ffu-trust svg{ color: var(--ff-success); margin-top:1px; }
`;

/** Injects the ui/ stylesheet once per document. Idempotent and SSR-safe. */
export function ensureUiStyles(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[" + MARKER + "]")) return;
  const el = document.createElement("style");
  el.setAttribute(MARKER, "1");
  el.textContent = CSS;
  document.head.appendChild(el);
}

// Injected on import so a component never has to remember to call it. Every
// primitive in this folder imports from here, so mounting any one of them is
// enough.
ensureUiStyles();

/** Joins class names, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
