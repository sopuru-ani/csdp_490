import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";

function ForgotPassword() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [sent, setSent]       = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email) { setError("Please enter your email address."); return; }

    setLoading(true);
    try {
      const res = await apiFetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Something went wrong.");
      }
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-dvw min-h-dvh flex flex-col justify-center items-center p-4 bg-primary-soft">
      <div className="w-full max-w-150 p-4 rounded-md flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-2xl">Forgot your password?</p>
          <p className="text-text-muted text-sm">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4">
            <p className="px-3 py-3 bg-success-soft border-l-4 border-success text-sm">
              Check your inbox — if that email is registered you'll get a reset
              link within a minute. Don't forget to check spam.
            </p>
            <Link
              to="/login"
              className="text-center text-sm text-secondary hover:text-secondary-hover hover:underline"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <p className="px-3 py-2 bg-danger-soft border-l-4 border-danger text-sm">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-sm">Email</label>
                <input
                  type="text"
                  id="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2 disabled:opacity-60"
              >
                Send reset link
                {loading && (
                  <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin" />
                )}
              </button>
            </form>

            <Link
              to="/login"
              className="text-center text-sm text-secondary hover:text-secondary-hover hover:underline"
            >
              Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;
