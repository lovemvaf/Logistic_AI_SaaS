/**
 * Role definitions used across the admin portal.
 * Mirrors `packages/shared-types/src/roles.ts`.
 */
export const ROLES: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  TENANT_ADMIN: 'Tenant Admin',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  WAREHOUSE_STAFF: 'Warehouse Staff',
  LOGISTICS_MANAGER: 'Logistics Manager',
  DRIVER: 'Driver',
  CUSTOMER_CLIENT: 'Customer Client',
  TENANT_USER: 'Tenant User',
};

export const ROLE_LIST = Object.entries(ROLES).map(([value, label]) => ({
  value,
  label,
}));
