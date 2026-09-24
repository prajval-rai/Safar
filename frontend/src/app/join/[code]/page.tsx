"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { TripCover } from "@/components/art/TripCover";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Chip, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { rememberReturnPath } from "@/lib/returnPath";
import { useTripTheme } from "@/lib/tripTheme";
import type { InvitePreview, TripDetail } from "@/lib/types";
import {
  CATEGORY_ICONS,
  PACE_LABELS,
  TRANSPORT_ICONS,
  TRANSPORT_LABELS,
  TRIP_TYPE_LABELS,
  clockTime,
  dateRange,
  rupees,
  shortDate,
} from "@/lib/utils";

/** Where an invitation's link and QR code point. Shows the trip — where, when,
 *  who's going and the plan — and only joins once the person taps Join.
 *  Works signed out too: they see the trip, then log in or sign up and come
 *  straight back here to confirm. */
export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: trip, loading, error } = useApi<InvitePreview>(
    `/api/trips/invite/${encodeURIComponent(code)}/`,
  );
  useTripTheme(trip?.theme);

  return (
    <main id="main" className="min-h-dvh bg-canvas pb-36">
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 sm:px-6 sm:pt-8">
        <Link href="/" className="text-lg font-extrabold tracking-wide text-brand">
          SAFAR
        </Link>
        <div className="mt-4">
          {loading ? <LoadingBlock label="Opening your invitation…" /> : null}
          {error ? <ErrorNote message={error} /> : null}
          {trip ? <TripPreview trip={trip} /> : null}
        </div>
      </div>
      {trip && !authLoading ? <JoinBar trip={trip} signedIn={Boolean(user)} /> : null}
    </main>
  );
}

function TripPreview({ trip }: { trip: InvitePreview }) {
  const stops = trip.days.reduce((n, d) => n + d.stops.length, 0);
  const where = [trip.destination, trip.region && !trip.destination.includes(trip.region) ? trip.region : ""]
    .filter(Boolean)
    .join(", ");
  const facts: [string, string, string][] = [
    ["📅", "When", dateRange(trip.start_date, trip.end_date)],
    ["⏳", "How long", `${trip.duration_days} ${trip.duration_days === 1 ? "day" : "days"}`],
    ["🧭", "Kind of trip", TRIP_TYPE_LABELS[trip.trip_type] ?? "Trip"],
    [TRANSPORT_ICONS[trip.transport] ?? "🚌", "Getting there", TRANSPORT_LABELS[trip.transport] ?? "Mixed"],
    ["🎚️", "Pace", PACE_LABELS[trip.pace] ?? "Balanced"],
    trip.budget_per_person
      ? ["💰", "Budget", `${rupees(trip.budget_per_person)} / person`]
      : ["🗺️", "Plan", stops ? `${stops} ${stops === 1 ? "stop" : "stops"}` : "Being planned"],
  ];

  return (
    <div className="space-y-6">
      <section className="card animate-rise overflow-hidden">
        <TripCover
          cover={trip.cover_key}
          image={trip.cover_image || undefined}
          alt={`${trip.destination} illustration`}
          rounded={false}
          className="h-56 w-full sm:h-64"
        >
          <Chip tone="brand" className="mb-2 w-fit bg-white/95">
            <span aria-hidden="true">🎟️</span> You&apos;re invited
          </Chip>
          <h1 className="text-2xl font-extrabold text-white drop-shadow sm:text-3xl">{trip.title}</h1>
          <p className="text-sm text-white/90 drop-shadow">
            <span aria-hidden="true">📍</span> {where}
          </p>
        </TripCover>
        <div className="flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xl" aria-hidden="true">
            {trip.organiser.avatar_emoji || "🧳"}
          </span>
          <p className="text-sm text-muted">
            <b className="text-ink">{trip.organiser.name}</b> is organising this trip and would like you to come
            along.
          </p>
        </div>
      </section>

      {trip.summary ? <p className="text-[15px] leading-relaxed text-ink">{trip.summary}</p> : null}

      <section aria-labelledby="facts-heading">
        <h2 id="facts-heading" className="sr-only-text">
          Trip details
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {facts.map(([icon, label, value]) => (
            <div key={label} className="card flex items-center gap-3 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg" aria-hidden="true">
                {icon}
              </span>
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-muted">{label}</dt>
                <dd className="truncate text-sm font-bold text-ink">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="crew-heading">
        <h2 id="crew-heading" className="mb-3 text-lg font-bold text-ink">
          Who&apos;s going · {trip.members.length}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {trip.members.map((m, i) => (
            <li key={`${m.name}-${i}`}>
              <Chip tone={m.role === "owner" ? "brand" : "neutral"}>
                <span aria-hidden="true">{m.avatar_emoji || "🧳"}</span> {m.name}
                {m.role === "owner" ? " · Organiser" : m.role === "admin" ? " · Co-planner" : ""}
              </Chip>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="mb-3 text-lg font-bold text-ink">
          The plan
        </h2>
        {stops === 0 ? (
          <p className="card p-4 text-sm text-muted">The organiser is still putting the plan together.</p>
        ) : (
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
                        {stop.start_time ? (
                          <span className="shrink-0 text-xs font-semibold text-muted">{clockTime(stop.start_time)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-muted">Free day — nothing planned yet.</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** The decision, pinned to the bottom so it's always one tap away. */
function JoinBar({ trip, signedIn }: { trip: InvitePreview; signedIn: boolean }) {
  const router = useRouter();
  const { toast } = useCelebration();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/join/${trip.code}`;

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const joined = await api.post<TripDetail>("/api/trips/join/", { code: trip.code });
      toast(`You're in — ${joined.title}`);
      router.replace(`/trips/${joined.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join that trip.");
      setBusy(false);
    }
  }

  function goSignIn(path: "/login" | "/signup") {
    // Come back to this invitation (not Home) once they're signed in.
    rememberReturnPath(here);
    router.push(path);
  }

  let action: React.ReactNode;
  if (trip.is_member && trip.trip_id) {
    action = (
      <ButtonLink href={`/trips/${trip.trip_id}`} size="lg" fullWidth icon="🧭">
        You&apos;re on this trip — open it
      </ButtonLink>
    );
  } else if (!trip.can_join) {
    action = (
      <p className="rounded-xl bg-raised px-4 py-3.5 text-center text-sm font-semibold text-muted">
        This trip is {trip.status}, so it can&apos;t be joined any more.
      </p>
    );
  } else if (signedIn) {
    action = (
      <Button size="lg" fullWidth icon="✅" onClick={join} disabled={busy}>
        {busy ? "Joining…" : `Join ${trip.title}`}
      </Button>
    );
  } else {
    action = (
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant="secondary" onClick={() => goSignIn("/login")}>
          Log in to join
        </Button>
        <Button size="lg" onClick={() => goSignIn("/signup")}>
          Sign up &amp; join
        </Button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto w-full max-w-2xl space-y-2 px-4 py-3 sm:px-6">
        {error ? (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        ) : null}
        {action}
        {!trip.is_member && trip.can_join ? (
          <p className="text-center text-xs text-muted">
            Invite code <b className="tracking-[0.2em] text-brand">{trip.code}</b> · you only join when you tap the button
          </p>
        ) : null}
      </div>
    </div>
  );
}
