"use client";

import { CalendarDays, MapPin, Users } from "lucide-react";
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

/** Explore: real upcoming trips whose organisers let anyone ask to join. */
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
        title="No upcoming trips to join right now."
        line="Planning one? Turn on “Let anyone ask to join” in its Settings, and travellers can find it here."
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
  const { toast } = useCelebration();
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(trip.request_status);

  // Nobody walks straight in — the organiser approves each request.
  async function ask() {
    setBusy(true);
    try {
      await api.post(`/api/explore/open-trips/${trip.id}/join/`);
      setRequested("pending");
      toast("Request sent — you'll hear when the organiser answers.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't send that request.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      await api.del(`/api/explore/open-trips/${trip.id}/join/`);
      setRequested(null);
      toast("Request withdrawn.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't withdraw that request.", "error");
    } finally {
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
        <Chip tone="brand" className="w-fit bg-white/95">
          Starts {relativeDays(trip.start_date)}
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
          ) : requested === "pending" ? (
            <Button size="sm" variant="secondary" onClick={withdraw} disabled={busy} title="Withdraw your request">
              {busy ? "Withdrawing…" : "Requested ✓"}
            </Button>
          ) : requested === "declined" ? (
            <Chip tone="danger">Not accepted</Chip>
          ) : (
            <Button size="sm" onClick={ask} disabled={busy}>
              {busy ? "Sending…" : "Request to join"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
