const CACHE_NAME = "workout-timer-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/audio.js",
  "./js/icons.js",
  "./js/sheet.js",
  "./js/share.js",
  "./js/theme.js",
  "./js/util.js",
  "./js/wakelock.js",
  "./js/confetti.js",
  "./js/tabs.js",
  "./js/exerciseLibrary.js",
  "./js/goals.js",
  "./js/views/home.js",
  "./js/views/editor.js",
  "./js/views/player.js",
  "./js/views/finish.js",
  "./js/views/diary.js",
  "./js/views/goals.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Network-first: always try to get the latest app shell when online, only
  // falling back to the cache when offline. The old cache-first-then-revalidate
  // strategy served a stale version on every load right after a deploy, with
  // the fresh version only appearing after a second reload.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
