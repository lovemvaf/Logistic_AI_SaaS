'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';
import AuthGate from './AuthGate';

type AppShellProps = {
  children: ReactNode;
};

// Routes that should render without the shell (auth pages, admin public routes)
const PUBLIC_ROUTES = ['/login', '/admin/login', '/admin/forgot-password', '/admin/reset-password'];

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(route + '/')
  );

  // Public auth routes — render children without shell
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Admin routes — let the /admin/layout.tsx handle its own Sidebar + TopBar.
  // The root AppShell must NOT render a second sidebar/header here, otherwise
  // every admin page gets a double sidebar + double header.
  if (pathname.startsWith('/admin')) {
    return <AuthGate>{children}</AuthGate>;
  }

  // Non-admin protected routes — render with the root shell
  return (
    <AuthGate>
      <div className="flex min-h-[100dvh] bg-background text-ink">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-[100dvh]">
          <Header />
          <main className="px-8 py-8">
            <div className="max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
