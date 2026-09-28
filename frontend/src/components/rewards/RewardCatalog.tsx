"use client";

import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ClaimStatus, RewardOffer } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

import { RewardImage } from "./RewardImage";

const CLAIM_BADGE: Record<ClaimStatus, { label: string; className: string }> = {
  pending: { label: "⏳ Claimed — on its way", className: "bg-warn-soft text-warn" },
  delivered: { label: "🎁 Delivered", className: "bg-success-soft text-success" },
  rejected: { label: "Declined", className: "bg-danger-soft text-danger" },
};

/**
 * Real rewards travellers can claim once they've earned enough XP. Claiming
 * doesn't spend XP — it's a bar you clear — and each reward only goes to as
 * many people as its rule allows. Rewards are added and handed over by
 * admins, from the separate Admin page. Tapping Claim before you've got the
 * XP calls `onNeedMoreXp` so the page can show how to earn the rest.
 */
export function RewardCatalog({
  myXp,
  onNeedMoreXp,
}: {
  myXp: number;
  onNeedMoreXp: (offer: RewardOffer, needed: number) => void;
}) {
  const { user } = useAuth();
  const { toast } = useCelebration();
  const { data, loading, error, reload } = useApi<RewardOffer[]>("/api/rewards/catalog/");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function claim(offer: RewardOffer) {
    setBusyId(offer.id);
    try {
      await api.post(`/api/rewards/catalog/${offer.id}/claim/`);
      toast(`Claimed: ${offer.title} 🎁 An admin will hand it over.`);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't claim that.", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  const offers = data ?? [];

  return (
    <div className="space-y-4">
      {user?.is_staff ? (
        <Link
          href="/manage"
          className="card flex items-center justify-between gap-3 p-4 text-sm hover:bg-raised"
        >
          <span className="text-muted">
            <b className="text-ink">You&apos;re an admin.</b> Add rewards and hand over claims from the Admin page.
          </span>
          <span className="shrink-0 font-bold text-brand">Open Admin →</span>
        </Link>
      ) : null}

      {offers.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer) => {
            const progress = Math.min(100, (myXp / Math.max(offer.xp_required, 0.01)) * 100);
            const affordable = myXp >= offer.xp_required;
            const soldOut = offer.spots_left === 0 && !offer.claimed_by_me;
            return (
              <li
                key={offer.id}
                className={cn(
                  "group card flex flex-col overflow-hidden transition-shadow hover:shadow-lg",
                  offer.my_claim_status === "delivered" && "border-success/40",
                )}
              >
                <RewardImage src={offer.image}>
                  <span className="absolute top-3 right-3 rounded-full bg-surface/95 px-3 py-1 text-sm font-extrabold text-brand shadow">
                    {formatNumber(offer.xp_required)} XP
                  </span>
                  <span
                    className={cn(
                      "absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold shadow",
                      soldOut ? "bg-ink text-canvas" : "bg-surface/95 text-ink",
                    )}
                  >
                    {soldOut
                      ? "All claimed"
                      : offer.spots_left <= 3
                        ? `Only ${offer.spots_left} left`
                        : `${offer.spots_left} of ${offer.max_claims} left`}
                  </span>
                </RewardImage>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h3 className="text-lg leading-snug font-extrabold text-ink">{offer.title}</h3>
                    {offer.description ? (
                      <p className="mt-1 line-clamp-3 text-sm text-muted">{offer.description}</p>
                    ) : null}
                  </div>

                  {!offer.claimed_by_me && !soldOut ? (
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between text-xs">
                        <span className="font-semibold text-muted">
                          {formatNumber(myXp)} / {formatNumber(offer.xp_required)} XP
                        </span>
                        <span className={cn("font-bold", affordable ? "text-success" : "text-ink")}>
                          {affordable ? "Ready!" : `${Math.floor(progress)}%`}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-raised">
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-700",
                            affordable ? "bg-success" : "bg-brand",
                          )}
                          style={{ width: `${Math.max(3, progress)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-auto">
                    {offer.my_claim_status ? (
                      <div className="space-y-1.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-3 py-1.5 text-sm font-bold",
                            CLAIM_BADGE[offer.my_claim_status].className,
                          )}
                        >
                          {CLAIM_BADGE[offer.my_claim_status].label}
                        </span>
                        {offer.my_claim_note ? (
                          <p className="rounded-xl bg-raised px-3 py-2 text-xs text-ink">{offer.my_claim_note}</p>
                        ) : null}
                      </div>
                    ) : !affordable && !soldOut ? (
                      <Button
                        fullWidth
                        variant="secondary"
                        icon="🔒"
                        onClick={() => onNeedMoreXp(offer, offer.xp_required - myXp)}
                      >
                        Claim reward
                      </Button>
                    ) : offer.blocked_reason ? (
                      <p className="rounded-xl bg-raised px-3 py-2.5 text-center text-sm font-semibold text-muted">
                        <span aria-hidden="true">🔒</span> {offer.blocked_reason}
                      </p>
                    ) : (
                      <Button fullWidth icon="🎁" onClick={() => claim(offer)} disabled={busyId === offer.id}>
                        {busyId === offer.id ? "Claiming…" : "Claim reward"}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-5xl" aria-hidden="true">
            🎁
          </span>
          <p className="font-bold text-ink">No rewards up for grabs yet</p>
          <p className="text-sm text-muted">Keep travelling — every kilometre counts towards the next one.</p>
        </div>
      )}
    </div>
  );
}
