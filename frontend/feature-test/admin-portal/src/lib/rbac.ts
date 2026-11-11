'use client';

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'WAREHOUSE_MANAGER'
  | 'WAREHOUSE_STAFF'
  | 'LOGISTICS_MANAGER'
  | 'DRIVER'
  | 'CUSTOMER_CLIENT'
  | 'TENANT_USER';

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  TENANT_ADMIN: 'Tenant Admin',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  WAREHOUSE_STAFF: 'Warehouse Staff',
  LOGISTICS_MANAGER: 'Logistics Manager',
  DRIVER: 'Driver',
  CUSTOMER_CLIENT: 'Client',
  TENANT_USER: 'Tenant User',
};

export const PAGE_PERMISSIONS: Record<string, AdminRole[]> = {
  '/admin/dashboard': [
    'SUPER_ADMIN',
    'TENANT_ADMIN',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'LOGISTICS_MANAGER',
    'DRIVER',
    'CUSTOMER_CLIENT',
    'TENANT_USER',
  ],
  '/admin/orders': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'CUSTOMER_CLIENT'],
  '/admin/orders/new': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER'],
  '/admin/orders/upload': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER'],
  '/admin/shipments': [
    'SUPER_ADMIN',
    'TENANT_ADMIN',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'LOGISTICS_MANAGER',
    'DRIVER',
  ],
  '/admin/tenants': ['SUPER_ADMIN', 'TENANT_ADMIN'],
  '/admin/geography': ['SUPER_ADMIN'],
  '/admin/billing': ['SUPER_ADMIN', 'TENANT_ADMIN'],
  '/admin/audit-logs': ['SUPER_ADMIN', 'TENANT_ADMIN'],
  '/admin/ai-models': ['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'LOGISTICS_MANAGER'],
  '/admin/control-tower': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'LOGISTICS_MANAGER'],
  '/admin/pricing': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'LOGISTICS_MANAGER'],
  '/admin/ai-insights': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'LOGISTICS_MANAGER'],
  '/admin/cost-calculator': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'LOGISTICS_MANAGER'],
  '/admin/logistics-simulation': ['SUPER_ADMIN', 'TENANT_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'LOGISTICS_MANAGER'],
  '/admin/profile': [
    'SUPER_ADMIN',
    'TENANT_ADMIN',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'LOGISTICS_MANAGER',
    'DRIVER',
    'CUSTOMER_CLIENT',
    'TENANT_USER',
  ],
};

const ALL_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'LOGISTICS_MANAGER',
  'DRIVER',
  'CUSTOMER_CLIENT',
  'TENANT_USER',
];

export function roleCanAccessPage(role: string | undefined | null, pathname: string): boolean {
  if (!role) return false;
  const normalizedRole = role as AdminRole;
  if (!ALL_ROLES.includes(normalizedRole)) return false;

  const exactMatch = PAGE_PERMISSIONS[pathname];
  if (exactMatch) {
    return exactMatch.includes(normalizedRole);
  }

  const parentMatch = Object.entries(PAGE_PERMISSIONS).find(
    ([path]) => pathname.startsWith(path + '/') || pathname === path,
  );
  return parentMatch ? parentMatch[1].includes(normalizedRole) : true;
}

export function getAccessiblePages(role: string | undefined | null): string[] {
  if (!role || !ALL_ROLES.includes(role as AdminRole)) return [];
  return Object.entries(PAGE_PERMISSIONS)
    .filter(([_, roles]) => roles.includes(role as AdminRole))
    .map(([path]) => path);
}

export function getDefaultPageForRole(role: string | undefined | null): string {
  if (!role) return '/admin/login';
  const accessible = getAccessiblePages(role);
  return accessible.includes('/admin/dashboard') ? '/admin/dashboard' : accessible[0] || '/admin/login';
}

/* -------------------------------------------------------------------------- */
/* Role groups — drive what dashboard sections a role can see.               */
/* -------------------------------------------------------------------------- */

export const ROLE_GROUPS = {
  PLATFORM: ['SUPER_ADMIN', 'TENANT_ADMIN'] as AdminRole[],
  WAREHOUSE: ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'] as AdminRole[],
  LOGISTICS: ['LOGISTICS_MANAGER'] as AdminRole[],
  DELIVERY: ['DRIVER'] as AdminRole[],
  CLIENT: ['CUSTOMER_CLIENT', 'TENANT_USER'] as AdminRole[],
} as const;

/**
 * Returns the role group label for a given role, or 'NONE' if the role is
 * unknown / not set. Used by the dashboard to conditionally render sections.
 */
export function getRoleGroup(role: string | undefined | null): keyof typeof ROLE_GROUPS | 'NONE' {
  if (!role || !ALL_ROLES.includes(role as AdminRole)) return 'NONE';
  for (const [group, roles] of Object.entries(ROLE_GROUPS)) {
    if (roles.includes(role as AdminRole)) return group as keyof typeof ROLE_GROUPS;
  }
  return 'NONE';
}

/** Platform-level roles can see financial / tenant / user metrics. */
export function canViewFinancialData(role: string | undefined | null): boolean {
  return ROLE_GROUPS.PLATFORM.includes(role as AdminRole);
}

/** Operations roles (platform + warehouse + logistics + delivery) see logistics KPIs. */
export function canViewLogisticsKPIs(role: string | undefined | null): boolean {
  return [
    ...ROLE_GROUPS.PLATFORM,
    ...ROLE_GROUPS.WAREHOUSE,
    ...ROLE_GROUPS.LOGISTICS,
    ...ROLE_GROUPS.DELIVERY,
  ].includes(role as AdminRole);
}

/** AI model / insight features are gated to platform + warehouse + logistics. */
export function canViewAIModules(role: string | undefined | null): boolean {
  return [
    ...ROLE_GROUPS.PLATFORM,
    ...ROLE_GROUPS.WAREHOUSE,
    ...ROLE_GROUPS.LOGISTICS,
  ].includes(role as AdminRole);
}

/** Audit logs are only visible to platform-level administrators. */
export function canViewAuditLogs(role: string | undefined | null): boolean {
  return ROLE_GROUPS.PLATFORM.includes(role as AdminRole);
}

/** AI modules are gated to client-facing positions (platform + warehouse + logistics). */
export function canAccessAIInsights(role: string | undefined | null): boolean {
  return [
    ...ROLE_GROUPS.PLATFORM,
    ...ROLE_GROUPS.WAREHOUSE,
    ...ROLE_GROUPS.LOGISTICS,
  ].includes(role as AdminRole);
}

/** Pricing, cost and simulation tools are gated to operations roles. */
export function canAccessSimulation(role: string | undefined | null): boolean {
  return [
    ...ROLE_GROUPS.PLATFORM,
    ...ROLE_GROUPS.WAREHOUSE,
    ...ROLE_GROUPS.LOGISTICS,
  ].includes(role as AdminRole);
}

/** The pricing module is written to by platform and warehouse managers. */
export function canSetPricing(role: string | undefined | null): boolean {
  return ROLE_GROUPS.PLATFORM.includes(role as AdminRole) ||
    ROLE_GROUPS.WAREHOUSE.includes(role as AdminRole);
}

/** Cost calculator is a platform-level business tool. */
export function canUseCostCalculator(role: string | undefined | null): boolean {
  return ROLE_GROUPS.PLATFORM.includes(role as AdminRole) ||
    ROLE_GROUPS.LOGISTICS.includes(role as AdminRole);
}

