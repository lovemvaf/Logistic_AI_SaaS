import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedCatalogAndInventory(prisma: PrismaClient) {
  console.log('--- Seeding Catalog & Inventory ---');

  // Categories
  const categoriesData = Array.from({ length: 20 }).map((_, i) => {
    const name = faker.commerce.department();
    return {
      name,
      slug: (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat') + '-' + i,
    };
  });
  await prisma.category.createMany({ data: categoriesData });
  const allCategories = await prisma.category.findMany();

  // Products
  const productsData = Array.from({ length: 500 }).map(() => ({
    sku: faker.commerce.isbn(),
    name: faker.commerce.productName(),
    weightKg: faker.number.float({ min: 0.1, max: 20 }),
    volumeCbm: faker.number.float({ min: 0.01, max: 2 }),
    categoryId: allCategories.length > 0 ? faker.helpers.arrayElement(allCategories).id : null,
    status: 'ACTIVE'
  }));

  // Chunk products due to SQLite limits
  for (let i = 0; i < productsData.length; i += 200) {
    await prisma.product.createMany({ data: productsData.slice(i, i + 200) });
  }
  const allProducts = await prisma.product.findMany();

  // Fetch all warehouses and their bins
  const allWhs = await prisma.warehouse.findMany();
  const allBins = await prisma.bin.findMany({ select: { id: true, warehouseId: true } });

  const inventories = [];
  // Seed ~1500 inventory records
  for (let i = 0; i < 1500; i++) {
    const randomBin = faker.helpers.arrayElement(allBins);
    inventories.push({
      productId: faker.helpers.arrayElement(allProducts).id,
      warehouseId: randomBin.warehouseId,
      binId: randomBin.id,
      quantityOnHand: faker.number.int({ min: 10, max: 1000 }),
      quantityAllocated: faker.number.int({ min: 0, max: 10 }),
      status: 'AVAILABLE',
    });
  }

  // Chunk inventory
  for (let i = 0; i < inventories.length; i += 500) {
    await prisma.inventory.createMany({ data: inventories.slice(i, i + 500) });
  }

  // Create Stock Movements
  const allInventories = await prisma.inventory.findMany({ take: 200 });
  const allTenantUsers = await prisma.tenantUser.findMany({ take: 50 });
  
  const movements = [];
  for (let i = 0; i < 500; i++) {
    const inv = faker.helpers.arrayElement(allInventories);
    movements.push({
      inventoryId: inv.id,
      warehouseId: inv.warehouseId,
      transactionType: faker.helpers.arrayElement(['INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'TRANSFER']),
      quantityChange: faker.number.int({ min: -50, max: 50 }),
      balanceAfter: faker.number.int({ min: 0, max: 1000 }),
      actorId: allTenantUsers.length > 0 ? faker.helpers.arrayElement(allTenantUsers).id : 'system',
      referenceDocument: `REF-${faker.string.alphanumeric(8).toUpperCase()}`
    });
  }

  for (let i = 0; i < movements.length; i += 200) {
    await prisma.stockMovement.createMany({ data: movements.slice(i, i + 200) });
  }

  console.log(`✅ Seeded ${productsData.length} Products and ${inventories.length} Inventory Items.`);
}
