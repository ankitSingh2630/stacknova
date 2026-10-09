"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { account, teams } from "@/lib/appwrite/client";
import { appwriteConfig } from "@/lib/appwrite/config";
import { authMessages, createAdminAuth, type AdminAuthState } from "@/lib/admin/auth";

const auth = createAdminAuth({ account, teams, config: appwriteConfig });
type ContextValue = {
  state: AdminAuthState;
  refresh: () => Promise<void>;
  recheckSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<boolean>;
  loggingOut: boolean;
  logoutError: string;
};
const Context = createContext<ContextValue | null>(null);

export default function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminAuthState>({ status: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const generation = useRef(0);
  const busy = useRef(false);

  // A data read has already cleared its private cache. Keep the workspace
  // provider mounted if identity is still valid, so a denied read cannot loop.
  const recheckSession = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const current = ++generation.current;
    try {
      const next = await auth.restore((denied) => {
        if (current !== generation.current) return false;
        setState(denied);
        return true;
      });
      if (current === generation.current) setState(next);
    } catch {
      if (current === generation.current) setState({ status: "error", message: authMessages.verification });
    } finally { busy.current = false; }
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const current = ++generation.current;
    setState({ status: "loading" });
    try {
      const next = await auth.restore((denied) => {
        if (current !== generation.current) return false;
        busy.current = true;
        setState(denied);
        return true;
      });
      if (current === generation.current) setState(next);
    } catch {
      if (current === generation.current) setState({ status: "error", message: authMessages.verification });
    } finally { if (current === generation.current) busy.current = false; }
  }, []);
  useEffect(() => {
    void refresh();
    // Ignore responses belonging to an unmounted or superseded provider.
    return () => { generation.current += 1; };
  }, [refresh]);

  const login = async (email: string, password: string) => {
    if (busy.current) return;
    busy.current = true;
    const current = ++generation.current;
    setState({ status: "loading" });
    setLogoutError("");
    try {
      const next = await auth.login(email, password, (denied) => {
        if (current !== generation.current) return false;
        setState(denied);
        return true;
      });
      if (current === generation.current) setState(next);
    } catch {
      if (current === generation.current) setState({ status: "error", message: authMessages.login });
    } finally { busy.current = false; }
  };
  const logout = async () => {
    if (busy.current) return false;
    busy.current = true;
    const current = ++generation.current;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const result = await auth.logout();
      if (current !== generation.current) return false;
      if (result.success) setState({ status: "signedOut" });
      else setLogoutError(result.message || authMessages.logout);
      return result.success;
    } catch {
      if (current === generation.current) setLogoutError(authMessages.logout);
      return false;
    } finally {
      busy.current = false;
      if (current === generation.current) setLoggingOut(false);
    }
  };
  return <Context.Provider value={{ state, refresh, recheckSession, login, logout, loggingOut, logoutError }}>{children}</Context.Provider>;
}

export function useAdminAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("Admin auth provider is missing");
  return value;
}
