import React, { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function handleLogout() {
    await fetch("http://localhost:8000/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/login");
  }

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("http://localhost:8000/auth/userchecker", {
          credentials: "include",
        });

        if (!res.ok) {
          //Not authenticated, redirect to login
          navigate("/login");
          return;
        }
        const data = await res.json();
        setUser(data);
      } catch (err) {
        console.error("Error checking auth:", err);
        navigate("/login");
        return;
      }

      setLoading(false); //only reaches here if we actually have a user, otherwise we would have redirected already
    }

    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="w-dvw min-h-dvh flex items-center justify-center bg-primary-soft">
        <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="w-dvw min-h-dvh h-auto flex flex-row bg-primary-soft">
        <Sidebar />
        <div className="p-3 flex-1 flex flex-col gap-4">
          {/* Welcome header — shows their name */}
          <div className="flex items-center justify-between">
            <p className="font-bold text-2xl">
              Welcome back, {user.first_name}!
            </p>
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

          {/* Quick Actions - Available to Everyone */}
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

          {/* My Reports — available to everyone */}
          <div className="flex flex-col gap-4">
            <p className="font-bold text-2xl">My Reports List</p>
            <div className="w-full flex flex-row gap-10">
              <div className="flex-1 flex border-dashed border-2 rounded-sm h-40 bg-secondary-soft hover:bg-secondary-muted cursor-pointer justify-center items-center">
                <p>Report Lost Item</p>
              </div>
              <div className="flex-1 flex border-dashed border-2 rounded-sm h-40 bg-secondary-soft hover:bg-secondary-muted cursor-pointer justify-center items-center">
                <p>Report Found Item</p>
              </div>
            </div>
          </div>

          {/* Admin Panel — only visible to admins */}
          {user.is_admin && (
            <div className="flex flex-col gap-4">
              <p className="font-bold text-2xl">Admin Panel</p>
              <div className="w-full flex flex-row gap-10">
                <div className="flex-1 flex border-dashed border-2 rounded-sm h-40 bg-danger-soft hover:bg-danger-muted cursor-pointer justify-center items-center">
                  <p>View All Reports</p>
                </div>
                <div className="flex-1 flex border-dashed border-2 rounded-sm h-40 bg-danger-soft hover:bg-danger-muted cursor-pointer justify-center items-center">
                  <p>Manage Users</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Dashboard;
