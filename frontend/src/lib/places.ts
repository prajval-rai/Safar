"use client";

import { useEffect, useState } from "react";

import { describeGoogleError, loadMaps } from "./maps";
import type { CoverKey, PickedPlace } from "./types";

/**
 * Thin wrappers over Google Places (New). Nothing here talks to our backend:
 * once a traveller picks a place, the caller saves it on the trip or activity,
 * and every later view reads it from our own database instead of asking Google.
 */

const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "types",
  "viewport",
  "addressComponents",
  "photos",
];

const CACHE_PREFIX = "safar.gp2."; // bumped when photos were added to results
const memory = new Map<string, PickedPlace[]>();

function readCache(key: string): PickedPlace[] | null {
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw) as PickedPlace[];
      memory.set(key, parsed);
      return parsed;
    }
  } catch {
    /* storage unavailable — just skip the cache */
  }
  return null;
}

function writeCache(key: string, places: PickedPlace[]) {
  memory.set(key, places);
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(places));
  } catch {
    /* quota or private mode — fine */
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Half the viewport diagonal, kept to a sensible size for a "trip area". */
function radiusFromViewport(viewport: google.maps.LatLngBounds | null | undefined): number {
  if (!viewport) return 10;
  const ne = viewport.getNorthEast();
  const sw = viewport.getSouthWest();
  const km = haversineKm(ne.lat(), ne.lng(), sw.lat(), sw.lng()) / 2;
  return Math.min(60, Math.max(3, Math.round(km * 10) / 10));
}

function photoUrl(place: google.maps.places.Place): string | null {
  try {
    return place.photos?.[0]?.getURI({ maxWidth: 640 }) ?? null;
  } catch {
    return null;
  }
}

/** Converts a Google Place (after fetchFields) into the shape we store. */
export function toPicked(place: google.maps.places.Place): PickedPlace | null {
  if (!place.id || !place.location) return null;
  const region =
    place.addressComponents?.find((c) => c.types.includes("administrative_area_level_1"))
      ?.longText ?? "";
  return {
    place_id: place.id,
    name: place.displayName ?? "Unnamed place",
    address: place.formattedAddress ?? "",
    region,
    latitude: place.location.lat(),
    longitude: place.location.lng(),
    rating: place.rating ?? null,
    rating_count: place.userRatingCount ?? null,
    types: place.types ?? [],
    radius_km: radiusFromViewport(place.viewport),
    photo_url: photoUrl(place),
  };
}

export interface SearchOptions {
  /** Bias results towards this point so "temples" means temples near the trip. */
  bias?: { lat: number; lng: number; radiusKm: number } | null;
  max?: number;
}

/** One Places text search, cached per query for the browser session. */
export async function searchText(
  query: string,
  options: SearchOptions = {},
): Promise<PickedPlace[]> {
  const { bias, max = 8 } = options;
  const key = `${query}|${bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : ""}|${max}`;
  const cached = readCache(key);
  if (cached) return cached;

  await loadMaps();
  const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
  const { places } = await Place.searchByText({
    textQuery: query,
    fields: FIELDS,
    maxResultCount: max,
    language: "en",
    region: "in",
    ...(bias
      ? {
          locationBias: {
            center: { lat: bias.lat, lng: bias.lng },
            radius: Math.min(50_000, Math.max(5_000, bias.radiusKm * 2000)),
          },
        }
      : {}),
  });

  const seen = new Set<string>();
  const results: PickedPlace[] = [];
  for (const place of places) {
    const picked = toPicked(place);
    if (picked && !seen.has(picked.place_id)) {
      seen.add(picked.place_id);
      results.push(picked);
    }
  }
  writeCache(key, results);
  return results;
}

interface SearchState {
  key: string | null;
  places: PickedPlace[];
  /** A plain-English reason, when the search failed. */
  error: string | null;
}

/**
 * Runs a search whenever `query` changes. `loading` is derived from whether the
 * stored result belongs to the current query, so no state is set synchronously.
 */
export function usePlaceSearch(query: string | null, options: SearchOptions = {}) {
  const [state, setState] = useState<SearchState>({ key: null, places: [], error: null });
  const lat = options.bias?.lat;
  const lng = options.bias?.lng;
  const radius = options.bias?.radiusKm;
  const max = options.max;
  const key = query ? `${query}|${lat ?? ""}|${lng ?? ""}` : null;

  useEffect(() => {
    if (!query || !key) return;
    let active = true;
    const bias = lat != null && lng != null ? { lat, lng, radiusKm: radius ?? 10 } : null;
    searchText(query, { bias, max })
      .then((places) => {
        if (active) setState({ key, places, error: null });
      })
      .catch((err: unknown) => {
        if (active) setState({ key, places: [], error: describeGoogleError(err) });
      });
    return () => {
      active = false;
    };
  }, [query, key, lat, lng, radius, max]);

  const current = state.key === key;
  return {
    places: current ? state.places : [],
    loading: key !== null && !current,
    error: current ? state.error : null,
  };
}

/** Best-fit illustrated cover for a Google place. */
export function coverFor(types: string[], theme?: string): CoverKey {
  if (theme === "mountain") return "mountain";
  if (theme === "beach") return "beach";
  if (theme === "road") return "road";
  if (theme === "temple") return "temple";
  if (theme === "heritage") return "fort";
  if (theme === "nature") return "forest";
  if (types.includes("beach")) return "beach";
  if (types.some((t) => t.includes("temple") || t === "place_of_worship")) return "temple";
  if (types.some((t) => ["national_park", "park", "natural_feature"].includes(t))) return "forest";
  if (types.some((t) => ["locality", "sublocality"].includes(t))) return "city";
  return "mountain";
}

/**
 * Best-effort "what is at this point?" for a pin the traveller dropped. Returns
 * null on any failure (Geocoding API off, no result…) — callers just carry on
 * and let the traveller name the place themselves.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ address: string; region: string; name: string } | null> {
  try {
    await loadMaps();
    const { Geocoder } = (await google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
    const { results } = await new Geocoder().geocode({ location: { lat, lng }, language: "en" });
    const best = results[0];
    if (!best) return null;
    const part = (type: string) =>
      best.address_components.find((c) => c.types.includes(type))?.long_name ?? "";
    return {
      address: best.formatted_address,
      region: part("administrative_area_level_1"),
      // A town or neighbourhood makes a friendlier default name than a street address.
      name: part("locality") || part("sublocality") || part("administrative_area_level_2"),
    };
  } catch {
    return null;
  }
}
