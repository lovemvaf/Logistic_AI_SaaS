import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

export async function seedSystemAndTenant(prisma: PrismaClient) {
  console.log('--- Seeding System & Tenant ---');

  // 1. Super admin for the admin-portal (password login).
  //    The Google login flow never auto-creates a SUPER_ADMIN; it only accepts
  //    accounts that already exist here or that are listed in
  //    SUPER_ADMIN_GOOGLE_EMAILS.
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@smartlogi.vn';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD || 'Admin@123';
  await prisma.systemAdmin.upsert({
    where: { email: superAdminEmail },
    update: { status: 'ACTIVE' },
    create: {
      email: superAdminEmail,
      fullName: 'Super Admin',
      passwordHash: await bcrypt.hash(superAdminPassword, 10),
      status: 'ACTIVE',
    },
  });

  const users = await prisma.tenantUser.findMany({ select: { id: true }, take: 100 });

  // 1. Tenants (Since system expects single tenant logic often, but let's ensure one exists if not)
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        id: faker.string.uuid(),
        name: 'Demo Logistics VN',
        slug: 'demo-logistics-vn',
        dbSchemaName: 'public',
        status: 'ACTIVE'
      }
    });
  }

  // 2. Notifications
  const notifications = [];
  if (users.length > 0) {
    for (let i = 0; i < 200; i++) {
      notifications.push({
        id: faker.string.uuid(),
        userId: faker.helpers.arrayElement(users).id,
        title: faker.helpers.arrayElement(['Đơn hàng mới', 'Cảnh báo kho', 'Hoàn tất chuyến xe']),
        body: faker.lorem.sentence(),
        type: faker.helpers.arrayElement(['INFO', 'WARNING', 'ALERT']),
        isRead: faker.datatype.boolean(),
        createdAt: faker.date.recent({ days: 10 })
      });
    }
    await prisma.notification.createMany({ data: notifications });
  }

  // 3. Settings
  const uiConfig = {
    id: faker.string.uuid(),
    tenantId: tenant.id,
    primaryColor: '#0070f3',
    logoUrl: 'https://example.com/logo.png',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await prisma.tenantUiConfig.create({ data: uiConfig });

  console.log(`✅ Seeded 1 Tenant, ${notifications.length} Notifications, and UI Config.`);
}
