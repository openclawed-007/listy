const CACHE_NAME = "cartlink-shell-v14";
const APP_SHELL = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/favicon-32.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/notification-icon.png",
  "/notification-badge.png",
];

const REMINDER_STORE = "cartlink-reminders-v1";
const SW_TAG_PREFIX = "cartlink-reminder-";
const NOTIFICATION_ICON = "/notification-icon.png";
const NOTIFICATION_BADGE = "/notification-badge.png";

const offlineFallback = () =>
  new Response(
    "<!doctype html><title>CartLink</title><p style=\"font-family:system-ui;text-align:center;padding:3rem 1.5rem\">You're offline. Reconnect and try again.</p>",
    {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((url) => cache.add(url).catch(() => undefined)),
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
    // Catch up any due shopping reminders when a page loads.
    event.waitUntil(flushDueFromStore());
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          }
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
    (async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)),
          );
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        return cached || offlineFallback();
      }
    })(),
  );
});

// ---------- Shopping reminders ----------

function openReminderDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REMINDER_STORE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeReminderMeta(payload) {
  try {
    const db = await openReminderDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(payload, "schedule");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB may be unavailable; client still handles due checks.
  }
}

async function readReminderMeta() {
  try {
    const db = await openReminderDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const req = tx.objectStore("meta").get("schedule");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cartlink:reminders-updated") return;

  event.waitUntil(
    writeReminderMeta({
      settings: data.settings || null,
      schedule: Array.isArray(data.schedule) ? data.schedule : [],
      updatedAt: Date.now(),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Older clients may not support navigate.
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

async function flushDueFromStore() {
  const meta = await readReminderMeta();
  if (!meta || !Array.isArray(meta.schedule) || meta.schedule.length === 0) {
    return;
  }

  const now = Date.now();
  const graceMs = 2 * 60 * 60 * 1000;
  const due = meta.schedule.filter(
    (item) =>
      item &&
      typeof item.at === "number" &&
      item.at <= now &&
      now - item.at <= graceMs &&
      typeof item.key === "string",
  );

  if (due.length === 0) return;

  const fired = new Set(
    Array.isArray(meta.firedKeys) ? meta.firedKeys.filter(Boolean) : [],
  );

  for (const item of due) {
    if (fired.has(item.key)) continue;
    fired.add(item.key);
    try {
      await self.registration.showNotification(item.title || "CartLink", {
        tag: `${SW_TAG_PREFIX}${item.key}`,
        body: item.body || "Time to check your shopping list.",
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        data: { url: "/", reminderKey: item.key },
      });
    } catch {
      // Permission may have been revoked.
    }
  }

  await writeReminderMeta({
    ...meta,
    firedKeys: Array.from(fired).slice(-60),
    updatedAt: Date.now(),
  });
}
