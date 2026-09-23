"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { ApiError, confirmPasswordReset, fetchResetQuestion } from "@/lib/api";

type Step =
  | { name: "username" }
  | { name: "not-found" }
  | { name: "answer"; username: string; question: string }
  | { name: "done" };

/**
 * No email on file, so recovery goes through a saved question instead — two
 * steps: look up the question for a username, then answer it and pick a new
 * password. Whether the username exists is never revealed on its own; only
 * "there's something to answer here" or not, same as the API underneath.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "username" });

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="text-sm font-semibold text-muted hover:text-ink">
          <span aria-hidden="true">←</span> Back to log in
        </Link>

        <h1 className="mt-5 text-2xl font-bold text-ink">Forgot your password?</h1>
        <p className="mt-1 text-sm text-muted">
          No email on file — we&apos;ll ask your recovery question instead.
        </p>

        <div className="mt-6">
          {step.name === "username" ? (
            <UsernameStep
              onFound={(username, question) => setStep({ name: "answer", username, question })}
              onNotFound={() => setStep({ name: "not-found" })}
            />
          ) : null}

          {step.name === "not-found" ? (
            <div className="space-y-4">
              <p className="rounded-xl bg-raised px-3.5 py-3 text-sm text-ink">
                We couldn&apos;t find a recovery question for that account. Double-check the
                username, or set one up next time you&apos;re signed in.
              </p>
              <Button variant="secondary" fullWidth onClick={() => setStep({ name: "username" })}>
                Try another username
              </Button>
            </div>
          ) : null}

          {step.name === "answer" ? (
            <AnswerStep
              username={step.username}
              question={step.question}
              onBack={() => setStep({ name: "username" })}
              onDone={() => setStep({ name: "done" })}
            />
          ) : null}

          {step.name === "done" ? (
            <div className="space-y-4">
              <p className="rounded-xl bg-brand-soft px-3.5 py-3 text-sm font-semibold text-brand">
                <span aria-hidden="true">✓</span> Password updated. You can log in with it now.
              </p>
              <Button fullWidth size="lg" onClick={() => router.replace("/login")}>
                Back to log in
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function UsernameStep({
  onFound,
  onNotFound,
}: {
  onFound: (username: string, question: string) => void;
  onNotFound: () => void;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fetchResetQuestion(trimmed);
      if (result.available && result.question) {
        onFound(trimmed, result.question);
      } else {
        onNotFound();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check that right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <TextField
        label="Username"
        data-autofocus
        autoCapitalize="none"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Button type="submit" size="lg" fullWidth disabled={busy}>
        {busy ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}

function AnswerStep({
  username,
  question,
  onBack,
  onDone,
}: {
  username: string;
  question: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { toast } = useCelebration();
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset({ username, answer, new_password: password });
      toast("Password updated.");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reset your password right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs font-semibold text-muted hover:text-ink"
      >
        <span aria-hidden="true">←</span> Not {username}?
      </button>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl bg-raised px-3.5 py-3">
        <p className="text-xs font-semibold text-muted">Your recovery question</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">{question}</p>
      </div>

      <TextField
        label="Your answer"
        data-autofocus
        required
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />

      <Button type="submit" size="lg" fullWidth disabled={busy}>
        {busy ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
