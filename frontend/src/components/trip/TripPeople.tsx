"use client";

import { useEffect, useState } from "react";
import { InviteCardSheet } from "@/components/trip/InviteCardSheet";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, Progress } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import type { TripDetail, TripMember, UserMini } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const ROLE_LABELS = { owner: "Organiser", admin: "Co-planner", member: "Traveller" };

export function TripPeople({
  trip,
  onChanged,
  canEdit,
}: {
  trip: TripDetail;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [removing, setRemoving] = useState<TripMember | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useCelebration();

  async function removeMember() {
    if (!removing) return;
    setBusy(true);
    try {
      await api.del(`/api/trips/${trip.id}/members/${removing.id}/`);
      toast(`${removing.user.name} removed from the trip.`);
      setRemoving(null);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove them.", "error");
    } finally {
      setBusy(false);
    }
  }

  const removable = (m: TripMember) => canEdit && m.role !== "owner";

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-muted">Invite code</p>
          <p className="text-xl font-extrabold tracking-[0.3em] text-brand">{trip.join_code}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon="🔗" onClick={() => setCardOpen(true)}>
            Share
          </Button>
          {canEdit ? (
            <Button size="sm" icon="➕" onClick={() => setInviteOpen(true)}>
              Invite someone
            </Button>
          ) : null}
        </div>
      </div>

      {/* A table on wide screens; the same rows become cards on phones. */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only-text">Who is on this trip and how far along they are</caption>
          <thead className="bg-raised text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Person</th>
              <th scope="col" className="px-4 py-3 font-semibold">Role</th>
              <th scope="col" className="px-4 py-3 font-semibold">Progress</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">XP</th>
              {canEdit ? <th scope="col" className="px-4 py-3"><span className="sr-only-text">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {trip.members.map((member) => (
              <tr key={member.id}>
                <th scope="row" className="px-4 py-3 font-semibold text-ink">
                  <span className="flex items-center gap-2.5">
                    <Avatar user={member.user} size="sm" />
                    <span>
                      {member.user.name}
                      <span className="block text-xs font-normal text-muted">
                        Level {member.user.level}
                      </span>
                    </span>
                  </span>
                </th>
                <td className="px-4 py-3">
                  <Chip tone={member.role === "owner" ? "brand" : "neutral"}>
                    {ROLE_LABELS[member.role]}
                  </Chip>
                </td>
                <td className="px-4 py-3">
                  <div className="w-40">
                    <Progress value={member.progress_percent} size="sm" label={`${member.progress_percent}% complete`} />
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-brand">
                  {formatNumber(member.xp_earned)}
                </td>
                {canEdit ? (
                  <td className="px-4 py-3 text-right">
                    {removable(member) ? (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(member)}>
                        Remove
                        <span className="sr-only-text"> {member.user.name}</span>
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {trip.members.map((member) => (
          <li key={member.id} className="card p-3.5">
            <div className="flex items-center gap-3">
              <Avatar user={member.user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{member.user.name}</p>
                <p className="text-xs text-muted">{ROLE_LABELS[member.role]}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-brand">
                {formatNumber(member.xp_earned)} XP
              </span>
            </div>
            <div className="mt-2.5">
              <Progress
                value={member.progress_percent}
                size="sm"
                label={`${member.progress_percent}% complete`}
              />
            </div>
            {removable(member) ? (
              <div className="mt-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => setRemoving(member)}>
                  Remove
                  <span className="sr-only-text"> {member.user.name}</span>
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <Sheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove from trip?"
        description="They can rejoin later with the invite code."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setRemoving(null)}>
              Keep them
            </Button>
            <Button variant="danger" fullWidth onClick={removeMember} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          <b className="text-ink">{removing?.user.name}</b> will lose access to this trip&apos;s plan, chat and expenses.
        </p>
      </Sheet>

      <InviteCardSheet trip={trip} open={cardOpen} onClose={() => setCardOpen(false)} />
      <InviteSheet
        trip={trip}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onAdded={() => {
          setInviteOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}

function InviteSheet({
  trip,
  open,
  onClose,
  onAdded,
}: {
  trip: TripDetail;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  // Results remember which search they answer, so a stale list never shows.
  const [found, setFound] = useState<{ needle: string; people: UserMini[] }>({ needle: "", people: [] });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { toast } = useCelebration();
  const onTrip = new Set(trip.members.map((member) => member.user.id));
  const invited = new Set(trip.pending_invites.map((invite) => invite.user.id));
  const needle = query.trim();
  const results = needle.length >= 2 && found.needle === needle ? found.people : [];

  // Debounced so we aren't firing a request on every keystroke.
  useEffect(() => {
    if (needle.length < 2) return;
    const timer = window.setTimeout(() => {
      api
        .get<UserMini[]>(`/api/users/search/?q=${encodeURIComponent(needle)}`)
        .then((people) => setFound({ needle, people }))
        .catch(() => setFound({ needle, people: [] }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [needle]);

  async function add(person: UserMini) {
    setBusyId(person.id);
    setError(null);
    try {
      await api.post(`/api/trips/${trip.id}/members/`, { user_id: person.id });
      toast(`Invite sent to ${person.name || person.username} — they're in once they accept.`);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add them.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add someone to the trip"
      description="They get an invite, and join once they accept."
    >
      <TextField
        label="Search by name, username or email"
        data-autofocus
        value={query}
        error={error ?? undefined}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rahul Sharma or rahul@gmail.com"
        autoCapitalize="none"
        autoComplete="off"
      />

      <ul className="mt-4 space-y-2">
        {results.map((person) => {
          const added = onTrip.has(person.id);
          return (
            <li key={person.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <Avatar user={person} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{person.name}</span>
                <span className="block truncate text-xs text-muted">@{person.username}</span>
              </span>
              {added ? (
                <span className="text-sm font-semibold text-muted">On the trip</span>
              ) : invited.has(person.id) ? (
                <span className="text-sm font-semibold text-muted">Invited</span>
              ) : (
                <Button size="sm" onClick={() => add(person)} disabled={busyId !== null}>
                  {busyId === person.id ? "Adding…" : "Add"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {needle.length >= 2 && found.needle === needle && results.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nobody matches that yet. Share the invite code or card instead.
        </p>
      ) : null}

      {trip.pending_invites.length ? (
        <section className="mt-6">
          <h3 className="text-xs font-bold tracking-widest text-muted uppercase">Waiting for an answer</h3>
          <ul className="mt-2 space-y-2">
            {trip.pending_invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 rounded-xl bg-raised p-3">
                <Avatar user={invite.user} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{invite.user.name}</span>
                <span className="text-xs font-semibold text-muted">Invited</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Sheet>
  );
}
