import React from "react";
import { Ic } from "../Ic";
import { Row } from "./Sheet";

/**
 * "NEEDS YOUR ATTENTION" — the orange-bordered card at the top of the sheet
 * stack. Rows inside it are `<Row>`, so the geometry is identical to every
 * other row on the page and only the container differs.
 *
 * ── Two rules carried over from the existing dashboards ─────────────────
 *
 * 1. MONEY-GATING ROWS GO FIRST. A row that unblocks a payment outranks a row
 *    that asks for a photo, every time.
 *
 * 2. ONLY THE FIRST FEW RENDER — three on the client side, four on the
 *    contractor side. `max` enforces that here instead of each caller slicing
 *    its own array and disagreeing. A card listing eight things you must do is
 *    a card nobody reads.
 *
 * ── And one that bites ──────────────────────────────────────────────────
 * On the contractor side the attention rows are an `else if` chain, so a new
 * predicate that OVERLAPS an existing one must be inserted BEFORE the one it
 * overlaps or it can never fire. That ordering lives in the caller, not here.
 *
 * Returns null on an empty list. An "attention" card that says "nothing needs
 * your attention" is a permanent orange box training the person to ignore
 * orange boxes.
 */
export function AttentionCard({
  children,
  title = "NEEDS YOUR ATTENTION",
  max = 3,
}: {
  children: React.ReactNode;
  title?: string;
  max?: number;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;

  return (
    <div className="ffu-attn">
      <div className="ffu-attnhd">
        <Ic name="alert-triangle" size={14} />
        {title}
      </div>
      {rows.slice(0, max)}
    </div>
  );
}

/**
 * The reassurance line under a money row.
 *
 * Consumer-facing wording is "held securely", NEVER "escrow". That is a legal
 * position, not a style choice — see docs/legal.md on Alberta prepaid
 * contracting. Do not reword this toward "escrow" or "in trust".
 */
export function TrustLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="ffu-trust">
      <Ic name="check-circle" size={18} />
      <p>{children}</p>
    </div>
  );
}

export { Row };
export default AttentionCard;
