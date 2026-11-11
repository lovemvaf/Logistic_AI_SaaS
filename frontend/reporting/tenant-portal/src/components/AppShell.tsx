'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AuthGate from '@/components/AuthGate';
import AIChatButton from '@/components/AIChatButton';
import { AppShell } from 'ui-kit';
import { ShellProvider } from 'ui-kit';

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password');

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <AuthGate>
      <AppShell sidebar={<Sidebar />} topbar={<Header />} ai={<AIChatButton />}>
        {children}
      </AppShell>
    </AuthGate>
  );
}

export default function AppShellRoot({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <ShellInner>{children}</ShellInner>
    </ShellProvider>
  );
}
