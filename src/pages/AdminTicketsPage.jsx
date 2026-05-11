import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  bug:                   { label: "Bug",              color: "bg-info-soft text-info" },
  abuse_harassment:      { label: "Abuse",            color: "bg-danger-soft text-danger" },
  inappropriate_content: { label: "Inappropriate",    color: "bg-warning-soft text-warning" },
  account_issue:         { label: "Account Issue",    color: "bg-purple-500/10 text-purple-400" },
  other:                 { label: "Other",            color: "bg-bg-sunken text-text-muted" },
};

const STATUS_CONFIG = {
  open:         { label: "Open",         color: "bg-warning-soft text-warning" },
  under_review: { label: "Under Review", color: "bg-info-soft text-info" },
  resolved:     { label: "Resolved",     color: "bg-success-soft text-success" },
  dismissed:    { label: "Dismissed",    color: "bg-bg-sunken text-text-muted" },
};

const TYPE_FILTER_OPTIONS = [
  { value: "all",                   label: "All Types" },
  { value: "bug",                   label: "Bug" },
  { value: "abuse_harassment",      label: "Abuse & Harassment" },
  { value: "inappropriate_content", label: "Inappropriate Content" },
  { value: "account_issue",         label: "Account Issue" },
  { value: "other",                 label: "Other" },
];

const MISLEADING_LABELS = {
  false_description:   "False description",
  fake_images:         "Fake/stolen images",
  misleading_location: "Misleading location",
  spam:                "Spam",
};

const ACCOUNT_SUBTYPE_LABELS = {
  cant_login:  "Can't log in",
  wrong_info:  "Wrong account info",
  compromised: "Account compromised",
  other:       "Other",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const { label, color } = TYPE_CONFIG[type] ?? { label: type, color: "bg-bg-sunken text-text-muted" };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
  );
}

function StatusBadge({ status }) {
  const { label, color } = STATUS_CONFIG[status] ?? { label: status, color: "bg-bg-sunken text-text-muted" };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
  );
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Main component ────────────────────────────────────────────────────────────

function AdminTicketsPage() {
  const navigate = useNavigate();

  const [tickets,     setTickets]     = useState([]);
  const [counts,      setCounts]      = useState({ open: 0, under_review: 0, resolved: 0, dismissed: 0 });
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter,   setTypeFilter]   = useState("all");

  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [detail,        setDetail]        = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editStatus, setEditStatus] = useState("");
  const [editNotes,  setEditNotes]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState(null);

  const [lightboxUrl, setLightboxUrl] = useState(null);

  // ── Auth + initial fetch ───────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const res = await apiFetch("/auth/userchecker");
        if (!res.ok) { navigate("/login"); return; }
        const user = await res.json();
        if (!user.is_admin) { navigate("/dashboard"); return; }
      } catch {
        navigate("/login");
        return;
      }
      await fetchTickets();
    }
    init();
  }, []);

  async function fetchTickets() {
    setFetchError(null);
    try {
      const res = await apiFetch("/admin/tickets");
      if (!res.ok) throw new Error("Failed to load tickets");
      const data = await res.json();
      setTickets(data.tickets || []);
      setCounts(data.counts || { open: 0, under_review: 0, resolved: 0, dismissed: 0 });
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Row click → load detail ────────────────────────────────────────────────

  async function openTicket(ticketId) {
    setDrawerOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/admin/tickets/${ticketId}`);
      if (!res.ok) throw new Error("Failed to load ticket");
      const data = await res.json();
      setDetail(data.ticket);
      setEditStatus(data.ticket.status ?? "open");
      setEditNotes(data.ticket.admin_notes ?? "");
    } catch (err) {
      setDetail(null);
      setSaveError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDetail(null);
    setSaveError(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/admin/tickets/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, admin_notes: editNotes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Save failed");
      }
      // Refresh list and re-fetch detail
      await fetchTickets();
      const detailRes = await apiFetch(`/admin/tickets/${detail.id}`);
      if (detailRes.ok) {
        const d = await detailRes.json();
        setDetail(d.ticket);
        setEditStatus(d.ticket.status ?? "open");
        setEditNotes(d.ticket.admin_notes ?? "");
      }
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Client-side filtering ─────────────────────────────────────────────────

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (typeFilter   !== "all" && t.issue_type !== typeFilter) return false;
    return true;
  });

  // ── Status filter pill style ──────────────────────────────────────────────

  const pillClass = (val) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
      statusFilter === val
        ? "bg-secondary text-white"
        : "bg-bg-sunken text-text-muted hover:text-text"
    }`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="p-3 sm:p-4 md:p-6 flex-1 flex flex-col gap-5 min-w-0">

        {/* Header */}
        <div>
          <p className="font-bold text-3xl">Support Tickets</p>
          <p className="text-sm text-text-muted">Review and respond to user-submitted issue reports</p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "open",         label: "Open",         accent: "text-warning border-warning/30" },
            { key: "under_review", label: "Under Review", accent: "text-info border-info/30" },
            { key: "resolved",     label: "Resolved",     accent: "text-success border-success/30" },
            { key: "dismissed",    label: "Dismissed",    accent: "text-text-muted border-border" },
          ].map(({ key, label, accent }) => (
            <div
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              className={`bg-bg-raised rounded-xl border p-4 cursor-pointer transition-colors hover:border-border-strong ${accent}`}
            >
              <p className="text-2xl font-bold">{counts[key] ?? 0}</p>
              <p className="text-xs font-semibold mt-0.5 opacity-80">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            <button className={pillClass("all")}     onClick={() => setStatusFilter("all")}>All</button>
            <button className={pillClass("open")}    onClick={() => setStatusFilter("open")}>Open</button>
            <button className={pillClass("under_review")} onClick={() => setStatusFilter("under_review")}>Under Review</button>
            <button className={pillClass("resolved")}    onClick={() => setStatusFilter("resolved")}>Resolved</button>
            <button className={pillClass("dismissed")}   onClick={() => setStatusFilter("dismissed")}>Dismissed</button>
          </div>

          {/* Type dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="ml-auto px-3 py-1.5 text-xs rounded-xl bg-bg-sunken border border-border text-text focus:outline-none focus:border-border-focus cursor-pointer"
          >
            {TYPE_FILTER_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {fetchError && (
          <div className="px-4 py-3 rounded-xl bg-danger-soft border border-danger text-danger text-sm">
            {fetchError}
          </div>
        )}

        {/* Ticket table */}
        <div className="bg-bg-raised rounded-xl border border-border overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_140px_100px_110px_60px] gap-3 px-4 py-2.5 border-b border-border bg-bg-sunken">
            {["Ticket #", "Type", "Reporter", "Submitted", "Status", "Files"].map((h) => (
              <p key={h} className="text-xs font-semibold text-text-muted uppercase tracking-wider">{h}</p>
            ))}
          </div>

          {loading ? (
            // Skeleton rows
            <div className="flex flex-col divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 animate-pulse flex gap-4">
                  <div className="h-3.5 bg-bg-sunken rounded w-20" />
                  <div className="h-3.5 bg-bg-sunken rounded w-16" />
                  <div className="h-3.5 bg-bg-sunken rounded w-28" />
                  <div className="h-3.5 bg-bg-sunken rounded w-20" />
                  <div className="h-3.5 bg-bg-sunken rounded w-20" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <p className="text-3xl">🎫</p>
              <p className="font-semibold text-sm">No tickets found</p>
              <p className="text-xs text-text-muted">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {filtered.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onClick={() => openTicket(t.id)}
                />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 transition-opacity"
          onClick={closeDrawer}
        />
      )}

      {/* Detail drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-lg bg-bg-raised border-l border-border z-30 flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {drawerOpen && (
          <DrawerContent
            detail={detail}
            loading={detailLoading}
            editStatus={editStatus}
            editNotes={editNotes}
            saving={saving}
            saveError={saveError}
            onStatusChange={setEditStatus}
            onNotesChange={setEditNotes}
            onSave={handleSave}
            onClose={closeDrawer}
            onImageClick={setLightboxUrl}
          />
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Attachment"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-2xl w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

// ── Ticket row ────────────────────────────────────────────────────────────────

function TicketRow({ ticket, onClick }) {
  const reporterName = ticket.is_anonymous
    ? null
    : `${ticket.reporter?.first_name ?? ""} ${ticket.reporter?.last_name ?? ""}`.trim();

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_100px_110px_60px] gap-2 sm:gap-3 px-4 py-3 hover:bg-bg-sunken cursor-pointer transition-colors"
    >
      {/* Ticket # */}
      <p className="font-mono text-sm font-semibold text-secondary">
        #{ticket.ticket_number ?? ticket.id.slice(0, 8).toUpperCase()}
      </p>

      {/* Type badge */}
      <div className="flex items-center">
        <TypeBadge type={ticket.issue_type} />
      </div>

      {/* Reporter */}
      <div className="flex items-center gap-1.5 min-w-0">
        {ticket.is_anonymous ? (
          <span
            className="text-sm text-text-muted italic truncate"
            title="Identity visible to admins only"
          >
            Anonymous*
          </span>
        ) : (
          <span className="text-sm truncate">{reporterName || "—"}</span>
        )}
      </div>

      {/* Submitted date */}
      <p className="text-xs text-text-muted flex items-center">{fmt(ticket.created_at)}</p>

      {/* Status badge */}
      <div className="flex items-center">
        <StatusBadge status={ticket.status} />
      </div>

      {/* Attachment count */}
      <div className="flex items-center gap-1 text-xs text-text-muted">
        {ticket.attachment_count > 0 && (
          <>
            <span>📎</span>
            <span>{ticket.attachment_count}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Drawer content ────────────────────────────────────────────────────────────

function DrawerContent({
  detail, loading, editStatus, editNotes, saving, saveError,
  onStatusChange, onNotesChange, onSave, onClose, onImageClick,
}) {
  const inputClass =
    "w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border text-sm text-text focus:outline-none focus:border-border-focus transition-colors";

  if (loading) {
    return (
      <div className="flex-1 flex flex-col gap-5 p-5 overflow-y-auto animate-pulse">
        <div className="h-5 bg-bg-sunken rounded w-40" />
        <div className="h-4 bg-bg-sunken rounded w-full" />
        <div className="h-4 bg-bg-sunken rounded w-3/4" />
        <div className="h-20 bg-bg-sunken rounded w-full" />
        <div className="h-4 bg-bg-sunken rounded w-1/2" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-danger">{saveError || "Ticket not found"}</p>
      </div>
    );
  }

  const isAnonymous = detail.is_anonymous;
  const reporter    = detail.reporter;
  const resolver    = detail.resolver;

  return (
    <>
      {/* Drawer header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <p className="font-mono font-bold text-secondary text-sm">
            #{detail.ticket_number ?? detail.id.slice(0, 8).toUpperCase()}
          </p>
          <StatusBadge status={detail.status} />
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-sunken text-text-muted hover:text-text transition-colors cursor-pointer text-lg"
        >
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-5 p-5">

        {/* Reporter */}
        <section className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Reporter</p>
          {reporter ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {reporter.first_name?.[0]}{reporter.last_name?.[0]}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {reporter.first_name} {reporter.last_name}
                  {isAnonymous && (
                    <span className="ml-1.5 text-xs text-text-muted font-normal">(submitted anonymously)</span>
                  )}
                </p>
                <p className="text-xs text-text-muted">{reporter.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">Anonymous</p>
          )}
        </section>

        {/* Type + submitted */}
        <section className="flex gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Type</p>
            <TypeBadge type={detail.issue_type} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Submitted</p>
            <p className="text-sm">{fmt(detail.created_at)}</p>
          </div>
        </section>

        {/* Conditional reference fields */}
        {detail.issue_type === "abuse_harassment" && (
          <section className="flex flex-col gap-2 p-3 rounded-xl bg-bg-sunken border border-border">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Reference</p>
            {detail.referenced_conversation_id && (
              <p className="text-sm">
                <span className="text-text-muted">Conversation: </span>
                <span className="font-mono text-xs text-info">{detail.referenced_conversation_id}</span>
              </p>
            )}
            {detail.referenced_user && (
              <div>
                <p className="text-xs text-text-muted">Reported user</p>
                <p className="text-sm font-semibold">
                  {detail.referenced_user.first_name} {detail.referenced_user.last_name}
                </p>
                <p className="text-xs text-text-muted">{detail.referenced_user.email}</p>
              </div>
            )}
            {!detail.referenced_conversation_id && !detail.referenced_user && (
              <p className="text-xs text-text-muted italic">No reference provided</p>
            )}
          </section>
        )}

        {detail.issue_type === "inappropriate_content" && (
          <section className="flex flex-col gap-2 p-3 rounded-xl bg-bg-sunken border border-border">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Reference</p>
            {detail.referenced_item ? (
              <p className="text-sm">
                <span className="text-text-muted">Item: </span>
                <span className="font-semibold">{detail.referenced_item.item_name}</span>
                <span className="ml-1.5 text-xs text-text-muted capitalize">({detail.referenced_item.item_type})</span>
                {detail.referenced_item_id && (
                  <span className="ml-1.5 font-mono text-xs text-text-muted">{detail.referenced_item_id}</span>
                )}
              </p>
            ) : detail.referenced_item_id ? (
              <p className="font-mono text-xs text-text-muted">{detail.referenced_item_id}</p>
            ) : null}
            {detail.misleading_reasons?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {detail.misleading_reasons.map((r) => (
                  <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-warning-soft text-warning font-medium">
                    {MISLEADING_LABELS[r] ?? r}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {detail.issue_type === "bug" && detail.affected_page && (
          <section className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Affected Page</p>
            <p className="text-sm">{detail.affected_page}</p>
          </section>
        )}

        {detail.issue_type === "account_issue" && detail.account_issue_subtype && (
          <section className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Account Issue</p>
            <p className="text-sm">{ACCOUNT_SUBTYPE_LABELS[detail.account_issue_subtype] ?? detail.account_issue_subtype}</p>
          </section>
        )}

        {/* Description */}
        <section className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Description</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{detail.description}</p>
        </section>

        {/* Attachments */}
        {detail.attachments?.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Attachments ({detail.attachments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {detail.attachments.map((att) =>
                att.signed_url ? (
                  <button
                    key={att.id}
                    onClick={() => onImageClick(att.signed_url)}
                    className="w-20 h-20 rounded-lg overflow-hidden border border-border hover:border-border-strong transition-colors cursor-pointer flex-shrink-0"
                  >
                    <img
                      src={att.signed_url}
                      alt="Attachment"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <div key={att.id} className="w-20 h-20 rounded-lg border border-border bg-bg-sunken flex items-center justify-center text-xs text-text-muted">
                    N/A
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* Resolved info */}
        {(detail.status === "resolved" || detail.status === "dismissed") && detail.resolved_at && (
          <section className="px-3 py-2.5 rounded-xl bg-success-soft border border-success/20 flex flex-col gap-0.5">
            <p className="text-xs font-semibold text-success capitalize">{detail.status}</p>
            <p className="text-xs text-text-muted">
              {fmt(detail.resolved_at)}
              {resolver && (
                <> by {resolver.first_name} {resolver.last_name}</>
              )}
            </p>
          </section>
        )}

        {/* Admin Notes */}
        <section className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Admin Notes
          </label>
          <textarea
            rows={4}
            placeholder="Internal notes (visible to admins only)…"
            value={editNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            className={inputClass + " resize-none"}
          />
        </section>

        {/* Status select */}
        <section className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Status</label>
          <select
            value={editStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className={inputClass + " appearance-none cursor-pointer"}
          >
            <option value="open">Open</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </section>

        {saveError && (
          <p className="text-xs text-danger">{saveError}</p>
        )}

      </div>

      {/* Drawer footer */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-border">
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-secondary hover:bg-secondary-hover text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving…
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </>
  );
}

export default AdminTicketsPage;
