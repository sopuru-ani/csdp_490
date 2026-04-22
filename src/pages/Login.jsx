import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

function Login() {
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");
  const [success, setSuccess]                 = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);
  const [lockedUntil, setLockedUntil]         = useState(null); // Date object
  const [countdown, setCountdown]             = useState("");
  const navigate = useNavigate();

  // Tick down the lockout countdown every second
  useEffect(() => {
    if (!lockedUntil) return;
    function tick() {
      const secs = Math.max(0, Math.floor((lockedUntil - Date.now()) / 1000));
      if (secs === 0) {
        setLockedUntil(null);
        setCountdown("");
        return;
      }
      const m = String(Math.floor(secs / 60)).padStart(2, "0");
      const s = String(secs % 60).padStart(2, "0");
      setCountdown(`${m}:${s}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function handleLogin(e) {
    e.preventDefault();
    if (lockedUntil) return;
    setError("");
    setSuccess("");
    setAttemptsRemaining(null);

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.status === 423) {
        setLockedUntil(new Date(data.detail.locked_until));
        return;
      }

      if (!res.ok) {
        const detail = data.detail;
        setError(typeof detail === "string" ? detail : detail?.message || "Login failed");
        if (typeof detail === "object" && detail?.attempts_remaining !== undefined) {
          setAttemptsRemaining(detail.attempts_remaining);
        }
        return;
      }

      setSuccess("Login successful! Redirecting...");
      setTimeout(() => navigate("/dashboard"), 1000);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-dvw min-h-dvh h-auto flex flex-col justify-center items-center p-4 bg-primary-soft">
      <div className="w-full max-w-150 p-4 rounded-md flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-2xl">Welcome Back</p>
          <p>Login to view lost and found items</p>
        </div>

        {/* Lockout banner */}
        {lockedUntil && (
          <div className="px-3 py-3 bg-danger-soft border-l-4 border-danger flex flex-col gap-1">
            <p className="font-semibold text-sm">Account temporarily locked</p>
            <p className="text-sm">
              Too many failed attempts. Try again in{" "}
              <span className="font-mono font-bold">{countdown}</span>.
            </p>
            <Link
              to="/forgot-password"
              className="text-sm text-secondary hover:text-secondary-hover hover:underline mt-1 self-start"
            >
              Forgot your password?
            </Link>
          </div>
        )}

        {/* Attempts warning */}
        {attemptsRemaining !== null && !lockedUntil && (
          <p className="px-3 py-2 bg-yellow-50 border-l-4 border-yellow-400 text-sm">
            Warning:{" "}
            <span className="font-semibold">
              {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
            </span>{" "}
            before your account is locked for {10} minutes.
          </p>
        )}

        {error && !lockedUntil && (
          <p className="px-3 py-2 bg-danger-soft border-l-4 border-danger">
            {error}
          </p>
        )}
        {success && (
          <p className="px-3 py-2 bg-success-soft border-l-4 border-success">
            {success}
          </p>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm">
                Email
              </label>
              <input
                type="text"
                id="email"
                placeholder="johnkaisen@jujutsu.high"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!lockedUntil}
                className="outline-none px-3 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex">
                <label htmlFor="password" className="text-sm flex-1">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-secondary hover:text-secondary-hover hover:underline"
                >
                  forgot password?
                </Link>
              </div>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!!lockedUntil}
                className="outline-none px-3 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !!lockedUntil}
            className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {lockedUntil ? `Locked — ${countdown}` : "Log In"}
            {loading && (
              <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin"></div>
            )}
          </button>
        </form>

        <p className="text-center">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="text-secondary hover:text-secondary-hover"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
