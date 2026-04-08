import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./components/sidebar";

function Overview() {
  return (
    <>
      <div className="w-dvw min-h-dvh h-auto flex flex-row bg-primary-soft">
        <Sidebar />
        <div className="flex-1 max-h-dvh">
          <div className="h-full overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
}

export default Overview;
