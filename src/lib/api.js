const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

let isRefreshing = false;

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
  });

  if (res.status === 429) {
    throw new Error(
      "Too many requests — please slow down and try again in a moment.",
    );
  }

  if (
    res.status === 401 &&
    !isRefreshing &&
    path !== "/auth/refresh" &&
    path !== "/auth/login"
  ) {
    isRefreshing = true;
    try {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!refreshRes.ok) {
        window.location.href = "/login";
        return res;
      }
    } finally {
      isRefreshing = false;
    }
    return fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
    });
  }

  return res;
}
