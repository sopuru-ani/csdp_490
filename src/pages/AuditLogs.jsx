import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { ClipboardListIcon, X, ArrowLeftIcon } from "lucide-react";

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
  const [selected, setSelected] = useState(null);

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
    `min-w-fit px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
      filter === f
        ? "bg-secondary text-white font-semibold"
        : "text-text-muted hover:bg-primary-muted"
    }`;

  return (
    <>
      <div className="w-dvw p-4 flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <div className="w-full">
            <div className="w-full flex flex-row justify-between items-center">
              <div className="flex flex-row gap-2 items-center">
                <button
                  className="cursor-pointer rounded-full hover:bg-primary-muted p-2"
                  onClick={() => navigate(-1)}
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <p className="font-bold text-2xl">Audit Logs</p>
              </div>
              {!loading && (
                <span className="text-xs text-text-muted">
                  {filtered.length} record{filtered.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="text-sm text-text-muted">
              Full history of key actions across the system
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex flex-row items-center gap-1 overflow-x-scroll [box-shadow:inset_-8px_0_8px_-8px_rgba(0,0,0,0.3)]">
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
            <ClipboardListIcon className="w-8 h-8" />
            <p className="font-semibold">No logs yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((log) => (
              <LogRow key={log.id} log={log} onClick={() => setSelected(log)} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <AuditLogModal log={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function LogRow({ log, onClick }) {
  const meta = ACTION_LABELS[log.action] ?? {
    label: log.action,
    color: "bg-primary-muted text-text-muted",
  };
  const actor = log.actor;

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-4 w-full text-left hover:border-secondary hover:shadow-sm transition-all duration-200 cursor-pointer overflow-x-hidden"
    >
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${meta.color}`}
      >
        {meta.label}
      </span>

      <div className="flex items-center gap-2 min-w-0 flex-1 z-1">
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

      {log.target_id && (
        <p className="text-xs text-text-muted font-mono hidden md:block shrink-0">
          {log.target_type}: {log.target_id.slice(0, 8)}…
        </p>
      )}

      {log.details && Object.keys(log.details).length > 0 && (
        <p className="text-xs text-text-muted hidden lg:block shrink-0 max-w-48 truncate">
          {Object.entries(log.details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      )}

      <p className="text-xs text-text-muted whitespace-nowrap shrink-0 ml-auto">
        {new Date(log.created_at).toLocaleString()}
      </p>
    </button>
  );
}

function AuditLogModal({ log, onClose }) {
  const meta = ACTION_LABELS[log.action] ?? {
    label: log.action,
    color: "bg-primary-muted text-text-muted",
  };
  const actor = log.actor;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col gap-5 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${meta.color}`}
          >
            {meta.label}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-primary-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actor */}
        <Section title="Actor">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {actor?.first_name?.[0]}
              {actor?.last_name?.[0]}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {actor ? `${actor.first_name} ${actor.last_name}` : "Unknown"}
              </p>
              <p className="text-xs text-text-muted">{actor?.email ?? "—"}</p>
            </div>
          </div>
        </Section>

        {/* Target */}
        {(log.target_type || log.target_id) && (
          <Section title="Target">
            <Row label="Type" value={log.target_type ?? "—"} />
            <Row label="ID" value={log.target_id ?? "—"} mono />
          </Section>
        )}

        {/* Details */}
        {log.details && Object.keys(log.details).length > 0 && (
          <Section title="Details">
            <pre className="text-xs bg-primary-soft rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all text-text-muted">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </Section>
        )}

        {/* Timestamp */}
        <Section title="Timestamp">
          <p className="text-sm text-text-muted">
            {new Date(log.created_at).toLocaleString()}
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-text-muted uppercase tracking-wide">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      <span
        className={`text-xs text-right break-all ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export default AuditLogs;
