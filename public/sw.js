// Otherwise a no-op service worker — exists so Chrome's PWA install
// criteria (needs a registered SW with a fetch handler) are met, and
// so registration.showNotification() is available (Android Chrome
// throws on the page-script `new Notification()` constructor and only
// supports notifications through a service worker — see
// notification-prefs.ts). Deliberately does NOT cache anything: this
// app is live WhatsApp data (messages, broadcasts, unread counts),
// and a caching SW risks serving stale content — the exact bug class
// behind the india-shine.com year-long-cache incident. Every fetch
// passes straight through to the network, unmodified.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty — not calling respondWith() lets the browser
  // handle the request normally, straight to network.
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/inbox");
    }),
  );
});
