// components/NotificationTester.jsx
import { useState } from "react";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function NotificationTester() {
  const [title, setTitle] = useState("LostLink");
  const [body, setBody] = useState("Test notification 🔔");
  const [status, setStatus] = useState(null);

  async function handleTestNotification() {
    setStatus(null);

    // 1. Check support
    if (!("Notification" in window)) {
      setStatus("❌ Notifications not supported in this browser.");
      return;
    }

    // 2. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("❌ Notification permission denied.");
      return;
    }

    // 3. Get the active service worker
    const registration = await navigator.serviceWorker.ready;

    // 4. Show notification directly via the SW (no backend needed)
    await registration.showNotification(title, {
      body,
      icon: "/lostlink-icon.png",
      tag: "lostlink-test",
      data: { url: "/" },
    });

    setStatus("✅ Notification sent!");
  }

  return (
    <div
      style={{
        padding: "1rem",
        border: "1px solid #ccc",
        borderRadius: "8px",
        maxWidth: "360px",
      }}
    >
      <h3 style={{ marginBottom: "0.75rem" }}>🔔 Notification Tester</h3>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <input
          type="text"
          placeholder="Notification title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            padding: "0.4rem 0.6rem",
            borderRadius: "4px",
            border: "1px solid #aaa",
          }}
        />
        <input
          type="text"
          placeholder="Notification body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{
            padding: "0.4rem 0.6rem",
            borderRadius: "4px",
            border: "1px solid #aaa",
          }}
        />
      </div>

      <button
        onClick={handleTestNotification}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          width: "100%",
        }}
      >
        Send Test Notification
      </button>

      {status && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>{status}</p>
      )}
    </div>
  );
}
