/* GYM Matthias — service worker
   It runs in the background and keeps a copy of the app's files in a cache,
   so the app opens instantly and works without internet.
   IMPORTANT: change CACHE_VERSION every time you push a change,
   otherwise phones keep the old cached files. */
const CACHE_VERSION = "v1";
const CACHE_NAME = `gym-matthias-${CACHE_VERSION}`;

const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "fonts/figtree-latin-400-normal.woff2",
  "fonts/figtree-latin-500-normal.woff2",
  "fonts/figtree-latin-600-normal.woff2",
  "fonts/saira-condensed-latin-700-normal.woff2",
  "fonts/saira-condensed-latin-800-normal.woff2",
];

/* 1. Install: download every file of the app into the cache */
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
});

/* 2. Activate: delete the caches of older versions */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("gym-matthias-") && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The page sends "skipWaiting" when you tap "Update" */
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

/* 3. Fetch: answer from the cache first ("cache first"), use the network only if the file isn't cached */
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(req).catch(() => req.mode === "navigate" ? caches.match("index.html") : Response.error());
    })
  );
});
