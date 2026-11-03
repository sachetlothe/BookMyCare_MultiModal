import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "./api";
import type { TokenResponse, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** A recovery code to show the patient once (after sign-up, reset or on request). */
  recoveryCode: string | null;
  /** null = unknown yet */
  hasRecoveryCode: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  createRecoveryCode: (password: string) => Promise<void>;
  dismissRecoveryCode: () => void;
  logout: () => void;
  logoutEverywhere: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [hasRecoveryCode, setHasRecoveryCode] = useState<boolean | null>(null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setRecoveryCode(null);
    setHasRecoveryCode(null);
  }, []);

  const adopt = useCallback((r: TokenResponse) => {
    tokenStore.set(r.access_token);
    setUser(r.user);
    if (r.recovery_code) setRecoveryCode(r.recovery_code);
    setHasRecoveryCode(r.has_recovery_code ?? null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api.me()
      .then((u) => {
        setUser(u);
        api.securityStatus().then((s) => setHasRecoveryCode(s.has_recovery_code)).catch(() => undefined);
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => adopt(await api.login(email, password)), [adopt]);
  const register = useCallback(async (email: string, name: string, password: string) => adopt(await api.register(email, name, password)), [adopt]);
  const resetPassword = useCallback(async (email: string, code: string, next: string) => adopt(await api.resetPassword(email, code, next)), [adopt]);
  const changePassword = useCallback(async (current: string, next: string) => adopt(await api.changePassword(current, next)), [adopt]);
  const createRecoveryCode = useCallback(async (password: string) => {
    const r = await api.newRecoveryCode(password);
    setRecoveryCode(r.recovery_code);
    setHasRecoveryCode(true);
  }, []);
  const dismissRecoveryCode = useCallback(() => setRecoveryCode(null), []);
  const logoutEverywhere = useCallback(async () => {
    await api.logoutAll();
    logout();
  }, [logout]);

  const value = useMemo(
    () => ({ user, loading, recoveryCode, hasRecoveryCode, login, register, resetPassword, changePassword, createRecoveryCode, dismissRecoveryCode, logout, logoutEverywhere }),
    [user, loading, recoveryCode, hasRecoveryCode, login, register, resetPassword, changePassword, createRecoveryCode, dismissRecoveryCode, logout, logoutEverywhere],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
