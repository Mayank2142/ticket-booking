import type { ApiErrorDto } from "@cinebook/shared";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "cinebook:token";
export const AUTH_UNAUTHORIZED_EVENT = "cinebook:unauthorized";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function clearToken() {
  // Remove credentials left by older builds. New sessions live only in HttpOnly cookies.
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("cinebook-alert-email");
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-CineBook-Session", "cookie");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers,
  });
  const data: T | ApiErrorDto = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    const message = typeof data === "object" && data !== null && "error" in data ? data.error : "Request failed";
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function downloadApiFile(path: string, filename: string) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "X-CineBook-Session": "cookie" },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Download failed" })) as ApiErrorDto;
    throw new Error(data.error || "Download failed");
  }
  const href = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

export function assetUrl(path: string) {
  return apiUrl(path);
}
