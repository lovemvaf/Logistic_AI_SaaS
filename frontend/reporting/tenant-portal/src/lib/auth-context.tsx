'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { clearSession, getToken, getUser, setSession, setUserRecord } from './auth';

export type UserRole =
  | 'TENANT_ADMIN'
  | 'WAREHOUSE_MANAGER'
  | 'LOGISTICS_MANAGER'
  | 'DRIVER'
  | 'WAREHOUSE_STAFF'
  | 'SUPER_ADMIN'
  | 'TENANT_USER';

interface User {
  id: string;
  sub?: string;
  fullName?: string;
  email: string;
  role: UserRole | string;
  tenantId?: string;
  slug?: string;
  readOnlyGuest?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAuthToken: (token: string, overrideUser?: Record<string, any>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const storedUser = getUser();
    const storedToken = getToken();
    if (storedToken) {
      setToken(storedToken);
      if (storedUser) setUser(storedUser);
      setIsLoading(false);
      return;
    }

    const hydrateCookie = async () => {
      try {
        const res = await fetch('/api/v1/demo/me', {
          credentials: 'include',
          headers: { 'x-smartlogi-portal': 'tenant' },
        });
        if (active && res.ok) {
          const data = await res.json();
          if (data?.authenticated && data?.user) {
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

  const setAuthToken = (newToken: string, overrideUser?: Record<string, any>) => {
    setSession(newToken, overrideUser);
    setToken(newToken);
    const storedUser = getUser();
    if (storedUser) setUser(storedUser);
  };

  const logout = () => {
    clearSession();
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    if (typeof window !== 'undefined') {
      void fetch('/api/v1/demo/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-smartlogi-portal': 'tenant' },
      }).catch(() => undefined);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated: Boolean(token || user), setAuthToken, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
