"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { api } from "@/lib/api";
import type { ThemeId } from "@/lib/types";

interface ActiveThemeResponse {
  theme: ThemeId;
  source: "live" | "upcoming" | "default";
  trip_title: string | null;
}

/**
 * Resolves the whole app's ambient colour theme from the signed-in
 * traveller's trips — their live one if they have one, else their next
 * upcoming one, else the site default — and pushes it into ThemeProvider.
 * Re-checks on every navigation, so starting or finishing a trip picks up
 * the new theme the next time you move around the app, without needing a
 * full reload.
 *
 * Meant to be called once, from AppShell (only the signed-in part of the
 * site) — trip-scoped pages layer their own trip's theme on top of this via
 * useTripTheme, independent of what this resolves to.
 */
export function useAmbientTheme() {
  const { user } = useAuth();
  const { setAmbientTheme } = useTheme();
  const pathname = usePathname();
  const [info, setInfo] = useState<{ theme: ThemeId; source: string; tripTitle: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!user) return;
    let active = true;
    api
      .get<ActiveThemeResponse>("/api/theme/active/")
      .then((data) => {
        if (!active) return;
        setAmbientTheme(data.theme);
        setInfo({ theme: data.theme, source: data.source, tripTitle: data.trip_title });
      })
      .catch(() => {
        // Offline, or a blip — the theme just stays whatever it already was.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pathname]);

  return info;
}
