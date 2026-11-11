'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ShellContextValue = {
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * The desktop sidebar is intentionally fixed-width: with text-only navigation
 * there is no meaningful icon rail to collapse to. Mobile still uses a drawer.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const value = useMemo<ShellContextValue>(
    () => ({ mobileOpen, setMobileOpen }),
    [mobileOpen],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error('useShell must be used inside <ShellProvider>');
  }
  return context;
}
