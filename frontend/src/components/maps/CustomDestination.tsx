"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { DESTINATION_THEMES } from "@/lib/interests";
import { reverseGeocode } from "@/lib/places";
import type { PickedPlace } from "@/lib/types";

import { GoogleMap } from "./GoogleMap";

/**
 * "None of these — I'll choose my own." Click anywhere on the map to drop a
 * pin, name it, and size the trip area. Nothing here needs to exist on Google.
 */
export function CustomDestination({
  onPick,
}: {
  onPick: (place: PickedPlace, region: string, themeId: string) => void;
}) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [region, setRegion] = useState("");
  const [radius, setRadius] = useState(10);
  const [theme, setTheme] = useState("mountain");
  const [looking, setLooking] = useState(false);

  async function drop(lat: number, lng: number) {
    setPoint({ lat, lng });
    setLooking(true);
    const found = await reverseGeocode(lat, lng);
    setLooking(false);
    if (found) {
      setAddress(found.address);
      setRegion(found.region);
      // Suggest a name, but never overwrite one the traveller already typed.
      setName((current) => current || found.name);
    } else {
      setAddress("");
    }
  }

  function use() {
    if (!point || !name.trim()) return;
    onPick(
      {
        place_id: "",
        name: name.trim(),
        address: address || `${name.trim()} (custom location)`,
        region,
        latitude: point.lat,
        longitude: point.lng,
        rating: null,
        rating_count: null,
        types: [],
        radius_km: radius,
      },
      region,
      theme,
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Click the map where you&apos;re headed. Zoom in first for a more exact spot.
      </p>

      <GoogleMap
        className="h-64 sm:h-80"
        ariaLabel="Click to choose your own destination"
        pins={point ? [{ id: "custom", lat: point.lat, lng: point.lng, label: "★", title: name || "Your destination" }] : []}
        areas={point ? [{ ...point, radiusKm: radius }] : []}
        onMapClick={drop}
      />

      {point ? (
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <p className="flex items-start gap-2 text-sm text-muted">
            <MapPin size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            {looking
              ? "Finding out what's here…"
              : address || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}
          </p>

          <TextField
            label="Name this place"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grandma's village, Secret beach…"
          />

          <SelectField
            label="What's it like?"
            hint="Picks the artwork for your trip."
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            options={DESTINATION_THEMES.filter((t) => t.id !== "all").map((t) => ({
              value: t.id,
              label: t.label,
            }))}
          />

          <div>
            <label htmlFor="area-size" className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-ink">
              <span>How big is the trip area?</span>
              <span className="text-brand">{radius} km</span>
            </label>
            <input
              id="area-size"
              type="range"
              min={1}
              max={100}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="h-11 w-full accent-[var(--brand)]"
            />
            <p className="text-xs text-muted">The green circle on the map. You can change it later.</p>
          </div>

          <Button fullWidth size="lg" disabled={!name.trim() || looking} onClick={use}>
            Use this destination
          </Button>
        </div>
      ) : null}
    </div>
  );
}
