import { useState } from "react";
import { ArrowRight, LocateIcon, ArrowLeftCircleIcon } from "lucide-react";
import { Link } from "react-router-dom";

function Signup() {
  const [email, setEmail] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [firstLoad, setFirstLoad] = useState(false);
  const [secondLoad, setSecondLoad] = useState(false);
  const [emailHover, setEmailHover] = useState(false);

  function isAuthorizedFunction() {
    setFirstLoad(true);
    if (!email) {
      setError("Enter your email");
      setIsAuthorized(false);
      setFirstLoad(false);
      return;
    }
    setError("");
    setIsAuthorized(true);
    setFirstLoad(false);
    return;
  }
  return (
    <>
      <div className="w-dvw min-h-dvh h-auto flex flex-col justify-center items-center p-4 bg-primary-soft">
        <div className="w-full max-w-150 p-4 rounded-md flex flex-col gap-4">
          {!isAuthorized && (
            <>
              {error && (
                <p className="px-3 py-2 bg-danger-soft border-l-4 border-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-sm">
                  Email
                </label>
                <input
                  type="text"
                  id="email"
                  placeholder="Enter your email"
                  value={email}
                  className="outline-none px-4 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                />
              </div>
              <button
                className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2"
                onClick={isAuthorizedFunction}
                disabled={firstLoad}
              >
                continue{" "}
                {firstLoad ? (
                  <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin"></div>
                ) : (
                  <ArrowRight />
                )}{" "}
              </button>
              <p className="text-center">
                Already have an account?{" "}
                <Link
                  to={"/login"}
                  className="text-secondary hover:text-secondary-hover"
                >
                  Log In
                </Link>
              </p>
            </>
          )}
          {isAuthorized && (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex flex-row gap-2 items-center">
                  <ArrowLeftCircleIcon
                    className={`w-7 h-7 hover:cursor-pointer text-text-muted hover:text-text ${emailHover ? "animate-bounce text-secondary!" : ""}`}
                    onClick={() => setIsAuthorized(false)}
                  />
                  <p className="font-bold text-2xl">Sign Up</p>
                </div>
                <p>Sign up to view lost and found items</p>
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
                  <label htmlFor="firstName" className="text-sm">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    placeholder="John"
                    className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="lastName" className="text-sm">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    placeholder="Kaisen"
                    className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="email" className="text-sm">
                    Email
                  </label>
                  <div
                    onMouseEnter={() => setEmailHover(true)}
                    onMouseLeave={() => setEmailHover(false)}
                  >
                    <input
                      type="text"
                      id="email"
                      value={email}
                      className="text-text-muted outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm w-full"
                      disabled
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="password" className="text-sm">
                    Password
                  </label>
                  <input
                    type="text"
                    id="password"
                    placeholder=""
                    className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="confirmPassword" className="text-sm">
                    Confirm Password
                  </label>
                  <input
                    type="text"
                    id="confirmPassword"
                    placeholder=""
                    className="outline-none px-3 py-3 rounded-lg bg-white focus:bg-secondary-soft border border-gray-300 ring-gray-300 focus:ring-1 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <button className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2">
                  Sign Up{" "}
                  {secondLoad && (
                    <div className="border-white border-3 border-t-0 border-b-0 rounded-full w-4 h-4 animate-spin"></div>
                  )}
                </button>
                <p className="text-center">
                  Already have an account?{" "}
                  <Link
                    to={"/login"}
                    className="text-secondary hover:text-secondary-hover"
                  >
                    Log In
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default Signup;
