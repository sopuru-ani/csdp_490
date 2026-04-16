import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
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

        const swScope = import.meta.env.DEV ? "/src/" : "/";
        navigator.serviceWorker.getRegistration(swScope).then((reg) => {
            if (!reg) return;
            return reg.pushManager.getSubscription();
        }).then((sub) => {
            if (sub !== undefined) setIsSubscribed(!!sub);
        }).catch(() => {});
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

            // 4. Subscribe to push (idempotent — returns existing sub if already subscribed)
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key)
            });

            // 5. Save to backend with userId
            await apiFetch("/push/save-subscription", {
                method: "POST",
                body: JSON.stringify({ subscription, userId }),
                headers: { "Content-Type": "application/json" }
            });

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

            setIsSubscribed(false);
        } catch (err) {
            console.error("Push unsubscribe failed:", err);
        } finally {
            setIsLoading(false);
        }
    }

    return { isSubscribed, isLoading, subscribe, unsubscribe, notificationDenied, setNotificationDenied };
}
