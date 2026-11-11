import { PrismaClient } from '@prisma/client';
import { fakerVI as faker } from '@faker-js/faker';

export async function seedFinanceAndReturns(prisma: PrismaClient) {
  console.log('--- Seeding Finance & Returns ---');

  const orders = await prisma.order.findMany({ 
    where: { status: 'DELIVERED' },
    select: { id: true, clientId: true },
    take: 100 
  });
  
  const products = await prisma.product.findMany({ select: { id: true }, take: 20 });
  const tenant = await prisma.tenant.findFirst();

  if (orders.length === 0 || !tenant) {
    console.log('No delivered orders or tenant found for Invoices/Returns.');
    return;
  }

  // 1. Invoices & Payments
  const invoices = [];
  const invoiceLineItems = [];
  const payments = [];

  for (const order of orders) {
    const invoiceId = faker.string.uuid();
    const totalAmount = faker.number.int({ min: 100000, max: 2000000 });
    
    invoices.push({
      id: invoiceId,
      tenantId: tenant.id,
      clientId: order.clientId,
      invoiceNumber: `INV-${faker.string.numeric(6)}`,
      totalAmount,
      status: faker.helpers.arrayElement(['PAID', 'PAID', 'PENDING', 'OVERDUE']),
      dueAt: faker.date.soon({ days: 15 }),
      issuedAt: faker.date.recent({ days: 15 })
    });

    invoiceLineItems.push({
      id: faker.string.uuid(),
      invoiceId: invoiceId,
      description: 'Cước vận chuyển',
      unitPrice: totalAmount,
      quantity: 1,
      lineTotal: totalAmount
    });

    payments.push({
      id: faker.string.uuid(),
      tenantId: tenant.id,
      invoiceId: invoiceId,
      amount: totalAmount,
      method: faker.helpers.arrayElement(['CASH', 'BANK_TRANSFER', 'CREDIT']),
      status: 'COMPLETED',
      transactionId: `TXN-${faker.string.numeric(8)}`,
      createdAt: faker.date.recent({ days: 5 })
    });
  }

  await prisma.invoice.createMany({ data: invoices });
  await prisma.invoiceLineItem.createMany({ data: invoiceLineItems });
  await prisma.paymentTransaction.createMany({ data: payments });

  // 2. Return Reasons
  const returnReasons = [
    { id: faker.string.uuid(), code: 'DAMAGED', name: 'Hàng bị hỏng', description: 'Hàng bị hỏng' },
    { id: faker.string.uuid(), code: 'WRONG_ITEM', name: 'Giao nhầm hàng', description: 'Giao nhầm hàng' },
    { id: faker.string.uuid(), code: 'CUSTOMER_REFUSE', name: 'Khách đổi ý', description: 'Khách đổi ý' }
  ];
  await prisma.returnReason.createMany({ data: returnReasons });

  // 3. Return Requests & Items
  const returns = [];
  const returnItems = [];
  // Take 10 orders to be returned
  const returnedOrders = orders.slice(0, 10);
  for (const o of returnedOrders) {
    const returnId = faker.string.uuid();
    returns.push({
      id: returnId,
      orderId: o.id,
      clientId: o.clientId,
      returnCode: `RET-${faker.string.numeric(6)}`,
      reasonId: faker.helpers.arrayElement(returnReasons).id,
      status: faker.helpers.arrayElement(['PENDING', 'APPROVED', 'RECEIVED', 'INSPECTED']),
      reasonNote: 'Kiểm tra lại hàng hóa',
      createdAt: faker.date.recent({ days: 5 })
    });
    
    returnItems.push({
      id: faker.string.uuid(),
      returnRequestId: returnId,
      productId: faker.helpers.arrayElement(products).id,
      quantityRequested: faker.number.int({ min: 1, max: 3 }),
      condition: faker.helpers.arrayElement(['GOOD', 'DAMAGED'])
    });
  }

  await prisma.returnRequest.createMany({ data: returns });
  await prisma.returnItem.createMany({ data: returnItems });

  console.log(`✅ Seeded ${invoices.length} Invoices, ${payments.length} Payments, ${returns.length} Return Requests.`);
}
