"use client";

import { api } from "./api";
import type { Activity, XPResult } from "./types";

export interface Position {
  latitude: number;
  longitude: number;
  /** Metres, as reported by the device. */
  accuracy: number;
}

/**
 * Where the traveller is right now. The server does the actual 1 km check; this
 * only collects the reading and turns every failure into a plain sentence.
 * Browsers only share location on https:// pages (or localhost).
 */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("This browser can't share its location."));
      return;
    }
    if (!window.isSecureContext) {
      reject(
        new Error(
          "Location only works on secure (https) pages or localhost, so this address can't share it.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location is turned off for this site. Allow it in your browser settings so we can confirm you're at the stop."
              : err.code === err.TIMEOUT
                ? "Couldn't get your location in time. Try again, ideally outdoors."
                : "Couldn't work out where you are. Check that location is on.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  });
}

export function isPinned(activity: Pick<Activity, "latitude" | "longitude">): boolean {
  return activity.latitude != null && activity.longitude != null;
}

/**
 * Completes a stop. Pinned stops need the traveller to be within 1 km, so we
 * send where they are; the organiser can pass `override` to complete from anywhere.
 */
export async function completeStop(
  activity: Pick<Activity, "id" | "latitude" | "longitude">,
  options: { override?: boolean } = {},
): Promise<XPResult> {
  const path = `/api/activities/${activity.id}/complete/`;
  if (options.override) return api.post<XPResult>(path, { override: true });
  if (!isPinned(activity)) return api.post<XPResult>(path, {});
  return api.post<XPResult>(path, await getPosition());
}

/** "I'm here" — needs a real location whenever the stop is pinned. */
export async function checkInStop(
  activity: Pick<Activity, "id" | "latitude" | "longitude">,
): Promise<XPResult> {
  const path = `/api/activities/${activity.id}/checkin/`;
  if (!isPinned(activity)) return api.post<XPResult>(path, {});
  return api.post<XPResult>(path, await getPosition());
}

/** Whether this person may complete the stop, before we even ask the server. */
export function canCompleteStop(
  activity: Pick<Activity, "assigned_to">,
  myId: number | undefined,
  isOrganiser: boolean,
): boolean {
  return !activity.assigned_to || activity.assigned_to.id === myId || isOrganiser;
}
