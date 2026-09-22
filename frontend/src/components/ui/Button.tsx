"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong active:bg-brand-strong",
  accent: "bg-accent text-on-accent hover:opacity-90",
  secondary: "bg-surface text-ink border border-line hover:bg-raised",
  ghost: "bg-transparent text-ink hover:bg-raised",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/10",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-[38px] px-3 text-sm gap-1.5",
  md: "min-h-[44px] px-4 text-sm gap-2",
  lg: "min-h-[52px] px-5 text-base gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** Decorative icon — the label beside it is what screen readers announce. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  icon,
  children,
  className,
  ...rest
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth,
  icon,
  children,
  className,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </Link>
  );
}

/**
 * Icon-only control. `label` is required and becomes the accessible name —
 * the brief asks for no unlabelled icons anywhere.
 */
export function IconButton({
  label,
  children,
  className,
  variant = "ghost",
  ...rest
}: { label: string; children: ReactNode; variant?: Variant } & ComponentProps<"button">) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "tap inline-flex items-center justify-center rounded-xl transition-colors",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
