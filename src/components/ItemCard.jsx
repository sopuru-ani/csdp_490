import { Box } from "lucide-react";

function ItemCard({ item, onClick, pendingMatch }) {
  const isLost = item.item_type === "lost";
  const date = isLost ? item.date_lost_from : item.date_found;
  const signedUrls = (item.signed_urls || []).filter(Boolean);

  return (
    <div
      onClick={onClick}
      className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-2xl bg-white border border-gray-200 cursor-pointer hover:border-secondary-muted hover:shadow-lg transition-all duration-200 shadow-md"
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-full sm:w-16 h-40 sm:h-16 rounded-xl overflow-hidden border border-gray-200 bg-primary-soft flex items-center justify-center shadow-sm">
        {signedUrls.length > 0 ? (
          <img
            src={signedUrls[0]}
            alt={item.item_name}
            className="w-full h-full object-cover"
          />
        ) : (
          // <span className="text-2xl">📦</span>
          <Box className="w-9 h-9" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
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
          <p className="font-semibold text-sm truncate">{item.item_name}</p>
          {/* Pending match badge */}
          {pendingMatch && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning-soft text-warning shrink-0">
              Match requested
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted truncate">
          {item.category} · {item.location}
        </p>
        <p className="text-xs text-text-muted line-clamp-1">
          {item.description}
        </p>
      </div>

      {/* Right side */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <p className="text-xs text-text-muted whitespace-nowrap">
          {date ? new Date(date).toLocaleDateString() : "—"}
        </p>
        {signedUrls.length > 1 && (
          <span className="text-xs text-text-muted">
            📷 {signedUrls.length}
          </span>
        )}
      </div>
    </div>
  );
}

export default ItemCard;
