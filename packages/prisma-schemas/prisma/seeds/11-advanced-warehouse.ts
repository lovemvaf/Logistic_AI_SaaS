import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedAdvancedWarehouse(prisma: PrismaClient) {
  console.log('--- Seeding Advanced Warehouse ---');

  const inventories = await prisma.inventory.findMany({ select: { id: true, productId: true, binId: true }, take: 20 });
  const users = await prisma.tenantUser.findMany({ select: { id: true }, take: 10 });
  const warehouse = await prisma.warehouse.findFirst({ select: { id: true } });
  
  if (inventories.length === 0 || !warehouse || users.length === 0) return;

  // 1. Cycle Counts
  const cycleCounts = [];
  for (let i = 0; i < 5; i++) {
    cycleCounts.push({
      id: faker.string.uuid(),
      warehouseId: warehouse.id,
      status: faker.helpers.arrayElement(['PLANNED', 'IN_PROGRESS', 'COMPLETED']),
      scheduledAt: faker.date.soon({ days: 30 }),
      createdBy: faker.helpers.arrayElement(users).id
    });
  }

  // 2. Adjustments
  const adjustments = [];
  for (const inv of inventories) {
    adjustments.push({
      id: faker.string.uuid(),
      warehouseId: warehouse.id,
      inventoryId: inv.id,
      quantityChange: faker.number.int({ min: -5, max: 5 }),
      reasonCode: faker.helpers.arrayElement(['DAMAGED', 'LOST', 'FOUND']),
      createdBy: faker.helpers.arrayElement(users).id
    });
  }

  // 3. Scan Logs
  const scanLogs = [];
  for (const inv of inventories) {
    scanLogs.push({
      id: faker.string.uuid(),
      warehouseId: warehouse.id,
      barcode: faker.string.numeric(12),
      result: 'SUCCESS',
      actorId: faker.helpers.arrayElement(users).id,
      createdAt: faker.date.recent()
    });
  }

  await prisma.cycleCount.createMany({ data: cycleCounts });
  await prisma.adjustment.createMany({ data: adjustments });
  await prisma.scanLog.createMany({ data: scanLogs });

  console.log(`✅ Seeded ${cycleCounts.length} Cycle Counts, ${adjustments.length} Adjustments, ${scanLogs.length} Scan Logs.`);
}
