/** Where to send someone once they've signed in — e.g. the invite link they
 *  opened while signed out. Kept per tab in sessionStorage; everything is
 *  wrapped because storage can be blocked (private windows, strict settings). */

const KEY = "safar:return-to";

export function rememberReturnPath(path: string) {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable — they'll just land on Home */
  }
}

export function returnPath(): string {
  try {
    const path = sessionStorage.getItem(KEY);
    // Only ever an in-app path, never another site.
    if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  } catch {
    /* storage unavailable */
  }
  return "/";
}

export function clearReturnPath() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
