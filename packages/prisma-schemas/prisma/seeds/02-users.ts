import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

export async function seedUsers(prisma: PrismaClient, roleIds: Record<string, string>) {
  console.log('--- Seeding Users (approx. 400) ---');

  const tenantAdminPassword = await bcrypt.hash('Tenant@123', 10);

  // 1. Core Demo Users (Always available for Quick Login UI)
  const demoUsers = [
    { email: 'tenant.admin@smartlogi.vn', fullName: 'Tenant Admin', role: 'TENANT_ADMIN' },
    { email: 'manager@warehouse.vn', fullName: 'WH Manager', role: 'WAREHOUSE_MANAGER' },
    { email: 'staff@warehouse.vn', fullName: 'WH Staff', role: 'WAREHOUSE_STAFF' },
    { email: 'dispatch@logistics.vn', fullName: 'Log Manager', role: 'LOGISTICS_MANAGER' },
    { email: 'driver@smartlogi.vn', fullName: 'Driver User', role: 'DRIVER' },
    { email: 'client@customer.vn', fullName: 'Client User', role: 'CUSTOMER_CLIENT' },
    { email: 'user@smartlogi.vn', fullName: 'Basic User', role: 'TENANT_USER' },
  ];

  // Email giờ unique theo tenant (`@@unique([tenantId, email])`) nên upsert
  // phải kèm tenantId.
  const tenant = await prisma.tenant.findFirst({ where: { dbSchemaName: 'public' } });
  if (!tenant) {
    throw new Error('Demo tenant chưa được tạo - hãy chạy seed 00-tenant trước');
  }

  for (const userDef of demoUsers) {
    const tenantUser = await prisma.tenantUser.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: userDef.email } },
      update: { passwordHash: tenantAdminPassword, status: 'ACTIVE', fullName: userDef.fullName },
      create: {
        tenantId: tenant.id,
        email: userDef.email,
        fullName: userDef.fullName,
        status: 'ACTIVE',
        passwordHash: tenantAdminPassword,
      },
    });

    const roleId = roleIds[userDef.role];
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: tenantUser.id, roleId } },
        update: {},
        create: { userId: tenantUser.id, roleId }
      });
    }
  }

  // 2. Generate Bulk Users (~400 employees)
  // Split: 10 Admins, 40 WH Managers, 100 WH Staff, 20 Dispatchers, 200 Drivers, 30 Other Users
  const distribution = [
    { role: 'TENANT_ADMIN', count: 10 },
    { role: 'WAREHOUSE_MANAGER', count: 40 },
    { role: 'WAREHOUSE_STAFF', count: 100 },
    { role: 'LOGISTICS_MANAGER', count: 20 },
    { role: 'DRIVER', count: 200 },
    { role: 'TENANT_USER', count: 30 }
  ];

  let bulkUsersData = [];
  
  for (const dist of distribution) {
    for (let i = 0; i < dist.count; i++) {
      bulkUsersData.push({
        email: faker.internet.email().toLowerCase().replace('@', `+${faker.string.alphanumeric(6)}@`),
        fullName: faker.person.fullName(),
        status: 'ACTIVE',
        passwordHash: tenantAdminPassword, // Same password for testing
        role: dist.role
      });
    }
  }

  console.log(`Generating ${bulkUsersData.length} bulk users...`);
  
  // We use createMany for the users. SQLite supports createMany starting Prisma 5 (except when skipping duplicates, but we just wipe DB anyway).
  const usersToInsert = bulkUsersData.map(u => ({
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    passwordHash: u.passwordHash,
  }));

  await prisma.tenantUser.createMany({ data: usersToInsert });

  // Now assign roles. Fetch them back.
  const allGeneratedUsers = await prisma.tenantUser.findMany({
    where: { email: { notIn: demoUsers.map(u => u.email) } },
    select: { id: true, email: true }
  });

  const emailToRole = new Map(bulkUsersData.map(u => [u.email, u.role]));

  const userRolesToInsert = allGeneratedUsers.map(user => {
    const roleName = emailToRole.get(user.email);
    return {
      userId: user.id,
      roleId: roleIds[roleName as string]
    };
  }).filter(ur => ur.roleId);

  await prisma.userRole.createMany({ data: userRolesToInsert });

  console.log('✅ Users successfully seeded.');
}
