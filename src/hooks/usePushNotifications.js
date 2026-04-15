import { useState } from "react";
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

    async function subscribe() {
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

            // 3. Register service worker
            const swUrl = import.meta.env.DEV ? "/src/sw.js" : "/sw.js";
            const swScope = import.meta.env.DEV ? "/src/" : "/";
            const reg = await navigator.serviceWorker.register(swUrl, {
                type: "module",
                scope: swScope,
            });

            // 4. Subscribe to push
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key)
            });

            // 5. Save to backend with userId
            await apiFetch("/save-subscription", {
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
        // TODO: unsub logic later
    }

    return { isSubscribed, isLoading, subscribe, unsubscribe, notificationDenied, setNotificationDenied };
}