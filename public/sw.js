// Minimal service worker: makes the hub installable to a phone home screen.
// Network-first with no aggressive caching, so officers never see a stale app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* pass through to the network */ });
