import React, { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar";
import ItemCard from "@/components/ItemCard";
import ItemDetailModal from "@/components/ItemDetailModal";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("my");

  // My Reports state
  const [items, setItems] = useState([]);
  const [myMatches, setMyMatches] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  // Admin state
  const [allItems, setAllItems] = useState([]);
  const [allItemsLoading, setAllItemsLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [reportsCount, setReportsCount] = useState(0);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await apiFetch("/auth/userchecker");
        if (!res.ok) {
          navigate("/login");
          return;
        }
        const data = await res.json();
        setUser(data);
        fetchMyItems();
        fetchMyMatches();
        if (data.is_admin) {
          fetchAllItems();
          fetchPendingCount();
          fetchReportsCount();
        } else {
          setAllItemsLoading(false);
        }
      } catch {
        navigate("/login");
        return;
      }
      setLoading(false);
    }
    checkAuth();
  }, []);

  async function fetchMyItems() {
    try {
      const res = await apiFetch("/items/mine");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setItemsLoading(false);
    }
  }

  async function fetchMyMatches() {
    try {
      const res = await apiFetch("/items/my-matches");
      if (res.ok) {
        const data = await res.json();
        setMyMatches(data.matches);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchAllItems() {
    try {
      const res = await apiFetch("/items/all");
      if (res.ok) {
        const data = await res.json();
        setAllItems(data.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAllItemsLoading(false);
    }
  }

  async function fetchReportsCount() {
    try {
      const res = await apiFetch("/admin/reports");
      if (res.ok) {
        const data = await res.json();
        setReportsCount(data.reports.length);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchPendingCount() {
    try {
      const res = await apiFetch("/admin/matches");
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.matches.length);
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="w-full min-h-dvh flex items-center justify-center bg-primary-soft">
        <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
      </div>
    );
  }

  const lostItems = items.filter((i) => i.item_type === "lost");
  const foundItems = items.filter((i) => i.item_type === "found");
  const allLost = allItems.filter((i) => i.item_type === "lost");
  const allFound = allItems.filter((i) => i.item_type === "found");

  const tabClass = (t) =>
    `px-4 py-2.5 text-sm font-semibold rounded-xl cursor-pointer transition-all duration-200 ${
      tab === t
        ? "bg-secondary text-white shadow-sm"
        : "text-text-muted hover:bg-primary-muted"
    }`;

  return (
    <>
      {/* <Sidebar /> */}
      {/* <div className="h-dvh flex-1 overflow-y-scroll"> */}
      <div className="w-full p-3 sm:p-4 md:p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="font-bold text-2xl md:text-3xl">
            Welcome back, {user.first_name}!
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {user.is_admin && (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-secondary text-white shadow-sm">
                Admin
              </span>
            )}
          </div>
        </div>

        {/* Tabs — only show if admin */}
        {user.is_admin && (
          <div className="flex flex-wrap items-center gap-2">
            <button className={tabClass("my")} onClick={() => setTab("my")}>
              My Reports
            </button>
            <button
              className={`${tabClass("admin")} flex flex-row gap-2 items-center`}
              onClick={() => setTab("admin")}
            >
              Admin View
              {pendingCount > 0 && (
                <span
                  className={`text-xs bg-warning text-white font-bold w-5 h-5 flex items-center justify-center rounded-full ${tab === "admin" ? "text-secondary! bg-white" : ""}`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── MY REPORTS TAB ── */}
        {tab === "my" && (
          <>
            {/* Quick Actions */}
            <div className="flex flex-col gap-4">
              <p className="font-bold text-2xl">Quick Actions</p>
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className="flex flex-col border-dashed border-2 border-secondary-muted rounded-2xl min-h-32 bg-secondary-soft hover:bg-secondary-muted cursor-pointer justify-center items-center shadow-md transition-all duration-200 hover:shadow-lg text-center px-4 py-6"
                  onClick={() => navigate("/reportlost")}
                >
                  <p className="text-sm font-semibold">Report Lost Item</p>
                  <p className="text-xs text-text-muted mt-1">
                    Quick report with key details
                  </p>
                </div>
                <div
                  className="flex flex-col border-dashed border-2 border-secondary-muted rounded-2xl min-h-32 bg-secondary-soft hover:bg-secondary-muted cursor-pointer justify-center items-center shadow-md transition-all duration-200 hover:shadow-lg text-center px-4 py-6"
                  onClick={() => navigate("/reportfound")}
                >
                  <p className="text-sm font-semibold">Report Found Item</p>
                  <p className="text-xs text-text-muted mt-1">
                    Help return an item quickly
                  </p>
                </div>
              </div>
            </div>

            {/* My Reports */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="font-bold text-2xl">My Reports</p>
                <button
                  onClick={() => navigate("/my-reports")}
                  className="text-xs text-secondary hover:underline cursor-pointer transition-colors"
                >
                  View all →
                </button>
              </div>

              {itemsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-6 h-6 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-text-muted">
                  You haven't submitted any reports yet.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Show latest 3 only — link to full list */}
                  {items.slice(0, 3).map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onClick={() => setSelectedItem(item)}
                      pendingMatch={myMatches.some(
                        (m) =>
                          m.source_item_id === item.id &&
                          m.status === "pending",
                      )}
                    />
                  ))}
                  {items.length > 3 && (
                    <button
                      onClick={() => navigate("/my-reports")}
                      className="text-xs text-secondary hover:underline cursor-pointer text-center py-1 transition-colors"
                    >
                      +{items.length - 3} more — view all reports
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ADMIN TAB ── */}
        {tab === "admin" && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total open items"
                value={allItems.length}
                sub={`${allLost.length} lost · ${allFound.length} found`}
                color="bg-secondary-soft"
              />
              <StatCard
                label="Pending matches"
                value={pendingCount}
                sub="awaiting your review"
                color={pendingCount > 0 ? "bg-warning-soft" : "bg-primary-soft"}
                onClick={() => navigate("/admin/matches")}
                clickable
              />
              <StatCard
                label="Audit logs"
                value="View"
                sub="full action history"
                color="bg-primary-soft"
                onClick={() => navigate("/admin/audit-logs")}
                clickable
              />
              <StatCard
                label="Abuse reports"
                value={reportsCount}
                sub="pending review"
                color={reportsCount > 0 ? "bg-danger-soft" : "bg-primary-soft"}
                onClick={() => navigate("/admin/reports")}
                clickable
              />
            </div>

            {/* Admin quick actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate("/admin/matches")}
                className="flex-1 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-sm font-semibold cursor-pointer transition-all duration-200 shadow-sm"
              >
                Pending Matches {pendingCount > 0 && `(${pendingCount})`}
              </button>
              <button
                onClick={() => navigate("/admin/audit-logs")}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 hover:bg-primary-muted text-sm font-semibold cursor-pointer transition-all duration-200"
              >
                Audit Logs
              </button>
            </div>

            {/* All items */}
            <div className="flex flex-col gap-3">
              <p className="font-bold text-2xl">All Open Reports</p>

              {allItemsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-6 h-6 animate-spin" />
                </div>
              ) : allItems.length === 0 ? (
                <p className="text-sm text-text-muted">No open reports.</p>
              ) : (
                <>
                  {/* Lost */}
                  {allLost.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <p className="font-semibold text-sm text-danger">
                        Lost ({allLost.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {allLost.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            onClick={() => setSelectedItem(item)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Found */}
                  {allFound.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <p className="font-semibold text-sm text-success">
                        Found ({allFound.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {allFound.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            onClick={() => setSelectedItem(item)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          currentUserId={user.id}
          isAdmin={user.is_admin}
          onClose={() => setSelectedItem(null)}
          onUpdated={() => {
            setSelectedItem(null);
            fetchMyItems();
            if (user.is_admin) fetchAllItems();
          }}
          onDeleted={() => {
            setItems((prev) => prev.filter((i) => i.id !== selectedItem.id));
            setAllItems((prev) => prev.filter((i) => i.id !== selectedItem.id));
            setSelectedItem(null);
          }}
        />
      )}
      {/* </div> */}
    </>
  );
}

function StatCard({ label, value, sub, color, onClick, clickable }) {
  return (
    <div
      onClick={onClick}
      className={`${color} rounded-2xl p-4 flex flex-col gap-1 border border-gray-200 shadow-md transition-all duration-200 ${
        clickable ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : ""
      }`}
    >
      <p className="text-xs text-text-muted font-semibold">{label}</p>
      <p className="font-bold text-2xl">{value}</p>
      <p className="text-xs text-text-muted">{sub}</p>
    </div>
  );
}

export default Dashboard;
