import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedTripsAndTasks(prisma: PrismaClient) {
  console.log('--- Seeding Trips & Extra Analytics Data ---');

  const allDrivers = await prisma.driver.findMany();
  const allVehicles = await prisma.vehicle.findMany();
  const inTransitOrders = await prisma.order.findMany({ where: { status: 'IN_TRANSIT' }, take: 100 });
  const allBranches = await prisma.branch.findMany();

  // Trips
  const tripsData = [];
  for (let i = 0; i < 40; i++) {
    const assignedDriver = faker.helpers.arrayElement(allDrivers);
    const assignedVehicle = faker.helpers.arrayElement(allVehicles);
    tripsData.push({
      tripCode: `TRIP-${faker.string.numeric(8)}`,
      driverId: assignedDriver?.id,
      vehicleId: assignedVehicle?.id,
      status: faker.helpers.arrayElement(['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED']),
      totalWeightKg: faker.number.float({ min: 100, max: 2000 }),
      totalVolumeCbm: faker.number.float({ min: 1, max: 10 }),
      departureTime: faker.date.recent(),
      aiOptimized: faker.datatype.boolean()
    });
  }

  await prisma.trip.createMany({ data: tripsData });
  const allTrips = await prisma.trip.findMany();

  const allProducts = await prisma.product.findMany();
  const allWhs = await prisma.warehouse.findMany();

  // Deliveries (linking trips to orders)
  const deliveriesData = [];
  for (let i = 0; i < inTransitOrders.length; i++) {
    const o = inTransitOrders[i];
    const t = allTrips[i % allTrips.length];
    deliveriesData.push({
      tripId: t.id,
      orderId: o.id,
      status: faker.helpers.arrayElement(['PENDING', 'DELIVERED', 'FAILED']),
      stopSequence: Math.floor(Math.random() * 10) + 1,
      stopType: 'DELIVERY',
      customerName: o.recipientName,
      customerPhone: o.recipientPhone,
      deliveryAddress: o.recipientAddress,
      lat: o.lat || 10.762622,
      lng: o.lng || 106.660172,
      codAmountExpected: o.codAmount
    });
  }
  await prisma.delivery.createMany({ data: deliveriesData });

  // Tasks
  const tasksData = [];
  const whUsers = await prisma.tenantUser.findMany({
    where: { roles: { some: { role: { name: 'WAREHOUSE_STAFF' } } } },
    take: 50
  });

  for (let i = 0; i < 200; i++) {
    const assignee = faker.helpers.arrayElement(whUsers);
    const branch = faker.helpers.arrayElement(allBranches);
    const wh = faker.helpers.arrayElement(allWhs);
    const prod = faker.helpers.arrayElement(allProducts);
    tasksData.push({
      warehouseId: wh?.id,
      taskType: faker.helpers.arrayElement(['PICKING', 'PUTAWAY', 'REPLENISHMENT']),
      status: faker.helpers.arrayElement(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
      priority: faker.helpers.arrayElement([0, 1, 2]),
      assigneeId: assignee?.id,
      productId: prod?.id,
      quantityRequested: faker.number.int({ min: 1, max: 100 })
    });
  }

  for (let i = 0; i < tasksData.length; i += 100) {
    await prisma.task.createMany({ data: tasksData.slice(i, i + 100) });
  }

  console.log(`✅ Seeded ${tripsData.length} Trips and ${tasksData.length} Tasks.`);
}
