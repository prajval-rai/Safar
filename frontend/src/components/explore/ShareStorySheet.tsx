"use client";

import { useEffect, useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Skeleton } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { postLink, renderStoryCard } from "@/lib/storyCard";
import type { TravelPost } from "@/lib/types";

/** Share a post as a story image (short excerpt + "Read the full story" + QR)
 *  with its public link, so whoever sees it can tap through to the full post. */
export function ShareStorySheet({
  post,
  open,
  onClose,
}: {
  post: TravelPost;
  open: boolean;
  onClose: () => void;
}) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useCelebration();
  const link = typeof window === "undefined" ? "" : postLink(post.id);
  const excerpt = post.caption.length > 120 ? `${post.caption.slice(0, 117).trimEnd()}…` : post.caption;
  const message = `“${excerpt}”\n\nRead the full story on Safar: ${link}`;
  const fileName = `safar-story-${post.id.slice(0, 8)}.png`;

  // Drawn each time the sheet opens; nothing is kept once it closes.
  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let active = true;
    renderStoryCard(post, postLink(post.id))
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) setCard({ blob, url });
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't create the story.");
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      setCard(null);
      setError(null);
    };
  }, [open, post]);

  async function share() {
    const file = card ? new File([card.blob], fileName, { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text: message, url: link });
        return;
      }
      await copy();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      await copy();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied — add it as a link sticker on your story.");
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
      title="Share this story"
      description="A story-sized card with the start of the post — tapping through opens the full story."
      footer={
        <div className="space-y-2">
          <Button fullWidth size="lg" icon="📤" onClick={share} disabled={!card}>
            Share story
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
          alt="Story card with the start of this post and a link to read the rest"
          className="mx-auto w-full max-w-[260px] rounded-2xl border border-line shadow-lg"
        />
      ) : (
        <Skeleton className="mx-auto aspect-[9/16] w-full max-w-[260px] rounded-2xl" />
      )}
      <p className="mt-3 text-center text-xs text-muted">
        On Instagram: post the image, then add a <b className="text-ink">link sticker</b> with the copied link so
        people can tap straight through.
        {post.soundtrack ? (
          <>
            {" "}
            For music, add <b className="text-ink">{post.soundtrack.title}</b> with Instagram&apos;s{" "}
            <b className="text-ink">Music</b> sticker.
          </>
        ) : null}
      </p>
    </Sheet>
  );
}
