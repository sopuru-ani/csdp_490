import { apiFetch } from "@/lib/api";
import { useState } from "react";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "false_claim", label: "False claim / fraud" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

function ReportButton({ targetType, targetId, reportedUserId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!reason) {
      setError("Please select a reason.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          reported_user_id: reportedUserId || null,
          reason,
          details: details.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit report");

      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <span className="text-xs text-text-muted italic">Report submitted</span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-text-muted hover:text-danger cursor-pointer transition-colors"
      >
        Report
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-sm p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-bold text-base">Report {targetType}</p>
              <p className="text-xs text-text-muted mt-0.5">
                Help us keep the platform safe. Reports are reviewed by admins.
              </p>
            </div>

            {error && (
              <p className="text-xs text-danger px-3 py-2 bg-danger-soft rounded-lg">
                {error}
              </p>
            )}

            {/* Reason selector */}
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-text-muted">Reason</p>
              <div className="flex flex-col gap-1">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-soft cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="accent-secondary"
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Optional details */}
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-text-muted">
                Additional details{" "}
                <span className="font-normal">(optional)</span>
              </p>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe what happened..."
                rows={2}
                className="outline-none px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-secondary focus:ring-1 text-sm resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 hover:bg-primary-muted text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white text-sm cursor-pointer disabled:opacity-60"
              >
                {loading ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ReportButton;
