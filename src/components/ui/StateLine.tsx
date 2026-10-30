import React from "react";
import { cx } from "./uiStyles";

/**
 * Four states, and only four, by design:
 *
 *   "turn"   it is on YOU. Orange.
 *   "wait"   it is on them. Neutral — deliberately NOT orange.
 *   "ok"     done / settled. Green.
 *   "review" we are looking at it (contractor vetting, dispute). Amber.
 *
 * ── THE RULE THIS COMPONENT EXISTS TO ENFORCE ───────────────────────────
 * Orange appears EXACTLY ONCE per screen, and only when the answer is "you".
 * A screen where the client is waiting on a pro to accept has no orange on it
 * anywhere. That is not an aesthetic preference — it is what makes the orange
 * legible as a call to action on the screens that do have it. The old
 * dashboards used orange for headings, dividers, icons, stat numbers and
 * background glows, so nothing read as important because everything did.
 *
 * If you find yourself wanting a second orange thing on a screen, the answer
 * is "wait" or a neutral pill, not a second accent.
 *
 * `pulse` animates the dot. Reserve it for "turn" — a pulsing dot on a state
 * the person cannot act on is an alarm with no off switch. main.tsx flattens
 * it to nothing under prefers-reduced-motion.
 */
export type State = "turn" | "wait" | "ok" | "review";

const CLS: Record<State, string> = {
  turn: "ffu-turn",
  wait: "ffu-wait",
  ok: "ffu-ok",
  review: "ffu-rev",
};

export function StateLine({
  state,
  children,
  pulse,
  style,
}: {
  state: State;
  children: React.ReactNode;
  pulse?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cx("ffu-stateline", CLS[state])} style={style}>
      <i className={cx("ffu-sdot", pulse && "ffu-pulse")} />
      {children}
    </span>
  );
}

export default StateLine;
