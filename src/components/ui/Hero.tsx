import React from "react";
import { cx } from "./uiStyles";

/**
 * The hero status sentence inside the pass. One line of plain English saying
 * what is happening: "Three pros have sent you estimates."
 *
 * ── WHY THIS IS DM SANS AND NOT BEBAS ───────────────────────────────────
 * The brand rule is that dashboards are a Bebas surface. This line is the one
 * deliberate exception, not an oversight. Bebas Neue is a condensed all-caps
 * display face — excellent for a four-word label, unreadable as a sentence.
 * The rule's own wording is "headings on pages you operate, plus all small
 * labels / chips / numerals / buttons"; a full sentence is none of those.
 * Everything else in the pass (wordmark, meta labels, meta values, state line)
 * is Bebas, so the surface still reads as Bebas.
 *
 * Owner reviewed this in the v2 preview ("looks good, fonts and all"), so
 * treat it as settled rather than re-litigating it per screen.
 */
export function Hero({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h1 className="ffu-hero" style={style}>
      {children}
    </h1>
  );
}

/** The supporting line under the hero. One sentence. Resist a second. */
export function HeroSub({ children }: { children: React.ReactNode }) {
  return <p className="ffu-herosub">{children}</p>;
}

/**
 * The meta strip at the bottom of the pass — two or three label/value pairs
 * (Pros bidding · Lowest estimate · Visit). Both halves are Bebas: these are
 * labels and numerals, which is precisely Bebas's job.
 *
 * Keep it to three. The strip is a flex row on a 372px phone, so a fourth item
 * either wraps or crushes the others, and this strip is the least important
 * thing in the pass — the hero sentence already said the important part.
 */
export function PassMeta({ children }: { children: React.ReactNode }) {
  return <div className="ffu-passmeta">{children}</div>;
}

export function PassMetaItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  /** Use at most once, and only when this number IS the thing the person came for. */
  accent?: boolean;
}) {
  return (
    <div>
      <span className="ffu-mk">{label}</span>
      <span className={cx("ffu-mv", accent && "ffu-accent")}>{value}</span>
    </div>
  );
}

export default Hero;
