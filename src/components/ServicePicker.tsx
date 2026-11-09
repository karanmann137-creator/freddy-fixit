import { useState, type CSSProperties } from "react";
import { Ic } from "@/components/Ic";
import { fromText } from "@/lib/servicePricing";

type Item = { iconName: string; label: string };

// Searchable service picker: type to filter the tiles instead of scrolling the
// long list, and if nothing matches you can add your own service (e.g. Moving,
// or anything we don't list yet). Shared by ClientOnboarding + NewRequest.
export default function ServicePicker({
  items, selected, onToggle, pricing, allowCustom = true, placeholder,
}: {
  items: Item[];
  selected: string[];
  onToggle: (label: string) => void;
  pricing?: Record<string, any>;
  // Contractors pass allowCustom={false}: a specialty that isn't in
  // service_specialty_map matches no client request, so letting a pro invent
  // one would quietly hand them a trade we never send them jobs for.
  allowCustom?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query ? items.filter(i => i.label.toLowerCase().includes(query)) : items;
  // Selected labels not in the standard list = custom entries; always show them so they stay removable.
  const customSelected = selected.filter(l => !items.some(i => i.label === l));
  const exactExists =
    items.some(i => i.label.toLowerCase() === query) || selected.some(l => l.toLowerCase() === query);
  const canAddCustom = allowCustom && query.length >= 2 && !exactExists;

  const addCustom = () => {
    const label = q.trim();
    if (label.length < 2) return;
    if (!selected.some(l => l.toLowerCase() === label.toLowerCase())) onToggle(label);
    setQ("");
  };

  const tile = (iconName: string, label: string, hint?: string) => (
    <button key={label} type="button" onClick={() => onToggle(label)}
      style={{ ...svcBtn, ...(selected.includes(label) ? svcBtnSel : {}) }}>
      {/* color here, not color= on <Ic> — see the note on the search icon. */}
      <span style={{ fontSize: "1.2rem", flexShrink: 0, color: "var(--ff-c10)" }}>
        <Ic name={iconName as any} size={20} style={{ marginRight: 8, flexShrink: 0 }} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: ".68rem", color: "rgba(var(--ff-muted), .55)", marginTop: "1px" }}>{hint}</span>}
      </span>
      {selected.includes(label) && <span style={{ marginLeft: "auto", color: "var(--ff-c10)", fontSize: "1rem" }}>✓</span>}
    </button>
  );

  return (
    <div>
      {/* ── Why this input gets a stylesheet instead of inline styles ────────
          Until 2026-11-08 the focus state here was built out of outline:"none"
          plus an onFocus/onBlur pair that imperatively assigned borderColor and
          boxShadow. Three things were wrong with that, and all three are the
          reason the rule now lives in CSS:

          1. outline:"none" with no :focus-visible rule beside it is how you
             delete keyboard access. It was survivable here only because the
             handlers happened to draw a ring themselves — i.e. the mitigation
             was two event handlers away from the thing it mitigated, and
             deleting either one silently removed the focus indicator.
          2. The handlers RESTORE hard-coded values on blur, so the blur branch
             was a second, drifting copy of the input's resting style. Change
             the border in the style object and the field changes appearance
             the first time it is focused and blurred.
          3. The hard-coded var(--ff-c10) is the dark-mode orange. In light mode the
             brand orange is #d65f10, so focusing this field painted the wrong
             orange on the off-white ground. Tokens fix that for free.

          :focus rather than :focus-visible for the border and shadow, which is
          correct for a TEXT FIELD specifically: a text input should look
          focused when you click into it, because you are about to type. The
          keyboard-only ring is layered on top with :focus-visible. */}
      <style>{
        ".ff-svc-q{ transition: border-color .15s var(--ff-ease-out), box-shadow .15s var(--ff-ease-out); }" +
        ".ff-svc-q:focus{ border-color: var(--ff-c10); box-shadow: 0 0 0 3px var(--ff-accent-soft); }" +
        ".ff-svc-q:focus-visible{ outline: 2px solid var(--ff-accent-400); outline-offset: 2px; }"
      }</style>
      <div style={{ position: "relative", marginBottom: ".75rem" }}>
        {/* color on the wrapper, not a color prop on <Ic>. Ic renders its glyph
            with stroke={color}, an SVG PRESENTATION ATTRIBUTE — var() in a
            presentation attribute is supported unevenly enough that a token
            passed that way can resolve to nothing and draw an invisible icon.
            currentColor inherits through the attribute reliably, so the token
            is set here in CSS where it is guaranteed to resolve. */}
        <span style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex", color: "var(--ff-c10)" }}>
          <Ic name="search" size={18} />
        </span>
        <input
          className="ff-svc-q"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && canAddCustom) { e.preventDefault(); addCustom(); } }}
          placeholder={placeholder || "Search a service (e.g. plumbing, moving, junk removal)…"}
          aria-label="Search services"
          style={{
            width: "100%", boxSizing: "border-box", padding: ".95rem 1rem .95rem 2.6rem", borderRadius: "var(--ff-r2)",
            background: "rgba(var(--ff-fg), .06)", border: "1.5px solid var(--ff-accent-line)", color: "var(--ff-text)",
            fontFamily: "inherit", fontSize: "1rem", fontWeight: 500,
            boxShadow: "var(--ff-mat-1)",
          }} />
      </div>

      {canAddCustom && (
        <button type="button" onClick={addCustom}
          style={{
            width: "100%", textAlign: "left", padding: ".7rem .9rem", marginBottom: ".75rem", borderRadius: "var(--ff-r1)", cursor: "pointer",
            background: "var(--ff-accent-soft)", border: "1px dashed var(--ff-accent-line)", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".85rem",
          }}>
          + Use “{q.trim()}” as your service
        </button>
      )}

      <div style={{ maxWidth: "100%", overflowX: "hidden", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: ".75rem" }}>
        {customSelected.map(l => tile("package", l))}
        {filtered.map(i => tile(i.iconName, i.label, pricing ? fromText(pricing[i.label]) : undefined))}
      </div>

      {filtered.length === 0 && !canAddCustom && (
        <p style={{ fontSize: ".8rem", color: "rgba(var(--ff-muted), .55)", marginTop: ".5rem" }}>
          {allowCustom
            ? "No match. Type at least 2 letters to add your own service."
            : "No match — try a shorter word, or clear the search to see the full list."}
        </p>
      )}
    </div>
  );
}

const svcBtn: CSSProperties = { display: "flex", alignItems: "center", gap: ".65rem", padding: ".9rem 1rem", background: "rgba(var(--ff-fg), .04)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius: "10px", color: "rgba(var(--ff-muted), .8)", fontFamily: "inherit", fontSize: ".88rem", cursor: "pointer", textAlign: "left", width: "100%" };
const svcBtnSel: CSSProperties = { background: "rgba(var(--ff-accent-rgb), .12)", borderColor: "rgba(var(--ff-accent-rgb), .5)", color: "var(--ff-text)" };
