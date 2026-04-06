// sw.js

const SW_VERSION = "lostlink-sw-v1";

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener("install", () => {
    console.log(`[SW] Installed: ${SW_VERSION}`);
    self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
    console.log(`[SW] Activated: ${SW_VERSION}`);
    event.waitUntil(self.clients.claim());
});

// ─── Push ──────────────────────────────────────────────────────────────────
self.addEventListener("push", event => {
    console.log("[SW] Push received:", event);

    let payload = {
        title: "LostLink",
        body: "You have a new notification.",
        icon: "/cat.jpeg",   // swap with your actual icon

        tag: "lostlink-default",      // collapses duplicate notifs with same tag
        data: {
            url: "/",
        },
    };

    // Safely parse incoming push payload if it exists
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
            requireInteraction: false, // set to true if you want it to persist
        })
    );
});

// ─── Notification Click ────────────────────────────────────────────────────
self.addEventListener("notificationclick", event => {
    console.log("[SW] Notification clicked:", event.notification);

    event.notification.close();

    const targetUrl = event.notification.data?.url ?? "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
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

// ─── Notification Close (optional) ────────────────────────────────────────
self.addEventListener("notificationclose", event => {
    // Fires when user dismisses the notification without clicking
    console.log("[SW] Notification dismissed:", event.notification.tag);
});