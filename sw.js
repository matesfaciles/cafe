/* Dolce Timer – Service worker
 * Estrategia:
 *  - Navegación e index.html: SIEMPRE red primero (así se carga la última versión publicada).
 *    Si no hay internet, se sirve la última copia cacheada.
 *  - Archivos de la app (sync.js, iconos, manifest): red primero con actualización en segundo plano.
 *  - CDNs (Font Awesome, PeerJS, QR): stale-while-revalidate (rápido y disponible sin conexión).
 */
const VERSION = "dolce-timer-v4";
const APP_CACHE = VERSION + "-app";
const CDN_CACHE = VERSION + "-cdn";
const APP_SHELL = ["./", "./index.html", "./sync.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const CDN_HOSTS = ["unpkg.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "use.fontawesome.com", "kit.fontawesome.com"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => Promise.allSettled(APP_SHELL.map(p => cache.add(new Request(p, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE && k !== CDN_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isCdn = url => url.protocol === "https:" && CDN_HOSTS.includes(url.hostname);

function networkFirst(req, cacheName, fallbackUrl) {
  return fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(cacheName).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || (fallbackUrl ? caches.match(fallbackUrl) : Response.error())));
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(cache => cache.match(req).then(cached => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate" || (url.origin === self.location.origin && url.pathname.endsWith("/index.html"))) {
    event.respondWith(networkFirst(req, APP_CACHE, "./index.html"));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, APP_CACHE, null));
    return;
  }
  if (isCdn(url)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
  }
});

// La página puede pedir comprobar si hay una versión nueva publicada
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
