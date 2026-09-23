"use client";

import { useEffect } from "react";

import { useTheme } from "@/components/providers/ThemeProvider";
import type { ThemeId } from "./types";

/**
 * Applies a trip's own destination-based theme (Trip.theme, from the
 * backend) for as long as its page is open, then restores the traveller's
 * own theme the moment they navigate away. A trip to Kerala looks like
 * backwaters, one to Rajasthan looks like terracotta — the same for every
 * member, including someone who only just joined with the invite code —
 * without ever touching anyone's actual account preference.
 *
 * Only ever touches the `data-theme` DOM attribute directly; the account
 * theme in ThemeProvider/localStorage is never read from here except to know
 * what to restore on the way out.
 */
export function useTripTheme(tripTheme: ThemeId | null | undefined) {
  const { theme: personalTheme } = useTheme();

  useEffect(() => {
    if (!tripTheme) return;
    document.documentElement.setAttribute("data-theme", tripTheme);
    return () => {
      document.documentElement.setAttribute("data-theme", personalTheme);
    };
    // Deliberately not depending on personalTheme: if it changes while this
    // trip's page happens to be open (e.g. Settings in another tab), the
    // trip should keep showing its own theme, not flip mid-visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripTheme]);
}
