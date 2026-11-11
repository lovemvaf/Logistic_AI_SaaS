import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedFleetAndDrivers(prisma: PrismaClient) {
  console.log('--- Seeding Fleet & Drivers ---');

  // Fetch all users with DRIVER role
  const driverUsers = await prisma.tenantUser.findMany({
    where: { roles: { some: { role: { name: 'DRIVER' } } } }
  });

  const driversData = driverUsers.map((user) => ({
    userId: user.id,
    licenseClass: faker.helpers.arrayElement(['B2', 'C', 'D', 'E']),
    licenseExpiry: faker.date.future(),
    status: 'AVAILABLE'
  }));

  // Chunk driver insertions
  for (let i = 0; i < driversData.length; i += 100) {
    await prisma.driver.createMany({ data: driversData.slice(i, i + 100) });
  }

  // Vehicles
  const vehiclesData = Array.from({ length: 150 }).map(() => {
    const vType = faker.helpers.arrayElement(['TRUCK_LIGHT', 'TRUCK_MEDIUM', 'TRUCK_HEAVY', 'VAN', 'MOTORBIKE']);
    let capKg = 1000;
    let capCbm = 2.0;
    if (vType.includes('LIGHT')) { capKg = 1500; capCbm = 5; }
    else if (vType.includes('MEDIUM')) { capKg = 5000; capCbm = 15; }
    else if (vType.includes('HEAVY')) { capKg = 15000; capCbm = 40; }
    else if (vType === 'MOTORBIKE') { capKg = 150; capCbm = 0.5; }

    return {
      plateNumber: `${faker.number.int({ min: 10, max: 99 })}${faker.string.alpha(1).toUpperCase()}-${faker.string.numeric(5)}`,
      type: vType,
      capacityKg: capKg,
      capacityCbm: capCbm,
      status: 'AVAILABLE'
    };
  });

  for (let i = 0; i < vehiclesData.length; i += 50) {
    await prisma.vehicle.createMany({ data: vehiclesData.slice(i, i + 50) });
  }

  console.log(`✅ Seeded ${driversData.length} Drivers and ${vehiclesData.length} Vehicles.`);
}
