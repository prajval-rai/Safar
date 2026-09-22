"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { addPlaceToTrip, addedMap, removePlaceFromTrip, saveInterests } from "@/lib/tripPlaces";
import type { PickedPlace, TripDetail } from "@/lib/types";

/**
 * Add / remove / interest handlers for "discover places", shared by the create
 * wizard and the trip's Find places sheet. `onChanged` should refetch the trip.
 */
export function usePlaceActions(
  trip: TripDetail,
  canEdit: boolean,
  onChanged: () => void | Promise<void>,
) {
  const [interests, setInterests] = useState<string[]>(trip.interests);
  const { toast } = useCelebration();

  function changeInterests(next: string[]) {
    setInterests(next);
    if (canEdit) void saveInterests(trip.id, next).catch(() => {});
  }

  async function add(place: PickedPlace, interestId: string, dayIndex: number | null) {
    try {
      await addPlaceToTrip(trip, place, { dayIndex, interestId });
      toast(`${place.name} added to your plan.`);
      await onChanged();
    } catch {
      toast("Couldn't add that place.", "error");
    }
  }

  async function remove(placeId: string) {
    const info = addedMap(trip)[placeId];
    if (!info) return;
    try {
      await removePlaceFromTrip(info.activityId);
      toast("Removed from your plan.");
      await onChanged();
    } catch {
      toast("Couldn't remove that place.", "error");
    }
  }

  return { interests, changeInterests, add, remove, added: addedMap(trip) };
}
