"use client";

import {
  DEFAULT_THEME,
  MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  isThemeId,
  resolveMode,
} from "./themes";
import type { ColorMode, ThemeId } from "./types";

export interface ThemeSnapshot {
  theme: ThemeId;
  mode: ColorMode;
  resolved: "light" | "dark";
}

/**
 * The theme lives in localStorage, which is an external store as far as React
 * is concerned. Exposing it through useSyncExternalStore means the first client
 * render already has the right value — no effect that corrects itself after
 * mount, and no hydration warning.
 */

const SERVER_SNAPSHOT: ThemeSnapshot = {
  theme: DEFAULT_THEME,
  mode: "system",
  resolved: "light",
};

let snapshot: ThemeSnapshot = SERVER_SNAPSHOT;
let initialised = false;
const listeners = new Set<() => void>();

function readFromStorage(): ThemeSnapshot {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const storedMode = localStorage.getItem(MODE_STORAGE_KEY) as ColorMode | null;
    const theme = isThemeId(storedTheme) ? storedTheme : DEFAULT_THEME;
    const mode: ColorMode =
      storedMode === "light" || storedMode === "dark" || storedMode === "system"
        ? storedMode
        : "system";
    return { theme, mode, resolved: resolveMode(mode) };
  } catch {
    // Private mode, blocked storage — fall back to the defaults.
    return SERVER_SNAPSHOT;
  }
}

function sync() {
  const next = readFromStorage();
  if (
    next.theme !== snapshot.theme ||
    next.mode !== snapshot.mode ||
    next.resolved !== snapshot.resolved
  ) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
}

export const themeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    // Another tab changing the theme, or the OS flipping to dark, both count.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      listeners.delete(listener);
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  },

  getSnapshot(): ThemeSnapshot {
    if (!initialised) {
      initialised = true;
      snapshot = readFromStorage();
    }
    return snapshot;
  },

  getServerSnapshot(): ThemeSnapshot {
    return SERVER_SNAPSHOT;
  },

  setTheme(theme: ThemeId) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable — the choice just won't persist */
    }
    sync();
  },

  setMode(mode: ColorMode) {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* storage unavailable */
    }
    sync();
  },

  /** True when the traveller has never made a choice on this device. */
  hasStoredTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  },

  hasStoredMode() {
    try {
      return localStorage.getItem(MODE_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  },
};
