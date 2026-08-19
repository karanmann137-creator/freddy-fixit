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
      <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>
        <Ic name={iconName as any} size={20} color="#ea6b14" style={{ marginRight: 8, flexShrink: 0 }} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: ".68rem", color: "rgba(var(--ff-muted), .55)", marginTop: "1px" }}>{hint}</span>}
      </span>
      {selected.includes(label) && <span style={{ marginLeft: "auto", color: "#ea6b14", fontSize: "1rem" }}>✓</span>}
    </button>
  );

  return (
    <div>
      <div style={{ position: "relative", marginBottom: ".75rem" }}>
        <span style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
          <Ic name="search" size={18} color="#ea6b14" />
        </span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && canAddCustom) { e.preventDefault(); addCustom(); } }}
          onFocus={e => { e.currentTarget.style.borderColor = "#ea6b14"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(234,107,20,.15)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "rgba(234,107,20,.45)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,.06)"; }}
          placeholder={placeholder || "Search a service (e.g. plumbing, moving, junk removal)…"}
          aria-label="Search services"
          style={{
            width: "100%", boxSizing: "border-box", padding: ".95rem 1rem .95rem 2.6rem", borderRadius: "12px",
            background: "rgba(var(--ff-fg), .06)", border: "1.5px solid rgba(234,107,20,.45)", color: "var(--ff-text)",
            fontFamily: "inherit", fontSize: "1rem", fontWeight: 500, outline: "none",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)", transition: "border-color .15s, box-shadow .15s",
          }} />
      </div>

      {canAddCustom && (
        <button type="button" onClick={addCustom}
          style={{
            width: "100%", textAlign: "left", padding: ".7rem .9rem", marginBottom: ".75rem", borderRadius: "10px", cursor: "pointer",
            background: "rgba(234,107,20,.1)", border: "1px dashed rgba(234,107,20,.5)", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".85rem",
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

const svcBtn: CSSProperties = { display: "flex", alignItems: "center", gap: ".65rem", padding: ".9rem 1rem", background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: "10px", color: "rgba(var(--ff-muted), .8)", fontFamily: "inherit", fontSize: ".88rem", cursor: "pointer", textAlign: "left", width: "100%" };
const svcBtnSel: CSSProperties = { background: "rgba(234,107,20,.12)", borderColor: "rgba(234,107,20,.5)", color: "var(--ff-text)" };
