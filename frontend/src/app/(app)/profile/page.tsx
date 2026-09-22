"use client";

import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { ThemePicker } from "@/components/settings/ThemePicker";
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
        <p className="mb-4 text-sm text-muted">Pick the look that suits you.</p>
        <ThemePicker />
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
              <dd className="font-semibold text-ink">{user.email}</dd>
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
