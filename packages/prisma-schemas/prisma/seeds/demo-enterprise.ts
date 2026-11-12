import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { seedRoles } from './01-roles';

type ActionMode = 'seed' | 'reset' | 'verify' | 'bootstrap' | 'reset-session' | 'cleanup-expired' | 'diagnose';

const DEMO_TENANT_IDS = {
  DN3PL: '30000000-0000-4000-8000-000000000001',
  FDIBH: '40000000-0000-4000-8000-000000000001',
  LMLK: '50000000-0000-4000-8000-000000000001',
  SUSPENDED: '60000000-0000-4000-8000-000000000001',
} as const;

const ALL_DEMO_TENANT_IDS = Object.values(DEMO_TENANT_IDS);

const DEMO_SUPER_ADMIN_EMAIL = 'superadmin@smartlogi.demo';

interface DongNaiUnitEntry {
  canonicalName: string;
  normalizedName: string;
  unitType: 'WARD' | 'COMMUNE';
  corridor: 'NORTH' | 'CENTRAL' | 'SOUTH';
  officialCodeStatus: 'PENDING_OFFICIAL_CODE';
  boundaryStatus: 'NO_OFFICIAL_POLYGON';
  sourceDoc: string;
}

interface DongNaiAliasEntry {
  unitNormalizedName: string;
  unitType: 'WARD' | 'COMMUNE';
  aliasName: string;
  aliasType: 'PRE_2025_NAME' | 'COMMON_VARIANT' | 'ABBREVIATION';
}

function loadDongNaiCatalog(): {
  units: DongNaiUnitEntry[];
  aliases: DongNaiAliasEntry[];
  normalizeVietnameseAdminName: (input: string) => string;
  normalizeVietnameseAliasKey: (input: string) => string;
} {
  const distPath = path.resolve(__dirname, '../../../shared-types/dist/dong-nai-2026.js');
  const srcPath = path.resolve(__dirname, '../../../shared-types/src/dong-nai-2026.ts');
  const target = fs.existsSync(distPath) ? distPath : srcPath;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(target);
  return {
    units: mod.DONG_NAI_2026_UNITS,
    aliases: mod.DONG_NAI_PRE_2025_ALIASES,
    normalizeVietnameseAdminName: mod.normalizeVietnameseAdminName,
    normalizeVietnameseAliasKey: mod.normalizeVietnameseAliasKey || mod.normalizeVietnameseAdminName,
  };
}

function parseAction(): ActionMode {
  const arg = process.argv.find((a) => a.startsWith('--action='));
  const raw = (arg ? arg.split('=')[1] : 'seed').toLowerCase();
  if (
    raw === 'seed' ||
    raw === 'reset' ||
    raw === 'verify' ||
    raw === 'bootstrap' ||
    raw === 'reset-session' ||
    raw === 'cleanup-expired' ||
    raw === 'diagnose'
  ) {
    return raw;
  }
  throw new Error(
    `Unsupported --action=${raw}. Use seed | reset | verify | bootstrap | reset-session | cleanup-expired | diagnose.`,
  );
}

function parseArgValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

function assertSafeEnvironment(action: ActionMode): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('[demo-enterprise] DATABASE_URL is required.');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('[demo-enterprise] REFUSING to run when NODE_ENV=production.');
  }

  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    throw new Error('[demo-enterprise] Invalid DATABASE_URL format.');
  }

  const host = (parsed.hostname || '').toLowerCase();
  const dbName = (parsed.pathname || '').replace(/^\//, '').toLowerCase();
  const extraHosts = (process.env.DEMO_ALLOWED_DB_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db', 'smartlogi-postgres', ...extraHosts]);

  if (!allowedHosts.has(host)) {
    throw new Error(
      `[demo-enterprise] REFUSING to target non-whitelisted DB host "${host}". Add to DEMO_ALLOWED_DB_HOSTS only for isolated non-prod sandboxes.`,
    );
  }

  if (/(^|[_-])prod(uction)?($|[_-])/i.test(dbName)) {
    throw new Error(`[demo-enterprise] REFUSING to run against database "${dbName}" whose name looks like production.`);
  }

  if ((action === 'seed' || action === 'reset' || action === 'bootstrap' || action === 'reset-session' || action === 'cleanup-expired') && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      '[demo-enterprise] ALLOW_DEMO_SEED=true is required to mutate demo data (safety guard against accidental seeding).',
    );
  }
}

function genPassword(envKey: string): string {
  const fromEnv = process.env[envKey];
  if (fromEnv && fromEnv.trim().length >= 8) {
    return fromEnv.trim();
  }
  // Runtime-generated credential never stored in source control
  return `SlgDemo!${crypto.randomBytes(8).toString('hex')}`;
}

function detUuid(prefixHex8: string, seq: number): string {
  const tail = seq.toString(16).padStart(12, '0');
  return `${prefixHex8}-0000-4000-8000-${tail}`;
}

async function resetDemoData(prisma: PrismaClient): Promise<void> {
  console.log('--- Resetting Demo Enterprise Data (scoped strictly to demo UUIDs) ---');

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);

      const tenantFilter = { in: ALL_DEMO_TENANT_IDS };

      // 0. Demo Control Plane cleanup for demo tenants
      await tx.demoSimulationEvent.deleteMany({
        where: { OR: [{ tenantId: tenantFilter }, { sandboxKey: 'shared-demo' }, { sandboxKey: { startsWith: 'sbx-' } }] },
      });
      await tx.demoHandoffToken.deleteMany({
        where: { OR: [{ tenantId: tenantFilter }, { sandboxKey: 'shared-demo' }, { sandboxKey: { startsWith: 'sbx-' } }] },
      });
      await tx.demoSandbox.deleteMany({
        where: { OR: [{ tenantId: tenantFilter }, { sandboxKey: 'shared-demo' }, { sandboxKey: { startsWith: 'sbx-' } }] },
      });

      // 1. Outbox & webhook deliveries for demo tenants
      await tx.webhookDelivery.deleteMany({
        where: { OR: [{ tenantId: tenantFilter }, { id: { startsWith: '30000000-' } }, { id: { startsWith: '40000000-' } }] },
      });
      await tx.outboxEvent.deleteMany({
        where: { OR: [{ tenantId: tenantFilter }, { correlationId: { startsWith: 'demo-' } }] },
      });
      await tx.apiIdempotencyRecord.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.publicTrackingGrant.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.systemAuditLog.deleteMany({
        where: { OR: [{ tenantId: tenantFilter }, { actorEmail: DEMO_SUPER_ADMIN_EMAIL }] },
      });

      // 2. Trade / Customs
      await tx.hSCodeSuggestion.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.customsStatusEvent.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.customsDeclaration.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tradeDocumentVersion.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tradeDocument.deleteMany({ where: { tenantId: tenantFilter } });

      // 3. Commercial / AR-AP / Freight
      await tx.disputeCase.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.paymentAllocation.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.freightLedgerEntry.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.freightInvoice.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.equipmentAssignment.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.freightLeg.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.freightShipment.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.freightBooking.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.quoteLine.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.freightQuote.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.freightRFQ.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.surchargeRule.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.contractRate.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.demDetRule.deleteMany({ where: { tenantId: tenantFilter } });

      // 4. Yard & Equipment
      await tx.equipmentInterchangeReceipt.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.containerGateEvent.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.yardSlot.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.yard.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.containerEquipment.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.chassisUnit.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tractorUnit.deleteMany({ where: { tenantId: tenantFilter } });

      // 5. Returns & Billing
      await tx.refund.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.returnInspection.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.returnItem.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.returnRequest.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.returnReason.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.paymentTransaction.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.invoiceLineItem.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.invoice.deleteMany({ where: { tenantId: tenantFilter } });

      // 6. Logistics / TMS / AI
      await tx.gpsTrackingLog.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.sosAlert.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.codRemittance.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.driverExpense.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.delivery.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tripStop.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.trip.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.geofence.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.vehicle.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.driver.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.routeOptimizationJob.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.orderTrackingEvent.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.orderItem.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.order.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.aiFeedback.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.aiModel.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.demandForecast.deleteMany({ where: { tenantId: tenantFilter } });

      // 7. Clients & Webhooks
      await tx.clientApiKey.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.clientWebhook.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.clientUser.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.client.deleteMany({ where: { tenantId: tenantFilter } });

      // 8. WMS
      await tx.packStationLog.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.scanLog.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.adjustment.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.cycleCount.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.stockMovement.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.taskItem.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.task.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.wavePicking.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.inventory.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.product.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.category.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.bin.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.rack.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.zone.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.equipmentCheckout.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.staffShift.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.warehouse.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.branch.deleteMany({ where: { tenantId: tenantFilter } });

      // 9. Tenant Config, Notifications, IAM
      await tx.notification.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.shippingRate.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.fileAttachment.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.apiUsageDaily.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tenantApiKey.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.featureFlag.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tenantSetting.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tenantUiConfig.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.userRole.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.rolePermission.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.customRole.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tenantUser.deleteMany({ where: { tenantId: tenantFilter } });
      await tx.tenant.deleteMany({ where: { id: tenantFilter } });
      await tx.systemAdmin.deleteMany({ where: { email: DEMO_SUPER_ADMIN_EMAIL } });
    },
    { timeout: 300000, maxWait: 30000 },
  );

  console.log('✅ Demo enterprise reset completed cleanly (existing non-demo / RLS test data preserved).');
}

async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const existingDemoCount = await prisma.tenant.count({ where: { id: { in: ALL_DEMO_TENANT_IDS } } });
  if (existingDemoCount > 0) {
    console.log('ℹ️  Existing demo tenants found; running reset first so seed is clean and deterministic...');
    await resetDemoData(prisma);
  }

  console.log('--- Seeding Enterprise Demo Dataset (Dong Nai 2026 + 4 Tenants + Full Logistics/XNK/WMS) ---');

  const catalog = loadDongNaiCatalog();
  const credentialsLog: Array<{
    portal: string;
    tenantSlug: string;
    role: string;
    email: string;
    password: string;
    purpose: string;
  }> = [];
  const trackingShareTokens: Array<{ label: string; trackingCode: string; precision: string; token: string; status: string }> = [];

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);

      // Ensure auxiliary tenant schemas exist so SET LOCAL search_path succeeds cleanly
      for (const schema of ['tenant_demo_fdi_bh', 'tenant_demo_lm_lk', 'tenant_demo_suspended']) {
        await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
        await tx.$executeRawUnsafe(`
          DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartlogi_app') THEN
              EXECUTE 'GRANT USAGE ON SCHEMA "${schema}" TO smartlogi_app';
            END IF;
          END $$;
        `);
      }

      // 1. Subscription Plans
      const planStarter = await tx.subscriptionPlan.upsert({
        where: { code: 'STARTER' },
        update: {},
        create: {
          code: 'STARTER',
          name: 'Starter Fleet',
          priceMonthly: 149,
          priceCurrency: 'USD',
          maxUsers: 25,
          maxWarehouses: 3,
          maxVehicles: 25,
          description: 'Core WMS & Last-mile dispatch for SME operators',
          featuresJson: JSON.stringify({ aiVrp: false, customsGate: false, demDet: false }),
        },
      });
      const planGrowth = await tx.subscriptionPlan.upsert({
        where: { code: 'GROWTH' },
        update: {},
        create: {
          code: 'GROWTH',
          name: 'Growth 3PL & WMS',
          priceMonthly: 490,
          priceCurrency: 'USD',
          maxUsers: 120,
          maxWarehouses: 10,
          maxVehicles: 120,
          description: 'Multi-warehouse WMS + COD bank reconciliation + AI route planning',
          featuresJson: JSON.stringify({ aiVrp: true, customsGate: false, demDet: true }),
        },
      });
      const planEnterprise = await tx.subscriptionPlan.upsert({
        where: { code: 'ENTERPRISE' },
        update: {},
        create: {
          code: 'ENTERPRISE',
          name: 'Enterprise Container & XNK Suite',
          priceMonthly: 1490,
          priceCurrency: 'USD',
          maxUsers: 500,
          maxWarehouses: 50,
          maxVehicles: 500,
          description: 'Full container trucking, ICD yard/EIR, DEM/DET, XNK customs review & RLS isolation',
          featuresJson: JSON.stringify({ aiVrp: true, customsGate: true, demDet: true, multiPort: true }),
        },
      });

      // 2. Platform Super Admin
      const superAdminPw = genPassword('DEMO_PW_SUPER_ADMIN');
      await tx.systemAdmin.upsert({
        where: { email: DEMO_SUPER_ADMIN_EMAIL },
        update: {
          passwordHash: await bcrypt.hash(superAdminPw, 10),
          fullName: 'SmartLogi Platform Admin',
          status: 'ACTIVE',
        },
        create: {
          email: DEMO_SUPER_ADMIN_EMAIL,
          passwordHash: await bcrypt.hash(superAdminPw, 10),
          fullName: 'SmartLogi Platform Admin',
          status: 'ACTIVE',
        },
      });
      credentialsLog.push({
        portal: 'Admin Portal (4001)',
        tenantSlug: 'platform',
        role: 'SUPER_ADMIN',
        email: DEMO_SUPER_ADMIN_EMAIL,
        password: superAdminPw,
        purpose: 'SaaS governance, Tenant lifecycle, Outbox DLQ, Dong Nai Geo Registry',
      });

      // 3. Global Geography: 95 Dong Nai 2026 Units + Aliases + Corridors + 10 Facilities + Restrictions
      const unitMap = new Map<string, string>();
      for (const u of catalog.units) {
        const savedUnit = await tx.administrativeUnit.upsert({
          where: {
            provinceCode_unitType_normalizedName: {
              provinceCode: 'DONG_NAI_2026',
              unitType: u.unitType,
              normalizedName: u.normalizedName,
            },
          },
          create: {
            canonicalName: u.canonicalName,
            normalizedName: u.normalizedName,
            unitType: u.unitType,
            provinceName: 'Thành phố Đồng Nai',
            provinceCode: 'DONG_NAI_2026',
            corridor: u.corridor,
            officialCode: null,
            officialCodeStatus: 'PENDING_OFFICIAL_CODE',
            boundaryStatus: 'NO_OFFICIAL_POLYGON',
            sourceDoc: u.sourceDoc,
          },
          update: {
            canonicalName: u.canonicalName,
            corridor: u.corridor,
            officialCodeStatus: 'PENDING_OFFICIAL_CODE',
            boundaryStatus: 'NO_OFFICIAL_POLYGON',
            sourceDoc: u.sourceDoc,
          },
        });
        unitMap.set(`${u.unitType}:${u.normalizedName}`, savedUnit.id);

        await tx.administrativeBoundaryVersion.upsert({
          where: { unitId_versionTag: { unitId: savedUnit.id, versionTag: 'v1-2026-11-11' } },
          create: {
            unitId: savedUnit.id,
            versionTag: 'v1-2026-11-11',
            sourceDoc: u.sourceDoc,
            boundaryStatus: 'NO_OFFICIAL_POLYGON',
          },
          update: {},
        });
      }

      await tx.administrativeAlias.deleteMany({});
      for (const al of catalog.aliases) {
        const unitId = unitMap.get(`${al.unitType}:${al.unitNormalizedName}`);
        if (!unitId) continue;
        const normalizedAlias = catalog.normalizeVietnameseAliasKey(al.aliasName);
        await tx.administrativeAlias.upsert({
          where: { unitId_normalizedAlias: { unitId, normalizedAlias } },
          create: {
            unitId,
            aliasName: al.aliasName,
            normalizedAlias,
            aliasType: al.aliasType,
            sourceDoc: 'PRE_2025_REFERENCE',
          },
          update: { aliasName: al.aliasName },
        });
      }

      const facilitySeeds = [
        {
          code: 'ICD_TAN_CANG_LONG_BINH',
          name: 'ICD Tân Cảng Long Bình',
          facilityType: 'ICD',
          unitKey: 'WARD:LONG BINH',
          localityName: 'Phường Long Bình',
          outsideCity: false,
          corridor: 'CENTRAL',
          lat: 10.9415,
          lng: 106.8908,
          gateCount: 8,
          capacityTeu: 18000,
          waitMinutes: 38,
          queueLength: 14,
        },
        {
          code: 'HUB_AMATA',
          name: 'Trung tâm Logistics KCN Amata',
          facilityType: 'INDUSTRIAL_PARK',
          unitKey: 'WARD:LONG BINH',
          localityName: 'Phường Long Bình',
          outsideCity: false,
          corridor: 'CENTRAL',
          lat: 10.9478,
          lng: 106.8722,
          gateCount: 6,
          capacityTeu: 6500,
          waitMinutes: 18,
          queueLength: 5,
        },
        {
          code: 'PORT_PHUOC_AN',
          name: 'Cảng Phước An',
          facilityType: 'SEAPORT',
          unitKey: 'COMMUNE:PHUOC AN',
          localityName: 'Xã Phước An',
          outsideCity: false,
          corridor: 'SOUTH',
          lat: 10.6789,
          lng: 106.9245,
          gateCount: 10,
          capacityTeu: 45000,
          waitMinutes: 42,
          queueLength: 19,
        },
        {
          code: 'ICD_NHON_TRACH',
          name: 'ICD & Depot Nhơn Trạch',
          facilityType: 'DEPOT',
          unitKey: 'WARD:NHON TRACH',
          localityName: 'Phường Nhơn Trạch',
          outsideCity: false,
          corridor: 'SOUTH',
          lat: 10.7421,
          lng: 106.9068,
          gateCount: 6,
          capacityTeu: 12000,
          waitMinutes: 25,
          queueLength: 8,
        },
        {
          code: 'LTIA_GATEWAY',
          name: 'Cửa ngõ Hàng hóa Sân bay Long Thành',
          facilityType: 'AIRPORT',
          unitKey: 'WARD:LONG THANH',
          localityName: 'Phường Long Thành',
          outsideCity: false,
          corridor: 'SOUTH',
          lat: 10.7795,
          lng: 107.0182,
          gateCount: 12,
          capacityTeu: 24000,
          waitMinutes: 22,
          queueLength: 7,
        },
        {
          code: 'HUB_LONG_KHANH',
          name: 'Trung tâm Trung chuyển Long Khánh',
          facilityType: 'DEPOT',
          unitKey: 'WARD:LONG KHANH',
          localityName: 'Phường Long Khánh',
          outsideCity: false,
          corridor: 'CENTRAL',
          lat: 10.9355,
          lng: 107.2435,
          gateCount: 4,
          capacityTeu: 4000,
          waitMinutes: 15,
          queueLength: 3,
        },
        {
          code: 'HUB_DONG_XOAI',
          name: 'Kho Trung chuyển Phía Bắc Đồng Xoài',
          facilityType: 'DEPOT',
          unitKey: 'WARD:DONG XOAI',
          localityName: 'Phường Đồng Xoài',
          outsideCity: false,
          corridor: 'NORTH',
          lat: 11.5356,
          lng: 106.8935,
          gateCount: 4,
          capacityTeu: 3500,
          waitMinutes: 12,
          queueLength: 2,
        },
        {
          code: 'HUB_CHON_THANH',
          name: 'KCN Chơn Thành Gateway',
          facilityType: 'INDUSTRIAL_PARK',
          unitKey: 'WARD:CHON THANH',
          localityName: 'Phường Chơn Thành',
          outsideCity: false,
          corridor: 'NORTH',
          lat: 11.4302,
          lng: 106.6204,
          gateCount: 4,
          capacityTeu: 5000,
          waitMinutes: 14,
          queueLength: 3,
        },
        {
          code: 'PORT_CAT_LAI',
          name: 'Cảng Cát Lái (External Gateway TP.HCM)',
          facilityType: 'SEAPORT',
          unitKey: null,
          localityName: 'TP. Thủ Đức, TP.HCM (External)',
          outsideCity: true,
          corridor: 'SOUTH',
          lat: 10.7689,
          lng: 106.7944,
          gateCount: 18,
          capacityTeu: 90000,
          waitMinutes: 95,
          queueLength: 54,
        },
        {
          code: 'PORT_CAI_MEP',
          name: 'Cụm Cảng Cái Mép - Thị Vải (External Deep-Sea)',
          facilityType: 'SEAPORT',
          unitKey: null,
          localityName: 'Phú Mỹ, Bà Rịa - Vũng Tàu (External)',
          outsideCity: true,
          corridor: 'SOUTH',
          lat: 10.5221,
          lng: 107.0185,
          gateCount: 16,
          capacityTeu: 120000,
          waitMinutes: 48,
          queueLength: 22,
        },
      ];

      const facilityByCode = new Map<string, string>();
      for (const f of facilitySeeds) {
        const fac = await tx.logisticsFacility.upsert({
          where: { code: f.code },
          create: {
            code: f.code,
            name: f.name,
            facilityType: f.facilityType,
            administrativeUnitId: f.unitKey ? unitMap.get(f.unitKey) || null : null,
            localityName: f.localityName,
            provinceCode: f.outsideCity ? 'EXTERNAL_GATEWAY' : 'DONG_NAI_2026',
            outsideCity: f.outsideCity,
            corridor: f.corridor,
            lat: f.lat,
            lng: f.lng,
            gateCount: f.gateCount,
            capacityTeu: f.capacityTeu,
            sourceType: 'SYNTHETIC_DEMO',
          },
          update: {
            name: f.name,
            administrativeUnitId: f.unitKey ? unitMap.get(f.unitKey) || null : null,
            outsideCity: f.outsideCity,
            corridor: f.corridor,
          },
        });
        facilityByCode.set(f.code, fac.id);

        const existingGeo = await tx.facilityGeofence.findFirst({ where: { facilityId: fac.id } });
        if (!existingGeo) {
          await tx.facilityGeofence.create({
            data: {
              facilityId: fac.id,
              name: `${f.name} Perimeter (Synthetic Demo Radius)`,
              radiusMeters: f.facilityType === 'SEAPORT' ? 900 : 500,
              boundarySource: 'SYNTHETIC_RADIUS_PLACEHOLDER',
            },
          });
        }

        const existingObs = await tx.terminalQueueObservation.findFirst({ where: { facilityId: fac.id } });
        if (!existingObs) {
          await tx.terminalQueueObservation.create({
            data: {
              facilityId: fac.id,
              waitMinutes: f.waitMinutes,
              queueLength: f.queueLength,
              sourceLabel: 'SYNTHETIC_DEMO',
              isOfficialTelemetry: false,
              notes: 'Synthetic baseline queue observation for Dong Nai corridor planning',
            },
          });
        }
      }

      const corridorSeeds = [
        {
          code: 'COR-CENTRAL-QL1A',
          name: 'Trục Trung tâm Quốc lộ 1A (Biên Hòa - Trảng Bom - Long Khánh)',
          corridorTag: 'CENTRAL',
          highwayCode: 'QL1A',
          originCode: 'ICD_TAN_CANG_LONG_BINH',
          destCode: 'HUB_LONG_KHANH',
          nominalKm: 44.5,
          typicalMinutes: 75,
        },
        {
          code: 'COR-SOUTH-QL51-CL',
          name: 'Hành lang Container Nam QL51 (Long Bình - Long Thành - Cát Lái)',
          corridorTag: 'SOUTH',
          highwayCode: 'QL51 / DT769',
          originCode: 'ICD_TAN_CANG_LONG_BINH',
          destCode: 'PORT_CAT_LAI',
          nominalKm: 34.0,
          typicalMinutes: 85,
        },
        {
          code: 'COR-SOUTH-CMTV',
          name: 'Trục Nước sâu Phước An - Cái Mép Thị Vải',
          corridorTag: 'SOUTH',
          highwayCode: 'CT Bến Lức - Long Thành / QL51',
          originCode: 'PORT_PHUOC_AN',
          destCode: 'PORT_CAI_MEP',
          nominalKm: 28.5,
          typicalMinutes: 55,
        },
        {
          code: 'COR-NORTH-QL13',
          name: 'Trục Công nghiệp Phía Bắc QL13 - DT741 (Chơn Thành - Đồng Xoài - Biên Hòa)',
          corridorTag: 'NORTH',
          highwayCode: 'QL13 / DT741',
          originCode: 'HUB_CHON_THANH',
          destCode: 'HUB_AMATA',
          nominalKm: 76.0,
          typicalMinutes: 115,
        },
      ];

      const corridorIdMap = new Map<string, string>();
      for (const c of corridorSeeds) {
        const corr = await tx.transportCorridor.upsert({
          where: { code: c.code },
          create: {
            code: c.code,
            name: c.name,
            corridorTag: c.corridorTag,
            highwayCode: c.highwayCode,
            originFacilityId: facilityByCode.get(c.originCode) || null,
            destFacilityId: facilityByCode.get(c.destCode) || null,
            nominalKm: c.nominalKm,
            typicalMinutes: c.typicalMinutes,
          },
          update: { name: c.name, typicalMinutes: c.typicalMinutes },
        });
        corridorIdMap.set(c.code, corr.id);
      }

      const existingRestrictions = await tx.roadRestriction.count();
      if (existingRestrictions === 0) {
        await tx.roadRestriction.createMany({
          data: [
            {
              corridorId: corridorIdMap.get('COR-CENTRAL-QL1A') || null,
              facilityId: facilityByCode.get('ICD_TAN_CANG_LONG_BINH') || null,
              title: 'Cấm giờ cao điểm xe đầu kéo container nút giao Ngã 4 Vũng Tàu / Amata',
              maxTonnageTons: 32,
              restrictedHours: '06:00-09:00, 16:00-20:00',
              severity: 'WARNING',
            },
            {
              corridorId: corridorIdMap.get('COR-SOUTH-QL51-CL') || null,
              facilityId: facilityByCode.get('PORT_CAT_LAI') || null,
              title: 'Ùn ứ khung giờ cắt máng tàu đêm Cảng Cát Lái (cổng B-C)',
              maxTonnageTons: 40,
              restrictedHours: '20:00-23:30',
              severity: 'WARNING',
            },
            {
              corridorId: corridorIdMap.get('COR-NORTH-QL13') || null,
              facilityId: facilityByCode.get('HUB_DONG_XOAI') || null,
              title: 'Giới hạn tải trọng cầu tuyến nhánh kết nối Cụm KCN Bắc Đồng Phú',
              maxTonnageTons: 25,
              maxHeightM: 4.2,
              restrictedHours: '24/7',
              severity: 'BLOCKING',
            },
          ],
        });
      }

      // 4. Create the 4 Enterprise Demo Tenants
      const tenantDefs = [
        {
          id: DEMO_TENANT_IDS.DN3PL,
          slug: 'demo-3pl-dn',
          name: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
          dbSchemaName: 'public',
          status: 'ACTIVE',
          planId: planEnterprise.id,
          brandColor: '#0F4C81',
        },
        {
          id: DEMO_TENANT_IDS.FDIBH,
          slug: 'demo-fdi-bh',
          name: 'FDI Biên Hòa Electronics Logistics',
          dbSchemaName: 'tenant_demo_fdi_bh',
          status: 'ACTIVE',
          planId: planEnterprise.id,
          brandColor: '#047857',
        },
        {
          id: DEMO_TENANT_IDS.LMLK,
          slug: 'demo-lm-lk',
          name: 'Last-Mile Long Khánh & Xuân Lộc',
          dbSchemaName: 'tenant_demo_lm_lk',
          status: 'ACTIVE',
          planId: planGrowth.id,
          brandColor: '#B45309',
        },
        {
          id: DEMO_TENANT_IDS.SUSPENDED,
          slug: 'demo-suspended',
          name: 'Doanh nghiệp Tạm Khóa (Suspended Tenant)',
          dbSchemaName: 'tenant_demo_suspended',
          status: 'SUSPENDED',
          planId: planStarter.id,
          brandColor: '#DC2626',
        },
      ];

      for (const td of tenantDefs) {
        await tx.tenant.create({
          data: {
            id: td.id,
            slug: td.slug,
            name: td.name,
            dbSchemaName: td.dbSchemaName,
            status: td.status,
            planId: td.planId,
            maxUsers: 250,
            maxWarehouses: 20,
            maxVehicles: 250,
            maxApiCallsPerDay: 100000,
          },
        });
        await tx.tenantUiConfig.create({
          data: {
            tenantId: td.id,
            brandName: td.name,
            primaryColor: td.brandColor,
          },
        });
        await tx.featureFlag.createMany({
          data: [
            { tenantId: td.id, key: 'ai.vrp.enabled', enabled: td.status === 'ACTIVE', description: 'AI Route Optimization' },
            { tenantId: td.id, key: 'freight.dem_det.enabled', enabled: td.id !== DEMO_TENANT_IDS.LMLK, description: 'DEM/DET Container Charge Calculator' },
            { tenantId: td.id, key: 'xnk.hs_advisory.enabled', enabled: td.id !== DEMO_TENANT_IDS.LMLK, description: 'HS Advisory Classification & Customs Review Gate' },
          ],
        });
        await tx.tenantSetting.createMany({
          data: [
            { tenantId: td.id, key: 'default_province_code', value: 'DONG_NAI_2026', description: 'Primary operational province' },
            { tenantId: td.id, key: 'pack_station_cv_threshold', value: '0.6', description: 'Strict MobileNet V2 anomaly threshold' },
          ],
        });
        await tx.apiUsageDaily.createMany({
          data: [
            { tenantId: td.id, date: new Date('2026-11-10T00:00:00Z'), endpoint: '/api/v1/orders', method: 'GET', count: 420 },
            { tenantId: td.id, date: new Date('2026-11-11T00:00:00Z'), endpoint: '/api/v1/freight/control-tower', method: 'GET', count: 185 },
          ],
        });
      }

      // 5. Seed Roles + Personas per Tenant + B2B Client Links
      const roleMaps = new Map<string, Record<string, string>>();
      for (const td of tenantDefs) {
        roleMaps.set(td.id, await seedRoles(tx as any, td.id));
      }

      async function createPersona(params: {
        id: string;
        tenantId: string;
        tenantSlug: string;
        email: string;
        fullName: string;
        phone: string;
        role: string;
        portal: string;
        purpose: string;
        envPwKey: string;
      }): Promise<{ userId: string; email: string; password: string }> {
        const pw = genPassword(params.envPwKey);
        const hash = await bcrypt.hash(pw, 10);
        const user = await tx.tenantUser.create({
          data: {
            id: params.id,
            tenantId: params.tenantId,
            email: params.email,
            fullName: params.fullName,
            phone: params.phone,
            passwordHash: hash,
            status: 'ACTIVE',
          },
        });
        const roles = roleMaps.get(params.tenantId) || {};
        const roleId = roles[params.role];
        if (roleId) {
          await tx.userRole.create({
            data: {
              tenantId: params.tenantId,
              userId: user.id,
              roleId,
            },
          });
        }
        credentialsLog.push({
          portal: params.portal,
          tenantSlug: params.tenantSlug,
          role: params.role,
          email: params.email,
          password: pw,
          purpose: params.purpose,
        });
        return { userId: user.id, email: params.email, password: pw };
      }

      // --- Tenant 1 Personas (demo-3pl-dn) ---
      const t1Admin = await createPersona({
        id: detUuid('30000001', 1),
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        email: 'ops.admin@3pl-dn.demo',
        fullName: 'Trần Minh Quân (Tenant Admin 3PL ĐN)',
        phone: '0901001001',
        role: 'TENANT_ADMIN',
        portal: 'Tenant Portal (4002) & Pack (4004)',
        purpose: 'Full 3PL/Container/Yard/XNK/WMS/Finance owner for Dong Nai 3PL',
        envPwKey: 'DEMO_PW_DN3PL_ADMIN',
      });
      const t1Dispatch = await createPersona({
        id: detUuid('30000001', 2),
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        email: 'dispatcher@3pl-dn.demo',
        fullName: 'Nguyễn Thị Hương (Logistics Manager)',
        phone: '0901001002',
        role: 'LOGISTICS_MANAGER',
        portal: 'Tenant Portal (4002)',
        purpose: 'Container dispatch, VRP, yard gate-in/out, COD reconcile',
        envPwKey: 'DEMO_PW_DN3PL_DISPATCH',
      });
      const t1WhMgr = await createPersona({
        id: detUuid('30000001', 3),
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        email: 'wh.manager@3pl-dn.demo',
        fullName: 'Lê Hoàng Nam (Warehouse Manager)',
        phone: '0901001003',
        role: 'WAREHOUSE_MANAGER',
        portal: 'Tenant Portal (4002) & Pack (4004)',
        purpose: 'Inventory adjustments, FEFO, wave picking, yard ops',
        envPwKey: 'DEMO_PW_DN3PL_WHMGR',
      });
      const t1PackStaff = await createPersona({
        id: detUuid('30000001', 4),
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        email: 'pack.staff@3pl-dn.demo',
        fullName: 'Phạm Văn Tùng (Pack Station Staff)',
        phone: '0901001004',
        role: 'WAREHOUSE_STAFF',
        portal: 'Pack Station Web (4004)',
        purpose: 'Barcode scan match/mismatch/override, seal & scale capture',
        envPwKey: 'DEMO_PW_DN3PL_PACK',
      });
      const t1DriverUser = await createPersona({
        id: detUuid('30000001', 5),
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        email: 'driver.01@3pl-dn.demo',
        fullName: 'Nguyễn Văn An (Container/Last-mile Driver)',
        phone: '0901001005',
        role: 'DRIVER',
        portal: 'Driver Mobile API / App',
        purpose: 'Active trip execution, POD upload, COD collection',
        envPwKey: 'DEMO_PW_DN3PL_DRIVER',
      });
      const t1Customer = await createPersona({
        id: detUuid('30000001', 6),
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        email: 'buyer.amata@3pl-dn.demo',
        fullName: 'Võ Minh Anh (Amata Precision B2B Buyer)',
        phone: '0901001006',
        role: 'CUSTOMER_CLIENT',
        portal: 'Customer Portal (4003)',
        purpose: 'B2B Shipper: orders, freight RFQ/quotes, XNK docs, tracking shares',
        envPwKey: 'DEMO_PW_DN3PL_CLIENT',
      });
      await createPersona({
        id: detUuid('30000001', 7),
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        email: 'analyst@3pl-dn.demo',
        fullName: 'Đỗ Thu Hà (Read-Only Analyst)',
        phone: '0901001007',
        role: 'TENANT_USER',
        portal: 'Tenant Portal (4002)',
        purpose: 'Read-only operations reviewer (tests negative write permissions)',
        envPwKey: 'DEMO_PW_DN3PL_ANALYST',
      });

      // --- Tenant 2 Personas (demo-fdi-bh) ---
      const t2Admin = await createPersona({
        id: detUuid('40000001', 1),
        tenantId: DEMO_TENANT_IDS.FDIBH,
        tenantSlug: 'demo-fdi-bh',
        email: 'admin@fdi-bh.demo',
        fullName: 'Kenji Takahashi (FDI Bien Hoa Director)',
        phone: '0902002001',
        role: 'TENANT_ADMIN',
        portal: 'Tenant Portal (4002)',
        purpose: 'Cross-tenant isolation check Tenant #2 + FDI Electronics XNK flow',
        envPwKey: 'DEMO_PW_FDIBH_ADMIN',
      });
      await createPersona({
        id: detUuid('40000001', 2),
        tenantId: DEMO_TENANT_IDS.FDIBH,
        tenantSlug: 'demo-fdi-bh',
        email: 'customs.lead@fdi-bh.demo',
        fullName: 'Bùi Lan Phương (XNK & Freight Lead)',
        phone: '0902002002',
        role: 'LOGISTICS_MANAGER',
        portal: 'Tenant Portal (4002)',
        purpose: 'HS review & RED channel inspection simulation',
        envPwKey: 'DEMO_PW_FDIBH_LOG',
      });
      await createPersona({
        id: detUuid('40000001', 3),
        tenantId: DEMO_TENANT_IDS.FDIBH,
        tenantSlug: 'demo-fdi-bh',
        email: 'pack.bh@fdi-bh.demo',
        fullName: 'Lý Quốc Bảo (Bonded Pack Lead)',
        phone: '0902002003',
        role: 'WAREHOUSE_STAFF',
        portal: 'Pack Station Web (4004)',
        purpose: 'Tenant #2 Pack Station login & queue isolation test',
        envPwKey: 'DEMO_PW_FDIBH_PACK',
      });
      const t2Customer = await createPersona({
        id: detUuid('40000001', 4),
        tenantId: DEMO_TENANT_IDS.FDIBH,
        tenantSlug: 'demo-fdi-bh',
        email: 'shipping@fdi-electronics.demo',
        fullName: 'Trần Thảo Vy (FDI Vendor Exporter)',
        phone: '0902002004',
        role: 'CUSTOMER_CLIENT',
        portal: 'Customer Portal (4003)',
        purpose: 'Tenant #2 B2B client (must NEVER see demo-3pl-dn data)',
        envPwKey: 'DEMO_PW_FDIBH_CLIENT',
      });

      // --- Tenant 3 Personas (demo-lm-lk) ---
      const t3Admin = await createPersona({
        id: detUuid('50000001', 1),
        tenantId: DEMO_TENANT_IDS.LMLK,
        tenantSlug: 'demo-lm-lk',
        email: 'admin@lm-lk.demo',
        fullName: 'Nguyễn Thành Đạt (Long Khanh Last-Mile Admin)',
        phone: '0903003001',
        role: 'TENANT_ADMIN',
        portal: 'Tenant Portal (4002)',
        purpose: 'Rural corridor (Long Khanh / Xuan Loc / Binh Phuoc) last-mile ops',
        envPwKey: 'DEMO_PW_LMLK_ADMIN',
      });
      const t3Customer = await createPersona({
        id: detUuid('50000001', 2),
        tenantId: DEMO_TENANT_IDS.LMLK,
        tenantSlug: 'demo-lm-lk',
        email: 'merchant@longkhanh-agro.demo',
        fullName: 'Huỳnh Tấn Phát (Nông sản Long Khánh)',
        phone: '0903003002',
        role: 'CUSTOMER_CLIENT',
        portal: 'Customer Portal (4003)',
        purpose: 'Tenant #3 Agro exporter / shipper portal user',
        envPwKey: 'DEMO_PW_LMLK_CLIENT',
      });

      // --- Tenant 4 Persona (demo-suspended) ---
      await createPersona({
        id: detUuid('60000001', 1),
        tenantId: DEMO_TENANT_IDS.SUSPENDED,
        tenantSlug: 'demo-suspended',
        email: 'admin@suspended.demo',
        fullName: 'Tài khoản Doanh nghiệp Tạm khóa',
        phone: '0904004001',
        role: 'TENANT_ADMIN',
        portal: 'Tenant Portal (4002) - MUST DENY 403',
        purpose: 'Negative test: suspended tenant must be blocked with 403 Forbidden',
        envPwKey: 'DEMO_PW_SUSPENDED',
      });

      // Helper to seed complete domain slice per active tenant
      async function seedActiveTenantOperations(cfg: {
        tenantId: string;
        prefixHex: string;
        adminUserId: string;
        whManagerId: string;
        staffUserId: string;
        driverUserId: string;
        customerUserId: string;
        customerEmail: string;
        customerName: string;
        companyName: string;
        codeSuffix: string;
        whCode: string;
        whName: string;
        whAddress: string;
        orderCount: number;
        seedBankCsvRemittances: boolean;
      }) {
        const tid = cfg.tenantId;
        const pfx = cfg.prefixHex;

        // Branch & Warehouse hierarchy
        await tx.branch.create({
          data: {
            id: detUuid(pfx, 100),
            tenantId: tid,
            type: 'HUB',
            code: `BR-${cfg.codeSuffix}-01`,
            name: `${cfg.whName} Branch`,
            address: cfg.whAddress,
            lat: 10.9415,
            lng: 106.8908,
            capacityCbm: 15000,
            managerId: cfg.whManagerId,
            status: 'ACTIVE',
          },
        });

        const wh = await tx.warehouse.create({
          data: {
            id: detUuid(pfx, 101),
            tenantId: tid,
            code: cfg.whCode,
            name: cfg.whName,
            address: cfg.whAddress,
            managerId: cfg.whManagerId,
            status: 'ACTIVE',
          },
        });
        const zoneStorage = await tx.zone.create({
          data: { id: detUuid(pfx, 102), tenantId: tid, warehouseId: wh.id, code: `Z-STR-${cfg.codeSuffix}`, type: 'STORAGE' },
        });
        const zoneCold = await tx.zone.create({
          data: { id: detUuid(pfx, 103), tenantId: tid, warehouseId: wh.id, code: `Z-COLD-${cfg.codeSuffix}`, type: 'COLD_FEFO' },
        });
        const rack1 = await tx.rack.create({
          data: { id: detUuid(pfx, 104), tenantId: tid, zoneId: zoneStorage.id, code: `RK-A1-${cfg.codeSuffix}`, aisle: 'A1', rows: 4, levels: 3 },
        });
        const rack2 = await tx.rack.create({
          data: { id: detUuid(pfx, 105), tenantId: tid, zoneId: zoneCold.id, code: `RK-C1-${cfg.codeSuffix}`, aisle: 'C1', rows: 2, levels: 2 },
        });

        const bins = await Promise.all([
          tx.bin.create({
            data: { id: detUuid(pfx, 106), tenantId: tid, rackId: rack1.id, warehouseId: wh.id, barcode: `BIN-${cfg.codeSuffix}-A101`, rowIndex: 1, levelIndex: 1 },
          }),
          tx.bin.create({
            data: { id: detUuid(pfx, 107), tenantId: tid, rackId: rack1.id, warehouseId: wh.id, barcode: `BIN-${cfg.codeSuffix}-A102`, rowIndex: 1, levelIndex: 2 },
          }),
          tx.bin.create({
            data: { id: detUuid(pfx, 108), tenantId: tid, rackId: rack2.id, warehouseId: wh.id, barcode: `BIN-${cfg.codeSuffix}-C101`, rowIndex: 1, levelIndex: 1 },
          }),
        ]);

        // Categories & Products
        const catElec = await tx.category.create({
          data: { id: detUuid(pfx, 110), tenantId: tid, name: 'Linh kiện & Thiết bị Công nghiệp', slug: `elec-${cfg.codeSuffix.toLowerCase()}` },
        });
        const catCold = await tx.category.create({
          data: { id: detUuid(pfx, 111), tenantId: tid, name: 'Hàng Lạnh / Thực phẩm Xuất khẩu', slug: `cold-${cfg.codeSuffix.toLowerCase()}` },
        });

        const products = await Promise.all([
          tx.product.create({
            data: {
              id: detUuid(pfx, 112),
              tenantId: tid,
              sku: `SKU-${cfg.codeSuffix}-IC8542`,
              barcode: `893850${pfx.slice(0, 4)}01`,
              name: 'Vi mạch điều khiển CNC AMATA-8542',
              categoryId: catElec.id,
              weightKg: 1.4,
              volumeCbm: 0.015,
            },
          }),
          tx.product.create({
            data: {
              id: detUuid(pfx, 113),
              tenantId: tid,
              sku: `SKU-${cfg.codeSuffix}-SENS02`,
              barcode: `893850${pfx.slice(0, 4)}02`,
              name: 'Cảm biến Quang học Công nghiệp',
              categoryId: catElec.id,
              weightKg: 0.85,
              volumeCbm: 0.008,
            },
          }),
          tx.product.create({
            data: {
              id: detUuid(pfx, 114),
              tenantId: tid,
              sku: `SKU-${cfg.codeSuffix}-FEFO03`,
              barcode: `893850${pfx.slice(0, 4)}03`,
              name: 'Nguyên liệu Sinh phẩm Lạnh (FEFO <14 ngày)',
              categoryId: catCold.id,
              weightKg: 4.2,
              volumeCbm: 0.04,
            },
          }),
          tx.product.create({
            data: {
              id: detUuid(pfx, 115),
              tenantId: tid,
              sku: `SKU-${cfg.codeSuffix}-ZERO04`,
              barcode: `893850${pfx.slice(0, 4)}04`,
              name: 'Mô-đun Nguồn Servo (Cảnh báo Hết tồn)',
              categoryId: catElec.id,
              weightKg: 3.1,
              volumeCbm: 0.025,
            },
          }),
        ]);

        // Inventory (Normal + FEFO Expiring + Damaged + Zero stock)
        const invNormal = await tx.inventory.create({
          data: {
            id: detUuid(pfx, 120),
            tenantId: tid,
            warehouseId: wh.id,
            binId: bins[0].id,
            productId: products[0].id,
            batchNumber: `LOT-${cfg.codeSuffix}-2026A`,
            quantityOnHand: 420,
            quantityAllocated: 25,
            status: 'AVAILABLE',
          },
        });
        await tx.inventory.create({
          data: {
            id: detUuid(pfx, 121),
            tenantId: tid,
            warehouseId: wh.id,
            binId: bins[1].id,
            productId: products[1].id,
            batchNumber: `LOT-${cfg.codeSuffix}-DMG`,
            quantityOnHand: 18,
            quantityAllocated: 0,
            status: 'DAMAGED',
          },
        });
        await tx.inventory.create({
          data: {
            id: detUuid(pfx, 122),
            tenantId: tid,
            warehouseId: wh.id,
            binId: bins[2].id,
            productId: products[2].id,
            batchNumber: `LOT-${cfg.codeSuffix}-FEFO`,
            expiryDate: new Date(Date.now() + 9 * 86400 * 1000),
            quantityOnHand: 95,
            quantityAllocated: 10,
            status: 'AVAILABLE',
          },
        });
        await tx.inventory.create({
          data: {
            id: detUuid(pfx, 123),
            tenantId: tid,
            warehouseId: wh.id,
            binId: bins[0].id,
            productId: products[3].id,
            batchNumber: `LOT-${cfg.codeSuffix}-EMPTY`,
            quantityOnHand: 0,
            quantityAllocated: 0,
            status: 'AVAILABLE',
          },
        });

        await tx.stockMovement.create({
          data: {
            id: detUuid(pfx, 124),
            tenantId: tid,
            inventoryId: invNormal.id,
            warehouseId: wh.id,
            transactionType: 'INBOUND',
            quantityChange: 420,
            balanceAfter: 420,
            referenceDocument: `PO-${cfg.codeSuffix}-202611`,
            reasonCode: 'INITIAL_STOCK',
            actorId: cfg.whManagerId,
          },
        });

        const wave = await tx.wavePicking.create({
          data: {
            id: detUuid(pfx, 125),
            tenantId: tid,
            warehouseId: wh.id,
            waveNumber: `WAVE-${cfg.codeSuffix}-001`,
            status: 'IN_PROGRESS',
            totalOrders: 12,
            totalItems: 34,
            createdBy: cfg.whManagerId,
          },
        });

        await tx.task.create({
          data: {
            id: detUuid(pfx, 126),
            tenantId: tid,
            warehouseId: wh.id,
            taskType: 'PICKING',
            status: 'PENDING',
            priority: 1,
            assigneeId: cfg.staffUserId,
            sourceBinId: bins[0].id,
            productId: products[0].id,
            quantityRequested: 15,
            waveId: wave.id,
          },
        });

        await tx.cycleCount.create({
          data: {
            id: detUuid(pfx, 127),
            tenantId: tid,
            warehouseId: wh.id,
            status: 'PENDING',
            scheduledAt: new Date(Date.now() + 86400 * 1000),
            createdBy: cfg.whManagerId,
          },
        });

        // Client + ClientUser (exact email match with Customer Portal login)
        const clientMain = await tx.client.create({
          data: {
            id: detUuid(pfx, 130),
            tenantId: tid,
            name: cfg.companyName,
            status: 'ACTIVE',
          },
        });
        const clientSecondary = await tx.client.create({
          data: {
            id: detUuid(pfx, 131),
            tenantId: tid,
            name: `${cfg.companyName} — Chi nhánh KCN Long Thành`,
            status: 'ACTIVE',
          },
        });
        await tx.clientUser.create({
          data: {
            id: detUuid(pfx, 132),
            tenantId: tid,
            clientId: clientMain.id,
            email: cfg.customerEmail,
            fullName: cfg.customerName,
            status: 'ACTIVE',
          },
        });

        // Vehicles & Drivers
        const veh1 = await tx.vehicle.create({
          data: {
            id: detUuid(pfx, 140),
            tenantId: tid,
            plateNumber: `60C-${cfg.codeSuffix}01`,
            type: 'CONTAINER_TRACTOR',
            capacityKg: 32000,
            capacityCbm: 68,
            status: 'ACTIVE',
          },
        });
        const veh2 = await tx.vehicle.create({
          data: {
            id: detUuid(pfx, 141),
            tenantId: tid,
            plateNumber: `60H-${cfg.codeSuffix}02`,
            type: 'TRUCK_5T',
            capacityKg: 5000,
            capacityCbm: 22,
            status: 'ACTIVE',
          },
        });

        const driver1 = await tx.driver.create({
          data: {
            id: detUuid(pfx, 142),
            tenantId: tid,
            userId: cfg.driverUserId,
            licenseClass: 'FC',
            licenseExpiry: new Date('2029-12-31T00:00:00Z'),
            status: 'ACTIVE',
          },
        });

        // Extra driver profile for secondary trip / driver fleet
        const extraDriverUser = await tx.tenantUser.create({
          data: {
            id: detUuid(pfx, 143),
            tenantId: tid,
            email: `driver.02@${cfg.codeSuffix.toLowerCase()}.demo`,
            fullName: `Trần Quốc Bảo (Tài xế #2 ${cfg.codeSuffix})`,
            passwordHash: await bcrypt.hash(genPassword('DEMO_PW_AUX_DRIVER'), 10),
            status: 'ACTIVE',
          },
        });
        const driverRoleId = (roleMaps.get(tid) || {}).DRIVER;
        if (driverRoleId) {
          await tx.userRole.create({
            data: { tenantId: tid, userId: extraDriverUser.id, roleId: driverRoleId },
          });
        }
        const driver2 = await tx.driver.create({
          data: {
            id: detUuid(pfx, 144),
            tenantId: tid,
            userId: extraDriverUser.id,
            licenseClass: 'C',
            licenseExpiry: new Date('2028-06-30T00:00:00Z'),
            status: 'ONLINE',
          },
        });

        // Orders across Dong Nai 2026 wards/communes (statuses needed by Pack Queue, Customer Portal, Delivery, Returns)
        const dongNaiDistrictAddresses = [
          { addr: 'Lô 12 KCN Amata, Phường Long Bình, Thành phố Đồng Nai', lat: 10.9478, lng: 106.8722 },
          { addr: 'Đường Lê Duẩn, Phường Long Thành, Thành phố Đồng Nai', lat: 10.7782, lng: 106.9531 },
          { addr: 'KCN Nhơn Trạch III, Phường Nhơn Trạch, Thành phố Đồng Nai', lat: 10.7421, lng: 106.9068 },
          { addr: 'Số 88 Quốc lộ 1A, Phường Trảng Bom, Thành phố Đồng Nai', lat: 10.9531, lng: 107.0074 },
          { addr: 'Khu phố Xuân Bình, Phường Long Khánh, Thành phố Đồng Nai', lat: 10.9355, lng: 107.2435 },
          { addr: 'Xã Phước An (Cụm Cảng), Thành phố Đồng Nai', lat: 10.6789, lng: 106.9245 },
          { addr: 'Phường Biên Hòa, Thành phố Đồng Nai', lat: 10.9465, lng: 106.8243 },
          { addr: 'Phường Đồng Xoài, Thành phố Đồng Nai', lat: 11.5356, lng: 106.8935 },
        ];
        const statusCycle = ['NEW', 'PENDING', 'IN_QUEUE', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED'];

        const createdOrderIds: string[] = [];
        const createdOrderCodes: string[] = [];
        const orderPayload: Array<{
          id: string;
          tenantId: string;
          trackingCode: string;
          clientId: string;
          clientOrderRef: string;
          status: any;
          recipientName: string;
          recipientPhone: string;
          recipientAddress: string;
          lat: number;
          lng: number;
          codAmount: number;
          shippingFee: number;
          driverId: string | null;
          estimatedDeliveryDate: Date;
          actualDeliveryTime: Date | null;
        }> = [];
        const orderItemPayload: Array<{ id: string; tenantId: string; orderId: string; productId: string; quantity: number }> = [];
        const trackingEventPayload: Array<{ id: string; tenantId: string; orderId: string; status: string; location: string; description: string; timestamp: Date }> = [];

        for (let i = 1; i <= cfg.orderCount; i++) {
          const orderId = detUuid(pfx, 1000 + i);
          const trackingCode = `SLG-DEMO-${cfg.codeSuffix}-${String(i).padStart(4, '0')}`;
          const loc = dongNaiDistrictAddresses[i % dongNaiDistrictAddresses.length];
          // Guarantee first 6 orders cover key E2E states (PACK_QUEUE PENDING x2, IN_TRANSIT, DELIVERED, DELIVERED+RETURN, NEW)
          const st =
            i <= 2
              ? 'PENDING'
              : i === 3
                ? 'IN_TRANSIT'
                : i <= 5
                  ? 'DELIVERED'
                  : i === 6
                    ? 'IN_QUEUE'
                    : statusCycle[i % statusCycle.length];

          const targetClientId = i <= Math.ceil(cfg.orderCount * 0.7) ? clientMain.id : clientSecondary.id;
          const prod = products[(i - 1) % 3];

          orderPayload.push({
            id: orderId,
            tenantId: tid,
            trackingCode,
            clientId: targetClientId,
            clientOrderRef: `REF-${cfg.codeSuffix}-${String(i).padStart(4, '0')}`,
            status: st,
            recipientName: `Khách nhận #${i} (${cfg.codeSuffix})`,
            recipientPhone: `098${String(1000000 + i).slice(0, 7)}`,
            recipientAddress: loc.addr,
            lat: loc.lat,
            lng: loc.lng,
            codAmount: i % 3 === 0 ? 0 : 950000 + i * 15000,
            shippingFee: 45000 + (i % 5) * 12000,
            driverId: st === 'IN_TRANSIT' || st === 'DELIVERED' ? driver1.id : null,
            estimatedDeliveryDate: new Date(Date.now() + 2 * 86400 * 1000),
            actualDeliveryTime: st === 'DELIVERED' ? new Date('2026-11-10T14:20:00Z') : null,
          });

          createdOrderIds.push(orderId);
          createdOrderCodes.push(trackingCode);

          orderItemPayload.push({
            id: detUuid(pfx, 2000 + i),
            tenantId: tid,
            orderId,
            productId: prod.id,
            quantity: (i % 3) + 1,
          });
          trackingEventPayload.push({
            id: detUuid(pfx, 3000 + i),
            tenantId: tid,
            orderId,
            status: st,
            location: loc.addr,
            description: `Đơn ${trackingCode} cập nhật trạng thái ${st} tại ${cfg.whName}`,
            timestamp: new Date(Date.now() - i * 3600 * 1000),
          });
        }

        await tx.order.createMany({ data: orderPayload });
        await tx.orderItem.createMany({ data: orderItemPayload });
        await tx.orderTrackingEvent.createMany({ data: trackingEventPayload });

        // Trips & Deliveries & COD Remittances
        const tripActive = await tx.trip.create({
          data: {
            id: detUuid(pfx, 150),
            tenantId: tid,
            tripCode: `TRP-${cfg.codeSuffix}-001`,
            vehicleId: veh1.id,
            driverId: driver1.id,
            status: 'IN_TRANSIT',
            totalWeightKg: 14500,
            totalVolumeCbm: 32,
            estimatedDistanceKm: 44.5,
            aiOptimized: true,
            departureTime: new Date('2026-11-11T05:30:00Z'),
            createdAt: new Date('2026-11-11T05:30:00Z'),
          },
        });
        const tripDraft = await tx.trip.create({
          data: {
            id: detUuid(pfx, 151),
            tenantId: tid,
            tripCode: `TRP-${cfg.codeSuffix}-002`,
            vehicleId: veh2.id,
            driverId: driver2.id,
            status: 'NEW',
            totalWeightKg: 2100,
            totalVolumeCbm: 8.5,
            estimatedDistanceKm: 28.0,
            createdAt: new Date('2026-11-11T05:00:00Z'),
          },
        });

        await tx.tripStop.createMany({
          data: [
            {
              id: detUuid(pfx, 152),
              tenantId: tid,
              tripId: tripActive.id,
              orderId: createdOrderIds[2],
              stopType: 'DELIVERY',
              sequence: 1,
              address: dongNaiDistrictAddresses[0].addr,
              status: 'PENDING',
            },
            {
              id: detUuid(pfx, 153),
              tenantId: tid,
              tripId: tripDraft.id,
              orderId: createdOrderIds[0],
              stopType: 'PICKUP',
              sequence: 1,
              address: cfg.whAddress,
              status: 'PENDING',
            },
          ],
        });

        await tx.delivery.createMany({
          data: [
            {
              id: detUuid(pfx, 154),
              tenantId: tid,
              tripId: tripActive.id,
              orderId: createdOrderIds[2],
              stopSequence: 1,
              stopType: 'DELIVERY',
              status: 'IN_TRANSIT',
              customerName: 'Amata Precision Plant 2',
              customerPhone: '0901001006',
              deliveryAddress: dongNaiDistrictAddresses[0].addr,
              lat: 10.9478,
              lng: 106.8722,
              codAmountExpected: 2850000,
              checkinLat: 10.947812,
              checkinLng: 106.872219,
              driverId: driver1.id,
            },
            {
              id: detUuid(pfx, 155),
              tenantId: tid,
              tripId: tripActive.id,
              orderId: createdOrderIds[3],
              stopSequence: 2,
              stopType: 'DELIVERY',
              status: 'DELIVERED',
              customerName: 'KCN Long Thanh Client',
              customerPhone: '0908889990',
              deliveryAddress: dongNaiDistrictAddresses[1].addr,
              lat: 10.7782,
              lng: 106.9531,
              codAmountExpected: 4120000,
              codAmountCollected: 4120000,
              checkinLat: 10.778245,
              checkinLng: 106.953142,
              driverId: driver1.id,
            },
          ],
        });

        await tx.driverExpense.create({
          data: {
            id: detUuid(pfx, 156),
            tenantId: tid,
            driverId: driver1.id,
            tripId: tripActive.id,
            amount: 450000,
            category: 'TOLL_QL51',
            note: 'Phí trạm QL51 Long Bình - Cát Lái khứ hồi',
            status: 'PENDING',
          },
        });

        if (cfg.seedBankCsvRemittances) {
          await tx.codRemittance.createMany({
            data: [
              {
                id: detUuid(pfx, 157),
                tenantId: tid,
                driverId: driver1.id,
                totalCodCollected: 2850000,
                amountRemitted: 2850000,
                status: 'PENDING',
                qrCodeToken: 'REM-20261101',
                createdAt: new Date('2026-11-11T08:00:00Z'),
              },
              {
                id: detUuid(pfx, 158),
                tenantId: tid,
                driverId: driver1.id,
                totalCodCollected: 4200000,
                totalExpensesDeducted: 80000,
                amountRemitted: 4120000,
                status: 'APPROVED',
                qrCodeToken: 'REM-20261102',
                createdAt: new Date('2026-11-11T08:05:00Z'),
              },
              {
                id: detUuid(pfx, 159),
                tenantId: tid,
                driverId: driver2.id,
                totalCodCollected: 1950000,
                amountRemitted: 1950000,
                status: 'PENDING',
                qrCodeToken: 'REM-20261103',
                createdAt: new Date('2026-11-11T08:10:00Z'),
              },
            ],
          });
        } else {
          await tx.codRemittance.create({
            data: {
              id: detUuid(pfx, 157),
              tenantId: tid,
              driverId: driver1.id,
              totalCodCollected: 1200000,
              amountRemitted: 1200000,
              status: 'PENDING',
              qrCodeToken: `REM-${cfg.codeSuffix}01`,
            },
          });
        }

        // B2B Invoices & Returns & Webhooks
        const inv1 = await tx.invoice.create({
          data: {
            id: detUuid(pfx, 160),
            tenantId: tid,
            clientId: clientMain.id,
            invoiceNumber: `INV-${cfg.codeSuffix}-2026-001`,
            totalAmount: 18500000,
            status: 'PENDING',
            dueAt: new Date(Date.now() + 14 * 86400 * 1000),
          },
        });
        await tx.invoiceLineItem.create({
          data: {
            id: detUuid(pfx, 161),
            tenantId: tid,
            invoiceId: inv1.id,
            description: 'Dịch vụ kho vận & vận tải tuyến Amata - Long Bình tháng 11/2026',
            quantity: 1,
            unitPrice: 18500000,
            lineTotal: 18500000,
          },
        });
        const inv2 = await tx.invoice.create({
          data: {
            id: detUuid(pfx, 162),
            tenantId: tid,
            clientId: clientMain.id,
            invoiceNumber: `INV-${cfg.codeSuffix}-2026-002`,
            totalAmount: 9200000,
            status: 'PAID',
            dueAt: new Date(Date.now() - 5 * 86400 * 1000),
            paidAt: new Date('2026-11-05T09:00:00Z'),
          },
        });
        await tx.paymentTransaction.create({
          data: {
            id: detUuid(pfx, 163),
            tenantId: tid,
            invoiceId: inv2.id,
            amount: 9200000,
            method: 'BANK_TRANSFER',
            status: 'COMPLETED',
            transactionId: `TX-${cfg.codeSuffix}-920000`,
          },
        });

        // Return reasons & request
        const reasonDmg = await tx.returnReason.create({
          data: { id: detUuid(pfx, 165), tenantId: tid, code: 'DAMAGED', name: 'Hư hỏng trong quá trình vận chuyển' },
        });
        await tx.returnReason.create({
          data: { id: detUuid(pfx, 166), tenantId: tid, code: 'WRONG_ITEM', name: 'Giao sai mã SKU / quy cách' },
        });
        const rma1 = await tx.returnRequest.create({
          data: {
            id: detUuid(pfx, 167),
            tenantId: tid,
            returnCode: `RMA-${cfg.codeSuffix}-001`,
            orderId: createdOrderIds[4],
            clientId: clientMain.id,
            status: 'PENDING',
            reasonId: reasonDmg.id,
            reasonNote: 'Thùng hàng bị móp góc khi giao tại cổng Amata',
            pickupAddress: dongNaiDistrictAddresses[0].addr,
            returnType: 'REFUND',
          },
        });
        await tx.returnItem.create({
          data: {
            id: detUuid(pfx, 168),
            tenantId: tid,
            returnRequestId: rma1.id,
            productId: products[0].id,
            quantityRequested: 1,
            unitRefundAmount: 450000,
          },
        });

        await tx.clientWebhook.create({
          data: {
            id: detUuid(pfx, 170),
            tenantId: tid,
            clientId: clientMain.id,
            url: `https://webhook-sink.smartlogi.invalid/events/${cfg.codeSuffix.toLowerCase()}`,
            events: JSON.stringify(['order.created', 'order.delivered', 'customs.cleared']),
            secretToken: `whsec_demo_${cfg.codeSuffix.toLowerCase()}_redacted`,
            isActive: true,
          },
        });

        // PackStation shifts + logs
        await tx.staffShift.create({
          data: {
            id: detUuid(pfx, 172),
            tenantId: tid,
            warehouseId: wh.id,
            staffId: cfg.staffUserId,
            shiftStart: new Date(Date.now() - 2 * 3600 * 1000),
            status: 'OPEN',
          },
        });
        await tx.scanLog.create({
          data: {
            id: detUuid(pfx, 173),
            tenantId: tid,
            warehouseId: wh.id,
            barcode: products[0].barcode || products[0].sku,
            result: 'MATCHED',
            deviceId: 'STN-PACK-01',
            actorId: cfg.staffUserId,
          },
        });
        await tx.packStationLog.create({
          data: {
            id: detUuid(pfx, 174),
            tenantId: tid,
            warehouseId: wh.id,
            orderId: createdOrderIds[3],
            weightGrams: 1450,
            dimensionCm: '35x25x20',
            deviceId: 'STN-PACK-01',
          },
        });

        // Container / Tractor / Chassis / Yard / EIR / Freight / XNK
        const tractor1 = await tx.tractorUnit.create({
          data: {
            id: detUuid(pfx, 200),
            tenantId: tid,
            unitCode: `TRC-${cfg.codeSuffix}-01`,
            plateNumber: `60LD-${cfg.codeSuffix}1`,
            horsePower: 440,
            emissionStd: 'EURO5',
            status: 'IN_TRANSIT',
            currentFacilityId: facilityByCode.get('ICD_TAN_CANG_LONG_BINH') || null,
          },
        });
        const tractor2 = await tx.tractorUnit.create({
          data: {
            id: detUuid(pfx, 201),
            tenantId: tid,
            unitCode: `TRC-${cfg.codeSuffix}-02`,
            plateNumber: `60LD-${cfg.codeSuffix}2`,
            horsePower: 420,
            emissionStd: 'EURO5',
            status: 'AVAILABLE',
            currentFacilityId: facilityByCode.get('PORT_PHUOC_AN') || null,
          },
        });

        const chassis1 = await tx.chassisUnit.create({
          data: {
            id: detUuid(pfx, 202),
            tenantId: tid,
            chassisCode: `CHS-${cfg.codeSuffix}-01`,
            plateNumber: `60R-${cfg.codeSuffix}1`,
            axleCount: 3,
            compatibleSizes: ['20GP', '40HC', '40RF'],
            status: 'IN_USE',
          },
        });
        const chassis2 = await tx.chassisUnit.create({
          data: {
            id: detUuid(pfx, 203),
            tenantId: tid,
            chassisCode: `CHS-${cfg.codeSuffix}-02`,
            plateNumber: `60R-${cfg.codeSuffix}2`,
            axleCount: 3,
            compatibleSizes: ['20GP', '40HC'],
            status: 'AVAILABLE',
          },
        });

        const cont1 = await tx.containerEquipment.create({
          data: {
            id: detUuid(pfx, 204),
            tenantId: tid,
            containerNo: `MSCU${pfx.slice(0, 3)}4821`,
            sizeType: '40HC',
            isoCode: '45G1',
            status: 'LADEN_IN_TRANSIT',
            currentSealNo: `SL-${cfg.codeSuffix}-8891`,
          },
        });
        const cont2 = await tx.containerEquipment.create({
          data: {
            id: detUuid(pfx, 205),
            tenantId: tid,
            containerNo: `COSU${pfx.slice(0, 3)}8812`,
            sizeType: '40HC',
            isoCode: '45G1',
            status: 'EMPTY_AT_DEPOT',
          },
        });
        const contReefer = await tx.containerEquipment.create({
          data: {
            id: detUuid(pfx, 206),
            tenantId: tid,
            containerNo: `ONEU${pfx.slice(0, 3)}7731`,
            sizeType: '40RF',
            isoCode: '45R1',
            reeferTempC: -18.5,
            status: 'EMPTY_AT_DEPOT',
          },
        });

        // Yard + Yard Slots + Gate Event + EIR
        const yard = await tx.yard.create({
          data: {
            id: detUuid(pfx, 210),
            tenantId: tid,
            code: `YRD-${cfg.codeSuffix}-01`,
            name: `Depot & Bãi Container ${cfg.whName}`,
            facilityId: facilityByCode.get('ICD_TAN_CANG_LONG_BINH') || null,
            totalSlots: 24,
            reeferPlugs: 4,
            status: 'ACTIVE',
          },
        });
        const yardSlots = [];
        for (let s = 1; s <= 6; s++) {
          const isOccupied = s <= 2;
          const slot = await tx.yardSlot.create({
            data: {
              id: detUuid(pfx, 210 + s),
              tenantId: tid,
              yardId: yard.id,
              block: s <= 4 ? 'A' : 'R',
              rowNo: 1,
              bayNo: s,
              tierNo: 1,
              slotCode: `${s <= 4 ? 'A' : 'R'}-R1-B${s}-T1`,
              isReeferSlot: s > 4,
              status: isOccupied ? 'OCCUPIED' : 'EMPTY',
              containerId: s === 1 ? cont2.id : s === 2 ? contReefer.id : null,
            },
          });
          yardSlots.push(slot);
        }

        const gateInEv = await tx.containerGateEvent.create({
          data: {
            id: detUuid(pfx, 220),
            tenantId: tid,
            yardId: yard.id,
            yardSlotId: yardSlots[0].id,
            containerId: cont2.id,
            tractorId: tractor2.id,
            chassisId: chassis2.id,
            eventType: 'GATE_IN',
            loadState: 'EMPTY',
            notes: 'Hạ vỏ rỗng sau trả hàng KCN Amata',
          },
        });
        await tx.equipmentInterchangeReceipt.create({
          data: {
            id: detUuid(pfx, 221),
            tenantId: tid,
            eirNumber: `EIR-${cfg.codeSuffix}-2026-001`,
            gateEventId: gateInEv.id,
            yardId: yard.id,
            containerId: cont2.id,
            tractorId: tractor2.id,
            chassisId: chassis2.id,
            direction: 'IN',
            loadState: 'EMPTY',
            condition: 'GOOD',
            driverName: 'Nguyễn Văn An',
            inspectorName: 'Giám định viên Bãi ICD Long Bình',
          },
        });

        // Commercial Contract Rates, Surcharges, DEM/DET Rules
        const contractRate = await tx.contractRate.create({
          data: {
            id: detUuid(pfx, 230),
            tenantId: tid,
            clientId: clientMain.id,
            contractCode: `CTR-${cfg.codeSuffix}-AMATA-CL`,
            originName: 'KCN Amata / ICD Long Bình (Đồng Nai)',
            destName: 'Cảng Cát Lái (TP.HCM)',
            corridorTag: 'SOUTH',
            serviceMode: 'FCL',
            containerSize: '40HC',
            baseRate: 4850000,
            validFrom: new Date('2026-01-01T00:00:00Z'),
            validTo: new Date('2026-12-31T23:59:59Z'),
            status: 'ACTIVE',
          },
        });
        await tx.surchargeRule.createMany({
          data: [
            {
              id: detUuid(pfx, 231),
              tenantId: tid,
              contractRateId: contractRate.id,
              code: `FUEL-${cfg.codeSuffix}`,
              name: 'Phụ phí Nhiên liệu Đầu kéo (BAF)',
              surchargeType: 'FUEL',
              calcMode: 'PERCENT',
              amount: 8,
            },
            {
              id: detUuid(pfx, 232),
              tenantId: tid,
              contractRateId: contractRate.id,
              code: `TOLL-${cfg.codeSuffix}`,
              name: 'Phí cầu đường BOT QL51 / Cao tốc',
              surchargeType: 'TOLL',
              calcMode: 'FIXED',
              amount: 320000,
            },
          ],
        });
        const demRule = await tx.demDetRule.create({
          data: {
            id: detUuid(pfx, 233),
            tenantId: tid,
            carrierCode: 'MSC',
            chargeType: 'DEMURRAGE',
            containerSize: '40HC',
            freeDays: 5,
            dailyRateTier1: 950000,
            tier1Days: 5,
            dailyRateTier2: 1450000,
          },
        });
        const detRule = await tx.demDetRule.create({
          data: {
            id: detUuid(pfx, 234),
            tenantId: tid,
            carrierCode: 'MSC',
            chargeType: 'DETENTION',
            containerSize: '40HC',
            freeDays: 4,
            dailyRateTier1: 850000,
            tier1Days: 4,
            dailyRateTier2: 1250000,
          },
        });

        // RFQ -> Quote (SENT for client acceptance test + ACCEPTED with Booking)
        const rfqSent = await tx.freightRFQ.create({
          data: {
            id: detUuid(pfx, 240),
            tenantId: tid,
            clientId: clientMain.id,
            rfqNumber: `RFQ-${cfg.codeSuffix}-001`,
            serviceMode: 'FCL_EXPORT',
            incoterm: 'FOB',
            originName: 'KCN Amata, Phường Long Bình, Thành phố Đồng Nai',
            destName: 'Cảng Cát Lái (External Gateway)',
            corridorTag: 'SOUTH',
            containerSize: '40HC',
            containerQty: 1,
            cargoDesc: 'Thiết bị cơ khí chính xác & bo mạch CNC xuất khẩu',
            weightKg: 18500,
            volumeCbm: 52,
            status: 'QUOTED',
          },
        });
        const quoteSent = await tx.freightQuote.create({
          data: {
            id: detUuid(pfx, 241),
            tenantId: tid,
            rfqId: rfqSent.id,
            clientId: clientMain.id,
            quoteNumber: `QT-${cfg.codeSuffix}-001`,
            contractRateId: contractRate.id,
            totalAmount: 5558000,
            validUntil: new Date(Date.now() + 14 * 86400 * 1000),
            status: 'SENT',
          },
        });
        await tx.quoteLine.createMany({
          data: [
            {
              id: detUuid(pfx, 242),
              tenantId: tid,
              quoteId: quoteSent.id,
              lineType: 'FREIGHT',
              description: 'Cước kéo container 40HC Long Bình -> Cát Lái',
              qty: 1,
              unitPrice: 4850000,
              lineTotal: 4850000,
            },
            {
              id: detUuid(pfx, 243),
              tenantId: tid,
              quoteId: quoteSent.id,
              lineType: 'SURCHARGE',
              description: 'Phụ phí nhiên liệu + BOT cầu đường',
              qty: 1,
              unitPrice: 708000,
              lineTotal: 708000,
            },
          ],
        });

        const rfqBooked = await tx.freightRFQ.create({
          data: {
            id: detUuid(pfx, 244),
            tenantId: tid,
            clientId: clientMain.id,
            rfqNumber: `RFQ-${cfg.codeSuffix}-002`,
            serviceMode: 'FCL_EXPORT',
            incoterm: 'CIF',
            originName: 'ICD Tân Cảng Long Bình, Đồng Nai',
            destName: 'Cảng Cái Mép - Thị Vải',
            corridorTag: 'SOUTH',
            containerSize: '40HC',
            containerQty: 1,
            cargoDesc: 'Linh kiện điện tử xuất khẩu (Cont 40HC)',
            weightKg: 21200,
            volumeCbm: 58,
            status: 'BOOKED',
          },
        });
        const quoteAccepted = await tx.freightQuote.create({
          data: {
            id: detUuid(pfx, 245),
            tenantId: tid,
            rfqId: rfqBooked.id,
            clientId: clientMain.id,
            quoteNumber: `QT-${cfg.codeSuffix}-002`,
            contractRateId: contractRate.id,
            totalAmount: 7450000,
            validUntil: new Date(Date.now() + 10 * 86400 * 1000),
            status: 'ACCEPTED',
            acceptedAt: new Date('2026-11-08T09:00:00Z'),
          },
        });

        const booking1 = await tx.freightBooking.create({
          data: {
            id: detUuid(pfx, 250),
            tenantId: tid,
            bookingNo: `BK-${cfg.codeSuffix}-2026-001`,
            quoteId: quoteAccepted.id,
            clientId: clientMain.id,
            serviceMode: 'FCL_EXPORT',
            vesselName: 'MSC ANNA V.644E',
            voyageNo: '644E',
            mblNo: `MSCU${cfg.codeSuffix}99001`,
            hblNo: `HBL-${cfg.codeSuffix}-001`,
            etd: new Date(Date.now() + 3 * 86400 * 1000),
            eta: new Date(Date.now() + 18 * 86400 * 1000),
            originFacilityId: facilityByCode.get('ICD_TAN_CANG_LONG_BINH') || null,
            destFacilityId: facilityByCode.get('PORT_CAI_MEP') || null,
            status: 'IN_TRANSIT',
          },
        });

        const shipmentTracking = `SHP-TRK-${cfg.codeSuffix}-001`;
        const shipment1 = await tx.freightShipment.create({
          data: {
            id: detUuid(pfx, 251),
            tenantId: tid,
            shipmentNo: `SHP-${cfg.codeSuffix}-001`,
            bookingId: booking1.id,
            clientId: clientMain.id,
            containerId: cont1.id,
            trackingCode: shipmentTracking,
            cargoDesc: 'Linh kiện điện tử xuất khẩu (Cont MSCU 40HC)',
            grossWeightKg: 21200,
            volumeCbm: 58,
            demRuleId: demRule.id,
            detRuleId: detRule.id,
            dischargeAt: new Date(Date.now() - 8 * 86400 * 1000),
            gateOutFullAt: new Date(Date.now() - 1 * 86400 * 1000),
            status: 'IN_TRANSIT',
          },
        });

        const leg1 = await tx.freightLeg.create({
          data: {
            id: detUuid(pfx, 252),
            tenantId: tid,
            shipmentId: shipment1.id,
            sequence: 1,
            legType: 'FACTORY_TO_ICD',
            originName: 'Nhà máy Amata (Phường Long Bình)',
            destName: 'ICD Tân Cảng Long Bình',
            originLat: 10.9478,
            originLng: 106.8722,
            destLat: 10.9415,
            destLng: 106.8908,
            status: 'COMPLETED',
            actualStart: new Date(Date.now() - 2 * 86400 * 1000),
            actualEnd: new Date(Date.now() - 36 * 3600 * 1000),
          },
        });
        const leg2 = await tx.freightLeg.create({
          data: {
            id: detUuid(pfx, 253),
            tenantId: tid,
            shipmentId: shipment1.id,
            sequence: 2,
            legType: 'ICD_TO_PORT',
            originName: 'ICD Tân Cảng Long Bình',
            destName: 'Cảng Cái Mép - Thị Vải',
            originLat: 10.9415,
            originLng: 106.8908,
            destLat: 10.5221,
            destLng: 107.0185,
            status: 'ACTIVE',
            plannedStart: new Date('2026-11-11T05:00:00Z'),
            plannedEnd: new Date('2026-11-12T05:00:00Z'),
          },
        });

        // Active EquipmentAssignment (creates realistic overlap window for 409 lock tests!)
        await tx.equipmentAssignment.create({
          data: {
            id: detUuid(pfx, 254),
            tenantId: tid,
            tractorId: tractor1.id,
            chassisId: chassis1.id,
            containerId: cont1.id,
            driverId: driver1.id,
            freightLegId: leg2.id,
            bookingId: booking1.id,
            status: 'ACTIVE',
            startAt: new Date('2026-11-11T00:00:00Z'),
            endAt: new Date('2026-11-13T00:00:00Z'),
            notes: `Đang kéo chặng ICD Long Bình -> Cái Mép (${leg1.legType} hoàn tất)`,
          },
        });

        // Freight Invoice (AR) + Ledger + Payment Allocation + Dispute Case
        const freightInv = await tx.freightInvoice.create({
          data: {
            id: detUuid(pfx, 260),
            tenantId: tid,
            invoiceNo: `FINV-${cfg.codeSuffix}-001`,
            clientId: clientMain.id,
            bookingId: booking1.id,
            shipmentId: shipment1.id,
            direction: 'AR',
            subtotal: 7450000,
            taxAmount: 596000,
            totalAmount: 8046000,
            paidAmount: 4000000,
            status: 'PARTIAL',
            dueAt: new Date(Date.now() + 15 * 86400 * 1000),
          },
        });
        await tx.freightLedgerEntry.createMany({
          data: [
            {
              id: detUuid(pfx, 261),
              tenantId: tid,
              invoiceId: freightInv.id,
              entryType: 'FREIGHT',
              amount: 7450000,
              description: `Cước hợp đồng ${booking1.bookingNo} (40HC FCL)`,
            },
            {
              id: detUuid(pfx, 262),
              tenantId: tid,
              invoiceId: freightInv.id,
              entryType: 'DEMURRAGE',
              amount: 2850000,
              description: 'Phụ trội lưu bãi (3 ngày quá hạn DEM)',
            },
          ],
        });
        await tx.paymentAllocation.create({
          data: {
            id: detUuid(pfx, 263),
            tenantId: tid,
            invoiceId: freightInv.id,
            amount: 4000000,
            reference: `VCB-AR-${cfg.codeSuffix}-001`,
            method: 'BANK_TRANSFER',
            allocatedBy: cfg.adminUserId,
            status: 'POSTED',
          },
        });
        await tx.disputeCase.create({
          data: {
            id: detUuid(pfx, 264),
            tenantId: tid,
            disputeCode: `DSP-${cfg.codeSuffix}-001`,
            invoiceId: freightInv.id,
            shipmentId: shipment1.id,
            clientId: clientMain.id,
            category: 'DEM_DET',
            claimedAmount: 1900000,
            reason: 'Xe nằm chờ tại cổng cảng quá 4 tiếng do kẹt luồng tàu',
            status: 'OPEN',
          },
        });

        // Trade Documents (CI + PL mismatch pair + VERIFIED BL + REJECTED failure doc)
        const docCi = await tx.tradeDocument.create({
          data: {
            id: detUuid(pfx, 270),
            tenantId: tid,
            bookingId: booking1.id,
            shipmentId: shipment1.id,
            clientId: clientMain.id,
            docType: 'COMMERCIAL_INVOICE',
            docNumber: `CI-${cfg.codeSuffix}-2026-01`,
            fileName: `CI_${cfg.codeSuffix}_2026.pdf`,
            status: 'MISMATCH_FOUND',
            extractionStatus: 'SUCCEEDED',
            extractedJson: {
              invoiceNo: `CI-${cfg.codeSuffix}-2026-01`,
              currency: 'USD',
              totalValue: 142500,
              grossWeightKg: 21200,
              packageCount: 48,
            },
            discrepanciesJson: {
              field: 'grossWeightKg',
              ciValue: 21200,
              plValue: 20950,
            },
          },
        });
        await tx.tradeDocumentVersion.create({
          data: {
            id: detUuid(pfx, 271),
            tenantId: tid,
            documentId: docCi.id,
            versionNo: 1,
            fileName: `CI_${cfg.codeSuffix}_2026.pdf`,
            uploadedBy: cfg.customerUserId,
            note: 'Initial Commercial Invoice upload',
          },
        });

        await tx.tradeDocument.create({
          data: {
            id: detUuid(pfx, 272),
            tenantId: tid,
            bookingId: booking1.id,
            shipmentId: shipment1.id,
            clientId: clientMain.id,
            docType: 'PACKING_LIST',
            docNumber: `PL-${cfg.codeSuffix}-2026-01`,
            fileName: `PL_${cfg.codeSuffix}_2026.pdf`,
            status: 'MISMATCH_FOUND',
            extractionStatus: 'SUCCEEDED',
            extractedJson: {
              grossWeightKg: 20950,
              packageCount: 48,
            },
          },
        });

        await tx.tradeDocument.create({
          data: {
            id: detUuid(pfx, 273),
            tenantId: tid,
            bookingId: booking1.id,
            shipmentId: shipment1.id,
            clientId: clientMain.id,
            docType: 'BILL_OF_LADING',
            docNumber: `BL-${cfg.codeSuffix}-2026-01`,
            fileName: `Scan_Corrupted_${cfg.codeSuffix}.pdf`,
            status: 'REJECTED',
            extractionStatus: 'FAILED',
            discrepanciesJson: {
              errorCode: 'PASSWORD_PROTECTED',
              message: 'Tệp chứng từ có mật khẩu bảo vệ — không thể trích xuất tự động',
            },
          },
        });

        // Customs Declarations + Status Events + HS Code Suggestions (NEEDS_CUSTOMS_REVIEW gate)
        const declReview = await tx.customsDeclaration.create({
          data: {
            id: detUuid(pfx, 275),
            tenantId: tid,
            declarationNo: `3069102${cfg.codeSuffix}01`,
            bookingId: booking1.id,
            shipmentId: shipment1.id,
            direction: 'EXPORT',
            channel: 'YELLOW',
            portCode: 'VNSGN',
            hsReviewRequired: true,
            status: 'NEEDS_CUSTOMS_REVIEW',
            notes: 'Chờ cán bộ XNK xác nhận mã HS advisory trước khi truyền VNACCS',
          },
        });
        await tx.customsStatusEvent.create({
          data: {
            id: detUuid(pfx, 276),
            tenantId: tid,
            declarationId: declReview.id,
            status: 'NEEDS_CUSTOMS_REVIEW',
            channel: 'YELLOW',
            message: 'Tạo tờ khai nháp — yêu cầu duyệt mã HS bắt buộc',
            actorId: cfg.adminUserId,
          },
        });
        await tx.hSCodeSuggestion.create({
          data: {
            id: detUuid(pfx, 277),
            tenantId: tid,
            declarationId: declReview.id,
            documentId: docCi.id,
            itemDescription: 'Electronic CNC Microcontroller Assembly Board',
            suggestedHsCode: '85423100',
            confidence: 0.78,
            advisoryOnly: true,
            status: 'NEEDS_CUSTOMS_REVIEW',
            sourceMethod: 'rule_fallback',
          },
        });

        const declRed = await tx.customsDeclaration.create({
          data: {
            id: detUuid(pfx, 278),
            tenantId: tid,
            declarationNo: `3069102${cfg.codeSuffix}02`,
            bookingId: booking1.id,
            shipmentId: shipment1.id,
            direction: 'IMPORT',
            channel: 'RED',
            portCode: 'VNCAI',
            hsReviewRequired: false,
            status: 'HOLD',
            notes: 'Phân luồng Đỏ — kiểm hóa thực tế 100% tại Cảng Cái Mép',
          },
        });
        await tx.customsStatusEvent.create({
          data: {
            id: detUuid(pfx, 279),
            tenantId: tid,
            declarationId: declRed.id,
            status: 'HOLD',
            channel: 'RED',
            message: 'Hải quan phân luồng ĐỎ — yêu cầu kiểm tra thực tế container',
            actorId: cfg.adminUserId,
          },
        });

        // Public Tracking Grants (FULL, CITY_WARD, STATUS_ONLY, EXPIRED/REVOKED -> 410)
        const tokenSpecs = [
          {
            suffix: 'full',
            precision: 'FULL',
            trackingCode: createdOrderCodes[2],
            orderId: createdOrderIds[2],
            shipmentId: null as string | null,
            expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
            revokedAt: null as Date | null,
            stateLabel: 'ACTIVE',
          },
          {
            suffix: 'ward',
            precision: 'CITY_WARD',
            trackingCode: shipmentTracking,
            orderId: null as string | null,
            shipmentId: shipment1.id,
            expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
            revokedAt: null as Date | null,
            stateLabel: 'ACTIVE',
          },
          {
            suffix: 'masked',
            precision: 'STATUS_ONLY',
            trackingCode: createdOrderCodes[3],
            orderId: createdOrderIds[3],
            shipmentId: null as string | null,
            expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
            revokedAt: null as Date | null,
            stateLabel: 'ACTIVE',
          },
          {
            suffix: 'revoked',
            precision: 'CITY_WARD',
            trackingCode: createdOrderCodes[0],
            orderId: createdOrderIds[0],
            shipmentId: null as string | null,
            expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
            revokedAt: new Date('2026-11-10T10:00:00Z'),
            stateLabel: 'REVOKED (410)',
          },
        ];

        for (let tIdx = 0; tIdx < tokenSpecs.length; tIdx++) {
          const spec = tokenSpecs[tIdx];
          const rawTok = `slg_demo_${cfg.codeSuffix.toLowerCase()}_${spec.suffix}_${crypto.randomBytes(6).toString('hex')}`;
          const tokHash = crypto.createHash('sha256').update(rawTok).digest('hex');
          await tx.publicTrackingGrant.create({
            data: {
              id: detUuid(pfx, 285 + tIdx),
              tenantId: tid,
              trackingCode: spec.trackingCode,
              orderId: spec.orderId,
              shipmentId: spec.shipmentId,
              tokenHash: tokHash,
              allowedPrecision: spec.precision,
              expiresAt: spec.expiresAt,
              revokedAt: spec.revokedAt,
              createdBy: cfg.customerUserId,
            },
          });
          trackingShareTokens.push({
            label: `${cfg.codeSuffix}-${spec.suffix}`,
            trackingCode: spec.trackingCode,
            precision: spec.precision,
            token: rawTok,
            status: spec.stateLabel,
          });
        }

        // AI Model + Feedback + DemandForecast + Outbox DLQ
        const aiModel = await tx.aiModel.create({
          data: {
            id: detUuid(pfx, 290),
            tenantId: tid,
            name: 'Dong Nai Heuristic ETA & Route Baseline',
            version: '1.0.0-baseline',
            type: 'VRP_HEURISTIC',
            modelPath: 'workers/ai-worker/src/lib/vrp.ts',
            isCurrent: true,
            metadata: JSON.stringify({ distanceSource: 'haversine_circuity_1.41', accuracyMeasured: false }),
          },
        });
        await tx.aiFeedback.create({
          data: {
            id: detUuid(pfx, 291),
            tenantId: tid,
            modelId: aiModel.id,
            resourceType: 'HS_CODE',
            resourceId: declReview.id,
            aiPrediction: '85423900',
            humanCorrected: '85423100',
            confidence: 0.78,
            isUsedForTrain: false,
          },
        });

        await tx.outboxEvent.create({
          data: {
            id: detUuid(pfx, 292),
            eventId: detUuid(pfx, 392),
            correlationId: `demo-dlq-${cfg.codeSuffix.toLowerCase()}`,
            tenantId: tid,
            channel: 'WEBHOOK',
            topic: 'order.delivered',
            payload: { trackingCode: createdOrderCodes[3], tenantId: tid, deliveryStatus: 'DELIVERED' },
            status: 'DEAD_LETTER',
            attempts: 5,
            lastError: 'Simulated 502 Bad Gateway from partner sandbox endpoint',
            deadLetterReason: 'MAX_RETRIES_EXCEEDED',
          },
        });
        await tx.webhookDelivery.create({
          data: {
            id: detUuid(pfx, 293),
            webhookId: detUuid(pfx, 170),
            tenantId: tid,
            url: `https://webhook-sink.smartlogi.invalid/events/${cfg.codeSuffix.toLowerCase()}`,
            event: 'order.delivered',
            status: 'DEAD_LETTER',
            attempts: 5,
            lastStatusCode: 502,
            lastError: 'Upstream gateway timeout during demo webhook failure scenario',
            dlqReason: 'MAX_RETRIES_EXCEEDED',
          },
        });
      }

      // Execute per-tenant operations seeding
      await seedActiveTenantOperations({
        tenantId: DEMO_TENANT_IDS.DN3PL,
        prefixHex: '30000002',
        adminUserId: t1Admin.userId,
        whManagerId: t1WhMgr.userId,
        staffUserId: t1PackStaff.userId,
        driverUserId: t1DriverUser.userId,
        customerUserId: t1Customer.userId,
        customerEmail: t1Customer.email,
        customerName: 'Võ Minh Anh',
        companyName: 'Amata Precision Manufacturing Co., Ltd',
        codeSuffix: 'DN3PL',
        whCode: 'WH-DN-LB01',
        whName: 'Kho Ngoại quan ICD Tân Cảng Long Bình',
        whAddress: 'Khu Công nghiệp Biên Hòa II / Phường Long Bình, Thành phố Đồng Nai',
        orderCount: 140,
        seedBankCsvRemittances: true,
      });

      await seedActiveTenantOperations({
        tenantId: DEMO_TENANT_IDS.FDIBH,
        prefixHex: '40000002',
        adminUserId: t2Admin.userId,
        whManagerId: t2Admin.userId,
        staffUserId: detUuid('40000001', 3),
        driverUserId: t2Admin.userId,
        customerUserId: t2Customer.userId,
        customerEmail: t2Customer.email,
        customerName: 'Trần Thảo Vy',
        companyName: 'FDI Electronics Bien Hoa Corp',
        codeSuffix: 'FDIBH',
        whCode: 'WH-FDI-AM01',
        whName: 'Kho FDI Biên Hòa Amata Electronics',
        whAddress: 'Lô 240 KCN Amata, Phường Long Bình, Thành phố Đồng Nai',
        orderCount: 55,
        seedBankCsvRemittances: false,
      });

      await seedActiveTenantOperations({
        tenantId: DEMO_TENANT_IDS.LMLK,
        prefixHex: '50000002',
        adminUserId: t3Admin.userId,
        whManagerId: t3Admin.userId,
        staffUserId: t3Admin.userId,
        driverUserId: t3Admin.userId,
        customerUserId: t3Customer.userId,
        customerEmail: t3Customer.email,
        customerName: 'Huỳnh Tấn Phát',
        companyName: 'HTX Nông Sản Xuất Khẩu Long Khánh',
        codeSuffix: 'LMLK',
        whCode: 'WH-LK-01',
        whName: 'Trung tâm Phân loại Last-Mile Long Khánh',
        whAddress: 'QL1A Phường Long Khánh, Thành phố Đồng Nai',
        orderCount: 35,
        seedBankCsvRemittances: false,
      });

      // Quiet unused variable warning if any
      void t1Dispatch;

      // Initialize default persistent cloud DemoSandbox + initial simulation timeline entry
      await tx.demoSandbox.upsert({
        where: { sandboxKey: 'shared-demo' },
        update: {
          tenantId: DEMO_TENANT_IDS.DN3PL,
          tenantSlug: 'demo-3pl-dn',
          activeScenario: 'NORMAL_DAY',
          scenarioStatus: 'ACTIVE',
          simSpeed: 1,
          telemetryPaused: false,
          networkSimMode: 'NORMAL',
          stateJson: { presetTitle: 'Vận hành bình thường tại Đồng Nai', seededOrders: 230, stepCount: 0 },
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
        create: {
          sandboxKey: 'shared-demo',
          tenantId: DEMO_TENANT_IDS.DN3PL,
          tenantSlug: 'demo-3pl-dn',
          activeScenario: 'NORMAL_DAY',
          scenarioStatus: 'ACTIVE',
          simSpeed: 1,
          telemetryPaused: false,
          networkSimMode: 'NORMAL',
          stateJson: { presetTitle: 'Vận hành bình thường tại Đồng Nai', seededOrders: 230, stepCount: 0 },
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });
      await tx.demoSimulationEvent.create({
        data: {
          sandboxKey: 'shared-demo',
          tenantId: DEMO_TENANT_IDS.DN3PL,
          category: 'SCENARIO',
          eventType: 'DEMO_SEED_INITIALIZED',
          summary: 'Enterprise demo workspace initialized (4 tenants, 230 orders, 95 Dong Nai 2026 units)',
          payloadJson: { scenario: 'NORMAL_DAY', simulated: true },
        },
      });
    },
    { timeout: 300000, maxWait: 30000 },
  );

  // Write local gitignored credentials manifesto (NEVER committed)
  const repoRoot = path.resolve(__dirname, '../../../..');
  const outPath = path.join(repoRoot, 'DEMO_ACCOUNTS.local.md');
  const lines: string[] = [
    '# SmartLogi AI SaaS — Local Enterprise Demo Credentials & Verification Tokens',
    '',
    '> **SECURITY NOTICE**: This file is gitignored (`DEMO_ACCOUNTS.local.md` & `*.local.md`). Never commit or share outside authorized QA channels.',
    `> Generated at: ${new Date().toISOString()}`,
    '',
    '## 1. Portal Demo Accounts',
    '',
    '| Portal | Tenant Slug | Role | Email | Password | Scenario Purpose |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const c of credentialsLog) {
    lines.push(`| ${c.portal} | \`${c.tenantSlug}\` | \`${c.role}\` | \`${c.email}\` | \`${c.password}\` | ${c.purpose} |`);
  }
  lines.push('');
  lines.push('## 2. Public Tracking Share Tokens (`/api/v1/public/t/:token` & `/track/:code?token=...`)');
  lines.push('');
  lines.push('| Label | Tracking Code | Precision | Status | Raw Token |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const t of trackingShareTokens) {
    lines.push(`| ${t.label} | \`${t.trackingCode}\` | \`${t.precision}\` | ${t.status} | \`${t.token}\` |`);
  }
  lines.push('');
  lines.push('## 3. Bank Reconciliation Demo Fixture');
  lines.push('- Fixture file: `tests/fixtures/bank_statement_demo.csv`');
  lines.push('- Target tenant: `demo-3pl-dn` (`REM-20261101` = 2,850,000 VND, `REM-20261102` = 4,120,000 VND, `REM-20261103` = 1,950,000 VND, plus 1 unmatched row)');
  lines.push('');

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`✅ Enterprise demo dataset seeded! Credentials written to gitignored ${outPath}`);
}

async function verifyDemoData(prisma: PrismaClient): Promise<void> {
  console.log('--- Verifying Enterprise Demo Data Integrity ---');

  const summary = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);

    const tenants = await tx.tenant.findMany({ where: { id: { in: ALL_DEMO_TENANT_IDS } } });
    const unitCount = await tx.administrativeUnit.count({ where: { provinceCode: 'DONG_NAI_2026', isActive: true } });
    const nonPendingCodes = await tx.administrativeUnit.count({
      where: { provinceCode: 'DONG_NAI_2026', NOT: { officialCodeStatus: 'PENDING_OFFICIAL_CODE' } },
    });
    const nonNoPolygon = await tx.administrativeUnit.count({
      where: { provinceCode: 'DONG_NAI_2026', NOT: { boundaryStatus: 'NO_OFFICIAL_POLYGON' } },
    });
    const aliasCount = await tx.administrativeAlias.count();
    const facilityCount = await tx.logisticsFacility.count();
    const corridorCount = await tx.transportCorridor.count();
    const restrictionCount = await tx.roadRestriction.count();
    const orderCount = await tx.order.count({ where: { tenantId: { in: ALL_DEMO_TENANT_IDS } } });
    const containerCount = await tx.containerEquipment.count({ where: { tenantId: { in: ALL_DEMO_TENANT_IDS } } });
    const yardSlotCount = await tx.yardSlot.count({ where: { tenantId: { in: ALL_DEMO_TENANT_IDS } } });
    const quoteCount = await tx.freightQuote.count({ where: { tenantId: { in: ALL_DEMO_TENANT_IDS } } });
    const customsReviewCount = await tx.customsDeclaration.count({
      where: { tenantId: { in: ALL_DEMO_TENANT_IDS }, status: 'NEEDS_CUSTOMS_REVIEW' },
    });
    const dlqOutboxCount = await tx.outboxEvent.count({
      where: { tenantId: { in: ALL_DEMO_TENANT_IDS }, status: 'DEAD_LETTER' },
    });
    const remittances = await tx.codRemittance.count({
      where: { tenantId: DEMO_TENANT_IDS.DN3PL, qrCodeToken: { in: ['REM-20261101', 'REM-20261102', 'REM-20261103'] } },
    });
    const trackingGrants = await tx.publicTrackingGrant.count({ where: { tenantId: { in: ALL_DEMO_TENANT_IDS } } });
    const superAdmins = await tx.systemAdmin.count({ where: { email: DEMO_SUPER_ADMIN_EMAIL, status: 'ACTIVE' } });

    // Verify every CUSTOMER_CLIENT TenantUser has a matching ClientUser
    const customerRoles = await tx.customRole.findMany({
      where: { tenantId: { in: ALL_DEMO_TENANT_IDS }, name: 'CUSTOMER_CLIENT' },
      select: { id: true },
    });
    const customerUserRoles = await tx.userRole.findMany({
      where: { roleId: { in: customerRoles.map((r) => r.id) } },
      include: { user: { select: { email: true, tenantId: true } } },
    });
    let missingClientUsers = 0;
    for (const ur of customerUserRoles) {
      const cu = await tx.clientUser.findFirst({
        where: { tenantId: ur.user.tenantId, email: ur.user.email },
      });
      if (!cu) missingClientUsers++;
    }

    return {
      tenantsCount: tenants.length,
      suspendedCount: tenants.filter((t) => t.status === 'SUSPENDED').length,
      unitCount,
      nonPendingCodes,
      nonNoPolygon,
      aliasCount,
      facilityCount,
      corridorCount,
      restrictionCount,
      orderCount,
      containerCount,
      yardSlotCount,
      quoteCount,
      customsReviewCount,
      dlqOutboxCount,
      remittances,
      trackingGrants,
      superAdmins,
      customerLoginCount: customerUserRoles.length,
      missingClientUsers,
    };
  });

  console.log('Verification metrics:', summary);

  const failures: string[] = [];
  if (summary.tenantsCount !== 4) failures.push(`Expected 4 demo tenants, got ${summary.tenantsCount}`);
  if (summary.suspendedCount !== 1) failures.push(`Expected 1 SUSPENDED tenant, got ${summary.suspendedCount}`);
  if (summary.unitCount !== 95) failures.push(`Expected 95 Dong Nai 2026 administrative units, got ${summary.unitCount}`);
  if (summary.nonPendingCodes !== 0) failures.push(`Found ${summary.nonPendingCodes} unit(s) missing PENDING_OFFICIAL_CODE`);
  if (summary.nonNoPolygon !== 0) failures.push(`Found ${summary.nonNoPolygon} unit(s) missing NO_OFFICIAL_POLYGON`);
  if (summary.aliasCount < 19) failures.push(`Expected >=19 historical aliases, got ${summary.aliasCount}`);
  if (summary.facilityCount < 9) failures.push(`Expected >=9 logistics facilities, got ${summary.facilityCount}`);
  if (summary.corridorCount < 4) failures.push(`Expected >=4 transport corridors, got ${summary.corridorCount}`);
  if (summary.restrictionCount < 3) failures.push(`Expected >=3 road restrictions, got ${summary.restrictionCount}`);
  if (summary.orderCount < 200) failures.push(`Expected >=200 demo orders, got ${summary.orderCount}`);
  if (summary.containerCount < 9) failures.push(`Expected >=9 containers, got ${summary.containerCount}`);
  if (summary.yardSlotCount < 18) failures.push(`Expected >=18 yard slots, got ${summary.yardSlotCount}`);
  if (summary.quoteCount < 6) failures.push(`Expected >=6 freight quotes, got ${summary.quoteCount}`);
  if (summary.customsReviewCount < 3) failures.push(`Expected >=3 customs declarations pending review, got ${summary.customsReviewCount}`);
  if (summary.dlqOutboxCount < 3) failures.push(`Expected >=3 DLQ outbox events, got ${summary.dlqOutboxCount}`);
  if (summary.remittances !== 3) failures.push(`Expected 3 bank CSV COD remittances, got ${summary.remittances}`);
  if (summary.trackingGrants < 12) failures.push(`Expected >=12 public tracking grants, got ${summary.trackingGrants}`);
  if (summary.superAdmins !== 1) failures.push(`Expected 1 platform super admin, got ${summary.superAdmins}`);
  if (summary.missingClientUsers !== 0) failures.push(`Found ${summary.missingClientUsers} CUSTOMER_CLIENT login(s) without matching ClientUser`);

  if (failures.length > 0) {
    throw new Error(`Demo verification FAILED:\n- ${failures.join('\n- ')}`);
  }

  console.log('✅ All demo enterprise verification assertions PASSED.');
}

async function resetSessionSandbox(prisma: PrismaClient, sandboxKey: string): Promise<void> {
  console.log(`--- Resetting Demo Sandbox Session (${sandboxKey}) ---`);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await tx.demoSimulationEvent.deleteMany({ where: { sandboxKey } });
    await tx.demoHandoffToken.deleteMany({ where: { sandboxKey } });
    await tx.demoSandbox.upsert({
      where: { sandboxKey },
      update: {
        activeScenario: 'NORMAL_DAY',
        scenarioStatus: 'ACTIVE',
        simSpeed: 1,
        telemetryPaused: false,
        networkSimMode: 'NORMAL',
        stateJson: { resetAt: new Date().toISOString(), stepCount: 0 },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      create: {
        sandboxKey,
        tenantId: DEMO_TENANT_IDS.DN3PL,
        tenantSlug: 'demo-3pl-dn',
        activeScenario: 'NORMAL_DAY',
        scenarioStatus: 'ACTIVE',
        simSpeed: 1,
        telemetryPaused: false,
        networkSimMode: 'NORMAL',
        stateJson: { resetAt: new Date().toISOString(), stepCount: 0 },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  });
  console.log(`✅ Sandbox session '${sandboxKey}' state reset without disturbing other sessions.`);
}

async function cleanupExpiredDemoArtifacts(prisma: PrismaClient): Promise<void> {
  console.log('--- Cleaning up Expired Demo Sandboxes, Handoffs & Idempotency Records ---');
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const handoffs = await tx.demoHandoffToken.deleteMany({ where: { expiresAt: { lt: now } } });
    const sandboxes = await tx.demoSandbox.deleteMany({
      where: { expiresAt: { lt: now }, NOT: { sandboxKey: 'shared-demo' } },
    });
    const grants = await tx.publicTrackingGrant.deleteMany({
      where: { tenantId: { in: ALL_DEMO_TENANT_IDS }, expiresAt: { lt: now }, tokenHash: { startsWith: 'sim-' } },
    });
    const idem = await tx.apiIdempotencyRecord.deleteMany({
      where: { tenantId: { in: ALL_DEMO_TENANT_IDS }, expiresAt: { lt: now } },
    });
    return {
      handoffsDeleted: handoffs.count,
      sandboxesDeleted: sandboxes.count,
      simGrantsDeleted: grants.count,
      expiredIdemDeleted: idem.count,
    };
  });
  console.log('✅ Cleanup summary:', result);
}

async function diagnoseDemoEnvironment(prisma: PrismaClient): Promise<void> {
  console.log('--- Diagnosing Cloud Database, PostGIS, RLS Role & Demo Seed ---');
  const rlsStats = await prisma.$queryRawUnsafe<Array<{ total_tables: bigint; rls_tables: bigint; force_rls_tables: bigint }>>(`
    SELECT
      count(*) AS total_tables,
      count(*) FILTER (WHERE c.relrowsecurity) AS rls_tables,
      count(*) FILTER (WHERE c.relforcerowsecurity) AS force_rls_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);
  const appRole = await prisma.$queryRawUnsafe<Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>>(
    `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'smartlogi_app'`,
  );
  const sandboxes = await prisma.demoSandbox.count();
  const tenants = await prisma.tenant.count({ where: { id: { in: ALL_DEMO_TENANT_IDS } } });
  const orders = await prisma.order.count({ where: { tenantId: { in: ALL_DEMO_TENANT_IDS } } });
  console.log('DB Diagnostics:', {
    tables: rlsStats[0]
      ? {
          total: Number(rlsStats[0].total_tables),
          rlsEnabled: Number(rlsStats[0].rls_tables),
          forceRls: Number(rlsStats[0].force_rls_tables),
        }
      : null,
    smartlogiAppRole: appRole[0] || null,
    demoTenants: tenants,
    demoOrders: orders,
    demoSandboxes: sandboxes,
  });
}

async function main(): Promise<void> {
  const action = parseAction();
  assertSafeEnvironment(action);

  const prisma = new PrismaClient();
  try {
    if (action === 'reset') {
      await resetDemoData(prisma);
    } else if (action === 'seed') {
      await seedDemoData(prisma);
    } else if (action === 'verify') {
      await verifyDemoData(prisma);
    } else if (action === 'bootstrap') {
      await resetDemoData(prisma);
      await seedDemoData(prisma);
      await verifyDemoData(prisma);
    } else if (action === 'reset-session') {
      const sandboxKey = parseArgValue('--sandbox=') || 'shared-demo';
      await resetSessionSandbox(prisma, sandboxKey);
    } else if (action === 'cleanup-expired') {
      await cleanupExpiredDemoArtifacts(prisma);
    } else if (action === 'diagnose') {
      await diagnoseDemoEnvironment(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ [demo-enterprise] Error:', err);
  process.exit(1);
});
