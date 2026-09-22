"use client";

import { MapPinOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { mapsProblem, useMapsStatus } from "@/lib/maps";
import { cn } from "@/lib/utils";

/** What a pin's detail popup shows when it's clicked. Plain text fields, not HTML —
 *  they can hold whatever a traveller typed (a place name, a trip title), so they're
 *  set with `textContent`, never parsed as markup. */
export interface MapPinInfo {
  title: string;
  subtitle?: string;
  meta?: string;
  tag?: string;
}

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  /** Short text inside the pin, usually the stop number. Ignored when `icon` is set. */
  label?: string;
  title: string;
  done?: boolean;
  /** An emoji shown in the pin instead of the number/checkmark, e.g. a category icon. */
  icon?: string;
  /** A small open-ring pin instead of a filled badge — for a broader marker, e.g. a
   *  whole trip's destination rather than one specific, categorised stop. */
  hollow?: boolean;
  /** Shows a detail popup over the pin when it's clicked. */
  info?: MapPinInfo;
}

/** A filled-in region on the map, e.g. a state the traveller has visited. */
export interface MapRegion {
  id: string;
  /** One ring per contiguous piece — an archipelago or an exclave has several. */
  paths: { lat: number; lng: number }[][];
  active: boolean;
  title: string;
  onClick?: () => void;
}

interface Props {
  /** The destination centre, used for the soft "main trip area" circle. */
  center?: { lat: number; lng: number } | null;
  radiusKm?: number;
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** A place the traveller is considering but hasn't added yet. */
  preview?: { lat: number; lng: number; title: string } | null;
  /** Extra soft green areas, e.g. every place a traveller has finished a trip. */
  areas?: { lat: number; lng: number; radiusKm: number }[];
  /** Filled-in regions, e.g. the states an achievement map colours in. */
  regions?: MapRegion[];
  /** Keeps panning and zooming within these bounds — e.g. the India achievement map
   *  has no reason to wander off into the Arabian Sea or Tibet. */
  bounds?: { south: number; west: number; north: number; east: number };
  /** Turns the map into a "click to drop a pin" surface. */
  onMapClick?: (lat: number, lng: number) => void;
  ariaLabel: string;
  className?: string;
}

const AREA_GREEN = "#2f9e5b";
const INDIA_CENTRE = { lat: 22.6, lng: 79.0 };
const REGION_ACTIVE = "#e2761b";
const REGION_INACTIVE = "#9ca3af";

/** Builds a pin's detail popup as real DOM nodes — every field is set with
 *  `textContent`, so a place name or trip title someone typed is always shown as
 *  text, never parsed as markup. */
function buildInfoContent(info: MapPinInfo): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "font:600 13px system-ui,sans-serif;color:var(--ink);max-width:15rem;padding:2px 2px 4px";
  const row = (text: string, style: string) => {
    const el = document.createElement("div");
    el.style.cssText = style;
    el.textContent = text;
    wrap.appendChild(el);
  };
  if (info.subtitle) row(info.subtitle, "font-size:12px;color:var(--muted);margin-bottom:2px");
  row(info.title, "font-weight:700;font-size:14px;margin-bottom:2px");
  if (info.meta) row(info.meta, "color:var(--muted);font-size:12px");
  if (info.tag) row(info.tag, "color:var(--success);font-size:12px;font-weight:600;margin-top:4px");
  return wrap;
}

/**
 * The trip map: destination area, numbered stops, and an optional preview pin.
 * Circle, not a boundary — Google doesn't hand out administrative outlines, and
 * drawing a made-up one as if it were "Mumbai's border" would be misleading.
 */
export function GoogleMap({
  center,
  radiusKm = 0,
  pins,
  selectedId,
  onSelect,
  preview,
  areas,
  regions,
  bounds,
  onMapClick,
  ariaLabel,
  className,
}: Props) {
  const status = useMapsStatus();
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const centerLat = center?.lat;
  const centerLng = center?.lng;
  // Bounds don't change per render in practice (they're a fixed region like "India"),
  // but avoid retriggering map creation over a new object identity each render.
  const boundsKey = bounds ? `${bounds.south},${bounds.west},${bounds.north},${bounds.east}` : "";

  // Create the map once the API is ready.
  useEffect(() => {
    if (status !== "ready" || map || !container.current) return;
    let active = true;
    (async () => {
      const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;
      await google.maps.importLibrary("marker");
      if (!active || !container.current) return;
      setMap(
        new Map(container.current, {
          center: centerLat != null && centerLng != null ? { lat: centerLat, lng: centerLng } : INDIA_CENTRE,
          zoom: centerLat != null ? 9 : 5,
          // A mapId is required for advanced markers; this one is Google's demo id.
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
          ...(bounds
            ? {
                restriction: {
                  latLngBounds: bounds,
                  strictBounds: false,
                },
              }
            : {}),
        }),
      );
    })();
    return () => {
      active = false;
    };
    // boundsKey stands in for `bounds`, which is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, map, centerLat, centerLng, boundsKey]);

  // Click-to-drop-a-pin. The latest handler lives in a ref so the listener is
  // attached once, not re-attached every render.
  const clickHandler = useRef(onMapClick);
  useEffect(() => {
    clickHandler.current = onMapClick;
  }, [onMapClick]);
  const clickable = Boolean(onMapClick);
  useEffect(() => {
    if (!map || !clickable) return;
    map.setOptions({ draggableCursor: "crosshair" });
    const listener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (event.latLng) clickHandler.current?.(event.latLng.lat(), event.latLng.lng());
    });
    return () => {
      listener.remove();
      map.setOptions({ draggableCursor: null });
    };
  }, [map, clickable]);

  // Clicking the bare map (not a pin) closes whatever detail popup is open.
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("click", () => infoWindowRef.current?.close());
    return () => listener.remove();
  }, [map]);

  // Any number of extra green areas (the profile's "places I've covered").
  const areaKey = (areas ?? []).map((a) => `${a.lat},${a.lng},${a.radiusKm}`).join("|");
  useEffect(() => {
    if (!map || !areaKey) return;
    const circles = areaKey.split("|").map((part) => {
      const [lat, lng, km] = part.split(",").map(Number);
      return new google.maps.Circle({
        map,
        center: { lat, lng },
        radius: km * 1000,
        fillColor: AREA_GREEN,
        fillOpacity: 0.16,
        strokeColor: AREA_GREEN,
        strokeOpacity: 0.6,
        strokeWeight: 2,
        clickable: false,
      });
    });
    return () => circles.forEach((circle) => circle.setMap(null));
  }, [map, areaKey]);

  // Filled-in regions, e.g. the states an achievement map colours in. Colours are
  // fixed rather than CSS variables — the base map tiles are fixed-light regardless
  // of theme, so a themed fill would clash with them.
  const regionsKey = (regions ?? []).map((r) => `${r.id}:${r.active ? 1 : 0}`).join("|");
  useEffect(() => {
    if (!map || !regions?.length) return;
    const polygons = regions.map((region) => {
      const polygon = new google.maps.Polygon({
        map,
        paths: region.paths,
        fillColor: region.active ? REGION_ACTIVE : REGION_INACTIVE,
        fillOpacity: region.active ? 0.1 : 0,
        strokeColor: region.active ? REGION_ACTIVE : REGION_INACTIVE,
        strokeOpacity: region.active ? 0.55 : 0.45,
        strokeWeight: region.active ? 1.5 : 1,
        clickable: Boolean(region.onClick),
        zIndex: region.active ? 2 : 1,
      });
      if (region.onClick) polygon.addListener("click", region.onClick);
      return polygon;
    });
    return () => polygons.forEach((polygon) => polygon.setMap(null));
    // regionsKey stands in for `regions`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, regionsKey]);

  // The soft green trip area.
  useEffect(() => {
    if (!map || centerLat == null || centerLng == null || radiusKm <= 0) return;
    const circle = new google.maps.Circle({
      map,
      center: { lat: centerLat, lng: centerLng },
      radius: radiusKm * 1000,
      fillColor: AREA_GREEN,
      fillOpacity: 0.14,
      strokeColor: AREA_GREEN,
      strokeOpacity: 0.55,
      strokeWeight: 2,
      clickable: false,
    });
    return () => circle.setMap(null);
  }, [map, centerLat, centerLng, radiusKm]);

  // Stop markers — numbered/checkmark by default, or a category icon / a small
  // hollow ring when the pin asks for one (e.g. the profile achievement map).
  useEffect(() => {
    if (!map) return;
    const markers = pins.map((pin) => {
      const selected = pin.id === selectedId;
      const el = document.createElement("div");
      if (pin.hollow) {
        el.style.cssText = [
          "width:14px",
          "height:14px",
          "border-radius:9999px",
          "background:var(--surface)",
          `border:3px solid ${pin.icon ? "var(--brand)" : "var(--ink)"}`,
          "box-shadow:0 1px 4px rgba(0,0,0,.35)",
          `transform:scale(${selected ? 1.3 : 1})`,
        ].join(";");
      } else {
        el.textContent = pin.icon ?? (pin.done ? "✓" : (pin.label ?? ""));
        el.style.cssText = [
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "min-width:32px",
          "height:32px",
          "padding:0 8px",
          "border-radius:9999px",
          `font:700 ${pin.icon ? "15px" : "13px"} system-ui,sans-serif`,
          "color:#fff",
          "border:2px solid #fff",
          "box-shadow:0 2px 6px rgba(0,0,0,.35)",
          `background:${pin.done ? "var(--success)" : selected ? "var(--ink)" : "var(--brand)"}`,
          `transform:scale(${selected ? 1.2 : 1})`,
        ].join(";");
      }
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        content: el,
        title: pin.title,
        zIndex: selected ? 10 : 1,
      });
      marker.addListener("click", () => {
        onSelect?.(pin.id);
        if (pin.info) {
          infoWindowRef.current ??= new google.maps.InfoWindow();
          infoWindowRef.current.setContent(buildInfoContent(pin.info));
          infoWindowRef.current.open({ map, anchor: marker });
        }
      });
      return marker;
    });
    return () => {
      markers.forEach((marker) => (marker.map = null));
      infoWindowRef.current?.close();
    };
  }, [map, pins, selectedId, onSelect]);

  // Fit the view whenever the set of stops changes.
  const fitKey = pins.map((p) => p.id).join("|");
  useEffect(() => {
    if (!map) return;
    if (pins.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 64);
    } else if (pins.length === 1 && !areaKey) {
      map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
      map.setZoom(13);
    } else if (areaKey) {
      const bounds = new google.maps.LatLngBounds();
      areaKey.split("|").forEach((part) => {
        const [lat, lng, km] = part.split(",").map(Number);
        bounds.union(new google.maps.Circle({ center: { lat, lng }, radius: km * 1000 }).getBounds()!);
      });
      map.fitBounds(bounds, 48);
    } else if (centerLat != null && centerLng != null) {
      map.setCenter({ lat: centerLat, lng: centerLng });
      // Zoom so the whole trip area is visible.
      const km = radiusKm > 0 ? radiusKm : 12;
      map.setZoom(Math.max(4, Math.min(13, Math.round(14 - Math.log2(km)))));
    }
    // fitKey stands in for `pins`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, areaKey, centerLat, centerLng, radiusKm]);

  // Follow the selected stop.
  useEffect(() => {
    if (!map || !selectedId) return;
    const pin = pins.find((p) => p.id === selectedId);
    if (pin) map.panTo({ lat: pin.lat, lng: pin.lng });
    // Only pan when the selection changes, not when pins re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId]);

  // The "maybe add this" preview pin.
  const previewLat = preview?.lat;
  const previewLng = preview?.lng;
  const previewTitle = preview?.title;
  useEffect(() => {
    if (!map || previewLat == null || previewLng == null) return;
    const el = document.createElement("div");
    el.textContent = "＋";
    el.style.cssText =
      "display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;" +
      "font:700 20px system-ui;color:var(--on-accent);background:var(--accent);border:3px solid #fff;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.4)";
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: { lat: previewLat, lng: previewLng },
      content: el,
      title: previewTitle,
      zIndex: 20,
    });
    map.panTo({ lat: previewLat, lng: previewLng });
    if ((map.getZoom() ?? 0) < 12) map.setZoom(13);
    return () => {
      marker.map = null;
    };
  }, [map, previewLat, previewLng, previewTitle]);

  if (status === "off" || status === "error") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-raised p-6 text-center",
          className,
        )}
        role="status"
      >
        <MapPinOff size={26} strokeWidth={1.7} className="text-muted" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted">{mapsProblem(status)}</p>
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl border border-line bg-raised", className)}
    >
      <div ref={container} className="h-full w-full" role="application" aria-label={ariaLabel} />
      {!map ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm text-muted"
          role="status"
        >
          Loading map…
        </div>
      ) : null}
    </div>
  );
}
