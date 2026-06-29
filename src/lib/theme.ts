// Theme + text-size preferences. Dark is the default; light is opt-in.
// Applied to <html> via data-theme + a --ff-font-scale custom property.
export type Theme = "dark" | "light";

const THEME_KEY = "ff_theme";
const SCALE_KEY = "ff_text_scale";

export const TEXT_SCALES = [0.9, 1, 1.1, 1.25] as const; // Small / Default / Large / Larger
export const SCALE_LABELS: Record<number, string> = { 0.9: "Small", 1: "Default", 1.1: "Large", 1.25: "Largest" };

export function getTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}
export function getTextScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(SCALE_KEY) || "1");
    return TEXT_SCALES.includes(v as any) ? v : 1;
  } catch { return 1; }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
}
export function applyTextScale(scale: number) {
  document.documentElement.style.setProperty("--ff-font-scale", String(scale));
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent("ff:prefs-changed"));
}
export function setTextScale(scale: number) {
  try { localStorage.setItem(SCALE_KEY, String(scale)); } catch {}
  applyTextScale(scale);
  window.dispatchEvent(new CustomEvent("ff:prefs-changed"));
}

// Call once, as early as possible, to avoid a flash of the wrong theme.
export function initPrefs() {
  applyTheme(getTheme());
  applyTextScale(getTextScale());
}
