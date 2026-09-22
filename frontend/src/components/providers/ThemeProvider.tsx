"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

import { themeStore } from "@/lib/themeStore";
import type { ColorMode, ThemeId } from "@/lib/types";

interface ThemeContextValue {
  theme: ThemeId;
  mode: ColorMode;
  resolvedMode: "light" | "dark";
  setTheme: (theme: ThemeId) => void;
  setMode: (mode: ColorMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, mode, resolved } = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  // The pre-paint script sets these first; this keeps them in step afterwards.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-mode", resolved);
  }, [theme, resolved]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        resolvedMode: resolved,
        setTheme: themeStore.setTheme,
        setMode: themeStore.setMode,
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
