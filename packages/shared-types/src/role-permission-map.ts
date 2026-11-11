import { Roles } from "./roles"

/**
 * Default permission map for each system role.
 * Used by seed script to create CustomRole entries with their RolePermission records.
 * SUPER_ADMIN is handled separately (SystemAdmin model, not CustomRole).
 */
export const RolePermissionMap: Record<string, string[]> = {
  [Roles.TENANT_ADMIN]: [
    "tenant-dashboard:read",
    "inventory:read",
    "inventory:adjust",
    "warehouses:manage",
    "tasks:read",
    "tasks:create",
    "tasks:update",
    "orders:read",
    "orders:create",
    "trips:read",
    "trips:dispatch",
    "vehicles:read",
    "vehicles:manage",
    "drivers:manage",
    "users:read",
    "users:invite",
    "roles:manage",
    "settings:manage",
    "audit-logs:read",
    "billing:read",
    "api-keys:manage",
    "notifications:read",
    "mobile:sync:pull",
    "mobile:sync:push",
    "mobile:uploads",
    "mobile:gps:batch",
    "mobile:sos",
    "pack-station:scan",
    "returns:read",
    "returns:create",
    "returns:approve",
    "returns:inspect",
    "returns:refund",
  ],

  [Roles.WAREHOUSE_MANAGER]: [
    "inventory:read",
    "inventory:adjust",
    "warehouses:manage",
    "tasks:read",
    "tasks:create",
    "tasks:update",
    "orders:read",
    "vehicles:read",
    "users:read",
    "notifications:read",
    "pack-station:scan",
  ],

  [Roles.WAREHOUSE_STAFF]: [
    "inventory:read",
    "tasks:read",
    "tasks:update",
    "mobile:sync:pull",
    "mobile:sync:push",
    "pack-station:scan",
  ],

  [Roles.LOGISTICS_MANAGER]: [
    "orders:read",
    "orders:create",
    "trips:read",
    "trips:dispatch",
    "vehicles:read",
    "vehicles:manage",
    "drivers:manage",
    "users:read",
    "notifications:read",
    "returns:read",
    "returns:create",
    "returns:approve",
  ],

  [Roles.DRIVER]: [
    "trips:read",
    "mobile:sync:pull",
    "mobile:sync:push",
    "mobile:uploads",
    "mobile:gps:batch",
    "mobile:sos",
  ],

  [Roles.CUSTOMER_CLIENT]: [
    "orders:read",
    "orders:create",
    "inventory:read",
    "notifications:read",
    "returns:read",
    "returns:create",
  ],

  [Roles.TENANT_USER]: [
    "inventory:read",
    "orders:read",
    "tasks:read",
    "trips:read",
  ],
} as const
