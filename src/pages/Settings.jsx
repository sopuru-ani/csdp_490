import React from "react";
import Sidebar from "@/components/sidebar";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell } from "lucide-react";

function Settings() {
  const { isSubscribed, isLoading, subscribe } =
    usePushNotifications("123456789");
  const notificationState = Notification.permission;
  console.log(notificationState);
  return (
    <>
      <div className="w-dvw min-h-dvh flex flex-row bg-primary-soft">
        <Sidebar />
        <div className="p-4 flex-1 flex flex-col gap-4">
          <p className="font-bold text-2xl">Settings</p>
          <button
            className="p-2 bg-secondary rounded-md hover:bg-secondary-hover cursor-pointer transition-all duration-150 ease-in-out shadow-sm flex flex-row gap-2 justify-center items-center"
            onClick={subscribe}
            disabled={isLoading}
          >
            <Bell className="w-5 h-5" />
            {notificationState === "granted"
              ? "Notifications Granted"
              : notificationState === "denied"
                ? "Notifications Blocked — Enable in Browser Settings"
                : "Enable Notifications"}
          </button>
        </div>
      </div>
    </>
  );
}

export default Settings;
