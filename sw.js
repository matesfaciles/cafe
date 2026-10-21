const CACHE_NAME = "dolce-timer-shell-v3";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./sync.js", "./icons/icon-192.png", "./icons/icon-512.png"];
const CDN_CACHE = "dolce-timer-cdn-v1";
const CDN_HOSTS = ["unpkg.com", "cdn.jsdelivr.net"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key !== CDN_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return response;
    }).catch(() => caches.match("./index.html"))));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(CDN_CACHE).then(cache => cache.match(req).then(cached => {
      const net = fetch(req).then(response => {
        if (response && (response.ok || response.type === "opaque")) cache.put(req, response.clone());
        return response;
      }).catch(() => cached);
      return cached || net;
    })));
  }
});
