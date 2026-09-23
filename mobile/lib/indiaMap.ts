/** Ported from frontend/src/lib/indiaMap.ts's flat-projection functions
 *  (`statePaths`/`mapPins`, the ones the web app's own downloadable share-card
 *  PNG still uses) — the same proven projection and state-lookup logic, not
 *  reworked. react-native-svg's <Path d="…"> accepts the exact same SVG path
 *  string `statePaths` already produces, so this ports over unchanged. */

import { INDIA_SHAPES, type StateShape } from "./indiaMapData";
import type { ActivityCategory, TravelMapData } from "./types";

export const TOTAL_STATES = INDIA_SHAPES.length;

const LNG_MIN = 67.5;
const LAT_MAX = 37.5;
const SCALE = 20;
const COS = Math.cos((22 * Math.PI) / 180);

export const MAP_W = Math.round((97.8 - LNG_MIN) * COS * SCALE);
export const MAP_H = Math.round((LAT_MAX - 6) * SCALE);

export function pinPoint(lat: number, lng: number): [number, number] {
  return px(lng, lat);
}

function px(lng: number, lat: number): [number, number] {
  return [(lng - LNG_MIN) * COS * SCALE, (LAT_MAX - lat) * SCALE];
}

export interface StatePath {
  name: string;
  d: string;
}

let cachedPaths: StatePath[] | null = null;

export function statePaths(): StatePath[] {
  if (cachedPaths) return cachedPaths;
  cachedPaths = INDIA_SHAPES.map((s) => ({
    name: s.name,
    d:
      s.rings
        .map((ring) =>
          ring
            .map(([lng, lat], i) => {
              const [x, y] = px(lng, lat);
              return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join("") + "Z",
        )
        .join(""),
  }));
  return cachedPaths;
}

function inRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function stateAt(lat: number, lng: number): string | null {
  for (const s of INDIA_SHAPES) {
    for (const ring of s.rings) if (inRing(lng, lat, ring)) return s.name;
  }
  let best: { name: string; d: number } | null = null;
  for (const s of INDIA_SHAPES as StateShape[]) {
    for (const ring of s.rings) {
      for (const [x, y] of ring) {
        const d = (x - lng) ** 2 + (y - lat) ** 2;
        if (!best || d < best.d) best = { name: s.name, d };
      }
    }
  }
  return best && best.d < 0.45 ** 2 ? best.name : null;
}

const ALIASES: [string, string][] = [
  ["orissa", "Odisha"],
  ["uttaranchal", "Uttarakhand"],
  ["pondicherry", "Puducherry"],
  ["new delhi", "Delhi"],
  ["nct of delhi", "Delhi"],
  ["j&k", "Jammu and Kashmir"],
  ["kashmir", "Jammu and Kashmir"],
  ["jammu", "Jammu and Kashmir"],
  ["andaman", "Andaman and Nicobar Islands"],
  ["nicobar", "Andaman and Nicobar Islands"],
  ["daman", "Dadra and Nagar Haveli and Daman and Diu"],
  ["diu", "Dadra and Nagar Haveli and Daman and Diu"],
  ["dadra", "Dadra and Nagar Haveli and Daman and Diu"],
];

export function stateFromText(...texts: string[]): string | null {
  for (const raw of texts) {
    const text = ` ${raw.toLowerCase().replace(/[,.]/g, " ")} `;
    let found: string | null = null;
    for (const s of INDIA_SHAPES) {
      if (text.includes(` ${s.name.toLowerCase()} `)) {
        if (!found || s.name.length > found.length) found = s.name;
      }
    }
    if (found) return found;
    for (const [alias, name] of ALIASES) {
      if (text.includes(` ${alias} `)) return name;
    }
  }
  return null;
}

export interface StateJourney {
  trips: string[];
  places: string[];
}

export function visitedStates(data: TravelMapData): Map<string, StateJourney> {
  const out = new Map<string, StateJourney>();
  const entry = (state: string) => {
    const e = out.get(state) ?? { trips: [], places: [] };
    out.set(state, e);
    return e;
  };
  const addTrip = (state: string | null, label: string) => {
    if (!state) return;
    const e = entry(state);
    if (!e.trips.includes(label)) e.trips.push(label);
  };

  const pinned = new Set<string>();
  for (const a of data.areas) {
    pinned.add(a.trip_id);
    addTrip(stateAt(a.latitude, a.longitude) ?? stateFromText(a.region, a.destination), a.destination);
  }
  for (const t of data.finished ?? []) {
    if (pinned.has(t.trip_id)) continue;
    addTrip(stateFromText(t.region, t.destination), t.destination);
  }
  for (const p of data.places) {
    const state = stateAt(p.latitude, p.longitude);
    if (!state) continue;
    const e = entry(state);
    const label = p.place_name || p.title;
    if (!e.places.includes(label)) e.places.push(label);
    if (!e.trips.includes(p.trip_title)) e.trips.push(p.trip_title);
  }
  return out;
}

export interface Tier {
  min: number;
  title: string;
  emoji: string;
}

export const TIERS: Tier[] = [
  { min: 0, title: "Ready to roam", emoji: "🎒" },
  { min: 1, title: "First Steps", emoji: "👣" },
  { min: 3, title: "Wanderer", emoji: "🧭" },
  { min: 6, title: "Trailblazer", emoji: "🔥" },
  { min: 10, title: "Pathfinder", emoji: "🏔️" },
  { min: 18, title: "Bharat Yatri", emoji: "🇮🇳" },
  { min: 30, title: "Sampoorna Yatri", emoji: "👑" },
];

export function tierFor(count: number): { current: Tier; next: Tier | null } {
  let idx = 0;
  TIERS.forEach((t, i) => {
    if (count >= t.min) idx = i;
  });
  return { current: TIERS[idx], next: TIERS[idx + 1] ?? null };
}

export function percent(count: number): number {
  return Math.round((count / TOTAL_STATES) * 100);
}

export interface MapPinPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  verified: boolean;
  state: string | null;
  category: ActivityCategory | null;
}

export function mapPins(data: TravelMapData): MapPinPoint[] {
  const pins: MapPinPoint[] = [];
  for (const a of data.areas) {
    const [x, y] = pinPoint(a.latitude, a.longitude);
    pins.push({
      id: `a-${a.trip_id}`,
      x,
      y,
      label: a.destination,
      verified: false,
      state: stateAt(a.latitude, a.longitude),
      category: null,
    });
  }
  for (const p of data.places) {
    const [x, y] = pinPoint(p.latitude, p.longitude);
    pins.push({
      id: `p-${p.id}`,
      x,
      y,
      label: p.place_name || p.title,
      verified: true,
      state: stateAt(p.latitude, p.longitude),
      category: p.category,
    });
  }
  return pins;
}
