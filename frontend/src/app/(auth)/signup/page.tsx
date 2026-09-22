"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { ApiError, signup } from "@/lib/api";

const AVATARS = ["🧳", "🏍️", "📸", "⛰️", "🌴", "🍛", "🚂", "🪂", "🧭", "🎒"];

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    password: "",
    home_city: "",
  });
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const user = await signup({
        ...form,
        username: form.username.trim().toLowerCase(),
        avatar_emoji: avatar,
      });
      setUser(user);
      router.replace("/");
    } catch (err) {
      setErrors(
        err instanceof ApiError
          ? err.fieldErrors
          : { detail: "Couldn't create your account right now." },
      );
      setBusy(false);
    }
  }

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="text-sm font-semibold text-muted hover:text-ink">
          <span aria-hidden="true">←</span> Back to log in
        </Link>

        <h1 className="mt-5 text-2xl font-bold text-ink">Let&apos;s get you packed</h1>
        <p className="mt-1 text-sm text-muted">Takes about a minute.</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {errors.detail ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
              {errors.detail}
            </p>
          ) : null}

          <TextField
            label="Your name"
            required
            value={form.display_name}
            error={errors.display_name}
            onChange={(e) => update("display_name", e.target.value)}
            placeholder="Prajwal Rai"
          />
          <TextField
            label="Username"
            required
            autoCapitalize="none"
            hint="Friends use this to add you to a trip."
            value={form.username}
            error={errors.username}
            onChange={(e) => update("username", e.target.value)}
            placeholder="prajwal"
          />
          <TextField
            label="Password"
            type="password"
            required
            autoComplete="new-password"
            hint="At least 8 characters."
            value={form.password}
            error={errors.password}
            onChange={(e) => update("password", e.target.value)}
          />
          <TextField
            label="Home city"
            value={form.home_city}
            error={errors.home_city}
            onChange={(e) => update("home_city", e.target.value)}
            placeholder="Pune"
          />

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Pick an avatar</legend>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((emoji) => (
                <label
                  key={emoji}
                  className={[
                    "tap flex cursor-pointer items-center justify-center rounded-xl border text-xl transition-colors",
                    avatar === emoji ? "border-brand bg-brand-soft" : "border-line bg-surface",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="avatar"
                    className="sr-only-text"
                    checked={avatar === emoji}
                    onChange={() => setAvatar(emoji)}
                  />
                  <span aria-hidden="true">{emoji}</span>
                  <span className="sr-only-text">Avatar {emoji}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {busy ? "Creating your account…" : "Create account"}
          </Button>
        </form>
      </div>
    </main>
  );
}
