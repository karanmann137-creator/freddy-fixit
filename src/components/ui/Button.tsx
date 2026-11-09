import React from "react";
import { cx } from "./uiStyles";

/**
 * ── The press ───────────────────────────────────────────────────────────
 * scale(0.97), and ASYMMETRIC — a symmetric press reads as mushy. The numbers
 * are NOT here, on purpose: they live in uiStyles.ts with the rule that
 * implements them (.ffu-btn at :401, and the long argument at :377-399 for why
 * the downstroke overrides the timing function). Read them there.
 *
 * ⚠️ This docblock used to restate them as ".16s up, .1s down" and was STALE —
 * the release moved to .34s var(--ff-ease-spring) on 2026-11-08 and nothing
 * pointed the comment at it. That is the general hazard with a number copied
 * into prose beside the code it describes: it reads as authoritative, it is
 * checked by nothing, and the next person trusts it over the stylesheet. A
 * comment near a value should say WHERE the value lives, not what it is.
 *
 * ⚠️ AND THE PRESS HAS NOW DIVERGED FROM THE DASHBOARDS. The three `.ffdash`
 * copies in AdminDashboard, ClientDashboard and ContractorDashboard are still
 * the original `transform .16s var(--ff-ease-out)` with `.1s` on :active —
 * byte-identical to each other, as CLAUDE.md requires, but no longer the same
 * feel as this component. The spring went onto the primitive only.
 *
 * That is a state to resolve, not to leave: the goal was always ONE copy
 * instead of four, and a button that settles differently depending on whether
 * it came from here or from the page's own sheet is the thing a shared
 * primitive exists to prevent. Resolving it means deciding whether the spring
 * is right for a dashboard — where presses are frequent and utilitarian, and
 * an overshoot met fifty times a session is a different proposition from one
 * met on a landing page. Do not "sync" the three sheets to the spring without
 * answering that; and if the answer is yes, all three move in one edit.
 *
 * ── `loading` and why it does not just set disabled ─────────────────────
 * A disabled button with no spinner is indistinguishable from a broken one, so
 * `loading` renders the shared .ff-btn-spin from main.tsx AND blocks the click.
 * Keep the label visible underneath it: swapping the label for a spinner
 * collapses the button's width mid-interaction and shifts whatever is beside
 * it.
 */
export function Button({
  variant = "secondary",
  full,
  loading,
  disabled,
  onClick,
  type = "button",
  children,
  style,
  className,
  id,
  title,
  "aria-label": ariaLabel,
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Stretch to the container. The default is intrinsic width. */
  full?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /**
   * A stable id for focusJobAnchor / ringAnchor — the same contract as Row's.
   * Anchors are bare ids, deliberately NOT keyed per job: exactly one card is
   * expanded at a time and the pulse compares the anchor by string, so keying
   * them per job silently breaks the ring. Set it on EVERY render branch
   * including loading, or the scroll target vanishes while data is in flight.
   *
   * ⚠️ ADDED 2026-11-08, and its absence was blocking rather than cosmetic: a
   * hand-rolled button carrying an attention anchor could not be ported here
   * without silently dropping the anchor. A dropped anchor throws nothing —
   * the attention row still renders, the click still scrolls somewhere, and
   * the control it was meant to land on just never gets the ring. Same
   * absence class as the pulse keyframes Admin never had.
   */
  id?: string;
  /** The native tooltip. NOT a substitute for aria-label on an icon button. */
  title?: string;
  "aria-label"?: string;
}) {
  const v =
    variant === "primary" ? "ffu-pri"
    : variant === "ghost" ? "ffu-ghost"
    : variant === "danger" ? "ffu-danger"
    : "ffu-sec";

  return (
    <button
      type={type}
      id={id}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cx("ffu-btn", v, full && "ffu-full", className)}
      style={{ scrollMarginTop: "5.5rem", ...style }}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <span className="ff-btn-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Two side-by-side buttons. `repeat(2, minmax(0,1fr))` — a bare 1fr is
 * minmax(auto,1fr) and refuses to shrink below its content, so a long Bebas
 * label on one side pushes the pair off the edge of a phone.
 *
 * Put the primary on the RIGHT. Reading order ends where the thumb is.
 */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="ffu-btnrow">{children}</div>;
}

/** Vertically stacked full-width buttons, primary first. */
export function Stack({ children }: { children: React.ReactNode }) {
  return <div className="ffu-stack">{children}</div>;
}

export default Button;
