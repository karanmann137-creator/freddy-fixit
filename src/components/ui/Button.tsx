import React from "react";
import { cx } from "./uiStyles";

/**
 * ── The press ───────────────────────────────────────────────────────────
 * scale(0.97), and ASYMMETRIC: .16s on the way back up, .1s on the way down.
 * That asymmetry is the whole feel — a symmetric press reads as mushy. It
 * matches the three existing `.ffdash` copies in AdminDashboard,
 * ClientDashboard and ContractorDashboard, which CLAUDE.md requires to stay
 * byte-identical to each other. The point of this component is that there is
 * eventually ONE copy instead of four.
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
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cx("ffu-btn", v, full && "ffu-full", className)}
      style={style}
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
