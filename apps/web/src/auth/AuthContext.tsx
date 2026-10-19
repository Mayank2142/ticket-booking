import type { AuthUserDto, UserRole } from "@cinebook/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, AUTH_UNAUTHORIZED_EVENT, clearToken } from "../lib/api";
import { getFirebaseConfig, signInWithVerifiedEmail } from "../lib/firebase";
import { signInWithEmail } from "./email-sign-in";

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: Extract<UserRole, "CUSTOMER" | "ORGANISER">;
};

type AuthContextValue = {
  user: AuthUserDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUserDto>;
  register: (input: RegisterInput) => Promise<AuthUserDto>;
  logout: () => Promise<void>;
  updateSession: (token: string, user: AuthUserDto) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearToken();
      setUser(null);
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  useEffect(() => {
    let active = true;
    clearToken();

    api<{ user: AuthUserDto }>("/api/auth/me")
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch(() => clearToken())
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmail(email, password, {
      existingAccount: (address, secret) => api<{ token: string; user: AuthUserDto }>("/api/auth/login", {
        method: "POST", body: JSON.stringify({ email: address, password: secret }),
      }),
      verifiedEmail: signInWithVerifiedEmail,
      verifiedEmailEnabled: async () => Boolean(await getFirebaseConfig()),
      invalidCredentials: (error) => error instanceof ApiError && error.status === 401,
    });
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api<{ token: string; user: AuthUserDto }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input)
    });
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    clearToken();
    setUser(null);
  }, []);

  const updateSession = useCallback((_token: string, nextUser: AuthUserDto) => {
    clearToken();
    setUser(nextUser);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, updateSession }), [loading, login, logout, register, updateSession, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
