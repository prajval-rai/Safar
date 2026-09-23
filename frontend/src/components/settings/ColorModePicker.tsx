"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { api } from "@/lib/api";
import { COLOR_MODES } from "@/lib/themes";
import type { ColorMode } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Light or dark is the one appearance choice still up to you — the colour
 * theme itself now follows your trips instead (see useAmbientTheme). Applies
 * instantly and is remembered on the device; if you're logged in it's also
 * saved to your account so it follows you to another phone.
 */
export function ColorModePicker() {
  const { mode, setMode } = useTheme();
  const { user } = useAuth();

  function chooseMode(next: ColorMode) {
    setMode(next);
    if (user) void api.patch("/api/auth/me/", { color_mode: next }).catch(() => {});
  }

  return (
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
  );
}
