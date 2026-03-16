import React from "react";
import Sidebar from "@/components/sidebar";

import { useNavigate } from "react-router-dom";
function Dashboard() {
  const navigate = useNavigate();
  return (
    <>
      <div className="w-dvw min-h-dvh h-auto flex flex-row bg-primary-soft">
        <Sidebar />
        <div className="p-3 flex-1 flex flex-col gap-4">
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
        </div>
      </div>
    </>
  );
}

export default Dashboard;
