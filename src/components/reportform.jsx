import { useState, useRef } from "react";
import {
  ArrowRight,
  Upload,
  Image as ImageIcon,
  CalendarIcon,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

// shadcn components
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

import { apiFetch } from "@/lib/api";

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

function ReportForm({ type = "lost" }) {
  const isLost = type === "lost";

  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    category: "",
  });

  // Date state — using Date objects for shadcn Calendar
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [date, setDate] = useState(null);

  // Popover open states
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);

  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleImage = (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;

    const oversized = selected.filter((f) => f.size > 7 * 1024 * 1024);
    if (oversized.length > 0) {
      setError("Each image must be under 7MB.");
      return;
    }

    const combined = [...images, ...selected].slice(0, 5); // max 5 images
    setImages(combined);
    setPreviews(combined.map((f) => URL.createObjectURL(f)));
    setError("");
  };

  const removeImage = (index) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
    if (newImages.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.title || form.title.trim().length < 3)
      newErrors.title = "Title must be at least 3 characters.";
    if (!form.category) newErrors.category = "Please select a category.";
    if (!form.description || form.description.trim().length < 10)
      newErrors.description = "Description must be at least 10 characters.";
    if (!form.location || form.location.trim().length < 3)
      newErrors.location = "Please enter a location.";
    if (isLost && !dateFrom) newErrors.dateFrom = "Please select a date.";
    if (!isLost && !date) newErrors.date = "Please select the date found.";
    return newErrors;
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setError("Please fix the errors below before submitting.");
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      // Step 1: Upload image if one was selected
      let imagePaths = [];
      if (image.length > 0) {
        const formData = new FormData();
        images.forEach((f) => formData.append("files", f));

        const uploadRes = await apiFetch("/items/upload", {
          method: "POST",
          credentials: "include", // sends your auth cookie
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.detail || "Image upload failed");
        }

        const uploadData = await uploadRes.json();
        imagePaths = uploadData.paths;
      }

      // Step 2: Submit the item report with the returned image paths
      const itemRes = await apiFetch(`/items/${type}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: form.title,
          description: form.description,
          location: form.location,
          category: form.category,
          date_lost_from: dateFrom ? dateFrom.toISOString() : null,
          date_lost_to: dateTo ? dateTo.toISOString() : null,
          date_found: date ? date.toISOString() : null,
          image_paths: imagePaths,
        }),
      });

      if (!itemRes.ok) {
        const err = await itemRes.json();
        throw new Error(err.detail || "Failed to submit report");
      }

      setSuccess(
        isLost
          ? "Your lost item report has been submitted. We'll notify you if a match is found."
          : "Your found item report has been submitted. The owner will be notified.",
      );

      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field) =>
    `outline-none px-4 py-3 rounded-xl bg-white focus:bg-secondary-soft border ${
      errors[field] ? "border-danger" : "border-gray-300"
    } ring-secondary-muted focus:ring-2 text-sm w-full transition-all duration-200`;

  // Shared style for the date trigger button
  const dateTriggerClass = (field, hasValue) =>
    `flex items-center justify-between w-full px-4 py-3 rounded-xl bg-white border ${
      errors[field] ? "border-danger" : "border-gray-300"
    } ring-secondary-muted hover:bg-secondary-soft focus:ring-2 text-sm cursor-pointer transition-all duration-200`;

  return (
    <div className="w-full min-h-screen flex flex-col justify-center items-center p-3 sm:p-4 md:p-6 bg-primary-soft">
      <div className="w-full max-w-150 p-4 sm:p-6 rounded-2xl bg-white border border-gray-200 shadow-md flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isLost
                  ? "bg-danger-soft text-danger"
                  : "bg-success-soft text-success"
              }`}
            >
              {isLost ? "Lost Item" : "Found Item"}
            </span>
          </div>
          <p className="font-bold text-3xl">
            {isLost ? "Report a Lost Item" : "Report a Found Item"}
          </p>
          <p className="text-sm text-text-secondary">
            {isLost
              ? "Fill in the details below and we'll try to find a match for you."
              : "Let us know what you found so we can help return it to its owner."}
          </p>
        </div>

        {/* Global error / success */}
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

        {/* Fields */}
        <div className="flex flex-col gap-4">
          {/* Item Title */}
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-sm">
              Item Title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Blue JanSport Backpack"
              className={inputClass("title")}
            />
            {errors.title && (
              <p className="text-danger text-xs">{errors.title}</p>
            )}
          </div>

          {/* Category — shadcn Select */}
          <div className="flex flex-col gap-1">
            <label className="text-sm">Category</label>
            <Select
              value={form.category}
              onValueChange={(val) =>
                setForm((prev) => ({ ...prev, category: val }))
              }
            >
              <SelectTrigger
                className={`h-auto p-3.5 rounded-xl bg-white border ${
                  errors.category ? "border-danger" : "border-gray-300"
                } ring-secondary-muted focus:ring-2 focus-visible:ring-2 text-sm border-gray-300 hover:bg-secondary-soft transition-all duration-200`}
              >
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
            {errors.category && (
              <p className="text-danger text-xs">{errors.category}</p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-sm">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder="Describe the item — color, brand, any distinguishing marks..."
              className={`${inputClass("description")} resize-none`}
            />
            <div className="flex justify-between items-center">
              {errors.description ? (
                <p className="text-danger text-xs">{errors.description}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-text-muted ml-auto">
                {form.description.length} chars
              </p>
            </div>
          </div>

          {/* Approximate Location */}
          <div className="flex flex-col gap-1">
            <label htmlFor="location" className="text-sm">
              Approximate Location
            </label>
            <input
              type="text"
              id="location"
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="e.g. Library 2nd floor, near study rooms"
              className={inputClass("location")}
            />
            <p className="text-xs text-text-muted">
              General area only — no exact location needed.
            </p>
            {errors.location && (
              <p className="text-danger text-xs">{errors.location}</p>
            )}
          </div>

          {/* Date Fields — shadcn Popover + Calendar */}
          {isLost ? (
            <div className="flex flex-col gap-1">
              <label className="text-sm">Date Lost</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* From date */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-muted">From</label>
                  <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className={dateTriggerClass("dateFrom", !!dateFrom)}
                      >
                        <span
                          className={dateFrom ? "text-text" : "text-gray-400"}
                        >
                          {dateFrom
                            ? format(dateFrom, "MMM d, yyyy")
                            : "Pick a date"}
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
                          // reset dateTo if it's before the new dateFrom
                          if (dateTo && d && dateTo < d) setDateTo(null);
                        }}
                        disabled={(d) => d > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.dateFrom && (
                    <p className="text-danger text-xs">{errors.dateFrom}</p>
                  )}
                </div>

                {/* To date */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-muted">
                    To (optional)
                  </label>
                  <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                    <PopoverTrigger asChild>
                      <button className={dateTriggerClass("dateTo", !!dateTo)}>
                        <span
                          className={dateTo ? "text-text" : "text-gray-400"}
                        >
                          {dateTo
                            ? format(dateTo, "MMM d, yyyy")
                            : "Pick a date"}
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
              <label className="text-sm">Date Found</label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <button className={dateTriggerClass("date", !!date)}>
                    <span className={date ? "text-text" : "text-gray-400"}>
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
              {errors.date && (
                <p className="text-danger text-xs">{errors.date}</p>
              )}
            </div>
          )}

          {/* Image Upload */}
          <div className="flex flex-col gap-1">
            <label className="text-sm">
              Photos{" "}
              <span className="text-text-muted font-normal">
                (optional, max 5)
              </span>
            </label>

            {/* Upload zone — always visible until 5 images */}
            {images.length < 5 && (
              <label
                htmlFor="image"
                className="flex flex-col items-center justify-center gap-2 px-4 py-7 rounded-2xl bg-white border border-dashed border-gray-300 hover:bg-secondary-soft hover:border-secondary cursor-pointer transition-all duration-200 shadow-sm"
              >
                <Upload className="w-5 h-5 text-text-muted" />
                <span className="text-sm text-text-muted">
                  Click to upload photos
                </span>
                <span className="text-xs text-text-muted">
                  PNG, JPG, WEBP — max 5MB each · {5 - images.length} remaining
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="image"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={handleImage}
                  className="hidden"
                />
              </label>
            )}

            {/* Previews grid */}
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mt-1">
                {previews.map((src, i) => (
                  <div
                    key={i}
                    className="relative rounded-xl overflow-hidden border border-gray-300 shadow-sm"
                  >
                    <img
                      src={src}
                      alt={`Preview ${i + 1}`}
                      className="w-full h-24 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 bg-white rounded-full w-6 h-6 flex items-center justify-center text-danger text-xs shadow-sm cursor-pointer hover:bg-danger-soft transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !!success}
          className="px-4 py-3 rounded-xl bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-all duration-200 shadow-sm"
        >
          {isLost ? "Submit Lost Report" : "Submit Found Report"}
          {loading ? (
            <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
        </button>

        <p className="text-center text-sm text-text-muted">
          Changed your mind?{" "}
          <a
            href="/dashboard"
            className="text-secondary hover:text-secondary-hover transition-colors"
          >
            Go back to dashboard
          </a>
        </p>
      </div>
    </div>
  );
}

export default ReportForm;
