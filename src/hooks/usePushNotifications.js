import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
function uint8ArrayEquals(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function subscriptionServerKeyBytes(subscription) {
    const key = subscription?.options?.applicationServerKey;
    return key ? new Uint8Array(key) : null;
}

export function usePushNotifications(userId) {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [notificationDenied, setNotificationDenied] = useState(false);

    // On mount, check whether the browser already holds an active push subscription
    // so the toggle reflects reality after a page refresh instead of always starting OFF.
    // Must use getRegistration(scope) — not serviceWorker.ready — because ready resolves
    // to the SW controlling the current page, which may differ from the scope used when
    // the push subscription was created (e.g. /src/ in dev vs the current /settings page).
    useEffect(() => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        const expectedVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        const expectedKeyBytes = expectedVapidKey
            ? urlBase64ToUint8Array(expectedVapidKey)
            : null;

        const swScope = import.meta.env.DEV ? "/src/" : "/";
        navigator.serviceWorker.getRegistration(swScope).then((reg) => {
            if (!reg) return null;
            return reg.pushManager.getSubscription();
        }).then(async (sub) => {
            if (sub === undefined) return;
            if (!sub) {
                setIsSubscribed(false);
                return;
            }

            if (expectedKeyBytes) {
                const currentKeyBytes = subscriptionServerKeyBytes(sub);
                if (currentKeyBytes && !uint8ArrayEquals(currentKeyBytes, expectedKeyBytes)) {
                    console.warn("[PUSH] Existing subscription was created with a different VAPID key; resetting it.");
                    try {
                        await sub.unsubscribe();
                    } catch (err) {
                        console.warn("[PUSH] Failed to unsubscribe stale browser subscription:", err);
                    }
                    setIsSubscribed(false);
                    return;
                }
            }

            setIsSubscribed(true);
        }).catch(() => { });
    }, []);

    // Reflect permission denial state from browser (e.g. user blocked via browser UI)
    useEffect(() => {
        if (!("Notification" in window)) return;
        if (Notification.permission === "denied") setNotificationDenied(true);
    }, []);

    async function subscribe() {
        if (!userId) {
            console.warn("Cannot subscribe: userId is null");
            return;
        }

        setIsLoading(true);
        try {
            // 1. Get VAPID key
            const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!key) {
                console.warn("Cannot subscribe: VITE_VAPID_PUBLIC_KEY is missing");
                return;
            }
            const applicationServerKey = urlBase64ToUint8Array(key);

            // 2. Request permission
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                console.warn("Notification permission denied");
                setNotificationDenied(true);
                setIsLoading(false);
                return;
            }

            // 3. Reuse existing SW registration — avoids triggering the SW update
            //    cycle on every subscribe call, which was breaking subsequent pushes.
            const swUrl = import.meta.env.DEV ? "/src/sw.js" : "/sw.js";
            const swScope = import.meta.env.DEV ? "/src/" : "/";
            let reg = await navigator.serviceWorker.getRegistration(swScope);
            if (!reg) {
                reg = await navigator.serviceWorker.register(swUrl, {
                    type: "module",
                    scope: swScope,
                });
            }
            // 4. Reuse existing sub only when it matches the active VAPID key pair.
            //    If it doesn't, cleanly rotate it so sends don't fail with 403.
            let subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                const existingKey = subscriptionServerKeyBytes(subscription);
                if (existingKey && !uint8ArrayEquals(existingKey, applicationServerKey)) {
                    const staleEndpoint = subscription.endpoint;
                    try {
                        await apiFetch("/push/remove-subscription", {
                            method: "DELETE",
                            body: JSON.stringify({ userId, endpoint: staleEndpoint }),
                            headers: { "Content-Type": "application/json" },
                        });
                    } catch (err) {
                        console.warn("[PUSH] Failed to remove stale subscription from backend:", err);
                    }
                    await subscription.unsubscribe();
                    subscription = null;
                }
            }

            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey
                });
            }

            // 5. Save to backend with userId
            await apiFetch("/push/save-subscription", {
                method: "POST",
                body: JSON.stringify({ subscription, userId }),
                headers: { "Content-Type": "application/json" }
            });

            console.log("[PUSH] Subscription saved to backend for user", userId);
            setIsSubscribed(true);
        } catch (err) {
            console.error("Push subscription failed:", err);
        } finally {
            setIsLoading(false);
        }
    }

    async function unsubscribe() {
        setIsLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (!subscription) return;

            await subscription.unsubscribe();

            await apiFetch("/push/remove-subscription", {
                method: "DELETE",
                body: JSON.stringify({ userId, endpoint: subscription.endpoint }),
                headers: { "Content-Type": "application/json" },
            });

            console.log("[PUSH] Subscription removed from backend for user", userId);
            setIsSubscribed(false);
        } catch (err) {
            console.error("Push unsubscribe failed:", err);
        } finally {
            setIsLoading(false);
        }
    }

    return { isSubscribed, isLoading, subscribe, unsubscribe, notificationDenied, setNotificationDenied };
}
