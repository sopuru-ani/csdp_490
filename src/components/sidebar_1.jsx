import React, { useState } from "react";
import { Sidebar as Sb, MessageCircle } from "lucide-react";

function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const labelClass = `block overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-in-out ${
    isCollapsed
      ? "max-w-0 opacity-0 translate-x-0"
      : "max-w-[12rem] opacity-100 translate-x-0"
  }`;
  const rowClass = `hover:bg-primary-muted rounded-sm p-2 flex flex-row items-center ${
    isCollapsed ? "gap-0" : "gap-2"
  }`;
  const headerRowClass = `flex flex-row items-center justify-between ${isCollapsed ? "gap-0" : "gap-1"}`;

  return (
    <>
      <div
        className={`h-dvh ${isCollapsed ? "w-fit" : "w-60"} border-r border-r-gray flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out`}
        onClick={() => setIsCollapsed((prev) => !prev)}
      >
        <div className="flex-1 flex flex-col p-2">
          <div className={headerRowClass}>
            <p className={labelClass}>Lost Link</p>
            <div className="p-2 hover:bg-primary-muted rounded-sm">
              <Sb className="w-5 h-5" />
            </div>
          </div>
          <div className={rowClass}>
            <MessageCircle className="w-5 h-5" />
            <p className={labelClass}>Messages</p>
          </div>
          <div className={rowClass}>
            <MessageCircle className="w-5 h-5" />
            <p className={labelClass}>Messages</p>
          </div>
        </div>
        <div className="px-2 py-4 border-t border-t-gray">
          <p
            className={`block overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-in-out ${
              isCollapsed
                ? "max-w-0 opacity-0 translate-x-0"
                : "max-w-56 opacity-100 translate-x-0"
            }`}
          >
            Sopuru Ani: Admin
          </p>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
