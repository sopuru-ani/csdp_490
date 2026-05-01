import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  LocateIcon,
  ArrowLeftCircleIcon,
  Eye,
  EyeOff,
  Check,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api";

function Signup() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [firstLoad, setFirstLoad] = useState(false);
  const [secondLoad, setSecondLoad] = useState(false);
  const [emailHover, setEmailHover] = useState(false);
  const [hidePassword, setHidePassword] = useState(true);
  const [hideConfirmPassword, setHideConfirmPassword] = useState(true);
  const [hasStartedPasswordInput, setHasStartedPasswordInput] = useState(false);
  const emailHoverTimeoutRef = useRef(null);

  const passwordRequirements = {
    minLength: password.length >= 8,
    upperCase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    specialChar: /[^A-Za-z0-9]/.test(password),
  };

  const metRequirementsCount =
    Number(passwordRequirements.minLength) +
    Number(passwordRequirements.upperCase) +
    Number(passwordRequirements.number) +
    Number(passwordRequirements.specialChar);

  const passwordStrength = (metRequirementsCount / 4) * 100;
  const allPasswordRequirementsMet = metRequirementsCount === 4;
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const passwordBarColor =
    metRequirementsCount <= 1
      ? "bg-danger"
      : metRequirementsCount <= 3
        ? "bg-warning"
        : "bg-success";

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

  async function verifyPasswordFunction() {
    // console.log("email:", email);
    //  console.log("password:", password);
    //  console.log("firstName:", firstName);
    //  console.log("lastName:", lastName);

    setSecondLoad(true);
    setError("");
    setSuccess("");

    if (!firstName || !lastName) {
      setError("Please enter your first and last name.");
      setSecondLoad(false);
      return;
    }

    if (!password) {
      setError("Enter your password");
      setSecondLoad(false);
      return;
    }

    if (!allPasswordRequirementsMet) {
      setError("Password does not meet all requirements");
      setSecondLoad(false);
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match");
      setSecondLoad(false);
      return;
    }

    try {
      const res = await apiFetch("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          first_name: firstName,
          last_name: lastName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Signup failed");
      }

      setSuccess(
        "Account created! Please check your email to confirm your account.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSecondLoad(false);
    }
  }

  function triggerEmailHoverBounce() {
    setEmailHover(true);
    if (emailHoverTimeoutRef.current) {
      clearTimeout(emailHoverTimeoutRef.current);
    }
    emailHoverTimeoutRef.current = setTimeout(() => {
      setEmailHover(false);
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (emailHoverTimeoutRef.current) {
        clearTimeout(emailHoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className="w-dvw min-h-dvh h-auto flex flex-col justify-center items-center p-4 bg-primary-soft">
        <div className="w-full max-w-150 p-4 rounded-md flex flex-col gap-4">
          {!isAuthorized && (
            <>
              <div className="flex flex-col items-center gap-1">
                <p className="font-bold text-2xl text-secondary">
                  Create Account
                </p>
                <p>Enter your email to continue</p>
              </div>
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
                  className="outline-none px-4 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm"
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
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="outline-none px-3 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm"
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
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="outline-none px-3 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="email" className="text-sm">
                    Email
                  </label>
                  <div
                    onMouseEnter={() => setEmailHover(true)}
                    onMouseLeave={() => setEmailHover(false)}
                    onTouchStart={triggerEmailHoverBounce}
                  >
                    <input
                      type="text"
                      id="email"
                      value={email}
                      className="text-text-muted outline-none px-3 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm w-full"
                      disabled
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="password" className="text-sm">
                    Password
                  </label>
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <input
                        type={hidePassword ? "password" : "text"}
                        id="password"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPassword(value);
                          if (!hasStartedPasswordInput && value.length > 0) {
                            setHasStartedPasswordInput(true);
                          }
                        }}
                        className="outline-none px-3 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm w-full pr-10"
                      />
                      {hidePassword ? (
                        <EyeOff
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5 cursor-pointer"
                          onClick={() => setHidePassword(!hidePassword)}
                        />
                      ) : (
                        <Eye
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5 cursor-pointer"
                          onClick={() => setHidePassword(!hidePassword)}
                        />
                      )}
                    </div>
                    {hasStartedPasswordInput && (
                      <>
                        <Progress
                          value={passwordStrength}
                          barClassName={passwordBarColor}
                        />
                        <div className="mb-2">
                          <p className="text-sm font-bold">
                            Password must contain:{" "}
                          </p>

                          <div className="flex flex-row items-center gap-1">
                            {passwordRequirements.minLength ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <X className="w-4 h-4 text-danger" />
                            )}
                            <p
                              className={`text-sm ${passwordRequirements.minLength ? "text-success" : "text-text-muted"}`}
                            >
                              At least 8 characters
                            </p>
                          </div>
                          <div className="flex flex-row items-center gap-1">
                            {passwordRequirements.upperCase ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <X className="w-4 h-4 text-danger" />
                            )}
                            <p
                              className={`text-sm ${passwordRequirements.upperCase ? "text-success" : "text-text-muted"}`}
                            >
                              At least one capital letter
                            </p>
                          </div>
                          <div className="flex flex-row items-center gap-1">
                            {passwordRequirements.number ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <X className="w-4 h-4 text-danger" />
                            )}
                            <p
                              className={`text-sm ${passwordRequirements.number ? "text-success" : "text-text-muted"}`}
                            >
                              At least one number
                            </p>
                          </div>
                          <div className="flex flex-row items-center gap-1">
                            {passwordRequirements.specialChar ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <X className="w-4 h-4 text-danger" />
                            )}
                            <p
                              className={`text-sm ${passwordRequirements.specialChar ? "text-success" : "text-text-muted"}`}
                            >
                              At least one special character
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="confirmPassword" className="text-sm">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={hideConfirmPassword ? "password" : "text"}
                      id="confirmPassword"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="outline-none px-3 py-3 rounded-lg bg-bg-raised focus:bg-secondary-soft border border-border-strong ring-border-strong focus:ring-1 text-sm w-full pr-10"
                    />
                    {hideConfirmPassword ? (
                      <EyeOff
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5 cursor-pointer"
                        onClick={() =>
                          setHideConfirmPassword(!hideConfirmPassword)
                        }
                      />
                    ) : (
                      <Eye
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5 cursor-pointer"
                        onClick={() =>
                          setHideConfirmPassword(!hideConfirmPassword)
                        }
                      />
                    )}
                  </div>
                  {confirmPassword.length > 0 && (
                    <p
                      className={`text-sm ${passwordsMatch ? "text-success" : "text-danger"}`}
                    >
                      {passwordsMatch
                        ? "Passwords match"
                        : "Passwords do not match"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <button
                  className="px-4 py-3 rounded-lg bg-secondary hover:bg-secondary-hover cursor-pointer text-white flex items-center justify-center gap-2"
                  onClick={verifyPasswordFunction}
                  disabled={secondLoad}
                >
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
