"use client";

import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { RewardEditor } from "@/components/rewards/RewardEditor";
import { RewardImage } from "@/components/rewards/RewardImage";
import { RewardShareSheet } from "@/components/rewards/RewardShareSheet";
import { Avatar, ErrorNote, LoadingBlock, SegmentedControl, StatTile } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { AdminClaim, AdminOverview, AdminReward, ClaimStatus } from "@/lib/types";
import { cn, formatNumber, relativeTime } from "@/lib/utils";

type Tab = "claims" | "rewards";
type StatusFilter = ClaimStatus | "all";

const STATUS_STYLE: Record<ClaimStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-warn-soft text-warn" },
  delivered: { label: "Delivered", className: "bg-success-soft text-success" },
  rejected: { label: "Rejected", className: "bg-danger-soft text-danger" },
};

/**
 * The admin's desk: every reward (hidden ones too) and every claim on them.
 * Only admins (is_staff) get here — everyone else sees a polite dead end,
 * and the API refuses them regardless.
 */
export default function ManagePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("claims");
  const [rewardFilter, setRewardFilter] = useState<number | null>(null);
  const { data, loading, error, reload } = useApi<AdminOverview>(
    user?.is_staff ? "/api/rewards/admin/overview/" : null,
  );
  // Bumped after any change so the claims list refetches alongside the totals.
  const [version, setVersion] = useState(0);
  const refreshAll = () => {
    reload();
    setVersion((v) => v + 1);
  };

  if (!user) return null;
  if (!user.is_staff) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <span className="text-5xl" aria-hidden="true">
          🔐
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-ink">Admins only</h1>
        <p className="mt-1 text-sm text-muted">This page is where rewards are managed. Your account doesn&apos;t have access.</p>
      </div>
    );
  }
  if (loading && !data) return <LoadingBlock label="Loading the admin desk…" />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const { stats, rewards } = data;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Admin</h1>
          <p className="text-sm text-muted">Rewards, and everyone who&apos;s claimed them.</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Totals">
        <StatTile emoji="⏳" value={stats.pending} label="Waiting to hand over" />
        <StatTile emoji="🎁" value={stats.delivered} label="Delivered" />
        <StatTile emoji="🏷️" value={`${stats.active_rewards}/${stats.rewards}`} label="Rewards live" />
        <StatTile emoji="🙋" value={stats.claims} label="Claims in total" />
      </section>

      <div className="hide-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          label="Admin section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "claims", label: "Claims", count: stats.pending || undefined },
            { value: "rewards", label: "Rewards", count: stats.rewards },
          ]}
        />
      </div>

      {tab === "claims" ? (
        <ClaimsPanel
          rewards={rewards}
          rewardFilter={rewardFilter}
          onRewardFilter={setRewardFilter}
          version={version}
          onChanged={refreshAll}
        />
      ) : (
        <RewardsPanel
          rewards={rewards}
          onChanged={refreshAll}
          onViewClaims={(id) => {
            setRewardFilter(id);
            setTab("claims");
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- rewards */

function RewardsPanel({
  rewards,
  onChanged,
  onViewClaims,
}: {
  rewards: AdminReward[];
  onChanged: () => void;
  onViewClaims: (rewardId: number) => void;
}) {
  const { toast } = useCelebration();
  const [editing, setEditing] = useState<AdminReward | "new" | null>(null);
  const [sharing, setSharing] = useState<AdminReward | null>(null);

  async function toggle(reward: AdminReward) {
    try {
      await api.patch(`/api/rewards/catalog/${reward.id}/`, { is_active: !reward.is_active });
      toast(reward.is_active ? `${reward.title} is hidden.` : `${reward.title} is live.`);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change that.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="min-w-0 flex-1 text-sm text-muted">
          Put up a reward with a picture, the XP someone needs, and how many people can claim it.
        </p>
        <Button icon="➕" onClick={() => setEditing("new")}>
          Add reward
        </Button>
      </div>

      {rewards.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rewards.map((reward) => (
            <li key={reward.id} className={cn("group card flex flex-col overflow-hidden", !reward.is_active && "opacity-75")}>
              <RewardImage src={reward.image}>
                <span className="absolute top-3 right-3 rounded-full bg-surface/95 px-3 py-1 text-sm font-extrabold text-brand shadow">
                  {formatNumber(reward.xp_required)} XP
                </span>
                <span
                  className={cn(
                    "absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold shadow",
                    reward.is_active ? "bg-success text-white" : "bg-ink text-canvas",
                  )}
                >
                  {reward.is_active ? "Live" : "Hidden"}
                </span>
              </RewardImage>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h3 className="text-lg font-extrabold text-ink">{reward.title}</h3>
                  {reward.description ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{reward.description}</p> : null}
                </div>

                <div>
                  <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
                    <span>
                      {reward.claimed_count} of {reward.max_claims} spots taken
                    </span>
                    <span>{reward.spots_left} left</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-raised">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(reward.claimed_count / Math.max(reward.max_claims, 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                  <span className={cn("rounded-full px-2.5 py-1", STATUS_STYLE.pending.className)}>
                    {reward.pending_count} pending
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1", STATUS_STYLE.delivered.className)}>
                    {reward.delivered_count} delivered
                  </span>
                  {reward.rejected_count ? (
                    <span className={cn("rounded-full px-2.5 py-1", STATUS_STYLE.rejected.className)}>
                      {reward.rejected_count} rejected
                    </span>
                  ) : null}
                </div>

                <Button fullWidth icon="📸" className="mt-auto" onClick={() => setSharing(reward)}>
                  Share on Instagram
                </Button>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(reward)}>
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => toggle(reward)}>
                    {reward.is_active ? "Hide" : "Show"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onViewClaims(reward.id)}>
                    Claims
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-8 text-center text-sm text-muted">No rewards yet — add the first one.</p>
      )}

      {sharing ? <RewardShareSheet offer={sharing} onClose={() => setSharing(null)} /> : null}

      {editing ? (
        <RewardEditor
          key={editing === "new" ? "new" : editing.id}
          offer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- claims */

function ClaimsPanel({
  rewards,
  rewardFilter,
  onRewardFilter,
  version,
  onChanged,
}: {
  rewards: AdminReward[];
  rewardFilter: number | null;
  onRewardFilter: (id: number | null) => void;
  version: number;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [query, setQuery] = useState("");
  const [handling, setHandling] = useState<{ claim: AdminClaim; to: ClaimStatus } | null>(null);

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (rewardFilter) params.set("reward", String(rewardFilter));
  if (query.trim().length >= 2) params.set("q", query.trim());
  params.set("v", String(version));
  const { data, loading, error, reload } = useApi<AdminClaim[]>(`/api/rewards/admin/claims/?${params}`);
  const claims = data ?? [];

  return (
    <div className="space-y-3">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
          {(["pending", "delivered", "rejected", "all"] as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={cn(
                "min-h-[38px] shrink-0 rounded-full border px-3.5 text-sm font-semibold capitalize",
                status === value ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink hover:bg-raised",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by reward"
          value={rewardFilter ?? ""}
          onChange={(e) => onRewardFilter(e.target.value ? Number(e.target.value) : null)}
          className="min-h-[40px] rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        >
          <option value="">Every reward</option>
          {rewards.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email or reward"
          aria-label="Search claims"
          className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
      </div>

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : claims.length ? (
        <ul className="card divide-y divide-[var(--line)]">
          {claims.map((claim) => (
            <li key={claim.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl">
                  <RewardImage src={claim.reward.image} className="aspect-auto h-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{claim.reward.title}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                    <Avatar user={claim.user} size="sm" />
                    <span className="truncate">
                      <b className="text-ink">{claim.user.name}</b> @{claim.user.username} ·{" "}
                      {formatNumber(claim.user.xp)} XP
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Claimed {relativeTime(claim.created_at)}
                    {claim.handled_by && claim.handled_at
                      ? ` · ${STATUS_STYLE[claim.status].label.toLowerCase()} by ${claim.handled_by.name} ${relativeTime(claim.handled_at)}`
                      : ""}
                  </p>
                  {claim.admin_note ? (
                    <p className="mt-1 rounded-lg bg-raised px-2.5 py-1.5 text-xs text-ink">{claim.admin_note}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_STYLE[claim.status].className)}>
                  {STATUS_STYLE[claim.status].label}
                </span>
                {claim.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => setHandling({ claim, to: "delivered" })}>
                      Deliver
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setHandling({ claim, to: "rejected" })}>
                      Reject
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setHandling({ claim, to: "pending" })}>
                    Reopen
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-8 text-center text-sm text-muted">
          {status === "pending" ? "Nothing waiting — every claim has been handled. 🎉" : "No claims match."}
        </p>
      )}

      {handling ? (
        <HandleClaimSheet
          key={`${handling.claim.id}-${handling.to}`}
          claim={handling.claim}
          to={handling.to}
          onClose={() => setHandling(null)}
          onDone={() => {
            setHandling(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

const HANDLE_COPY: Record<ClaimStatus, { title: string; action: string; hint: string }> = {
  delivered: {
    title: "Hand it over",
    action: "Mark delivered",
    hint: "Optional — how they collect it (a code, a pickup place). They'll see this and get notified.",
  },
  rejected: {
    title: "Decline this claim",
    action: "Reject claim",
    hint: "Optional — why. Rejecting frees the spot for someone else.",
  },
  pending: {
    title: "Reopen this claim",
    action: "Move back to pending",
    hint: "Puts it back in the queue. A rejected claim only comes back if a spot is still free.",
  },
};

function HandleClaimSheet({
  claim,
  to,
  onClose,
  onDone,
}: {
  claim: AdminClaim;
  to: ClaimStatus;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useCelebration();
  const [note, setNote] = useState(claim.admin_note);
  const [busy, setBusy] = useState(false);
  const copy = HANDLE_COPY[to];

  async function submit() {
    setBusy(true);
    try {
      await api.patch(`/api/rewards/admin/claims/${claim.id}/`, { status: to, admin_note: note.trim() });
      toast(`${claim.reward.title} → ${STATUS_STYLE[to].label.toLowerCase()} for ${claim.user.name}.`);
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update that claim.", "error");
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={copy.title}
      description={`${claim.reward.title} · ${claim.user.name} (@${claim.user.username})`}
      footer={
        <Button fullWidth size="lg" variant={to === "rejected" ? "danger" : "primary"} onClick={submit} disabled={busy}>
          {busy ? "Saving…" : copy.action}
        </Button>
      }
    >
      <TextAreaField
        label="Note to the traveller"
        data-autofocus
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
        hint={copy.hint}
      />
    </Sheet>
  );
}
