import * as Location from 'expo-location';

import { api } from './api';
import type { Activity, XPResult } from './types';

/** The mobile equivalent of frontend/src/lib/geo.ts, using expo-location
 *  instead of the browser's navigator.geolocation. Same server contract:
 *  the backend does the actual 1 km check, this only collects the reading
 *  and turns every failure into a plain sentence. */

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export async function getPosition(): Promise<Position> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location is turned off for Safar. Allow it in your phone\'s settings so we can confirm you\'re at the stop.');
  }
  try {
    const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: result.coords.latitude,
      longitude: result.coords.longitude,
      accuracy: result.coords.accuracy ?? 0,
    };
  } catch {
    throw new Error("Couldn't work out where you are. Check that location is on, ideally outdoors.");
  }
}

export function isPinned(activity: Pick<Activity, 'latitude' | 'longitude'>): boolean {
  return activity.latitude != null && activity.longitude != null;
}

export async function completeStop(
  activity: Pick<Activity, 'id' | 'latitude' | 'longitude'>,
  options: { override?: boolean } = {},
): Promise<XPResult> {
  const path = `/api/activities/${activity.id}/complete/`;
  if (options.override) return api<XPResult>(path, { method: 'POST', body: { override: true } });
  if (!isPinned(activity)) return api<XPResult>(path, { method: 'POST', body: {} });
  return api<XPResult>(path, { method: 'POST', body: await getPosition() });
}

export async function checkInStop(activity: Pick<Activity, 'id' | 'latitude' | 'longitude'>): Promise<XPResult> {
  const path = `/api/activities/${activity.id}/checkin/`;
  if (!isPinned(activity)) return api<XPResult>(path, { method: 'POST', body: {} });
  return api<XPResult>(path, { method: 'POST', body: await getPosition() });
}

export function canCompleteStop(
  activity: Pick<Activity, 'assigned_to'>,
  myId: number | undefined,
  isOrganiser: boolean,
): boolean {
  return !activity.assigned_to || activity.assigned_to.id === myId || isOrganiser;
}
