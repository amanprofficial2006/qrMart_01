export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export function getToken() {
  return localStorage.getItem("qrmart_owner_token") || "";
}

export function setToken(token) {
  localStorage.setItem("qrmart_owner_token", token);
}

export function clearToken() {
  localStorage.removeItem("qrmart_owner_token");
}

export function assetUrl(path) {
  if (!path) {
    return "";
  }

  if (path.startsWith("http") || path.startsWith("data:")) {
    return path;
  }

  return `${API_BASE_URL}${path}`;
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Something went wrong");
  }

  return result.data ?? result;
}

