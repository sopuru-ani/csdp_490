import React, { useState } from "react";
import {
  PanelLeft,
  MessageCircle,
  Home,
  Clipboard,
  Bell,
  Settings,
  CircleQuestionMark,
  Megaphone,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState(null); // Placeholder user data

  return (
    <div
      className={`h-dvh border-r border-gray flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      {/* Header */}
      <div className="flex flex-row items-center justify-between p-2 shrink-0">
        <p
          className={`font-semibold text-lg whitespace-nowrap overflow-hidden transition-all duration-200 ${
            collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs delay-75"
          }`}
        >
          Lost Link
        </p>
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="p-2 hover:bg-primary-muted rounded-sm shrink-0 transition-colors duration-150"
        >
          <PanelLeft
            className={`w-5 h-5 transition-transform duration-300 ${
              collapsed ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex flex-col p-2 gap-1">
          {collapsed ? (
            <p className="font-bold text-md transition-opacity delay-75 text-center">
              M
            </p>
          ) : (
            <p className="font-bold text-md transition-opacity delay-75">
              MENU
            </p>
          )}
          <NavItem
            icon={<Home className="w-5 h-5" />}
            label="Dashboard"
            collapsed={collapsed}
            href="/dashboard"
          />
          <NavItem
            icon={<Clipboard className="w-5 h-5" />}
            label="My Reports"
            collapsed={collapsed}
            href="/my-reports"
          />
          <NavItem
            icon={<Bell className="w-5 h-5" />}
            label="Notifications"
            collapsed={collapsed}
            href="/notifications"
          />
          <NavItem
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            collapsed={collapsed}
            href="/settings"
          />
          <NavItem
            icon={<MessageCircle className="w-5 h-5" />}
            label="Messages"
            collapsed={collapsed}
            href="/messages"
          />
        </div>

        <div className="flex flex-col p-2 gap-1">
          {collapsed ? (
            <p className="font-bold text-md transition-opacity delay-75 text-center">
              S
            </p>
          ) : (
            <p className="font-bold text-md transition-opacity delay-75">
              SUPPORT
            </p>
          )}
          <NavItem
            icon={<CircleQuestionMark className="w-5 h-5" />}
            label="Help"
            collapsed={collapsed}
          />
          <NavItem
            icon={<Megaphone className="w-5 h-5" />}
            label="Report Issue"
            collapsed={collapsed}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-2 py-4 border-t border-gray">
        {collapsed ? (
          <div className="flex justify-center">
            <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center text-md font-bold">
              {user?.first_name[0] || "N"}
              {user?.last_name[0] || "A"}
            </div>
          </div>
        ) : (
          <div className="flex flex-row items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center text-md font-bold">
              {user?.first_name[0] || "N"}
              {user?.last_name[0] || "A"}
            </div>
            <div>
              <p className="whitespace-nowrap text-sm font-bold transition-opacity delay-75">
                {user?.first_name || "Not Available"}
              </p>
              <p className="whitespace-nowrap text-xs transition-opacity delay-75">
                User
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon, label, collapsed, href }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = href && location.pathname === href;
  return (
    <div
      onClick={() => href && navigate(href)}
      className={`hover:bg-primary-muted rounded-sm p-2 flex flex-row items-center
              cursor-pointer transition-colors duration-150 overflow-hidden
              ${isActive ? "bg-secondary-muted" : ""}`}
    >
      {/* Icon wrapper: takes full width and centers when collapsed, shrinks back when expanded */}
      <div
        className={`shrink-0 transition-all duration-300 ${
          collapsed ? "w-full flex justify-center" : "w-5 mr-2"
        }`}
      >
        {icon}
      </div>

      {/* Label fades + collapses to zero width — no leftover gap */}
      <span
        className={`whitespace-nowrap text-sm overflow-hidden transition-all duration-200 ${
          collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs delay-75"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export default Sidebar;
