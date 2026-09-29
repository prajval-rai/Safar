"use client";

import { Copy, ImageIcon, MessageCircle, UserPlus } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { ReferralCardSheet } from "@/components/social/ReferralCardSheet";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { REFERRAL_XP, referralLink } from "@/lib/referral";
import { cn, formatNumber } from "@/lib/utils";

export { REFERRAL_XP };

const MESSAGE = "Plan trips with me on Safar ✈️ Join with my link:";

/** "Bring your travel buddy to Safar · +10 XP" — the invite banner. It carries
 *  the headline itself, so nothing is repeated beside it. */
function InviteBanner({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/invite-banner.webp"
      alt={`Bring your travel buddy to Safar. Your friend joins, you both explore — you earn ${REFERRAL_XP} XP.`}
      width={2048}
      height={768}
      className={cn("aspect-[8/3] w-full object-cover", className)}
    />
  );
}

/** "3 joined · +30 XP", or a nudge before the first one. */
function joinedLine(count: number): string {
  return count
    ? `${count} ${count === 1 ? "friend" : "friends"} joined · +${formatNumber(count * REFERRAL_XP)} XP earned`
    : `+${REFERRAL_XP} XP for every friend who joins`;
}

/** On a page (Home, Rewards): the banner and one button — the details live in the sheet. */
export function InviteFriendsCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user?.referral_code) return null;

  return (
    <section className="card overflow-hidden" aria-labelledby="invite-friends-heading">
      <h2 id="invite-friends-heading" className="sr-only-text">
        Invite friends, earn +{REFERRAL_XP} XP each
      </h2>
      <button type="button" onClick={() => setOpen(true)} className="block w-full" aria-label="Invite friends">
        <InviteBanner />
      </button>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 text-sm text-muted">{joinedLine(user.referral_count)}</p>
        <Button size="sm" onClick={() => setOpen(true)} icon={<UserPlus size={16} aria-hidden="true" />}>
          Invite friends
        </Button>
      </div>
      <InviteFriendsSheet open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

/** Everything for sending the invite: the link, WhatsApp, and the picture card. */
export function InviteFriendsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useCelebration();
  const [cardOpen, setCardOpen] = useState(false);
  if (!user?.referral_code) return null;
  const link = referralLink(user.referral_code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied — send it to a friend.");
    } catch {
      toast("Couldn't copy — select the link and copy it.", "error");
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Invite friends" description={joinedLine(user.referral_count)}>
        <div className="space-y-4">
          <InviteBanner className="rounded-2xl" />

          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              aria-label="Your invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-line bg-raised px-3 text-sm text-ink"
            />
            <Button variant="secondary" onClick={copy} icon={<Copy size={16} aria-hidden="true" />}>
              Copy
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${link}`)}`}
              target="_blank"
              rel="noreferrer"
              className="tap flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 font-bold text-white hover:opacity-90"
            >
              <MessageCircle size={18} aria-hidden="true" /> WhatsApp
            </a>
            <Button size="lg" variant="secondary" onClick={() => setCardOpen(true)} icon={<ImageIcon size={18} aria-hidden="true" />}>
              Share card
            </Button>
          </div>
        </div>
      </Sheet>
      <ReferralCardSheet user={user} open={cardOpen} onClose={() => setCardOpen(false)} />
    </>
  );
}
