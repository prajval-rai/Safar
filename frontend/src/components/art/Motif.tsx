"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A very light jali-inspired lattice. It only ever appears behind empty states,
 * onboarding and celebration screens — never behind text or controls that the
 * traveller has to read or tap.
 */
export function JaliPattern({ className }: { className?: string }) {
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id="safar-jali" width="44" height="44" patternUnits="userSpaceOnUse">
          <path
            d="M22 2 L42 22 L22 42 L2 22Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <circle cx="22" cy="22" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M22 0 v6 M22 38 v6 M0 22 h6 M38 22 h6" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#safar-jali)" />
    </svg>
  );
}

/** A small hand-drawn style divider — used between sections on story screens. */
export function MotifDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 text-brand/45", className)} aria-hidden="true">
      <span className="h-px w-12 bg-current" />
      <svg width="26" height="14" viewBox="0 0 26 14" fill="none">
        <path d="M13 1 L19 7 L13 13 L7 7Z" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13" cy="7" r="1.8" fill="currentColor" />
      </svg>
      <span className="h-px w-12 bg-current" />
    </div>
  );
}

/**
 * Friendly empty state. The brief asks these to carry the Indian flavour, and
 * to always say what to do next rather than just "no data".
 */
export function EmptyState({
  emoji,
  title,
  line,
  action,
}: {
  emoji: string;
  title: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="card relative overflow-hidden px-6 py-10 text-center">
      <div className="absolute inset-0 text-brand/[0.07]" aria-hidden="true">
        <JaliPattern />
      </div>
      <div className="relative">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-3xl">
          <span aria-hidden="true">{emoji}</span>
        </div>
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{line}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
