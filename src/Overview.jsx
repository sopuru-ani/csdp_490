import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./components/sidebar";

import { PanelLeft } from "lucide-react";

function Overview() {
  const [user, setUser] = useState(null); // Placeholder user data
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");

    const handleChange = (e) => {
      setCollapsed(e.matches); // true if <=768px
    };

    // set initial value
    setCollapsed(mediaQuery.matches);

    // listen for changes
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);
  return (
    <>
      <div className="w-dvw min-h-dvh h-auto flex flex-row bg-primary-soft">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="flex-1 max-h-dvh flex flex-col">
          <div className="w-dvw md:w-full p-2 md:hidden shadow-sm flex flex-row items-center justify-between">
            <div className="flex flex-row items-center">
              <button
                onClick={() => setCollapsed((prev) => !prev)}
                className="p-2 hover:bg-primary-muted rounded-lg shrink-0 transition-all duration-200"
              >
                <PanelLeft
                  className={`w-5 h-5 transition-transform duration-300 ${
                    collapsed ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>
              <p className="text-md font-bold">Lost Link</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary-muted flex items-center justify-center text-sm font-bold shadow-sm">
              {user?.first_name[0] || "N"}
              {user?.last_name[0] || "A"}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
}

export default Overview;
