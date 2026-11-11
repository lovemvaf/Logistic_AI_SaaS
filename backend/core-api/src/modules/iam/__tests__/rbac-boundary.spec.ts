import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (val: string) => `mock-hash:${val}`),
  compare: jest.fn(async () => true),
}));

import { Permissions, PermissionsGuard, RolePermissionMap, Roles } from 'shared-types';
import { AdminTenantsController } from '../controllers/admin-tenants.controller';
import { AdminBillingController } from '../controllers/admin-billing.controller';
import { AdminDashboardController } from '../controllers/admin-dashboard.controller';
import { AdminAuditLogsController } from '../controllers/admin-audit-logs.controller';
import { TenantAuditLogsController } from '../controllers/tenant-audit-logs.controller';
import { TenantBillingController } from '../controllers/tenant-billing.controller';
import { ClientInvoicesController } from '../../customer/controllers/client-invoices.controller';
import { OrdersController } from '../../orders/controllers/orders.controller';
import { ReturnsController } from '../../orders/controllers/returns.controller';
import { WarehouseOpsController } from '../../wms/controllers/warehouse-ops.controller';
import { WarehousesController } from '../../wms/warehouses/warehouses.controller';
import { CodRemittancesController } from '../../logistics/controllers/cod-remittances.controller';

function makeContext(
  ControllerClass: Function,
  methodName: string,
  user: Record<string, any> | undefined,
): ExecutionContext {
  const handler = ControllerClass.prototype[methodName];
  if (typeof handler !== 'function') {
    throw new Error(`Handler ${ControllerClass.name}.${methodName} does not exist`);
  }

  return {
    getClass: () => ControllerClass as any,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('RBAC Boundary Enforcement (PermissionsGuard + Controller Decorators)', () => {
  const guard = new PermissionsGuard();

  const tenantAdminUser = {
    sub: 'user-tenant-admin',
    role: Roles.TENANT_ADMIN,
    tenant_id: 'tenant-1',
    permissions: RolePermissionMap[Roles.TENANT_ADMIN],
  };

  const forgedTenantAdminUser = {
    sub: 'user-forged-tenant-admin',
    role: Roles.TENANT_ADMIN,
    tenant_id: 'tenant-1',
    permissions: Object.values(Permissions),
  };

  const superAdminUser = {
    sub: 'user-super-admin',
    role: Roles.SUPER_ADMIN,
    permissions: [Permissions.BillingRead, Permissions.AuditLogsRead],
  };

  const customerClientUser = {
    sub: 'user-customer',
    role: Roles.CUSTOMER_CLIENT,
    tenant_id: 'tenant-1',
    permissions: [
      ...RolePermissionMap[Roles.CUSTOMER_CLIENT],
      Permissions.BillingRead,
      Permissions.PackStationScan,
      Permissions.ReturnsApprove,
      Permissions.ReturnsRefund,
    ],
  };

  const driverUser = {
    sub: 'user-driver',
    role: Roles.DRIVER,
    tenant_id: 'tenant-1',
    permissions: [
      ...RolePermissionMap[Roles.DRIVER],
      Permissions.InventoryRead,
    ],
  };

  const warehouseStaffUser = {
    sub: 'user-wh-staff',
    role: Roles.WAREHOUSE_STAFF,
    tenant_id: 'tenant-1',
    permissions: RolePermissionMap[Roles.WAREHOUSE_STAFF],
  };

  const defaultCustomerUser = {
    sub: 'user-customer-default',
    role: Roles.CUSTOMER_CLIENT,
    tenant_id: 'tenant-1',
    permissions: RolePermissionMap[Roles.CUSTOMER_CLIENT],
  };

  describe('Platform Admin routes deny TENANT_ADMIN (even with shared or forged permissions)', () => {
    const adminRoutes: Array<[Function, string]> = [
      [AdminTenantsController, 'list'],
      [AdminTenantsController, 'detail'],
      [AdminTenantsController, 'create'],
      [AdminTenantsController, 'update'],
      [AdminTenantsController, 'remove'],
      [AdminBillingController, 'listInvoicesPaginated'],
      [AdminBillingController, 'listPlans'],
      [AdminBillingController, 'createInvoice'],
      [AdminBillingController, 'createPayment'],
      [AdminDashboardController, 'stats'],
      [AdminDashboardController, 'logistics'],
      [AdminAuditLogsController, 'list'],
      [AdminAuditLogsController, 'distinctActions'],
    ];

    it.each(adminRoutes)(
      'rejects TENANT_ADMIN on %p.%s',
      (ctrl, method) => {
        expect(guard.canActivate(makeContext(ctrl, method, tenantAdminUser))).toBe(false);
        expect(guard.canActivate(makeContext(ctrl, method, forgedTenantAdminUser))).toBe(false);
      },
    );

    it.each(adminRoutes)(
      'allows SUPER_ADMIN on %p.%s after passing @RequireRoles',
      (ctrl, method) => {
        expect(guard.canActivate(makeContext(ctrl, method, superAdminUser))).toBe(true);
      },
    );

    it('enforces Permissions.BillingManage on AdminBillingController write endpoints', () => {
      const createInvoicePerms = Reflect.getMetadata(
        'permissions',
        AdminBillingController.prototype.createInvoice,
      );
      const createPaymentPerms = Reflect.getMetadata(
        'permissions',
        AdminBillingController.prototype.createPayment,
      );
      expect(createInvoicePerms).toEqual([Permissions.BillingManage]);
      expect(createPaymentPerms).toEqual([Permissions.BillingManage]);
    });
  });

  describe('Internal tenant routes exclude CUSTOMER_CLIENT (even with matching permissions)', () => {
    const internalRoutes: Array<[Function, string]> = [
      [OrdersController, 'listOrders'],
      [OrdersController, 'createOrder'],
      [OrdersController, 'getOrder'],
      [ReturnsController, 'createReturnRequest'],
      [ReturnsController, 'listReturnRequests'],
      [ReturnsController, 'getReturnRequest'],
      [ReturnsController, 'approveReturnRequest'],
      [ReturnsController, 'processRefund'],
      [WarehouseOpsController, 'getPackSummary'],
      [WarehouseOpsController, 'scanPackItem'],
      [WarehouseOpsController, 'startShift'],
      [CodRemittancesController, 'listRemittances'],
      [CodRemittancesController, 'approveRemittance'],
      [TenantAuditLogsController, 'list'],
      [TenantAuditLogsController, 'distinctActions'],
      [TenantBillingController, 'getPlan'],
      [TenantBillingController, 'getInvoices'],
      [WarehousesController, 'list'],
      [WarehousesController, 'detail'],
    ];

    it.each(internalRoutes)(
      'blocks CUSTOMER_CLIENT from internal route %p.%s',
      (ctrl, method) => {
        expect(guard.canActivate(makeContext(ctrl, method, customerClientUser))).toBe(false);
        expect(guard.canActivate(makeContext(ctrl, method, defaultCustomerUser))).toBe(false);
      },
    );

    it('still permits CUSTOMER_CLIENT to read reference return-reasons & self-service client invoices', () => {
      expect(
        guard.canActivate(makeContext(ReturnsController, 'listReturnReasons', customerClientUser)),
      ).toBe(true);
      expect(
        guard.canActivate(makeContext(ClientInvoicesController, 'list', defaultCustomerUser)),
      ).toBe(true);
      expect(
        guard.canActivate(makeContext(ClientInvoicesController, 'pay', defaultCustomerUser)),
      ).toBe(true);
    });

    it('allows WAREHOUSE_STAFF read-only access to warehouses while blocking mutations', () => {
      expect(
        guard.canActivate(makeContext(WarehousesController, 'list', warehouseStaffUser)),
      ).toBe(true);
      expect(
        guard.canActivate(makeContext(WarehousesController, 'detail', warehouseStaffUser)),
      ).toBe(true);
      expect(
        guard.canActivate(makeContext(WarehousesController, 'create', warehouseStaffUser)),
      ).toBe(false);
      expect(
        guard.canActivate(makeContext(WarehousesController, 'update', warehouseStaffUser)),
      ).toBe(false);
    });
  });

  describe('Driver role boundary checks', () => {
    it('blocks DRIVER from CodRemittancesController endpoints', () => {
      expect(
        guard.canActivate(makeContext(CodRemittancesController, 'listRemittances', driverUser)),
      ).toBe(false);
      expect(
        guard.canActivate(makeContext(CodRemittancesController, 'approveRemittance', driverUser)),
      ).toBe(false);
    });

    it('blocks DRIVER from WarehouseOpsController pack endpoints (missing PackStationScan/InventoryRead or excluded)', () => {
      expect(
        guard.canActivate(makeContext(WarehouseOpsController, 'scanPackItem', driverUser)),
      ).toBe(false);
      expect(
        guard.canActivate(makeContext(WarehouseOpsController, 'startShift', driverUser)),
      ).toBe(false);
    });

    it('blocks unauthenticated requests whenever roles/permissions are present', () => {
      expect(
        guard.canActivate(makeContext(OrdersController, 'listOrders', undefined)),
      ).toBe(false);
      expect(
        guard.canActivate(makeContext(AdminTenantsController, 'list', undefined)),
      ).toBe(false);
    });
  });
});
