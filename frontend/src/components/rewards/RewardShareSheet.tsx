"use client";

import { useEffect, useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { SegmentedControl, Skeleton } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { type RewardCardFormat, renderRewardCard, rewardsLink } from "@/lib/rewardCard";
import type { RewardOffer } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

/**
 * Share a reward as an Instagram-ready card — a 9:16 story or a 4:5 post. On
 * a phone, "Share" opens the system share sheet with the image attached, so
 * it goes straight into Instagram (or WhatsApp); on a computer, save the
 * image and post it from there. The caption is ready to paste.
 */
export function RewardShareSheet({ offer, onClose }: { offer: RewardOffer; onClose: () => void }) {
  const [format, setFormat] = useState<RewardCardFormat>("story");
  const [card, setCard] = useState<{ blob: Blob; url: string; format: RewardCardFormat } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useCelebration();

  const spots = offer.max_claims === 1 ? "just 1 spot" : `only ${offer.max_claims} spots`;
  const caption =
    `🎁 New reward on Safar: ${offer.title}\n` +
    `Unlock it with ${formatNumber(offer.xp_required)} XP — ${spots}, first come first served.\n` +
    `Travel, earn XP for every kilometre, and claim it 👉 ${rewardsLink()}\n\n` +
    `#Safar #TravelRewards #TravelIndia #RoadTrip`;
  const fileName = `safar-reward-${offer.title.replace(/[^\w-]+/g, "-").toLowerCase()}-${format}.png`;

  useEffect(() => {
    let url: string | null = null;
    let active = true;
    renderRewardCard(offer, format)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) {
          setError(null);
          setCard({ blob, url, format });
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't create the card.");
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [offer, format]);

  const ready = card?.format === format ? card : null;

  async function copyCaption(quiet = false) {
    try {
      await navigator.clipboard.writeText(caption);
      if (!quiet) toast("Caption copied — paste it into Instagram.");
    } catch {
      if (!quiet) toast("Couldn't copy the caption.", "error");
    }
  }

  function download() {
    if (!ready) return;
    const a = document.createElement("a");
    a.href = ready.url;
    a.download = fileName;
    a.click();
  }

  async function share() {
    if (!ready) return;
    const file = new File([ready.blob], fileName, { type: "image/png" });
    // Instagram ignores shared text, so the caption goes on the clipboard first.
    await copyCaption(true);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: offer.title, text: caption });
        toast("Caption is on your clipboard — paste it in Instagram.");
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    // Desktop browsers can't hand a file to Instagram: save it instead.
    download();
    toast("Image saved and caption copied — post it from Instagram.");
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Share reward"
      description="A ready-made card for your story or feed, with a QR code to the Rewards page."
      footer={
        <div className="space-y-2">
          <Button fullWidth size="lg" icon="📤" onClick={share} disabled={!ready}>
            Share {format === "story" ? "story" : "post"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon="⬇️" onClick={download} disabled={!ready}>
              Save image
            </Button>
            <Button variant="secondary" icon="📋" onClick={() => copyCaption()}>
              Copy caption
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          label="Card format"
          value={format}
          onChange={setFormat}
          options={[
            { value: "story", label: "Story 9:16" },
            { value: "post", label: "Post 4:5" },
          ]}
        />

        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : ready ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ready.url}
            alt={`Share card for ${offer.title}: ${formatNumber(offer.xp_required)} XP to unlock`}
            className={`mx-auto w-full rounded-2xl border border-line shadow-xl ${format === "story" ? "max-w-[260px]" : "max-w-xs"}`}
          />
        ) : (
          <Skeleton
            className={`mx-auto w-full rounded-2xl ${format === "story" ? "aspect-[9/16] max-w-[260px]" : "aspect-[4/5] max-w-xs"}`}
          />
        )}

        <details className="rounded-xl bg-raised p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Caption</summary>
          <p className="mt-2 whitespace-pre-line text-muted">{caption}</p>
        </details>
      </div>
    </Sheet>
  );
}
