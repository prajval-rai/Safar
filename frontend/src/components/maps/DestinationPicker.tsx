"use client";

import { MapPin, MapPinPlus, Search } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/Bits";
import { TextField } from "@/components/ui/Field";
import { INDIA_STATES, INDIA_UNION_TERRITORIES } from "@/lib/indiaStates";
import { DESTINATION_THEMES } from "@/lib/interests";
import { useMapsStatus } from "@/lib/maps";
import { usePlaceSearch } from "@/lib/places";
import type { PickedPlace } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CustomDestination } from "./CustomDestination";
import { GoogleMap } from "./GoogleMap";
import { PlaceSearch } from "./PlaceSearch";
import { PlacePhoto } from "./PlacePhoto";

export interface DestinationValue {
  destination: string;
  google_place_id: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  area_radius_km: number;
}

interface Props {
  value: DestinationValue;
  /** `themeId` is the "Mountains / Beaches…" chip the traveller was browsing, if any. */
  onPick: (place: PickedPlace, region: string, themeId: string) => void;
  /** Used only when Google isn't available, so the wizard is never a dead end. */
  onManual: (name: string) => void;
}

/**
 * Choose where you're going: search anywhere in India, or browse by state and
 * theme. Every coordinate comes from Google when a place is picked.
 */
export function DestinationPicker({ value, onPick, onManual }: Props) {
  const status = useMapsStatus();
  const [state, setState] = useState("");
  const [filter, setFilter] = useState("");
  const [themeId, setThemeId] = useState("all");
  const [customOpen, setCustomOpen] = useState(false);

  const theme = DESTINATION_THEMES.find((t) => t.id === themeId) ?? DESTINATION_THEMES[0];
  const { places, loading, error } = usePlaceSearch(
    state && status === "ready" ? `${theme.term} in ${state}, India` : null,
    { max: 9 },
  );
  const results = places.filter((p) => p.name.toLowerCase() !== state.toLowerCase());

  const needle = filter.trim().toLowerCase();
  const states = INDIA_STATES.filter((s) => s.toLowerCase().includes(needle));
  const territories = INDIA_UNION_TERRITORIES.filter((s) => s.toLowerCase().includes(needle));

  // No Google (no key, or key rejected): a plain text field keeps the flow usable.
  if (status === "off" || status === "error") {
    return (
      <div className="space-y-3">
        <TextField
          label="Destination"
          value={value.destination}
          onChange={(e) => onManual(e.target.value)}
          placeholder="Goa, Manali, Jaipur…"
          hint="Place search is unavailable, so type where you're going. You can add the map later."
        />
      </div>
    );
  }

  const hasPlace = value.latitude != null && value.longitude != null;

  return (
    <div className="space-y-6">
      <PlaceSearch
        label="Search any place in India"
        placeholder="Mumbai, Manali, Hampi…"
        onPick={(place) => onPick(place, place.region, "")}
        autoFocus
      />

      {/* Not everywhere worth going is on a list — let people pin their own spot. */}
      <div>
        <button
          type="button"
          onClick={() => setCustomOpen((open) => !open)}
          aria-expanded={customOpen}
          className="tap flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 text-left hover:bg-raised"
        >
          <span className="flex items-center gap-3">
            <MapPinPlus size={20} strokeWidth={1.8} className="text-brand" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-ink">Set my own destination</span>
              <span className="block text-xs text-muted">Drop a pin anywhere and name it yourself</span>
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">
            {customOpen ? "▲" : "▼"}
          </span>
        </button>
        {customOpen ? (
          <div className="mt-3">
            <CustomDestination
              onPick={(place, region, theme) => {
                onPick(place, region, theme);
                setCustomOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>

      {hasPlace ? (
        <section className="card space-y-3 rounded-[22px] p-4" aria-label="Your destination">
          <div className="flex items-start gap-3">
            <MapPin size={20} strokeWidth={1.8} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-base font-bold text-ink">{value.destination}</p>
              <p className="text-sm text-muted">{value.address}</p>
            </div>
          </div>
          <GoogleMap
            className="h-44 sm:h-56"
            ariaLabel={`Map centred on ${value.destination}`}
            center={{ lat: value.latitude as number, lng: value.longitude as number }}
            radiusKm={value.area_radius_km}
            pins={[]}
          />
          <p className="text-xs text-muted">
            The green circle is the approximate trip area, not an official boundary.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="by-state">
        <h2 id="by-state" className="mb-1 text-sm font-semibold text-ink">
          Or explore by state
        </h2>
        <p className="mb-3 text-xs text-muted">Pick a state to see its popular destinations.</p>

        <div className="relative mb-3">
          <Search
            size={17}
            strokeWidth={1.9}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter states"
            placeholder="Filter states and union territories"
            className="min-h-[44px] w-full rounded-2xl border border-line bg-surface pr-4 pl-10 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
          />
        </div>

        <div className="max-h-56 space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface p-3">
          <StateGroup title="States" items={states} value={state} onChoose={setState} />
          <StateGroup title="Union territories" items={territories} value={state} onChoose={setState} />
          {states.length === 0 && territories.length === 0 ? (
            <p className="text-sm text-muted">No state matches “{filter}”.</p>
          ) : null}
        </div>
      </section>

      {state ? (
        <section aria-labelledby="state-results" className="space-y-3">
          <h2 id="state-results" className="text-base font-bold text-ink">
            Popular in {state}
          </h2>

          <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Kind of destination">
            {DESTINATION_THEMES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setThemeId(id)}
                aria-pressed={themeId === id}
                className={cn(
                  "flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                  themeId === id
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line bg-surface text-ink hover:bg-raised",
                )}
              >
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2" role="status">
              <span className="sr-only-text">Finding destinations…</span>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : error ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              Couldn&apos;t load destinations from Google. {error}
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted">Nothing found — try another kind of place.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {results.map((place) => {
                const selected = value.google_place_id === place.place_id;
                return (
                  <li key={place.place_id}>
                    <button
                      type="button"
                      onClick={() => onPick(place, place.region || state, themeId === "all" ? "" : themeId)}
                      aria-pressed={selected}
                      className={cn(
                        "flex h-full w-full flex-col overflow-hidden rounded-2xl border text-left transition-shadow hover:shadow-md",
                        selected ? "border-brand ring-2 ring-brand/40" : "border-line bg-surface",
                      )}
                    >
                      <PlacePhoto src={place.photo_url} alt={`Photo of ${place.name}`} rating={place.rating} className="h-32 w-full" />
                      <span className="flex flex-1 flex-col gap-1 p-3.5">
                        <span className="flex items-start gap-2">
                          <MapPin size={17} strokeWidth={1.8} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                          <span className="text-[15px] leading-snug font-bold text-ink">{place.name}</span>
                        </span>
                        <span className="truncate text-xs text-muted">
                          {place.address.split(",").slice(0, 3).join(",")}
                        </span>
                        {selected ? <span className="text-xs font-semibold text-brand">✓ Selected</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function StateGroup({
  title,
  items,
  value,
  onChoose,
}: {
  title: string;
  items: readonly string[];
  value: string;
  onChoose: (name: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onChoose(name)}
            aria-pressed={value === name}
            className={cn(
              "min-h-[40px] rounded-full border px-3.5 text-sm font-medium transition-colors",
              value === name
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-ink hover:bg-raised",
            )}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
