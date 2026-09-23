"use client";

import { api } from "./api";

/** The VAPID public key comes from the server rather than a NEXT_PUBLIC_ env
 *  var — it's not sensitive, and fetching it means only the backend needs
 *  configuring, not both sides kept in sync. */
async function getPushConfig(): Promise<{ enabled: boolean; public_key: string }> {
  return api.get("/api/push/config/");
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** False on browsers that simply can't do this — notably plain Safari on
 *  iPhone (works only once added to the Home Screen and opened from there,
 *  an Apple platform restriction, not something this code can route around). */
export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Whether this browser can even do push, whether the server's configured
 *  for it, and whether this device already has a live subscription — every
 *  branch a toggle needs, in one async call so a caller's effect only ever
 *  sets state from inside its resolution, never synchronously in the effect
 *  body itself. */
export async function pushStatus(): Promise<{
  supported: boolean;
  serverReady: boolean;
  subscribed: boolean;
}> {
  if (!pushSupported()) return { supported: false, serverReady: false, subscribed: false };
  const [config, registration] = await Promise.all([
    getPushConfig().catch(() => ({ enabled: false, public_key: "" })),
    navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined),
  ]);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  return { supported: true, serverReady: config.enabled, subscribed: Boolean(subscription) };
}

/** Asks for notification permission, subscribes this browser, and tells the
 *  backend about it. Throws a message fit to show directly if any step
 *  fails (permission denied, unsupported, server not configured). */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error("This browser doesn't support push notifications.");
  }
  const config = await getPushConfig();
  if (!config.enabled) {
    throw new Error("Push notifications aren't set up on the server yet.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission wasn't granted.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // TS's DOM lib wants ArrayBufferView<ArrayBuffer> specifically; a plain
      // Uint8Array is typed over ArrayBufferLike since TS 5.7, hence the cast.
      applicationServerKey: urlBase64ToUint8Array(config.public_key) as BufferSource,
    }));

  await api.post("/api/push/subscribe/", subscription.toJSON());
}

/** Unsubscribes this browser and tells the backend, so it stops trying to
 *  push here. Safe to call even if nothing's subscribed. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.post("/api/push/unsubscribe/", { endpoint }).catch(() => {
    // The device-side unsubscribe already succeeded; a stale row server-side
    // will just get cleaned up the next time a push to it bounces.
  });
}
