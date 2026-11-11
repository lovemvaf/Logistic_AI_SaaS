'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from 'ui-kit';
import { ShellProvider } from 'ui-kit';
import { Sidebar, type NavSection } from 'ui-kit';
import { Topbar } from 'ui-kit';

const customerSections: NavSection[] = [
  {
    title: 'B2B Dashboard',
    items: [
      { label: 'Dashboard', href: '/client/dashboard' },
      { label: 'Orders', href: '/client/orders' },
      { label: 'Freight B2B', href: '/client/freight' },
      { label: 'Orders Upload', href: '/client/orders/upload' },
      { label: 'Inventory', href: '/client/inventory' },
      { label: 'Webhooks', href: '/client/webhooks' },
      { label: 'Invoices', href: '/client/invoices' },
      { label: 'Returns', href: '/client/returns' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Profile', href: '/client/profile' },
    ],
  },
];

function pageTitle(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? 'Dashboard';
  return last.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function CustomerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/client/login');
  };

  return (
    <AppShell
      maxWidth="full"
      sidebar={
        <Sidebar
          brand={{
            name: 'SmartLogi',
            tagline: 'Customer Portal',
            href: '/client/dashboard',
            initials: 'SL',
          }}
          sections={customerSections}
          labels={{ navigation: 'Customer navigation' }}
        />
      }
      topbar={
        <Topbar
          title={pageTitle(pathname)}
          user={{ name: user?.fullName ?? user?.name, email: user?.email, role: user?.role }}
          onLogout={handleLogout}
          logoutLabel="Logout"
          showNotifications
        />
      }
    >
      {children}
    </AppShell>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublicRoute = [
    '/client/login',
    '/client/forgot-password',
    '/client/reset-password',
    '/client/demo-handoff',
    '/demo-handoff',
    '/build-info',
  ].some((route) => pathname === route || pathname.startsWith(route + '/'));

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicRoute) {
      router.push('/client/login');
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router, pathname]);

  // Login / forgot / reset must stay reachable without a session.
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Wait for the stored session to be read before deciding to redirect.
  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <ShellProvider>
      <CustomerChrome>{children}</CustomerChrome>
    </ShellProvider>
  );
}
