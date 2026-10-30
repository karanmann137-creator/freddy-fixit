import React from "react";
import { cx } from "./uiStyles";
import { Ic, type IconName } from "../Ic";

/**
 * THE SHEET — an inset group of rows, with a Bebas caption above it.
 *
 * This replaces the free-floating cards the dashboards used. The problem with
 * cards was not that they looked bad individually; it was that every card
 * invented its own padding, so no two of them lined up and the page read as a
 * pile rather than a document. A sheet has one border, one radius and one
 * inset, and the rows inside it are separated by hairlines rather than by gaps.
 *
 * ── The one geometry rule ───────────────────────────────────────────────
 * A row's separator starts where its TEXT starts, not where the row starts —
 * `left: calc(--ff-s4 + --ff-gut)`. The icon column is exactly --ff-gut wide.
 * Both read the same token, which is what makes it impossible for a hairline
 * to disagree with the column above it. That misalignment was one of the six
 * defects the owner called out by eye in v1.
 */

/** Caption + optional trailing action, then the sheet. */
export function Group({
  label,
  action,
  children,
  style,
}: {
  label?: string;
  /** Right-aligned affordance in the caption row — "See all", a count, a link. */
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="ffu-grp" style={style}>
      {(label || action) && (
        <div className="ffu-grplbl">
          {label}
          <span className="ffu-sp" />
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Sheet({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cx("ffu-sheet", className)} style={style}>
      {children}
    </div>
  );
}

export type RowTone = "accent" | "good" | "warn" | "neutral";

const TONE: Record<RowTone, string> = {
  accent: "",
  good: "ffu-g",
  warn: "ffu-w",
  neutral: "ffu-n",
};

/**
 * One row. Renders as a <button> when `onClick` is given and a <div>
 * otherwise, because a non-interactive row rendered as a button is announced
 * as pressable to a screen reader and is reachable by Tab for no reason.
 *
 * `title` is the line you read; `sub` is the detail. `right` is the trailing
 * value (an amount, a date, a pill). Pass `amount` instead of `right` when the
 * trailing value is money — it gets the brighter ink, because on a row that
 * says "Deposit due" the number IS the content.
 */
export function Row({
  icon,
  tone = "accent",
  title,
  sub,
  right,
  amount,
  chevron,
  active,
  onClick,
  id,
  style,
}: {
  icon?: IconName;
  tone?: RowTone;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  amount?: React.ReactNode;
  chevron?: boolean;
  active?: boolean;
  onClick?: () => void;
  /**
   * A stable id for focusJobAnchor / ringAnchor. Anchors are bare ids, NOT
   * keyed per job — exactly one card is expanded at a time and the pulse
   * compares the anchor by string, so keying them per job silently breaks the
   * ring. Set this on EVERY render branch including loading, or a scroll
   * target disappears while the data is in flight.
   */
  id?: string;
  style?: React.CSSProperties;
}) {
  const body = (
    <>
      <span className="ffu-ri-wrap">
        {icon ? (
          <span className={cx("ffu-ri", TONE[tone])}>
            <Ic name={icon} size={15} />
          </span>
        ) : null}
      </span>
      <span className="ffu-rt">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
      <span className="ffu-rr">
        {amount ? <span className="ffu-amt">{amount}</span> : null}
        {right}
        {chevron ? <Ic name="chevron-down" size={15} style={{ transform: "rotate(-90deg)", opacity: 0.4 }} /> : null}
      </span>
    </>
  );

  const cls = cx("ffu-row", active && "ffu-active");
  // scrollMarginTop clears the fixed 3.75rem nav the dashboards render a spacer
  // for — without it an anchored scroll parks the row underneath the bar.
  const sty: React.CSSProperties = { scrollMarginTop: "5.5rem", ...style };

  if (onClick) {
    return (
      <button type="button" id={id} className={cls} style={sty} onClick={onClick}>
        {body}
      </button>
    );
  }
  return (
    <div id={id} className={cls} style={sty}>
      {body}
    </div>
  );
}

export default Sheet;
