import React from "react";
import { Sidebar as Sb, MessageCircle } from "lucide-react";

function Sidebar() {
  return (
    <>
      <div className="h-dvh w-60 border-r border-r-gray flex flex-col">
        <div className="flex-1 flex flex-col p-2">
          <div className="flex flex-row gap-1 items-center justify-between">
            <p>Lost Link</p>
            <div className="p-2 hover:bg-primary-muted rounded-sm">
              <Sb className="w-5 h-5" />
            </div>
          </div>
          <div className="hover:bg-primary-muted rounded-sm p-2 flex flex-row gap-2 items-center">
            <MessageCircle className="w-5 h-5" />
            <p>Messages</p>
          </div>
          <div className="hover:bg-primary-muted rounded-sm p-2 flex flex-row gap-2 items-center">
            <MessageCircle className="w-5 h-5" />
            <p>Messages</p>
          </div>
        </div>
        <div className="px-2 py-4 border-t border-t-gray">
          <p>Sopuru Ani: Admin</p>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
