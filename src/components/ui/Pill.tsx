import React from "react";
import { cx } from "./uiStyles";

/**
 * A small Bebas status chip. Bebas is exactly right here — this is a label of
 * one or two words, which is the face's job.
 *
 * Tones map to meaning, never to decoration:
 *   accent   needs you
 *   good     settled / verified / paid
 *   warn     in review, expiring, pending us
 *   danger   failed, declined, disputed
 *   neutral  plain metadata with no urgency at all
 *
 * "neutral" is the right answer far more often than it feels like it is. A row
 * where three pills are three different colours has no hierarchy, and the
 * accent tone in particular is on the same budget as the state line — if the
 * screen's state line is already orange, a second orange pill spends a
 * signal that was already spoken for.
 */
export type PillTone = "accent" | "good" | "warn" | "danger" | "neutral";

const TONE: Record<PillTone, string> = {
  accent: "ffu-a",
  good: "ffu-g",
  warn: "ffu-w",
  danger: "ffu-d",
  neutral: "ffu-n",
};

export function Pill({
  tone = "neutral",
  children,
  style,
}: {
  tone?: PillTone;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cx("ffu-pill", TONE[tone])} style={style}>
      {children}
    </span>
  );
}

export default Pill;
