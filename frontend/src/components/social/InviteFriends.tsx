"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Chip } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { referralLink } from "@/lib/referral";
import { formatNumber } from "@/lib/utils";

/** XP for each friend who joins with your link (rewards.services.REFERRAL_XP). */
export const REFERRAL_XP = 10;

const MESSAGE = "Plan trips with me on Safar — join with my link:";

/** Your referral link with Copy, WhatsApp and Share — the heart of every
 *  "invite friends" spot (account menu, Home, Rewards). */
function InviteFriendsBody() {
  const { user } = useAuth();
  const { toast } = useCelebration();
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

  async function share() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: "Join me on Safar", text: MESSAGE, url: link });
    } catch (err) {
      // Closing the share sheet isn't an error worth showing.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast("Couldn't share that — copy the link instead.", "error");
      }
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${link}`)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          When a friend joins Safar for the first time with your link, you get <b className="text-brand">+{REFERRAL_XP} XP</b>.
        </p>
        <Chip tone={user.referral_count ? "success" : "neutral"}>
          {user.referral_count} joined · +{formatNumber(user.referral_count * REFERRAL_XP)} XP
        </Chip>
      </div>
      <input
        readOnly
        value={link}
        aria-label="Your invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-raised px-3 text-sm text-ink"
      />
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={copy}>
          Copy
        </Button>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="tap flex min-h-[44px] items-center justify-center rounded-xl bg-[#25D366] px-3 text-sm font-bold text-white hover:opacity-90"
        >
          WhatsApp
        </a>
        <Button icon="📤" onClick={share}>
          Share
        </Button>
      </div>
    </div>
  );
}

/** A card version, for pages (Home, Rewards). */
export function InviteFriendsCard() {
  const { user } = useAuth();
  if (!user?.referral_code) return null;
  return (
    <section className="card space-y-3 p-4" aria-labelledby="invite-friends-heading">
      <h2 id="invite-friends-heading" className="text-lg font-extrabold text-ink">
        <span aria-hidden="true">🤝 </span>Invite friends to Safar
      </h2>
      <InviteFriendsBody />
    </section>
  );
}

/** A sheet version, opened from the account menu. */
export function InviteFriendsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite friends to Safar"
      description={`Share your link — +${REFERRAL_XP} XP for every friend who joins.`}
    >
      <InviteFriendsBody />
    </Sheet>
  );
}
