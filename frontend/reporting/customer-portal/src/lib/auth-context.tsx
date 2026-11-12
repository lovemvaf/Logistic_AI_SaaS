'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, setToken, setUserRecord, clearToken, getUser } from './auth';

interface AuthContextType {
  token: string | null;
  user: any | null;
  isAuthenticated: boolean;
  login: (token: string, customUser?: Record<string, any>) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const storedToken = getToken();
    const storedUser = getUser();
    if (storedToken) {
      setTokenState(storedToken);
      if (storedUser) setUser(storedUser);
      setIsLoading(false);
      return;
    }

    const hydrateCookie = async () => {
      try {
        const res = await fetch('/api/v1/demo/me', {
          credentials: 'include',
          headers: { 'x-smartlogi-portal': 'customer' },
        });
        if (active && !getToken() && res.ok) {
          const data = await res.json();
          if (active && !getToken() && data?.authenticated && data?.user) {
            setUserRecord(data.user);
            setUser(data.user);
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

  const login = useCallback((newToken: string, customUser?: Record<string, any>) => {
    setToken(newToken, customUser);
    setTokenState(newToken);
    const storedUser = getUser();
    if (storedUser) setUser(storedUser);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
    if (typeof window !== 'undefined') {
      void fetch('/api/v1/demo/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-smartlogi-portal': 'customer' },
      }).catch(() => undefined);
    }
  }, []);

  const isAuthenticated = Boolean(token || user);
  const value = useMemo(
    () => ({ token, user, isAuthenticated, login, logout, isLoading }),
    [token, user, isAuthenticated, login, logout, isLoading],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
