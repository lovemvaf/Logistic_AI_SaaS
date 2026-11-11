export type AppRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'WAREHOUSE_MANAGER'
  | 'WAREHOUSE_STAFF'
  | 'LOGISTICS_MANAGER'
  | 'DRIVER'
  | 'CUSTOMER_CLIENT'
  | 'TENANT_USER';

export type PermissionAction =
  | 'order:write'
  | 'wave:write'
  | 'inventory:write'
  | 'trip:write'
  | 'sos:write'
  | 'cod:write'
  | 'expense:write'
  | 'return:write'
  | 'ai:write'
  | 'client:write'
  | 'user:write'
  | 'apikey:write'
  | 'settings:write';

const ALL_ACTIONS: PermissionAction[] = [
  'order:write',
  'wave:write',
  'inventory:write',
  'trip:write',
  'sos:write',
  'cod:write',
  'expense:write',
  'return:write',
  'ai:write',
  'client:write',
  'user:write',
  'apikey:write',
  'settings:write',
];

/**
 * Mirrors `packages/shared-types/src/role-permission-map.ts`.
 * The server remains the authority; this matrix only hides controls the role
 * cannot use, so the UI never offers a guaranteed 403.
 */
const MATRIX: Record<AppRole, PermissionAction[]> = {
  SUPER_ADMIN: ALL_ACTIONS,
  TENANT_ADMIN: ALL_ACTIONS,
  WAREHOUSE_MANAGER: ['order:write', 'wave:write', 'inventory:write', 'return:write', 'expense:write'],
  WAREHOUSE_STAFF: ['inventory:write', 'wave:write'],
  LOGISTICS_MANAGER: [
    'order:write',
    'trip:write',
    'sos:write',
    'cod:write',
    'expense:write',
    'return:write',
  ],
  DRIVER: ['cod:write'],
  CUSTOMER_CLIENT: ['order:write', 'return:write'],
  TENANT_USER: [],
};

const ROUTE_ACCESS: Record<AppRole, string[]> = {
  SUPER_ADMIN: ['*'],
  TENANT_ADMIN: ['*'],
  WAREHOUSE_MANAGER: [
    '/dashboard',
    '/notifications',
    '/profile',
    '/orders',
    '/inventory',
    '/wms',
    '/warehouses',
    '/logistics/returns',
    '/logistics/expenses',
    '/finance/reports',
    '/admin/ai-insights',
    '/geography',
    '/yard',
  ],
  WAREHOUSE_STAFF: ['/dashboard', '/notifications', '/profile', '/orders', '/inventory', '/wms', '/geography', '/yard'],
  LOGISTICS_MANAGER: [
    '/dashboard',
    '/notifications',
    '/profile',
    '/orders',
    '/logistics',
    '/drivers',
    '/finance/cod',
    '/finance/reports',
    '/finance/freight',
    '/warehouses',
    '/admin/ai-insights',
    '/geography',
    '/freight',
    '/yard',
    '/trade',
  ],
  DRIVER: ['/dashboard', '/notifications', '/profile', '/drivers/my-trips', '/logistics/sos'],
  CUSTOMER_CLIENT: ['/dashboard', '/notifications', '/profile', '/orders'],
  TENANT_USER: [
    '/dashboard',
    '/notifications',
    '/profile',
    '/orders',
    '/inventory',
    '/geography',
    '/freight',
    '/yard',
    '/trade',
    '/finance/freight',
  ],
};

const normalize = (role: string | undefined | null): AppRole => {
  const value = (role || 'TENANT_USER').toUpperCase();
  return (value in MATRIX ? value : 'TENANT_USER') as AppRole;
};

export function can(role: string | undefined | null, action: PermissionAction): boolean {
  return MATRIX[normalize(role)].includes(action);
}

export function canAccessRoute(role: string | undefined | null, pathname: string): boolean {
  const allowed = ROUTE_ACCESS[normalize(role)];
  if (allowed.includes('*')) return true;
  return allowed.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function allowedRoutes(role: string | undefined | null): string[] {
  return ROUTE_ACCESS[normalize(role)];
}
