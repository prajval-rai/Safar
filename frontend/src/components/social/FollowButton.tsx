"use client";

import { UserCheck, UserPlus } from "lucide-react";
import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  username: string;
  following: boolean;
  /** Called with the new state and the person's new follower count. */
  onChange?: (following: boolean, followers: number) => void;
  size?: "sm" | "md";
  className?: string;
}

/** Follow / Following toggle. Updates instantly and rolls back if the request fails. */
export function FollowButton({ username, following, onChange, size = "md", className }: Props) {
  const [state, setState] = useState(following);
  const [busy, setBusy] = useState(false);
  const { toast } = useCelebration();

  async function toggle() {
    const next = !state;
    setState(next);
    setBusy(true);
    try {
      const path = `/api/users/${encodeURIComponent(username)}/follow/`;
      const result = next
        ? await api.post<{ is_following: boolean; followers_count: number }>(path)
        : await api.del<{ is_following: boolean; followers_count: number }>(path);
      setState(result.is_following);
      onChange?.(result.is_following, result.followers_count);
    } catch {
      setState(!next);
      toast("Couldn't update that. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const Icon = state ? UserCheck : UserPlus;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={state}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-60",
        size === "sm" ? "min-h-[40px] px-3 text-sm" : "min-h-[44px] px-4 text-sm",
        state
          ? "border border-line bg-surface text-ink hover:bg-raised"
          : "bg-brand text-on-brand hover:bg-brand-strong",
        className,
      )}
    >
      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
      {state ? "Following" : "Follow"}
      <span className="sr-only-text"> {username}</span>
    </button>
  );
}
