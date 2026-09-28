"use client";

import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { ColorModePicker } from "@/components/settings/ColorModePicker";
import { PushToggle } from "@/components/settings/PushToggle";
import { ProfileExtras } from "@/components/social/TravelProfile";
import { Avatar, Chip, Progress } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import type { User } from "@/lib/types";
import { formatNumber, shortDate } from "@/lib/utils";

const AVATARS = ["🧳", "🏍️", "📸", "⛰️", "🌴", "🍛", "🚂", "🪂", "🧭", "🎒", "🛺", "🏕️"];

export default function ProfilePage() {
  const { user, setUser, signOut } = useAuth();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  return (
    <div className="space-y-5">
      <header className="card flex flex-col items-center gap-3 p-6 text-center">
        <Avatar user={user} size="lg" />
        <div>
          <h1 className="text-xl font-extrabold text-ink">{user.name}</h1>
          <p className="text-sm text-muted">@{user.username}</p>
          {user.home_city ? (
            <p className="mt-1 text-sm text-muted">
              <span aria-hidden="true">📍</span> {user.home_city}
            </p>
          ) : null}
        </div>
        {user.bio ? <p className="max-w-sm text-sm text-ink">{user.bio}</p> : null}
        <Chip tone="brand">
          Level {user.level} · {user.level_name}
        </Chip>
        <div className="w-full max-w-sm">
          <Progress
            value={user.level_progress}
            label={`${formatNumber(user.xp_into_level)} / ${formatNumber(user.xp_for_next_level)} XP to level ${user.level + 1}`}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          Edit profile
        </Button>
      </header>

      {/* Followers, the map of where I've been, and achievements. */}
      <ProfileExtras username={user.username} isMe />

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-bold text-ink">Appearance</h2>
        <p className="mb-4 text-sm text-muted">
          The colour theme itself now follows your trips — live if you&apos;re on one, otherwise
          whatever&apos;s next on your calendar.
        </p>
        <ColorModePicker />
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold text-ink">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Username</dt>
            <dd className="font-semibold text-ink">@{user.username}</dd>
          </div>
          {user.email ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Email</dt>
              <dd className="text-right">
                <span className="block font-semibold text-ink">{user.email}</span>
                <span className="block text-xs text-muted">From your Google account — can&apos;t be changed</span>
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Travelling since</dt>
            <dd className="font-semibold text-ink">{shortDate(user.date_joined.slice(0, 10))}</dd>
          </div>
        </dl>
        <Button variant="secondary" fullWidth className="mt-4" onClick={signOut}>
          Log out
        </Button>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold text-ink">Notifications</h2>
        <p className="mt-1 text-sm text-muted">
          The bell icon always works. Turn this on for a real alert on this device — trip
          reminders, invites — even when Safar isn&apos;t open.
        </p>
        <div className="mt-3">
          <PushToggle />
        </div>
      </section>

      <DeleteAccountSection user={user} onDone={signOut} />

      <EditProfileSheet
        open={editing}
        user={user}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          setUser(updated);
          setEditing(false);
        }}
      />
    </div>
  );
}

type DeleteKind = "deactivate" | "delete";

const DELETE_COPY: Record<
  DeleteKind,
  { title: string; lines: string[]; button: string; busy: string; path: string; done: string }
> = {
  deactivate: {
    title: "Temporarily delete your account",
    lines: [
      "Your profile, posts and tracks are hidden, and nobody can find or invite you.",
      "Your trips, photos and XP are kept safe.",
      "Sign in with Google again any time and everything comes back.",
    ],
    button: "Deactivate my account",
    busy: "Deactivating…",
    path: "/api/auth/deactivate/",
    done: "Your account is switched off. Sign in again whenever you want it back.",
  },
  delete: {
    title: "Permanently delete your account",
    lines: [
      "Your profile, XP, achievements, posts, tracks, photos and follows are deleted for good.",
      "Group trips you organised stay for everyone else — a co-planner (or the next person on the trip) takes over. Trips with only you on them are deleted.",
      "This can't be undone. Signing in with Google later starts a brand-new account.",
    ],
    button: "Delete my account forever",
    busy: "Deleting…",
    path: "/api/auth/delete/",
    done: "Your account has been deleted.",
  },
};

function DeleteAccountSection({ user, onDone }: { user: User; onDone: () => void }) {
  const [kind, setKind] = useState<DeleteKind | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useCelebration();
  const copy = kind ? DELETE_COPY[kind] : null;
  const matches = typed.trim().toLowerCase() === user.username.toLowerCase();

  function open(next: DeleteKind) {
    setKind(next);
    setTyped("");
    setError(null);
  }

  async function confirm() {
    if (!copy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(copy.path, { confirm: typed.trim() });
      toast(copy.done);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <section className="card border-danger/30 p-5">
      <h2 className="text-lg font-bold text-danger">Delete account</h2>
      <div className="mt-3 space-y-3">
        <div className="rounded-xl bg-raised p-3.5">
          <p className="text-sm font-bold text-ink">Take a break</p>
          <p className="mt-0.5 text-sm text-muted">
            Hide your account for now. Sign in again any time to bring it back, just as it was.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => open("deactivate")}>
            Temporarily delete
          </Button>
        </div>
        <div className="rounded-xl bg-danger-soft/60 p-3.5">
          <p className="text-sm font-bold text-danger">Delete forever</p>
          <p className="mt-0.5 text-sm text-muted">
            Remove your account and everything that&apos;s only yours. This can&apos;t be undone.
          </p>
          <Button variant="danger" size="sm" className="mt-3" onClick={() => open("delete")}>
            Permanently delete
          </Button>
        </div>
      </div>

      <Sheet
        open={kind !== null}
        onClose={() => (busy ? undefined : setKind(null))}
        title={copy?.title ?? ""}
        footer={
          copy ? (
            <Button
              fullWidth
              size="lg"
              variant={kind === "delete" ? "danger" : "primary"}
              onClick={confirm}
              disabled={busy || !matches}
            >
              {busy ? copy.busy : copy.button}
            </Button>
          ) : undefined
        }
      >
        {copy ? (
          <div className="space-y-4">
            <ul className="space-y-2 text-sm text-ink">
              {copy.lines.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted">
                    •
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <TextField
              label={`Type your username (${user.username}) to confirm`}
              data-autofocus
              value={typed}
              error={error ?? undefined}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="none"
              autoComplete="off"
            />
          </div>
        ) : null}
      </Sheet>
    </section>
  );
}

function EditProfileSheet({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: User;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const [form, setForm] = useState({
    display_name: user.display_name || user.name,
    home_city: user.home_city,
    bio: user.bio,
    avatar_emoji: user.avatar_emoji,
    upi_id: user.upi_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const { toast } = useCelebration();

  async function save() {
    setBusy(true);
    try {
      onSaved(await api.patch<User>("/api/auth/me/", form));
      toast("Profile updated.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit profile"
      footer={
        <Button fullWidth size="lg" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Your name"
          data-autofocus
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
        <TextField
          label="Home city"
          value={form.home_city}
          onChange={(e) => setForm({ ...form, home_city: e.target.value })}
          placeholder="Pune"
        />
        <TextField
          label="UPI ID (for settling up)"
          hint="So trip-mates can pay you back in one tap. Only people on your trips can see it."
          value={form.upi_id}
          onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
          placeholder="name@okaxis"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <TextAreaField
          label="One line about you"
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder="Weekend trips and long drives."
        />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Avatar</legend>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((emoji) => (
              <label
                key={emoji}
                className={[
                  "tap flex cursor-pointer items-center justify-center rounded-xl border text-xl",
                  form.avatar_emoji === emoji
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-surface",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="avatar"
                  className="sr-only-text"
                  checked={form.avatar_emoji === emoji}
                  onChange={() => setForm({ ...form, avatar_emoji: emoji })}
                />
                <span aria-hidden="true">{emoji}</span>
                <span className="sr-only-text">Avatar {emoji}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  );
}
