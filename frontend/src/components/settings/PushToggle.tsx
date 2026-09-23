"use client";

import { useEffect, useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Button } from "@/components/ui/Button";
import { disablePush, enablePush, pushStatus } from "@/lib/push";

type Status = "checking" | "unsupported" | "unavailable" | "off" | "on";

/**
 * Real, lock-screen-capable push — separate from the in-app bell, which
 * works regardless of any of this. Quietly renders nothing if the server
 * hasn't got VAPID keys configured yet, same as the Google sign-in button
 * does when its Client ID isn't set — no broken toggle to look at.
 */
export function PushToggle() {
  const { toast } = useCelebration();
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    pushStatus().then(({ supported, serverReady, subscribed }) => {
      if (!active) return;
      if (!supported) setStatus("unsupported");
      else if (!serverReady) setStatus("unavailable");
      else setStatus(subscribed ? "on" : "off");
    });
    return () => {
      active = false;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (status === "on") {
        await disablePush();
        setStatus("off");
        toast("Push notifications turned off on this device.");
      } else {
        await enablePush();
        setStatus("on");
        toast("Push notifications are on for this device.");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't change that.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "unavailable") return null;

  if (status === "unsupported") {
    return (
      <p className="text-sm text-muted">
        This browser can&apos;t receive push notifications.{" "}
        <span className="font-semibold text-ink">On iPhone:</span> add Safar to your Home Screen
        first (Share → Add to Home Screen), then open it from there and try again.
      </p>
    );
  }

  const on = status === "on";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-raised p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          {on ? "Push notifications are on for this device" : "Push notifications are off"}
        </p>
        <p className="text-xs text-muted">
          {on
            ? "You'll get real alerts here — even with Safar closed."
            : "Get real alerts on this device, even with Safar closed, not just the bell icon."}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={toggle} disabled={busy}>
        {on ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
