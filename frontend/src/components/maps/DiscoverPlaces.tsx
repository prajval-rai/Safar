"use client";

import { Check, MapPin, Plus, X } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/Bits";
import { INTERESTS, type Interest } from "@/lib/interests";
import { mapsProblem, useMapsStatus } from "@/lib/maps";
import { usePlaceSearch } from "@/lib/places";
import type { AddedInfo } from "@/lib/tripPlaces";
import type { PickedPlace } from "@/lib/types";
import { cn } from "@/lib/utils";

import { PlacePhoto } from "./PlacePhoto";
import { PlaceSearch } from "./PlaceSearch";

interface Props {
  destination: string;
  region?: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  interests: string[];
  onInterestsChange: (ids: string[]) => void;
  /** Places already in the plan, by Google place id. */
  added: Record<string, AddedInfo>;
  dayCount: number;
  canAdd: boolean;
  /** dayIndex is null when the traveller left it on "Auto". */
  onAdd: (place: PickedPlace, interestId: string, dayIndex: number | null) => Promise<void>;
  onRemove: (placeId: string) => Promise<void>;
  /** The destination itself, which shouldn't appear as a suggestion. */
  excludeId?: string;
  /** One column instead of two — used inside bottom sheets. */
  compact?: boolean;
}

export function DiscoverPlaces(props: Props) {
  const { destination, region, interests, onInterestsChange, compact, lat, lng, radiusKm } = props;
  const status = useMapsStatus();
  // Places the traveller searched for themselves, newest first.
  const [found, setFound] = useState<PickedPlace[]>([]);
  const bias = lat != null && lng != null ? { lat, lng, radiusKm: radiusKm || 15 } : null;
  const mapsOk = status !== "off" && status !== "error";
  const where = region && !destination.includes(region) ? `${destination}, ${region}` : destination;

  return (
    <div className="space-y-5">
      {mapsOk ? (
        <section aria-label="Search for a place">
          <PlaceSearch
            label="Search for a place"
            placeholder={`A fort, café, beach or temple near ${destination}…`}
            hint="Not in the suggestions? Find any place by name and add it."
            bias={bias}
            onPick={(place) =>
              setFound((prev) => (prev.some((p) => p.place_id === place.place_id) ? prev : [place, ...prev]))
            }
          />
          {found.length ? (
            <ul className={cn("mt-3 grid gap-3", !compact && "sm:grid-cols-2")} aria-label="Places you searched for">
              {found.map((p) => (
                <li key={p.place_id}>
                  <PlaceCard
                    place={p}
                    interestId="search"
                    addedInfo={props.added[p.place_id]}
                    dayCount={props.dayCount}
                    canAdd={props.canAdd}
                    onAdd={props.onAdd}
                    onRemove={props.onRemove}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <InterestPicker value={interests} onChange={onInterestsChange} />

      {status === "off" || status === "error" ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          {mapsProblem(status)}
        </p>
      ) : interests.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
          Pick a few things you enjoy and we&apos;ll find popular places in {destination}.
        </p>
      ) : (
        INTERESTS.filter((i) => interests.includes(i.id)).map((interest) => (
          <InterestSection key={interest.id} interest={interest} place={where} {...props} compact={compact} />
        ))
      )}
    </div>
  );
}

/** The "What would you like to do?" chips, shared by the wizard and Find places. */
export function InterestPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((i) => i !== id) : [...value, id]);
  }

  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-semibold text-ink">What would you like to do?</legend>
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map(({ id, label, Icon }) => {
          const on = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={on}
              className={cn(
                "flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                on
                  ? "border-brand bg-brand text-on-brand"
                  : "border-line bg-surface text-ink hover:bg-raised",
              )}
            >
              <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function InterestSection({
  interest,
  place,
  lat,
  lng,
  radiusKm,
  added,
  dayCount,
  canAdd,
  onAdd,
  onRemove,
  excludeId,
  compact,
}: Props & { interest: Interest; place: string }) {
  const bias = lat != null && lng != null ? { lat, lng, radiusKm: radiusKm || 15 } : null;
  const { places, loading, error } = usePlaceSearch(interest.query(place), { bias, max: 6 });
  const shown = places.filter((p) => p.place_id !== excludeId);

  return (
    <section aria-labelledby={`disc-${interest.id}`}>
      <h3 id={`disc-${interest.id}`} className="mb-2.5 flex items-center gap-2 text-[15px] font-bold text-ink">
        <interest.Icon size={18} strokeWidth={1.9} className="text-brand" aria-hidden="true" />
        Popular for {interest.label.toLowerCase()}
      </h3>

      {loading ? (
        <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")} role="status">
          <span className="sr-only-text">Finding places…</span>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          Couldn&apos;t load places from Google. {error}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">Nothing found for this one — try another interest.</p>
      ) : (
        <ul className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
          {shown.map((p) => (
            <li key={p.place_id}>
              <PlaceCard
                place={p}
                interestId={interest.id}
                addedInfo={added[p.place_id]}
                dayCount={dayCount}
                canAdd={canAdd}
                onAdd={onAdd}
                onRemove={onRemove}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function shortAddress(address: string): string {
  return address.split(",").slice(0, 3).join(",").trim();
}

function PlaceCard({
  place,
  interestId,
  addedInfo,
  dayCount,
  canAdd,
  onAdd,
  onRemove,
}: {
  place: PickedPlace;
  interestId: string;
  addedInfo?: AddedInfo;
  dayCount: number;
  canAdd: boolean;
  onAdd: Props["onAdd"];
  onRemove: Props["onRemove"];
}) {
  const [day, setDay] = useState("auto");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-md",
        addedInfo ? "border-brand/40 bg-brand-soft/50" : "border-line bg-surface",
      )}
    >
      <PlacePhoto src={place.photo_url} alt={`Photo of ${place.name}`} rating={place.rating} className="h-36 w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2.5">
          <MapPin size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] leading-snug font-bold text-ink">{place.name}</h4>
            <p className="truncate text-xs text-muted">
              {shortAddress(place.address)}
              {place.rating_count ? ` · ${place.rating_count.toLocaleString("en-IN")} reviews` : ""}
            </p>
          </div>
        </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        {addedInfo ? (
          <>
            <span className="flex flex-1 items-center gap-1.5 text-sm font-semibold text-success">
              <Check size={16} aria-hidden="true" /> Added · Day {addedInfo.dayIndex}
            </span>
            {canAdd ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onRemove(place.place_id))}
                className="tap flex items-center gap-1 rounded-xl px-2 text-sm font-semibold text-muted hover:text-danger disabled:opacity-60"
              >
                <X size={16} aria-hidden="true" /> Remove
              </button>
            ) : null}
          </>
        ) : canAdd ? (
          <>
            {dayCount > 1 ? (
              <select
                value={day}
                onChange={(e) => setDay(e.target.value)}
                aria-label={`Day for ${place.name}`}
                className="min-h-[44px] rounded-xl border border-line bg-surface px-2 text-sm font-semibold text-ink"
              >
                <option value="auto">Auto day</option>
                {Array.from({ length: dayCount }, (_, i) => (
                  <option key={i} value={i + 1}>
                    Day {i + 1}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => onAdd(place, interestId, day === "auto" ? null : Number(day)))
              }
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
            >
              <Plus size={16} aria-hidden="true" />
              {busy ? "Adding…" : "Add to trip"}
            </button>
          </>
        ) : null}
      </div>
      </div>
    </article>
  );
}
