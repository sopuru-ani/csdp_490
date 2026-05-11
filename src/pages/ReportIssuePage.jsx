import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

const ISSUE_TYPES = [
  { value: "bug",                  label: "Bug / Technical Problem" },
  { value: "abuse_harassment",     label: "Abuse or Harassment" },
  { value: "inappropriate_content",label: "Inappropriate Content" },
  { value: "account_issue",        label: "Account Issue" },
  { value: "other",                label: "Other" },
];

const AFFECTED_PAGES = ["Dashboard", "My Reports", "Messages", "Matching", "Settings", "Other"];

const ACCOUNT_SUBTYPES = [
  { value: "cant_login",  label: "Can't log in" },
  { value: "wrong_info",  label: "Wrong account info" },
  { value: "compromised", label: "Account compromised" },
  { value: "other",       label: "Other" },
];

const MISLEADING_REASONS = [
  { value: "false_description",  label: "False description" },
  { value: "fake_images",        label: "Fake/stolen images" },
  { value: "misleading_location",label: "Misleading location" },
  { value: "spam",               label: "Spam listing" },
];

const SHOW_ATTACHMENTS_FOR = new Set(["bug", "abuse_harassment", "inappropriate_content"]);

function ReportIssuePage() {
  const navigate  = useNavigate();
  const fileInput = useRef(null);

  const [currentUser, setCurrentUser]   = useState(null);
  const [conversations, setConversations] = useState([]);

  // Form state
  const [issueType,              setIssueType]              = useState("");
  const [description,            setDescription]            = useState("");
  const [isAnonymous,            setIsAnonymous]            = useState(false);
  const [referencedConvId,       setReferencedConvId]       = useState("");
  const [referencedUserId,       setReferencedUserId]       = useState("");
  const [referencedItemId,       setReferencedItemId]       = useState("");
  const [misleadingReasons,      setMisleadingReasons]      = useState([]);
  const [affectedPage,           setAffectedPage]           = useState("");
  const [accountIssueSubtype,    setAccountIssueSubtype]    = useState("");
  const [files,                  setFiles]                  = useState([]);

  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [ticket,     setTicket]     = useState(null);

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const res = await apiFetch("/auth/userchecker");
        if (!res.ok) { navigate("/login"); return; }
        const user = await res.json();
        setCurrentUser(user);
      } catch {
        navigate("/login");
        return;
      }

      try {
        const res = await apiFetch("/conversations");
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations || []);
        }
      } catch { /* non-fatal */ }
    }
    init();
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function otherParticipantName(conv) {
    const other = conv.user_one_id === currentUser?.id ? conv.user_two : conv.user_one;
    if (!other) return "Unknown";
    return `${other.first_name ?? ""} ${other.last_name ?? ""}`.trim() || "Unknown";
  }

  function toggleMisleadingReason(value) {
    setMisleadingReasons((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
    clearError("misleadingReasons");
  }

  function clearError(key) {
    setErrors((prev) => { const e = { ...prev }; delete e[key]; return e; });
  }

  function handleFileChange(e) {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
    clearError("files");
    e.target.value = "";
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Validate ─────────────────────────────────────────────────────────────────

  function validate() {
    const errs = {};
    if (!issueType)                       errs.issueType    = "Please select an issue type.";
    if (description.trim().length < 20)   errs.description  = "Description must be at least 20 characters.";
    if (issueType === "account_issue" && !accountIssueSubtype)
      errs.accountIssueSubtype = "Please select a subtype.";
    return errs;
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setErrors({});

    try {
      const fd = new FormData();
      fd.append("issue_type",  issueType);
      fd.append("description", description.trim());
      fd.append("is_anonymous", String(isAnonymous));

      if (issueType === "abuse_harassment") {
        if (referencedConvId)  fd.append("referenced_conversation_id", referencedConvId);
        else if (referencedUserId) fd.append("referenced_user_id", referencedUserId);
      }
      if (issueType === "inappropriate_content") {
        if (referencedItemId)          fd.append("referenced_item_id", referencedItemId);
        if (misleadingReasons.length)  fd.append("misleading_reasons", JSON.stringify(misleadingReasons));
      }
      if (issueType === "bug" && affectedPage)
        fd.append("affected_page", affectedPage);
      if (issueType === "account_issue" && accountIssueSubtype)
        fd.append("account_issue_subtype", accountIssueSubtype);

      files.forEach((f) => fd.append("files", f));

      const res = await apiFetch("/issues/", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setErrors({ submit: data.detail || "Submission failed. Please try again." });
        return;
      }

      setTicket(data.ticket_number ?? data.issue_id);
    } catch (err) {
      setErrors({ submit: err.message || "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  const labelClass = "block text-sm font-semibold text-text-secondary mb-1.5";
  const inputClass =
    "w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors";
  const errorClass  = "mt-1 text-xs text-danger";
  const sectionClass = "flex flex-col gap-1.5";

  // ── Success state ─────────────────────────────────────────────────────────────

  if (ticket) {
    return (
      <div className="p-3 sm:p-4 md:p-6 flex-1 flex flex-col gap-6">
        <div>
          <p className="font-bold text-3xl">Report Issue</p>
          <p className="text-sm text-text-muted">LostLink support</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
          <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center text-3xl">
            ✓
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-bold text-xl">Report submitted</p>
            <p className="text-text-muted text-sm max-w-sm">
              Our team will review your report. Reference your ticket number for follow-up.
            </p>
          </div>
          <div className="px-5 py-3 rounded-xl bg-bg-raised border border-border flex flex-col items-center gap-1">
            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold">Ticket number</p>
            <p className="font-bold text-lg text-secondary font-mono">{ticket}</p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-2 px-5 py-2 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-secondary-hover transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 sm:p-4 md:p-6 flex-1 flex flex-col gap-6 max-w-2xl">

      {/* Header */}
      <div>
        <p className="font-bold text-3xl">Report Issue</p>
        <p className="text-sm text-text-muted">
          Let us know about a bug, abuse, or account problem
        </p>
      </div>

      <div className="flex flex-col gap-5">

        {/* ── 1. Issue Type ─────────────────────────────────────────────────── */}
        <div className={sectionClass}>
          <p className={labelClass}>Issue type</p>
          <div className="flex flex-wrap gap-2">
            {ISSUE_TYPES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setIssueType(value);
                  clearError("issueType");
                  // Reset conditional fields when type changes
                  setReferencedConvId("");
                  setReferencedUserId("");
                  setReferencedItemId("");
                  setMisleadingReasons([]);
                  setAffectedPage("");
                  setAccountIssueSubtype("");
                  setFiles([]);
                }}
                className={`px-4 py-2 text-sm rounded-xl border transition-all duration-150 cursor-pointer font-medium ${
                  issueType === value
                    ? "bg-secondary border-secondary text-white font-semibold"
                    : "border-border text-text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {errors.issueType && <p className={errorClass}>{errors.issueType}</p>}
        </div>

        {/* ── 2. Conditional Reference Fields ──────────────────────────────── */}

        {issueType === "abuse_harassment" && (
          <div className="flex flex-col gap-4 p-4 rounded-xl bg-bg-raised border border-border">
            <div className={sectionClass}>
              <label className={labelClass}>Reference a conversation</label>
              <select
                value={referencedConvId}
                onChange={(e) => { setReferencedConvId(e.target.value); setReferencedUserId(""); }}
                className={inputClass + " appearance-none"}
              >
                <option value="">— Select a conversation (optional) —</option>
                {conversations.map((conv) => (
                  <option key={conv.id} value={conv.id}>
                    Conversation with {otherParticipantName(conv)}
                  </option>
                ))}
              </select>
            </div>

            {!referencedConvId && (
              <div className={sectionClass}>
                <label className={labelClass}>Reference a user</label>
                <input
                  type="text"
                  placeholder="Username or user ID"
                  value={referencedUserId}
                  onChange={(e) => setReferencedUserId(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-text-muted">Shown only if no conversation is selected above</p>
              </div>
            )}
          </div>
        )}

        {issueType === "inappropriate_content" && (
          <div className="flex flex-col gap-4 p-4 rounded-xl bg-bg-raised border border-border">
            <div className={sectionClass}>
              <label className={labelClass}>Item report ID</label>
              <input
                type="text"
                placeholder="Paste the item ID"
                value={referencedItemId}
                onChange={(e) => { setReferencedItemId(e.target.value); clearError("referencedItemId"); }}
                className={inputClass}
              />
            </div>

            <div className={sectionClass}>
              <p className={labelClass}>Reason(s)</p>
              <div className="flex flex-col gap-2">
                {MISLEADING_REASONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={misleadingReasons.includes(value)}
                      onChange={() => toggleMisleadingReason(value)}
                      className="w-4 h-4 accent-secondary rounded"
                    />
                    <span className="text-sm text-text">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {issueType === "bug" && (
          <div className="p-4 rounded-xl bg-bg-raised border border-border">
            <div className={sectionClass}>
              <label className={labelClass}>Where did this happen?</label>
              <select
                value={affectedPage}
                onChange={(e) => { setAffectedPage(e.target.value); clearError("affectedPage"); }}
                className={inputClass + " appearance-none"}
              >
                <option value="">— Select a page —</option>
                {AFFECTED_PAGES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {issueType === "account_issue" && (
          <div className="p-4 rounded-xl bg-bg-raised border border-border">
            <div className={sectionClass}>
              <p className={labelClass}>What kind of account issue?</p>
              <div className="flex flex-col gap-2">
                {ACCOUNT_SUBTYPES.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="accountSubtype"
                      value={value}
                      checked={accountIssueSubtype === value}
                      onChange={() => { setAccountIssueSubtype(value); clearError("accountIssueSubtype"); }}
                      className="w-4 h-4 accent-secondary"
                    />
                    <span className="text-sm text-text">{label}</span>
                  </label>
                ))}
              </div>
              {errors.accountIssueSubtype && <p className={errorClass}>{errors.accountIssueSubtype}</p>}
            </div>
          </div>
        )}

        {/* ── 3. Description ────────────────────────────────────────────────── */}
        <div className={sectionClass}>
          <label className={labelClass}>
            Description
            <span className="font-normal text-text-muted ml-1">(min 20 characters)</span>
          </label>
          <textarea
            rows={5}
            placeholder="Describe the issue in detail…"
            value={description}
            onChange={(e) => { setDescription(e.target.value); clearError("description"); }}
            className={inputClass + " resize-none"}
          />
          <div className="flex justify-between items-center">
            {errors.description
              ? <p className={errorClass}>{errors.description}</p>
              : <span />}
            <p className={`text-xs ${description.trim().length < 20 ? "text-text-muted" : "text-success"}`}>
              {description.trim().length} / 20 min
            </p>
          </div>
        </div>

        {/* ── 4. Attachments ────────────────────────────────────────────────── */}
        {issueType && SHOW_ATTACHMENTS_FOR.has(issueType) && (
          <div className={sectionClass}>
            <p className={labelClass}>Attachments <span className="font-normal text-text-muted">(optional, up to 5)</span></p>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-1">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border bg-bg-sunken flex-shrink-0"
                  >
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-lg transition-opacity cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {files.length < 5 && (
              <>
                <button
                  onClick={() => fileInput.current?.click()}
                  className="w-full py-8 rounded-xl border-2 border-dashed border-border hover:border-secondary hover:text-secondary text-text-muted text-sm transition-colors cursor-pointer"
                >
                  + Add screenshot or image
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}
          </div>
        )}

        {/* ── 5. Anonymous toggle ───────────────────────────────────────────── */}
        <label className="flex items-start gap-3 cursor-pointer select-none p-4 rounded-xl bg-bg-raised border border-border hover:border-border-strong transition-colors">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-secondary flex-shrink-0"
          />
          <div>
            <p className="text-sm font-semibold text-text">Submit anonymously</p>
            <p className="text-xs text-text-muted mt-0.5">
              Your identity won't be shown to the reported user
            </p>
          </div>
        </label>

        {/* ── Submit error ──────────────────────────────────────────────────── */}
        {errors.submit && (
          <div className="px-4 py-3 rounded-xl bg-danger-soft border border-danger text-danger text-sm">
            {errors.submit}
          </div>
        )}

        {/* ── Submit button ─────────────────────────────────────────────────── */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-secondary hover:bg-secondary-hover text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit Report"
          )}
        </button>

      </div>
    </div>
  );
}

export default ReportIssuePage;
