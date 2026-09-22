"use client";

import {
  Bell,
  Compass,
  Home,
  Map as MapIcon,
  MessageSquare,
  Route,
  Trophy,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Avatar } from "@/components/ui/Bits";
import { Sheet } from "@/components/ui/Sheet";
import { themeStore } from "@/lib/themeStore";
import { isThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

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
  { href: "/feed", label: "Feed", Icon: MessageSquare, match: (p) => p.startsWith("/feed"), mobile: false },
  { href: "/rewards", label: "Rewards", Icon: Trophy, match: (p) => p.startsWith("/rewards"), mobile: true },
  { href: "/profile", label: "Profile", Icon: UserIcon, match: (p) => p.startsWith("/profile"), mobile: true },
];

/**
 * First time you sign in on a new device there's nothing saved locally, so we
 * fall back to the theme stored on your account. A local choice always wins.
 */
function useServerTheme() {
  const { user } = useAuth();
  const { setTheme, setMode } = useTheme();

  useEffect(() => {
    if (!user) return;
    if (!themeStore.hasStoredTheme() && isThemeId(user.theme)) setTheme(user.theme);
    if (!themeStore.hasStoredMode() && user.color_mode) setMode(user.color_mode);
  }, [user, setTheme, setMode]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  useServerTheme();

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
        <TopBar pathname={pathname} />
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

function TopBar({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  const [bellOpen, setBellOpen] = useState(false);

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
            aria-label="Notifications"
            className="tap flex items-center justify-center rounded-full text-ink hover:bg-raised"
          >
            <Bell size={22} strokeWidth={1.8} aria-hidden="true" />
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

      <Sheet open={bellOpen} onClose={() => setBellOpen(false)} title="Notifications">
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Bell size={30} strokeWidth={1.6} className="text-muted" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-ink">You&apos;re all caught up.</p>
          <p className="text-sm text-muted">Invites and trip updates will show up here.</p>
        </div>
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
