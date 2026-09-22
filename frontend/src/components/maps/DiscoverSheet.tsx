"use client";

import { Sheet } from "@/components/ui/Sheet";
import type { TripDetail } from "@/lib/types";

import { DiscoverPlaces } from "./DiscoverPlaces";
import { usePlaceActions } from "./usePlaceActions";

/**
 * "Find places" for an existing trip: the same discovery used in the wizard,
 * in a bottom sheet on phones and a dialog on larger screens.
 */
export function DiscoverSheet({
  open,
  onClose,
  trip,
  canEdit,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  trip: TripDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { interests, changeInterests, add, remove, added } = usePlaceActions(
    trip,
    canEdit,
    onChanged,
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Find places"
      description={`Popular spots in ${trip.destination}, picked for what you enjoy.`}
    >
      {!canEdit ? (
        <p className="mb-4 rounded-xl bg-raised px-3.5 py-2.5 text-sm text-muted">
          Only the organiser and co-planners can add places. You can still look around.
        </p>
      ) : null}
      <DiscoverPlaces
        compact
        destination={trip.destination}
        region={trip.region}
        lat={trip.latitude}
        lng={trip.longitude}
        radiusKm={trip.area_radius_km}
        interests={interests}
        onInterestsChange={changeInterests}
        added={added}
        dayCount={trip.days.length}
        canAdd={canEdit}
        onAdd={add}
        onRemove={remove}
        excludeId={trip.google_place_id}
      />
    </Sheet>
  );
}
