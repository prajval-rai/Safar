"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { TripCover } from "@/components/art/TripCover";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import type { TripDetail, TripInvite } from "@/lib/types";
import { TRANSPORT_LABELS, TRIP_TYPE_LABELS, dateRange, formatNumber } from "@/lib/utils";

/** Polls the trips I've been invited to, like the bell's unread count — an
 *  invite can wait 45 seconds. */
function usePendingInvites() {
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const load = useCallback(() => {
    api
      .get<TripInvite[]>("/api/invites/")
      .then(setInvites)
      .catch(() => {
        // A missed poll isn't worth surfacing — the next one will catch up.
      });
  }, []);
  useEffect(() => {
    load();
    const interval = setInterval(load, 45_000);
    return () => clearInterval(interval);
  }, [load]);
  return { invites, setInvites, reload: load };
}

/**
 * The top bar's invites button: a count of trips people have asked you to
 * join, and a sheet to look at each one and accept or decline it.
 */
export function InvitesInbox({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { toast } = useCelebration();
  const { invites, setInvites, reload } = usePendingInvites();
  const [busyId, setBusyId] = useState<number | null>(null);
  const count = invites.length;

  async function answer(invite: TripInvite, decision: "accept" | "decline") {
    setBusyId(invite.id);
    try {
      const result = await api.post<{ status: string; trip?: TripDetail }>(
        `/api/invites/${invite.id}/${decision}/`,
      );
      setInvites((list) => list.filter((i) => i.id !== invite.id));
      if (decision === "accept") {
        toast(`You're on ${invite.trip.title}! 🎒`);
        onOpenChange(false);
        router.push(`/trips/${result.trip?.id ?? invite.trip.id}`);
      } else {
        toast(`Declined ${invite.trip.title}.`);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't answer that invite.", "error");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reload();
          onOpenChange(true);
        }}
        aria-label={count > 0 ? `Trip invites, ${count} waiting` : "Trip invites"}
        className="tap relative flex items-center justify-center rounded-full text-ink hover:bg-raised"
      >
        <Mail size={22} strokeWidth={1.8} aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      <Sheet
        open={open}
        onClose={() => onOpenChange(false)}
        title="Trip invites"
        description={count ? "Have a look, then say yes or no." : undefined}
      >
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Mail size={30} strokeWidth={1.6} className="text-muted" aria-hidden="true" />
            <p className="text-[15px] font-semibold text-ink">No invites right now.</p>
            <p className="text-sm text-muted">When someone asks you along on a trip, it shows up here.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {invites.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                busy={busyId === invite.id}
                disabled={busyId !== null}
                onAnswer={(decision) => answer(invite, decision)}
              />
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

function InviteCard({
  invite,
  busy,
  disabled,
  onAnswer,
}: {
  invite: TripInvite;
  busy: boolean;
  disabled: boolean;
  onAnswer: (decision: "accept" | "decline") => void;
}) {
  const { trip } = invite;
  const facts = [
    `${trip.duration_days} day${trip.duration_days === 1 ? "" : "s"}`,
    TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type,
    TRANSPORT_LABELS[trip.transport] ?? trip.transport,
    `${trip.member_count} going`,
    `${trip.stop_count} stop${trip.stop_count === 1 ? "" : "s"}`,
    trip.budget_per_person ? `₹${formatNumber(trip.budget_per_person)} / person` : null,
  ].filter(Boolean);

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface">
      <TripCover
        cover={trip.cover_key}
        image={trip.cover_image || undefined}
        alt={`${trip.destination} illustration`}
        rounded={false}
        className="h-28 w-full"
      >
        <p className="text-lg font-extrabold text-white drop-shadow">{trip.title}</p>
        <p className="text-sm text-white/90 drop-shadow">
          <span aria-hidden="true">📍</span> {trip.destination}
          {trip.region ? `, ${trip.region}` : ""}
        </p>
      </TripCover>

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2.5">
          <Avatar user={invite.invited_by} size="sm" />
          <p className="min-w-0 flex-1 text-sm text-muted">
            <span className="font-semibold text-ink">{invite.invited_by.name}</span> invited you
            {invite.invited_by.id !== trip.organiser.id ? (
              <> · organised by {trip.organiser.name}</>
            ) : null}
          </p>
        </div>

        <p className="text-sm font-semibold text-ink">
          <span aria-hidden="true">🗓️</span> {dateRange(trip.start_date, trip.end_date)}
          {trip.status === "active" ? <span className="ml-2 text-success">· Happening now</span> : null}
        </p>
        <p className="text-sm text-muted">{facts.join(" · ")}</p>
        {trip.summary ? <p className="text-sm text-ink">{trip.summary}</p> : null}
        {trip.no_xp ? (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
            <span aria-hidden="true">🏠</span> Close to home — this trip doesn&apos;t earn XP.
          </p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" fullWidth disabled={disabled} onClick={() => onAnswer("decline")}>
            Decline
          </Button>
          <Button fullWidth icon="✓" disabled={disabled} onClick={() => onAnswer("accept")}>
            {busy ? "Joining…" : "Accept"}
          </Button>
        </div>
      </div>
    </li>
  );
}
