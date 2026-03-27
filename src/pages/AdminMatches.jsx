import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/sidebar";

function AdminMatches() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function checkAdminAndFetch() {
      try {
        const authRes = await fetch("http://localhost:8000/auth/userchecker", {
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
        setUser(userData);
      } catch {
        navigate("/login");
        return;
      }

      try {
        const res = await fetch("http://localhost:8000/admin/matches", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setMatches(data.matches);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    checkAdminAndFetch();
  }, []);

  const handleReview = async (matchId, decision) => {
    try {
      const res = await fetch(
        `http://localhost:8000/admin/matches/${matchId}/review`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );

      if (res.ok) {
        // Remove reviewed match from list
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
      }
    } catch (err) {
      console.error("Review failed:", err);
    }
  };

  return (
    <div className="w-dvw min-h-dvh flex flex-row bg-primary-soft">
      <Sidebar />
      <div className="p-4 flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-2xl">Pending Matches</p>
            <p className="text-sm text-text-muted">
              Review and approve or reject match requests from students
            </p>
          </div>
          {!loading && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-warning-soft text-warning">
              {matches.length} pending
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-4xl">✅</p>
            <p className="font-semibold">All caught up!</p>
            <p className="text-sm text-text-muted">
              No pending match requests.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {matches.map((match) => (
              <MatchReviewCard
                key={match.id}
                match={match}
                onApprove={() => handleReview(match.id, "approved")}
                onReject={() => handleReview(match.id, "rejected")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchReviewCard({ match, onApprove, onReject }) {
  const [deciding, setDeciding] = useState(null);

  const handle = async (decision, fn) => {
    setDeciding(decision);
    await fn();
    setDeciding(null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-4">
      {/* Requester */}
      {match.requester && (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-white text-xs font-semibold">
            {match.requester.first_name?.[0]}
            {match.requester.last_name?.[0]}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {match.requester.first_name} {match.requester.last_name}
            </p>
            <p className="text-xs text-text-muted">{match.requester.email}</p>
          </div>
          <span className="ml-auto text-xs text-text-muted">
            {new Date(match.created_at).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Two item cards side by side */}
      <div className="grid grid-cols-2 gap-3">
        <ItemSummary item={match.source_item} label="Their item" />
        <ItemSummary item={match.matched_item} label="Matched with" />
      </div>

      {/* AI reason */}
      {match.reason && (
        <div className="px-3 py-2 bg-primary-soft rounded-lg">
          <p className="text-xs text-text-muted font-semibold mb-0.5">
            AI reasoning
          </p>
          <p className="text-xs text-text-muted italic">{match.reason}</p>
          <p className="text-xs text-text-muted mt-1">
            Confidence:{" "}
            <span className="font-semibold">
              {Math.round(match.similarity_score * 100)}%
            </span>
          </p>
        </div>
      )}

      {/* Action required banner */}
      <div className="flex items-center justify-between px-3 py-2 bg-warning-soft rounded-lg border border-warning">
        <p className="text-xs font-semibold text-warning">
          Action required — approve or reject this match
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handle("rejected", onReject)}
            disabled={!!deciding}
            className="text-xs px-3 py-1.5 rounded-lg border border-danger text-danger hover:bg-danger-soft cursor-pointer disabled:opacity-60 transition-colors"
          >
            {deciding === "rejected" ? "Rejecting..." : "Reject"}
          </button>
          <button
            onClick={() => handle("approved", onApprove)}
            disabled={!!deciding}
            className="text-xs px-3 py-1.5 rounded-lg bg-success hover:bg-success-hover text-white cursor-pointer disabled:opacity-60 transition-colors"
          >
            {deciding === "approved" ? "Approving..." : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemSummary({ item, label }) {
  if (!item) return null;
  const isLost = item.item_type === "lost";
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-primary-soft border border-gray-200">
      <p className="text-xs text-text-muted font-semibold">{label}</p>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
            isLost
              ? "bg-danger-soft text-danger"
              : "bg-success-soft text-success"
          }`}
        >
          {isLost ? "Lost" : "Found"}
        </span>
        <p className="text-sm font-semibold truncate">{item.item_name}</p>
      </div>
      <p className="text-xs text-text-muted">
        {item.category} · {item.location}
      </p>
      <p className="text-xs text-text-muted line-clamp-2">{item.description}</p>
    </div>
  );
}

export default AdminMatches;
