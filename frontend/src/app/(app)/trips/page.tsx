"use client";

import { CalendarClock, CircleCheck,
  CircleX, Compass, History, LayoutGrid, Lightbulb, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { TripGridCard } from "@/components/trip/TripCard";
import { ErrorNote, SegmentedControl, Skeleton } from "@/components/ui/Bits";
import { ButtonLink } from "@/components/ui/Button";
import { rows } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Paginated, Trip } from "@/lib/types";

type Filter = "active" | "planning" | "completed" | "cancelled" | "past" | "all";

/** A past trip still being logged or reviewed — it isn't upcoming, and it
 *  isn't completed until an admin approves it. */
const inReview = (t: Trip) => t.is_past && t.review_status !== "approved";

const ICON = { size: 18, strokeWidth: 1.9 } as const;

export default function TripsPage() {
  const [filter, setFilter] = useState<Filter | null>(null);
  const { data, loading, error, reload } = useApi<Paginated<Trip>>("/api/trips/");

  const all = useMemo(() => rows(data), [data]);
  const counts = useMemo(
    () => ({
      active: all.filter((t) => t.status === "active").length,
      planning: all.filter((t) => t.status === "planning" && !inReview(t)).length,
      past: all.filter(inReview).length,
      completed: all.filter((t) => t.status === "completed").length,
      cancelled: all.filter((t) => t.status === "cancelled").length,
      all: all.length,
    }),
    [all],
  );

  // Land on Active when something is live, otherwise show everything.
  const current: Filter = filter ?? (counts.active > 0 ? "active" : "all");
  const trips =
    current === "all"
      ? all
      : current === "past"
        ? all.filter(inReview)
        : all.filter((t) => t.status === current && !inReview(t));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">My Trips</h1>
          <p className="mt-1 text-[15px] text-muted">
            Every journey you&apos;re planning, on, or have wrapped up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            href="/trips/past/new"
            variant="ghost"
            size="lg"
            icon={<History {...ICON} />}
            className="rounded-2xl"
          >
            Log a past trip
          </ButtonLink>
          <ButtonLink
            href="/trips/new"
            variant="secondary"
            size="lg"
            icon={<Compass {...ICON} />}
            className="hidden rounded-2xl sm:inline-flex"
          >
            Plan a Trip
          </ButtonLink>
        </div>
      </header>

      <div className="hide-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          label="Filter trips by status"
          value={current}
          onChange={setFilter}
          options={[
            { value: "active", label: "Active", icon: <Compass {...ICON} />, count: loading ? undefined : counts.active },
            { value: "planning", label: "Upcoming", icon: <CalendarClock {...ICON} />, count: loading ? undefined : counts.planning },
            { value: "completed", label: "Completed", icon: <CircleCheck {...ICON} />, count: loading ? undefined : counts.completed },
            ...(counts.past > 0
              ? [{ value: "past" as const, label: "Logged", icon: <History {...ICON} />, count: counts.past }]
              : []),
            ...(counts.cancelled > 0
              ? [{ value: "cancelled" as const, label: "Cancelled", icon: <CircleX {...ICON} />, count: counts.cancelled }]
              : []),
            { value: "all", label: "All", icon: <LayoutGrid {...ICON} />, count: loading ? undefined : counts.all },
          ]}
        />
      </div>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}

      {loading && !data ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite">
          <span className="sr-only-text">Loading your trips…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="card rounded-[22px] p-5">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="mt-5 h-4 w-2/3" />
              <Skeleton className="mt-3 h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : null}

      {data && !error ? (
        trips.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {trips.map((trip) => (
              <li key={trip.id}>
                <TripGridCard trip={trip} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            emoji="🧳"
            title={current === "all" ? "Your journey starts here." : "Nothing here yet."}
            line={
              current === "all"
                ? "Plan your first trip — it takes about a minute."
                : "Try another tab, or start something new."
            }
            action={<ButtonLink href="/trips/new">Plan a trip</ButtonLink>}
          />
        )
      ) : null}

      {/* Same dashed tip card as the reference: a quiet pointer, not a banner. */}
      <aside className="flex items-center gap-4 rounded-[22px] border border-dashed border-line px-6 py-8 text-[15px] text-muted">
        <Lightbulb size={22} strokeWidth={1.8} className="shrink-0 text-warn" aria-hidden="true" />
        <p>
          Tip: open any trip to enter the workspace — switch to{" "}
          <b className="text-ink">Live Trip Mode</b> from there for on-the-go check-ins, group chat
          and memory capture.
        </p>
      </aside>

      {/* Thumb-reachable primary action on phones. */}
      <ButtonLink
        href="/trips/new"
        aria-label="Plan a trip"
        className="fixed right-4 bottom-20 z-30 h-14 w-14 rounded-full p-0 shadow-lg sm:hidden"
      >
        <Plus size={26} aria-hidden="true" />
      </ButtonLink>
    </div>
  );
}
