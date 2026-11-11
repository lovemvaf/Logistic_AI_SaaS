'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import AIChatButton from '@/components/AIChatButton';
import { AppShell } from 'ui-kit';
import { ShellProvider } from 'ui-kit';
import { Sidebar, type NavSection } from 'ui-kit';
import { roleCanAccessPage, getDefaultPageForRole, AdminRole } from '@/lib/rbac';

const NAV_ITEM_ROLES: Record<string, AdminRole[]> = {
  '/admin/dashboard': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'LOGISTICS_MANAGER', 'DRIVER', 'CUSTOMER_CLIENT', 'TENANT_USER'],
  '/admin/orders': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'CUSTOMER_CLIENT'],
  '/admin/orders/new': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER'],
  '/admin/orders/upload': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER'],
  '/admin/shipments': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'LOGISTICS_MANAGER', 'DRIVER'],
  '/admin/tenants': ['SUPER_ADMIN', 'TENANT_ADMIN'],
  '/admin/geography': ['SUPER_ADMIN'],
  '/admin/billing': ['SUPER_ADMIN', 'TENANT_ADMIN'],
  '/admin/audit-logs': ['SUPER_ADMIN', 'TENANT_ADMIN'],
  '/admin/ai-models': ['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'LOGISTICS_MANAGER'],
  '/admin/profile': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'LOGISTICS_MANAGER', 'DRIVER', 'CUSTOMER_CLIENT', 'TENANT_USER'],
};
import { Topbar } from 'ui-kit';
import { ROLE_LABELS } from '@/lib/rbac';

const adminSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin/dashboard' },
      { label: 'Orders', href: '/admin/orders' },
      { label: 'Shipments', href: '/admin/shipments' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Tenants', href: '/admin/tenants' },
      { label: 'Dong Nai 2026 & DLQ', href: '/admin/geography' },
      { label: 'Billing', href: '/admin/billing' },
    ],
  },
  {
    title: 'AI',
    items: [
      { label: 'AI Models', href: '/admin/ai-models' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Audit logs', href: '/admin/audit-logs' },
      { label: 'Profile', href: '/admin/profile' },
    ],
  },
];

// Public admin routes that should render without the admin shell.
const ADMIN_PUBLIC_ROUTES = ['/admin/login', '/admin/forgot-password', '/admin/reset-password'];

function pageTitle(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  // Drop trailing resource ids so /admin/tenants/<uuid> still reads "Tenants".
  while (parts.length > 1 && /^[0-9a-f-]{8,}$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }
  if (parts.length <= 1) return 'Home';
  return parts[parts.length - 1]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function AdminChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const userRole = user?.role as AdminRole | undefined;

  const handleLogout = () => {
    logout();
    router.replace('/admin/login');
  };

  const filteredSections = adminSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const allowedRoles = NAV_ITEM_ROLES[item.href];
        if (!allowedRoles) return true;
        return userRole ? allowedRoles.includes(userRole) : false;
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <AppShell
      maxWidth="full"
      sidebar={
        <Sidebar
          brand={{
            name: 'SmartLogi',
            tagline: userRole ? (ROLE_LABELS[userRole] || 'Admin Portal') : 'Admin Portal',
            href: getDefaultPageForRole(userRole),
            initials: userRole ? userRole.split('_')[0][0] + 'A' : 'SA',
          }}
          sections={filteredSections}
          labels={{ navigation: 'Admin navigation' }}
        />
      }
      topbar={
        <Topbar
          title={pageTitle(pathname)}
          user={{ name: user?.email?.split('@')[0], email: user?.email, role: user?.role }}
          onLogout={handleLogout}
          logoutLabel="Logout"
        />
      }
      ai={<AIChatButton />}
    >
      {children}
    </AppShell>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, isLoading } = useAuth();

  const isPublicRoute = ADMIN_PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );

  useEffect(() => {
    if (!isPublicRoute && !isLoading && typeof window !== 'undefined' && !token) {
      router.push('/admin/login');
      return;
    }
    if (!isPublicRoute && token && user?.role && !roleCanAccessPage(user?.role, pathname)) {
      router.replace(getDefaultPageForRole(user?.role));
    }
  }, [isPublicRoute, isLoading, router, token, user?.role, pathname]);

  // Public auth pages — render children directly without sidebar/topbar.
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Wait for the stored session before deciding to redirect.
  if (isLoading || !token) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-ink">
        <div className="rounded-lg border border-border bg-surface px-6 py-4">
          <p className="text-sm font-medium text-ink-soft">
            {isLoading ? 'Checking session…' : 'Redirecting to login…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ShellProvider>
      <AdminChrome>{children}</AdminChrome>
    </ShellProvider>
  );
}
