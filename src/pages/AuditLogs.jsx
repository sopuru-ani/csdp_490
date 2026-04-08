import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/sidebar";
import { apiFetch } from "@/lib/api";

const ACTION_LABELS = {
  match_approved: {
    label: "Match approved",
    color: "bg-success-soft text-success",
  },
  match_rejected: {
    label: "Match rejected",
    color: "bg-danger-soft text-danger",
  },
  match_requested: {
    label: "Match requested",
    color: "bg-secondary-soft text-secondary",
  },
  item_deleted: { label: "Item deleted", color: "bg-danger-soft text-danger" },
  message_sent: {
    label: "Message sent",
    color: "bg-primary-muted text-text-muted",
  },
};

function AuditLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function init() {
      try {
        const authRes = await apiFetch("/auth/userchecker", {
          credentials: "include",
        });
        if (!authRes.ok) {
          navigate("/login");
          return;
        }
        const userData = await authRes.json();
        if (!userData.is_admin) {
          navigate("/dashboard");
          return;
        }
      } catch {
        navigate("/login");
        return;
      }

      try {
        const res = await apiFetch("/admin/audit-logs", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const actions = ["all", ...Object.keys(ACTION_LABELS)];

  const filtered =
    filter === "all" ? logs : logs.filter((l) => l.action === filter);

  const filterBtnClass = (f) =>
    `px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
      filter === f
        ? "bg-secondary text-white font-semibold"
        : "text-text-muted hover:bg-primary-muted"
    }`;

  return (
    <>
      {/* <Sidebar /> */}
      <div className="p-4 flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-2xl">Audit Logs</p>
            <p className="text-sm text-text-muted">
              Full history of key actions across the system
            </p>
          </div>
          {!loading && (
            <span className="text-xs text-text-muted">
              {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {actions.map((a) => (
            <button
              key={a}
              className={filterBtnClass(a)}
              onClick={() => setFilter(a)}
            >
              {a === "all" ? "All" : (ACTION_LABELS[a]?.label ?? a)}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-3xl">📋</p>
            <p className="font-semibold">No logs yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function LogRow({ log }) {
  const meta = ACTION_LABELS[log.action] ?? {
    label: log.action,
    color: "bg-primary-muted text-text-muted",
  };
  const actor = log.actor;

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-4">
      {/* Action badge */}
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${meta.color}`}
      >
        {meta.label}
      </span>

      {/* Actor */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-white text-xs font-semibold shrink-0">
          {actor?.first_name?.[0]}
          {actor?.last_name?.[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {actor ? `${actor.first_name} ${actor.last_name}` : "Unknown"}
          </p>
          <p className="text-xs text-text-muted truncate">{actor?.email}</p>
        </div>
      </div>

      {/* Target ID */}
      {log.target_id && (
        <p className="text-xs text-text-muted font-mono hidden md:block shrink-0">
          {log.target_type}: {log.target_id.slice(0, 8)}…
        </p>
      )}

      {/* Details */}
      {log.details && Object.keys(log.details).length > 0 && (
        <p className="text-xs text-text-muted hidden lg:block shrink-0 max-w-48 truncate">
          {Object.entries(log.details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      )}

      {/* Timestamp */}
      <p className="text-xs text-text-muted whitespace-nowrap shrink-0 ml-auto">
        {new Date(log.created_at).toLocaleString()}
      </p>
    </div>
  );
}

export default AuditLogs;
