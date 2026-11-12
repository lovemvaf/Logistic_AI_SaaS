import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  DEMO_TENANT_IDS,
  authenticateWithPassword,
  buildSetCookieHeader,
  portalCookieName,
} from '../auth';
import { iso, num, withPlatform, withTenant } from '../db';
import { appendSimulationEvent } from '../scenarios';
import type { ApiContext, ApiResult, PortalId } from '../types';

function inferPortalFromAuthPath(path: string, fallback: PortalId): PortalId {
  if (path.startsWith('/admin/auth')) return 'admin';
  if (path.startsWith('/client/auth')) return 'customer';
  if (path.startsWith('/tenant/auth') || path.startsWith('/mobile/auth')) return 'tenant';
  return fallback;
}

export function requireAuth(ctx: ApiContext): ApiResult | null {
  if (!ctx.session) {
    return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' } };
  }
  return null;
}

export function assertWriteAllowed(ctx: ApiContext): ApiResult | null {
  const unauth = requireAuth(ctx);
  if (unauth) return unauth;
  if (ctx.session!.readOnlyGuest) {
    return {
      status: 403,
      body: {
        code: 'READ_ONLY_GUEST',
        message: 'Bạn đang ở chế độ Xem thử Chỉ đọc (Read-Only Guest). Hãy tắt chế độ chỉ đọc hoặc chọn vai trò có quyền ghi.',
      },
    };
  }
  if (ctx.session!.role === 'TENANT_USER') {
    return {
      status: 403,
      body: {
        code: 'FORBIDDEN_ROLE',
        message: 'Tài khoản Analyst / TENANT_USER chỉ có quyền xem dữ liệu, không được phép sửa đổi.',
      },
    };
  }
  return null;
}

export function assertInternalRole(ctx: ApiContext): ApiResult | null {
  const unauth = requireAuth(ctx);
  if (unauth) return unauth;
  if (ctx.session!.role === 'CUSTOMER_CLIENT') {
    return {
      status: 403,
      body: {
        code: 'FORBIDDEN_ROLE',
        message: 'Tài khoản Khách hàng B2B không có quyền truy cập phân hệ vận hành nội bộ.',
      },
    };
  }
  return null;
}

async function listOutboxEvents(): Promise<ApiResult> {
  const rows = await withPlatform(async (tx) =>
    tx.outboxEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  );
  return {
    status: 200,
    body: {
      data: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })),
      meta: { total: rows.length },
    },
  };
}

async function redriveOutboxEvent(ctx: ApiContext, id: string): Promise<ApiResult> {
  const updated = await withPlatform(async (tx) => {
    const existing = await tx.outboxEvent.findUnique({ where: { id } });
    if (!existing) return null;
    const ev = await tx.outboxEvent.update({
      where: { id },
      data: {
        status: 'PENDING',
        processedAt: null,
        availableAt: new Date(),
        lastError: null,
        deadLetterReason: null,
      },
    });
    await tx.systemAuditLog.create({
      data: {
        tenantId: existing.tenantId,
        actorId: ctx.session!.sub,
        actorEmail: ctx.session!.email,
        action: 'OUTBOX_REDRIVE',
        resourceType: 'outbox_event',
        resourceId: id,
        ipAddress: ctx.ip,
      },
    });
    return ev;
  });
  if (!updated) return { status: 404, body: { message: 'Không tìm thấy bản ghi Outbox.' } };
  await appendSimulationEvent(null, {
    sandboxKey: ctx.session!.sandboxKey,
    tenantId: updated.tenantId,
    category: 'OUTBOX',
    eventType: 'DLQ_REDRIVEN',
    summary: `Admin đã redrive sự kiện Outbox ${updated.topic} (${updated.id}) -> PENDING`,
  });
  return { status: 200, body: { ok: true, event: updated } };
}

export async function handleAdminAndIamRoutes(ctx: ApiContext): Promise<ApiResult | null> {
  const { method, path, query, body } = ctx;

  // --------------------------------------------------------------------------
  // 1. Standard Auth Endpoints (/admin/auth/*, /tenant/auth/*, /client/auth/*, /mobile/auth/*)
  // --------------------------------------------------------------------------
  const loginPaths = new Set([
    '/admin/auth/login',
    '/tenant/auth/login',
    '/client/auth/login',
    '/mobile/auth/login',
    '/auth/login',
  ]);
  if (method === 'POST' && loginPaths.has(path)) {
    const email = String(body?.email || '');
    const password = String(body?.password || '');
    const tenantSlug = body?.tenantSlug ? String(body.tenantSlug) : undefined;
    const portal = ctx.headers.get('x-smartlogi-portal')
      ? ctx.portal
      : inferPortalFromAuthPath(path, ctx.portal);

    const res = await authenticateWithPassword({
      email,
      password,
      tenantSlug,
      portal,
      sandboxKey: ctx.sandboxKey,
    });
    if (!res.ok) {
      return { status: res.status, body: { code: res.code, message: res.message } };
    }
    const cookie = buildSetCookieHeader(portalCookieName(portal), res.token, 8 * 3600, ctx.isHttps);
    return {
      status: 200,
      setCookies: [cookie],
      body: {
        token: res.token,
        accessToken: res.token,
        access_token: res.token,
        user: {
          id: res.session.sub,
          email: res.session.email,
          fullName: res.session.fullName,
          role: res.session.role,
          roles: res.session.roles,
          tenantId: res.session.tenantId,
          tenantSlug: res.session.tenantSlug,
          clientId: res.session.clientId,
        },
        tenant: res.tenant,
      },
    };
  }

  if (method === 'POST' && /\/(admin|tenant|client|mobile)\/auth\/(forgot-password|reset-password)/.test(path)) {
    return {
      status: 200,
      body: {
        ok: true,
        simulated: true,
        message: 'Môi trường demo không gửi email SMTP thật. Vui lòng dùng Demo Persona Switcher hoặc mật khẩu trong DEMO_ACCOUNTS.local.md.',
      },
    };
  }

  if (method === 'POST' && /\/(admin|tenant|client|mobile)\/auth\/google/.test(path)) {
    return {
      status: 400,
      body: {
        code: 'GOOGLE_OAUTH_DEMO_DISABLED',
        message: 'Google OAuth tắt trên môi trường demo. Vui lòng dùng Demo Persona One-Click hoặc email/mật khẩu demo.',
      },
    };
  }

  if (path === '/admin/auth/profile') {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (method === 'GET') {
      return {
        status: 200,
        body: {
          id: ctx.session!.sub,
          email: ctx.session!.email,
          fullName: ctx.session!.fullName,
          role: ctx.session!.role,
          tenantSlug: ctx.session!.tenantSlug,
        },
      };
    }
    if (method === 'PATCH') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const fullName = String(body?.fullName || '').trim();
      if (!fullName) return { status: 400, body: { message: 'Họ tên không được để trống.' } };
      await withPlatform(async (tx) => {
        if (ctx.session!.role === 'SUPER_ADMIN') {
          await tx.systemAdmin.updateMany({ where: { id: ctx.session!.sub }, data: { fullName } });
        } else {
          await tx.tenantUser.updateMany({ where: { id: ctx.session!.sub }, data: { fullName } });
        }
      });
      return { status: 200, body: { id: ctx.session!.sub, email: ctx.session!.email, fullName, role: ctx.session!.role } };
    }
  }

  if (method === 'POST' && (path === '/admin/auth/change-password' || path === '/client/auth/change-password')) {
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const oldPassword = String(body?.oldPassword || '');
    const newPassword = String(body?.newPassword || '');
    if (newPassword.length < 8) {
      return { status: 400, body: { message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' } };
    }
    const updated = await withPlatform(async (tx) => {
      if (ctx.session!.role === 'SUPER_ADMIN') {
        const a = await tx.systemAdmin.findUnique({ where: { id: ctx.session!.sub } });
        if (!a || !(await bcrypt.compare(oldPassword, a.passwordHash))) return false;
        await tx.systemAdmin.update({ where: { id: a.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
        return true;
      }
      const u = await tx.tenantUser.findUnique({ where: { id: ctx.session!.sub } });
      if (!u || !(await bcrypt.compare(oldPassword, u.passwordHash))) return false;
      await tx.tenantUser.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
      return true;
    });
    if (!updated) return { status: 400, body: { message: 'Mật khẩu hiện tại không chính xác.' } };
    return { status: 200, body: { ok: true, message: 'Đổi mật khẩu thành công trên Neon PostgreSQL.' } };
  }

  // --------------------------------------------------------------------------
  // 2. Super Admin SaaS Governance (/admin/tenants, /admin/billing, /admin/audit-logs, /admin/dashboard/*)
  // --------------------------------------------------------------------------
  if (path.startsWith('/admin/')) {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const isAdminViewer = ctx.session!.role === 'SUPER_ADMIN' || ctx.session!.role === 'TENANT_ADMIN';
    if (!isAdminViewer) {
      return { status: 403, body: { code: 'FORBIDDEN', message: 'Chỉ Super Admin hoặc Tenant Admin mới có quyền truy cập khu vực này.' } };
    }

    if (method === 'GET' && path === '/admin/tenants') {
      const page = Math.max(1, Number(query.get('page') || 1));
      const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 15)));
      const data = await withPlatform(async (tx) => {
        const where = ctx.session!.role === 'SUPER_ADMIN' ? { deletedAt: null } : { id: ctx.session!.tenantId!, deletedAt: null };
        const [rows, total, userCounts, orderCounts] = await Promise.all([
          tx.tenant.findMany({
            where,
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.tenant.count({ where }),
          tx.tenantUser.groupBy({ by: ['tenantId'], where: { deletedAt: null }, _count: { _all: true } }),
          tx.order.groupBy({ by: ['tenantId'], where: { deletedAt: null }, _count: { _all: true } }),
        ]);
        const usersByTenant = new Map(userCounts.map((u) => [u.tenantId, u._count._all]));
        const ordersByTenant = new Map(orderCounts.map((o) => [o.tenantId, o._count._all]));
        return {
          data: rows.map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            status: t.status,
            plan: t.plan?.name || t.plan?.code || 'Enterprise',
            planCode: t.plan?.code,
            maxUsers: t.maxUsers,
            maxWarehouses: t.maxWarehouses,
            maxVehicles: t.maxVehicles,
            usersCount: usersByTenant.get(t.id) || 0,
            ordersMonthly: ordersByTenant.get(t.id) || 0,
            createdAt: iso(t.createdAt),
          })),
          meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
      });
      return { status: 200, body: data };
    }

    if (method === 'POST' && path === '/admin/tenants') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      if (ctx.session!.role !== 'SUPER_ADMIN') {
        return { status: 403, body: { message: 'Chỉ Super Admin được tạo doanh nghiệp mới.' } };
      }
      const name = String(body?.name || '').trim();
      const rawSlug = String(body?.slug || name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
      const slug = rawSlug || `tenant-${Date.now().toString().slice(-5)}`;
      const planCode = String(body?.planCode || body?.plan || 'ENTERPRISE').toUpperCase();
      if (!name) return { status: 400, body: { message: 'Tên doanh nghiệp là bắt buộc.' } };

      const created = await withPlatform(async (tx) => {
        const dup = await tx.tenant.findUnique({ where: { slug } });
        if (dup) return null;
        const plan =
          (await tx.subscriptionPlan.findUnique({ where: { code: planCode } })) ||
          (await tx.subscriptionPlan.findFirst());
        const t = await tx.tenant.create({
          data: {
            name,
            slug,
            dbSchemaName: 'public',
            status: 'ACTIVE',
            planId: plan!.id,
            maxUsers: Number(body?.maxUsers || plan?.maxUsers || 50),
            maxWarehouses: Number(body?.maxWarehouses || plan?.maxWarehouses || 10),
            maxVehicles: Number(body?.maxVehicles || plan?.maxVehicles || 50),
          },
          include: { plan: true },
        });
        await tx.systemAuditLog.create({
          data: {
            tenantId: t.id,
            actorId: ctx.session!.sub,
            actorEmail: ctx.session!.email,
            action: 'TENANT_CREATE',
            resourceType: 'tenant',
            resourceId: t.id,
            ipAddress: ctx.ip,
          },
        });
        return t;
      });
      if (!created) return { status: 409, body: { message: `Slug "${slug}" đã tồn tại.` } };
      return { status: 201, body: { ...created, plan: created.plan?.name || 'Enterprise', createdAt: iso(created.createdAt) } };
    }

    const tenantIdMatch = path.match(/^\/admin\/tenants\/([^/]+)$/);
    if (tenantIdMatch) {
      const id = tenantIdMatch[1];
      if (ctx.session!.role !== 'SUPER_ADMIN' && ctx.session!.tenantId !== id) {
        return { status: 403, body: { message: 'Không có quyền truy cập tenant khác.' } };
      }
      if (method === 'GET') {
        const tenant = await withPlatform(async (tx) => {
          const [row, usersCount, ordersMonthly] = await Promise.all([
            tx.tenant.findUnique({ where: { id }, include: { plan: true } }),
            tx.tenantUser.count({ where: { tenantId: id, deletedAt: null } }),
            tx.order.count({ where: { tenantId: id, deletedAt: null } }),
          ]);
          return row ? { ...row, usersCount, ordersMonthly } : null;
        });
        if (!tenant) return { status: 404, body: { message: 'Không tìm thấy doanh nghiệp.' } };
        return {
          status: 200,
          body: {
            ...tenant,
            plan: tenant.plan?.name || 'Enterprise',
            createdAt: iso(tenant.createdAt),
          },
        };
      }
      if (method === 'PATCH') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        if (ctx.session!.role !== 'SUPER_ADMIN') return { status: 403, body: { message: 'Chỉ Super Admin được cập nhật trạng thái tenant.' } };
        const patch: any = {};
        if (body?.status) patch.status = String(body.status).toUpperCase();
        if (body?.name) patch.name = String(body.name);
        if (body?.maxUsers !== undefined) patch.maxUsers = Number(body.maxUsers);
        if (body?.maxWarehouses !== undefined) patch.maxWarehouses = Number(body.maxWarehouses);
        const updated = await withPlatform(async (tx) => {
          const u = await tx.tenant.update({ where: { id }, data: patch, include: { plan: true } });
          await tx.systemAuditLog.create({
            data: {
              tenantId: u.id,
              actorId: ctx.session!.sub,
              actorEmail: ctx.session!.email,
              action: 'TENANT_UPDATE',
              resourceType: 'tenant',
              resourceId: u.id,
              newValues: JSON.stringify(patch),
              ipAddress: ctx.ip,
            },
          });
          return u;
        });
        return { status: 200, body: { ...updated, plan: updated.plan?.name || 'Enterprise', createdAt: iso(updated.createdAt) } };
      }
      if (method === 'DELETE') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        if (ctx.session!.role !== 'SUPER_ADMIN') return { status: 403, body: { message: 'Chỉ Super Admin được xóa tenant.' } };
        await withPlatform(async (tx) => {
          await tx.tenant.update({ where: { id }, data: { status: 'SUSPENDED', deletedAt: new Date() } });
        });
        return { status: 200, body: { ok: true } };
      }
    }

    if (method === 'GET' && path === '/admin/billing') {
      const page = Math.max(1, Number(query.get('page') || 1));
      const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 15)));
      const res = await withPlatform(async (tx) => {
        const where: any = ctx.session!.role === 'SUPER_ADMIN' ? {} : { tenantId: ctx.session!.tenantId! };
        const [rows, total, tenants] = await Promise.all([
          tx.invoice.findMany({
            where,
            include: { tenant: { include: { plan: true } } },
            orderBy: { issuedAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.invoice.count({ where }),
          tx.tenant.findMany({ where: { status: 'ACTIVE', deletedAt: null }, include: { plan: true } }),
        ]);
        const mrr = tenants.reduce((acc, t) => acc + num(t.plan?.priceMonthly, 0), 0);
        return {
          data: rows.map((inv) => ({
            id: inv.invoiceNumber || inv.id,
            invoiceId: inv.id,
            tenant: inv.tenant?.name || 'SmartLogi Tenant',
            plan: inv.tenant?.plan?.name || 'Enterprise',
            amount: num(inv.totalAmount, 0),
            issuedAt: iso(inv.issuedAt),
            status: inv.status === 'PENDING' ? 'DUE' : inv.status,
          })),
          meta: { total, page, limit, mrr, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
      });
      return { status: 200, body: res };
    }

    if (method === 'GET' && path === '/admin/audit-logs') {
      const page = Math.max(1, Number(query.get('page') || 1));
      const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 15)));
      const actionFilter = query.get('action')?.trim();
      const res = await withPlatform(async (tx) => {
        const where: any = {};
        if (ctx.session!.role !== 'SUPER_ADMIN') where.tenantId = ctx.session!.tenantId;
        if (actionFilter) where.action = { contains: actionFilter, mode: 'insensitive' };
        const [rows, total] = await Promise.all([
          tx.systemAuditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.systemAuditLog.count({ where }),
        ]);
        return {
          data: rows.map((r) => ({
            id: r.id,
            actorEmail: r.actorEmail,
            action: r.action,
            resourceType: r.resourceType,
            resourceId: r.resourceId || '-',
            ipAddress: r.ipAddress,
            createdAt: iso(r.createdAt),
            result: r.action.includes('FAIL') || r.action.includes('DENY') ? 'FAILED' : 'SUCCESS',
          })),
          meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
      });
      return { status: 200, body: res };
    }

    if (method === 'GET' && path === '/admin/dashboard/stats') {
      const res = await withPlatform(async (tx) => {
        const [tenants, totalUsers] = await Promise.all([
          tx.tenant.findMany({ where: { deletedAt: null }, include: { plan: true } }),
          tx.tenantUser.count(),
        ]);
        const activeMrr = tenants
          .filter((t) => t.status === 'ACTIVE')
          .reduce((s, t) => s + num(t.plan?.priceMonthly, 0), 0);
        const now = new Date();
        const rollingMonths = Array.from({ length: 6 }, (_, idx) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yy = String(d.getFullYear()).slice(-2);
          return `${mm}/${yy}`;
        });
        const revWeights = [0.55, 0.68, 0.74, 0.85, 0.94, 1.0];
        const tenantCounts = [1, 2, 2, Math.max(2, tenants.length - 1), Math.max(2, tenants.length - 1), tenants.length];
        return {
          totalTenants: tenants.length,
          totalUsers,
          totalMrr: activeMrr,
          revenueData: rollingMonths.map((month, idx) => ({
            month,
            amount: Math.round(activeMrr * revWeights[idx]),
          })),
          growthData: rollingMonths.map((month, idx) => ({
            month,
            tenants: tenantCounts[idx],
          })),
        };
      });
      return { status: 200, body: res };
    }

    if (method === 'GET' && path === '/admin/dashboard/logistics') {
      const res = await withPlatform(async (tx) => {
        const where = ctx.session!.role === 'SUPER_ADMIN' ? {} : { tenantId: ctx.session!.tenantId! };
        const [totalOrders, inTransit, delivered, vehicles, drivers, lowStock] = await Promise.all([
          tx.order.count({ where: { ...where, deletedAt: null } }),
          tx.order.count({ where: { ...where, status: 'IN_TRANSIT', deletedAt: null } }),
          tx.order.count({ where: { ...where, status: 'DELIVERED', deletedAt: null } }),
          tx.vehicle.count({ where: { ...where, status: 'ACTIVE', deletedAt: null } }),
          tx.driver.count({ where: { ...where, deletedAt: null } }),
          tx.inventory.count({ where: { ...where, quantityOnHand: { lte: 5 } } }),
        ]);
        const activeShipments = await tx.freightShipment.count({ where });
        const delayedShipments = await tx.customsDeclaration.count({ where: { ...where, status: 'HOLD' } });
        return {
          totalOrders,
          activeShipments: activeShipments + inTransit,
          inTransit,
          deliveredToday: delivered,
          delayedShipments,
          activeVehicles: vehicles,
          activeDrivers: drivers,
          inventoryAlerts: lowStock,
          avgOptimization: 'Heuristic Đồng Nai v1 (Simulated)',
          onTimeDelivery: totalOrders > 0 ? `${Math.round(((delivered + inTransit) / totalOrders) * 100)}%` : '0%',
          predictedShipments: [
            { day: 'T2', predicted: 38, actual: 36 },
            { day: 'T3', predicted: 42, actual: 40 },
            { day: 'T4', predicted: 46, actual: 44 },
            { day: 'T5', predicted: 49, actual: 47 },
            { day: 'T6', predicted: 52, actual: 50 },
            { day: 'T7', predicted: 34, actual: 32 },
            { day: 'CN', predicted: 26, actual: 24 },
          ],
        };
      });
      return { status: 200, body: res };
    }

    if (method === 'GET' && path === '/admin/dashboard/outbox') {
      return listOutboxEvents();
    }

    const adminRedriveMatch = path.match(/^\/admin\/dashboard\/outbox\/([^/]+)\/redrive$/);
    if (method === 'POST' && adminRedriveMatch) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      return redriveOutboxEvent(ctx, adminRedriveMatch[1]);
    }
  }

  if (method === 'GET' && path === '/webhooks/outbox') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    return listOutboxEvents();
  }

  const webhookRedriveMatch = path.match(/^\/webhooks\/outbox\/([^/]+)\/redrive$/);
  if (method === 'POST' && webhookRedriveMatch) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    return redriveOutboxEvent(ctx, webhookRedriveMatch[1]);
  }

  // --------------------------------------------------------------------------
  // 3. Tenant Dashboard Summary, Users, Roles, API Keys, Webhooks, Settings, Reports, AI
  // --------------------------------------------------------------------------
  if (method === 'GET' && path === '/tenant/dashboard/stats') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const stats = await withTenant(tid, async (tx) => {
      const [deliveries, vehicles, delayed] = await Promise.all([
        tx.delivery.count(),
        tx.vehicle.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        tx.trip.count({ where: { status: 'DELAYED' } }),
      ]);
      return { totalDeliveries: deliveries, activeVehicles: vehicles, delayedTrips: delayed, avgOptimization: 'Heuristic Đồng Nai v1' };
    });
    return { status: 200, body: stats };
  }

  if (method === 'GET' && path === '/dashboard/summary') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const summary = await withTenant(tid, async (tx) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [
        orders,
        ordersTodayCount,
        delivered,
        inTransit,
        pendingOrNew,
        returned,
        trips,
        activeTrips,
        vehiclesCount,
        lowStock,
        outOfStockSkus,
        activeWaves,
        sosOpen,
        customsHold,
        codAgg,
        invAgg,
        expAgg,
        recentOrders,
      ] = await Promise.all([
        tx.order.count({ where: { deletedAt: null } }),
        tx.order.count({ where: { deletedAt: null, createdAt: { gte: startOfDay } } }),
        tx.order.count({ where: { status: 'DELIVERED', deletedAt: null } }),
        tx.order.count({ where: { status: 'IN_TRANSIT', deletedAt: null } }),
        tx.order.count({ where: { status: { in: ['NEW', 'PENDING', 'IN_QUEUE'] }, deletedAt: null } }),
        tx.order.count({ where: { status: 'RETURNED', deletedAt: null } }),
        tx.trip.count(),
        tx.trip.count({ where: { status: { in: ['IN_TRANSIT', 'IN_PROGRESS', 'DISPATCHED'] } } }),
        tx.vehicle.count({ where: { deletedAt: null } }),
        tx.inventory.count({ where: { quantityOnHand: { lte: 10 } } }),
        tx.inventory.count({ where: { quantityOnHand: { lte: 0 } } }),
        tx.wavePicking.count({ where: { status: { in: ['IN_PROGRESS', 'PENDING'] } } }),
        tx.sosAlert.count({ where: { status: 'ACTIVE' } }),
        tx.customsDeclaration.count({ where: { status: { in: ['HOLD', 'NEEDS_CUSTOMS_REVIEW'] } } }),
        tx.order.aggregate({ _sum: { codAmount: true }, where: { deletedAt: null } }),
        tx.invoice.aggregate({ _sum: { totalAmount: true } }),
        tx.driverExpense.aggregate({ _sum: { amount: true } }),
        tx.order.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 8 }),
      ]);
      const revenueMonth = num(invAgg._sum.totalAmount, 27700000);
      const costMonth = Math.max(num(expAgg._sum.amount, 0), Math.round(revenueMonth * 0.42));
      const fleetUtil = vehiclesCount > 0 ? Math.min(96, Math.max(65, Math.round((activeTrips / vehiclesCount) * 100))) : 82;
      return {
        totalOrders: orders,
        ordersCount: orders,
        ordersToday: Math.max(ordersTodayCount, Math.min(orders, 18)),
        openOrders: pendingOrNew + inTransit,
        deliveredOrders: delivered,
        deliveredToday: delivered,
        inTransitOrders: inTransit,
        lateOrders: returned,
        returnedOrders: returned,
        returnsOpen: returned,
        totalTrips: trips,
        activeTrips,
        inventoryAlerts: lowStock,
        outOfStockSkus,
        inventoryAccuracy: 98.4,
        activeWaves,
        unassignedOrders: pendingOrNew,
        totalCodValue: num(codAgg._sum.codAmount, 0),
        codPending: num(codAgg._sum.codAmount, 0),
        fleetUtilization: fleetUtil,
        sosOpen,
        revenueMonth,
        costMonth,
        onTimeRate: orders > 0 ? Math.round(((delivered + inTransit + pendingOrNew) / Math.max(1, orders)) * 100) : 95,
        urgentCounts: {
          lowStock,
          outOfStock: outOfStockSkus,
          unassignedOrders: pendingOrNew,
          lateOrders: returned,
          customsHold,
          sosOpen,
        },
        recentOrders: recentOrders.map((o) => ({
          ...o,
          codAmount: num(o.codAmount),
          shippingFee: num(o.shippingFee),
          createdAt: iso(o.createdAt),
        })),
      };
    });
    return { status: 200, body: summary };
  }

  if (method === 'GET' && path === '/tenant/audit-logs') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const rows = await withTenant(tid, async (tx) =>
      tx.systemAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    );
    return { status: 200, body: { data: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })), meta: { total: rows.length } } };
  }

  if (path === '/tenant/users' || path === '/users') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) =>
        tx.tenantUser.findMany({ include: { roles: { include: { role: true } } }, orderBy: { createdAt: 'asc' } }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((u) => ({
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            name: u.fullName,
            phone: u.phone,
            status: u.status,
            role: u.roles[0]?.role?.name || 'TENANT_USER',
            createdAt: iso(u.createdAt),
          })),
          meta: { total: rows.length },
        },
      };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const email = String(body?.email || '').trim().toLowerCase();
      const fullName = String(body?.fullName || body?.name || email.split('@')[0] || 'User');
      if (!email) return { status: 400, body: { message: 'Email là bắt buộc.' } };
      const hash = await bcrypt.hash(String(body?.password || 'SmartLogiDemo#2026'), 10);
      const created = await withTenant(tid, async (tx) => {
        const u = await tx.tenantUser.create({
          data: { tenantId: tid, email, fullName, phone: body?.phone || null, passwordHash: hash, status: 'ACTIVE' },
        });
        const roleName = String(body?.role || 'TENANT_USER').toUpperCase();
        const role = await tx.customRole.findFirst({ where: { name: roleName } });
        if (role) await tx.userRole.create({ data: { tenantId: tid, userId: u.id, roleId: role.id } });
        return { ...u, role: role?.name || roleName };
      });
      return { status: 201, body: created };
    }
  }

  if (method === 'POST' && path === '/users/invite') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const email = String(body?.email || '').trim().toLowerCase();
    const fullName = String(body?.fullName || email.split('@')[0] || 'Invited Member');
    if (!email) return { status: 400, body: { message: 'Email mời không hợp lệ.' } };
    const hash = await bcrypt.hash(crypto.randomBytes(12).toString('hex'), 10);
    const invited = await withTenant(tid, async (tx) => {
      const exists = await tx.tenantUser.findFirst({ where: { email } });
      if (exists) return exists;
      return tx.tenantUser.create({ data: { tenantId: tid, email, fullName, passwordHash: hash, status: 'INVITED' } });
    });
    return { status: 201, body: invited };
  }

  const userStatusMatch = path.match(/^\/users\/([^/]+)\/status$/);
  if (method === 'PATCH' && userStatusMatch) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const updated = await withTenant(tid, async (tx) =>
      tx.tenantUser.update({ where: { id: userStatusMatch[1] }, data: { status: String(body?.status || 'ACTIVE') } }),
    );
    return { status: 200, body: updated };
  }

  if (path === '/roles') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    if (method === 'GET') {
      const roles = await withTenant(tid, async (tx) =>
        tx.customRole.findMany({ where: { deletedAt: null }, include: { permissions: true, _count: { select: { users: true } } } }),
      );
      return {
        status: 200,
        body: {
          data: roles.map((r) => ({
            id: r.id,
            name: r.name,
            isSystemDefault: r.isSystemDefault,
            permissions: r.permissions.map((p) => `${p.resource}:${p.action}`),
            userCount: r._count.users,
          })),
          meta: { total: roles.length },
        },
      };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const role = await withTenant(tid, async (tx) =>
        tx.customRole.create({ data: { tenantId: tid, name: String(body?.name || 'CUSTOM_ROLE').toUpperCase(), isSystemDefault: false } }),
      );
      return { status: 201, body: role };
    }
  }

  if (path === '/branches') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) => tx.branch.findMany({ where: { deletedAt: null } }));
      return { status: 200, body: { data: rows.map((b) => ({ ...b, lat: num(b.lat), lng: num(b.lng), capacityCbm: num(b.capacityCbm) })), meta: { total: rows.length } } };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const row = await withTenant(tid, async (tx) =>
        tx.branch.create({
          data: {
            tenantId: tid,
            type: String(body?.type || 'HUB'),
            code: String(body?.code || `BR-${Date.now().toString().slice(-4)}`),
            name: String(body?.name || 'Chi nhánh Đồng Nai mới'),
            address: String(body?.address || 'Thành phố Đồng Nai'),
            status: 'ACTIVE',
          },
        }),
      );
      return { status: 201, body: row };
    }
  }

  if (path === '/settings') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) => tx.tenantSetting.findMany());
      const map: Record<string, string> = {};
      rows.forEach((r) => { map[r.key] = r.value; });
      return { status: 200, body: { settings: map, items: rows } };
    }
    if (method === 'PATCH') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const entries = Object.entries(body || {}).filter(([, v]) => typeof v !== 'object');
      await withTenant(tid, async (tx) => {
        for (const [k, v] of entries) {
          await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId: tid, key: k } },
            update: { value: String(v) },
            create: { tenantId: tid, key: k, value: String(v) },
          });
        }
      });
      return { status: 200, body: { ok: true, updated: entries.length } };
    }
  }

  if (path === '/api-keys') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) => tx.tenantApiKey.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }));
      return {
        status: 200,
        body: {
          data: rows.map((k) => ({ id: k.id, name: k.name || 'API Key', scopes: k.scopes, status: k.revokedAt ? 'REVOKED' : 'ACTIVE', createdAt: iso(k.createdAt) })),
          meta: { total: rows.length },
        },
      };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const plain = `slg_live_demo_${crypto.randomBytes(10).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(plain).digest('hex');
      const created = await withTenant(tid, async (tx) =>
        tx.tenantApiKey.create({
          data: { tenantId: tid, keyHash, name: String(body?.name || 'Integration Key'), scopes: Array.isArray(body?.scopes) ? body.scopes : ['orders:read'] },
        }),
      );
      return { status: 201, body: { id: created.id, name: created.name, secretPreview: `${plain.slice(0, 18)}...`, tokenOnce: plain, status: 'ACTIVE' } };
    }
  }

  const revokeKeyMatch = path.match(/^\/api-keys\/([^/]+)\/revoke$/);
  if (method === 'POST' && revokeKeyMatch) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const res = await withTenant(tid, async (tx) =>
      tx.tenantApiKey.update({ where: { id: revokeKeyMatch[1] }, data: { revokedAt: new Date() } }),
    );
    return { status: 200, body: { ...res, status: 'REVOKED' } };
  }

  if (path === '/webhooks') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) => tx.clientWebhook.findMany({ orderBy: { createdAt: 'desc' } }));
      return { status: 200, body: { data: rows.map((w) => ({ ...w, events: w.events, status: w.isActive ? 'ACTIVE' : 'PAUSED' })), meta: { total: rows.length } } };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const url = String(body?.url || '').trim();
      if (!url.startsWith('https://')) {
        return { status: 400, body: { message: 'Webhook URL bắt buộc sử dụng HTTPS hợp lệ (SSRF protection).' } };
      }
      const client = await withTenant(tid, async (tx) => tx.client.findFirst());
      if (!client) return { status: 400, body: { message: 'Không tìm thấy Client gắn webhook.' } };
      const created = await withTenant(tid, async (tx) =>
        tx.clientWebhook.create({
          data: {
            tenantId: tid,
            clientId: client.id,
            url,
            events: JSON.stringify(body?.events || ['order.delivered']),
            secretToken: `whsec_demo_${crypto.randomBytes(6).toString('hex')}`,
            isActive: true,
          },
        }),
      );
      return { status: 201, body: created };
    }
  }

  if (path.startsWith('/notifications')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    if (method === 'GET' && (path === '/notifications' || path === '/notifications/events')) {
      const rows = await withTenant(tid, async (tx) => tx.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }));
      return { status: 200, body: { data: rows.map((n) => ({ ...n, createdAt: iso(n.createdAt) })), meta: { total: rows.length } } };
    }
    if (method === 'POST' && path === '/notifications/read-all') {
      await withTenant(tid, async (tx) => tx.notification.updateMany({ where: { isRead: false }, data: { isRead: true, readAt: new Date() } }));
      return { status: 200, body: { ok: true } };
    }
    if (method === 'POST' && path === '/notifications/send') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const created = await withTenant(tid, async (tx) =>
        tx.notification.create({
          data: {
            tenantId: tid,
            userId: ctx.session!.sub,
            type: String(body?.type || 'OPERATIONS_ALERT'),
            title: String(body?.title || 'Thông báo vận hành'),
            body: String(body?.body || 'Nội dung thông báo từ trung tâm điều phối.'),
            channel: 'IN_APP',
          },
        }),
      );
      return { status: 201, body: created };
    }
  }

  if (path.startsWith('/reports/')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const period = query.get('period') || new Date().toISOString().slice(0, 7);

    if (path === '/reports/on-time') {
      const data = await withTenant(tid, async (tx) => {
        const [totalOrders, deliveredOrders, returnedOrders, inTransitOrders] = await Promise.all([
          tx.order.count({ where: { deletedAt: null } }),
          tx.order.count({ where: { status: 'DELIVERED', deletedAt: null } }),
          tx.order.count({ where: { status: 'RETURNED', deletedAt: null } }),
          tx.order.count({ where: { status: 'IN_TRANSIT', deletedAt: null } }),
        ]);
        const baseTotal = Math.max(24, deliveredOrders + returnedOrders + inTransitOrders);
        const groups = [
          {
            id: 'cor-central',
            name: 'Hành lang Trung tâm (Long Bình - Amata - Trảng Bom)',
            onTime: Math.max(10, Math.round(baseTotal * 0.44)),
            late: Math.max(1, Math.floor(returnedOrders * 0.3)),
          },
          {
            id: 'cor-south',
            name: 'Hành lang Nam (QL51 - Long Thành - Nhơn Trạch - Phước An)',
            onTime: Math.max(8, Math.round(baseTotal * 0.32)),
            late: Math.max(1, Math.ceil(returnedOrders * 0.4)),
          },
          {
            id: 'cor-north',
            name: 'Hành lang Bắc (ĐT741 - Đồng Xoài - Chơn Thành)',
            onTime: Math.max(5, Math.round(baseTotal * 0.16)),
            late: Math.max(0, Math.floor(returnedOrders * 0.3)),
          },
        ].map((g) => {
          const total = g.onTime + g.late;
          return {
            ...g,
            total,
            rate: total > 0 ? Math.round((g.onTime / total) * 100) : 95,
          };
        });
        return { period, groupBy: query.get('groupBy') || 'corridor', groups, totalOrders };
      });
      return { status: 200, body: data };
    }

    if (path === '/reports/costs') {
      const data = await withTenant(tid, async (tx) => {
        const [expenses, surchargesAgg, tripCount] = await Promise.all([
          tx.driverExpense.findMany({ orderBy: { createdAt: 'desc' } }),
          tx.freightLedgerEntry.aggregate({ _sum: { amount: true } }),
          tx.trip.count(),
        ]);
        const fuelExp = expenses.filter((e) => e.category === 'FUEL').reduce((s, e) => s + num(e.amount), 0);
        const tollExp = expenses.filter((e) => e.category.includes('TOLL')).reduce((s, e) => s + num(e.amount), 0);
        const maintExp = expenses.filter((e) => e.category === 'MAINTENANCE').reduce((s, e) => s + num(e.amount), 0);
        const byCategory = [
          { category: 'Nhiên liệu vận tải & đầu kéo', amount: Math.max(fuelExp, 4_250_000 + tripCount * 480_000) },
          { category: 'Phí cầu đường BOT QL51 / Cao tốc LT-DG', amount: Math.max(tollExp, 1_150_000) },
          { category: 'Nhân công kho & bàn đóng gói', amount: 3_600_000 },
          { category: 'Lưu bãi / nâng hạ cảng (DEM/DET)', amount: Math.min(num(surchargesAgg._sum.amount, 2_850_000), 2_850_000) },
          { category: 'Bảo dưỡng định kỳ đội xe', amount: Math.max(maintExp, 1_450_000) },
        ];
        const total = byCategory.reduce((s, c) => s + c.amount, 0);
        return { period, total, byCategory };
      });
      return { status: 200, body: data };
    }

    if (path === '/reports/fleet') {
      const data = await withTenant(tid, async (tx) => {
        const [vehicles, trips] = await Promise.all([
          tx.vehicle.findMany({ where: { deletedAt: null }, orderBy: { plateNumber: 'asc' } }),
          tx.trip.findMany({ include: { deliveries: true } }),
        ]);
        const byVehicle = vehicles.map((v, idx) => {
          const vTrips = trips.filter((t) => t.vehicleId === v.id);
          const tripCount = Math.max(1, vTrips.length);
          const dist = vTrips.reduce((s, t) => s + num(t.actualDistanceKm ?? t.estimatedDistanceKm, 42), 0) || 44.5;
          const fuelCost = Math.round(dist * 7500);
          const maintenanceCost = 650_000 + idx * 120_000;
          const revenue = tripCount * 4_850_000;
          const utilizableDays = Math.max(22, 26 - idx);
          const downtimeDays = idx + 1;
          return {
            id: v.id,
            plate: v.plateNumber,
            type: v.type,
            trips: vTrips.length,
            distanceKm: Math.round(dist * 10) / 10,
            fuelCost,
            maintenanceCost,
            revenue,
            utilizableDays,
            downtimeDays,
            rate: `${Math.round((utilizableDays / (utilizableDays + downtimeDays)) * 100)}%`,
          };
        });
        return { period, byVehicle, utilizationRate: 86, utilization: 86, onTimeRate: 94 };
      });
      return { status: 200, body: data };
    }

    const data = await withTenant(tid, async (tx) => {
      const [orders, delivered, returned, trips, vehicles, invoices, expenses, codAgg] = await Promise.all([
        tx.order.count({ where: { deletedAt: null } }),
        tx.order.count({ where: { status: 'DELIVERED', deletedAt: null } }),
        tx.order.count({ where: { status: 'RETURNED', deletedAt: null } }),
        tx.trip.count(),
        tx.vehicle.count({ where: { deletedAt: null } }),
        tx.invoice.aggregate({ _sum: { totalAmount: true } }),
        tx.driverExpense.aggregate({ _sum: { amount: true } }),
        tx.codRemittance.aggregate({ _sum: { amountRemitted: true }, where: { status: 'PENDING' } }),
      ]);
      const rev = num(invoices._sum.totalAmount, 27700000);
      const cost = Math.max(num(expenses._sum.amount, 0), Math.round(rev * 0.42));
      const onTimeRate = orders > 0 ? Math.min(98, Math.max(89, Math.round(((orders - returned) / Math.max(1, orders)) * 100))) : 94;
      return {
        period,
        orders: {
          total: orders,
          delivered,
          late: returned,
          onTime: Math.max(0, orders - returned),
        },
        revenue: rev,
        cost,
        profit: rev - cost,
        codPending: num(codAgg._sum.amountRemitted, 4800000),
        fleetUtilization: vehicles > 0 ? Math.min(96, Math.round((Math.max(1, trips) / Math.max(1, vehicles)) * 42)) : 84,
        onTimeRate,
        totalOrders: orders,
        deliveredOrders: delivered,
        returnedOrders: returned,
        totalTrips: trips,
        totalVehicles: vehicles,
        totalRevenue: rev,
        avgCostPerOrder: orders > 0 ? Math.round(cost / orders) : 32000,
        utilizationRate: 84.5,
      };
    });
    return { status: 200, body: data };
  }

  // --------------------------------------------------------------------------
  // 4. AI Governance & Honest 501 Training Boundary (/ai/v1/*)
  // --------------------------------------------------------------------------
  if (path === '/ai/v1/models' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const rows = await withPlatform(async (tx) =>
      tx.aiModel.findMany({
        where: { deletedAt: null, ...(ctx.session!.tenantId ? { tenantId: ctx.session!.tenantId } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return {
      status: 200,
      body: rows.map((m) => ({
        id: m.id,
        name: m.name,
        version: m.version,
        type: m.type,
        accuracy: m.accuracy !== null ? num(m.accuracy) : null,
        is_current: m.isCurrent,
        trained_at: iso(m.trainedAt),
        model_path: m.modelPath,
      })),
    };
  }

  const aiActivate = path.match(/^\/ai\/v1\/models\/([^/]+)\/activate$/);
  if (method === 'PATCH' && aiActivate) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const updated = await withPlatform(async (tx) => {
      const m = await tx.aiModel.findUnique({ where: { id: aiActivate[1] } });
      if (!m) return null;
      await tx.aiModel.updateMany({ where: { tenantId: m.tenantId, type: m.type }, data: { isCurrent: false } });
      return tx.aiModel.update({ where: { id: m.id }, data: { isCurrent: true } });
    });
    if (!updated) return { status: 404, body: { message: 'Không tìm thấy AI model.' } };
    return { status: 200, body: updated };
  }

  const aiDelete = path.match(/^\/ai\/v1\/models\/([^/]+)$/);
  if (method === 'DELETE' && aiDelete) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    await withPlatform(async (tx) => tx.aiModel.update({ where: { id: aiDelete[1] }, data: { deletedAt: new Date() } }));
    return { status: 200, body: { ok: true } };
  }

  if (method === 'GET' && path === '/ai/v1/training-dataset') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const rows = await withPlatform(async (tx) =>
      tx.aiFeedback.findMany({
        where: { humanCorrected: { not: '' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((r) => ({ ...r, confidence: num(r.confidence), createdAt: iso(r.createdAt) })),
        count: rows.length,
        meta: { total: rows.length },
      },
    };
  }

  // IMPORTANT CONTRACT: real training endpoint MUST ALWAYS stay honest 501 TRAINING_NOT_IMPLEMENTED!
  if (method === 'POST' && path.startsWith('/ai/v1/train')) {
    return {
      status: 501,
      body: {
        error: 'TRAINING_NOT_IMPLEMENTED',
        code: 'TRAINING_NOT_IMPLEMENTED',
        message: 'Huấn luyện mô hình ML trực tuyến chưa được bật. Hãy dùng tab "Simulation: Retraining Workflow" để xem mô phỏng, hoặc chạy pipeline huấn luyện ngoại tuyến trên dữ liệu human_corrected.',
      },
    };
  }

  if (method === 'POST' && path === '/ai/v1/analyze') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const [delayedCount, holdCustoms, dlqCount] = await withPlatform(async (tx) =>
      Promise.all([
        tx.customsDeclaration.count({ where: { status: 'HOLD' } }),
        tx.customsDeclaration.count({ where: { status: 'NEEDS_CUSTOMS_REVIEW' } }),
        tx.outboxEvent.count({ where: { status: 'DEAD_LETTER' } }),
      ]),
    );
    return {
      status: 200,
      body: {
        ok: true,
        method: 'deterministic_heuristic_fallback',
        fallback_used: true,
        evaluation_status: 'unmeasured',
        summary: `Phân tích heuristic thời gian thực trên Neon PostgreSQL: đang có ${delayedCount} tờ khai luồng Đỏ (HOLD), ${holdCustoms} tờ khai chờ duyệt mã HS và ${dlqCount} webhook Dead-Letter cần xử lý.`,
        risks: [
          `${holdCustoms} tờ khai XNK đang bị khóa bởi cổng kiểm soát HS (NEEDS_CUSTOMS_REVIEW).`,
          `${delayedCount} container kiểm hóa luồng Đỏ tại cụm Cái Mép có nguy cơ vượt ngưỡng ngày miễn lưu DEM.`,
          `${dlqCount} sự kiện Outbox đang ở trạng thái DEAD_LETTER chưa gửi tới webhook đối tác.`,
        ],
        recommendations: [
          'Duyệt mã HS tại phân hệ /trade để mở khóa thông quan VNACCS mô phỏng.',
          'Ưu tiên điều phối chuyến ICD Tân Cảng Long Bình -> Cảng Phước An nhằm tránh ùn ứ Cát Lái.',
          'Thực hiện Redrive các sự kiện Outbox DLQ tại /admin/geography.',
        ],
      },
    };
  }

  if (method === 'POST' && path === '/ai/v1/chat') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const prompt = String(body?.message || body?.prompt || '').trim();
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const [orders, containers] = await withTenant(tid, async (tx) =>
      Promise.all([
        tx.order.count({ where: { deletedAt: null } }),
        tx.containerEquipment.count(),
      ]),
    );
    return {
      status: 200,
      body: {
        reply: `[Trợ lý Heuristic SmartLogi · Dữ liệu thật Neon DB] Ghi nhận câu hỏi "${prompt.slice(0, 120)}". Hiện tenant ${ctx.session!.tenantSlug} đang quản lý ${orders} đơn hàng và ${containers} container trên hành lang Đồng Nai 2026 (95 đơn vị hành chính).`,
        method: 'deterministic_heuristic_fallback',
        advisoryOnly: true,
      },
    };
  }

  if (path === '/tenant/ai-insights') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = ctx.session!.tenantId || DEMO_TENANT_IDS.DN3PL;
    const insightData = await withTenant(tid, async (tx) => {
      const [expiringCount, outOfStockCount, activeTrips, customsHold, latestOrder, latestTrip, expiringInv] =
        await Promise.all([
          tx.inventory.count({ where: { expiryDate: { not: null, lte: new Date(Date.now() + 14 * 86400 * 1000) } } }),
          tx.inventory.count({ where: { quantityOnHand: { lte: 0 } } }),
          tx.trip.count({ where: { status: { in: ['IN_TRANSIT', 'IN_PROGRESS'] } } }),
          tx.customsDeclaration.count({ where: { status: { in: ['HOLD', 'NEEDS_CUSTOMS_REVIEW'] } } }),
          tx.order.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } }),
          tx.trip.findFirst({ orderBy: { createdAt: 'desc' } }),
          tx.inventory.findFirst({
            where: { expiryDate: { not: null } },
            include: { product: true },
          }),
        ]);
      const nowIso = new Date().toISOString();
      const orderRef = latestOrder?.trackingCode || 'SLG-DEMO-DN3PL-0003';
      const tripRef = latestTrip?.tripCode || 'TRP-DN3PL-001';
      const skuRef = expiringInv?.product?.sku || 'SKU-DN3PL-FEFO03';
      return [
        {
          id: 'ins-01',
          model: 'ROUTE_OPTIMIZER',
          type: 'CORRIDOR',
          title: 'Khuyến nghị chuyển luồng container sang Cảng Phước An',
          detail: 'Quan trắc mô phỏng tại Cát Lái ghi nhận chờ >45 phút giờ cao điểm. Phí cầu đường tuyến QL51 - Phước An tối ưu hơn ~12%.',
          description: 'Quan trắc mô phỏng tại Cát Lái ghi nhận chờ >45 phút giờ cao điểm. Phí cầu đường tuyến QL51 - Phước An tối ưu hơn ~12%.',
          metricLabel: 'Chuyến đang điều phối',
          metricValue: `${activeTrips} chuyến`,
          confidence: 0.84,
          recommendation: 'Chuyển lịch kéo cont sáng 05:30 qua QL51 - Phước An',
          status: 'NEW',
          entityRef: tripRef,
          createdAt: nowIso,
        },
        {
          id: 'ins-02',
          model: 'DEMAND_FORECAST',
          type: 'WMS_FEFO',
          title: `Cảnh báo FEFO: ${expiringCount} lô lạnh cận hạn & ${outOfStockCount} SKU hết tồn`,
          detail: 'Lô Sinh phẩm lạnh tại Kệ C1-A101 còn dưới 10 ngày sử dụng; cần tạo Wave Picking ưu tiên xuất FEFO.',
          description: 'Lô Sinh phẩm lạnh tại Kệ C1-A101 còn dưới 10 ngày sử dụng; cần tạo Wave Picking ưu tiên xuất FEFO.',
          metricLabel: 'Tồn cận hạn (<14d)',
          metricValue: `${expiringCount} lô / ${outOfStockCount} hết tồn`,
          confidence: 0.91,
          recommendation: 'Tạo Wave Picking ưu tiên Zone Lạnh C1',
          status: 'NEW',
          entityRef: skuRef,
          createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
        },
        {
          id: 'ins-03',
          model: 'DELIVERY_ETA',
          type: 'ETA_RISK',
          title: `Giám sát ETA & thông quan (${customsHold} tờ khai chờ duyệt HS)`,
          detail: 'Tuyến KCN Amata - Long Bình giữ SLA ổn định; ưu tiên duyệt mã HS để giải phóng lô hàng đúng kế hoạch tàu.',
          description: 'Tuyến KCN Amata - Long Bình giữ SLA ổn định; ưu tiên duyệt mã HS để giải phóng lô hàng đúng kế hoạch tàu.',
          metricLabel: 'Tờ khai chờ duyệt',
          metricValue: `${customsHold} tờ khai`,
          confidence: 0.87,
          recommendation: 'Kiểm tra & duyệt mã HS tại phân hệ /trade',
          status: 'ACKNOWLEDGED',
          entityRef: orderRef,
          createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
      ];
    });
    return {
      status: 200,
      body: {
        data: insightData,
        meta: { total: insightData.length, disclaimer: 'Heuristic advisory telemetry (SIMULATED)' },
      },
    };
  }

  if (method === 'POST' && /^\/tenant\/ai-insights\/[^/]+\/decision$/.test(path)) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    return { status: 200, body: { ok: true, status: body?.status || 'ACTIONED' } };
  }

  return null;
}
