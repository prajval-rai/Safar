"use client";

import { AtSign, ChevronRight, LogOut, ShieldCheck, Trophy, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Progress } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import type { User } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

const ITEM =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-ink hover:bg-raised";

/**
 * The avatar in the top-right corner. Opens a small menu: who you are, your
 * level, change username, rewards, More (the full profile page) and log out.
 */
export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a click outside the menu or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu — ${user.name}`}
        className={cn(
          "tap flex items-center justify-center rounded-full ring-offset-2 ring-offset-canvas",
          open && "ring-2 ring-brand",
        )}
      >
        <Avatar user={user} size="sm" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute top-full right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-2 shadow-xl"
        >
          <div className="flex items-center gap-3 px-3 pt-2 pb-3">
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-ink">{user.name}</p>
              <p className="truncate text-sm text-muted">@{user.username}</p>
              {user.email ? <p className="truncate text-xs text-muted">{user.email}</p> : null}
            </div>
          </div>
          <div className="mx-3 mb-2 rounded-xl bg-raised px-3 py-2.5">
            <p className="flex items-baseline justify-between text-xs font-semibold text-muted">
              <span>
                Level {user.level} · <span className="text-brand">{user.level_name}</span>
              </span>
              <span className="text-ink">{formatNumber(user.xp)} XP</span>
            </p>
            <div className="mt-2">
              <Progress value={user.level_progress} size="sm" />
            </div>
          </div>

          <div className="border-t border-line pt-1.5">
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => {
                close();
                setRenaming(true);
              }}
            >
              <AtSign size={18} aria-hidden="true" className="text-muted" /> Change username
            </button>
            <Link href="/rewards" role="menuitem" className={ITEM} onClick={close}>
              <Trophy size={18} aria-hidden="true" className="text-muted" /> Rewards
            </Link>
            {user.is_staff ? (
              <Link href="/manage" role="menuitem" className={ITEM} onClick={close}>
                <ShieldCheck size={18} aria-hidden="true" className="text-muted" /> Admin
              </Link>
            ) : null}
            <Link href="/profile" role="menuitem" className={ITEM} onClick={close}>
              <UserIcon size={18} aria-hidden="true" className="text-muted" />
              <span className="flex-1">More</span>
              <span className="text-xs font-medium text-muted">Profile, theme &amp; settings</span>
              <ChevronRight size={16} aria-hidden="true" className="text-muted" />
            </Link>
          </div>

          <div className="mt-1.5 border-t border-line pt-1.5">
            <button
              type="button"
              role="menuitem"
              className={cn(ITEM, "text-danger hover:bg-danger-soft")}
              onClick={() => {
                close();
                signOut();
              }}
            >
              <LogOut size={18} aria-hidden="true" /> Log out
            </button>
          </div>
        </div>
      ) : null}

      {/* Keyed on the username so it starts fresh after a change. */}
      <UsernameSheet key={user.username} user={user} open={renaming} onClose={() => setRenaming(false)} />
    </div>
  );
}

function UsernameSheet({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const { setUser } = useAuth();
  const { toast } = useCelebration();
  const [value, setValue] = useState(user.username);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = value.trim();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<User>("/api/auth/me/", { username: next });
      setUser(updated);
      toast(`You're now @${updated.username}.`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change your username.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change username"
      description="It's in your profile link, so old links to your profile stop working."
      footer={
        <Button fullWidth size="lg" onClick={save} disabled={busy || !next || next === user.username}>
          {busy ? "Saving…" : "Save username"}
        </Button>
      }
    >
      <TextField
        label="Username"
        data-autofocus
        value={value}
        error={error ?? undefined}
        hint="3–30 letters, numbers, dots or underscores."
        onChange={(e) => setValue(e.target.value.replace(/\s/g, ""))}
        autoCapitalize="none"
        autoComplete="off"
        maxLength={30}
      />
    </Sheet>
  );
}
