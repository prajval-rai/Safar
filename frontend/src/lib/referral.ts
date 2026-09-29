"use client";

/** Refer a friend: someone's link is /login?ref=<code>. The code is kept in
 *  this browser until sign-in, so it survives a reload or a detour, and is
 *  sent with the Google sign-in — the server only counts it when that
 *  sign-in creates a brand-new account. */

const KEY = "safar.ref";

export function rememberReferralFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
  try {
    if (code && /^[A-Z0-9]{4,12}$/.test(code)) localStorage.setItem(KEY, code);
    return localStorage.getItem(KEY);
  } catch {
    return code ?? null;
  }
}

export function pendingReferral(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, or storage is blocked — either way there's nothing to clear.
  }
}

/** The link someone shares: this site's login page carrying their code. */
export function referralLink(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/login?ref=${encodeURIComponent(code)}`;
}
