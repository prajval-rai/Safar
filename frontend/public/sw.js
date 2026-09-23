/**
 * Safar's push service worker.
 *
 * This runs in the browser's background, independent of any open tab — it's
 * what lets a notification show up even with the site fully closed, as long
 * as the browser itself is still running (or, on Android, even after it's
 * been swiped away, since Chrome keeps this alive separately). A plain page
 * script can never do this on its own; that's the whole reason this file
 * has to exist as a service worker rather than just code in lib/push.ts.
 *
 * Deliberately does nothing else — no offline caching, no asset
 * interception. Adding those later means being careful not to break this.
 */

self.addEventListener("push", (event) => {
  let payload = { title: "Safar", body: "You have a new notification.", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Not JSON for some reason — the defaults above still show something
    // rather than nothing.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: payload.url || "/" },
      // Two pushes for the same trip/thing replace each other instead of
      // piling up, once we start passing a real tag.
      tag: payload.tag || undefined,
    }),
  );
});

/** Tapping the notification focuses an already-open Safar tab if there is
 *  one, instead of always opening a new one. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url, self.location.origin).href;
      for (const client of clientsList) {
        if (client.url === target && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
