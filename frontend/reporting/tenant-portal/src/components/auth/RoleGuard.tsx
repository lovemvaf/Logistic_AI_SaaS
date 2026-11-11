'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  fallbackHref?: string;
}

export const RoleGuard = ({ children, allowedRoles, fallbackHref = '/login' }: RoleGuardProps) => {
  const router = useRouter();
  const { user, token } = useAuth();

  useEffect(() => {
    if (token && user && !allowedRoles.includes(user.role)) {
      router.replace(fallbackHref);
    }
  }, [user, token, allowedRoles, router, fallbackHref]);

  if (!token || !user) {
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
};
