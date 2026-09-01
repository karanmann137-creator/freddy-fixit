import { Ic } from "@/components/Ic";

/**
 * The one search box, shared by all three dashboards so they can't drift.
 *
 * `fontSize` is `.95rem` and NOT the codebase's habitual `.85rem`. With
 * `--ff-font-scale` at 1.1 that habitual value computes to ~15px, one pixel
 * under the threshold at which iOS Safari zooms the viewport on focus and never
 * zooms back out. `main.tsx` carries an `!important` floor inside its
 * `@media (pointer: coarse)` block that would rescue it on a phone, but the
 * right size here is right on every device rather than only where the media
 * query applies.
 *
 * The clear button is `type="button"`: some dashboards sit inside a real
 * `<form>`, where a bare `<button>` defaults to submit.
 */
export default function DashSearch({
  value, onChange, placeholder, resultText,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** e.g. "3 of 11 shown" — rendered only while a query is active. */
  resultText?: string;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: ".55rem",
        padding: ".55rem .75rem", borderRadius: "12px",
        background: "rgba(var(--ff-fg), .05)",
        border: "1px solid rgba(var(--ff-fg), .12)",
      }}>
        <span style={{ color: "rgb(var(--ff-muted))", display: "flex", flexShrink: 0 }}>
          <Ic name="search" size={15} />
        </span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{
            flex: 1, minWidth: 0, background: "none", border: "none", outline: "none",
            color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".95rem",
          }}
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            style={{
              background: "none", border: "none", color: "rgb(var(--ff-muted))",
              fontSize: "1.2rem", lineHeight: 1, cursor: "pointer", padding: "0 .2rem", flexShrink: 0,
            }}
          >&times;</button>
        )}
      </div>
      {value !== "" && resultText && (
        <div style={{ fontSize: ".78rem", color: "rgb(var(--ff-muted))", margin: ".4rem 0 0 .2rem" }}>
          {resultText}
        </div>
      )}
    </div>
  );
}
