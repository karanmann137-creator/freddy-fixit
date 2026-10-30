import React from "react";
import { cx } from "./uiStyles";

/**
 * THE JOB SWITCHER — the hole this closes was reported by the owner directly:
 * "there is no way to access other jobs if a client has posted more than one
 * job." The dashboard rendered one job and offered no route to the rest.
 *
 * ── Why each chip carries a state dot ───────────────────────────────────
 * The rail's whole value is that you can see WHICH job wants you without
 * opening any of them. A rail of identical chips is a worse tab bar; a rail
 * where one chip has an orange dot is an answer. Orange = this job is on you,
 * green = settled, hollow = waiting on someone else.
 *
 * This is the one place the "orange exactly once per screen" rule is relaxed,
 * and only in the narrow sense that two jobs can genuinely both want you at
 * once. Within a single job's screen the rule stands.
 *
 * ── Render it only when it earns its space ──────────────────────────────
 * With a single job the rail is pure noise — one chip plus a "+ New" button
 * where the hero sentence should be. `JobSwitcher` returns null for fewer than
 * two jobs unless `alwaysShow` is set, so callers do not each need to
 * re-derive that condition and disagree about it.
 */
export type SwitcherJob = {
  id: string;
  /** Keep it short — this is a chip, not a title. "Furnace", "Kitchen tap". */
  label: string;
  /** "turn" paints an orange dot, "ok" green, "wait" a hollow ring. */
  state?: "turn" | "ok" | "wait";
};

export function JobSwitcher({
  jobs,
  activeId,
  onSelect,
  onNew,
  alwaysShow,
}: {
  jobs: SwitcherJob[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  /** Omit to hide the "+ New" chip. */
  onNew?: () => void;
  alwaysShow?: boolean;
}) {
  if (!alwaysShow && jobs.length < 2) return null;

  return (
    <div className="ffu-jobsw" role="tablist" aria-label="Your jobs">
      {jobs.map((j) => (
        <button
          key={j.id}
          type="button"
          role="tab"
          aria-selected={j.id === activeId}
          className={cx("ffu-jobchip", "ff-tap-auto", j.id === activeId && "ffu-on")}
          onClick={() => onSelect(j.id)}
        >
          <i
            className={cx(
              j.state === "turn" && "ffu-turn",
              j.state === "ok" && "ffu-ok"
            )}
          />
          {j.label}
        </button>
      ))}
      {onNew && (
        <button type="button" className="ffu-jobchip ffu-add ff-tap-auto" onClick={onNew}>
          + NEW
        </button>
      )}
    </div>
  );
}

export default JobSwitcher;
