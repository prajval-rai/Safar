"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { JaliPattern, MotifDivider } from "@/components/art/Motif";
import { TripCover } from "@/components/art/TripCover";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { API_BASE, ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useTripTheme } from "@/lib/tripTheme";
import type { TripSummary, XPResult } from "@/lib/types";
import { dateRange, formatNumber, rupees } from "@/lib/utils";

/**
 * The one screen where the Indian visual identity gets to be loud: a big cover,
 * the numbers from the journey, and the route drawn out end to end.
 */
export default function TripCompletePage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApi<TripSummary>(`/api/trips/${id}/summary/`);
  const [sheet, setSheet] = useState<"track" | "post" | null>(null);
  useTripTheme(data?.trip.theme);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <LoadingBlock label="Putting your trip story together…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <ErrorNote message={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return null;

  const { trip } = data;

  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        <Link href={`/trips/${trip.id}`} className="text-sm font-semibold text-muted hover:text-ink">
          <span aria-hidden="true">←</span> Back to trip
        </Link>

        <section className="relative mt-4 overflow-hidden rounded-3xl">
          <TripCover
            cover={trip.cover_key}
            image={trip.cover_image || undefined}
            alt={`${trip.destination} illustration`}
            rounded={false}
            className="h-56 w-full sm:h-72"
          >
            <p className="text-sm font-bold tracking-widest text-white/90 uppercase drop-shadow">
              Trip complete <span aria-hidden="true">🎉</span>
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-white drop-shadow sm:text-4xl">
              {trip.title}
            </h1>
            <p className="text-sm text-white/90 drop-shadow">
              {trip.destination} · {dateRange(trip.start_date, trip.end_date)}
            </p>
          </TripCover>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BigStat value={data.days} label={data.days === 1 ? "Day" : "Days"} />
          <BigStat value={data.locations} label="Locations" />
          <BigStat value={data.activities_completed} label="Activities" />
          <BigStat value={formatNumber(data.xp)} label="XP earned" />
        </section>

        <MotifDivider className="my-7" />

        <section aria-labelledby="route-heading">
          <h2 id="route-heading" className="mb-3 text-lg font-bold text-ink">
            Your journey
          </h2>
          <ol className="card relative overflow-hidden p-4">
            <div className="absolute inset-0 text-brand/[0.06]" aria-hidden="true">
              <JaliPattern />
            </div>
            {data.route.map((stop, index) => (
              <li key={`${stop}-${index}`} className="relative flex items-center gap-3 py-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-brand"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="text-[15px] font-semibold text-ink">{stop}</span>
                {index < data.route.length - 1 ? (
                  <span className="ml-auto text-muted" aria-hidden="true">
                    ↓
                  </span>
                ) : (
                  <span className="ml-auto text-lg" aria-hidden="true">
                    🏁
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        {data.leaderboard.length > 1 ? (
          <section className="mt-6" aria-labelledby="crew-heading">
            <h2 id="crew-heading" className="mb-3 text-lg font-bold text-ink">
              Your crew
            </h2>
            <ul className="card divide-y divide-[var(--line)]">
              {data.leaderboard.map((row, index) => (
                <li key={row.user.id} className="flex items-center gap-3 p-3.5">
                  <span className="w-5 text-sm font-bold text-muted">{index + 1}</span>
                  <Avatar user={row.user} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                    {row.user.name}
                  </span>
                  <span className="text-sm font-bold text-brand">{formatNumber(row.xp)} XP</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.experiences.length ? (
          <section className="mt-6" aria-labelledby="experiences-heading">
            <h2 id="experiences-heading" className="mb-3 text-lg font-bold text-ink">
              How it went
            </h2>
            <ul className="space-y-3">
              {data.experiences.map((entry) => (
                <li key={entry.id} className="card p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar user={entry.user} size="sm" />
                    <span className="text-sm font-semibold text-ink">{entry.user.name}</span>
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink">
                    {entry.text}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.total_spend > 0 ? (
          <section className="card mt-6 p-4">
            <h2 className="text-sm font-bold text-muted">What it cost</h2>
            <p className="mt-1 text-2xl font-extrabold text-ink">{rupees(data.total_spend)}</p>
            <p className="text-sm text-muted">{rupees(data.spend_per_person)} per person</p>
          </section>
        ) : null}

        {data.memories.length ? (
          <section className="mt-6" aria-labelledby="memories-heading">
            <h2 id="memories-heading" className="mb-3 text-lg font-bold text-ink">
              Memories
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.memories.map((memory) => (
                <li key={memory.id} className="card overflow-hidden">
                  {memory.image || memory.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={memory.image ? `${API_BASE}${memory.image}` : memory.image_url}
                      alt={memory.caption || "Trip photo"}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-brand-soft text-3xl">
                      <span aria-hidden="true">📷</span>
                    </div>
                  )}
                  <p className="p-2 text-xs text-muted">{memory.caption}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 space-y-2">
          <Button fullWidth size="lg" icon="🧭" onClick={() => setSheet("track")}>
            Create a trip track
          </Button>
          <Button fullWidth size="lg" variant="secondary" icon="✍️" onClick={() => setSheet("post")}>
            Write a travel post
          </Button>
          <ButtonLink href="/trips" fullWidth size="lg" variant="ghost">
            Back to my trips
          </ButtonLink>
        </section>
      </div>

      <TrackSheet
        open={sheet === "track"}
        onClose={() => setSheet(null)}
        tripId={trip.id}
        defaultTitle={trip.title}
        defaultSummary={trip.summary}
      />
      <PostSheet open={sheet === "post"} onClose={() => setSheet(null)} tripId={trip.id} />
    </div>
  );
}

function BigStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card px-3 py-4 text-center">
      <p className="text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function TrackSheet({
  open,
  onClose,
  tripId,
  defaultTitle,
  defaultSummary,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  defaultTitle: string;
  defaultSummary: string;
}) {
  const router = useRouter();
  const { celebrate, toast } = useCelebration();
  const [form, setForm] = useState({
    title: defaultTitle,
    summary: defaultSummary,
    best_season: "",
  });
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    try {
      const result = await api.post<{
        track: { id: string };
        xp_awarded: number;
        user: XPResult["user"];
      }>("/api/explore/tracks/from-trip/", { trip: tripId, ...form });
      celebrate({ user: result.user, xp_awarded: result.xp_awarded });
      router.push(`/explore/${result.track.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't publish that.", "error");
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Create a trip track"
      description="Turn your journey into a track others can follow. Worth +150 XP."
      footer={
        <Button fullWidth size="lg" onClick={publish} disabled={busy}>
          {busy ? "Publishing…" : "Publish track"}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Track name"
          data-autofocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <TextAreaField
          label="What should people know?"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          placeholder="North Goa for the energy, South Goa for the quiet."
        />
        <TextField
          label="Best time to go"
          value={form.best_season}
          onChange={(e) => setForm({ ...form, best_season: e.target.value })}
          placeholder="November to February"
        />
      </div>
    </Sheet>
  );
}

function PostSheet({
  open,
  onClose,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
}) {
  const router = useRouter();
  const { toast } = useCelebration();
  const [caption, setCaption] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);

  async function post() {
    setBusy(true);
    try {
      await api.post("/api/explore/posts/", { trip: tripId, caption: caption.trim(), place });
      toast("Posted to Explore.");
      router.push("/explore");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't post that.", "error");
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Write a travel post"
      description="One tip or story from the trip. Keep it short."
      footer={
        <Button fullWidth size="lg" onClick={post} disabled={busy || !caption.trim()}>
          {busy ? "Posting…" : "Post"}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextAreaField
          label="Your post"
          data-autofocus
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Amer Fort before 9 AM = no queue, no heat."
        />
        <TextField
          label="Where was this?"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Amer Fort, Jaipur"
        />
      </div>
    </Sheet>
  );
}
