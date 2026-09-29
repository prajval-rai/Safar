"use client";

import { Download, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { SegmentedControl, Skeleton } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { REFERRAL_XP, referralLink } from "@/lib/referral";
import { type ReferralCardFormat, renderReferralCard } from "@/lib/referralCard";
import type { User } from "@/lib/types";

/** The WhatsApp-ready picture of your invite: what Safar is, your code and a
 *  QR code for your link. Shared as an image, with the link in the message so
 *  it's tappable in the chat. */
export function ReferralCardSheet({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const [format, setFormat] = useState<ReferralCardFormat>("post");
  const [card, setCard] = useState<{ blob: Blob; url: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useCelebration();
  const link = typeof window === "undefined" ? "" : referralLink(user.referral_code);
  const message = `Join me on Safar ✈️ — plan trips together, travel with a live plan, split costs and earn XP for real rewards. Once you're in, invite your friends too: +${REFERRAL_XP} XP for every one who joins.\nJoin free with my link: ${link}`;
  const fileName = `safar-invite-${format}.png`;
  const key = `${format}-${user.referral_code}`;

  // Draw the card whenever the sheet opens or the size changes.
  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let active = true;
    renderReferralCard(
      { name: user.name, code: user.referral_code, link: referralLink(user.referral_code), xp: REFERRAL_XP },
      format,
    )
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) setCard({ blob, url, key: `${format}-${user.referral_code}` });
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't create the card.");
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      setCard(null);
      setError(null);
    };
  }, [open, format, user.name, user.referral_code]);

  const ready = card && card.key === key ? card : null;

  async function share() {
    const file = ready ? new File([ready.blob], fileName, { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Join me on Safar", text: message });
        return;
      }
      // No image sharing here (most laptops): save the picture and open WhatsApp with the message.
      download();
      whatsapp();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast("Couldn't share that — save the image and send it yourself.", "error");
    }
  }

  function download() {
    if (!ready) return;
    const a = document.createElement("a");
    a.href = ready.url;
    a.download = fileName;
    a.click();
  }

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share your invite card"
      description="Post it in a chat or on your WhatsApp status. Friends who join with it earn you +10 XP."
      footer={
        <div className="space-y-2">
          <Button fullWidth size="lg" icon={<Share2 size={18} aria-hidden="true" />} onClick={share} disabled={!ready}>
            Share on WhatsApp
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={<Download size={16} aria-hidden="true" />} onClick={download} disabled={!ready}>
              Save image
            </Button>
            <Button variant="secondary" icon={<MessageCircle size={16} aria-hidden="true" />} onClick={whatsapp}>
              Send as text
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-3 flex justify-center">
        <SegmentedControl
          label="Card size"
          value={format}
          onChange={setFormat}
          options={[
            { value: "post", label: "Chat" },
            { value: "story", label: "Status" },
          ]}
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ready.url}
          alt={`Invite card: travel with ${user.name} on Safar, invite code ${user.referral_code}`}
          className="mx-auto w-full max-w-xs rounded-2xl border border-line shadow-lg"
        />
      ) : (
        <Skeleton
          className={
            format === "story"
              ? "mx-auto aspect-[9/16] w-full max-w-xs rounded-2xl"
              : "mx-auto aspect-[4/5] w-full max-w-xs rounded-2xl"
          }
        />
      )}
      <p className="mt-3 text-center text-xs text-muted">
        On a phone, <b>Share on WhatsApp</b> sends the picture with your link. On a laptop it saves the picture and
        opens WhatsApp with the link — attach the saved image there.
      </p>
    </Sheet>
  );
}
