"use client";

import Link from "next/link";
import { useState } from "react";

import { MotifDivider } from "@/components/art/Motif";
import { Avatar, CartoonAvatar, Chip, ErrorNote, LoadingBlock, Progress, SegmentedControl } from "@/components/ui/Bits";
import { Sheet } from "@/components/ui/Sheet";
import { useApi } from "@/lib/hooks";
import type { RewardsPayload, UserMini, XPRule } from "@/lib/types";
import { cn, formatNumber, shortDate } from "@/lib/utils";

type View = "achievements" | "activity" | "leaderboard";

/**
 * Deliberately not a gaming dashboard: your level, how close the next one is,
 * what you've unlocked, and what earned you points. Nothing else.
 */
export default function RewardsPage() {
  const [view, setView] = useState<View>("achievements");
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data, loading, error, reload } = useApi<RewardsPayload>("/api/rewards/me/");

  if (loading) return <LoadingBlock label="Loading your rewards…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const { user } = data;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Rewards</h1>
        <p className="text-sm text-muted">Everything you&apos;ve earned on the road.</p>
      </header>

      <section className="card relative overflow-hidden p-5 text-center">
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          aria-label="How XP works"
          className="tap absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-muted hover:text-ink"
        >
          <span aria-hidden="true">ⓘ</span>
        </button>
        <p className="text-sm font-bold tracking-widest text-muted uppercase">Level {user.level}</p>
        <p className="mt-1 text-3xl font-extrabold text-brand">{user.level_name}</p>
        <p className="mt-1 text-sm text-muted">
          {formatNumber(user.xp_into_level)} / {formatNumber(user.xp_for_next_level)} XP to level{" "}
          {user.level + 1}
        </p>
        <div className="mx-auto mt-4 max-w-sm">
          <Progress value={user.level_progress} />
        </div>
        <MotifDivider className="mt-5" />
        <p className="mt-3 text-sm text-muted">
          <span className="font-bold text-ink">{formatNumber(user.xp)} XP</span> earned in total ·{" "}
          <span className="font-bold text-ink">
            {data.unlocked_count}/{data.total_count}
          </span>{" "}
          achievements
        </p>
      </section>

      <XPRulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} rules={data.xp_rules} />

      <div className="hide-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          label="Rewards view"
          value={view}
          onChange={setView}
          options={[
            { value: "achievements", label: "Achievements" },
            { value: "activity", label: "Recent XP" },
            { value: "leaderboard", label: "Leaderboard" },
          ]}
        />
      </div>

      {view === "achievements" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.achievements.map((achievement) => (
            <li
              key={achievement.code}
              className={cn(
                "card flex items-start gap-3 p-4",
                achievement.unlocked ? "border-brand/35 bg-brand-soft/40" : "",
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl",
                  achievement.unlocked ? "bg-brand-soft" : "bg-raised opacity-60",
                )}
                aria-hidden="true"
              >
                {achievement.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-bold text-ink">{achievement.title}</p>
                  {/* Unlocked state is a word and a tick, not only a colour. */}
                  {achievement.unlocked ? (
                    <Chip tone="success">
                      <span aria-hidden="true">✓</span> Unlocked
                    </Chip>
                  ) : (
                    <Chip>+{achievement.xp_reward} XP</Chip>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted">{achievement.description}</p>
                {!achievement.unlocked ? (
                  <div className="mt-2.5">
                    <Progress
                      value={(achievement.current / achievement.goal_value) * 100}
                      size="sm"
                      label={`${achievement.current} of ${achievement.goal_value}`}
                    />
                  </div>
                ) : achievement.unlocked_at ? (
                  <p className="mt-1.5 text-xs text-muted">
                    Earned {shortDate(achievement.unlocked_at.slice(0, 10))}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {view === "activity" ? (
        data.recent.length ? (
          <ul className="card divide-y divide-[var(--line)]">
            {data.recent.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{entry.reason}</p>
                  <p className="text-xs text-muted">
                    {entry.trip_title ? `${entry.trip_title} · ` : ""}
                    {shortDate(entry.created_at.slice(0, 10))}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold",
                    entry.amount >= 0 ? "text-success" : "text-muted",
                  )}
                >
                  {entry.amount >= 0 ? "+" : ""}
                  {formatNumber(entry.amount)} XP
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card p-6 text-center text-sm text-muted">
            Complete an activity on a trip and your XP will show up here.
          </p>
        )
      ) : null}

      {view === "leaderboard" ? <Leaderboard /> : null}
    </div>
  );
}

/** The full XP rulebook — what earns it and what costs it, in one place, so
 *  nobody has to guess why a number moved. */
function XPRulesSheet({
  open,
  onClose,
  rules,
}: {
  open: boolean;
  onClose: () => void;
  rules: XPRule[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title="How XP works" description="Every way to earn it, and the one way to lose it.">
      <ul className="space-y-3">
        {rules.map((rule) => (
          <li key={rule.title} className="flex items-start gap-3 rounded-xl bg-raised p-3">
            <span className="mt-0.5 text-xl" aria-hidden="true">
              {rule.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{rule.title}</p>
              <p className="mt-0.5 text-sm text-muted">{rule.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

type LeaderboardRow = UserMini & { rank: number; is_me: boolean };

function Leaderboard() {
  const { data, loading, error, reload } =
    useApi<LeaderboardRow[]>("/api/rewards/leaderboard/");

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const rows = data ?? [];
  // Only worth a podium once there's actually a top three to show off.
  const top3 = rows.length >= 3 ? rows.slice(0, 3) : null;
  const rest = top3 ? rows.slice(3) : rows;

  return (
    <div className="space-y-4">
      {top3 ? <Podium top3={top3} /> : null}
      {rest.length ? (
        <ol className="card divide-y divide-[var(--line)]">
          {rest.map((row) => (
            <li
              key={row.id}
              className={cn("flex items-center gap-3 p-3.5", row.is_me && "bg-brand-soft/50")}
            >
              <span className="w-6 text-sm font-bold text-muted">{row.rank}</span>
              <Link
                href={row.is_me ? "/profile" : `/u/${row.username}`}
                className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
              >
                <Avatar user={row} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {row.name} {row.is_me ? <span className="text-xs text-brand">(you)</span> : null}
                  </p>
                  <p className="text-xs text-muted">Level {row.level}</p>
                </div>
              </Link>
              <span className="shrink-0 text-sm font-bold text-brand">{formatNumber(row.xp)} XP</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];
// Classic podium layout: 2nd on the left, 1st in the middle (and raised), 3rd on the right.
const PODIUM_ORDER = [1, 0, 2];

/** Top three on the leaderboard, called out with medals and a bigger, ranked
 *  avatar for whoever's in the lead — everyone else stays in the plain list. */
function Podium({ top3 }: { top3: LeaderboardRow[] }) {
  return (
    <div className="card flex items-end justify-center gap-2 overflow-hidden p-5 sm:gap-4">
      {PODIUM_ORDER.map((i) => {
        const row = top3[i];
        const isFirst = i === 0;
        return (
          <Link
            key={row.id}
            href={row.is_me ? "/profile" : `/u/${row.username}`}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center transition-colors hover:opacity-90",
              isFirst && "-mt-4 border border-brand/25 bg-brand-soft/40 pb-4",
            )}
          >
            <span className={isFirst ? "text-3xl" : "text-xl"} aria-hidden="true">
              {MEDALS[i]}
            </span>
            <span className="relative">
              <CartoonAvatar
                user={row}
                size={isFirst ? 80 : 56}
                ringClassName={isFirst ? "ring-[var(--brand)]" : "ring-line"}
              />
              <span
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-ink text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                {row.rank}
              </span>
            </span>
            <p className="w-full truncate text-[13px] font-bold text-ink">{row.name}</p>
            {/* Their level title, in Hindi — "Awara" (wanderer), "Yatri" (traveller)… */}
            <p className="-mt-0.5 truncate text-[11px] font-semibold text-brand/80">{row.level_name}</p>
            {row.is_me ? <p className="text-[11px] font-semibold text-brand">(you)</p> : null}
            <p className="text-xs font-bold text-brand">{formatNumber(row.xp)} XP</p>
          </Link>
        );
      })}
    </div>
  );
}
