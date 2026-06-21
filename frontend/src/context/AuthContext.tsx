import { createContext, useContext, useEffect, useState } from "react";
import * as api from "../api/client";
import type { Manager } from "../types";

interface AuthValue {
  manager: Manager | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [manager, setManager] = useState<Manager | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMe().then(setManager).catch(() => setManager(null)).finally(() => setLoading(false));
    const clear = () => setManager(null);
    window.addEventListener("zoomscribe:unauthorized", clear);
    return () => window.removeEventListener("zoomscribe:unauthorized", clear);
  }, []);

  async function signIn(email: string, password: string) {
    setManager(await api.login(email, password));
  }

  async function signUp(name: string, email: string, password: string) {
    setManager(await api.register(name, email, password));
  }

  async function signOut() {
    await api.logout().catch(() => undefined);
    setManager(null);
  }

  return (
    <AuthContext.Provider value={{ manager, isAdmin: manager?.role === "admin", loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
