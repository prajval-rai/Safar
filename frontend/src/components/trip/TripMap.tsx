"use client";

import { Compass, ListOrdered, Map as MapIcon, MapPinPlus, Navigation, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { DiscoverSheet } from "@/components/maps/DiscoverSheet";
import { GoogleMap, type MapPin } from "@/components/maps/GoogleMap";
import { PlaceSearch } from "@/components/maps/PlaceSearch";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { SegmentedControl } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useMapsStatus } from "@/lib/maps";
import { reverseGeocode, searchText } from "@/lib/places";
import { addPlaceToTrip, removePlaceFromTrip, saveDestination } from "@/lib/tripPlaces";
import type { Activity, PickedPlace, TripDetail } from "@/lib/types";
import { CATEGORY_ICONS, cn, clockTime, shortDate } from "@/lib/utils";

type View = "map" | "list";
type DayFilter = "all" | number;

interface Stop extends Activity {
  dayIndex: number;
  date: string;
  /** Running number across the visible days. */
  n: number;
}

const ICON = { size: 17, strokeWidth: 1.9 } as const;

/**
 * The trip map. Stops are the trip's own activities, read from our database —
 * Google is only asked when the traveller searches, and never just to redraw.
 */
export function TripMap({
  trip,
  onChanged,
  canEdit,
}: {
  trip: TripDetail;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const status = useMapsStatus();
  const { toast } = useCelebration();
  const [view, setView] = useState<View>("map");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [dropMode, setDropMode] = useState(false);

  const stops = useMemo<Stop[]>(
    () =>
      trip.days
        .filter((day) => dayFilter === "all" || day.index === dayFilter)
        .flatMap((day) =>
          day.activities.map((a) => ({ ...a, dayIndex: day.index, date: day.date })),
        )
        .map((a, index) => ({ ...a, n: index + 1 })),
    [trip.days, dayFilter],
  );

  const pins = useMemo<MapPin[]>(
    () =>
      stops
        .filter((s) => s.latitude != null && s.longitude != null)
        .map((s) => ({
          id: s.id,
          lat: s.latitude as number,
          lng: s.longitude as number,
          label: String(s.n),
          title: s.title,
          done: s.status === "completed",
        })),
    [stops],
  );

  // Older trips were made before Google coordinates were stored. The first time
  // an organiser opens the map we look the destination up once and save it, so
  // every later visit reads it from the database.
  const backfilled = useRef(false);
  const missingCoords = trip.latitude == null || trip.longitude == null;
  useEffect(() => {
    if (!missingCoords || !canEdit || status !== "ready" || backfilled.current) return;
    backfilled.current = true;
    const query = [trip.destination, trip.region, "India"].filter(Boolean).join(", ");
    searchText(query, { max: 1 })
      .then(async ([place]) => {
        if (!place) return;
        await saveDestination(trip.id, place);
        onChanged();
      })
      .catch(() => {});
  }, [missingCoords, canEdit, status, trip.id, trip.destination, trip.region, onChanged]);

  const center =
    trip.latitude != null && trip.longitude != null
      ? { lat: trip.latitude, lng: trip.longitude }
      : null;
  const selected = stops.find((s) => s.id === selectedId) ?? null;

  // "Drop a pin": the traveller clicks the map to add a spot Google doesn't list.
  async function dropPin(lat: number, lng: number) {
    setDropMode(false);
    const found = await reverseGeocode(lat, lng);
    setPicked({
      place_id: "",
      name: found?.name ?? "",
      address: found?.address ?? "Dropped pin",
      region: found?.region ?? "",
      latitude: lat,
      longitude: lng,
      rating: null,
      rating_count: null,
      types: [],
      radius_km: 0,
    });
  }

  async function addPicked(dayIndex: number, startTime: string, name: string) {
    if (!picked) return;
    const place = { ...picked, name: name.trim() || picked.name };
    try {
      await addPlaceToTrip(trip, place, { dayIndex, startTime });
      toast(`${place.name} added to Day ${dayIndex}.`);
      setPicked(null);
      onChanged();
    } catch {
      toast("Couldn't add that place.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="lg:hidden">
          <SegmentedControl
            label="Show the plan as a map or a list"
            value={view}
            onChange={setView}
            options={[
              { value: "map", label: "Map", icon: <MapIcon {...ICON} /> },
              { value: "list", label: "List", icon: <ListOrdered {...ICON} /> },
            ]}
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              variant={dropMode ? "primary" : "secondary"}
              icon={<MapPinPlus {...ICON} />}
              onClick={() => setDropMode((on) => !on)}
              aria-pressed={dropMode}
              className="rounded-2xl"
            >
              {dropMode ? "Click the map…" : "Drop a pin"}
            </Button>
          ) : null}
          <Button variant="secondary" icon={<Sparkles {...ICON} />} onClick={() => setDiscoverOpen(true)} className="rounded-2xl">
            Find places
          </Button>
        </div>
      </div>

      {canEdit ? (
        <PlaceSearch
          label="Search for a place to add"
          placeholder={`Search in ${trip.destination}…`}
          bias={center ? { ...center, radiusKm: trip.area_radius_km || 15 } : null}
          onPick={setPicked}
        />
      ) : null}

      {picked ? (
        <PickedPanel
          key={`${picked.place_id}|${picked.latitude}|${picked.longitude}`}
          place={picked}
          days={trip.days.map((d) => ({ index: d.index, date: d.date }))}
          onAdd={addPicked}
          onCancel={() => setPicked(null)}
        />
      ) : null}

      {/* All / Day 1 / Day 2 … */}
      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Show stops for">
        {(["all", ...trip.days.map((d) => d.index)] as DayFilter[]).map((value) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => {
              setDayFilter(value);
              setSelectedId(null);
            }}
            aria-pressed={dayFilter === value}
            className={cn(
              "min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors",
              dayFilter === value
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-ink hover:bg-raised",
            )}
          >
            {value === "all" ? "All" : `Day ${value}`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={cn("space-y-3", view === "list" && "hidden lg:block")}>
          <GoogleMap
            className="h-[52vh] min-h-[320px] lg:h-[560px]"
            ariaLabel={`Map of your trip to ${trip.destination}`}
            center={center}
            radiusKm={trip.area_radius_km}
            pins={pins}
            selectedId={selectedId}
            onSelect={setSelectedId}
            preview={picked ? { lat: picked.latitude, lng: picked.longitude, title: picked.name } : null}
            onMapClick={dropMode ? dropPin : undefined}
          />
          {center ? (
            <p className="text-xs text-muted">
              The green circle is the approximate area for this trip — not an official boundary.
            </p>
          ) : null}
          {selected ? (
            <StopCard
              key={selected.id}
              stop={selected}
              dayCount={trip.days.length}
              canEdit={canEdit}
              onChanged={() => {
                setSelectedId(null);
                onChanged();
              }}
              onRefresh={onChanged}
            />
          ) : null}
        </div>

        <div className={cn(view === "map" && "hidden lg:block")}>
          <StopList stops={stops} selectedId={selectedId} onSelect={setSelectedId} onFind={() => setDiscoverOpen(true)} canEdit={canEdit} />
        </div>
      </div>

      <DiscoverSheet
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        trip={trip}
        canEdit={canEdit}
        onChanged={onChanged}
      />
    </div>
  );
}

/* --------------------------------------------------------------- list */

function StopList({
  stops,
  selectedId,
  onSelect,
  onFind,
  canEdit,
}: {
  stops: Stop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFind: () => void;
  canEdit: boolean;
}) {
  if (!stops.length) {
    return (
      <EmptyState
        emoji="📍"
        title="No stops yet."
        line="Search for a place, or let us suggest popular ones for what you enjoy."
        action={
          canEdit ? (
            <Button onClick={onFind} icon={<Sparkles {...ICON} />}>
              Find places
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ol className="card divide-y divide-[var(--line)] overflow-hidden lg:max-h-[560px] lg:overflow-y-auto">
      {stops.map((stop) => {
        const pinned = stop.latitude != null && stop.longitude != null;
        return (
          <li key={stop.id}>
            <button
              type="button"
              onClick={() => onSelect(stop.id)}
              aria-pressed={selectedId === stop.id}
              className={cn(
                "flex min-h-[64px] w-full items-center gap-3 p-3.5 text-left transition-colors",
                selectedId === stop.id ? "bg-brand-soft" : "hover:bg-raised",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  stop.status === "completed" ? "bg-success text-white" : "bg-brand text-on-brand",
                )}
                aria-hidden="true"
              >
                {stop.status === "completed" ? "✓" : stop.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-ink">
                  <span aria-hidden="true">{CATEGORY_ICONS[stop.category]}</span> {stop.title}
                </span>
                <span className="block truncate text-xs text-muted">
                  Day {stop.dayIndex}
                  {stop.start_time ? ` · ${clockTime(stop.start_time)}` : ""}
                  {pinned ? "" : " · No pin on the map"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------- selected stop */

function StopCard({
  stop,
  dayCount,
  canEdit,
  onChanged,
  onRefresh,
}: {
  stop: Stop;
  dayCount: number;
  canEdit: boolean;
  onChanged: () => void;
  onRefresh: () => void;
}) {
  const { toast } = useCelebration();
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(stop.start_time?.slice(0, 5) ?? "");

  async function run(action: () => Promise<unknown>, done: () => void, message: string) {
    setBusy(true);
    try {
      await action();
      toast(message);
      done();
    } catch {
      toast("Couldn't do that.", "error");
    } finally {
      setBusy(false);
    }
  }

  const directions =
    stop.latitude != null && stop.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}` +
        (stop.google_place_id ? `&destination_place_id=${stop.google_place_id}` : "")
      : null;

  return (
    <article className="card animate-rise space-y-3 rounded-[22px] p-4" aria-label={`Details for ${stop.title}`}>
      <div>
        <h3 className="text-base font-bold text-ink">
          <span aria-hidden="true">{CATEGORY_ICONS[stop.category]}</span> {stop.title}
        </h3>
        {stop.place_address ? <p className="text-sm text-muted">{stop.place_address}</p> : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>
            Day {stop.dayIndex} · {shortDate(stop.date)}
          </span>
          {stop.place_rating ? (
            <span className="flex items-center gap-1 font-semibold text-ink">
              <Star size={14} className="fill-warn text-warn" aria-hidden="true" />
              {stop.place_rating.toFixed(1)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {canEdit ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Visit time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                onBlur={() => {
                  if ((stop.start_time?.slice(0, 5) ?? "") !== time) {
                    void run(
                      () => api.patch(`/api/activities/${stop.id}/`, { start_time: time || null }),
                      onRefresh,
                      "Time saved.",
                    );
                  }
                }}
                className="min-h-[44px] rounded-xl border border-line bg-surface px-3 text-sm text-ink"
              />
            </label>
            {dayCount > 1 ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                Day
                <select
                  value={stop.dayIndex}
                  disabled={busy}
                  onChange={(e) =>
                    void run(
                      () => api.post(`/api/activities/${stop.id}/move/`, { day_index: Number(e.target.value) }),
                      onChanged,
                      `Moved to Day ${e.target.value}.`,
                    )
                  }
                  className="min-h-[44px] rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink"
                >
                  {Array.from({ length: dayCount }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Day {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}

        {directions ? (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-raised"
          >
            <Navigation {...ICON} aria-hidden="true" /> Directions
          </a>
        ) : null}

        {canEdit ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => removePlaceFromTrip(stop.id), onChanged, "Removed from your plan.")}
            className="ml-auto flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
          >
            <Trash2 {...ICON} aria-hidden="true" /> Remove
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">To change the order, use the arrows in the Itinerary tab.</p>
    </article>
  );
}

/* ------------------------------------------------------------ search hit */

function PickedPanel({
  place,
  days,
  onAdd,
  onCancel,
}: {
  place: PickedPlace;
  days: { index: number; date: string }[];
  onAdd: (dayIndex: number, startTime: string, name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const custom = place.place_id === "";
  const [name, setName] = useState(place.name);
  const [day, setDay] = useState(days[0]?.index ?? 1);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className="card animate-rise space-y-3 rounded-[22px] border-accent/40 p-4" aria-label="Add this place">
      <div className="flex items-start gap-3">
        <Compass size={20} strokeWidth={1.8} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-ink">{custom ? "Your own spot" : place.name}</h3>
          <p className="text-sm text-muted">{place.address}</p>
        </div>
      </div>
      {custom ? (
        <TextField
          label="Name this place"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Best chai stall, Family farmhouse…"
        />
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Day
          <select
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className="min-h-[44px] rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink"
          >
            {days.map((d) => (
              <option key={d.index} value={d.index}>
                Day {d.index} · {shortDate(d.date)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Time (optional)
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="min-h-[44px] rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          />
        </label>
        <Button
          icon={<Plus {...ICON} />}
          disabled={busy || (custom && !name.trim())}
          onClick={async () => {
            setBusy(true);
            try {
              await onAdd(day, time, name);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add to trip
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
