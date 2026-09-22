"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, LoadingBlock, Progress } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { canCompleteStop, checkInStop, completeStop, isPinned } from "@/lib/geo";
import { useApi } from "@/lib/hooks";
import type { Activity, LiveTrip } from "@/lib/types";
import { CATEGORY_ICONS, clockTime, formatNumber, mapsLink, timeWindow } from "@/lib/utils";

/**
 * Live Trip mode. While someone is actually out travelling they should see four
 * things and nothing else: what's happening NOW, what's NEXT, how TODAY is
 * going, and who's with them. Everything else is one tap away, not on screen.
 */
export default function LiveTripPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApi<LiveTrip>(`/api/trips/${id}/live/`);
  const { user } = useAuth();

  // Only show the skeleton on the very first load — ticking something off
  // should refresh in place, not blank the screen.
  if (loading && !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <LoadingBlock label="Getting today's plan…" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <ErrorNote message={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return null;

  const { trip, day, now, next, completed_today, total_today, members, my_trip_xp } = data;
  // Organisers (owner / co-planner) may complete a stop from anywhere.
  const myRole = members.find((m) => m.user.id === user?.id)?.role;
  const isOrganiser = myRole === "owner" || myRole === "admin";

  return (
    <div className="min-h-dvh bg-canvas">
      <header
        className="sticky top-0 z-30 border-b border-line bg-surface"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
          <Link
            href={`/trips/${trip.id}`}
            className="tap -ml-2 flex items-center rounded-xl px-2 text-sm font-semibold text-muted"
          >
            <span aria-hidden="true">←</span>
            <span className="ml-1">Exit</span>
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-bold text-ink">{trip.title}</p>
            <p className="text-xs text-muted">{day ? `Day ${day.index}` : "Live"}</p>
          </div>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">
            {formatNumber(my_trip_xp)} XP
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-10">
        {now ? (
          <NowCard activity={now} onDone={reload} myId={user?.id} isOrganiser={isOrganiser} />
        ) : (
          <section className="card p-6 text-center">
            <p className="text-4xl" aria-hidden="true">
              🎉
            </p>
            <h2 className="mt-2 text-xl font-bold text-ink">
              {total_today ? "Day done! Time to relax." : "Nothing planned today."}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {total_today
                ? "Everything on today's list is ticked off."
                : "Add something to the plan, or just enjoy the day."}
            </p>
            <ButtonLink href={`/trips/${trip.id}`} variant="secondary" className="mt-4">
              Open the itinerary
            </ButtonLink>
          </section>
        )}

        {next ? (
          <section className="card p-4" aria-labelledby="next-heading">
            <h2 id="next-heading" className="text-xs font-bold tracking-wide text-muted uppercase">
              Next
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">
                {CATEGORY_ICONS[next.category]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{next.title}</p>
                <p className="text-sm text-muted">
                  {next.start_time ? clockTime(next.start_time) : "Any time"}
                  {next.place_name ? ` · ${next.place_name}` : ""}
                </p>
              </div>
              <Chip tone="brand">+{next.xp_value} XP</Chip>
            </div>
          </section>
        ) : null}

        <section className="card p-4" aria-labelledby="today-heading">
          <h2 id="today-heading" className="text-xs font-bold tracking-wide text-muted uppercase">
            Today
          </h2>
          <div className="mt-3">
            <Progress
              value={total_today ? (completed_today / total_today) * 100 : 0}
              label={`${completed_today} of ${total_today} activities completed`}
              tone={completed_today === total_today && total_today > 0 ? "success" : "brand"}
            />
          </div>
          {day?.activities.length ? (
            <ol className="mt-4 space-y-1.5">
              {day.activities.map((activity) => (
                <li key={activity.id} className="flex items-center gap-2.5 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      activity.status === "completed"
                        ? "text-success"
                        : activity.id === now?.id
                          ? "text-brand"
                          : "text-muted"
                    }
                  >
                    {activity.status === "completed" ? "✓" : activity.id === now?.id ? "●" : "○"}
                  </span>
                  <span
                    className={
                      activity.status === "completed" ? "text-muted line-through" : "text-ink"
                    }
                  >
                    {activity.title}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {clockTime(activity.start_time)}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        <section className="card p-4" aria-labelledby="group-heading">
          <h2 id="group-heading" className="text-xs font-bold tracking-wide text-muted uppercase">
            With you
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-2 rounded-full bg-raised py-1 pr-3 pl-1"
              >
                <Avatar user={member.user} size="sm" />
                <span className="text-sm font-semibold text-ink">
                  {member.user.name.split(" ")[0]}
                </span>
                <span className="text-xs font-bold text-brand">{member.xp_earned}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <ButtonLink href={`/trips/${trip.id}`} variant="secondary" icon="🗺️">
            Map &amp; plan
          </ButtonLink>
          <ButtonLink href="/rewards" variant="secondary" icon="🏆">
            Your XP
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}

/** The one card that answers "what am I doing right now". */
function NowCard({
  activity,
  onDone,
  myId,
  isOrganiser,
}: {
  activity: Activity;
  onDone: () => void;
  myId?: number;
  isOrganiser: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const { celebrate, toast } = useCelebration();
  const pinned = isPinned(activity);
  const allowed = canCompleteStop(activity, myId, isOrganiser);

  async function run(action: () => Promise<Parameters<typeof celebrate>[0]>) {
    setBusy(true);
    try {
      celebrate(await action());
      onDone();
    } catch (err) {
      // Includes "You're 3.4 km from Baga Beach. Get within 1 km to do this."
      toast(err instanceof Error ? err.message : "Couldn't update that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card border-brand/40 p-5" aria-labelledby="now-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="now-heading" className="text-xs font-bold tracking-wide text-brand uppercase">
          <span aria-hidden="true">●</span> Now
        </h2>
        <Chip tone="brand">+{activity.xp_value} XP</Chip>
      </div>

      <p className="mt-3 text-2xl font-extrabold text-ink">
        <span aria-hidden="true">{CATEGORY_ICONS[activity.category]}</span> {activity.title}
      </p>
      {activity.place_name ? (
        <p className="mt-1 text-[15px] text-muted">
          <span aria-hidden="true">📍</span> {activity.place_name}
        </p>
      ) : null}
      <p className="text-[15px] text-muted">{timeWindow(activity)}</p>

      {activity.description ? (
        <p className="mt-3 text-sm leading-relaxed text-ink">{activity.description}</p>
      ) : null}

      {activity.assigned_to ? (
        <p className="mt-3 text-sm text-muted">
          <span aria-hidden="true">👤</span> Assigned to{" "}
          <b className="text-ink">{activity.assigned_to.id === myId ? "you" : activity.assigned_to.name}</b>
        </p>
      ) : null}

      {pinned && allowed ? (
        <p className="mt-3 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          <span aria-hidden="true">📍</span> Be within 1 km of this spot to check in or complete it.
        </p>
      ) : null}

      {/* Big, well-spaced targets — these get tapped one-handed, outdoors. */}
      <div className="mt-5 space-y-2">
        {allowed ? (
          <Button
            size="lg"
            fullWidth
            icon="✓"
            onClick={() => run(() => completeStop(activity))}
            disabled={busy}
          >
            {busy ? "Checking where you are…" : "Mark as completed"}
          </Button>
        ) : (
          <p className="rounded-xl bg-raised px-4 py-3.5 text-center text-sm font-semibold text-muted">
            This stop is assigned to {activity.assigned_to?.name}.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={mapsLink(activity)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-ink"
          >
            <span aria-hidden="true">🧭</span> Navigate
          </a>
          <Button
            size="lg"
            variant="secondary"
            icon="📍"
            onClick={() => run(() => checkInStop(activity))}
            disabled={busy || Boolean(activity.checked_in_at)}
          >
            {activity.checked_in_at ? "Checked in" : "Check in"}
          </Button>
        </div>

        {isOrganiser && pinned ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => completeStop(activity, { override: true }))}
            className="tap w-full rounded-xl px-3 text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
          >
            Organiser: mark complete without location
          </button>
        ) : null}
      </div>
    </section>
  );
}
