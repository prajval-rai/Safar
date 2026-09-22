"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, Progress } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import type { TripDetail, TripMember } from "@/lib/types";
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

  async function share() {
    const text = `Join my trip "${trip.title}" on Safar. Invite code: ${trip.join_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.title, text });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Invite copied — paste it in your group.");
    } catch {
      toast("Share this code: " + trip.join_code);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-muted">Invite code</p>
          <p className="text-xl font-extrabold tracking-[0.3em] text-brand">{trip.join_code}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon="🔗" onClick={share}>
            Share
          </Button>
          {canEdit ? (
            <Button size="sm" icon="➕" onClick={() => setInviteOpen(true)}>
              Add someone
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
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useCelebration();

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/trips/${trip.id}/members/`, { username: username.trim() });
      toast(`${username.trim()} is in.`);
      setUsername("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add them.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add someone to the trip"
      description="They'll see the plan and can tick off activities too."
      footer={
        <Button fullWidth size="lg" onClick={add} disabled={busy || !username.trim()}>
          {busy ? "Adding…" : "Add to trip"}
        </Button>
      }
    >
      <TextField
        label="Their username"
        data-autofocus
        value={username}
        error={error ?? undefined}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="rahul"
        autoCapitalize="none"
      />
    </Sheet>
  );
}
