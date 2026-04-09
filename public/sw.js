// public/sw.js

const SW_VERSION = "lostlink-sw-v2";
const CACHE_NAME = SW_VERSION;
const OFFLINE_URL = "/offline.html";

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
    console.log(`[SW] Installed: ${SW_VERSION}`);

    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
        })()
    );

    self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
    console.log(`[SW] Activated: ${SW_VERSION}`);

    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );

            if ("navigationPreload" in self.registration) {
                await self.registration.navigationPreload.enable();
            }

            await self.clients.claim();
        })()
    );
});

// ─── Fetch / Offline Fallback ──────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
    if (event.request.mode !== "navigate") return;

    event.respondWith(
        (async () => {
            try {
                const preloadResponse = await event.preloadResponse;
                if (preloadResponse) return preloadResponse;

                return await fetch(event.request);
            } catch (error) {
                console.warn("[SW] Navigation failed, serving offline page.", error);

                const cache = await caches.open(CACHE_NAME);
                const offlineResponse = await cache.match(OFFLINE_URL);

                if (offlineResponse) return offlineResponse;

                return new Response("Offline", {
                    status: 503,
                    statusText: "Offline",
                    headers: { "Content-Type": "text/plain" },
                });
            }
        })()
    );
});

// ─── Push ──────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
    console.log("[SW] Push received:", event);

    let payload = {
        title: "LostLink",
        body: "You have a new notification.",
        icon: "/cat.jpeg",
        tag: "lostlink-default",
        data: {
            url: "/",
        },
    };

    if (event.data) {
        try {
            const incoming = event.data.json();
            payload = { ...payload, ...incoming };
        } catch (err) {
            console.warn("[SW] Failed to parse push payload:", err);
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: payload.icon,
            tag: payload.tag,
            data: payload.data,
            requireInteraction: false,
        })
    );
});

// ─── Notification Click ────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
    console.log("[SW] Notification clicked:", event.notification);

    event.notification.close();

    const targetUrl = event.notification.data?.url ?? "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(targetUrl) && "focus" in client) {
                    return client.focus();
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// ─── Notification Close ────────────────────────────────────────────────────
self.addEventListener("notificationclose", (event) => {
    console.log("[SW] Notification dismissed:", event.notification.tag);
});