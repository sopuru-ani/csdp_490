import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault(); // prevents page reload
    setError("");
    setSuccess("");

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

      if (!res.ok) {
        throw new Error(data.detail || "Login failed");
      }

      setSuccess("Login successful! Redirecting...");
      setTimeout(() => navigate("/dashboard"), 1000);
    } catch (err) {
      setError(err.message);
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

        {error && (
          <p className="px-3 py-2 bg-danger-soft border-l-4 border-danger">
            {error}
          </p>
        )}
        {success && (
          <p className="px-3 py-2 bg-success-soft border-l-4 border-success">
            {success}
          </p>
        )}

        {/* ✅ FORM START */}
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
                className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex">
                <label htmlFor="password" className="text-sm flex-1">
                  Password
                </label>
                <Link className="text-sm text-secondary hover:text-secondary-hover hover:underline">
                  forgot password?
                </Link>
              </div>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2 disabled:opacity-60"
          >
            Log In
            {loading && (
              <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin"></div>
            )}
          </button>
        </form>
        {/* ✅ FORM END */}

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
