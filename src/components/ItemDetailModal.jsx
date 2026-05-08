import { useState, useRef } from "react";
import { X, Trash2, Search, ImagePlus, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import ReportButton from "@/components/AbuseReportButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  "Bags",
  "Electronics",
  "Clothing",
  "Keys",
  "ID / Cards",
  "Books",
  "Jewelry",
  "Other",
];

const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 7 * 1024 * 1024;

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

  // Zip image_paths + signed_urls so we can track which path goes with which URL.
  // Kept in state so the modal can update its view immediately after a save
  // without waiting for the parent to refetch.
  const [existingImages, setExistingImages] = useState(() => {
    const paths = item.image_paths || [];
    const urls  = item.signed_urls  || [];
    return paths
      .map((path, i) => ({ path, url: urls[i] || null }))
      .filter((img) => img.url);
  });

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [matches, setMatches] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);

  // Image editing state
  const [removedPaths, setRemovedPaths] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);
  const fileInputRef = useRef(null);

  // If the item's category isn't in our list it was entered as "Other"
  const isCustomCategory =
    item.category && !CATEGORIES.includes(item.category);

  const [form, setForm] = useState({
    item_name: item.item_name || "",
    description: item.description || "",
    location: item.location || "",
    category: isCustomCategory ? "Other" : item.category || "",
  });

  const [customCategory, setCustomCategory] = useState(
    isCustomCategory ? item.category : "",
  );

  // Date state — Date objects for Calendar, initialized from item
  const [dateFrom, setDateFrom] = useState(() =>
    item.date_lost_from ? new Date(item.date_lost_from) : null,
  );
  const [dateTo, setDateTo] = useState(() =>
    item.date_lost_to ? new Date(item.date_lost_to) : null,
  );
  const [date, setDate] = useState(() =>
    item.date_found ? new Date(item.date_found) : null,
  );

  // Popover open state
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const visibleExisting = existingImages.filter(
    (img) => !removedPaths.includes(img.path),
  );
  const totalImageCount = visibleExisting.length + newFiles.length;

  const handleAddFiles = (e) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - totalImageCount;
    const toAdd = files.slice(0, remaining);
    const oversized = toAdd.filter((f) => f.size > MAX_FILE_BYTES);
    if (oversized.length > 0) {
      setError("Each image must be under 7 MB.");
      e.target.value = "";
      return;
    }
    setNewFiles((prev) => [...prev, ...toAdd]);
    setNewPreviews((prev) => [
      ...prev,
      ...toAdd.map((f) => URL.createObjectURL(f)),
    ]);
    e.target.value = "";
  };

  const handleRemoveExisting = (path) =>
    setRemovedPaths((prev) => [...prev, path]);

  const handleRemoveNew = (index) => {
    URL.revokeObjectURL(newPreviews[index]);
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const resetImageState = () => {
    newPreviews.forEach((u) => URL.revokeObjectURL(u));
    setRemovedPaths([]);
    setNewFiles([]);
    setNewPreviews([]);
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      let addPaths = [];

      if (newFiles.length > 0) {
        const formData = new FormData();
        newFiles.forEach((f) => formData.append("files", f));
        const uploadRes = await apiFetch("/items/upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok)
          throw new Error(uploadData.detail || "Image upload failed");
        addPaths = uploadData.paths;
      }

      const resolvedCategory =
        form.category === "Other" ? customCategory.trim() : form.category;

      const res = await apiFetch(`/items/${item.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          category: resolvedCategory,
          date_lost_from: isLost ? (dateFrom ? dateFrom.toISOString() : null) : undefined,
          date_lost_to: isLost ? (dateTo ? dateTo.toISOString() : null) : undefined,
          date_found: !isLost ? (date ? date.toISOString() : null) : undefined,
          add_image_paths: addPaths,
          remove_image_paths: removedPaths,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Update failed");

      // Refresh the image strip from the fresh signed URLs in the response
      const freshPaths = data.item?.image_paths || [];
      const freshUrls  = data.item?.signed_urls  || [];
      setExistingImages(
        freshPaths
          .map((path, i) => ({ path, url: freshUrls[i] || null }))
          .filter((img) => img.url),
      );

      resetImageState();
      setSuccess("Item updated successfully.");
      setEditing(false);
      onUpdated(data.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  function MatchRequestButton({ sourceItemId, matchedItemId, score, reason }) {
    const [status, setStatus] = useState("idle");

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
    "outline-none px-3 py-2.5 rounded-xl bg-bg-raised focus:bg-secondary-soft border border-border-strong focus:ring-2 ring-secondary-muted text-sm w-full transition-all duration-200";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-raised rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col gap-5 p-4 sm:p-6 relative shadow-lg"
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

        {/* Images — static in view mode, editable in edit mode */}
        {!editing && existingImages.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {existingImages.map((img, i) => (
              <img
                key={i}
                src={img.url}
                alt={`Photo ${i + 1}`}
                className="w-full h-28 object-cover rounded-xl border border-border"
              />
            ))}
          </div>
        )}

        {editing && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-muted">
                Photos
              </label>
              <span className="text-xs text-text-muted">
                {totalImageCount}/{MAX_IMAGES}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* Existing images not yet removed */}
              {visibleExisting.map((img, i) => (
                <div key={img.path} className="relative group">
                  <img
                    src={img.url}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-24 object-cover rounded-xl border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveExisting(img.path)}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 cursor-pointer transition-all duration-150"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* New file previews */}
              {newPreviews.map((url, i) => (
                <div key={url} className="relative group">
                  <img
                    src={url}
                    alt={`New photo ${i + 1}`}
                    className="w-full h-24 object-cover rounded-xl border border-secondary/50"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveNew(i)}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 cursor-pointer transition-all duration-150"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Add photos button */}
              {totalImageCount < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border hover:border-secondary hover:bg-secondary-soft text-text-muted hover:text-secondary cursor-pointer transition-all duration-200"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-xs">Add</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddFiles}
            />
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
                  ? dateFrom
                    ? dateTo
                      ? `${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`
                      : format(dateFrom, "MMM d, yyyy")
                    : "—"
                  : date
                    ? format(date, "MMM d, yyyy")
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
              <Select
                value={form.category}
                onValueChange={(val) =>
                  setForm((prev) => ({ ...prev, category: val }))
                }
              >
                <SelectTrigger className="h-auto p-2.5 rounded-xl bg-bg-raised border border-border-strong ring-secondary-muted focus:ring-2 focus-visible:ring-2 text-sm hover:bg-secondary-soft transition-all duration-200">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.category === "Other" && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Describe the category..."
                  maxLength={50}
                  className={inputClass}
                />
              )}
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

            {/* Date fields */}
            {isLost ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-text-muted">
                  Date Lost
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-text-muted">From</label>
                    <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-bg-raised border border-border-strong hover:bg-secondary-soft text-sm cursor-pointer transition-all duration-200">
                          <span className={dateFrom ? "text-text" : "text-text-muted"}>
                            {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Pick a date"}
                          </span>
                          <CalendarIcon className="w-4 h-4 text-text-muted" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={(d) => {
                            setDateFrom(d);
                            setDateFromOpen(false);
                            if (dateTo && d && dateTo < d) setDateTo(null);
                          }}
                          disabled={(d) => d > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-text-muted">
                      To (optional)
                    </label>
                    <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-bg-raised border border-border-strong hover:bg-secondary-soft text-sm cursor-pointer transition-all duration-200">
                          <span className={dateTo ? "text-text" : "text-text-muted"}>
                            {dateTo ? format(dateTo, "MMM d, yyyy") : "Pick a date"}
                          </span>
                          <CalendarIcon className="w-4 h-4 text-text-muted" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={(d) => {
                            setDateTo(d);
                            setDateToOpen(false);
                          }}
                          disabled={(d) =>
                            d > new Date() || (dateFrom ? d < dateFrom : false)
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-text-muted">
                  Date Found
                </label>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-bg-raised border border-border-strong hover:bg-secondary-soft text-sm cursor-pointer transition-all duration-200">
                      <span className={date ? "text-text" : "text-text-muted"}>
                        {date ? format(date, "MMM d, yyyy") : "Pick a date"}
                      </span>
                      <CalendarIcon className="w-4 h-4 text-text-muted" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => {
                        setDate(d);
                        setDateOpen(false);
                      }}
                      disabled={(d) => d > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        )}

        {!isOwner && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
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
                    resetImageState();
                    setForm({
                      item_name: item.item_name || "",
                      description: item.description || "",
                      location: item.location || "",
                      category: isCustomCategory ? "Other" : item.category || "",
                    });
                    setCustomCategory(isCustomCategory ? item.category : "");
                    setDateFrom(item.date_lost_from ? new Date(item.date_lost_from) : null);
                    setDateTo(item.date_lost_to ? new Date(item.date_lost_to) : null);
                    setDate(item.date_found ? new Date(item.date_found) : null);
                  }}
                  className="flex-1 px-4 py-2 rounded-xl border border-border hover:bg-primary-muted text-sm cursor-pointer transition-all duration-200"
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
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="font-semibold text-sm">
              {matches.length > 0
                ? `${matches.length} potential match${matches.length > 1 ? "es" : ""} found`
                : "No matches found yet — check back as more items are reported."}
            </p>

            {matches.map((match, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 p-4 rounded-2xl border border-border bg-primary-soft shadow-sm"
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
