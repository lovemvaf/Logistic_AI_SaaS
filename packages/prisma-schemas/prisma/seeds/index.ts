if (!process.env.DATABASE_URL) {
  console.error('[Seeder] DATABASE_URL is required. Refusing to guess a database.');
  process.exit(1);
}

import { PrismaClient } from '@prisma/client';
import { ensureTenant } from './00-tenant';
import { seedRoles } from './01-roles';
import { seedUsers } from './02-users';
import { seedWarehouses } from './03-warehouses';
import { seedCatalogAndInventory } from './04-catalog-inventory';
import { seedFleetAndDrivers } from './05-fleet-drivers';
import { seedClientsAndOrders } from './06-clients-orders';
import { seedTripsAndTasks } from './07-trips';
import { seedTrackingAndAi } from './08-tracking-ai';
import { seedFinanceAndReturns } from './09-finance-returns';
import { seedAdvancedFleet } from './10-advanced-fleet';
import { seedAdvancedWarehouse } from './11-advanced-warehouse';
import { seedSystemAndTenant } from './12-system-tenant';

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log('🧹 Wiping existing data...');
  try {
    // System-level records first (top of the hierarchy)
    await prisma.systemAdmin.deleteMany();
    await prisma.systemSetting.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.clientUser.deleteMany();
    await prisma.shippingRate.deleteMany();
    await prisma.tenantApiKey.deleteMany();
    await prisma.clientApiKey.deleteMany();
    await prisma.featureFlag.deleteMany();
    await prisma.tenantSetting.deleteMany();
    await prisma.tenantUiConfig.deleteMany();
    // `Tenant` phải xoá SAU các bảng có FK tới nó
    // (invoices, payment_transactions, api_usage_daily, tenant_api_keys,
    //  feature_flags, tenant_settings, tenant_ui_configs).

    // Notification & AI
    await prisma.notification.deleteMany();
    await prisma.notificationTemplate.deleteMany();
    await prisma.aiFeedback.deleteMany();
    await prisma.aiModel.deleteMany();
    await prisma.demandForecast.deleteMany();
    await prisma.routeOptimizationJob.deleteMany();

    // Tracking & Logistics
    await prisma.taskItem.deleteMany();
    await prisma.task.deleteMany();
    await prisma.delivery.deleteMany();
    await prisma.tripStop.deleteMany();
    await prisma.gpsTrackingLog.deleteMany();
    await prisma.driverExpense.deleteMany();
    await prisma.codRemittance.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.orderTrackingEvent.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.sosAlert.deleteMany();

    // Returns & Finance
    await prisma.returnItem.deleteMany();
    await prisma.returnRequest.deleteMany();
    await prisma.returnReason.deleteMany();
    await prisma.returnInspection.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.paymentTransaction.deleteMany();
    await prisma.invoiceLineItem.deleteMany();
    await prisma.invoice.deleteMany();

    // Clients & Orders
    await prisma.clientWebhook.deleteMany();
    await prisma.client.deleteMany();
    await prisma.order.deleteMany();

    // Fleet
    await prisma.geofence.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.equipmentCheckout.deleteMany();
    await prisma.staffShift.deleteMany();

    // Inventory
    await prisma.adjustment.deleteMany();
    await prisma.cycleCount.deleteMany();
    await prisma.scanLog.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.packStationLog.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.bin.deleteMany();
    await prisma.rack.deleteMany();
    await prisma.zone.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.wavePicking.deleteMany();
    await prisma.fileAttachment.deleteMany();

    // Users & Roles
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.customRole.deleteMany();
    await prisma.tenantUser.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.apiUsageDaily.deleteMany();

    // Cuối cùng mới xoá tenant (sau mọi bảng tham chiếu tới nó).
    await prisma.tenant.deleteMany();
  } catch (e) {
    // Không được nuốt lỗi: nếu xoá dở thì seed sẽ ghi đè lên dữ liệu cũ
    // và báo lỗi khó hiểu ở bước createMany.
    console.error('Error wiping database:', e);
    throw e;
  }
}

async function main() {
  console.log('🚀 Starting Enterprise Data Seeding (Scale: 400 Employees)...');

  try {
    const forceReseed = process.env.FORCE_RESEED === 'true';

    if (forceReseed) {
      console.log('⚠️  FORCE_RESEED=true — wiping existing data before seeding.');
      await clearDatabase();
    } else {
      // Idempotent by default: only seed an empty database. Re-running the
      // container must never wipe or duplicate data.
      const existing = await prisma.tenant.count();
      if (existing > 0) {
        console.log('🔒 Database already seeded — skipping (set FORCE_RESEED=true to wipe and reseed).');
        return;
      }
      console.log('🌱 Empty database detected — seeding.');
    }
    
    // 0. Tenant - must exist before any business row is written, because the
    //    `tenant_id` default resolves the tenant from the current schema.
    await ensureTenant(prisma);

    // 1. Roles
    const roleIds = await seedRoles(prisma);

    // 2. Users
    await seedUsers(prisma, roleIds);

    // 3. Warehouses & Locations
    await seedWarehouses(prisma);

    // 4. Catalog & Inventory
    await seedCatalogAndInventory(prisma);

    // 5. Fleet & Drivers
    await seedFleetAndDrivers(prisma);

    // 6. Clients & Orders
    await seedClientsAndOrders(prisma);

    // 7. Trips, Deliveries & Tasks
    await seedTripsAndTasks(prisma);

    // 8. Tracking & AI
    await seedTrackingAndAi(prisma);

    // 9. Finance & Returns
    await seedFinanceAndReturns(prisma);

    // 10. Advanced Fleet
    await seedAdvancedFleet(prisma);

    // 11. Advanced Warehouse
    await seedAdvancedWarehouse(prisma);

    // 12. System & Tenant
    await seedSystemAndTenant(prisma);

    console.log('✨ All seed data successfully generated!');
  } catch (e) {
    console.error('❌ Seeding failed: ', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
