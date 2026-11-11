'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';

type AuthGateProps = {
  children: ReactNode;
};

const PUBLIC_PREFIXES = ['/login', '/forgot-password', '/reset-password'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isPublic(pathname)) {
      setChecked(true);
      return;
    }

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    const role = getUser()?.role;
    if (role && !canAccessRoute(role, pathname)) {
      router.replace('/dashboard');
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  if (!checked) {
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
