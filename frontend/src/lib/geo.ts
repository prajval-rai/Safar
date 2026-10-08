"use client";

import { postOrQueue } from "./offlineQueue";
import type { Activity, XPResult } from "./types";

export interface Position {
  latitude: number;
  longitude: number;
  /** Metres, as reported by the device. */
  accuracy: number;
  /** When the reading was taken (ms since epoch) — a check-in saved offline
   *  is sent later, and the server checks the journey against this time. */
  captured_at: number;
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
          captured_at: p.timestamp || Date.now(),
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

/** How long after the organiser completes a stop you can still check in
 *  (trips.attendance.LATE_CHECKIN_WINDOW on the server). */
const LATE_CHECKIN_MS = 24 * 60 * 60 * 1000;

/** Whether you can still check in: a planned stop, or one completed in the
 *  last 24 hours that you haven't checked in at yet. */
export function canCheckIn(
  activity: Pick<Activity, "status" | "completed_at" | "checked_in_at">,
): boolean {
  if (activity.checked_in_at) return false;
  if (activity.status === "planned") return true;
  if (activity.status !== "completed" || !activity.completed_at) return false;
  return Date.now() - new Date(activity.completed_at).getTime() <= LATE_CHECKIN_MS;
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

