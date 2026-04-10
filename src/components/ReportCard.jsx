import { MapPin } from "lucide-react";

function ReportCard({ item, onClick }) {
  const isLost = item.item_type === "lost";
  const signedUrls = (item.signed_urls || []).filter(Boolean);
  const date = isLost ? item.date_lost_from : item.date_found;
  const isClosed = item.status === "closed";

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4 cursor-pointer hover:border-secondary-muted hover:shadow-lg transition-all duration-200 shadow-md"
    >
      {/* Top row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                isLost
                  ? "bg-danger-soft text-danger"
                  : "bg-success-soft text-success"
              }`}
            >
              {isLost ? "Lost" : "Found"}
            </span>
            {isClosed && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success-soft text-success shrink-0">
                Resolved ✓
              </span>
            )}
            <p className="font-semibold text-base truncate">{item.item_name}</p>
          </div>
          <p className="text-xs text-text-muted">{item.category}</p>
        </div>
        <p className="text-xs text-text-muted whitespace-nowrap shrink-0">
          {date ? new Date(date).toLocaleDateString() : "—"}
        </p>
      </div>

      {/* Description */}
      <p className="text-sm text-text-secondary line-clamp-2">
        {item.description}
      </p>

      {/* Location */}
      <div className="flex items-center gap-1.5">
        {/* <span className="text-xs text-text-muted">📍</span> */}
        <MapPin className="w-4 h-4 text-text-muted" />
        <p className="text-xs text-text-muted">{item.location}</p>
      </div>

      {/* Bottom row — images + submitted date */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-gray-100">
        <div className="flex flex-wrap items-center gap-3">
          {signedUrls.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-2">
                {signedUrls.slice(0, 3).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover border-2 border-white"
                  />
                ))}
              </div>
              <p className="text-xs text-text-muted">
                {signedUrls.length} photo{signedUrls.length > 1 ? "s" : ""}
              </p>
            </div>
          ) : (
            <p className="text-xs text-text-muted">No photos</p>
          )}
        </div>
        <p className="text-xs text-text-muted">
          Submitted {new Date(item.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

export default ReportCard;
