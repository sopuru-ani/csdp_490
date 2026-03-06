import { useState } from "react";
import { Link } from "react-router-dom";
import { LocateIcon } from "lucide-react";

function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  return (
    <>
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm">
                Email
              </label>
              <input
                type="text"
                id="email"
                placeholder="johnkaisen@jujutsu.high"
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
                type="text"
                id="password"
                placeholder=""
                className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <button className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2">
              Log In{" "}
              {loading && (
                <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin"></div>
              )}
            </button>
            <p className="text-center">
              Don't have an account?{" "}
              <Link
                to={"/signup"}
                className="text-secondary hover:text-secondary-hover"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
