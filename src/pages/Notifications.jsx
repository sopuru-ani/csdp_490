import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import {
  Bell,
  MessageCircle,
  Handshake,
  ShieldCheck,
  PackageCheck,
  CheckCheck,
  Inbox,
} from "lucide-react";

// Map notification tag prefixes → icon + colour
const TAG_META = {
  "lostlink-msg":              { icon: MessageCircle, color: "text-blue-500",   bg: "bg-blue-50"   },
  "lostlink-match-approved":   { icon: Handshake,     color: "text-green-500",  bg: "bg-green-50"  },
  "lostlink-match-rejected":   { icon: Handshake,     color: "text-red-500",    bg: "bg-red-50"    },
  "lostlink-match-request":    { icon: Handshake,     color: "text-yellow-500", bg: "bg-yellow-50" },
  "lostlink-ai-matches":       { icon: PackageCheck,  color: "text-purple-500", bg: "bg-purple-50" },
  "lostlink-item-closed":      { icon: PackageCheck,  color: "text-gray-500",   bg: "bg-gray-100"  },
  "lostlink-password-changed": { icon: ShieldCheck,   color: "text-orange-500", bg: "bg-orange-50" },
  "lostlink-admin":            { icon: ShieldCheck,   color: "text-red-500",    bg: "bg-red-50"    },
};

function getTagMeta(tag = "") {
  const match = Object.keys(TAG_META).find((prefix) => tag.startsWith(prefix));
  return match ? TAG_META[match] : { icon: Bell, color: "text-secondary", bg: "bg-primary-soft" };
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // "all" | "unread"

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch("/notifications");
        if (res.status === 401) { navigate("/login"); return; }
        const data = await res.json();
        setNotifications(data);
      } catch {
        navigate("/login");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await apiFetch("/notifications/read-all", { method: "POST" });
  }

  async function markRead(id) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await apiFetch(`/notifications/${id}/read`, { method: "POST" });
  }

  function handleClick(notification) {
    markRead(notification.id);
    if (notification.url) navigate(notification.url);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visible = filter === "unread"
    ? notifications.filter((n) => !n.read)
    : notifications;

  if (loading) {
    return (
      <div className="w-full min-h-dvh flex items-center justify-center bg-primary-soft">
        <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 flex-1 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-bold text-3xl">Notifications</p>
          <p className="text-sm text-text-muted">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-secondary text-secondary hover:bg-secondary-soft text-sm cursor-pointer transition-all duration-200 self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["all", "unread"].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 capitalize ${
              filter === tab
                ? "bg-secondary text-white shadow-sm"
                : "bg-white border border-gray-200 text-text-muted hover:border-secondary hover:text-secondary"
            }`}
          >
            {tab}
            {tab === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 bg-white text-secondary rounded-full px-1.5 py-0.5 text-xs font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {visible.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          visible.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onClick={() => handleClick(notification)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NotificationCard({ notification, onClick }) {
  const { icon: Icon, color, bg } = getTagMeta(notification.tag);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 hover:shadow-md cursor-pointer ${
        notification.read
          ? "bg-white border-gray-200"
          : "bg-secondary-soft border-secondary/20"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold truncate ${!notification.read ? "text-secondary" : ""}`}>
            {notification.title}
          </p>
          <span className="text-xs text-text-muted shrink-0">
            {timeAgo(notification.created_at)}
          </span>
        </div>
        <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{notification.body}</p>
      </div>
      {!notification.read && (
        <span className="w-2 h-2 rounded-full bg-secondary shrink-0 mt-1.5" />
      )}
    </button>
  );
}

function EmptyState({ filter }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-12 flex flex-col items-center gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary-soft flex items-center justify-center">
        <Inbox className="w-8 h-8 text-secondary" />
      </div>
      <div>
        <p className="font-semibold text-lg">
          {filter === "unread" ? "No unread notifications" : "No notifications yet"}
        </p>
        <p className="text-sm text-text-muted mt-1">
          {filter === "unread"
            ? "Switch to \"All\" to see your notification history."
            : "When you get match updates, messages, or alerts they'll show up here."}
        </p>
      </div>
    </div>
  );
}

export default Notifications;
