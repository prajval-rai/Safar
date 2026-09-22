"use client";

import { MapPin, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { describeGoogleError, loadMaps, mapsProblem, useMapsStatus } from "@/lib/maps";
import { toPicked } from "@/lib/places";
import type { PickedPlace } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Suggestion {
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

interface Props {
  label: string;
  placeholder?: string;
  hint?: string;
  /** Prefer results near this point (the trip's destination). */
  bias?: { lat: number; lng: number; radiusKm: number } | null;
  onPick: (place: PickedPlace) => void;
  autoFocus?: boolean;
}

/**
 * Autocomplete over Google Places (New), limited to India. Picking a result
 * fetches the place's coordinates once and hands them to the caller to save.
 */
export function PlaceSearch({ label, placeholder, hint, bias, onPick, autoFocus }: Props) {
  const status = useMapsStatus();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const biasLat = bias?.lat;
  const biasLng = bias?.lng;
  const biasRadius = bias?.radiusKm;

  // Debounced lookup; state is only set from inside the timer/promise callbacks.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const text = query.trim();
      if (text.length < 2) {
        setItems([]);
        return;
      }
      try {
        await loadMaps();
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        token.current ??= new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: token.current,
          includedRegionCodes: ["in"],
          language: "en",
          ...(biasLat != null && biasLng != null
            ? {
                locationBias: {
                  center: { lat: biasLat, lng: biasLng },
                  radius: Math.min(50_000, Math.max(5_000, (biasRadius ?? 10) * 2000)),
                },
              }
            : {}),
        });
        if (cancelled) return;
        setFailed(null);
        setItems(
          suggestions
            .flatMap((s) => (s.placePrediction ? [s.placePrediction] : []))
            .map((prediction) => ({
              prediction,
              main: prediction.mainText?.text ?? prediction.text.text,
              secondary: prediction.secondaryText?.text ?? "",
            })),
        );
        setActive(-1);
      } catch (err) {
        if (!cancelled) {
          setFailed(describeGoogleError(err));
          setItems([]);
        }
      }
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, status, biasLat, biasLng, biasRadius]);

  async function choose(suggestion: Suggestion) {
    setBusy(true);
    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({
        fields: [
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
        ],
      });
      const picked = toPicked(place);
      if (picked) {
        onPick(picked);
        setQuery(picked.name);
      }
      // A new session begins after every completed pick.
      token.current = null;
      setOpen(false);
      setItems([]);
    } catch (err) {
      setFailed(describeGoogleError(err));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      void choose(items[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const unavailable = status === "off" || status === "error";

  return (
    <div
      ref={wrapper}
      className="relative"
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint ? <p className="mb-1.5 text-xs text-muted">{hint}</p> : null}

      <div className="relative">
        <Search
          size={18}
          strokeWidth={1.9}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          value={query}
          disabled={unavailable}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={unavailable ? "Search is unavailable right now" : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-[48px] w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none disabled:opacity-60"
        />
      </div>

      {unavailable ? <p className="mt-1.5 text-xs text-muted">{mapsProblem(status)}</p> : null}
      {failed && !unavailable ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {failed}
        </p>
      ) : null}

      {open && items.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {items.map((item, index) => (
            <li
              key={item.prediction.placeId}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={index === active}
            >
              <button
                type="button"
                // mousedown keeps the input focused so the list doesn't close first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(item)}
                disabled={busy}
                className={cn(
                  "flex min-h-[50px] w-full items-center gap-3 rounded-xl px-3 text-left transition-colors",
                  index === active ? "bg-raised" : "hover:bg-raised",
                )}
              >
                <MapPin size={18} strokeWidth={1.8} className="shrink-0 text-brand" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.main}</span>
                  <span className="block truncate text-xs text-muted">{item.secondary}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
