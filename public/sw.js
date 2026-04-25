const CACHE_NAME = "cartlink-shell-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/favicon-32.png",
  "/apple-touch-icon.png",
];

const offlineFallback = () =>
  new Response("", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain" },
  });

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match("/index.html")) || (await caches.match("/"));
          return cached || offlineFallback();
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) {
        // Refresh in the background, but always return the cached response.
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                const copy = response.clone();
                return caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(request, copy));
              }
            })
            .catch(() => undefined),
        );
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch (err) {
        return offlineFallback();
      }
    }),
  );
});
