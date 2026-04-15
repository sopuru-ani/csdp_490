import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ShieldCheck, Palette, User, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const LOCAL_STORAGE_KEYS = {
  notifications: "settings.notifications",
  appearance: "settings.appearance",
  privacy: "settings.privacy",
};

function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [profileStatus, setProfileStatus] = useState({ type: "", message: "" });
  const [passwordStatus, setPasswordStatus] = useState({
    type: "",
    message: "",
  });
  const [notificationStatus, setNotificationStatus] = useState({
    type: "",
    message: "",
  });
  const [appearanceStatus, setAppearanceStatus] = useState({
    type: "",
    message: "",
  });
  const [privacyStatus, setPrivacyStatus] = useState({
    type: "",
    message: "",
  });

  // const {
  //   isSubscribed,
  //   isLoading: pushLoading,
  //   subscribe,
  //   notificationDenied,
  // } = usePushNotifications(user?.user_id || null);
  const {
    isSubscribed,
    isLoading: pushLoading,
    subscribe,
    notificationDenied,
  } = usePushNotifications(user?.id);

  const [notifyPrefs, setNotifyPrefs] = useState({
    push: false,
    email: false,
    matchAlerts: true,
    messageNotifications: true,
  });

  const [darkMode, setDarkMode] = useState(false);

  const [privacyPrefs, setPrivacyPrefs] = useState({
    showReportsPublicly: true,
    allowMessages: true,
  });

  useEffect(() => {
    async function init() {
      try {
        const res = await apiFetch("/auth/userchecker");
        if (!res.ok) {
          navigate("/login");
          return;
        }
        const data = await res.json();
        setUser(data);
        console.log(data);
        setProfileName(
          `${data.first_name || ""} ${data.last_name || ""}`.trim(),
        );
        setProfileEmail(data.email || "");
      } catch {
        navigate("/login");
        return;
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    const storedNotifications = readStorage(LOCAL_STORAGE_KEYS.notifications);
    if (storedNotifications) setNotifyPrefs(storedNotifications);

    const storedAppearance = readStorage(LOCAL_STORAGE_KEYS.appearance);
    if (storedAppearance?.darkMode !== undefined) {
      setDarkMode(!!storedAppearance.darkMode);
    }

    const storedPrivacy = readStorage(LOCAL_STORAGE_KEYS.privacy);
    if (storedPrivacy) setPrivacyPrefs(storedPrivacy);
  }, []);

  useEffect(() => {
    if (notificationDenied) {
      setNotifyPrefs((prev) => ({ ...prev, push: false }));
    }
  }, [notificationDenied]);

  // Sync push subscription state with notifyPrefs
  useEffect(() => {
    setNotifyPrefs((prev) => ({ ...prev, push: isSubscribed }));
  }, [isSubscribed]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [darkMode]);

  const initials = useMemo(() => {
    if (!user) return "NA";
    return `${user.first_name?.[0] || "N"}${user.last_name?.[0] || "A"}`;
  }, [user]);

  async function handleProfileSave() {
    setProfileStatus({ type: "", message: "" });
    try {
      const res = await apiFetch("/users/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Profile update failed");
      }

      setProfileStatus({ type: "success", message: "Profile updated." });
    } catch (err) {
      setProfileStatus({ type: "error", message: err.message });
    }
  }

  async function handlePasswordSave() {
    setPasswordStatus({ type: "", message: "" });
    if (!currentPassword || !newPassword) {
      setPasswordStatus({
        type: "error",
        message: "Please enter both current and new password.",
      });
      return;
    }

    try {
      const res = await apiFetch("/users/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Password update failed");
      }

      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus({ type: "success", message: "Password updated." });
    } catch (err) {
      setPasswordStatus({ type: "error", message: err.message });
    }
  }

  async function handleNotificationSave() {
    setNotificationStatus({ type: "", message: "" });
    try {
      writeStorage(LOCAL_STORAGE_KEYS.notifications, notifyPrefs);
      setNotificationStatus({
        type: "success",
        message: "Notification preferences saved locally.",
      });
    } catch (err) {
      setNotificationStatus({
        type: "error",
        message: err.message || "Failed to save notification preferences.",
      });
    }
  }

  async function handleAppearanceSave() {
    setAppearanceStatus({ type: "", message: "" });
    try {
      writeStorage(LOCAL_STORAGE_KEYS.appearance, { darkMode });
      setAppearanceStatus({
        type: "success",
        message: "Appearance preference saved.",
      });
    } catch (err) {
      setAppearanceStatus({
        type: "error",
        message: err.message || "Failed to save appearance preference.",
      });
    }
  }

  async function handlePrivacySave() {
    setPrivacyStatus({ type: "", message: "" });
    try {
      const res = await apiFetch("/users/privacy-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(privacyPrefs),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Privacy update failed");
      }

      writeStorage(LOCAL_STORAGE_KEYS.privacy, privacyPrefs);
      setPrivacyStatus({ type: "success", message: "Privacy settings saved." });
    } catch (err) {
      writeStorage(LOCAL_STORAGE_KEYS.privacy, privacyPrefs);
      setPrivacyStatus({
        type: "error",
        message: err.message || "Failed to save privacy settings.",
      });
    }
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      "This will permanently delete your account. This cannot be undone. Continue?",
    );
    if (!confirmed) return;

    setPrivacyStatus({ type: "", message: "" });
    try {
      const res = await apiFetch("/users/delete-account", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Account deletion failed");
      }

      clearStorage();
      navigate("/login");
    } catch (err) {
      setPrivacyStatus({ type: "error", message: err.message });
    }
  }

  async function handleLogout() {
    await apiFetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/login");
  }

  async function handlePushToggle(nextValue) {
    if (!user?.id) {
      console.warn("Cannot subscribe to push notifications: user not loaded");
      return;
    }

    if (nextValue) {
      await subscribe();
      // notifyPrefs.push will be updated automatically via useEffect when isSubscribed changes
    } else {
      // TODO: Implement unsubscribe when available
      setNotifyPrefs((prev) => ({ ...prev, push: false }));
    }
  }

  if (loading) {
    return (
      <div className="w-full min-h-dvh flex items-center justify-center bg-primary-soft">
        <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 flex-1 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary-muted flex items-center justify-center text-lg font-bold">
          {initials}
        </div>
        <div>
          <p className="font-bold text-3xl">Settings</p>
          <p className="text-sm text-text-muted">
            Manage your account and app preferences
          </p>
        </div>
      </div>

      <SettingsSection
        title="Account Settings"
        description="Update your personal details and password."
        icon={<User className="w-5 h-5" />}
        status={profileStatus}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Your name"
          />
          <Field
            label="Email"
            type="email"
            value={profileEmail}
            onChange={(e) => setProfileEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleProfileSave}
            className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer transition-all duration-200 shadow-sm"
          >
            Save Profile
          </button>
        </div>

        <div className="border-t border-gray-100 pt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="********"
            />
            <Field
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="********"
            />
          </div>
          <div className="flex flex-col gap-2">
            {passwordStatus.message && <StatusBadge status={passwordStatus} />}
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
              <button
                onClick={handlePasswordSave}
                className="px-4 py-2 rounded-xl border border-secondary text-secondary hover:bg-secondary-soft text-sm cursor-pointer transition-all duration-200"
              >
                Update Password
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-danger-soft hover:border-danger hover:text-danger text-sm cursor-pointer transition-all duration-200"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Notification Settings"
        description="Control how Lost Link communicates with you."
        icon={<Bell className="w-5 h-5" />}
        status={notificationStatus}
      >
        <ToggleRow
          label="Enable Push Notifications"
          description={
            notificationDenied
              ? "Browser notifications are blocked. Enable in browser settings."
              : "Receive real-time alerts from the app."
          }
          checked={notifyPrefs.push}
          onChange={handlePushToggle}
          disabled={pushLoading || !user?.id}
        />
        <ToggleRow
          label="Enable Email Notifications"
          description="Get important updates in your inbox."
          checked={notifyPrefs.email}
          onChange={(value) =>
            setNotifyPrefs((prev) => ({ ...prev, email: value }))
          }
        />
        <ToggleRow
          label="Match Alerts"
          description="Alerts when an item is matched."
          checked={notifyPrefs.matchAlerts}
          onChange={(value) =>
            setNotifyPrefs((prev) => ({ ...prev, matchAlerts: value }))
          }
        />
        <ToggleRow
          label="Message Notifications"
          description="Notify me when I receive a new message."
          checked={notifyPrefs.messageNotifications}
          onChange={(value) =>
            setNotifyPrefs((prev) => ({
              ...prev,
              messageNotifications: value,
            }))
          }
        />
        <div className="flex justify-end">
          <button
            onClick={handleNotificationSave}
            className="px-4 py-2 rounded-xl border border-secondary text-secondary hover:bg-secondary-soft text-sm cursor-pointer transition-all duration-200"
          >
            Save Notifications
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Appearance Settings"
        description="Personalize how Lost Link looks."
        icon={<Palette className="w-5 h-5" />}
        status={appearanceStatus}
      >
        <ToggleRow
          label="Dark Mode"
          description="Reduce eye strain in low light."
          checked={darkMode}
          onChange={setDarkMode}
        />
        <div className="flex justify-end">
          <button
            onClick={handleAppearanceSave}
            className="px-4 py-2 rounded-xl border border-secondary text-secondary hover:bg-secondary-soft text-sm cursor-pointer transition-all duration-200"
          >
            Save Appearance
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Privacy Settings"
        description="Control what others can see and how they contact you."
        icon={<ShieldCheck className="w-5 h-5" />}
        status={privacyStatus}
      >
        <ToggleRow
          label="Show My Reports Publicly"
          description="Allow others to view my active reports."
          checked={privacyPrefs.showReportsPublicly}
          onChange={(value) =>
            setPrivacyPrefs((prev) => ({
              ...prev,
              showReportsPublicly: value,
            }))
          }
        />
        <ToggleRow
          label="Allow Others To Message Me"
          description="Let matched users start conversations."
          checked={privacyPrefs.allowMessages}
          onChange={(value) =>
            setPrivacyPrefs((prev) => ({ ...prev, allowMessages: value }))
          }
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={handlePrivacySave}
            className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer transition-all duration-200 shadow-sm"
          >
            Save Privacy
          </button>
          <button
            onClick={handleDeleteAccount}
            className="px-4 py-2 rounded-xl border border-danger text-danger hover:bg-danger-soft text-sm cursor-pointer flex items-center justify-center gap-2 transition-all duration-200 w-full sm:w-auto text-center"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, description, icon, status, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4 shadow-md">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-secondary">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-lg">{title}</p>
          <p className="text-sm text-text-muted">{description}</p>
        </div>
      </div>
      {status?.message && <StatusBadge status={status} />}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="outline-none px-4 py-2.5 rounded-xl bg-white focus:bg-secondary-soft border border-gray-300 focus:ring-2 ring-secondary-muted text-sm transition-all duration-200"
      />
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    // <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-3 py-3">
    <div className="flex items-center justify-between gap-4 rounded-xl px-3 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`w-12 h-6 rounded-full p-0.5 transition-colors ${
          checked ? "bg-secondary" : "bg-gray-200"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status?.message) return null;
  const isSuccess = status.type === "success";
  return (
    <div
      className={`px-3 py-2 rounded-lg text-sm border-l-4 ${
        isSuccess
          ? "bg-success-soft border-success text-success"
          : "bg-danger-soft border-danger text-danger"
      }`}
    >
      {status.message}
    </div>
  );
}

function readStorage(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clearStorage() {
  Object.values(LOCAL_STORAGE_KEYS).forEach((key) =>
    localStorage.removeItem(key),
  );
}

export default Settings;
