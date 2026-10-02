import type { ApiErrorDto, AuthUserDto } from "@/contracts/api";

const TOKEN_KEY = "token";
export const AUTH_CHANGED_EVENT = "cinebook:auth-changed";

function announceAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  announceAuthChange();
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  announceAuthChange();
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const data: T | ApiErrorDto = await res.json();
  if (!res.ok) {
    const message = typeof data === "object" && data !== null && "error" in data ? data.error : "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export type User = AuthUserDto;
