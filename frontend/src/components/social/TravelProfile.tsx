"use client";

import { Award, PenLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ErrorNote, LoadingBlock, StatTile } from "@/components/ui/Bits";
import { useApi } from "@/lib/hooks";
import { useMapsStatus } from "@/lib/maps";
import { searchText } from "@/lib/places";
import { saveDestination } from "@/lib/tripPlaces";
import type { PublicProfile, TravelMapData } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

import { PostList } from "@/components/explore/Cards";
import { IndiaAchievementMap } from "./IndiaAchievementMap";
import { PeopleSheet, type PeopleKind } from "./PeopleSheet";

/**
 * Everything below a profile's header: follow counts, the map of places the
 * traveller has really been, and their achievements. Used on your own profile
 * and on other people's.
 */
export function ProfileExtras({ username, isMe }: { username: string; isMe: boolean }) {
  const { data, error, reload } = useApi<PublicProfile>(`/api/users/${encodeURIComponent(username)}/`);
  const [people, setPeople] = useState<PeopleKind | null>(null);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <LoadingBlock label="Loading profile…" />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountButton value={data.followers_count} label="Followers" onClick={() => setPeople("followers")} />
        <CountButton value={data.following_count} label="Following" onClick={() => setPeople("following")} />
        <StatTile emoji="🏁" value={data.stats.trips_completed} label="Trips done" />
        <StatTile emoji="📍" value={data.stats.places_verified} label="Places been to" />
      </div>

      <TravelMapCard username={username} name={data.user.name || data.user.username} isMe={isMe} />

      <section className="card p-5" aria-labelledby="ach-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="ach-heading" className="flex items-center gap-2 text-lg font-bold text-ink">
            <Award size={20} strokeWidth={1.8} className="text-brand" aria-hidden="true" />
            Achievements
          </h2>
          {isMe ? (
            <Link href="/rewards" className="text-sm font-semibold text-brand">
              See all
            </Link>
          ) : null}
        </div>
        {data.achievements.length ? (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {data.achievements.map((a) => (
              <li key={a.code} className="flex items-center gap-3 rounded-xl bg-brand-soft/50 p-3">
                <span className="text-2xl" aria-hidden="true">
                  {a.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">{a.title}</span>
                  <span className="block truncate text-xs text-muted">{a.description}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {isMe ? "Complete a stop to earn your first achievement." : "No achievements yet."}
          </p>
        )}
      </section>

      <section aria-labelledby="stories-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="stories-heading" className="flex items-center gap-2 text-lg font-bold text-ink">
            <PenLine size={20} strokeWidth={1.8} className="text-brand" aria-hidden="true" />
            Travel stories
          </h2>
          {isMe ? (
            <Link href="/feed" className="text-sm font-semibold text-brand">
              Write a post
            </Link>
          ) : null}
        </div>
        <PostList query="" author={username} />
      </section>

      {people ? (
        <PeopleSheet
          username={username}
          kind={people}
          onClose={() => {
            setPeople(null);
            // Counts can change while the sheet is open (following someone from the list).
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function CountButton({ value, label, onClick }: { value: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex flex-col items-center justify-center px-2 py-3 text-center transition-colors hover:bg-raised"
    >
      <span className="text-lg font-bold text-ink sm:text-xl">{formatNumber(value)}</span>
      <span className="text-[11px] leading-tight text-muted sm:text-xs">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------- travel map */

function TravelMapCard({ username, name, isMe }: { username: string; name: string; isMe: boolean }) {
  const status = useMapsStatus();
  const { data, loading, error, reload } = useApi<TravelMapData>(
    `/api/users/${encodeURIComponent(username)}/travel-map/`,
  );
  // Trips finished before we stored Google coordinates: look each destination up
  // once, save it, and the area then appears — and stays — from our own database.
  const backfilled = useRef(false);
  const pending = useMemo(() => data?.needs_coords ?? [], [data]);
  useEffect(() => {
    if (!isMe || status !== "ready" || backfilled.current || pending.length === 0) return;
    backfilled.current = true;
    (async () => {
      for (const trip of pending) {
        try {
          const [place] = await searchText(
            [trip.destination, trip.region, "India"].filter(Boolean).join(", "),
            { max: 1 },
          );
          if (place) await saveDestination(trip.trip_id, place);
        } catch {
          /* leave this trip for next time */
        }
      }
      reload();
    })();
  }, [isMe, status, pending, reload]);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <LoadingBlock label="Loading map…" />;
  if (!data) return null;
  if (pending.length > 0 && isMe && status === "ready" && !data.finished?.length) {
    return (
      <p className="card px-4 py-6 text-center text-sm text-muted" role="status">
        Adding your past trips to the map…
      </p>
    );
  }
  return <IndiaAchievementMap data={data} name={name} username={username} isMe={isMe} />;
}
