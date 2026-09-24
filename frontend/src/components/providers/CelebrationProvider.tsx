"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { XPResult } from "@/lib/types";

import { useAuth } from "./AuthProvider";

interface Toast {
  id: number;
  text: string;
  tone: "xp" | "info" | "error";
}

interface Milestone {
  title: string;
  line: string;
  emoji: string;
  href?: string;
  cta?: string;
}

interface CelebrationContextValue {
  /** Feed it any XP-earning API response — it picks the right celebration. */
  celebrate: (result: XPResult) => void;
  toast: (text: string, tone?: "info" | "error") => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const nextId = useRef(1);
  const { setUser } = useAuth();

  const push = useCallback((text: string, tone: Toast["tone"]) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((all) => all.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const toast = useCallback(
    (text: string, tone: "info" | "error" = "info") => push(text, tone),
    [push],
  );

  const celebrate = useCallback(
    (result: XPResult) => {
      if (result.user) setUser(result.user);

      // Small, quiet reward for everyday actions.
      if (result.xp_awarded) push(`+${result.xp_awarded} XP 🎉`, "xp");
      if (result.xp_held) push(`🔒 ${result.xp_held} XP held — settle up to unlock it`, "info");

      for (const badge of result.unlocked ?? []) {
        push(`${badge.icon} ${badge.title} unlocked`, "xp");
      }

      // Bigger moments get the full screen treatment.
      if (result.trip_completed) {
        setMilestone({
          emoji: "🏆",
          title: "You completed the journey!",
          line: "Take a look at everything you did.",
          href: result.activity ? `/trips/${result.activity.trip}/complete` : undefined,
          cta: "See your trip story",
        });
      } else if (result.day_completed) {
        setMilestone({
          emoji: "🎉",
          title: `Day ${result.day_index ?? ""} done!`.trim(),
          line: "Time to relax. Tomorrow's plan is ready when you are.",
        });
      }
    },
    [push, setUser],
  );

  return (
    <CelebrationContext.Provider value={{ celebrate, toast }}>
      {children}
      <ToastStack toasts={toasts} />
      {milestone ? (
        <MilestoneOverlay milestone={milestone} onClose={() => setMilestone(null)} />
      ) : null}
    </CelebrationContext.Provider>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-8"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={[
            "animate-xp rounded-full px-4 py-2 text-sm font-semibold shadow-lg",
            toast.tone === "xp"
              ? "bg-brand text-on-brand"
              : toast.tone === "error"
                ? "bg-danger text-white"
                : "bg-ink text-canvas",
          ].join(" ")}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}

function MilestoneOverlay({
  milestone,
  onClose,
}: {
  milestone: Milestone;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-[70] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-title"
    >
      <div className="animate-pop w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft text-4xl">
          <span aria-hidden="true">{milestone.emoji}</span>
        </div>
        <h2 id="milestone-title" className="text-xl font-bold text-ink">
          {milestone.title}
        </h2>
        <p className="mt-2 text-sm text-muted">{milestone.line}</p>
        <div className="mt-6 flex flex-col gap-2">
          {milestone.href ? (
            <Link
              href={milestone.href}
              onClick={onClose}
              className="tap flex items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-on-brand"
            >
              {milestone.cta}
            </Link>
          ) : null}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="tap rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}

export function useCelebration() {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error("useCelebration must be used inside CelebrationProvider");
  return ctx;
}
