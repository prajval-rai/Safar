import type { ColorMode, ThemeId } from "./types";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  /** Plain-language description — no design jargon on the settings screen. */
  blurb: string;
  /** Swatches shown in the picker: [brand, accent, canvas]. */
  swatch: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "saffron",
    name: "Saffron Sunrise",
    blurb: "Warm orange and teal — the default Safar look.",
    swatch: ["#c2410c", "#0f766e", "#fdf7f0"],
  },
  {
    id: "peacock",
    name: "Peacock Teal",
    blurb: "Cool teal with a gold accent.",
    swatch: ["#0d6e6a", "#b45309", "#f2f8f7"],
  },
  {
    id: "backwater",
    name: "Kerala Backwater",
    blurb: "Deep green, like the coconut groves.",
    swatch: ["#1f7a43", "#b45309", "#f4f8f1"],
  },
  {
    id: "terracotta",
    name: "Rajasthan Terracotta",
    blurb: "Clay red and desert gold.",
    swatch: ["#a63a23", "#8a6d1f", "#fbf4ec"],
  },
  {
    id: "himalaya",
    name: "Himalayan Dusk",
    blurb: "Indigo blue with a sunset orange.",
    swatch: ["#3f4f9e", "#b1502c", "#f4f6fc"],
  },
];

export const COLOR_MODES: { id: ColorMode; label: string; icon: string }[] = [
  { id: "light", label: "Light", icon: "☀️" },
  { id: "dark", label: "Dark", icon: "🌙" },
  { id: "system", label: "Auto", icon: "🌓" },
];

export const THEME_STORAGE_KEY = "safar.theme";
export const MODE_STORAGE_KEY = "safar.mode";
export const DEFAULT_THEME: ThemeId = "saffron";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function resolveMode(mode: ColorMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Runs before first paint so the saved theme is applied with no flash of the
 * wrong colours. Kept as a string because it ships in a <script> tag.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var theme = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
    var mode = localStorage.getItem('${MODE_STORAGE_KEY}') || 'system';
    var resolved = mode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', resolved);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
    document.documentElement.setAttribute('data-mode', 'light');
  }
})();
`;
