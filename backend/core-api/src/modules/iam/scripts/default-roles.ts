import { RolePermissionMap, Roles } from 'shared-types';

/**
 * Default roles and permissions for a freshly provisioned tenant.
 * Kept in sync with `packages/shared-types/src/role-permission-map.ts`.
 */
export const DEFAULT_ROLES = [
  Roles.TENANT_ADMIN,
  Roles.WAREHOUSE_MANAGER,
  Roles.WAREHOUSE_STAFF,
  Roles.LOGISTICS_MANAGER,
  Roles.DRIVER,
  Roles.CUSTOMER_CLIENT,
  Roles.TENANT_USER,
] as const;

export const ROLE_PERMISSION_MAP: Record<string, readonly string[]> = RolePermissionMap;

export function permissionRows(roleId: string, permissions: readonly string[]) {
  return permissions.map((permission) => {
    const idx = permission.indexOf(':');
    const resource = idx >= 0 ? permission.slice(0, idx) : permission;
    const action = idx >= 0 ? permission.slice(idx + 1) : '';
    return { roleId, resource, action };
  });
}
