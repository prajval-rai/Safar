"use client";

import { Download, Share2, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { GoogleMap, type MapPin, type MapRegion } from "@/components/maps/GoogleMap";
import { Button } from "@/components/ui/Button";
import { geoPins, INDIA_BOUNDS, mapPins, percent, stateRegions, tierFor, TOTAL_STATES, visitedStates } from "@/lib/indiaMap";
import { renderShareCard } from "@/lib/shareCard";
import type { TravelMapData } from "@/lib/types";
import { CATEGORY_ICONS, CATEGORY_LABELS, shortDate } from "@/lib/utils";

interface Props {
  data: TravelMapData;
  name: string;
  username: string;
  isMe: boolean;
}

/**
 * The profile's India achievement: every state and union territory the traveller
 * has finished a trip in is coloured in, with a completion ratio, a rank and a
 * share card built for Instagram.
 */
export function IndiaAchievementMap({ data, name, username, isMe }: Props) {
  const visited = useMemo(() => visitedStates(data), [data]);
  // The flat, fixed-projection pins the share-card PNG is drawn from.
  const shareCardPins = useMemo(() => mapPins(data), [data]);
  const count = visited.size;
  const pct = percent(count);
  const { current, next } = tierFor(count);
  const [selected, setSelected] = useState<string | null>(null);

  // The live Google Map: real state outlines coloured by "visited", and a pin
  // per stop with an icon for what kind of stop it was.
  const geo = useMemo(() => geoPins(data), [data]);
  const regions: MapRegion[] = useMemo(
    () =>
      stateRegions().map((r) => ({
        id: r.name,
        paths: r.paths,
        active: visited.has(r.name),
        title: r.name,
        onClick: () => setSelected((cur) => (cur === r.name ? null : r.name)),
      })),
    [visited],
  );
  const mapPinsForGoogle: MapPin[] = useMemo(
    () =>
      geo.map((p) => {
        const category = p.category ?? "sightseeing";
        return {
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          title: p.verified ? `${p.label} — ${CATEGORY_LABELS[category]}, been there` : p.label,
          icon: p.verified ? CATEGORY_ICONS[category] : undefined,
          hollow: !p.verified,
          info: p.verified
            ? {
                subtitle: `${CATEGORY_ICONS[category]} ${CATEGORY_LABELS[category]}`,
                title: p.label,
                meta: `${p.tripTitle} · ${new Date(p.when).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
                tag: "✓ Confirmed by location",
              }
            : {
                subtitle: "Trip destination",
                title: p.label,
                meta: `${p.tripTitle} · finished ${shortDate(p.when)}`,
              },
        };
      }),
    [geo],
  );
  function selectPin(id: string | null) {
    const pin = geo.find((p) => p.id === id);
    if (pin?.state) setSelected(pin.state);
  }

  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [making, setMaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const url = card?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [card]);

  const names = useMemo(() => [...visited.keys()].sort(), [visited]);

  async function makeCard() {
    setMaking(true);
    setNote(null);
    try {
      const blob = await renderShareCard({ name, username, visited: names, tier: current, pins: shareCardPins });
      setCard({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't create the image.");
    } finally {
      setMaking(false);
    }
  }

  async function share() {
    if (!card) return;
    const file = new File([card.blob], `${username}-india-map.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${name}'s India`,
          text: `I've explored ${pct}% of India on Safar 🇮🇳`,
        });
        return;
      }
      setNote("Sharing isn't available in this browser, so save the image and post it from your gallery.");
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setNote("Couldn't open the share sheet. Save the image instead.");
    }
  }

  function download() {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = `${username}-india-map.png`;
    a.click();
  }

  const tripCount = data.finished?.length ?? data.areas.length;
  const ranked = useMemo(
    () => [...visited.entries()].sort((x, y) => y[1].places.length + y[1].trips.length - (x[1].places.length + x[1].trips.length)),
    [visited],
  );
  const maxWeight = Math.max(1, ...ranked.map(([, j]) => j.places.length + j.trips.length));
  const goal = next ? next.min - count : 0;
  const ring = 2 * Math.PI * 42;

  return (
    <section className="card overflow-hidden" aria-labelledby="india-heading">
      <div className="bg-gradient-to-br from-brand-soft to-canvas p-5 pb-3">
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="var(--brand-bright)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={ring}
                strokeDashoffset={ring * (1 - count / TOTAL_STATES)}
                style={{ transition: "stroke-dashoffset 900ms ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold leading-none text-ink">{pct}%</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">of India</span>
            </div>
          </div>
          <div className="min-w-0">
            <h2 id="india-heading" className="flex items-center gap-2 text-lg font-bold text-ink">
              <Trophy size={20} strokeWidth={1.8} className="shrink-0 text-brand" aria-hidden="true" />
              {isMe ? "My India" : `${name}'s India`}
            </h2>
            <p className="mt-0.5 text-sm font-bold text-brand">
              <span aria-hidden="true">{current.emoji} </span>
              {current.title}
            </p>
            <p className="text-sm text-muted">
              {count} of {TOTAL_STATES} states &amp; UTs explored
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div
            className="h-2.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuenow={count}
            aria-valuemin={0}
            aria-valuemax={TOTAL_STATES}
            aria-label="States explored"
          >
            <div
              className="h-full rounded-full bg-brand-bright transition-[width] duration-700"
              style={{ width: `${Math.max(count ? 4 : 0, (count / TOTAL_STATES) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {next
              ? `${goal} more ${goal === 1 ? "state" : "states"} to become a ${next.title} ${next.emoji}`
              : "You've reached the highest rank. Sampoorna Yatri! 👑"}
          </p>
        </div>
      </div>

      <div className="px-3 pb-2 pt-3 sm:px-5">
        <GoogleMap
          ariaLabel={`Map of India with ${count} of ${TOTAL_STATES} states and union territories coloured in`}
          pins={mapPinsForGoogle}
          regions={regions}
          bounds={INDIA_BOUNDS}
          selectedId={null}
          onSelect={selectPin}
          className="mx-auto h-[24rem] w-full sm:h-[30rem]"
        />

        <p className="mt-1.5 text-center text-xs text-muted">
          Pinch or scroll to zoom in, tap a pin for details. An icon shows what kind of stop it was —{" "}
          {CATEGORY_ICONS.food} food, {CATEGORY_ICONS.adventure} adventure, {CATEGORY_ICONS.sightseeing} sightseeing…
          · a hollow ring marks a trip destination.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pt-3 text-center sm:px-5">
        <Tally value={tripCount} label={tripCount === 1 ? "trip done" : "trips done"} />
        <Tally value={data.places.length} label="places stood at" />
        <Tally value={count} label={count === 1 ? "state" : "states"} />
      </div>

      {ranked.length ? (
        <div className="px-4 pb-4 pt-4 sm:px-5" aria-live="polite">
          <h3 className="mb-2 text-sm font-bold text-ink">{isMe ? "What I've done where" : "What they've done where"}</h3>
          <ul className="space-y-2">
            {ranked.map(([state, j]) => {
              const open = selected === state;
              const weight = j.places.length + j.trips.length;
              return (
                <li key={state} className={open ? "rounded-xl bg-brand-soft/60 p-3" : "rounded-xl bg-raised/60 p-3"}>
                  <button
                    type="button"
                    className="block w-full text-left"
                    aria-expanded={open}
                    onClick={() => setSelected(open ? null : state)}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-bold text-ink">{state}</span>
                      <span className="text-xs text-muted">
                        {j.trips.length} {j.trips.length === 1 ? "trip" : "trips"}
                        {j.places.length ? ` · ${j.places.length} ${j.places.length === 1 ? "place" : "places"}` : ""}
                      </span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-brand-bright"
                        style={{ width: `${Math.max(8, (weight / maxWeight) * 100)}%` }}
                      />
                    </span>
                  </button>
                  {open ? (
                    <div className="mt-2.5 space-y-2 text-sm">
                      <p className="text-muted">
                        <span className="font-semibold text-ink">Trips: </span>
                        {j.trips.join(", ")}
                      </p>
                      {j.places.length ? (
                        <ul className="flex flex-wrap gap-1.5" aria-label={`Places in ${state}`}>
                          {j.places.map((pl) => (
                            <li key={pl} className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                              ✓ {pl}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted">No stops confirmed by location here yet.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="px-5 pb-4 pt-3 text-sm text-muted">
          {isMe
            ? "Finish a trip and the state lights up here. Make trips public to show them on your profile."
            : "No finished public trips yet."}
        </p>
      )}

      {isMe ? (
        <div className="border-t border-line bg-raised/50 p-4 sm:p-5">
          {!card ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 text-sm text-muted">
                Turn your map into a picture for Instagram, WhatsApp or anywhere else.
              </p>
              <Button onClick={makeCard} disabled={making} icon={<Share2 size={18} />}>
                {making ? "Creating…" : "Create share card"}
              </Button>
            </div>
          ) : (
            <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, next/image can't optimise it */}
              <img
                src={card.url}
                alt={`Your India map card: ${pct}% explored, ${count} of ${TOTAL_STATES} states`}
                className="mx-auto w-full max-w-[14rem] rounded-xl border border-line shadow-md"
              />
              <div className="space-y-2.5">
                <p className="text-sm font-semibold text-ink">Ready to post 🎉</p>
                <p className="text-xs text-muted">
                  On a phone, Share opens your apps — pick Instagram. On a laptop, save the image and upload it.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={share} icon={<Share2 size={18} />}>
                    Share
                  </Button>
                  <Button variant="secondary" onClick={download} icon={<Download size={18} />}>
                    Save image
                  </Button>
                  <Button variant="ghost" onClick={makeCard} disabled={making}>
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          )}
          {note ? (
            <p className="mt-3 text-sm text-muted" role="status">
              {note}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Tally({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-raised/60 px-2 py-2.5">
      <p className="text-xl font-extrabold text-ink">{value}</p>
      <p className="text-[11px] leading-tight text-muted">{label}</p>
    </div>
  );
}
