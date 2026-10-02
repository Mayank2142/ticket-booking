import type { ApiErrorDto } from "@cinebook/shared";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "cinebook:token";
export const AUTH_UNAUTHORIZED_EVENT = "cinebook:unauthorized";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  const data: T | ApiErrorDto = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    const message = typeof data === "object" && data !== null && "error" in data ? data.error : "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

export function assetUrl(path: string) {
  return apiUrl(path);
}
