function ItemCard({ item }) {
  const isLost = item.item_type === "lost";
  const date = isLost ? item.date_lost_from : item.date_found;
  const signedUrls = (item.signed_urls || []).filter(Boolean);

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-white border border-gray-200">
      <div className="flex flex-row items-start justify-between">
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
            <p className="font-semibold text-sm">{item.item_name}</p>
          </div>
          <p className="text-xs text-text-muted">
            {item.category} · {item.location}
          </p>
          <p className="text-xs text-text-muted">{item.description}</p>
        </div>
        <p className="text-xs text-text-muted whitespace-nowrap ml-4">
          {date ? new Date(date).toLocaleDateString() : "—"}
        </p>
      </div>

      {signedUrls.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-1">
          {signedUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`${item.item_name} photo ${i + 1}`}
              className="w-full h-20 object-cover rounded-md border border-gray-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ItemCard;
