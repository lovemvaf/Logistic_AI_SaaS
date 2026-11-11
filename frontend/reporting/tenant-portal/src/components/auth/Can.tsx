'use client';
import React from 'react';
import { useAuth } from '@/lib/auth-context';

interface CanProps {
  perform?: string;
  permission?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * RBAC: High-level component to handle granular permissions.
 * Used to conditionally render UI elements based on JWT permissions.
 */
export function Can({ perform, permission, children, fallback = null }: CanProps) {
  const { user } = useAuth();
  
  // SUPER_ADMIN and TENANT_ADMIN have access to everything
  if (user?.role === 'SUPER_ADMIN' || user?.role === 'TENANT_ADMIN') {
    return <>{children}</>;
  }

  const reqPerm = perform || permission;

  // Check if current user has the specific permission in their token
  // Backend provides 'permissions' array in JWT payload
  const hasPermission = (user as any)?.permissions?.includes(reqPerm);

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
