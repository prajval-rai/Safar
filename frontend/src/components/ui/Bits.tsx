"use client";

import { useState, type ReactNode } from "react";

import type { UserMini } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

/** Labelled progress bar. The number is always written out, never colour-only. */
export function Progress({
  value,
  label,
  tone = "brand",
  size = "md",
}: {
  value: number;
  label?: string;
  tone?: "brand" | "accent" | "success";
  size?: "sm" | "md";
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const bar = { brand: "bg-brand", accent: "bg-accent", success: "bg-success" }[tone];

  return (
    <div className="w-full">
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted">{label}</span>
          <span className="text-xs font-bold text-ink">{safe}%</span>
        </div>
      ) : null}
      <div
        className={cn("w-full overflow-hidden rounded-full bg-raised", size === "sm" ? "h-1.5" : "h-2.5")}
        role="progressbar"
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "accent" | "success" | "warn" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-raised text-muted",
    brand: "bg-brand-soft text-brand",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  user,
  size = "md",
}: {
  user: Pick<UserMini, "name" | "avatar_emoji">;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-8 w-8 text-sm",
    md: "h-10 w-10 text-lg",
    lg: "h-14 w-14 text-2xl",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand",
        sizes[size],
      )}
      title={user.name}
    >
      <span aria-hidden="true">{user.avatar_emoji || initials(user.name)}</span>
      <span className="sr-only-text">{user.name}</span>
    </span>
  );
}

/** A proper illustrated face — not just an emoji in a circle — for spots
 *  where someone should stand out, like the rewards podium. Seeded by
 *  username, so the same person always gets the same cartoon avatar. Falls
 *  back to the usual emoji avatar if the image can't be fetched. */
export function CartoonAvatar({
  user,
  size = 56,
  ringClassName,
}: {
  user: Pick<UserMini, "username" | "name" | "avatar_emoji">;
  size?: number;
  ringClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand ring-2",
          ringClassName,
        )}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        title={user.name}
      >
        <span aria-hidden="true">{user.avatar_emoji || initials(user.name)}</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, seeded SVG; not a local asset
    <img
      src={`https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(user.username)}&backgroundType=gradientLinear`}
      alt={user.name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-brand-soft ring-2", ringClassName)}
      style={{ width: size, height: size }}
    />
  );
}

export function StatTile({
  value,
  label,
  emoji,
}: {
  value: string | number;
  label: string;
  emoji?: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-2 py-3 text-center">
      {emoji ? (
        <span className="text-lg" aria-hidden="true">
          {emoji}
        </span>
      ) : null}
      <span className="mt-0.5 text-lg font-bold text-ink sm:text-xl">{value}</span>
      <span className="text-[11px] leading-tight text-muted sm:text-xs">{label}</span>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <div
      className="inline-flex rounded-2xl bg-raised p-1.5"
      role="tablist"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-[42px] items-center gap-2 rounded-xl px-4 text-[15px] font-semibold whitespace-nowrap transition-colors",
              selected ? "bg-surface text-ink shadow-sm" : "text-ink/80 hover:text-ink",
            )}
          >
            {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
            {option.label}
            {option.count !== undefined ? (
              <span className="text-xs font-medium text-muted">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-raised", className)} aria-hidden="true" />;
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3 py-6" role="status" aria-live="polite">
      <span className="sr-only-text">{label}</span>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-3/4" />
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3 border-danger/30 bg-danger-soft p-4">
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="tap rounded-xl border border-danger/40 px-3 text-sm font-semibold text-danger"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** A sectioned page heading with an optional action on the right. */
export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
