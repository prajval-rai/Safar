"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JaliPattern } from "@/components/art/Motif";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { ApiError, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await login(username.trim(), password));
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign you in just now.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* The decorative half only appears when there's room for it. */}
      <aside className="relative hidden overflow-hidden bg-brand lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 text-white/10" aria-hidden="true">
          <JaliPattern />
        </div>
        <div className="relative text-on-brand">
          <span className="text-3xl" aria-hidden="true">
            🧭
          </span>
          <h1 className="mt-4 text-4xl font-extrabold">Safar</h1>
          <p className="mt-2 max-w-sm text-lg opacity-90">
            Plan the trip, follow the plan, and keep the memories — all in one place.
          </p>
        </div>
        <ul className="relative space-y-3 text-on-brand/90">
          {[
            ["🗺️", "Build a day-by-day plan in minutes"],
            ["👛", "Split what everyone spends"],
            ["🏆", "Earn XP as you tick off each stop"],
          ].map(([icon, line]) => (
            <li key={line} className="flex items-center gap-3 text-[15px]">
              <span className="text-xl" aria-hidden="true">
                {icon}
              </span>
              {line}
            </li>
          ))}
        </ul>
      </aside>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <span className="text-3xl" aria-hidden="true">
              🧭
            </span>
            <h1 className="mt-2 text-3xl font-extrabold text-ink">Safar</h1>
          </div>

          <h2 className="text-2xl font-bold text-ink">Ready for the journey?</h2>
          <p className="mt-1 text-sm text-muted">Log in to pick up where you left off.</p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            {error ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}

            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" size="lg" fullWidth disabled={busy}>
              {busy ? "Signing you in…" : "Log in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-brand underline-offset-2 hover:underline">
              Create an account
            </Link>
          </p>

          <div className="mt-8 rounded-xl border border-line bg-raised p-3.5 text-center text-xs text-muted">
            <p className="font-semibold text-ink">Try the demo</p>
            <p className="mt-0.5">
              Username <b>prajwal</b> · Password <b>safar1234</b>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
