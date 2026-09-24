"use client";

import { useEffect, useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Skeleton } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { inviteLink, renderInviteCard } from "@/lib/inviteCard";
import type { TripDetail } from "@/lib/types";

/** A shareable invitation card for a trip, drawn in the trip's own theme, with
 *  the invite code and a QR code / link that joins straight into the trip. */
export function InviteCardSheet({
  trip,
  open,
  onClose,
}: {
  trip: TripDetail;
  open: boolean;
  onClose: () => void;
}) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useCelebration();
  const link = typeof window === "undefined" ? "" : inviteLink(trip.join_code);
  const message = `Join my trip "${trip.title}" on Safar ✈️\nInvite code: ${trip.join_code}\n${link}`;
  const fileName = `${trip.title.replace(/[^\w-]+/g, "-").toLowerCase()}-invite.png`;

  // Draw the card each time the sheet opens, so it reflects the latest plan and crew.
  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let active = true;
    renderInviteCard(trip, inviteLink(trip.join_code))
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) setCard({ blob, url });
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't create the invitation.");
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      setCard(null);
      setError(null);
    };
  }, [open, trip]);

  async function share() {
    const file = card ? new File([card.blob], fileName, { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: trip.title, text: message });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: trip.title, text: message, url: link });
        return;
      }
      await copy();
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      await copy();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Invite link copied — paste it in your group.");
    } catch {
      toast(`Share this link: ${link}`);
    }
  }

  function download() {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = fileName;
    a.click();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite to this trip"
      description="Share the card — anyone who opens the link or scans the code joins straight in."
      footer={
        <div className="space-y-2">
          <Button fullWidth size="lg" icon="📤" onClick={share} disabled={!card}>
            Share invitation
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon="⬇️" onClick={download} disabled={!card}>
              Save image
            </Button>
            <Button variant="secondary" icon="🔗" onClick={copy}>
              Copy link
            </Button>
          </div>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : card ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.url}
          alt={`Invitation card for ${trip.title} with invite code ${trip.join_code}`}
          className="mx-auto w-full max-w-sm rounded-2xl border border-line shadow-lg"
        />
      ) : (
        <Skeleton className="mx-auto aspect-[4/5] w-full max-w-sm rounded-2xl" />
      )}
      <p className="mt-3 text-center text-sm text-muted">
        Invite code <b className="tracking-[0.2em] text-brand">{trip.join_code}</b>
      </p>
    </Sheet>
  );
}
