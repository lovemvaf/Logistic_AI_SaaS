'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type AuthGateProps = {
  children: ReactNode;
};

const PUBLIC_ROUTES = [
  '/login',
  '/admin/login',
  '/admin/forgot-password',
  '/admin/reset-password',
  '/demo-handoff',
  '/build-info',
];

export default function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );

  useEffect(() => {
    if (!isPublicRoute && !isLoading && !isAuthenticated) {
      router.replace('/admin/login');
    }
  }, [isPublicRoute, isLoading, isAuthenticated, router]);

  if (!isPublicRoute && (isLoading || !isAuthenticated)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-ink">
        <div className="rounded-2xl border border-line bg-surface px-6 py-4 shadow-sm">
          <p className="text-sm font-medium text-ink-soft">Checking session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
