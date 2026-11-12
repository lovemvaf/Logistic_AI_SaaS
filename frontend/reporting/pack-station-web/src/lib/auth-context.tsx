"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getToken, setToken, clearAuth, getUser, setUser } from "./auth";

interface AuthContextType {
  token: string | null;
  user: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user?: any) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const storedToken = getToken();
    const storedUser = getUser();
    if (storedToken) {
      setTokenState(storedToken);
      setUserState(storedUser || null);
      setIsLoading(false);
      return;
    }

    const hydrateCookie = async () => {
      try {
        const res = await fetch("/api/v1/demo/me", {
          credentials: "include",
          headers: { "x-smartlogi-portal": "pack" },
        });
        if (active && !getToken() && res.ok) {
          const data = await res.json();
          if (active && !getToken() && data?.authenticated && data?.user) {
            setUser(data.user);
            setUserState(data.user);
          }
        }
      } catch {
        // Ignore
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void hydrateCookie();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback((newToken: string, newUser?: any) => {
    setToken(newToken);
    if (newUser !== undefined) setUser(newUser);
    setTokenState(newToken);
    if (newUser !== undefined) setUserState(newUser);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setTokenState(null);
    setUserState(null);
    if (typeof window !== "undefined") {
      void fetch("/api/v1/demo/logout", {
        method: "POST",
        credentials: "include",
        headers: { "x-smartlogi-portal": "pack" },
      }).catch(() => undefined);
    }
  }, []);

  const value = React.useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token || user),
      isLoading,
      login,
      logout,
    }),
    [token, user, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
