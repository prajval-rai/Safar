import { api } from "./api";
import { interestById } from "./interests";
import type { ActivityCategory, PickedPlace, TripDetail } from "./types";

/**
 * Saving Google-picked places onto the existing trip: each one becomes a normal
 * Activity, so it already works with the itinerary, Live Trip, XP and tracks.
 */

export interface AddedInfo {
  activityId: string;
  dayIndex: number;
}

/** Places already in the plan, keyed by Google place id. */
export function addedMap(trip: TripDetail): Record<string, AddedInfo> {
  const out: Record<string, AddedInfo> = {};
  for (const day of trip.days) {
    for (const activity of day.activities) {
      if (activity.google_place_id) {
        out[activity.google_place_id] = { activityId: activity.id, dayIndex: day.index };
      }
    }
  }
  return out;
}

/** The day with the fewest stops, so "Add to trip" spreads places out evenly. */
export function lightestDay(trip: TripDetail): TripDetail["days"][number] | undefined {
  return [...trip.days].sort(
    (a, b) => a.activities.length - b.activities.length || a.index - b.index,
  )[0];
}

/** Fallback filing when a place didn't come from one of the interest chips. */
function categoryFromTypes(types: string[]): ActivityCategory {
  if (types.some((t) => ["restaurant", "cafe", "food", "bakery"].includes(t))) return "food";
  if (types.some((t) => ["lodging"].includes(t))) return "stay";
  if (types.some((t) => ["beach", "park", "national_park", "natural_feature"].includes(t))) return "nature";
  if (types.some((t) => ["shopping_mall", "store", "market"].includes(t))) return "shopping";
  return "sightseeing";
}

export async function addPlaceToTrip(
  trip: TripDetail,
  place: PickedPlace,
  options: { dayIndex?: number | null; interestId?: string | null; startTime?: string } = {},
): Promise<void> {
  const day =
    (options.dayIndex ? trip.days.find((d) => d.index === options.dayIndex) : undefined) ??
    lightestDay(trip);
  if (!day) throw new Error("This trip has no days yet.");

  const interest = options.interestId ? interestById(options.interestId) : undefined;
  await api.post(`/api/days/${day.id}/activities/`, {
    title: place.name,
    place_name: place.name,
    place_address: place.address,
    google_place_id: place.place_id,
    place_rating: place.rating,
    latitude: place.latitude,
    longitude: place.longitude,
    category: interest?.activityCategory ?? categoryFromTypes(place.types),
    start_time: options.startTime || null,
  });
}

export async function removePlaceFromTrip(activityId: string): Promise<void> {
  await api.del(`/api/activities/${activityId}/`);
}

export function saveInterests(tripId: string, interests: string[]): Promise<unknown> {
  return api.patch(`/api/trips/${tripId}/`, { interests });
}

/** Stores the destination's Google coordinates on the trip. */
export function saveDestination(tripId: string, place: PickedPlace): Promise<unknown> {
  return api.patch(`/api/trips/${tripId}/`, {
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    google_place_id: place.place_id,
    area_radius_km: place.radius_km,
  });
}
