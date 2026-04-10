//const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const API_URL = "http://localhost:8000";

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

  return res;
}
