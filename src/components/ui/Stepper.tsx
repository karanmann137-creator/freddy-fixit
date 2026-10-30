import React from "react";
import { cx } from "./uiStyles";
import { Ic } from "../Ic";

/**
 * THE STEPPER — "what's left" on a job.
 *
 * It lives inside a Group, as one block among others. It is deliberately NOT
 * the structure of the page: concept B made the whole dashboard a timeline,
 * which reads well on a job that is mid-flight and reads as a wall of grey
 * "todo" rows on a job that has just been posted. Folded into a group it says
 * what is left without claiming the whole screen.
 *
 * ── The connector is absolutely positioned, and that matters ────────────
 * v1 drew the line between dots with `margin: 3px 0 -0.6rem`, so the geometry
 * depended on the text height of the step above it — a two-line step broke the
 * line, a one-line step left a gap. The CSS now pins it top:34px / bottom:-10px
 * off the dot, which cannot drift no matter how the label wraps. If you ever
 * change the dot size, change those two numbers with it.
 */
export type StepState = "done" | "now" | "todo" | "review";

export type Step = {
  title: React.ReactNode;
  sub?: React.ReactNode;
  state: StepState;
};

const DOT: Record<StepState, string> = {
  done: "ffu-ok",
  now: "ffu-now",
  todo: "ffu-todo",
  review: "ffu-rev",
};

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="ffu-steps">
      {steps.map((s, i) => (
        <div key={i} className={cx("ffu-step", s.state === "todo" && "ffu-todo")}>
          <span className={cx("ffu-dot", DOT[s.state])}>
            {s.state === "done" && <Ic name="check" size={11} color="currentColor" />}
          </span>
          <span className="ffu-st">
            <b>{s.title}</b>
            {s.sub ? <span>{s.sub}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Stepper;
