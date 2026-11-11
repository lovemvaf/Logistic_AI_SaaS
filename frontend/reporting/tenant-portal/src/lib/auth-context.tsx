'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { clearSession, getToken, getUser, setSession } from './auth';

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
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  setAuthToken: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = getUser();
    if (storedUser) setUser(storedUser);
    const storedToken = getToken();
    if (storedToken) setToken(storedToken);
  }, []);

  const setAuthToken = (newToken: string) => {
    setSession(newToken);
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
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, setAuthToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
