/**
 * Default roles and permissions for a freshly provisioned tenant.
 *
 * Kept in sync with `packages/prisma-schemas/prisma/seeds/01-roles.ts`.
 * Provisioning used to create a TENANT_ADMIN role with no permissions, so the
 * first tenant admin could log in but every guarded endpoint returned 403.
 */
export const DEFAULT_ROLES = [
  'TENANT_ADMIN',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'LOGISTICS_MANAGER',
  'DRIVER',
  'CUSTOMER_CLIENT',
  'TENANT_USER',
] as const;

export const ADMIN_PERMISSIONS = [
  'inventory:read', 'inventory:adjust', 'warehouses:manage', 'tasks:read', 'tasks:create', 'tasks:update',
  'orders:read', 'orders:create', 'trips:read', 'trips:dispatch', 'vehicles:read', 'vehicles:manage',
  'drivers:manage', 'users:read', 'users:invite', 'roles:manage', 'settings:manage', 'audit-logs:read',
  'billing:read', 'api-keys:manage', 'notifications:read', 'mobile:sync:pull', 'mobile:sync:push',
  'mobile:uploads', 'mobile:gps:batch', 'mobile:sos', 'pack-station:scan', 'clients:manage', 'clients:read',
  'returns:read', 'returns:create', 'returns:approve', 'returns:inspect', 'returns:refund', 'tenant-dashboard:read',
];

export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  TENANT_ADMIN: ADMIN_PERMISSIONS,
  LOGISTICS_MANAGER: ADMIN_PERMISSIONS,
  WAREHOUSE_MANAGER: ADMIN_PERMISSIONS,
  WAREHOUSE_STAFF: ['inventory:read', 'tasks:read', 'tasks:update', 'mobile:sync:pull', 'mobile:sync:push', 'pack-station:scan'],
  DRIVER: ['trips:read', 'mobile:sync:pull', 'mobile:sync:push', 'mobile:uploads', 'mobile:gps:batch', 'mobile:sos'],
  CUSTOMER_CLIENT: ['orders:read', 'orders:create', 'inventory:read', 'notifications:read', 'returns:read', 'returns:create', 'billing:read'],
  TENANT_USER: ['inventory:read', 'orders:read', 'tasks:read', 'trips:read'],
};

export function permissionRows(roleId: string, permissions: string[]) {
  return permissions.map((permission) => {
    const [resource, action] = permission.split(':');
    return { roleId, resource, action };
  });
}
