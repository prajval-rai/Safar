"use client";

import { useEffect, useState } from "react";

/**
 * Loads the Google Maps JavaScript API once, on demand.
 *
 * The key is a public browser key (NEXT_PUBLIC_…): anyone can see it in dev
 * tools, so its safety comes from restrictions set in Google Cloud — allowed
 * website addresses, and only the Maps JavaScript + Places APIs.
 */
export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export type MapsStatus = "off" | "loading" | "ready" | "error";

let loadPromise: Promise<void> | null = null;
let authFailed = false;
let scriptBlocked = false;
/** e.g. "RefererNotAllowedMapError" — Google only reports these via the console. */
let googleErrorCode = "";
const authListeners = new Set<() => void>();

/** Google explains key problems only in console.error, so listen for that line. */
function watchGoogleErrors() {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const match = args.map(String).join(" ").match(/Google Maps JavaScript API error: (\w+)/);
    if (match) googleErrorCode = match[1];
    original.apply(console, args);
  };
}

export function loadMaps(): Promise<void> {
  if (!MAPS_KEY) return Promise.reject(new Error("no-key"));
  if (loadPromise) return loadPromise;

  watchGoogleErrors();
  const w = window as unknown as Record<string, unknown>;
  // Google calls this when the key is rejected (wrong site, API not enabled…).
  w.gm_authFailure = () => {
    authFailed = true;
    // Give the console line naming the exact reason a moment to land first.
    window.setTimeout(() => authListeners.forEach((listener) => listener()), 60);
  };

  loadPromise = new Promise<void>((resolve, reject) => {
    w.__safarMapsReady = () => resolve();
    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&loading=async&libraries=places,marker` +
      "&language=en&region=IN&callback=__safarMapsReady";
    script.async = true;
    script.onerror = () => {
      scriptBlocked = true;
      loadPromise = null;
      reject(new Error("load-failed"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function useMapsStatus(): MapsStatus {
  const [status, setStatus] = useState<MapsStatus>(MAPS_KEY ? "loading" : "off");

  useEffect(() => {
    if (!MAPS_KEY) return;
    let active = true;
    const fail = () => {
      if (active) setStatus("error");
    };
    authListeners.add(fail);
    loadMaps()
      .then(() => {
        if (active) setStatus(authFailed ? "error" : "ready");
      })
      .catch(fail);
    return () => {
      active = false;
      authListeners.delete(fail);
    };
  }, []);

  return status;
}

/** Plain-English fix for each way a Google key can be refused. */
export function mapsProblem(status: MapsStatus): string {
  if (status === "off") {
    return "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to turn on maps and place search.";
  }
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  if (scriptBlocked) {
    return "The Google Maps script was blocked before it loaded. Try turning off an ad blocker or privacy extension for this site, and check your network.";
  }
  switch (googleErrorCode) {
    case "RefererNotAllowedMapError":
      return `The key doesn't allow this website. In Google Cloud → Credentials → your key → Website restrictions, add ${origin}/* (this exact address, including the port).`;
    case "ApiNotActivatedMapError":
      return "The Maps JavaScript API isn't enabled for this key's Google Cloud project. Enable it under APIs & Services → Library.";
    case "ApiTargetBlockedMapError":
      return "The key's API restrictions don't include the Maps JavaScript API. Add it under the key's API restrictions.";
    case "BillingNotEnabledMapError":
      return "Billing isn't enabled on the Google Cloud project for this key. Google Maps needs a billing account, even on the free tier.";
    case "InvalidKeyMapError":
    case "MissingKeyMapError":
      return "Google says this API key is invalid. Check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in frontend/.env.local, then restart `npm run dev`.";
    case "ExpiredKeyMapError":
    case "ProjectDeniedMapError":
    case "RequestDeniedMapError":
      return `Google refused the key (${googleErrorCode}). Check that it hasn't been deleted or disabled in Google Cloud.`;
    default:
      return `Google Maps couldn't load${googleErrorCode ? ` (${googleErrorCode})` : ""}. Open the browser console for Google's exact message — it usually names the fix. Site being used: ${origin}.`;
  }
}

/** Turns a failed Places request into something a person can act on. */
export function describeGoogleError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.toLowerCase();
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  if (text.includes("referer") || text.includes("referrer")) {
    return `The key doesn't allow this website. Add ${origin}/* to its website restrictions.`;
  }
  if (text.includes("has not been used") || text.includes("disabled") || text.includes("service_disabled")) {
    return "Places API (New) isn't enabled for this key's project. Enable it under APIs & Services → Library.";
  }
  if (text.includes("api_key_service_blocked") || text.includes("blocked")) {
    return "The key's API restrictions don't include Places API (New). Add it under the key's API restrictions.";
  }
  if (text.includes("billing")) {
    return "Billing isn't enabled on the Google Cloud project for this key.";
  }
  if (text.includes("quota") || text.includes("resource_exhausted")) {
    return "Google's usage limit for this key has been reached. Try again later.";
  }
  return raw ? raw.slice(0, 140) : "Couldn't reach Google just now.";
}
