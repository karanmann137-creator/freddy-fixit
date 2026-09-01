// Theme + text-size preferences. Dark is the default; light is opt-in.
// Applied to <html> via data-theme + a --ff-font-scale custom property.
export type Theme = "dark" | "light";

const THEME_KEY = "ff_theme";
const SCALE_KEY = "ff_text_scale";
// One-shot marker for the light-mode peek (see lightPeekEligible below).
const PEEK_KEY = "ff_light_peek";

// Default is now the previous "Large" (1.1). Everything is rem-based off
// `html { font-size: calc(100% * var(--ff-font-scale)) }`, so this scales the
// entire type system proportionally.
export const DEFAULT_SCALE = 1.1;
export const TEXT_SCALES = [1, 1.1, 1.25, 1.4] as const; // Small / Default / Large / Largest
export const SCALE_LABELS: Record<number, string> = { 1: "Small", 1.1: "Default", 1.25: "Large", 1.4: "Largest" };

export function getTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}
export function getTextScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(SCALE_KEY) || String(DEFAULT_SCALE));
    return TEXT_SCALES.includes(v as any) ? v : DEFAULT_SCALE;
  } catch { return DEFAULT_SCALE; }
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

// ---------------------------------------------------------------------------
// The light-mode peek (TopNav).
//
// A first-time, signed-out visitor who walks from the home page into About us
// or the Blog is shown the site in light mode once, with a small prompt beside
// the settings gear telling them what just happened and how to change it back.
// Light mode exists so somebody can read a contract or an article in daylight,
// and those two pages are the reading surfaces — but nobody discovers a setting
// buried behind a gear icon, so it was effectively invisible.
//
// Two refusals make this safe, and both matter more than the feature does:
//
//   * `hasThemePreference()` — if there is ANY value under `ff_theme`, somebody
//     has already chosen a theme in Settings and we never override a deliberate
//     choice. Absence of the key is the only signal that they haven't decided.
//
//   * On ANY localStorage failure both helpers answer in the direction that
//     STOPS the peek (preference "exists", eligible false). Safari's private
//     mode throws on write, so a peek that fired there could never record that
//     it had fired — it would re-fire and re-flip the theme on every single
//     navigation, forever. An unreadable answer is a refusal, never a peek.
export function hasThemePreference(): boolean {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark";
  } catch { return true; }
}
export function lightPeekEligible(): boolean {
  try {
    if (localStorage.getItem(PEEK_KEY)) return false;
    return !hasThemePreference();
  } catch { return false; }
}
// Claim BEFORE showing, never after — the same claim-then-act shape the
// reminder emitters use. A crash between "shown" and "recorded" should cost
// the user the prompt, not trap them in a loop that keeps re-theming the site.
export function markLightPeekUsed() {
  try { localStorage.setItem(PEEK_KEY, "1"); } catch { /* see above */ }
}

// Call once, as early as possible, to avoid a flash of the wrong theme.
export function initPrefs() {
  applyTheme(getTheme());
  applyTextScale(getTextScale());
}
