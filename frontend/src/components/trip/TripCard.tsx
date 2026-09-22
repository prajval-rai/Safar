"use client";

import Link from "next/link";

import { TripCover } from "@/components/art/TripCover";
import { Chip, Progress } from "@/components/ui/Bits";
import type { Trip } from "@/lib/types";
import {
  TRIP_TYPE_LABELS,
  dateRange,
  formatNumber,
  relativeDays,
  statusBadge,
} from "@/lib/utils";

/**
 * Horizontal on laptops, stacked on phones — the same card, re-laid out rather
 * than shrunk. Everything a traveller wants at a glance: where, when, how far
 * along, and how much XP.
 */
export function TripCard({ trip }: { trip: Trip }) {
  const badge = statusBadge(trip.status);

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-md sm:flex-row"
    >
      <TripCover
        cover={trip.cover_key}
        image={trip.cover_image || undefined}
        alt={`${trip.destination} illustration`}
        rounded={false}
        className="h-36 w-full shrink-0 sm:h-auto sm:w-44 lg:w-56"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            tone={
              trip.status === "active" ? "success" : trip.status === "completed" ? "brand" : "neutral"
            }
          >
            <span aria-hidden="true">{badge.mark}</span>
            {badge.label}
          </Chip>
          <Chip>{TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type}</Chip>
        </div>

        <div>
          <h3 className="truncate text-base font-bold text-ink sm:text-lg">{trip.title}</h3>
          <p className="truncate text-sm text-muted">
            <span aria-hidden="true">📍</span> {trip.destination}
            {trip.region ? `, ${trip.region}` : ""}
          </p>
        </div>

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <div className="flex gap-1">
            <dt className="sr-only-text">Dates</dt>
            <dd>{dateRange(trip.start_date, trip.end_date)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only-text">Length</dt>
            <dd>
              {trip.duration_days} {trip.duration_days === 1 ? "day" : "days"}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only-text">Activities</dt>
            <dd>{trip.activity_count} activities</dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only-text">Travellers</dt>
            <dd>
              {trip.member_count} {trip.member_count === 1 ? "person" : "people"}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center gap-3 pt-1">
          <div className="min-w-0 flex-1">
            <Progress
              value={trip.progress_percent}
              size="sm"
              label={
                trip.status === "planning"
                  ? relativeDays(trip.start_date)
                  : `${trip.progress_percent}% complete`
              }
              tone={trip.status === "completed" ? "success" : "brand"}
            />
          </div>
          <span className="shrink-0 text-sm font-bold text-brand">
            <span aria-hidden="true">⭐</span> {formatNumber(trip.total_xp)} XP
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Vertical card for the My Trips grid: big cover on top, facts underneath. */
export function TripGridCard({ trip }: { trip: Trip }) {
  const badge = statusBadge(trip.status);

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="card group flex h-full flex-col overflow-hidden rounded-[22px] transition-shadow hover:shadow-md"
    >
      <TripCover
        cover={trip.cover_key}
        image={trip.cover_image || undefined}
        alt={`${trip.destination} illustration`}
        rounded={false}
        className="h-44 w-full"
      />
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            tone={
              trip.status === "active" ? "success" : trip.status === "completed" ? "brand" : "neutral"
            }
          >
            <span aria-hidden="true">{badge.mark}</span>
            {badge.label}
          </Chip>
          <Chip>{TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type}</Chip>
        </div>
        <div>
          <h3 className="truncate text-lg font-bold text-ink">{trip.title}</h3>
          <p className="truncate text-sm text-muted">
            {trip.destination}
            {trip.region ? `, ${trip.region}` : ""}
          </p>
        </div>
        <p className="text-sm text-muted">
          {dateRange(trip.start_date, trip.end_date)} · {trip.duration_days}{" "}
          {trip.duration_days === 1 ? "day" : "days"} · {trip.member_count}{" "}
          {trip.member_count === 1 ? "person" : "people"}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-2">
          <div className="min-w-0 flex-1">
            <Progress
              value={trip.progress_percent}
              size="sm"
              label={
                trip.status === "planning"
                  ? relativeDays(trip.start_date)
                  : `${trip.progress_percent}% complete`
              }
              tone={trip.status === "completed" ? "success" : "brand"}
            />
          </div>
          <span className="shrink-0 text-sm font-bold text-brand">
            {formatNumber(trip.total_xp)} XP
          </span>
        </div>
      </div>
    </Link>
  );
}

/** The compact version used in horizontal scrollers on the home screen. */
export function TripTile({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="card w-[248px] shrink-0 overflow-hidden transition-shadow hover:shadow-md"
    >
      <TripCover
        cover={trip.cover_key}
        image={trip.cover_image || undefined}
        alt={`${trip.destination} illustration`}
        rounded={false}
        className="h-28 w-full"
      />
      <div className="p-3">
        <h3 className="truncate text-sm font-bold text-ink">{trip.title}</h3>
        <p className="truncate text-xs text-muted">
          {dateRange(trip.start_date, trip.end_date)} · {trip.duration_days}d
        </p>
        <div className="mt-2">
          <Progress value={trip.progress_percent} size="sm" />
        </div>
      </div>
    </Link>
  );
}
