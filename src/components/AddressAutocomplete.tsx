import { useEffect, useRef, useState } from "react";

// Keyless address autocomplete for Calgary addresses using Photon
// (photon.komoot.io), an open geocoder over OpenStreetMap data. No API key,
// no billing. If the network call fails for any reason the field silently
// degrades to a plain text input — the user can always just type.

// Bias results around central Calgary.
const CAL_LAT = 51.0447;
const CAL_LON = -114.0719;

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  id?: string;
  autoComplete?: string;
};

export default function AddressAutocomplete({ value, onChange, placeholder, style, id, autoComplete = "street-address" }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<any>(null);
  const skipNext = useRef(false); // don't re-search right after a pick

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return; }
    const q = value.trim();
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${CAL_LAT}&lon=${CAL_LON}&limit=6&lang=en`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const opts: string[] = (data.features || [])
          .map((f: any) => {
            const p = f.properties || {};
            const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(" ");
            const parts = [line1, p.city || p.county, p.state, p.postcode].filter(Boolean);
            return parts.join(", ");
          })
          .filter((x: string) => x.length > 0)
          // Prefer Alberta / Calgary-area results but keep others as fallback.
          .sort((a: string, b: string) => {
            const score = (s: string) => (/calgary/i.test(s) ? 0 : /alberta|AB/i.test(s) ? 1 : 2);
            return score(a) - score(b);
          });
        const uniq = Array.from(new Set(opts)).slice(0, 6);
        setSuggestions(uniq);
        setOpen(uniq.length > 0);
        setActive(-1);
      } catch {
        // Network/geocoder failure — fall back to plain typing, no suggestions.
        setSuggestions([]);
        setOpen(false);
      }
    }, 280);
    return () => clearTimeout(debounce.current);
  }, [value]);

  const pick = (s: string) => {
    skipNext.current = true;
    onChange(s);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        id={id}
        autoComplete={autoComplete}
        style={style}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "var(--ff-bg)", border: "1px solid rgba(var(--ff-fg), .15)", borderRadius: "10px",
          boxShadow: "0 12px 34px rgba(0,0,0,.4)", overflow: "hidden",
        }}>
          {suggestions.map((sug, i) => (
            <div
              key={sug}
              onMouseDown={e => { e.preventDefault(); pick(sug); }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: ".6rem .8rem", fontSize: ".85rem", cursor: "pointer",
                color: "var(--ff-text)",
                background: i === active ? "rgba(234,107,20,.14)" : "transparent",
                borderBottom: i < suggestions.length - 1 ? "1px solid rgba(var(--ff-fg), .06)" : "none",
              }}
            >{sug}</div>
          ))}
          <div style={{ padding: ".4rem .8rem", fontSize: ".68rem", color: "rgba(var(--ff-muted), .4)", textAlign: "right" }}>
            Powered by OpenStreetMap
          </div>
        </div>
      )}
    </div>
  );
}
