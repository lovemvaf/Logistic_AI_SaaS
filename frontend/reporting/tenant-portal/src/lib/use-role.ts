'use client';

import { useCallback } from 'react';
import { useAuth } from './auth-context';
import { can, type PermissionAction } from './permissions';

export function useRole() {
  const { user } = useAuth();
  const role = user?.role || 'TENANT_USER';

  const allow = useCallback(
    (action: PermissionAction) => can(role, action),
    [role],
  );

  return { role, can: allow };
}
