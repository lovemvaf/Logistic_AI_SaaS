import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedClientsAndOrders(prisma: PrismaClient) {
  console.log('--- Seeding Clients & Orders ---');

  // Clients
  const clientsData = Array.from({ length: 50 }).map(() => ({
    name: faker.company.name(),
    status: 'ACTIVE'
  }));

  await prisma.client.createMany({ data: clientsData });
  const allClients = await prisma.client.findMany();

  // Map the demo customer login to a real client so /client/* endpoints can
  // resolve a clientId. The login itself uses TenantUser (IAM), while the
  // customer API authorizes against ClientUser.
  if (allClients.length > 0) {
    const existingClientUser = await prisma.clientUser.findFirst({
      where: { email: 'client@customer.vn' },
    });
    if (!existingClientUser) {
      await prisma.clientUser.create({
        data: {
          clientId: allClients[0].id,
          email: 'client@customer.vn',
          fullName: 'Client User',
          status: 'ACTIVE',
        },
      });
    }
  }

  // Orders
  const allOrders = [];
  for (let i = 0; i < 600; i++) {
    const lat = 10.762622 + (Math.random() - 0.5) * 0.1; // Around HCMC
    const lng = 106.660172 + (Math.random() - 0.5) * 0.1;
    allOrders.push({
      trackingCode: `TRK-${faker.string.numeric(8)}`,
      clientId: faker.helpers.arrayElement(allClients).id,
      codAmount: faker.number.int({ min: 100000, max: 5000000 }),
      shippingFee: faker.number.int({ min: 15000, max: 150000 }),
      recipientName: faker.person.fullName(),
      recipientPhone: faker.phone.number(),
      recipientAddress: faker.location.streetAddress() + ', TP. Hồ Chí Minh',
      status: faker.helpers.arrayElement(['UNASSIGNED', 'UNASSIGNED', 'PENDING_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED']),
      lat: lat,
      lng: lng,
    });
  }

  // Chunk order inserts
  for (let i = 0; i < allOrders.length; i += 200) {
    await prisma.order.createMany({ data: allOrders.slice(i, i + 200) });
  }

  // Order Items
  const dbOrders = await prisma.order.findMany({ select: { id: true } });
  const allProducts = await prisma.product.findMany({ select: { id: true, weightKg: true, volumeCbm: true } });
  
  if (allProducts.length > 0) {
    const orderItemsData = [];
    for (const o of dbOrders) {
      const itemsCount = faker.number.int({ min: 1, max: 5 });
      for (let k = 0; k < itemsCount; k++) {
        const prod = faker.helpers.arrayElement(allProducts);
        orderItemsData.push({
          orderId: o.id,
          productId: prod.id,
          quantity: faker.number.int({ min: 1, max: 10 })
        });
      }
    }
    for (let i = 0; i < orderItemsData.length; i += 500) {
      await prisma.orderItem.createMany({ data: orderItemsData.slice(i, i + 500) });
    }
  }

  console.log(`✅ Seeded ${clientsData.length} Clients and ${allOrders.length} Orders.`);
}
