"use client";

import { MODE_STORAGE_KEY, resolveMode } from "./themes";
import type { ColorMode } from "./types";

export interface ModeSnapshot {
  mode: ColorMode;
  resolved: "light" | "dark";
}

/**
 * Light/dark mode is the one appearance choice still up to the traveller —
 * the colour theme itself now follows their trips (see useAmbientTheme), not
 * a stored preference. Mode lives in localStorage, which is an external store
 * as far as React is concerned; exposing it through useSyncExternalStore means
 * the first client render already has the right value — no effect that
 * corrects itself after mount, and no hydration warning.
 */

const SERVER_SNAPSHOT: ModeSnapshot = {
  mode: "system",
  resolved: "light",
};

let snapshot: ModeSnapshot = SERVER_SNAPSHOT;
let initialised = false;
const listeners = new Set<() => void>();

function readFromStorage(): ModeSnapshot {
  try {
    const storedMode = localStorage.getItem(MODE_STORAGE_KEY) as ColorMode | null;
    const mode: ColorMode =
      storedMode === "light" || storedMode === "dark" || storedMode === "system"
        ? storedMode
        : "system";
    return { mode, resolved: resolveMode(mode) };
  } catch {
    // Private mode, blocked storage — fall back to the defaults.
    return SERVER_SNAPSHOT;
  }
}

function sync() {
  const next = readFromStorage();
  if (next.mode !== snapshot.mode || next.resolved !== snapshot.resolved) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
}

export const modeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    // Another tab changing the mode, or the OS flipping to dark, both count.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      listeners.delete(listener);
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  },

  getSnapshot(): ModeSnapshot {
    if (!initialised) {
      initialised = true;
      snapshot = readFromStorage();
    }
    return snapshot;
  },

  getServerSnapshot(): ModeSnapshot {
    return SERVER_SNAPSHOT;
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
  hasStoredMode() {
    try {
      return localStorage.getItem(MODE_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  },
};
