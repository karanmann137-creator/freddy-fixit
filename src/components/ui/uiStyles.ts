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
/* ═══ keyboard focus ══════════════════════════════════════════════════════
   ⚠️ THIS IS THE MOST LOAD-BEARING RULE IN THE FILE. Until 2026-11-08 this
   sheet contained no focus rule of any kind, which meant every shared Button,
   Row, IconButton, Pill, Stepper and job chip — i.e. the interactive surface
   of all three dashboards — fell back to the browser's default ring. That
   ring is technically present, unbranded, and on navy it is very nearly
   invisible. Only Home.tsx ever styled focus (.ff-cta:focus-visible), so the
   marketing page was keyboard-navigable and the product was not.

   One rule here fixes the entire app at once, which is the whole reason a
   shared sheet exists. Do not re-solve this per page.

   :focus-visible, never :focus. :focus fires on a MOUSE click too, so a plain
   :focus ring leaves an orange outline sitting on whatever you last clicked —
   which is exactly the complaint that gets "fixed" with outline:none, and
   outline:none is how you delete keyboard access for everyone. The browser
   already knows the difference; :focus-visible is how you ask.

   Two layers, not one: the outline draws OUTSIDE the element and is immune to
   overflow:hidden on an ancestor, and the box-shadow halo gives it contrast
   against both the navy and the off-white ground without depending on either.
   --ff-accent-400 is correct here and is one of the few places it is — 400 is
   the brightest step of the ramp, and a focus ring is the one thing that
   should be brighter than the control it sits on. */
.ffu-btn:focus-visible,
.ffu-row:focus-visible,
.ffu-iconbtn:focus-visible,
.ffu-jobchip:focus-visible,
.ffu-step:focus-visible,
.ffu-sheet a:focus-visible,
.ffu-sheet button:focus-visible{
  outline: 2px solid var(--ff-accent-400);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px var(--ff-accent-soft);
}
/* A row sits flush inside an overflow:hidden sheet, so an outside outline on
   the first or last row is clipped on one edge. Pulling the offset inward
   keeps all four sides of the ring on screen. The ring is still 2px — it is
   drawn inside the row rather than around it. */
.ffu-row:focus-visible{
  outline-offset: -3px;
  box-shadow: none;
}
/* Removing the ring on pointer interaction is the ONE thing this rule may not
   do, so there is deliberately no :focus{outline:none} anywhere in this file.
   If you are reading this because a ring appeared after a click: it did not —
   :focus-visible does not match a mouse click. Something else set it. */

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
  background: radial-gradient(120% 80% at 88% -18%, rgba(var(--ff-accent-rgb), .20), transparent 62%);
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

/* 36px until 2026-11-08, which was under the 44px floor on BOTH axes — and the
   half-fix is worth naming because it is the trap: the (pointer: coarse) block
   in main.tsx sets min-height on every button, so on touch this was a 48x36
   target. A floor applied to one axis is not a floor. min-height also beats
   height outright (they are different properties, so the class's height:36px
   never had a say), which is why the defect was a 48x36 PILL rather than a
   36px circle — a shape nobody designed and nobody noticed.

   The size is now --ff-h-ctl, the same token every other control reads, so
   there is no fourth number to keep in sync. The matching min-width lives in
   the coarse block and is scoped to THIS CLASS, deliberately not to "button":
   main.tsx:510-513 already considered a blanket min-width and rejected it,
   because it blows a tight button row off the side of the screen. A fixed
   square has no row to blow out, so the narrow rule is safe where the broad
   one was not. */
.ffu-iconbtn{
  width:var(--ff-h-ctl); height:var(--ff-h-ctl); border-radius:99px;
  display:grid; place-items:center;
  background: rgba(var(--ff-fg), .07);
  border:var(--ff-hair-w) solid var(--ff-hair);
  color: var(--ff-text);
  cursor:pointer; position:relative;
  transition: transform .34s var(--ff-ease-spring), background .16s var(--ff-ease-out);
}
@media (pointer: coarse){
  .ffu-iconbtn{ width:48px; height:48px; min-width:48px; }
}
/* Same asymmetry as .ffu-btn: ease-out down, spring up. See the long note in
   the buttons section — the timing-function override on :active is what keeps
   the overshoot off the downstroke. */
.ffu-iconbtn:active{ transform:scale(0.97); transition-duration:.1s; transition-timing-function: var(--ff-ease-out); }
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
  border:var(--ff-hair-w) solid var(--ff-hair);
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
  border-top:var(--ff-hair-w) solid var(--ff-hair);
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
  border:var(--ff-hair-w) solid var(--ff-hair);
  font-family:'Bebas Neue', sans-serif; font-size:.8rem; letter-spacing:.07em;
  color: rgba(var(--ff-muted), .88);
  white-space:nowrap;
  transition: background .16s var(--ff-ease-out), color .16s var(--ff-ease-out), transform .34s var(--ff-ease-spring);
}
.ffu-jobchip:active{ transform:scale(0.97); transition-duration:.1s; transition-timing-function: var(--ff-ease-out); }
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
/* --ff-hair-w (0.5px) rather than 1px, and this is the whole reason our cards
   read heavier than iOS's. A 1px border on a 3× phone is THREE device pixels.
   0.5px is honoured on retina and rounded up to 1px on everything else, so a
   non-retina screen renders exactly what it renders today — the change is
   invisible where it cannot help and correct where it can.
   --ff-r4 (26px) because an 18px radius on a full-width card reads as a web
   panel; the continuous-feeling corner is most of what "appleish" means on a
   container this size. */
.ffu-sheet{
  background: var(--ff-card-bg);
  border: var(--ff-hair-w) solid var(--ff-card-border);
  border-radius: var(--ff-r4);
  overflow:hidden;
  box-shadow: var(--ff-mat-1);
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
   as mushy. The scale value and the :active duration match the three existing
   .ffdash copies exactly and MUST keep matching them (CLAUDE.md names them as
   byte-identical).

   What changed 2026-11-08: the RELEASE curve, and only the release curve.
   --ff-ease-spring overshoots — its y control points exceed 1 — so the button
   returns past 1.0 and settles back, which is the "proper settle" an Apple
   control has and --ff-ease-out does not. --ff-ease-out lands exactly on the
   target and stops dead, which is what read as cheap.

   The overshoot is on the UP stroke only. :active still uses --ff-ease-out,
   because an overshoot on the way down would push the button smaller than the
   pressed size while the thumb is still on it — it would wobble under the
   finger. So the rule is: down is ease-out and fast, up is spring and slower.
   That is also why these are two separate transition declarations rather than
   one with a longer duration.

   Reduced motion is already handled globally in main.tsx, which flattens every
   transition to 0.001ms — including this one, overshoot and all. Nothing here
   needs its own prefers-reduced-motion branch, and adding one would be the
   second copy of a rule that already works. */
.ffu-btn{
  min-height: var(--ff-h-ctl);
  border:0; border-radius: var(--ff-r3); cursor:pointer;
  font-family:'Bebas Neue', sans-serif; font-size:.95rem; letter-spacing:.09em;
  display:inline-flex; align-items:center; justify-content:center; gap:var(--ff-s2);
  padding:0 var(--ff-s5);
  transition: transform .34s var(--ff-ease-spring), background .16s var(--ff-ease-out), opacity .16s var(--ff-ease-out), box-shadow .22s var(--ff-ease-out);
}
.ffu-btn.ffu-full{ width:100%; }
.ffu-btn:active{ transform:scale(0.97); transition-duration:.1s; transition-timing-function: var(--ff-ease-out); }
.ffu-btn:disabled{ opacity:.5; cursor:not-allowed; }
.ffu-btn:disabled:active{ transform:none; }
.ffu-btn.ffu-pri{ background: var(--ff-accent-500); color:#fff; box-shadow: var(--ff-mat-2); }
.ffu-btn.ffu-sec{ background: var(--ff-card-bg); color: var(--ff-text); border:var(--ff-hair-w) solid var(--ff-card-border); }
.ffu-btn.ffu-ghost{ background:transparent; color: var(--ff-text); border:var(--ff-hair-w) solid var(--ff-hair); }
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

/* ═══ frosted material ════════════════════════════════════════════════════
   One class for every translucent surface on the site, added 2026-11-08.

   ⚠️ --ff-glass is OPAQUE ENOUGH TO STAND ALONE (0.72–0.76), and that is a
   requirement, not a style choice. backdrop-filter is unsupported or disabled
   in more places than it looks — iOS Safari 15 and earlier need the -webkit-
   prefix (which is why it is written twice below, prefix FIRST so the standard
   property wins where both are understood), Firefox shipped it late, and any
   browser with reduced transparency or GPU compositing off drops it silently.
   A frosted surface built on rgba(…,0.2) and a blur becomes an unreadable
   transparent panel in every one of those cases, with the modal's text
   overlapping the page behind it. So: the colour carries legibility, the blur
   is pure enhancement, and nobody may lower the alpha to make the effect more
   visible on their own machine.

   isolation:isolate because backdrop-filter samples everything painted below
   it in the same stacking context — without it a frosted element inside a
   transformed ancestor blurs its own siblings and looks like a rendering bug. */
.ffu-glass{
  background: var(--ff-glass);
  -webkit-backdrop-filter: var(--ff-glass-blur);
  backdrop-filter: var(--ff-glass-blur);
  isolation: isolate;
}

/* ═══ scrim + modal / bottom sheet ════════════════════════════════════════
   Below ~560px a dialog becomes a sheet that rises from the bottom edge; above
   it, a centred card. This is the single biggest "appleish flow" change in the
   pass and the reason is reach, not fashion: a centred dialog on a 6" phone
   puts its buttons in the middle of the screen, which is the hardest place on
   the device for a thumb to get to. A sheet puts them at the bottom, where the
   thumb already is. Fitts' law, applied to the one axis a phone has.

   The breakpoint is a width query rather than (pointer: coarse) on purpose: an
   iPad is a coarse pointer with 1024px of room, and a bottom sheet pinned to
   the bottom of a landscape tablet is worse than a centred card, not better. */
.ffu-scrim{
  position: fixed; inset: 0; z-index: 10000;
  display: flex; align-items: center; justify-content: center;
  padding: var(--ff-s5);
  background: rgba(8,11,20,.56);
  -webkit-backdrop-filter: saturate(140%) blur(6px);
  backdrop-filter: saturate(140%) blur(6px);
  /* isolation for the reason given above .ffu-glass. Every backdrop-filter in
     this file now carries it, so "does this one need it?" stops being a
     per-site judgement — the two that were missing it were missing it because
     they were written separately, not because anyone decided they were fine. */
  isolation: isolate;
  animation: ffu-scrim-in .22s var(--ff-ease-out) both;
}
@keyframes ffu-scrim-in{ from{ opacity:0; } to{ opacity:1; } }

/* --ffu-modal-w and --ffu-modal-pad exist so a converted dialog can keep its
   own width and padding WITHOUT an inline style, and that is not a convenience
   — it is the only way the conversion is safe. An inline style attribute beats
   the injected sheet, so an inline maxWidth:380 would also beat the
   'max-width: none' in the max-width:560px block below and the sheet would
   stop being full-bleed on a phone. Setting the VARIABLE inline is immune:
   the mobile rule re-declares 'max-width' itself, so it wins regardless of
   what the variable says. Same reasoning for the padding. */
.ffu-modal{
  position: relative;
  width: 100%; max-width: var(--ffu-modal-w, 420px);
  background: var(--ff-glass);
  -webkit-backdrop-filter: var(--ff-glass-blur);
  backdrop-filter: var(--ff-glass-blur);
  isolation: isolate;
  border: var(--ff-hair-w) solid var(--ff-card-border);
  border-radius: var(--ff-r4);
  box-shadow: var(--ff-mat-3);
  color: var(--ff-text);
  padding: var(--ffu-modal-pad, var(--ff-s6));
  font-family: 'DM Sans', system-ui, sans-serif;
  animation: ffu-modal-in .26s var(--ff-ease-spring) both;
}
/* A converted dialog that was taller than the viewport on DESKTOP used to rely
   on its own overflow. The sheet branch below gets this for free; the centred
   branch needs it stated, or a long dialog (SettingsModal, ReportProblem)
   overflows the scrim with no way to reach the bottom button. */
.ffu-modal{ max-height: calc(100vh - var(--ff-s5) * 2); overflow-y: auto; }
/* Scale FROM 0.96, never from 0.8. A dialog that grows from small reads as a
   notification popping; one that is already almost full size reads as coming
   forward. The spring's overshoot is what sells the second reading. */
@keyframes ffu-modal-in{
  from{ opacity:0; transform: scale(.96) translateY(6px); }
  to{ opacity:1; transform: none; }
}

@media (max-width: 560px){
  /* align-items:flex-end is what turns the centred card into a sheet; padding
     goes to 0 so the sheet can reach all three edges it needs to. */
  .ffu-scrim{ align-items: flex-end; padding: 0; }
  .ffu-modal{
    max-width: none;
    /* Top corners only. A sheet with four rounded corners is a floating card
       that happens to be near the bottom; the flat bottom edge is what makes
       it read as attached to the edge of the device. */
    border-radius: var(--ff-r4) var(--ff-r4) 0 0;
    border-left: 0; border-right: 0; border-bottom: 0;
    /* env(safe-area-inset-bottom) is NOT optional. Without it the primary
       action sits under the home indicator on every notched iPhone — visible,
       tappable in theory, and swiping the app away in practice. The fallback
       inside env() is 0, so this is safe on devices that have no inset. */
    padding: var(--ff-s5) var(--ff-s5) calc(var(--ff-s6) + env(safe-area-inset-bottom, 0px));
    /* The sheet must be able to scroll its own content rather than push the
       page: a tall dialog on a short phone in landscape is otherwise
       unreachable from the bottom button down. */
    max-height: 88vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    animation: ffu-sheet-in .34s var(--ff-ease-drawer) both;
  }
  @keyframes ffu-sheet-in{
    from{ transform: translateY(100%); }
    to{ transform: none; }
  }
  /* The grabber. Decorative — it is NOT a drag handle, because a real
     drag-to-dismiss needs a gesture handler and this folder may not import
     Framer Motion. It is here because it is the signal iOS users read as
     "this panel is dismissible", and the dismiss is the scrim tap. If someone
     later wires an actual drag, this is the element to hang it on.
     aria-hidden is applied in the component, not here — a presentational bar
     announced to a screen reader is noise. */
  .ffu-grab{
    display: block;
    width: 36px; height: 5px; border-radius: 99px;
    background: rgba(var(--ff-fg), .22);
    margin: 0 auto var(--ff-s4);
  }
}
/* Above the breakpoint the grabber would be a stray bar on a centred card. */
@media (min-width: 561px){ .ffu-grab{ display: none; } }

/* A dialog whose own children paint to the card edge — a tinted header band, a
   full-bleed image — cannot take the card's padding, and setting
   --ffu-modal-pad: 0 is NOT enough: the sheet branch above re-declares
   'padding' directly, so the variable is ignored on a phone and the band gets
   inset by 20px on exactly the screen it matters on. This class zeroes both
   branches. It must come AFTER the media block — it carries the same
   specificity as .ffu-modal (0,0,1,0), so source order is the only thing that
   decides, and before the block it would silently lose on mobile.

   The one part of the sheet padding that is not decoration is kept: the
   safe-area inset. A flush dialog therefore owns its own bottom room, and its
   last child must supply enough that the primary action clears the home
   indicator. */
.ffu-modal-flush{ padding: 0; }
@media (max-width: 560px){
  .ffu-modal-flush{ padding: 0 0 env(safe-area-inset-bottom, 0px); }
  /* The grabber's margin is 0 auto, so with no card padding it would sit
     against the top edge instead of floating below it. */
  .ffu-modal-flush > .ffu-grab{ margin-top: var(--ff-s3); }
}

/* ── PageTitle: the collapsing large title ──────────────────────────────────
   Rationale for the component lives in PageTitle.tsx. What is here is only
   what inline styles cannot say: a fixed bar, a backdrop filter, a keyframe,
   and a breakpoint. */
.ffu-ptitle{ display: block; }
.ffu-ptitle-eyebrow{
  margin: 0 0 var(--ff-s3);
  font-family: 'Bebas Neue', sans-serif;
  font-size: .78rem; letter-spacing: .2em; text-transform: uppercase;
  color: var(--ff-c10);
}
/* The display face and weight come from the tokens, never a literal: a face
   change is one edit in main.tsx and this follows it. line-height sits at 1.03
   because the display face has real descenders where Bebas's all-caps metrics
   effectively did not -- at or above 1.0, never below. */
.ffu-ptitle-h{
  margin: 0 0 var(--ff-s3);
  font-family: var(--ff-font-display);
  font-weight: var(--ff-display-wght);
  font-size: clamp(2.3rem, 6vw, 3.6rem);
  letter-spacing: -0.028em;
  line-height: 1.03;
  color: var(--ff-text);
}

/* z-index 99 is one BELOW TopNav's 100, and that ordering is load-bearing in
   two directions. The nav's dropdown menu opens downward across this bar, so
   the bar must lose to it. And every modal scrim in this sheet sits far above
   both, so a dialog is never undercut by a page header. */
.ffu-ptitle-bar{
  position: fixed; left: 0; right: 0; z-index: 99;
  top: var(--ff-topnav-h);
  display: flex; align-items: center;
  min-height: var(--ff-h-ctl);
  padding: var(--ff-s2) clamp(1rem, 4vw, 1.5rem);
  /* Frosted, like the nav above it, so the two read as one stack of chrome
     rather than a floating strip. The rule the glass tokens carry applies:
     the surface must stay legible with the blur removed, which --ff-glass's
     0.72 alpha is chosen for. */
  background: var(--ff-glass);
  -webkit-backdrop-filter: var(--ff-glass-blur);
  backdrop-filter: var(--ff-glass-blur);
  isolation: isolate;
  border-bottom: var(--ff-hair-w) solid var(--ff-hair);
  animation: ffu-ptitle-in .22s var(--ff-ease-out) both;
}
/* Aligned to the page's own content column, not to the viewport, so the
   compact title sits directly above the first word of the body text. 860px is
   a default: a page whose column is a different width sets --ffu-ptitle-w. */
.ffu-ptitle-bar-t{
  display: block;
  width: 100%; max-width: var(--ffu-ptitle-w, 860px);
  margin: 0 auto;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.15rem; letter-spacing: .06em;
  color: var(--ff-text);
  /* min-width:0 before the ellipsis, per the grid rule in CLAUDE.md -- a long
     document title on a 372px phone has to clip rather than push the bar
     wider than the viewport. */
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
@keyframes ffu-ptitle-in{
  from{ opacity: 0; transform: translateY(-6px); }
  to{ opacity: 1; transform: none; }
}

/* ═══ the frosted surfaces under Reduce Transparency / Increase Contrast ═══
   Added 2026-11-08, the same day as the material itself. main.tsx kills every
   backdrop-filter on the site under both preferences with one blanket rule;
   this is the other half, and it has to live here rather than there for a
   reason worth keeping: --ff-glass is theme-DEPENDENT and is spelled as a
   literal in all three palette blocks, so neutralising it from a media query
   in main.tsx would mean writing the navy and the off-white a fourth and
   fifth time — two more copies of the exact value the literal rule already
   makes someone maintain by hand. Here the surfaces are named by CLASS, so
   the ground can be an ordinary theme token that resolves at USE time and is
   therefore right in both themes by construction, with nothing duplicated.

   This is also what finally makes "the surface must stay legible with the
   blur removed" mechanical rather than aspirational. That rule existed from
   the first commit of the glass tokens and the alpha was picked for it — but
   it was a claim about 0.72 being enough, tested by eye. Under Reduce
   Transparency the answer is no longer "enough", it is "opaque", and the user
   asked for that explicitly. Do not lower these to re-introduce the effect.

   Note what is NOT here: the scrim keeps a hair of translucency (.92) rather
   than going solid, because a scrim that is completely opaque stops reading
   as a layer over the page and starts reading as a navigation — the dialog
   looks like a new screen, and the user loses the thing the scrim exists to
   tell them, which is that there is something behind it to go back to. .92 is
   still unambiguous about what is interactive; 1.0 changes the mental model. */
@media (prefers-reduced-transparency: reduce) {
  .ffu-glass, .ffu-modal, .ffu-ptitle-bar{ background: var(--ff-surface); }
  .ffu-scrim{ background: rgba(8,11,20,.92); }
}
/* Increase Contrast gets the opaque grounds too, plus a border it can
   actually see. --ff-hair-w is already doubled to 1px by the :root override
   in main.tsx, so what is left is the COLOUR: --ff-card-border is a low-alpha
   line chosen to be nearly invisible, which is the correct default and the
   wrong answer for someone who has told the OS they cannot see it. */
@media (prefers-contrast: more) {
  .ffu-glass, .ffu-modal, .ffu-ptitle-bar{ background: var(--ff-surface); }
  .ffu-scrim{ background: rgba(8,11,20,.92); }
  .ffu-modal{ border-color: var(--ff-text); }
  .ffu-ptitle-bar{ border-bottom-color: var(--ff-text); }
}
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
