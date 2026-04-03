import React, { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar";
import ItemCard from "@/components/ItemCard";
import ItemDetailModal from "@/components/ItemDetailModal";
import { useNavigate } from "react-router-dom";
import { set } from "date-fns";
import { apiFetch } from "@/lib/api";

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const [myMatches, setMyMatches] = useState([]);

  // For item detail modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [allItemsLoading, setAllItemsLoading] = useState(true);

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

        if (data.is_admin) {
          fetchAllItems();
        } else {
          setAllItemsLoading(false);
        }
      } catch (err) {
        navigate("/login");
        return;
      }

      setLoading(false);
    }

    async function fetchMyItems() {
      try {
        const res = await apiFetch("/items/mine");
        if (res.ok) {
          const data = await res.json();
          setItems(data.items);
        }
      } catch (err) {
        console.error("Failed to fetch items:", err);
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
        console.error("Failed to fetch matches:", err);
      }
    }

    checkAuth();
    fetchMyItems();
    fetchMyMatches();
  }, []);

  async function fetchAllItems() {
    try {
      const res = await apiFetch("/items/all");
      if (res.ok) {
        const data = await res.json();
        setAllItems(data.items);
      }
    } catch (err) {
      console.error("Failed to fetch all items:", err);
    } finally {
      setAllItemsLoading(false);
    }
  }

  // fetchAllItems will be called after we know if user is admin or not,
  // when user clicks "View All Reports" in Admin Panel

  async function handleLogout() {
    await apiFetch("/auth/logout", {
      method: "POST",
    });
    navigate("/login");
  }

  if (loading) {
    return (
      <div className="w-dvw min-h-dvh flex items-center justify-center bg-primary-soft">
        <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
      </div>
    );
  }

  const lostItems = items.filter((i) => i.item_type === "lost");
  const foundItems = items.filter((i) => i.item_type === "found");

  return (
    <div className="w-dvw min-h-dvh h-auto flex flex-row bg-primary-soft">
      <Sidebar />
      <div className="p-3 flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="font-bold text-2xl">Welcome back, {user.first_name}!</p>
          <div className="flex items-center gap-2">
            {user.is_admin && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary text-white">
                Admin
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-danger-soft hover:border-danger hover:text-danger transition-colors cursor-pointer"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col gap-4">
          <p className="font-bold text-2xl">Quick Actions</p>
          <div className="w-full flex flex-row gap-10">
            <div
              className="flex-1 flex border-dashed border-2 rounded-sm h-40 bg-secondary-soft hover:bg-secondary-muted cursor-pointer justify-center items-center"
              onClick={() => navigate("/reportlost")}
            >
              <p>Report Lost Item</p>
            </div>
            <div
              className="flex-1 flex border-dashed border-2 rounded-sm h-40 bg-secondary-soft hover:bg-secondary-muted cursor-pointer justify-center items-center"
              onClick={() => navigate("/reportfound")}
            >
              <p>Report Found Item</p>
            </div>
          </div>
        </div>

        {/* My Reports */}
        <div className="flex flex-col gap-4">
          <p className="font-bold text-2xl">My Reports</p>

          {itemsLoading ? (
            <div className="flex justify-center py-6">
              <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-6 h-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-text-muted">
              You haven't submitted any reports yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Lost Items */}
              {lostItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold text-danger">
                    Lost Items ({lostItems.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {lostItems.map((item) => (
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
                  </div>
                </div>
              )}

              {/* Found Items */}
              {foundItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold text-success">
                    Found Items ({foundItems.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {foundItems.map((item) => (
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
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Admin Panel */}
        {user.is_admin && (
          <div className="flex flex-col gap-4">
            <p className="font-bold text-2xl">Admin Panel — All Reports</p>
            {/* For admins, show a big button linking to the pending matches page
          if there are any pending matches, otherwise show all reports as
          usual. This is because the main thing admins need to do is review
          matches, so we want to direct them there if there are pending reviews. */}
            <div
              className="flex flex-row items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-secondary hover:shadow-sm transition-all w-max"
              onClick={() => navigate("/admin/matches")}
            >
              <p>Pending Matches</p>
            </div>
            {allItemsLoading ? (
              <div className="flex justify-center py-6">
                <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-6 h-6 animate-spin" />
              </div>
            ) : allItems.length === 0 ? (
              <p className="text-sm text-text-muted">
                No reports submitted yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {allItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedItem(item)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
}

export default Dashboard;
