import type { Grade } from "@/lib/servicePricing";
import { gradeBlurb, gradeColor, gradeLabel } from "@/lib/servicePricing";

/**
 * The A+ / A / A- pill.
 *
 * Two different meanings share one component, so `kind` is required:
 *   kind="budget" — a contractor reading a job. A+ = client is paying above market.
 *   kind="pro"    — a client reading a contractor. A+ = this pro tends to come in under market.
 *
 * Both are price signals only. Quality lives in the star rating.
 */
export default function PriceGrade({
  grade,
  kind,
  showLabel = true,
  size = "md",
  title,
}: {
  grade: Grade | null | undefined;
  kind: "budget" | "pro";
  showLabel?: boolean;
  size?: "sm" | "md";
  title?: string;
}) {
  if (!grade) return null;
  const color = gradeColor(grade);
  const sm = size === "sm";
  return (
    <span
      title={title ?? gradeBlurb(grade, kind)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sm ? ".25rem" : ".35rem",
        padding: sm ? ".14rem .4rem" : ".2rem .5rem",
        borderRadius: "99px",
        background: color + "22",
        border: "1px solid " + color + "59",
        color,
        fontSize: sm ? ".64rem" : ".7rem",
        fontWeight: 800,
        letterSpacing: ".03em",
        lineHeight: 1.3,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontWeight: 900 }}>{grade}</span>
      {showLabel && (
        <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", opacity: 0.9 }}>
          {gradeLabel(grade, kind)}
        </span>
      )}
    </span>
  );
}
