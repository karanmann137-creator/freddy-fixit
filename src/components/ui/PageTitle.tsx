import React, { useEffect, useRef, useState } from "react";
import { ensureUiStyles } from "./uiStyles";

/**
 * THE COLLAPSING LARGE TITLE.
 *
 * A page's own title, set large at the top of the content where there is room
 * for it, which hands off to a compact bar under the fixed nav once you have
 * scrolled past it. iOS's large-title navigation bar, and it is on this site
 * for a usability reason rather than a stylistic one.
 *
 * ── WHY IT EARNS ITS PLACE ─────────────────────────────────────────────────
 * The long read pages here are long: UserAgreement is 307 lines and carries
 * TWO h1s (`User Agreement`, then `Contractor Professional Terms` at :133), so
 * a person five screens down has no way to tell which document they are
 * reading. The numbered h2s make it worse, not better — "14. Limitation of
 * Liability" appears in both parts. That is the defect this fixes: the title
 * stays answerable for the whole scroll instead of only at the top.
 *
 * It is NOT a sticky section header and must not become one — it tracks h1s,
 * the documents on the page, never the h2s inside one.
 *
 * ── MULTIPLE TITLES ON ONE PAGE ────────────────────────────────────────────
 * UserAgreement is why this is handled rather than forbidden: two agreements
 * are published on one route, and a bar still saying `User Agreement` while
 * you read the Contractor Terms is worse than no bar, because it is a
 * confident wrong answer. So an instance shows its bar when its own title has
 * gone past the nav AND the NEXT one has not. That is read from the DOM at
 * measure time (`document.querySelectorAll` in document order) rather than
 * from a module registry, which means it needs no mount/unmount bookkeeping,
 * cannot go stale, and costs one query per animation frame on a page with two
 * matching elements. On a single-title page there is no next element and the
 * test is free.
 *
 * ── WHY A SEPARATE FIXED BAR, AND NOT THE NAV ──────────────────────────────
 * The obvious Apple move is to promote the title into the navigation bar
 * itself. That was rejected on measurement, not taste: TopNav is a fixed row
 * with the FREDDYFIXIT wordmark on the left and About us / Blog / Sign In on
 * the right, and it is ALREADY out of width on a phone — `Blog` carries
 * `small: false` and drops out under 460px for exactly this reason. Adding a
 * title between them either collides, or replaces the wordmark (an identity
 * change on every page, to solve a problem on four of them), or hides itself
 * at the width where the title is most useful. A second bar directly beneath
 * is honest about being a different thing: site chrome above, page chrome
 * below, in that reading order.
 *
 * ── WHY IT CANNOT GO ON THE DASHBOARDS ─────────────────────────────────────
 * ⚠️ Do not mount this on ClientDashboard / ContractorDashboard /
 * AdminDashboard. TopNav slides itself out of view on scroll-down there
 * (`ff-nav-hidden`, gated on `onSidebarDash`), so a bar parked at
 * `top: var(--ff-topnav-h)` would be left floating in the gap the nav just
 * vacated, with page content visible above it. The dashboards also already
 * solve this problem a better way: the pass at the top of the column says what
 * is happening, and the sidebar says where you are.
 *
 * ── THE MECHANISM, AND WHY EACH PART IS WHAT IT IS ─────────────────────────
 *   · The threshold is the large title's own bottom edge crossing the bottom
 *     of the nav, read from `--ff-topnav-h` (TopNav measures and publishes it;
 *     see the note there). Not a magic scroll offset — a page with an eyebrow
 *     line, or a phone at the 560px breakpoint, has a different number, and a
 *     constant would be wrong on both.
 *   · A passive scroll listener throttled to one rAF, which is the pattern
 *     TopNav already uses for `lifted`, rather than an IntersectionObserver.
 *     IO looks like the better tool until you need `rootMargin` in px, which
 *     means reading the same CSS variable and re-creating the observer every
 *     time it changes — more moving parts for the same answer.
 *   · HYSTERESIS: 8px of it. Without a dead band, parking the scroll exactly
 *     on the threshold makes a one-pixel wheel tick mount and unmount the bar
 *     repeatedly, which is both a flicker and a render loop.
 *   · The bar MOUNTS when stuck and unmounts when not, with an entrance
 *     animation and no exit. An exit animation needs a third "leaving" state
 *     and a timer to retire it, and there is nothing to look at anyway: by the
 *     time it leaves, the real title is back on screen, which is the whole
 *     reason it left.
 *   · `--ff-ease-out`, NOT `--ff-ease-spring`. The spring token is documented
 *     for one-shot entrances only, and this entrance happens on every scroll
 *     past the title — a bounce you meet twenty times is a twitch.
 *   · Reduced motion needs nothing here: the global block in main.tsx collapses
 *     every animation to 0.001ms, so the bar simply appears.
 *   · While a bar is stuck it puts `ff-ptitle-stuck` on <html>, which is how
 *     the nav above knows to give up its own bottom hairline and its shadow —
 *     a stack of chrome gets ONE separator, at the bottom of the stack. The
 *     rule itself lives in main.tsx beside the nav's other two border rules;
 *     see the long note there for why it is scoped to `.ff-nav-lifted`.
 */

/**
 * How many compact bars are stuck right now.
 *
 * ⚠️ THE COUNTER IS THE POINT, NOT BOOKKEEPING FOR ITS OWN SAKE. The class on
 * <html> has to mean "SOME bar is stuck", and UserAgreement hands off between
 * two instances inside a single commit: A's cleanup runs and B's effect runs
 * with no paint in between. A per-instance add/remove would have the two fight
 * over one class and the LOSER would win — remove-then-add leaves it on,
 * add-then-remove leaves it off, and nothing promises which order you get.
 * With a count the sequence is 1 → 0 → 1 and the answer is right either way.
 * Math.max floors it at 0 so a double cleanup (a StrictMode remount) cannot
 * drive it negative and strand the class on for the rest of the session.
 */
let stuckBars = 0;
function markStuck(on: boolean) {
  stuckBars = Math.max(0, stuckBars + (on ? 1 : -1));
  document.documentElement.classList.toggle("ff-ptitle-stuck", stuckBars > 0);
}

export function PageTitle({
  title,
  /** Small line ABOVE the title — a section or document kind. Optional. */
  eyebrow,
  /** The dateline / one-sentence standfirst UNDER the title. Optional. */
  children,
  /**
   * Overrides the compact bar's text. Use when the full title is too long to
   * read at a glance in a 44px bar on a phone — the compact form is a label,
   * not a restatement. Defaults to `title`.
   */
  compact,
  style,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
  compact?: string;
  style?: React.CSSProperties;
}) {
  ensureUiStyles();
  const h1Ref = useRef<HTMLHeadingElement | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = h1Ref.current;
    if (!el) return;
    let raf = 0;
    // Read the published nav height off the computed style rather than caching
    // it: it changes at the 560px breakpoint and on a text-size change, and
    // this runs once per frame at most, where getComputedStyle is cheap enough
    // and being wrong is not.
    const navH = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--ff-topnav-h");
      const n = parseFloat(v);
      // A unitless/empty/NaN read means the variable is missing or expressed in
      // something parseFloat cannot finish (rem, for the static fallback). 68px
      // is the desktop bar, and erring LARGE is the safe direction: too large
      // shows the title a little late, too small overlaps the nav.
      return Number.isFinite(n) && n > 0 && v.trim().endsWith("px") ? n : 68;
    };
    const measure = () => {
      raf = 0;
      const line = navH();
      const bottom = el.getBoundingClientRect().bottom;
      // The handoff. Every large title on the page, in document order; find this
      // one, look at the NEXT one. `indexOf` on the live list rather than a
      // counter, because the list is rebuilt each frame and the index is only
      // meaningful against the list it came from.
      //
      // `nextBottom` is the next title's bottom edge, or +Infinity when there is
      // no next title — which is the correct answer, not a sentinel hack: "the
      // next document has not yet reached the nav" is trivially true when there
      // is no next document, and +Infinity makes every comparison below say so
      // without a branch. A single-title page therefore runs the same code path.
      let nextBottom = Infinity;
      const all = document.querySelectorAll<HTMLElement>(".ffu-ptitle-h");
      const i = Array.prototype.indexOf.call(all, el);
      // i < 0 cannot normally happen (this element carries the class), but a
      // hidden/detached render would make it so, and treating "I am not in the
      // list" as "I have no successor" keeps the bar behaving like the
      // single-title case rather than vanishing.
      if (i >= 0 && i + 1 < all.length) nextBottom = all[i + 1].getBoundingClientRect().bottom;
      // Stuck means: my own title is above the line AND the next one is not yet.
      // Note the comparison is against `stuck` via the setState updater, so this
      // closure never needs `stuck` as a dependency and the listener is attached
      // exactly once.
      //
      // ⚠️ THE HYSTERESIS IS ON MY OWN EDGE ONLY, AND THE HANDOFF EDGE IS EXACT.
      // That asymmetry is deliberate and it is the whole correctness argument.
      // The 8px dead band exists to stop a one-pixel wheel tick mounting and
      // unmounting the bar repeatedly — a real hazard on my own edge, where the
      // alternative to a bar is nothing. On the handoff edge the alternative is
      // the NEXT bar, and that bar sticks on the un-hysteretic `bottom < line`,
      // because from its own point of view that edge is its entrance. Put a dead
      // band on the handoff and the two tests disagree for 8px: widen it one way
      // and neither bar is mounted through the gap, widen it the other and BOTH
      // are, stacked at the same `top`. Exact on both sides means they swap in
      // the same frame off the same number, so two bars can never coexist. The
      // residual flicker at that boundary is a swap between two bars of
      // identical geometry — a text change, not chrome appearing.
      setStuck(prev =>
        prev
          ? bottom > line + 8 || nextBottom < line
            ? false
            : true
          : bottom < line && nextBottom >= line
            ? true
            : false
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Publishing the stuck state to <html> is its OWN effect, keyed on `stuck`,
  // deliberately not folded into the measure effect above. That one is keyed on
  // [] so the scroll listener attaches exactly once; a class that must track a
  // changing value cannot live inside an effect that never re-runs.
  useEffect(() => {
    if (!stuck) return;
    markStuck(true);
    return () => markStuck(false);
  }, [stuck]);

  return (
    <>
      {stuck && (
        /* aria-hidden, and that is not a shortcut. The h1 below is the real,
           permanent heading in the accessibility tree; this bar is a visual
           restatement of it that comes and goes with the scroll position.
           Exposing it would put a second copy of the page title into the
           heading order, appearing and disappearing under a screen reader for
           reasons its user cannot perceive. */
        <div className="ffu-ptitle-bar" aria-hidden="true">
          <span className="ffu-ptitle-bar-t">{compact || title}</span>
        </div>
      )}
      <header className="ffu-ptitle" style={style}>
        {eyebrow ? <p className="ffu-ptitle-eyebrow">{eyebrow}</p> : null}
        <h1 ref={h1Ref} className="ffu-ptitle-h">{title}</h1>
        {children}
      </header>
    </>
  );
}

export default PageTitle;
