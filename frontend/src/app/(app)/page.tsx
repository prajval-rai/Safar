"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { TripCover } from "@/components/art/TripCover";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { TripCard, TripTile } from "@/components/trip/TripCard";
import { Chip, ErrorNote, LoadingBlock, Progress, SectionHeader, StatTile } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { HomePayload, Trip, TripDetail, XPResult } from "@/lib/types";
import { dateRange } from "@/lib/utils";

export default function HomePage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<HomePayload>("/api/home/");
  const [joinOpen, setJoinOpen] = useState(false);

  if (loading) return <LoadingBlock label="Loading your trips…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data || !user) return null;

  const hasAnything = data.live_trip || data.upcoming.length > 0 || data.past.length > 0;

  return (
    <div className="space-y-7">
      <header className="animate-rise">
        <p className="text-sm text-muted">
          {greeting()}, <span className="font-semibold text-ink">{user.name.split(" ")[0]}</span>{" "}
          <span aria-hidden="true">👋</span>
        </p>
        <h1 className="mt-0.5 text-2xl font-extrabold text-ink sm:text-3xl">
          {data.live_trip ? "Your trip is on." : "Where to next?"}
        </h1>
      </header>

      {data.live_trip ? <LiveTripBanner trip={data.live_trip} /> : null}

      {data.experience_prompt ? (
        <ExperiencePrompt
          key={data.experience_prompt.trip.id}
          trip={data.experience_prompt.trip}
          xpEarned={data.experience_prompt.xp_earned}
          onDone={reload}
        />
      ) : null}

      {/* Two primary actions, nothing else competing. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ButtonLink href="/trips/new" size="lg" icon="➕" className="justify-start">
          Plan a trip
        </ButtonLink>
        <Button
          variant="secondary"
          size="lg"
          icon="🎟️"
          className="justify-start"
          onClick={() => setJoinOpen(true)}
        >
          Join with a code
        </Button>
      </div>

      {hasAnything ? (
        <section aria-label="Your travel so far">
          <div className="grid grid-cols-3 gap-3">
            <StatTile emoji="🧳" value={data.counts.trips} label="Trips" />
            <StatTile emoji="✅" value={data.counts.completed} label="Completed" />
            <StatTile emoji="📍" value={data.counts.places} label="Places visited" />
          </div>
        </section>
      ) : null}

      {data.upcoming.length > 0 ? (
        <section>
          <SectionHeader
            title="Coming up"
            action={
              <Link href="/trips" className="text-sm font-semibold text-brand">
                See all
              </Link>
            }
          />
          <div className="space-y-3">
            {data.upcoming.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        </section>
      ) : null}

      {data.past.length > 0 ? (
        <section>
          <SectionHeader title="Journeys you've finished" subtitle="Relive them or share them." />
          {/* Horizontal scroller on phones, grid from tablet up. */}
          <div className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {data.past.map((trip) => (
              <div key={trip.id} className="sm:w-full [&>a]:sm:w-full">
                <TripTile trip={trip} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!hasAnything ? (
        <EmptyState
          emoji="🗺️"
          title="Your journey starts here."
          line="Plan your first trip — pick a place, pick the dates, and we'll help with the rest."
          action={
            <ButtonLink href="/trips/new" size="lg">
              Plan a trip
            </ButtonLink>
          }
        />
      ) : null}

      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The one thing that matters when a trip is underway. */
function LiveTripBanner({ trip }: { trip: Trip }) {
  return (
    <section className="animate-rise card overflow-hidden" aria-label="Trip happening now">
      <TripCover
        cover={trip.cover_key}
        image={trip.cover_image || undefined}
        alt={`${trip.destination} illustration`}
        rounded={false}
        className="h-40 w-full sm:h-48"
      >
        <Chip tone="success" className="mb-2 w-fit bg-white/95">
          <span aria-hidden="true">●</span> Happening now
        </Chip>
        <h2 className="text-xl font-extrabold text-white drop-shadow sm:text-2xl">{trip.title}</h2>
        <p className="text-sm text-white/90 drop-shadow">
          {trip.destination} · {dateRange(trip.start_date, trip.end_date)}
        </p>
      </TripCover>

      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Progress value={trip.progress_percent} label={`Your trip is ${trip.progress_percent}% complete`} />
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/trips/${trip.id}/live`} icon="🧭" className="flex-1 sm:flex-none">
            Live trip
          </ButtonLink>
          <ButtonLink href={`/trips/${trip.id}`} variant="secondary" className="flex-1 sm:flex-none">
            Details
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/** Once a trip is over, a small pop-up floats in asking how it went. Tapping it
 *  opens a sheet to write about the trip — or skip, which means we never ask
 *  about that trip again. */
function ExperiencePrompt({
  trip,
  xpEarned,
  onDone,
}: {
  trip: Trip;
  xpEarned: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { celebrate, toast } = useCelebration();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      celebrate(
        await api.post<XPResult>(`/api/trips/${trip.id}/experience/`, { text: text.trim() }),
      );
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await api.post(`/api/trips/${trip.id}/experience/skip/`, {});
      setOpen(false);
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't skip that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="animate-rise fixed right-4 bottom-24 left-4 z-40 flex items-center gap-3 rounded-2xl border border-brand/40 bg-surface p-3 text-left shadow-xl sm:right-8 sm:bottom-8 sm:left-auto sm:w-96"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xl" aria-hidden="true">
            📝
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink">How was {trip.title}?</span>
            <span className="block text-xs text-muted">
              You earned <b className="text-brand">+{xpEarned} XP</b>. Tap to share your experience.
            </span>
          </span>
          <span className="text-muted" aria-hidden="true">›</span>
        </button>
      ) : null}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`How was ${trip.title}?`}
        description={`${trip.destination} · ${dateRange(trip.start_date, trip.end_date)} · +${xpEarned} XP earned`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={skip} disabled={busy}>
              Skip
            </Button>
            <Button fullWidth onClick={save} disabled={busy || text.trim().length < 10} icon="📝">
              {busy ? "Saving…" : "Share my experience"}
            </Button>
          </div>
        }
      >
        <TextAreaField
          label="Your experience"
          hint="The best moment, what you'd skip, tips for whoever goes next. Skip and we won't ask about this trip again."
          data-autofocus
          value={text}
          error={error ?? undefined}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          rows={6}
        />
      </Sheet>
    </>
  );
}

function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useCelebration();

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const trip = await api.post<TripDetail>("/api/trips/join/", { code: code.trim() });
      toast(`You're in — ${trip.title}`);
      onClose();
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join that trip.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Join a trip"
      description="Ask the organiser for the 6-character invite code."
      footer={
        <Button fullWidth size="lg" onClick={join} disabled={busy || code.trim().length < 4}>
          {busy ? "Joining…" : "Join trip"}
        </Button>
      }
    >
      <TextField
        label="Invite code"
        data-autofocus
        value={code}
        error={error ?? undefined}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="A1B2C3"
        autoCapitalize="characters"
        className="text-center text-xl font-bold tracking-[0.3em]"
      />
    </Sheet>
  );
}
