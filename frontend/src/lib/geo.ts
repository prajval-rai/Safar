"use client";

import { postOrQueue } from "./offlineQueue";
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
 * Completes a stop for the whole group (organisers only). Pinned stops need
 * the organiser to be within 1 km, so we send where they are — there's no
 * way to complete a pinned stop from anywhere else. The GPS reading itself doesn't need signal — only saving it
 * does — so with no connection this saves locally and finishes the moment
 * connectivity returns (see lib/offlineQueue), instead of just failing.
 */
export async function completeStop(
  activity: Pick<Activity, "id" | "latitude" | "longitude" | "title">,
): Promise<XPResult> {
  const path = `/api/activities/${activity.id}/complete/`;
  const label = `Complete "${activity.title}"`;
  if (!isPinned(activity)) return postOrQueue<XPResult>(path, {}, label);
  return postOrQueue<XPResult>(path, await getPosition(), label);
}

/** "I'm here" — needs a real location whenever the stop is pinned. Same
 *  offline handling as completeStop: the GPS fix is captured regardless of
 *  signal, and only saving it waits for a connection. */
export async function checkInStop(
  activity: Pick<Activity, "id" | "latitude" | "longitude" | "title">,
): Promise<XPResult> {
  const path = `/api/activities/${activity.id}/checkin/`;
  const label = `Check in at "${activity.title}"`;
  if (!isPinned(activity)) return postOrQueue<XPResult>(path, {}, label);
  return postOrQueue<XPResult>(path, await getPosition(), label);
}

