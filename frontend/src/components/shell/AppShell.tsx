"use client";

import {
  BadgeCheck,
  Bell,
  IndianRupee,
  UserMinus,
  Unlock,
  BellRing,
  Clock,
  Compass,
  Home,
  Map as MapIcon,
  MessageCircle,
  MessageSquare,
  PartyPopper,
  PlayCircle,
  Rss,
  Route,
  Trophy,
  UserPlus,
  User as UserIcon,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAmbientTheme } from "@/lib/ambientTheme";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Avatar, ErrorNote, Skeleton } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useOfflineSync, usePendingSyncCount } from "@/lib/offlineQueue";
import { modeStore } from "@/lib/themeStore";
import { THEMES } from "@/lib/themes";
import type { Notification, NotificationKind, NotificationPage } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  match: (path: string) => boolean;
  /** Phones only have room for five, so the rest live in the sidebar. */
  mobile: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Home", Icon: Home, match: (p) => p === "/", mobile: true },
  { href: "/trips", label: "My Trips", Icon: MapIcon, match: (p) => p.startsWith("/trips"), mobile: true },
  { href: "/explore", label: "Explore", Icon: Compass, match: (p) => p.startsWith("/explore"), mobile: true },
  { href: "/tracks", label: "Tracks", Icon: Route, match: (p) => p.startsWith("/tracks"), mobile: false },
  { href: "/feed", label: "Feed", Icon: MessageSquare, match: (p) => p.startsWith("/feed"), mobile: true },
  { href: "/rewards", label: "Rewards", Icon: Trophy, match: (p) => p.startsWith("/rewards"), mobile: true },
  // On phones the profile is the avatar in the top bar, which frees this tab for Feed.
  { href: "/profile", label: "Profile", Icon: UserIcon, match: (p) => p.startsWith("/profile"), mobile: false },
];

/**
 * First time you sign in on a new device there's nothing saved locally, so we
 * fall back to the light/dark mode stored on your account. A local choice
 * always wins.
 */
function useServerMode() {
  const { user } = useAuth();
  const { setMode } = useTheme();

  useEffect(() => {
    if (!user) return;
    if (!modeStore.hasStoredMode() && user.color_mode) setMode(user.color_mode);
  }, [user, setMode]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  useServerMode();
  useOfflineSync();
  const ambient = useAmbientTheme();

  // Live Trip mode takes over the screen — no nav competing for attention.
  const focusMode = /^\/trips\/[^/]+\/(live|complete)$/.test(pathname);

  if (focusMode) {
    return (
      <main id="main" className="min-h-dvh">
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      <Sidebar pathname={pathname} />
      <div className="flex min-h-dvh flex-col">
        <TopBar pathname={pathname} ambient={ambient} />
        <main id="main" className="w-full flex-1 px-4 pt-6 pb-28 sm:px-8 lg:pb-12">
          <div className="mx-auto w-full max-w-6xl">
            {loading && !user ? <ShellSkeleton /> : children}
          </div>
        </main>
      </div>
      <BottomNav pathname={pathname} />
    </div>
  );
}

/* ---------------------------------------------------------------- brand */

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="Safar home">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-on-brand">
        S
      </span>
      <span className="leading-tight">
        <span className="block text-[17px] font-bold text-ink">Safar</span>
        <span className="block text-[10.5px] font-semibold tracking-[0.14em] text-muted">
          PLAN · TRACK · EARN
        </span>
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------- sidebar */

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-[86px] items-center border-b border-line px-6">
        <BrandMark />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1.5 overflow-y-auto p-3.5">
        {NAV.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[52px] items-center gap-3.5 rounded-2xl px-4 text-[15px] font-semibold transition-colors",
                active
                  ? "bg-brand text-on-brand"
                  : "text-ink hover:bg-raised",
              )}
            >
              <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <p className="flex items-center gap-2 border-t border-line px-6 py-4 text-xs text-muted">
        Plan → Travel → Track → Earn
      </p>
    </aside>
  );
}

/* --------------------------------------------------------------- top bar */

function titleFor(pathname: string): string {
  if (pathname === "/") return "Home";
  if (pathname === "/trips/new") return "Plan a Trip";
  const hit = NAV.find((item) => item.href !== "/" && item.match(pathname));
  return hit?.label ?? "Safar";
}

/** Polls the unread count so the bell's badge is right even before it's opened.
 *  A plain interval, not a websocket — matches how little this needs to be
 *  instant (an invite or a follow can wait 45 seconds). */
function useUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      api
        .get<{ unread_count: number }>("/api/notifications/unread-count/")
        .then((data) => {
          if (active) setCount(data.unread_count);
        })
        .catch(() => {
          // A missed poll isn't worth surfacing — the next one will catch up.
        });
    };
    load();
    const interval = setInterval(load, 45_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled]);
  return [count, setCount] as const;
}

const NOTIFICATION_ICONS: Record<NotificationKind, LucideIcon> = {
  trip_member_added: MapIcon,
  trip_joined: UserPlus,
  trip_started: PlayCircle,
  trip_reminder: BellRing,
  activity_reminder: Clock,
  trip_cancelled: XCircle,
  trip_left: UserMinus,
  trip_completed: PartyPopper,
  chat_message: MessageCircle,
  settle_paid: IndianRupee,
  settle_confirmed: BadgeCheck,
  xp_released: Unlock,
  track_used: Route,
  track_published: Rss,
  new_follower: UserPlus,
  achievement_unlocked: Trophy,
};

function notificationHref(note: Notification): string | null {
  if (note.trip_id) {
    // Money and chat notifications open the trip straight on that tab.
    const money = note.kind === "settle_paid" || note.kind === "settle_confirmed";
    const tab = money ? "?tab=expenses" : note.kind === "chat_message" ? "?tab=chat" : "";
    return `/trips/${note.trip_id}${tab}`;
  }
  if (note.track_id) return `/explore/${note.track_id}`;
  if (note.kind === "new_follower" && note.actor) return `/u/${note.actor.username}`;
  return null;
}

function TopBar({
  pathname,
  ambient,
}: {
  pathname: string;
  ambient: ReturnType<typeof useAmbientTheme>;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [bellOpen, setBellOpen] = useState(false);
  const [unread, setUnread] = useUnreadCount(Boolean(user));
  const pendingSync = usePendingSyncCount();
  const { data, loading, error, reload, set } = useApi<NotificationPage>(
    bellOpen ? "/api/notifications/" : null,
  );
  // The list fetch's own unread_count is the source of truth once it lands.
  useEffect(() => {
    if (data) setUnread(data.unread_count);
  }, [data, setUnread]);

  const markRead = useCallback(
    (note: Notification) => {
      if (note.read) return;
      setUnread((n) => Math.max(0, n - 1));
      if (data) {
        set({
          ...data,
          results: data.results.map((n) => (n.id === note.id ? { ...n, read: true } : n)),
          unread_count: Math.max(0, data.unread_count - 1),
        });
      }
      api.post(`/api/notifications/${note.id}/read/`).catch(() => {
        // Best-effort — worst case it still shows read next time the list loads.
      });
    },
    [data, set, setUnread],
  );

  function openNotification(note: Notification) {
    markRead(note);
    const href = notificationHref(note);
    setBellOpen(false);
    if (href) router.push(href);
  }

  function markAllRead() {
    if (!data || data.unread_count === 0) return;
    setUnread(0);
    set({ ...data, results: data.results.map((n) => ({ ...n, read: true })), unread_count: 0 });
    api.post("/api/notifications/read-all/").catch(() => {});
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div
        className="flex h-[64px] items-center gap-3 px-4 sm:px-8 lg:h-[86px]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {/* Phones and tablets have no sidebar, so the brand moves up here. */}
        <div className="lg:hidden">
          <BrandMark />
        </div>
        <p className="hidden text-base text-muted lg:block">{titleFor(pathname)}</p>
        {/* Only shown once it's actually tied to a trip — no badge for the
         *  plain site default, which would just be noise. */}
        {ambient && ambient.source !== "default" ? (
          <span
            className="hidden items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand lg:flex"
            title={ambient.tripTitle ? `From ${ambient.tripTitle}` : undefined}
          >
            <span aria-hidden="true">🎨</span>
            {THEMES.find((t) => t.id === ambient.theme)?.name ?? ambient.theme}
          </span>
        ) : null}
        {pendingSync > 0 ? (
          <span
            className="flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-xs font-bold text-warn"
            title="Saved while offline — will finish once you're back online."
          >
            <span aria-hidden="true">📡</span>
            {pendingSync} pending
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link
              href="/rewards"
              className="hidden items-center gap-1.5 rounded-full bg-brand-soft px-3.5 py-2 text-sm font-bold text-brand sm:flex"
            >
              {user.xp.toLocaleString("en-IN")} XP
              <span className="sr-only-text">Your total experience points</span>
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => setBellOpen(true)}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            className="tap relative flex items-center justify-center rounded-full text-ink hover:bg-raised"
          >
            <Bell size={22} strokeWidth={1.8} aria-hidden="true" />
            {unread > 0 ? (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </button>

          {user ? (
            <Link
              href="/profile"
              className="tap flex items-center justify-center rounded-full lg:hidden"
              aria-label={`Profile — ${user.name}`}
            >
              <Avatar user={user} size="sm" />
            </Link>
          ) : null}
        </div>
      </div>

      <Sheet
        open={bellOpen}
        onClose={() => setBellOpen(false)}
        title="Notifications"
        footer={
          data && data.unread_count > 0 ? (
            <Button variant="secondary" fullWidth onClick={markAllRead}>
              Mark all as read
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="space-y-2.5 py-1">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-3/4" />
          </div>
        ) : error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : !data || data.results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Bell size={30} strokeWidth={1.6} className="text-muted" aria-hidden="true" />
            <p className="text-[15px] font-semibold text-ink">You&apos;re all caught up.</p>
            <p className="text-sm text-muted">Invites and trip updates will show up here.</p>
          </div>
        ) : (
          <ul className="-mx-1 space-y-1">
            {data.results.map((note) => {
              const Icon = NOTIFICATION_ICONS[note.kind];
              const clickable = notificationHref(note) !== null;
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(note)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                      note.read ? "hover:bg-raised" : "bg-brand-soft/50 hover:bg-brand-soft",
                      clickable ? "cursor-pointer" : "cursor-default",
                    )}
                  >
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-brand"
                      aria-hidden="true"
                    >
                      <Icon size={17} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[15px] font-semibold text-ink">{note.title}</span>
                        {!note.read ? (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                        ) : null}
                      </span>
                      {note.body ? <span className="block text-sm text-muted">{note.body}</span> : null}
                      <span className="mt-0.5 block text-xs text-muted">{relativeTime(note.created_at)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </header>
  );
}

/* ----------------------------------------------------------- bottom nav */

function BottomNav({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {NAV.filter((item) => item.mobile).map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold transition-colors",
                  active ? "text-brand" : "text-muted",
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span className="leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ShellSkeleton() {
  return (
    <div className="space-y-3 py-6" role="status" aria-live="polite">
      <span className="sr-only-text">Loading Safar…</span>
      <div className="h-36 animate-pulse rounded-2xl bg-raised" />
      <div className="h-24 animate-pulse rounded-2xl bg-raised" />
      <div className="h-24 animate-pulse rounded-2xl bg-raised" />
    </div>
  );
}
