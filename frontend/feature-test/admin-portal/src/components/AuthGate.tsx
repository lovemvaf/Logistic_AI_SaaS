'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

type AuthGateProps = {
  children: ReactNode;
};

// All routes that should be accessible without authentication
const PUBLIC_ROUTES = ['/login', '/admin/login', '/admin/forgot-password', '/admin/reset-password'];

export default function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(route + '/')
  );

  useEffect(() => {
    const token = getToken();
    if (!token && !isPublicRoute) {
      router.replace('/admin/login');
      return;
    }
    setChecked(true);
  }, [pathname, router, isPublicRoute]);

  if (!checked) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-ink">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Checking session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
