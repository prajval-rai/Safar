"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { TripCover } from "@/components/art/TripCover";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { TrackDetail, TripDetail } from "@/lib/types";
import {
  CATEGORY_ICONS,
  TRIP_TYPE_LABELS,
  clockTime,
  formatNumber,
  rupees,
  todayISO,
} from "@/lib/utils";

export default function TrackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: track, loading, error, reload } = useApi<TrackDetail>(`/api/explore/tracks/${id}/`);
  const [useOpen, setUseOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useCelebration();

  if (loading) return <LoadingBlock label="Loading this track…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!track) return null;

  async function toggleSave() {
    if (!track) return;
    const result = await api.post<{ saved: boolean }>(`/api/explore/tracks/${track.id}/save/`);
    setSaved(result.saved);
    toast(result.saved ? "Saved to your list." : "Removed from your list.");
  }

  const isSaved = saved || track.saved;

  return (
    <div className="space-y-4">
      <Link href="/explore" className="inline-block text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> Explore
      </Link>

      <TripCover
        cover={track.cover_key}
        image={track.cover_image || undefined}
        alt={`${track.destination} illustration`}
        className="h-44 w-full sm:h-56"
      >
        <h1 className="text-2xl font-extrabold text-white drop-shadow sm:text-3xl">{track.title}</h1>
        <p className="text-sm text-white/90 drop-shadow">
          <span aria-hidden="true">📍</span> {track.destination}
          {track.region ? `, ${track.region}` : ""}
        </p>
      </TripCover>

      <div className="flex flex-wrap gap-2">
        <Chip tone="brand">
          {track.days} {track.days === 1 ? "day" : "days"}
        </Chip>
        <Chip>{track.stop_count} stops</Chip>
        <Chip>{TRIP_TYPE_LABELS[track.trip_type] ?? track.trip_type}</Chip>
        <Chip>{track.difficulty}</Chip>
        {track.estimated_cost ? <Chip>{rupees(track.estimated_cost)} each</Chip> : null}
        {track.best_season ? <Chip tone="accent">Best: {track.best_season}</Chip> : null}
      </div>

      {track.summary ? <p className="text-[15px] text-ink">{track.summary}</p> : null}

      <Link
        href={`/u/${track.author.username}`}
        className="card flex items-center gap-3 p-3.5 transition-colors hover:bg-raised"
      >
        <Avatar user={track.author} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{track.author.name}</p>
          <p className="text-xs text-muted">
            Level {track.author.level} · {formatNumber(track.likes_count)} likes
          </p>
        </div>
        <span className="text-sm font-semibold text-brand">View profile</span>
      </Link>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="lg" icon="➕" onClick={() => setUseOpen(true)}>
          Use this track
        </Button>
        <Button size="lg" variant="secondary" onClick={toggleSave}>
          <span aria-hidden="true">{isSaved ? "🔖" : "📑"}</span>
          {isSaved ? "Saved" : "Save for later"}
        </Button>
      </div>

      {track.route.length ? (
        <section className="card p-4">
          <h2 className="text-sm font-bold text-muted">The route</h2>
          <p className="mt-1 text-[15px] font-semibold text-ink">{track.route.join(" → ")}</p>
        </section>
      ) : null}

      <section aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="mb-3 text-lg font-bold text-ink">
          Day by day
        </h2>
        <div className="space-y-3">
          {track.track_days.map((day) => (
            <details key={day.id} className="card p-4" open={day.index === 1}>
              <summary className="cursor-pointer text-[15px] font-bold text-ink">
                Day {day.index}
                <span className="ml-2 text-sm font-normal text-muted">
                  {day.stops.length} {day.stops.length === 1 ? "stop" : "stops"}
                </span>
              </summary>
              <ol className="mt-3 space-y-2">
                {day.stops.map((stop) => (
                  <li key={stop.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-lg" aria-hidden="true">
                      {CATEGORY_ICONS[stop.category] ?? "📍"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{stop.title}</p>
                      <p className="text-xs text-muted">
                        {[stop.place_name, clockTime(stop.start_time), stop.cost ? rupees(stop.cost) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Chip tone="brand">+{stop.xp_value}</Chip>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>

      <UseTrackSheet
        open={useOpen}
        onClose={() => setUseOpen(false)}
        trackId={track.id}
        defaultTitle={track.title}
      />
    </div>
  );
}

function UseTrackSheet({
  open,
  onClose,
  trackId,
  defaultTitle,
}: {
  open: boolean;
  onClose: () => void;
  trackId: string;
  defaultTitle: string;
}) {
  const router = useRouter();
  const { toast } = useCelebration();
  const [title, setTitle] = useState(defaultTitle);
  const [startDate, setStartDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const trip = await api.post<TripDetail>(`/api/explore/tracks/${trackId}/use/`, {
        start_date: startDate,
        title: title.trim(),
      });
      toast("Copied into your trips — edit anything you like.");
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't copy that track.", "error");
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Make this your trip"
      description="We'll copy every day and stop into a new trip you can edit."
      footer={
        <Button fullWidth size="lg" onClick={go} disabled={busy || !startDate}>
          {busy ? "Creating…" : "Create my trip"}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Call it"
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          label="Starting on"
          type="date"
          value={startDate}
          min={todayISO()}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
