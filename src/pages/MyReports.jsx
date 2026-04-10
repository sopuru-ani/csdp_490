import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/sidebar";
import ReportCard from "@/components/ReportCard";
import ItemDetailModal from "@/components/ItemDetailModal";
import { set } from "date-fns";
import { apiFetch } from "@/lib/api";

function MyReports() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState("all"); // all | lost | found

  async function fetchItems() {
    try {
      const res = await apiFetch("/items/mine");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const authRes = await apiFetch("/auth/userchecker");
        if (!authRes.ok) {
          navigate("/login");
          return;
        }
        const data = await authRes.json();
        setUser(data);
      } catch {
        navigate("/login");
        return;
      }
      await fetchItems();
    }
    init();
  }, []);

  const filtered = items.filter((item) => {
    if (filter === "all") return true;
    return item.item_type === filter;
  });

  const filterBtnClass = (f) =>
    `px-4 py-2 text-sm rounded-xl cursor-pointer transition-all duration-200 ${
      filter === f
        ? "bg-secondary text-white font-semibold shadow-sm"
        : "text-text-muted hover:bg-primary-muted"
    }`;

  return (
    <>
      {/* <Sidebar /> */}
      <div className="p-3 sm:p-4 md:p-6 flex-1 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-bold text-3xl">My Reports</p>
            <p className="text-sm text-text-muted">
              All items you've reported — click any to view or edit
            </p>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => navigate("/reportlost")}
              className="text-sm px-4 py-2 rounded-xl bg-danger text-white hover:bg-danger-hover cursor-pointer transition-all duration-200 shadow-sm font-bold"
            >
              Report Lost
            </button>
            <button
              onClick={() => navigate("/reportfound")}
              className="text-sm px-4 py-2 rounded-xl bg-success text-white hover:bg-success-hover cursor-pointer transition-all duration-200 shadow-sm font-bold"
            >
              Report Found
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={filterBtnClass("all")}
            onClick={() => setFilter("all")}
          >
            All ({items.length})
          </button>
          <button
            className={filterBtnClass("lost")}
            onClick={() => setFilter("lost")}
          >
            Lost ({items.filter((i) => i.item_type === "lost").length})
          </button>
          <button
            className={filterBtnClass("found")}
            onClick={() => setFilter("found")}
          >
            Found ({items.filter((i) => i.item_type === "found").length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-4xl">📋</p>
            <p className="font-semibold">No reports yet</p>
            <p className="text-sm text-text-muted">
              {filter === "all"
                ? "You haven't submitted any reports yet."
                : `You have no ${filter} item reports.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <ReportCard
                key={item.id}
                item={item}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reuse existing modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          currentUserId={user?.id}
          isAdmin={user?.is_admin}
          onClose={() => setSelectedItem(null)}
          onUpdated={() => {
            setSelectedItem(null);
            fetchItems();
          }}
          onDeleted={() => {
            setItems((prev) => prev.filter((i) => i.id !== selectedItem.id));
            setSelectedItem(null);
          }}
        />
      )}
    </>
  );
}

export default MyReports;
