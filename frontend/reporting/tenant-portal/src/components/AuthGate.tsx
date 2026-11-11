'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { canAccessRoute } from '@/lib/permissions';

type AuthGateProps = {
  children: ReactNode;
};

const PUBLIC_PREFIXES = ['/login', '/forgot-password', '/reset-password', '/demo-handoff', '/build-info'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, user } = useAuth();

  const publicRoute = isPublic(pathname);

  useEffect(() => {
    if (publicRoute || isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    const role = user?.role;
    if (role && !canAccessRoute(role, pathname)) {
      router.replace('/dashboard');
    }
  }, [publicRoute, isLoading, isAuthenticated, user?.role, pathname, router]);

  if (publicRoute) {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="border-l-2 border-line-strong py-1 pl-3 text-[12px] text-ink-faint">
          Đang kiểm tra phiên đăng nhập…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
