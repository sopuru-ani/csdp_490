import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/sidebar";
import { apiFetch } from "@/lib/api";

const REASON_LABELS = {
  spam: "Spam",
  harassment: "Harassment",
  false_claim: "False claim / fraud",
  inappropriate: "Inappropriate content",
  other: "Other",
};

function AdminReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const authRes = await apiFetch("/auth/userchecker");
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
      await fetchReports();
    }
    init();
  }, []);

  async function fetchReports() {
    try {
      const res = await apiFetch("/admin/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleDecision = async (reportId, decision) => {
    try {
      const res = await apiFetch(`/admin/reports/${reportId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-dvw min-h-dvh flex flex-row bg-primary-soft">
      <Sidebar />
      <div className="p-4 flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-2xl">Abuse Reports</p>
            <p className="text-sm text-text-muted">
              Review flagged messages, users, and items
            </p>
          </div>
          {!loading && (
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${
                reports.length > 0
                  ? "bg-danger-soft text-danger"
                  : "bg-success-soft text-success"
              }`}
            >
              {reports.length} pending
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-4xl">🛡️</p>
            <p className="font-semibold">No pending reports</p>
            <p className="text-sm text-text-muted">The platform is clean.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onReview={(decision) => handleDecision(report.id, decision)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({ report, onReview }) {
  const [deciding, setDeciding] = useState(null);

  const handle = async (decision) => {
    setDeciding(decision);
    await onReview(decision);
    setDeciding(null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-danger-soft text-danger capitalize">
              {report.target_type}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-muted text-text-muted">
              {REASON_LABELS[report.reason] ?? report.reason}
            </span>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          {new Date(report.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Reporter */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-white text-xs font-semibold shrink-0">
          {report.reporter?.first_name?.[0]}
          {report.reporter?.last_name?.[0]}
        </div>
        <div>
          <p className="text-xs font-semibold">
            Reported by: {report.reporter?.first_name}{" "}
            {report.reporter?.last_name}
          </p>
          <p className="text-xs text-text-muted">{report.reporter?.email}</p>
        </div>
      </div>

      {/* Reported user */}
      {report.reported_user && (
        <div className="px-3 py-2 bg-danger-soft rounded-lg">
          <p className="text-xs font-semibold text-danger">Reported user</p>
          <p className="text-xs text-danger">
            {report.reported_user.first_name} {report.reported_user.last_name} —{" "}
            {report.reported_user.email}
          </p>
        </div>
      )}

      {/* Target ID */}
      <p className="text-xs text-text-muted font-mono">
        Target ID: {report.target_id}
      </p>

      {/* Details */}
      {report.details && (
        <p className="text-sm text-text-secondary italic">"{report.details}"</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <p className="text-xs font-semibold text-warning">Action required</p>
        <div className="flex gap-2">
          <button
            onClick={() => handle("dismissed")}
            disabled={!!deciding}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-primary-muted cursor-pointer disabled:opacity-60 transition-colors"
          >
            {deciding === "dismissed" ? "Dismissing..." : "Dismiss"}
          </button>
          <button
            onClick={() => handle("reviewed")}
            disabled={!!deciding}
            className="text-xs px-3 py-1.5 rounded-lg bg-danger hover:bg-danger-hover text-white cursor-pointer disabled:opacity-60 transition-colors"
          >
            {deciding === "reviewed" ? "Reviewing..." : "Mark Reviewed"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminReports;
