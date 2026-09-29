"use client";

import { CalendarDays, MapPin, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { TripCover } from "@/components/art/TripCover";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, Skeleton } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { OpenTrip } from "@/lib/types";
import { TRIP_TYPE_LABELS, dateRange, relativeDays, rupees } from "@/lib/utils";

/** Explore → Open trips: real upcoming trips whose organisers let anyone join. */
export function OpenTripsList({ query }: { query: string }) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const { data, loading, error, reload } = useApi<OpenTrip[]>(`/api/explore/open-trips/?${params}`);

  if (loading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status">
        <span className="sr-only-text">Loading open trips…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-full rounded-[22px]" />
        ))}
      </div>
    );
  }
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data?.length) {
    return (
      <EmptyState
        emoji="🎒"
        title="No open trips right now."
        line="Planning one? Open it to join from its Settings, and travellers can find it here."
        action={<ButtonLink href="/trips/new">Plan a trip</ButtonLink>}
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((trip) => (
        <li key={trip.id}>
          <OpenTripCard trip={trip} />
        </li>
      ))}
    </ul>
  );
}

function OpenTripCard({ trip }: { trip: OpenTrip }) {
  const router = useRouter();
  const { toast } = useCelebration();
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    try {
      await api.post(`/api/explore/open-trips/${trip.id}/join/`);
      toast(`You're in — ${trip.title}`);
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't join that trip.", "error");
      setBusy(false);
    }
  }

  return (
    <article className="card flex h-full flex-col overflow-hidden">
      <TripCover
        cover={trip.cover_key}
        image={trip.cover_image || undefined}
        alt={`${trip.destination} illustration`}
        className="h-36 w-full"
      >
        <Chip tone={trip.status === "active" ? "success" : "brand"} className="w-fit bg-white/95">
          {trip.status === "active" ? "● Happening now" : `Starts ${relativeDays(trip.start_date)}`}
        </Chip>
      </TripCover>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-lg font-extrabold text-ink">{trip.title}</h3>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin size={14} aria-hidden="true" /> {trip.destination}
            {trip.region ? `, ${trip.region}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip>
            <CalendarDays size={12} aria-hidden="true" /> {dateRange(trip.start_date, trip.end_date)}
          </Chip>
          <Chip>
            <Users size={12} aria-hidden="true" /> {trip.member_count} going
          </Chip>
          <Chip>{TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type}</Chip>
          {trip.budget_per_person ? <Chip>{rupees(trip.budget_per_person)} / person</Chip> : null}
        </div>
        {trip.summary ? <p className="line-clamp-2 text-sm text-ink">{trip.summary}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
            <Avatar user={trip.organiser} size="sm" />
            <span className="truncate">by {trip.organiser.name}</span>
          </span>
          {trip.is_member ? (
            <ButtonLink href={`/trips/${trip.id}`} size="sm" variant="secondary">
              Open
            </ButtonLink>
          ) : (
            <Button size="sm" onClick={join} disabled={busy}>
              {busy ? "Joining…" : "Join trip"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
