// No-op service worker — exists only so Chrome's PWA install
// criteria (needs a registered SW with a fetch handler) are met.
// Deliberately does NOT cache anything: this app is live WhatsApp
// data (messages, broadcasts, unread counts), and a caching SW risks
// serving stale content — the exact bug class behind the
// india-shine.com year-long-cache incident. Every fetch passes
// straight through to the network, unmodified.
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
