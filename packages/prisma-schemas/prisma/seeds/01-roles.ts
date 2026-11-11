import { PrismaClient } from '@prisma/client';

export async function seedRoles(prisma: PrismaClient, tenantId?: string) {
  console.log('--- Seeding Roles and Permissions ---');

  const resolvedTenantId =
    tenantId ??
    (await prisma.tenant.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } }))?.id;
  if (!resolvedTenantId) {
    throw new Error('Cannot seed roles without an existing Tenant row');
  }

  const roles = [
    'TENANT_ADMIN',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'LOGISTICS_MANAGER',
    'DRIVER',
    'CUSTOMER_CLIENT',
    'TENANT_USER',
  ];

  const rolePermissionMap: Record<string, string[]> = {
    TENANT_ADMIN: [
      'tenant-dashboard:read', 'inventory:read', 'inventory:adjust', 'warehouses:manage',
      'tasks:read', 'tasks:create', 'tasks:update', 'orders:read', 'orders:create',
      'trips:read', 'trips:dispatch', 'vehicles:read', 'vehicles:manage', 'drivers:manage',
      'users:read', 'users:invite', 'roles:manage', 'settings:manage', 'audit-logs:read',
      'billing:read', 'clients:manage', 'clients:read', 'api-keys:manage', 'notifications:read',
      'mobile:sync:pull', 'mobile:sync:push', 'mobile:uploads', 'mobile:gps:batch', 'mobile:sos',
      'pack-station:scan', 'returns:read', 'returns:create', 'returns:approve', 'returns:inspect',
      'returns:refund', 'geography:read', 'freight:read', 'freight:manage', 'yard:read',
      'yard:manage', 'trade:read', 'trade:approve', 'pricing:read', 'pricing:manage',
      'tracking-grants:manage',
    ],
    WAREHOUSE_MANAGER: [
      'inventory:read', 'inventory:adjust', 'warehouses:manage', 'tasks:read', 'tasks:create',
      'tasks:update', 'orders:read', 'vehicles:read', 'users:read', 'notifications:read',
      'pack-station:scan', 'returns:read', 'returns:create', 'returns:approve', 'returns:inspect',
      'geography:read', 'freight:read', 'yard:read', 'yard:manage',
    ],
    WAREHOUSE_STAFF: [
      'inventory:read', 'tasks:read', 'tasks:update', 'mobile:sync:pull', 'mobile:sync:push',
      'pack-station:scan', 'geography:read', 'yard:read',
    ],
    LOGISTICS_MANAGER: [
      'orders:read', 'orders:create', 'trips:read', 'trips:dispatch', 'vehicles:read',
      'vehicles:manage', 'drivers:manage', 'users:read', 'notifications:read', 'returns:read',
      'returns:create', 'returns:approve', 'geography:read', 'freight:read', 'freight:manage',
      'yard:read', 'yard:manage', 'trade:read', 'pricing:read', 'tracking-grants:manage',
    ],
    DRIVER: [
      'trips:read', 'mobile:sync:pull', 'mobile:sync:push', 'mobile:uploads',
      'mobile:gps:batch', 'mobile:sos',
    ],
    CUSTOMER_CLIENT: [
      'orders:read', 'orders:create', 'inventory:read', 'billing:read', 'notifications:read', 'returns:read',
      'returns:create', 'geography:read', 'freight:read', 'freight:manage', 'trade:read',
      'pricing:read', 'tracking-grants:manage',
    ],
    TENANT_USER: [
      'inventory:read', 'orders:read', 'tasks:read', 'trips:read', 'geography:read',
      'freight:read', 'yard:read', 'trade:read', 'pricing:read',
    ],
  };

  const roleIds: Record<string, string> = {};

  for (const roleName of roles) {
    let role = await prisma.customRole.findFirst({
      where: { tenantId: resolvedTenantId, name: roleName },
    });
    if (!role) {
      role = await prisma.customRole.create({
        data: { tenantId: resolvedTenantId, name: roleName, isSystemDefault: true },
      });
    }
    roleIds[roleName] = role.id;

    const perms = rolePermissionMap[roleName] || [];
    for (const p of perms) {
      const idx = p.indexOf(':');
      const resource = idx >= 0 ? p.slice(0, idx) : p;
      const actionName = idx >= 0 ? p.slice(idx + 1) : '';
      const existingPerm = await prisma.rolePermission.findFirst({
        where: { tenantId: resolvedTenantId, roleId: role.id, resource, action: actionName },
      });
      if (!existingPerm) {
        await prisma.rolePermission.create({
          data: { tenantId: resolvedTenantId, roleId: role.id, resource, action: actionName },
        });
      }
    }
  }

  return roleIds;
}
