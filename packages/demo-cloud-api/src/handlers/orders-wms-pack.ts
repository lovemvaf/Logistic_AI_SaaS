import * as crypto from 'crypto';
import { DEMO_TENANT_IDS } from '../auth';
import { iso, num, withTenant } from '../db';
import { appendSimulationEvent } from '../scenarios';
import type { ApiContext, ApiResult } from '../types';
import { assertInternalRole, assertWriteAllowed, requireAuth } from './admin-iam';

function getTenantId(ctx: ApiContext): string {
  return ctx.session?.tenantId || DEMO_TENANT_IDS.DN3PL;
}

export async function handleOrdersWmsPackRoutes(ctx: ApiContext): Promise<ApiResult | null> {
  const { method, path, query, body } = ctx;

  // --------------------------------------------------------------------------
  // 1. Orders & Order Partials (/orders*, /order-partials*)
  // --------------------------------------------------------------------------
  if (path === '/orders' && method === 'GET') {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const tid = getTenantId(ctx);
    const page = Math.max(1, Number(query.get('page') || 1));
    const limit = Math.min(250, Math.max(1, Number(query.get('limit') || 50)));
    const status = query.get('status')?.trim();
    const search = query.get('search')?.trim() || query.get('q')?.trim();

    const res = await withTenant(tid, async (tx) => {
      const where: any = { deletedAt: null };
      if (ctx.session!.role === 'CUSTOMER_CLIENT' && ctx.session!.clientId) {
        where.clientId = ctx.session!.clientId;
      }
      if (status && status !== 'ALL') where.status = status;
      if (search) {
        where.OR = [
          { trackingCode: { contains: search, mode: 'insensitive' } },
          { recipientName: { contains: search, mode: 'insensitive' } },
          { recipientAddress: { contains: search, mode: 'insensitive' } },
          { clientOrderRef: { contains: search, mode: 'insensitive' } },
        ];
      }
      const [rows, total] = await Promise.all([
        tx.order.findMany({
          where,
          include: { client: { select: { id: true, name: true } }, items: { include: { product: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.order.count({ where }),
      ]);
      return {
        data: rows.map((o) => ({
          id: o.id,
          trackingCode: o.trackingCode,
          clientOrderRef: o.clientOrderRef || o.trackingCode,
          recipientName: o.recipientName,
          recipientPhone: o.recipientPhone,
          recipientAddress: o.recipientAddress,
          origin: 'Kho ICD Long Bình, Đồng Nai',
          destination: o.recipientAddress,
          status: o.status,
          codAmount: num(o.codAmount),
          shippingFee: num(o.shippingFee),
          lat: o.lat !== null ? num(o.lat) : null,
          lng: o.lng !== null ? num(o.lng) : null,
          notes: o.notes,
          client: o.client ? { id: o.client.id, name: o.client.name } : undefined,
          createdAt: iso(o.createdAt),
        })),
        meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    });
    return { status: 200, body: res };
  }

  if (path === '/orders' && method === 'POST') {
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const trackingCode = String(body?.trackingCode || `SLG-DEMO-${Date.now().toString().slice(-6)}`);
    const recipientName = String(body?.recipientName || '').trim();
    const recipientPhone = String(body?.recipientPhone || '0901000999').trim();
    const recipientAddress = String(body?.recipientAddress || 'Phường Long Bình, Thành phố Đồng Nai').trim();
    if (!recipientName) return { status: 400, body: { message: 'Tên người nhận là bắt buộc.' } };

    const created = await withTenant(tid, async (tx) => {
      const client =
        (ctx.session!.clientId ? await tx.client.findUnique({ where: { id: ctx.session!.clientId } }) : null) ||
        (body?.clientId ? await tx.client.findUnique({ where: { id: String(body.clientId) } }) : null) ||
        (await tx.client.findFirst());
      const ord = await tx.order.create({
        data: {
          tenantId: tid,
          trackingCode,
          clientId: client!.id,
          clientOrderRef: body?.clientOrderRef || trackingCode,
          status: 'NEW',
          recipientName,
          recipientPhone,
          recipientAddress,
          lat: body?.lat ? Number(body.lat) : 10.9478,
          lng: body?.lng ? Number(body.lng) : 106.8722,
          codAmount: num(body?.codAmount, 0),
          shippingFee: num(body?.shippingFee, 45000),
          notes: body?.notes ? String(body.notes) : null,
        },
        include: { client: { select: { id: true, name: true } } },
      });
      await tx.orderTrackingEvent.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: tid,
          orderId: ord.id,
          status: 'NEW',
          location: recipientAddress,
          description: `Khởi tạo đơn hàng ${trackingCode}`,
          timestamp: new Date(),
        },
      });
      return ord;
    });

    await appendSimulationEvent(null, {
      sandboxKey: ctx.session!.sandboxKey,
      tenantId: tid,
      category: 'ORDER',
      eventType: 'ORDER_CREATED',
      summary: `Tạo mới đơn ${created.trackingCode} (${created.recipientName})`,
    });

    return {
      status: 201,
      body: { ...created, codAmount: num(created.codAmount), shippingFee: num(created.shippingFee), createdAt: iso(created.createdAt) },
    };
  }

  if (method === 'POST' && path === '/orders/bulk/upload') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const created = await withTenant(tid, async (tx) => {
      const client = await tx.client.findFirst();
      const rows = Array.isArray(body?.orders) ? body.orders : [
        { recipientName: 'Lô Import KCN Amata #1', recipientAddress: 'Phường Long Bình, Thành phố Đồng Nai', codAmount: 1200000 },
        { recipientName: 'Lô Import Long Thành #2', recipientAddress: 'Phường Long Thành, Thành phố Đồng Nai', codAmount: 850000 },
      ];
      const out: any[] = [];
      for (const r of rows.slice(0, 20)) {
        const tc = `SLG-BULK-${Date.now().toString().slice(-5)}-${out.length + 1}`;
        const ord = await tx.order.create({
          data: {
            tenantId: tid,
            trackingCode: tc,
            clientId: client!.id,
            status: 'PENDING',
            recipientName: String(r.recipientName || 'Import Recipient'),
            recipientPhone: String(r.recipientPhone || '0901234567'),
            recipientAddress: String(r.recipientAddress || 'Thành phố Đồng Nai'),
            codAmount: num(r.codAmount, 0),
            shippingFee: num(r.shippingFee, 45000),
          },
        });
        out.push(ord);
      }
      return out;
    });
    return { status: 201, body: { imported: created.length, failed: 0, orders: created } };
  }

  if (method === 'POST' && path === '/orders/assign-trip') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.map(String) : [];
    const tripId = String(body?.tripId || '');
    await withTenant(tid, async (tx) => {
      if (orderIds.length > 0) {
        await tx.order.updateMany({ where: { id: { in: orderIds } }, data: { status: 'DISPATCHED' } });
      }
      if (tripId && orderIds[0]) {
        await tx.tripStop.create({
          data: { tenantId: tid, tripId, orderId: orderIds[0], stopType: 'DELIVERY', sequence: 1, address: 'Đồng Nai', status: 'PENDING' },
        });
      }
    });
    return { status: 200, body: { ok: true, assigned: orderIds.length } };
  }

  const orderStatusMatch = path.match(/^\/orders\/([^/]+)\/(status|cancel|reschedule|partial|tracking)$/);
  if (orderStatusMatch) {
    const [, ordId, action] = orderStatusMatch;
    const tid = getTenantId(ctx);
    if (action === 'tracking' && method === 'GET') {
      const authErr = requireAuth(ctx);
      if (authErr) return authErr;
      const events = await withTenant(tid, async (tx) =>
        tx.orderTrackingEvent.findMany({ where: { orderId: ordId }, orderBy: { timestamp: 'desc' } }),
      );
      return { status: 200, body: { data: events.map((e) => ({ ...e, timestamp: iso(e.timestamp) })) } };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const updated = await withTenant(tid, async (tx) => {
      const nextStatus =
        action === 'cancel' ? 'CANCELLED' : action === 'partial' ? 'PARTIAL_DELIVERED' : String(body?.status || 'IN_TRANSIT');
      const ord = await tx.order.update({
        where: { id: ordId },
        data: {
          status: nextStatus,
          ...(action === 'cancel' ? { cancelledReason: String(body?.reason || 'Cancelled via Portal') } : {}),
          ...(body?.promisedAt ? { estimatedDeliveryDate: new Date(body.promisedAt) } : {}),
          ...(nextStatus === 'DELIVERED' ? { actualDeliveryTime: new Date() } : {}),
        },
      });
      await tx.orderTrackingEvent.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: tid,
          orderId: ord.id,
          status: nextStatus,
          location: ord.recipientAddress,
          description: String(body?.label || body?.note || `Cập nhật trạng thái -> ${nextStatus}`),
          timestamp: new Date(),
        },
      });
      return ord;
    });
    return { status: 200, body: { ...updated, codAmount: num(updated.codAmount), shippingFee: num(updated.shippingFee) } };
  }

  const orderById = path.match(/^\/orders\/([^/]+)$/);
  if (orderById && method === 'GET') {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const tid = getTenantId(ctx);
    const idOrCode = decodeURIComponent(orderById[1]);
    const ord = await withTenant(tid, async (tx) =>
      tx.order.findFirst({
        where: { OR: [{ id: idOrCode }, { trackingCode: idOrCode }], deletedAt: null },
        include: { client: true, events: { orderBy: { timestamp: 'desc' } } },
      }),
    );
    if (!ord) return { status: 404, body: { message: 'Không tìm thấy đơn hàng.' } };
    return {
      status: 200,
      body: {
        ...ord,
        trackingEvents: ord.events,
        codAmount: num(ord.codAmount),
        shippingFee: num(ord.shippingFee),
        createdAt: iso(ord.createdAt),
      },
    };
  }

  if (path.startsWith('/order-partials')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) =>
        tx.order.findMany({ where: { status: 'PARTIAL_DELIVERED', deletedAt: null }, take: 30 }),
      );
      return { status: 200, body: { data: rows.map((o) => ({ ...o, codAmount: num(o.codAmount) })), meta: { total: rows.length } } };
    }
    const pm = path.match(/^\/order-partials\/([^/]+)$/);
    if (pm && method === 'PATCH') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const ord = await withTenant(tid, async (tx) =>
        tx.order.update({ where: { id: pm[1] }, data: { status: String(body?.status || 'DELIVERED'), notes: String(body?.note || '') } }),
      );
      return { status: 200, body: ord };
    }
  }

  // --------------------------------------------------------------------------
  // 2. Clients & Customers (/clients*, /tenant/clients*, /customers*)
  // --------------------------------------------------------------------------
  if (path === '/clients' || path === '/tenant/clients' || path === '/customers') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) =>
        tx.client.findMany({ where: { deletedAt: null }, include: { _count: { select: { orders: true } } }, orderBy: { name: 'asc' } }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            ordersCount: c._count.orders,
            creditLimit: 500000000,
            createdAt: iso(c.createdAt),
          })),
          meta: { total: rows.length },
        },
      };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const c = await withTenant(tid, async (tx) =>
        tx.client.create({ data: { tenantId: tid, name: String(body?.name || 'Khách hàng B2B mới'), status: 'ACTIVE' } }),
      );
      return { status: 201, body: c };
    }
  }

  const clientCredit = path.match(/^\/tenant\/clients\/([^/]+)\/credit$/);
  if (method === 'PATCH' && clientCredit) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    return { status: 200, body: { id: clientCredit[1], creditLimit: num(body?.amount, 500000000), ok: true } };
  }

  // --------------------------------------------------------------------------
  // 3. WMS: Products, Warehouses, Inventory, Waves, Tasks, Cycle Counts
  // --------------------------------------------------------------------------
  if (path === '/products' || path === '/wms/products') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) =>
        tx.product.findMany({ where: { deletedAt: null }, include: { category: true }, orderBy: { createdAt: 'desc' } }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((p) => ({
            ...p,
            weightKg: num(p.weightKg, 1),
            volumeCbm: num(p.volumeCbm, 0.01),
            categoryName: p.category?.name || 'General',
            createdAt: iso(p.createdAt),
          })),
          meta: { total: rows.length },
        },
      };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const sku = String(body?.sku || `SKU-${Date.now().toString().slice(-6)}`);
      const created = await withTenant(tid, async (tx) =>
        tx.product.create({
          data: {
            tenantId: tid,
            sku,
            barcode: body?.barcode ? String(body.barcode) : sku,
            name: String(body?.name || 'Sản phẩm mới'),
            weightKg: num(body?.weightKg, 1.5),
            volumeCbm: num(body?.volumeCbm, 0.02),
          },
        }),
      );
      return { status: 201, body: { ...created, weightKg: num(created.weightKg), volumeCbm: num(created.volumeCbm) } };
    }
  }

  const prodMatch = path.match(/^\/(?:wms\/)?products\/([^/]+)$/);
  if (prodMatch) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'PATCH') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const updated = await withTenant(tid, async (tx) =>
        tx.product.update({
          where: { id: prodMatch[1] },
          data: {
            ...(body?.name ? { name: String(body.name) } : {}),
            ...(body?.weightKg !== undefined ? { weightKg: num(body.weightKg, 1) } : {}),
          },
        }),
      );
      return { status: 200, body: updated };
    }
    if (method === 'DELETE') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      await withTenant(tid, async (tx) => tx.product.update({ where: { id: prodMatch[1] }, data: { deletedAt: new Date() } }));
      return { status: 200, body: { ok: true } };
    }
  }

  if (path === '/products/import' && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    return { status: 200, body: { ok: true, imported: 2, skipped: 0 } };
  }

  if (path === '/warehouses' || path === '/warehouses/bins') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      if (path === '/warehouses/bins') {
        const bins = await withTenant(tid, async (tx) => tx.bin.findMany({ include: { rack: true } }));
        return { status: 200, body: { data: bins, meta: { total: bins.length } } };
      }
      const whs = await withTenant(tid, async (tx) =>
        tx.warehouse.findMany({ where: { deletedAt: null }, include: { _count: { select: { Bin: true, Inventory: true } } } }),
      );
      return {
        status: 200,
        body: {
          data: whs.map((w) => ({
            ...w,
            _count: { bins: w._count.Bin, inventory: w._count.Inventory },
          })),
          meta: { total: whs.length },
        },
      };
    }
    if (method === 'POST' && path === '/warehouses') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const wh = await withTenant(tid, async (tx) =>
        tx.warehouse.create({
          data: {
            tenantId: tid,
            code: String(body?.code || `WH-${Date.now().toString().slice(-4)}`),
            name: String(body?.name || 'Kho mới Đồng Nai'),
            address: String(body?.address || 'Thành phố Đồng Nai'),
            status: 'ACTIVE',
          },
        }),
      );
      return { status: 201, body: wh };
    }
  }

  if (path === '/inventory' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) =>
      tx.inventory.findMany({
        include: { product: true, warehouse: true, bin: true },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((inv) => ({
          id: inv.id,
          productId: inv.productId,
          sku: inv.product?.sku,
          productName: inv.product?.name,
          warehouseId: inv.warehouseId,
          warehouseName: inv.warehouse?.name,
          binCode: inv.bin?.barcode,
          batchNumber: inv.batchNumber,
          expiryDate: iso(inv.expiryDate),
          quantityOnHand: inv.quantityOnHand,
          quantityAllocated: inv.quantityAllocated,
          available: inv.quantityOnHand - inv.quantityAllocated,
          status: inv.status,
        })),
        meta: { total: rows.length },
      },
    };
  }

  if (path === '/inventory/summary' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const data = await withTenant(tid, async (tx) => {
      const rows = await tx.inventory.findMany();
      const totalSkus = await tx.product.count({ where: { deletedAt: null } });
      const totalUnits = rows.reduce((s, r) => s + r.quantityOnHand, 0);
      const lowStockCount = rows.filter((r) => r.quantityOnHand <= 5).length;
      const expiringCount = rows.filter((r) => r.expiryDate && r.expiryDate.getTime() < Date.now() + 14 * 86400 * 1000).length;
      return { totalSkus, totalUnits, lowStockCount, expiringCount };
    });
    return { status: 200, body: data };
  }

  if (path === '/inventory/ledger' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) =>
      tx.stockMovement.findMany({
        include: { inventory: { include: { product: true } }, warehouse: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((m) => ({
          ...m,
          sku: m.inventory?.product?.sku,
          productName: m.inventory?.product?.name,
          warehouseName: m.warehouse?.name,
          createdAt: iso(m.createdAt),
        })),
        meta: { total: rows.length },
      },
    };
  }

  if (path === '/inventory/adjustments' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const page = Math.max(1, Number(query.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 20)));
    const [rows, total] = await withTenant(tid, async (tx) =>
      Promise.all([
        tx.stockMovement.findMany({
          include: {
            inventory: { include: { product: { select: { name: true, sku: true } } } },
            actor: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.stockMovement.count(),
      ]),
    );
    return {
      status: 200,
      body: {
        data: rows.map((m) => ({
          id: m.id,
          inventoryId: m.inventoryId,
          warehouseId: m.warehouseId,
          quantityChange: m.quantityChange,
          reasonCode: m.reasonCode || m.transactionType || 'ADJUSTMENT',
          createdAt: iso(m.createdAt),
          inventory: {
            product: {
              name: m.inventory?.product?.name || 'SKU Kho',
              sku: m.inventory?.product?.sku || '-',
            },
          },
          creator: {
            fullName: m.actor?.fullName || 'Warehouse Staff',
          },
        })),
        meta: { total, page, limit },
      },
    };
  }

  if (method === 'POST' && (path === '/inventory/adjust' || path === '/inventory/receive' || path === '/inventory/transfer')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const delta = path === '/inventory/receive'
      ? Math.abs(Number(body?.quantity || body?.quantityChange || body?.qtyChange || 10))
      : Number(body?.quantityChange ?? body?.qtyChange ?? body?.quantity ?? 5);

    const res = await withTenant(tid, async (tx) => {
      const inv =
        (body?.inventoryId ? await tx.inventory.findUnique({ where: { id: String(body.inventoryId) } }) : null) ||
        (await tx.inventory.findFirst({ where: { status: 'AVAILABLE' } }));
      if (!inv) return null;
      const nextQty = Math.max(0, inv.quantityOnHand + delta);
      const updated = await tx.inventory.update({ where: { id: inv.id }, data: { quantityOnHand: nextQty } });
      await tx.stockMovement.create({
        data: {
          tenantId: tid,
          inventoryId: inv.id,
          warehouseId: inv.warehouseId,
          transactionType: path.endsWith('receive') ? 'INBOUND' : path.endsWith('transfer') ? 'TRANSFER' : 'ADJUSTMENT',
          quantityChange: delta,
          balanceAfter: nextQty,
          reasonCode: String(body?.reasonCode || body?.reason || 'MANUAL_OP'),
          actorId: ctx.session!.sub,
        },
      });
      return updated;
    });
    if (!res) return { status: 404, body: { message: 'Không tìm thấy bản ghi tồn kho phù hợp.' } };
    return { status: 200, body: { ok: true, inventory: res } };
  }

  if (method === 'POST' && path === '/inventory/putaway-suggestion') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const bin = await withTenant(tid, async (tx) => tx.bin.findFirst());
    return {
      status: 200,
      body: {
        suggestedBinCode: bin?.barcode || 'BIN-DN3PL-A101',
        zone: 'Z-STR-DN3PL',
        reason: 'Tối ưu khoảng cách di chuyển gần cửa nhập ICD Long Bình',
      },
    };
  }

  if (path.startsWith('/inventory/cycle-counts')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) => tx.cycleCount.findMany({ where: { deletedAt: null }, include: { warehouse: true }, orderBy: { createdAt: 'desc' } }));
      return { status: 200, body: { data: rows.map((c) => ({ ...c, warehouseName: c.warehouse?.name, scheduledAt: iso(c.scheduledAt), createdAt: iso(c.createdAt) })), meta: { total: rows.length } } };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (method === 'POST' && path === '/inventory/cycle-counts') {
      const created = await withTenant(tid, async (tx) => {
        const wh = await tx.warehouse.findFirst();
        return tx.cycleCount.create({
          data: { tenantId: tid, warehouseId: wh!.id, status: 'PENDING', scheduledAt: new Date(), createdBy: ctx.session!.sub },
        });
      });
      return { status: 201, body: created };
    }
    const ccMatch = path.match(/^\/inventory\/cycle-counts\/([^/]+)\/(status|submit|approve)$/);
    if (ccMatch) {
      const [, ccId, action] = ccMatch;
      const nextStatus = action === 'approve' ? 'APPROVED' : action === 'submit' ? 'COUNTED' : String(body?.status || 'APPROVED');
      const updated = await withTenant(tid, async (tx) => tx.cycleCount.update({ where: { id: ccId }, data: { status: nextStatus } }));
      return { status: 200, body: updated };
    }
  }

  if (path === '/waves' || path === '/wms/waves' || path === '/waves/generate') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const search = query.get('search')?.trim();
      const page = Math.max(1, Number(query.get('page') || 1));
      const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 20)));
      const where: any = search ? { waveNumber: { contains: search, mode: 'insensitive' } } : {};
      const [rows, total] = await withTenant(tid, async (tx) =>
        Promise.all([
          tx.wavePicking.findMany({
            where,
            include: { warehouse: true, tasks: { select: { id: true, status: true, taskType: true } } },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.wavePicking.count({ where }),
        ]),
      );
      return {
        status: 200,
        body: {
          data: rows.map((w) => ({
            ...w,
            warehouseName: w.warehouse?.name,
            tasksCount: w.tasks.length,
            createdAt: iso(w.createdAt),
          })),
          meta: { total, page, limit },
        },
      };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const wave = await withTenant(tid, async (tx) => {
        const wh = await tx.warehouse.findFirst();
        return tx.wavePicking.create({
          data: {
            tenantId: tid,
            warehouseId: wh!.id,
            waveNumber: `WAVE-${Date.now().toString().slice(-5)}`,
            status: 'IN_PROGRESS',
            totalOrders: Number(body?.totalOrders || 5),
            totalItems: Number(body?.totalItems || 12),
            createdBy: ctx.session!.sub,
          },
        });
      });
      return { status: 201, body: wave };
    }
  }

  if (path.startsWith('/tasks') || path.startsWith('/wms/tasks')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const [rows, bins] = await withTenant(tid, async (tx) =>
        Promise.all([
          tx.task.findMany({ where: { deletedAt: null }, include: { product: true, wave: true }, orderBy: { createdAt: 'desc' } }),
          tx.bin.findMany({ select: { id: true, barcode: true } }),
        ]),
      );
      const binMap = new Map(bins.map((b) => [b.id, b.barcode]));
      return {
        status: 200,
        body: {
          data: rows.map((t) => ({
            ...t,
            sku: t.product?.sku,
            productName: t.product?.name,
            binCode: t.sourceBinId ? binMap.get(t.sourceBinId) || null : null,
            waveNumber: t.wave?.waveNumber,
          })),
          meta: { total: rows.length },
        },
      };
    }
    const taskComplete = path.match(/^\/(?:wms\/)?tasks\/([^/]+)\/(?:complete|confirm)$/);
    if (method === 'POST' && taskComplete) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const updated = await withTenant(tid, async (tx) =>
        tx.task.update({ where: { id: taskComplete[1] }, data: { status: 'COMPLETED' } }),
      );
      return { status: 200, body: { ...updated, completedAt: iso(updated.updatedAt) } };
    }
  }

  if (path.startsWith('/inventory/ops/equipment') || path === '/wms/equipment') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) => tx.equipmentCheckout.findMany({ include: { staff: true }, orderBy: { checkedOutAt: 'desc' } }));
      return {
        status: 200,
        body: {
          data: rows.map((e) => ({
            ...e,
            status: e.status === 'CHECKED_OUT' ? 'OUT' : e.status,
            staffName: e.staff?.fullName || 'Warehouse Staff',
            checkedOutAt: iso(e.checkedOutAt),
          })),
          meta: { total: rows.length },
        },
      };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (method === 'POST') {
      const created = await withTenant(tid, async (tx) => {
        const wh = await tx.warehouse.findFirst();
        return tx.equipmentCheckout.create({
          data: { tenantId: tid, warehouseId: wh!.id, equipmentCode: String(body?.equipmentCode || `SCANNER-${Date.now().toString().slice(-3)}`), staffId: ctx.session!.sub, status: 'OUT' },
        });
      });
      return { status: 201, body: created };
    }
    const ret = path.match(/\/equipment\/([^/]+)\/return$/);
    if (method === 'PATCH' && ret) {
      const updated = await withTenant(tid, async (tx) => tx.equipmentCheckout.update({ where: { id: ret[1] }, data: { status: 'RETURNED', returnedAt: new Date() } }));
      return { status: 200, body: updated };
    }
  }

  // --------------------------------------------------------------------------
  // 4. Pack Station Web APIs (/inventory/ops/*, /pack/queue & /wms/packing-sessions*, /wms/stations, /wms/staff, /wms/debug/reset)
  // --------------------------------------------------------------------------
  if ((path === '/inventory/ops/pack-queue' || path === '/pack/queue') && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) =>
      tx.order.findMany({
        where: { deletedAt: null, status: { in: ['PENDING', 'NEW', 'IN_QUEUE', 'PICKING', 'PACKED'] } },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'asc' },
        take: 40,
      }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((o, idx) => {
          const item = o.items[0];
          const estWeightKg = num(item?.product?.weightKg, 1.4) * (item?.quantity || 1);
          return {
            id: o.id,
            packCode: o.trackingCode,
            trackingCode: o.trackingCode,
            recipientName: o.recipientName,
            recipientPhone: o.recipientPhone,
            recipientAddress: o.recipientAddress,
            expectedSku: item?.product?.sku || 'SKU-DN3PL-IC8542',
            expectedBarcode: item?.product?.barcode || '893850300001',
            expectedQuantity: item?.quantity || 1,
            estimatedWeight: estWeightKg,
            expectedWeightGrams: Math.round(estWeightKg * 1000),
            quantity: item?.quantity || 1,
            productName: item?.product?.name || 'Vi mạch điều khiển CNC AMATA-8542',
            boxType: idx % 3 === 0 ? 'LARGE' : idx % 2 === 0 ? 'MEDIUM' : 'SMALL',
            priority: idx === 0 ? 'URGENT' : idx === 1 ? 'HIGH' : 'NORMAL',
            stationId: 'STN-PACK-01',
            scheduledAt: iso(o.estimatedDeliveryDate || o.createdAt),
            status: o.status === 'NEW' ? 'PENDING' : o.status,
            createdAt: iso(o.createdAt),
            updatedAt: iso(o.updatedAt),
            sealedAt: o.status === 'PACKED' ? iso(o.updatedAt) : null,
          };
        }),
        meta: { total: rows.length },
      },
    };
  }

  if (path === '/inventory/ops/pack-log/next' && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const ord = await withTenant(tid, async (tx) =>
      tx.order.findFirst({
        where: { deletedAt: null, status: { in: ['PENDING', 'NEW', 'IN_QUEUE'] } },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    if (!ord) return { status: 200, body: { order: null } };
    const item = ord.items[0];
    const estWeightKg = num(item?.product?.weightKg, 1.4) * (item?.quantity || 1);
    return {
      status: 200,
      body: {
        id: ord.id,
        packCode: ord.trackingCode,
        trackingCode: ord.trackingCode,
        recipientName: ord.recipientName,
        recipientPhone: ord.recipientPhone,
        recipientAddress: ord.recipientAddress,
        expectedSku: item?.product?.sku || 'SKU-DN3PL-IC8542',
        expectedBarcode: item?.product?.barcode || '893850300001',
        expectedQuantity: item?.quantity || 1,
        estimatedWeight: estWeightKg,
        expectedWeightGrams: Math.round(estWeightKg * 1000),
        quantity: item?.quantity || 1,
        productName: item?.product?.name || 'Vi mạch điều khiển CNC AMATA-8542',
        boxType: 'MEDIUM',
        priority: 'HIGH',
        stationId: 'STN-PACK-01',
        scheduledAt: iso(ord.estimatedDeliveryDate || ord.createdAt),
        status: ord.status === 'NEW' ? 'PENDING' : ord.status,
        createdAt: iso(ord.createdAt),
        updatedAt: iso(ord.updatedAt),
        sealedAt: null,
      },
    };
  }

  if (path === '/inventory/ops/pack-log/scan' && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const scanned = String(body?.scannedSku || body?.barcode || '').trim();
    const packCode = String(body?.packCode || '').trim();
    const rawConfidence = body?.confidence !== undefined ? Number(body.confidence) : undefined;
    const confidence =
      rawConfidence !== undefined && Number.isFinite(rawConfidence)
        ? rawConfidence > 1
          ? rawConfidence / 100
          : rawConfidence
        : undefined;

    const result = await withTenant(tid, async (tx) => {
      const [wh, ord, prod] = await Promise.all([
        tx.warehouse.findFirst(),
        tx.order.findFirst({
          where: { OR: [{ trackingCode: packCode }, { id: packCode }], deletedAt: null },
          include: { items: { include: { product: true } } },
        }),
        tx.product.findFirst({
          where: { OR: [{ sku: scanned }, { barcode: scanned }], deletedAt: null },
        }),
      ]);
      const expectedSku = ord?.items[0]?.product?.sku || 'SKU-DN3PL-IC8542';
      const expectedBarcode = ord?.items[0]?.product?.barcode || '';
      const isMatch =
        Boolean(scanned) &&
        (scanned === expectedSku || scanned === expectedBarcode) &&
        (confidence === undefined || confidence >= 0.6);

      await tx.scanLog.create({
        data: {
          tenantId: tid,
          warehouseId: wh!.id,
          barcode: scanned || 'UNKNOWN',
          result: isMatch ? 'MATCHED' : 'MISMATCHED',
          deviceId: 'STN-PACK-01',
          actorId: ctx.session!.sub,
        },
      });
      return {
        matchStatus: isMatch ? 'MATCH' : 'MISMATCH',
        result: isMatch ? 'MATCHED' : 'MISMATCHED',
        order: ord
          ? { id: ord.id, packCode: ord.trackingCode, trackingCode: ord.trackingCode, expectedSku, scannedSku: scanned, status: ord.status }
          : { id: packCode, packCode, trackingCode: packCode, expectedSku, scannedSku: scanned },
        product: prod || ord?.items[0]?.product || null,
      };
    });

    return { status: 200, body: result };
  }

  const sealMatch = path.match(/^\/inventory\/ops\/pack-log\/([^/]+)\/seal$/);
  if (sealMatch && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const code = decodeURIComponent(sealMatch[1]);
    const weightGrams = Number(body?.weightGrams || 1450);
    const dimensionCm = String(body?.dimensionCm || '35x25x20');

    const sealed = await withTenant(tid, async (tx) => {
      const [wh, ord] = await Promise.all([
        tx.warehouse.findFirst(),
        tx.order.findFirst({
          where: { OR: [{ trackingCode: code }, { id: code }], deletedAt: null },
          include: { items: { include: { product: true } } },
        }),
      ]);
      const firstItem = ord?.items?.[0];
      const expectedWeightGrams = Math.round(num(firstItem?.product?.weightKg, 1.4) * (firstItem?.quantity || 1) * 1000);
      const deltaPercent = expectedWeightGrams > 0 ? Math.round(((weightGrams - expectedWeightGrams) / expectedWeightGrams) * 100) : 0;
      const weightOverTolerance = Math.abs(deltaPercent) > 10;
      const weightWarning = weightOverTolerance
        ? `Cảnh báo lệch cân (${deltaPercent > 0 ? '+' : ''}${deltaPercent}% so với chuẩn ${expectedWeightGrams}g).`
        : null;

      if (ord) {
        await tx.order.update({ where: { id: ord.id }, data: { status: 'PACKED' } });
        await tx.orderTrackingEvent.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: tid,
            orderId: ord.id,
            status: 'PACKED',
            location: wh?.name || 'Trạm đóng gói ICD Long Bình',
            description: weightOverTolerance
              ? `Đóng gói & niêm phong (${weightGrams}g, lệch ${deltaPercent > 0 ? '+' : ''}${deltaPercent}% so với chuẩn ${expectedWeightGrams}g)`
              : `Đóng gói & niêm phong thành công (${weightGrams}g, ${dimensionCm})`,
            timestamp: new Date(),
          },
        });
      }
      const log = await tx.packStationLog.create({
        data: {
          tenantId: tid,
          warehouseId: wh!.id,
          orderId: ord?.id || null,
          weightGrams,
          dimensionCm,
          deviceId: String(body?.stationId || 'STN-PACK-01'),
        },
      });
      return {
        ok: true,
        packCode: ord?.trackingCode || code,
        status: 'PACKED',
        weightGrams,
        expectedWeightGrams,
        deltaPercent,
        weightOverTolerance,
        weightWarning,
        dimensionCm,
        log,
      };
    });

    await appendSimulationEvent(null, {
      sandboxKey: ctx.session!.sandboxKey,
      tenantId: tid,
      category: 'PACK_STATION',
      eventType: 'ORDER_PACKED_SEALED',
      summary: `Đóng gói & niêm phong kiện ${sealed.packCode} (${weightGrams}g)`,
    });
    return { status: 200, body: sealed };
  }

  if (path === '/inventory/ops/pack-log/summary' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const sum = await withTenant(tid, async (tx) => {
      const [sessionsToday, packsToday, matched, mismatched] = await Promise.all([
        tx.staffShift.count(),
        tx.packStationLog.count(),
        tx.scanLog.count({ where: { result: 'MATCHED' } }),
        tx.scanLog.count({ where: { result: 'MISMATCHED' } }),
      ]);
      const total = matched + mismatched;
      return {
        sessionsToday,
        packsToday,
        matchRate: total > 0 ? Math.round((matched / total) * 100) : 100,
        correctionCount: mismatched,
        averageSecondsPerPack: 38,
      };
    });
    return { status: 200, body: sum };
  }

  if (path === '/inventory/ops/skus' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) => tx.product.findMany({ where: { deletedAt: null } }));
    return { status: 200, body: { data: rows.map((p) => ({ ...p, weightKg: num(p.weightKg, 1), volumeCbm: num(p.volumeCbm, 0.01) })) } };
  }

  if (path === '/inventory/ops/corrections' || path.startsWith('/inventory/ops/corrections/')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) =>
        tx.scanLog.findMany({ where: { result: 'MISMATCHED' }, include: { actor: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((s) => ({
            id: s.id,
            packCode: s.barcode,
            scannedSku: s.barcode,
            expectedSku: 'SKU-DN3PL-IC8542',
            reason: 'MISMATCHED_BARCODE',
            status: 'RESOLVED',
            staffName: s.actor?.fullName || 'Pack Staff',
            createdAt: iso(s.createdAt),
          })),
        },
      };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (method === 'POST' && path === '/inventory/ops/corrections') {
      const packCode = String(body?.packCode || body?.trackingCode || 'PACK-OVERRIDE');
      const orderSku = String(body?.orderSku || body?.expectedSku || 'SKU-DN3PL-IC8542');
      const scannedSku = String(body?.scannedSku || orderSku);
      const reason = String(body?.reason || 'Manual override at pack station');
      const recId = String(body?.id || `cor-${crypto.randomBytes(6).toString('hex')}`);
      await withTenant(tid, async (tx) => {
        const wh = await tx.warehouse.findFirst();
        if (wh) {
          await tx.scanLog.create({
            data: {
              tenantId: tid,
              warehouseId: wh.id,
              barcode: `${packCode}:${scannedSku}`,
              result: 'OVERRIDDEN',
              deviceId: 'STN-PACK-01',
              actorId: ctx.session!.sub,
            },
          });
        }
        await tx.systemAuditLog.create({
          data: {
            tenantId: tid,
            actorId: ctx.session!.sub,
            actorEmail: ctx.session!.email,
            action: 'PACK_SKU_CORRECTION',
            resourceType: 'pack_order',
            resourceId: packCode,
            ipAddress: ctx.ip,
          },
        });
      });
      return {
        status: 201,
        body: {
          id: recId,
          packCode,
          trackingCode: String(body?.trackingCode || packCode),
          orderSku,
          scannedSku,
          reason,
          status: String(body?.status || 'PENDING'),
          createdAt: new Date().toISOString(),
        },
      };
    }
    return { status: 200, body: { ok: true, id: path.split('/').pop(), status: body?.status || 'RESOLVED' } };
  }

  if (path === '/inventory/ops/pack-log/predict' && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    return {
      status: 200,
      body: {
        predictedSku: 'SKU-DN3PL-IC8542',
        confidence: 0.89,
        model: 'MobileNetV2 (Virtual Demo Camera)',
        simulated: true,
      },
    };
  }

  if (path === '/inventory/ops/pack-log/anomalies' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const logs = await withTenant(tid, async (tx) =>
      tx.scanLog.findMany({ where: { result: 'MISMATCHED' }, orderBy: { createdAt: 'desc' }, take: 15 }),
    );
    return { status: 200, body: logs };
  }

  if (path.startsWith('/wms/packing-sessions')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET' && path === '/wms/packing-sessions') {
      const [shifts, logs, scans] = await withTenant(tid, async (tx) =>
        Promise.all([
          tx.staffShift.findMany({ include: { staff: true, warehouse: true }, orderBy: { shiftStart: 'desc' } }),
          tx.packStationLog.findMany({ orderBy: { createdAt: 'desc' } }),
          tx.scanLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
        ]),
      );
      return {
        status: 200,
        body: {
          data: shifts.map((s) => ({
            id: s.id,
            stationId: 'STN-PACK-01',
            staffId: s.staffId,
            staffName: s.staff?.fullName,
            warehouseName: s.warehouse?.name,
            status: s.status === 'OPEN' ? 'ACTIVE' : 'COMPLETED',
            startedAt: iso(s.shiftStart),
            totalPacked: logs.length,
            totalMatched: scans.filter((x) => x.result === 'MATCHED').length,
            totalMismatched: scans.filter((x) => x.result === 'MISMATCHED').length,
            totalCorrected: scans.filter((x) => x.result === 'MISMATCHED').length,
            elapsedSeconds: 420,
            scanLogs: scans.slice(0, 10).map((x) => ({ ...x, createdAt: iso(x.createdAt) })),
          })),
        },
      };
    }
    if (method === 'GET' && path === '/wms/packing-sessions/active') {
      const [shift, logs, scans] = await withTenant(tid, async (tx) =>
        Promise.all([
          tx.staffShift.findFirst({ where: { status: 'OPEN' }, include: { staff: true }, orderBy: { shiftStart: 'desc' } }),
          tx.packStationLog.count(),
          tx.scanLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
        ]),
      );
      if (!shift) return { status: 200, body: null };
      return {
        status: 200,
        body: {
          id: shift.id,
          sessionCode: `CA-LB-${shift.id.slice(0, 6).toUpperCase()}`,
          stationId: 'STN-PACK-01',
          staffId: shift.staffId,
          staffName: shift.staff?.fullName,
          status: 'ACTIVE',
          totalPacked: logs,
          totalMatched: scans.filter((x) => x.result === 'MATCHED').length,
          totalMismatched: scans.filter((x) => x.result === 'MISMATCHED').length,
          totalCorrected: scans.filter((x) => x.result === 'MISMATCHED').length,
          elapsedSeconds: 420,
          startedAt: iso(shift.shiftStart),
          closedAt: null,
          scanLogs: scans,
        },
      };
    }
    if (method === 'GET' && path === '/wms/packing-sessions/scans') {
      const scans = await withTenant(tid, async (tx) => tx.scanLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }));
      return { status: 200, body: { data: scans.map((s) => ({ ...s, createdAt: iso(s.createdAt) })) } };
    }
    if (method === 'POST' && path === '/wms/packing-sessions') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const created = await withTenant(tid, async (tx) => {
        const wh = await tx.warehouse.findFirst();
        return tx.staffShift.create({
          data: { tenantId: tid, warehouseId: wh!.id, staffId: ctx.session!.sub, shiftStart: new Date(), status: 'OPEN' },
        });
      });
      return {
        status: 201,
        body: {
          id: created.id,
          sessionCode: `CA-LB-${created.id.slice(0, 6).toUpperCase()}`,
          stationId: 'STN-PACK-01',
          staffId: created.staffId,
          status: 'ACTIVE',
          totalPacked: 0,
          totalMatched: 0,
          totalMismatched: 0,
          totalCorrected: 0,
          elapsedSeconds: 0,
          startedAt: iso(created.shiftStart),
          closedAt: null,
          scanLogs: [],
        },
      };
    }
    if (method === 'POST' && /\/seal$/.test(path)) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const id = path.split('/')[3];
      const updated = await withTenant(tid, async (tx) =>
        tx.staffShift.update({ where: { id }, data: { status: 'CLOSED', shiftEnd: new Date() } }),
      );
      return { status: 200, body: { ...updated, status: 'CLOSED' } };
    }
    if (method === 'GET' && path === '/wms/packing-sessions/dashboard') {
      return { status: 200, body: { activeStations: 1, packedToday: 14, avgSeconds: 38 } };
    }
  }

  if (path === '/wms/stations' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    return {
      status: 200,
      body: {
        data: [
          { id: 'STN-PACK-01', code: 'STN-PACK-01', name: 'Bàn Đóng Gói #01 — ICD Long Bình', status: 'AVAILABLE', scaleConnected: true, cameraConnected: true },
          { id: 'STN-PACK-02', code: 'STN-PACK-02', name: 'Bàn Đóng Gói Lạnh #02 — Zone C1', status: 'BUSY', scaleConnected: true, cameraConnected: false },
        ],
      },
    };
  }

  if (path === '/wms/staff' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const staff = await withTenant(tid, async (tx) => tx.tenantUser.findMany({ where: { status: 'ACTIVE' } }));
    return {
      status: 200,
      body: {
        data: staff.map((u, idx) => ({
          id: u.id,
          staffCode: `NV-${String(idx + 1).padStart(3, '0')}`,
          fullName: u.fullName,
          name: u.fullName,
          email: u.email,
          role: 'WAREHOUSE_STAFF',
          phone: u.phone || '0901001000',
          stationId: 'STN-PACK-01',
          status: u.status,
        })),
      },
    };
  }

  const staffByIdMatch = path.match(/^\/wms\/staff\/([^/]+)$/);
  if (staffByIdMatch && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const staffUser = await withTenant(tid, async (tx) =>
      tx.tenantUser.findFirst({ where: { OR: [{ id: staffByIdMatch[1] }, { id: ctx.session!.sub }] } }),
    );
    return {
      status: 200,
      body: {
        id: staffUser?.id || ctx.session!.sub,
        staffCode: 'NV-PACK-01',
        fullName: staffUser?.fullName || ctx.session!.fullName,
        email: staffUser?.email || ctx.session!.email,
        role: 'WAREHOUSE_STAFF',
        phone: staffUser?.phone || '0901001007',
        stationId: 'STN-PACK-01',
      },
    };
  }

  if (path === '/wms/debug/reset' && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    return { status: 200, body: { ok: true, message: 'Pack station queue synchronized with Neon PostgreSQL.' } };
  }

  return null;
}
