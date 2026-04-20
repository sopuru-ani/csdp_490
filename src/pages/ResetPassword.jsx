import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

function ResetPassword() {
  const navigate = useNavigate();
  const [token, setToken]           = useState("");
  const [tokenError, setTokenError] = useState(false);
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [done, setDone]             = useState(false);

  // Supabase puts the recovery token in the URL hash:
  // /reset-password#access_token=xxx&type=recovery
  useEffect(() => {
    const hash   = window.location.hash.slice(1); // strip leading #
    const params = new URLSearchParams(hash);
    const t      = params.get("access_token");
    const type   = params.get("type");

    if (!t || type !== "recovery") {
      setTokenError(true);
      return;
    }
    setToken(t);
    // Clean the token out of the URL bar without triggering a navigation
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Reset failed.");
      setDone(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (tokenError) {
    return (
      <div className="w-dvw min-h-dvh flex flex-col justify-center items-center p-4 bg-primary-soft">
        <div className="w-full max-w-150 p-4 rounded-md flex flex-col gap-4">
          <p className="font-bold text-2xl">Invalid reset link</p>
          <p className="px-3 py-3 bg-danger-soft border-l-4 border-danger text-sm">
            This password reset link is invalid or has expired. Reset links are
            single-use and expire after 1 hour.
          </p>
          <Link
            to="/forgot-password"
            className="text-sm text-secondary hover:text-secondary-hover hover:underline"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-dvw min-h-dvh flex flex-col justify-center items-center p-4 bg-primary-soft">
      <div className="w-full max-w-150 p-4 rounded-md flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-2xl">Set a new password</p>
          <p className="text-text-muted text-sm">
            Choose something you haven't used before.
          </p>
        </div>

        {done ? (
          <p className="px-3 py-3 bg-success-soft border-l-4 border-success text-sm">
            Password updated! Redirecting you to login…
          </p>
        ) : (
          <>
            {error && (
              <p className="px-3 py-2 bg-danger-soft border-l-4 border-danger text-sm">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="password" className="text-sm">New password</label>
                  <input
                    type="password"
                    id="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="confirm" className="text-sm">Confirm new password</label>
                  <input
                    type="password"
                    id="confirm"
                    placeholder="Repeat your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2 disabled:opacity-60"
              >
                Update password
                {loading && (
                  <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin" />
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
