"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { api } from "@/lib/api";
import { COLOR_MODES, THEMES } from "@/lib/themes";
import type { ColorMode, ThemeId } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Themes apply instantly and are remembered on the device; if you're logged in
 * the choice is also saved to your account so it follows you to another phone.
 */
export function ThemePicker() {
  const { theme, mode, setTheme, setMode } = useTheme();
  const { user } = useAuth();

  function chooseTheme(next: ThemeId) {
    setTheme(next);
    if (user) void api.patch("/api/auth/me/", { theme: next }).catch(() => {});
  }

  function chooseMode(next: ColorMode) {
    setMode(next);
    if (user) void api.patch("/api/auth/me/", { color_mode: next }).catch(() => {});
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2.5 text-sm font-bold text-ink">Colour theme</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {THEMES.map((item) => {
            const selected = theme === item.id;
            return (
              <label
                key={item.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                  selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-raised",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  className="sr-only-text"
                  checked={selected}
                  onChange={() => chooseTheme(item.id)}
                />
                {/* Three swatches preview the palette before you commit. */}
                <span className="flex shrink-0 gap-1" aria-hidden="true">
                  {item.swatch.map((colour) => (
                    <span
                      key={colour}
                      className="h-7 w-4 rounded-full border border-black/10"
                      style={{ backgroundColor: colour }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{item.name}</span>
                  <span className="block text-xs text-muted">{item.blurb}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                    selected ? "border-brand bg-brand text-on-brand" : "border-line",
                  )}
                >
                  {selected ? "✓" : ""}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-sm font-bold text-ink">Light or dark</legend>
        <div className="grid grid-cols-3 gap-2">
          {COLOR_MODES.map((item) => {
            const selected = mode === item.id;
            return (
              <label
                key={item.id}
                className={cn(
                  "flex min-h-[66px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border transition-colors",
                  selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-raised",
                )}
              >
                <input
                  type="radio"
                  name="color-mode"
                  className="sr-only-text"
                  checked={selected}
                  onChange={() => chooseMode(item.id)}
                />
                <span className="text-xl" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="text-xs font-semibold text-ink">{item.label}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Auto follows whatever your phone or laptop is set to.
        </p>
      </fieldset>
    </div>
  );
}
