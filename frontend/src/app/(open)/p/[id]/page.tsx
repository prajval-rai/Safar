"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { TripCover } from "@/components/art/TripCover";
import { PostCard } from "@/components/explore/Cards";
import { SoundtrackPlayer } from "@/components/explore/SoundtrackPlayer";
import { Chip, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { API_BASE } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useTripTheme } from "@/lib/tripTheme";
import type { PostStory } from "@/lib/types";
import { CATEGORY_ICONS, TRIP_TYPE_LABELS, clockTime, dateRange, shortDate } from "@/lib/utils";

/** Where a shared story lands — readable without an account. The post in
 *  full; and when its trip is public, the trip's photos and day-by-day plan. */
export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApi<PostStory>(`/api/explore/posts/${id}/story/`);
  useTripTheme(data?.post.theme);

  if (loading && !data) return <LoadingBlock label="Opening the story…" />;
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return null;

  const { post, trip } = data;

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Link href="/feed" className="text-sm font-semibold text-brand hover:underline">
        ← More stories on the Feed
      </Link>

      {trip ? (
        <section className="card overflow-hidden" aria-label="About the trip">
          <TripCover
            cover={trip.cover_key}
            image={trip.cover_image || undefined}
            alt={`${trip.destination} illustration`}
            rounded={false}
            className="h-48 w-full sm:h-56"
          >
            <Chip tone="brand" className="mb-2 w-fit bg-white/95">
              {TRIP_TYPE_LABELS[trip.trip_type] ?? "Trip"}
            </Chip>
            <h1 className="text-2xl font-extrabold text-white drop-shadow sm:text-3xl">{trip.title}</h1>
            <p className="text-sm text-white/90 drop-shadow">
              <span aria-hidden="true">📍</span> {trip.destination}
              {trip.region && !trip.destination.includes(trip.region) ? `, ${trip.region}` : ""} ·{" "}
              {dateRange(trip.start_date, trip.end_date)} · {trip.duration_days}{" "}
              {trip.duration_days === 1 ? "day" : "days"} · {trip.member_count}{" "}
              {trip.member_count === 1 ? "traveller" : "travellers"}
            </p>
          </TripCover>
        </section>
      ) : null}

      {trip && trip.photos.length ? (
        <section aria-labelledby="gallery-heading">
          <h2 id="gallery-heading" className="mb-3 text-lg font-bold text-ink">
            Gallery
          </h2>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {trip.photos.map((photo, i) => {
              const src = photo.image ? `${API_BASE}${photo.image}` : photo.image_url;
              return (
                <li key={i} className="overflow-hidden rounded-2xl bg-raised">
                  <a href={src} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={photo.caption || `Photo from ${trip.title}`}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full object-cover transition-transform hover:scale-105"
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* The story's soundtrack plays as background music — straight away when
          the browser allows it, otherwise from the visitor's first tap. */}
      {post.soundtrack ? (
        <section aria-label="Soundtrack">
          <SoundtrackPlayer
            song={post.soundtrack}
            variant="full"
            autoPlay
            gate={{
              heading: trip?.title || post.place || "A travel story",
              line: `A story by ${post.author.name}`,
            }}
          />
        </section>
      ) : null}

      <section aria-label="The story">
        <PostCard post={post} full />
      </section>

      {trip ? (
        <section aria-labelledby="plan-heading">
          <h2 id="plan-heading" className="mb-3 text-lg font-bold text-ink">
            The itinerary
          </h2>
          {trip.summary ? <p className="mb-3 text-[15px] leading-relaxed text-muted">{trip.summary}</p> : null}
          <ol className="space-y-3">
            {trip.days.map((day) => (
              <li key={day.index} className="card p-4">
                <p className="text-sm font-bold text-ink">
                  Day {day.index} · {shortDate(day.date)}
                  {day.title ? <span className="font-normal text-muted"> — {day.title}</span> : null}
                </p>
                {day.stops.length ? (
                  <ul className="mt-2.5 space-y-2">
                    {day.stops.map((stop, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <span aria-hidden="true">{CATEGORY_ICONS[stop.category]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold text-ink">{stop.title}</span>
                          {stop.place_name && stop.place_name !== stop.title ? (
                            <span className="text-muted"> · {stop.place_name}</span>
                          ) : null}
                        </span>
                        {stop.done ? (
                          <span className="shrink-0 text-xs font-semibold text-success">✓ Visited</span>
                        ) : stop.start_time ? (
                          <span className="shrink-0 text-xs font-semibold text-muted">{clockTime(stop.start_time)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-muted">A free day.</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : post.trip_title ? (
        <p className="card p-4 text-center text-sm text-muted">
          The rest of <b className="text-ink">{post.trip_title}</b> — its photos and plan — is private.
        </p>
      ) : null}
    </article>
  );
}
