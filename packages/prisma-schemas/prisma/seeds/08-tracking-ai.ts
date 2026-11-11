import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedTrackingAndAi(prisma: PrismaClient) {
  console.log('--- Seeding Tracking & AI ---');

  // Fetch some orders
  const orders = await prisma.order.findMany({ select: { id: true }, take: 150 });
  const products = await prisma.product.findMany({ select: { id: true }, take: 50 });

  if (orders.length === 0) {
    console.log('No orders found, skipping OrderTrackingEvent seeding.');
    return;
  }

  // 1. OrderTrackingEvents
  const trackingEvents = [];
  const statuses = ['UNASSIGNED', 'PENDING_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'];
  
  for (const order of orders) {
    // Generate 3-5 events per order
    const eventCount = faker.number.int({ min: 3, max: 5 });
    for (let i = 0; i < eventCount; i++) {
      trackingEvents.push({
        id: faker.string.uuid(),
        orderId: order.id,
        status: faker.helpers.arrayElement(statuses),
        location: faker.location.streetAddress() + ', TP. Hồ Chí Minh',
        description: faker.lorem.sentence(),
        timestamp: faker.date.recent({ days: 30 })
      });
    }
  }

  // 2. AiModels
  const aiModels = [
    {
      id: faker.string.uuid(),
      name: 'Demand Forecast Model (v1)',
      version: '1.0.0',
      type: 'DEMAND_FORECAST',
      accuracy: 85.5,
      modelPath: 's3://models/demand_forecast_v1.bin',
      isCurrent: false,
    },
    {
      id: faker.string.uuid(),
      name: 'Demand Forecast Model (v2)',
      version: '2.1.0',
      type: 'DEMAND_FORECAST',
      accuracy: 94.2,
      modelPath: 's3://models/demand_forecast_v2.bin',
      isCurrent: true,
    },
    {
      id: faker.string.uuid(),
      name: 'Route Optimization AI',
      version: '1.5.0',
      type: 'ROUTE_OPTIMIZATION',
      accuracy: 92.1,
      modelPath: 's3://models/route_opt_v1.5.bin',
      isCurrent: true,
    }
  ];

  await prisma.aiModel.createMany({ data: aiModels });

  // 3. DemandForecasts
  const forecasts = [];
  if (products.length > 0) {
    for (const prod of products) {
      for (let i = 0; i < 7; i++) { // Forecast next 7 days
        forecasts.push({
          id: faker.string.uuid(),
          productId: prod.id,
          forecastDate: faker.date.soon({ days: 7 }),
          demandQuantity: faker.number.int({ min: 10, max: 500 }),
          modelVersion: '2.1.0'
        });
      }
    }
    await prisma.demandForecast.createMany({ data: forecasts });
  }

  // Bulk insert tracking events
  for (let i = 0; i < trackingEvents.length; i += 1000) {
    await prisma.orderTrackingEvent.createMany({
      data: trackingEvents.slice(i, i + 1000)
    });
  }

  console.log(`✅ Seeded ${trackingEvents.length} Tracking Events, ${aiModels.length} AI Models, ${forecasts.length} Demand Forecasts.`);
}
