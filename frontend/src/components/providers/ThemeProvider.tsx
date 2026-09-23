"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

import { modeStore } from "@/lib/themeStore";
import { DEFAULT_THEME } from "@/lib/themes";
import type { ColorMode, ThemeId } from "@/lib/types";

interface ThemeContextValue {
  /** The colour theme currently applied — your live trip's, your next
   *  upcoming one's, or the site default. Not a personal choice any more
   *  (see useAmbientTheme, which is what actually resolves and sets this). */
  theme: ThemeId;
  mode: ColorMode;
  resolvedMode: "light" | "dark";
  setMode: (mode: ColorMode) => void;
  setAmbientTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode, resolved } = useSyncExternalStore(
    modeStore.subscribe,
    modeStore.getSnapshot,
    modeStore.getServerSnapshot,
  );
  const [ambientTheme, setAmbientTheme] = useState<ThemeId>(DEFAULT_THEME);

  // The pre-paint script sets these first; this keeps them in step afterwards.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", ambientTheme);
    document.documentElement.setAttribute("data-mode", resolved);
  }, [ambientTheme, resolved]);

  return (
    <ThemeContext.Provider
      value={{
        theme: ambientTheme,
        mode,
        resolvedMode: resolved,
        setMode: modeStore.setMode,
        setAmbientTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
