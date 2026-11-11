import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedWarehouses(prisma: PrismaClient) {
  console.log('--- Seeding Warehouses & Locations ---');

  // Fetch users for managers
  const managers = await prisma.tenantUser.findMany({
    where: { roles: { some: { role: { name: 'WAREHOUSE_MANAGER' } } } },
    take: 10
  });

  const getManagerId = (index: number) => {
    return managers.length > 0 ? managers[index % managers.length].id : null;
  };

  const branchesData: any[] = [];
  const warehousesData: any[] = [];

  // Generate 5 major branches & warehouses
  for (let i = 1; i <= 5; i++) {
    const branchCode = `BR-0${i}`;
    branchesData.push({
      type: 'REGIONAL_HUB',
      code: branchCode,
      name: `Regional Hub 0${i} - ${faker.location.city()}`,
      address: faker.location.streetAddress(),
      lat: faker.location.latitude({ min: 10.7, max: 10.9 }),
      lng: faker.location.longitude({ min: 106.5, max: 106.8 }),
      capacityCbm: 50000,
      managerId: getManagerId(i),
      status: 'ACTIVE'
    });

    warehousesData.push({
      name: `Main Warehouse 0${i}`,
      code: `WH-0${i}`,
      address: faker.location.streetAddress(),
      managerId: getManagerId(i + 5),
      status: 'ACTIVE'
    });
  }

  await prisma.branch.createMany({ data: branchesData });
  await prisma.warehouse.createMany({ data: warehousesData });

  const allWhs = await prisma.warehouse.findMany();

  const zonesData: any[] = [];
  for (const wh of allWhs) {
    ['INBOUND', 'OUTBOUND', 'STORAGE_A', 'STORAGE_B', 'COLD_STORE'].forEach((zType, i) => {
      zonesData.push({
        warehouseId: wh.id,
        code: `${wh.code}-Z${i + 1}`,
        type: zType
      });
    });
  }
  await prisma.zone.createMany({ data: zonesData });
  const allZones = await prisma.zone.findMany();

  const racksData = [];
  for (const z of allZones) {
    if (z.type.startsWith('STORAGE')) {
      for (let r = 1; r <= 10; r++) {
        racksData.push({
          zoneId: z.id,
          code: `${z.code}-R${r}`,
          aisle: `A${Math.ceil(r / 2)}`,
          rows: 5,
          levels: 4
        });
      }
    }
  }
  await prisma.rack.createMany({ data: racksData });
  const allRacks = await prisma.rack.findMany({ include: { zone: true } });

  const binsData = [];
  let binCounter = 0;
  for (const rack of allRacks) {
    for (let row = 1; row <= rack.rows; row++) {
      for (let level = 1; level <= rack.levels; level++) {
        binCounter++;
        binsData.push({
          rackId: rack.id,
          warehouseId: rack.zone.warehouseId,
          barcode: `BIN-${rack.code}-${row}-${level}`,
          rowIndex: row,
          levelIndex: level,
          maxWeightKg: 1000,
          maxVolumeCbm: 1.5,
          posX: row * 2,
          posY: level * 2,
          posZ: 0
        });
        
        // Chunk inserts to avoid SQLite limit
        if (binsData.length >= 2000) {
          await prisma.bin.createMany({ data: binsData });
          binsData.length = 0; // clear
        }
      }
    }
  }
  if (binsData.length > 0) {
    await prisma.bin.createMany({ data: binsData });
  }

  console.log(`✅ Seeded 5 Warehouses, Zones, Racks, and ${binCounter} Bins.`);
}
