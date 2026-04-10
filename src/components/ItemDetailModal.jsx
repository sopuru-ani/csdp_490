import { useState } from "react";
import { X, Trash2, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import ReportButton from "@/components/AbuseReportButton";

function ItemDetailModal({
  item,
  currentUserId,
  isAdmin,
  onClose,
  onUpdated,
  onDeleted,
}) {
  const isLost = item.item_type === "lost";
  const isOwner = item.user_id === currentUserId;
  const signedUrls = (item.signed_urls || []).filter(Boolean);

  // Local state for edit mode, form, and feedback messages
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  // For showing API error/success messages after trying to save edits
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  //
  const [matches, setMatches] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const [form, setForm] = useState({
    item_name: item.item_name || "",
    description: item.description || "",
    location: item.location || "",
    category: item.category || "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await apiFetch(`/items/${item.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Update failed");
      }

      setSuccess("Item updated successfully.");
      setEditing(false);
      onUpdated(); // tell dashboard to refetch
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // This function calls the backend to delete the item, then calls onDeleted to tell the parent to refetch and close the modal.
  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this report? This cannot be undone.",
      )
    )
      return;

    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/items/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");

      onDeleted?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // This function calls the backend to find potential matches for this item, then displays them in the modal.
  const handleFindMatches = async () => {
    setMatchesLoading(true);
    setMatches(null);
    setError("");

    try {
      const res = await apiFetch(`/items/${item.id}/matches`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || "Failed to find matches");

      setMatches(data.matches);
    } catch (err) {
      setError(err.message);
    } finally {
      setMatchesLoading(false);
    }
  };

  // This component renders the "Request this match" button for each potential match, and handles the API call when clicked.
  function MatchRequestButton({ sourceItemId, matchedItemId, score, reason }) {
    const [status, setStatus] = useState("idle"); // idle | loading | requested | error

    const handleRequest = async () => {
      setStatus("loading");
      try {
        const res = await apiFetch(`/items/${sourceItemId}/matches/request`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matched_item_id: matchedItemId,
            similarity_score: score / 100,
            reason,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Already requested = treat as soft error, show requested state
          if (data.detail?.includes("already exists")) {
            setStatus("requested");
            return;
          }
          throw new Error(data.detail || "Request failed");
        }

        setStatus("requested");
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    };

    if (status === "requested") {
      return (
        <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
          <span className="w-2 h-2 rounded-full bg-warning inline-block" />
          Match requested — pending admin review
        </div>
      );
    }

    if (status === "error") {
      return (
        <p className="text-xs text-danger mt-1">
          Something went wrong. Try again.
        </p>
      );
    }

    return (
      <button
        onClick={handleRequest}
        disabled={status === "loading"}
        className="self-start text-xs px-3 py-1.5 rounded-xl border border-secondary text-secondary hover:bg-secondary-soft cursor-pointer disabled:opacity-60 transition-all duration-200"
      >
        {status === "loading" ? "Requesting..." : "Request this match"}
      </button>
    );
  }

  const inputClass =
    "outline-none px-3 py-2.5 rounded-xl bg-white focus:bg-secondary-soft border border-gray-300 focus:ring-2 ring-secondary-muted text-sm w-full transition-all duration-200";

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {/* Modal — stop clicks from closing when clicking inside */}
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col gap-5 p-4 sm:p-6 relative shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isLost
                    ? "bg-danger-soft text-danger"
                    : "bg-success-soft text-success"
                }`}
              >
                {isLost ? "Lost" : "Found"}
              </span>
              {item.category && (
                <span className="text-xs text-text-muted">{item.category}</span>
              )}
            </div>
            <p className="font-bold text-lg">{item.item_name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-primary-muted rounded-lg cursor-pointer transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin: reporter info */}
        {isAdmin && item.users && (
          <div className="px-3 py-2 bg-secondary-soft rounded-xl text-sm shadow-sm">
            <p className="font-semibold text-xs text-text-muted mb-0.5">
              Reported by
            </p>
            <p>
              {item.users.first_name} {item.users.last_name}
            </p>
            <p className="text-text-muted text-xs">{item.users.email}</p>
          </div>
        )}

        {/* Images */}
        {signedUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {signedUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Photo ${i + 1}`}
                className="w-full h-28 object-cover rounded-xl border border-gray-200"
              />
            ))}
          </div>
        )}

        {/* Error / success */}
        {error && (
          <p className="px-3 py-2 bg-danger-soft border-l-4 border-danger text-sm rounded-lg">
            {error}
          </p>
        )}
        {success && (
          <p className="px-3 py-2 bg-success-soft border-l-4 border-success text-sm rounded-lg">
            {success}
          </p>
        )}

        {/* View mode */}
        {!editing && (
          <div className="flex flex-col gap-2 text-sm">
            <div>
              <p className="text-xs text-text-muted font-semibold">Location</p>
              <p>{item.location}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted font-semibold">
                Description
              </p>
              <p>{item.description}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted font-semibold">Date</p>
              <p>
                {isLost
                  ? item.date_lost_from
                    ? new Date(item.date_lost_from).toLocaleDateString()
                    : "—"
                  : item.date_found
                    ? new Date(item.date_found).toLocaleDateString()
                    : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted font-semibold">Submitted</p>
              <p>{new Date(item.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        )}

        {/* Edit mode — only for owner */}
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text-muted">
                Item Name
              </label>
              <input
                name="item_name"
                value={form.item_name}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text-muted">
                Category
              </label>
              <input
                name="category"
                value={form.category}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text-muted">
                Location
              </label>
              <input
                name="location"
                value={form.location}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text-muted">
                Description
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                className={inputClass}
              />
            </div>
          </div>
        )}

        {!isOwner && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-text-muted flex-1">
              Something wrong with this report?
            </p>
            <ReportButton
              targetType="item"
              targetId={item.id}
              reportedUserId={item.user_id}
            />
          </div>
        )}

        {/* Footer buttons — only for owner */}
        {isOwner && (
          <div className="flex gap-2 pt-2">
            {!editing ? (
              <>
                {/* Only allow delete on open items */}
                {item.status !== "closed" && (
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl border border-danger text-danger/50 hover:bg-danger/30 hover:text-danger hover:border-transparent text-sm cursor-pointer disabled:opacity-60 transition-all duration-200 flex flex-row items-center justify-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    {loading ? "Deleting..." : "Delete"}
                  </button>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer transition-all duration-200 shadow-sm"
                >
                  Edit
                </button>
                <button
                  onClick={handleFindMatches}
                  disabled={matchesLoading || item.status === "closed"}
                  className="flex-1 px-4 py-2 rounded-xl border border-secondary text-secondary hover:bg-secondary-muted hover:border-transparent text-sm cursor-pointer disabled:opacity-60 flex flex-row items-center justify-center gap-1 transition-all duration-200"
                >
                  {!matchesLoading && <Search className="w-4 h-4" />}
                  {matchesLoading ? "Searching..." : "Find Matches"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 hover:bg-primary-muted text-sm cursor-pointer transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer disabled:opacity-60 transition-all duration-200 shadow-sm"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Match Results */}
        {matches !== null && (
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
            <p className="font-semibold text-sm">
              {matches.length > 0
                ? `${matches.length} potential match${matches.length > 1 ? "es" : ""} found`
                : "No matches found yet — check back as more items are reported."}
            </p>

            {matches.map((match, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 p-4 rounded-2xl border border-gray-200 bg-primary-soft shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">
                    {match.item.item_name}
                  </p>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      match.score >= 75
                        ? "bg-success-soft text-success"
                        : match.score >= 50
                          ? "bg-warning-soft text-warning"
                          : "bg-danger-soft text-danger"
                    }`}
                  >
                    {match.score}% match
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {match.item.category} · {match.item.location}
                </p>
                <p className="text-xs text-text-muted italic">{match.reason}</p>

                {/* Request Match button */}
                <MatchRequestButton
                  sourceItemId={item.id}
                  matchedItemId={match.item.id}
                  score={match.score}
                  reason={match.reason}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ItemDetailModal;
