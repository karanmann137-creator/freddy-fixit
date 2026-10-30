import React from "react";
import { cx } from "./uiStyles";
import { Mark } from "./Mark";

/**
 * THE PASS — the navy header block at the top of every dashboard screen.
 *
 * What it is for: it answers "is this on me or on them" before anything
 * scrolls. Everything inside it is state, not navigation. The grouped sheets
 * below it carry the actions.
 *
 * ── The light-mode question, and why it is one prop ──────────────────────
 * `forceNavy` (default true) adds `ff-on-dark ff-anchor`. main.tsx scopes
 * .ff-on-dark's forced-navy token block to dark mode by default, and
 * `.ff-anchor` is the dormant modifier that opts a band back into forced navy
 * under light mode. It was left in place in Aug 2026 specifically "in case a
 * future band genuinely needs a forced-navy exception" — this is that band.
 *
 * So the pass is navy in BOTH themes today. If the owner decides it should
 * follow light mode instead, that is `forceNavy={false}` and nothing else:
 * every colour inside resolves through tokens, so the whole subtree re-themes
 * with no per-element change. Do not hard-code #111827 anywhere inside and
 * take that switch away.
 */
export function Pass({
  children,
  forceNavy = true,
  className,
  style,
}: {
  children: React.ReactNode;
  forceNavy?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cx("ffu-pass", forceNavy && "ff-on-dark ff-anchor", className)}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * The row at the very top of the pass: mark, wordmark, spacer, then whatever
 * controls the caller passes (bell, avatar, settings).
 *
 * The wordmark is Bebas — it is a logotype, which is exactly what Bebas is for.
 * The hero sentence below it is not, and uses DM Sans. See Hero.tsx.
 */
export function PassTop({
  children,
  showWordmark = true,
  markSize = 34,
}: {
  children?: React.ReactNode;
  showWordmark?: boolean;
  markSize?: number;
}) {
  return (
    <div className="ffu-passtop">
      <Mark size={markSize} />
      {showWordmark && (
        <span className="ffu-wordmark">
          FREDDY <em>FIX IT</em>
        </span>
      )}
      <span className="ffu-sp" />
      {children}
    </div>
  );
}

/**
 * A circular icon control for the pass top. `badge` is the unread count.
 *
 * The count is rendered as a string the caller controls rather than a number,
 * so "9+" is expressible — an unread badge that renders "127" is wider than
 * the button it sits on.
 */
export function IconButton({
  label,
  badge,
  onClick,
  children,
}: {
  label: string;
  badge?: string | number | null;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="ffu-iconbtn ff-tap" aria-label={label} onClick={onClick}>
      {children}
      {badge !== null && badge !== undefined && badge !== 0 && badge !== "" && (
        <span className="ffu-bdg">{badge}</span>
      )}
    </button>
  );
}

export default Pass;
