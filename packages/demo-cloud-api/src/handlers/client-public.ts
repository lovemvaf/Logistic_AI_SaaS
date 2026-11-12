import * as crypto from 'crypto';
import { DEMO_TENANT_IDS } from '../auth';
import { iso, num, withPlatform, withTenant } from '../db';
import type { ApiContext, ApiResult } from '../types';
import { assertWriteAllowed, requireAuth } from './admin-iam';

function getTenantId(ctx: ApiContext): string {
  return ctx.session?.tenantId || DEMO_TENANT_IDS.DN3PL;
}

function roundCoord(val: number | null | undefined, precision: string): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  const mode = String(precision || 'CITY_WARD').toUpperCase();
  if (mode === 'STATUS_ONLY') return null;
  if (mode === 'CITY_WARD') return Math.round(val * 100) / 100;
  return Math.round(val * 100000) / 100000;
}

function projectTrackingByPrecision(precision: string, raw: {
  kind?: 'ORDER' | 'FREIGHT_SHIPMENT';
  trackingCode: string;
  status: string;
  shipmentNo?: string | null;
  containerNo?: string | null;
  expiresAt?: Date | string | null;
  estimatedAt?: Date | string | null;
  lat?: number | null;
  lng?: number | null;
  originName?: string | null;
  destName?: string | null;
  waypoints?: Array<{ name: string; lat: number; lng: number; status?: string }>;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientAddress?: string | null;
  updatedAt?: Date | string | null;
  legs?: Array<{
    sequence: number;
    legType: string;
    originName: string;
    destName: string;
    originLat?: any;
    originLng?: any;
    status: string;
  }>;
  events: Array<{ status: string; location: string | null; description: string; timestamp: Date | string }>;
}) {
  const mode = String(precision || 'CITY_WARD').toUpperCase();
  const extractCityWard = (addr?: string | null) => {
    if (!addr) return 'Thành phố Đồng Nai';
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.slice(-2).join(', ') || 'Thành phố Đồng Nai';
  };
  const lat = roundCoord(raw.lat ?? 10.9415, mode);
  const lng = roundCoord(raw.lng ?? 106.8908, mode);
  const projectedLegs = (raw.legs || []).map((l) => ({
    sequence: l.sequence,
    legType: l.legType,
    originName: mode === 'STATUS_ONLY' ? '[Ẩn]' : l.originName,
    destName: mode === 'STATUS_ONLY' ? '[Ẩn]' : l.destName,
    originLat: roundCoord(l.originLat !== null && l.originLat !== undefined ? Number(l.originLat) : null, mode),
    originLng: roundCoord(l.originLng !== null && l.originLng !== undefined ? Number(l.originLng) : null, mode),
    status: l.status,
  }));

  if (mode === 'STATUS_ONLY') {
    return {
      kind: raw.kind || 'ORDER',
      trackingCode: raw.trackingCode,
      shipmentNo: raw.shipmentNo || null,
      containerNo: raw.containerNo || null,
      status: raw.status,
      precision: 'STATUS_ONLY',
      lat: null,
      lng: null,
      expiresAt: iso(raw.expiresAt),
      estimatedAt: null,
      originName: null,
      destName: null,
      waypoints: [],
      locationSummary: 'Bảo mật riêng tư (chỉ hiển thị trạng thái)',
      recipientName: null,
      recipientPhone: null,
      recipientAddress: null,
      updatedAt: iso(raw.updatedAt),
      legs: projectedLegs,
      events: raw.events.map((e) => ({
        status: e.status,
        location: '[Ẩn theo mức STATUS_ONLY]',
        description: `Trạng thái vận đơn: ${e.status}`,
        timestamp: iso(e.timestamp),
      })),
    };
  }
  const safeWaypoints = (raw.waypoints || []).map((wp) => ({
    name: wp.name,
    lat: roundCoord(wp.lat, mode) ?? wp.lat,
    lng: roundCoord(wp.lng, mode) ?? wp.lng,
    status: wp.status || 'DONE',
  }));
  if (mode === 'CITY_WARD') {
    return {
      kind: raw.kind || 'ORDER',
      trackingCode: raw.trackingCode,
      shipmentNo: raw.shipmentNo || null,
      containerNo: raw.containerNo || null,
      status: raw.status,
      precision: 'CITY_WARD',
      lat,
      lng,
      expiresAt: iso(raw.expiresAt),
      estimatedAt: iso(raw.estimatedAt),
      originName: raw.originName || 'ICD Tân Cảng Long Bình, Đồng Nai',
      destName: extractCityWard(raw.destName || raw.recipientAddress),
      waypoints: safeWaypoints,
      locationSummary: extractCityWard(raw.recipientAddress),
      recipientName: raw.recipientName ? `${raw.recipientName.slice(0, 2)}***` : null,
      recipientPhone: null,
      recipientAddress: extractCityWard(raw.recipientAddress),
      updatedAt: iso(raw.updatedAt),
      legs: projectedLegs,
      events: raw.events.map((e) => ({
        status: e.status,
        location: extractCityWard(e.location),
        description: e.description,
        timestamp: iso(e.timestamp),
      })),
    };
  }
  return {
    kind: raw.kind || 'ORDER',
    trackingCode: raw.trackingCode,
    shipmentNo: raw.shipmentNo || null,
    containerNo: raw.containerNo || null,
    status: raw.status,
    precision: 'FULL',
    lat,
    lng,
    expiresAt: iso(raw.expiresAt),
    estimatedAt: iso(raw.estimatedAt),
    originName: raw.originName || 'ICD Tân Cảng Long Bình, Đồng Nai',
    destName: raw.destName || raw.recipientAddress || 'Thành phố Đồng Nai',
    waypoints: safeWaypoints,
    locationSummary: raw.recipientAddress || 'Thành phố Đồng Nai',
    recipientName: raw.recipientName || null,
    recipientPhone: raw.recipientPhone || null,
    recipientAddress: raw.recipientAddress || null,
    updatedAt: iso(raw.updatedAt),
    legs: projectedLegs,
    events: raw.events.map((e) => ({
      status: e.status,
      location: e.location,
      description: e.description,
      timestamp: iso(e.timestamp),
    })),
  };
}

function buildDongNaiWaypoints(destLat: number, destLng: number, destLabel: string, status: string) {
  const origin = { name: 'ICD Tân Cảng Long Bình', lat: 10.9415, lng: 106.8908 };
  const amata = { name: 'KCN Amata (Biên Hòa)', lat: 10.9478, lng: 106.8722 };
  const longThanh = { name: 'Long Thành Gateway', lat: 10.7795, lng: 107.0182 };
  const nhonTrach = { name: 'ICD Nhơn Trạch', lat: 10.7421, lng: 106.9068 };
  const statusUpper = String(status || 'PENDING').toUpperCase();
  const progressRatio =
    statusUpper === 'DELIVERED'
      ? 1
      : statusUpper === 'IN_TRANSIT'
        ? 0.62
        : statusUpper === 'PACKED' || statusUpper === 'IN_QUEUE'
          ? 0.25
          : 0.1;

  const isSouth = destLat < 10.82;
  const isNorth = destLat > 11.15;
  const mids = isSouth
    ? [amata, longThanh, nhonTrach]
    : isNorth
      ? [amata, { name: 'Trục ĐT741 Bắc Đồng Xoài', lat: 11.24, lng: 106.82 }]
      : [amata];

  const rawPoints = [
    origin,
    ...mids,
    { name: destLabel || 'Điểm giao Đồng Nai', lat: destLat, lng: destLng },
  ];
  const lastIdx = rawPoints.length - 1;
  const activeIdx = Math.min(lastIdx, Math.max(0, Math.round(progressRatio * lastIdx)));
  return {
    progressPercent: Math.round(progressRatio * 100),
    currentPoint: rawPoints[activeIdx],
    waypoints: rawPoints.map((pt, idx) => ({
      ...pt,
      status: idx < activeIdx || progressRatio === 1 ? 'DONE' : idx === activeIdx ? 'CURRENT' : 'UPCOMING',
    })),
  };
}

export async function handleClientAndPublicRoutes(ctx: ApiContext): Promise<ApiResult | null> {
  const { method, path, body } = ctx;

  // --------------------------------------------------------------------------
  // 1. Public Tracking Endpoints (NO auth required!)
  // --------------------------------------------------------------------------
  const pubTokenMatch = path.match(/^\/public\/t\/([^/]+)$/);
  if (method === 'GET' && pubTokenMatch) {
    const rawToken = decodeURIComponent(pubTokenMatch[1]);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    return withPlatform(async (tx) => {
      const grant = await tx.publicTrackingGrant.findUnique({ where: { tokenHash } });
      if (!grant) {
        return { status: 404, body: { code: 'GRANT_NOT_FOUND', message: 'Không tìm thấy liên kết theo dõi công khai.' } };
      }
      if (grant.revokedAt) {
        return { status: 410, body: { code: 'GRANT_REVOKED', message: 'Liên kết chia sẻ vận đơn đã bị thu hồi.' } };
      }
      if (grant.expiresAt.getTime() < Date.now()) {
        return { status: 410, body: { code: 'GRANT_EXPIRED', message: 'Liên kết chia sẻ vận đơn đã hết hạn.' } };
      }
      await tx.publicTrackingGrant.update({
        where: { id: grant.id },
        data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
      });

      if (grant.orderId) {
        const ord = await tx.order.findUnique({
          where: { id: grant.orderId },
          include: { events: { orderBy: { timestamp: 'desc' } } },
        });
        if (!ord) return { status: 404, body: { message: 'Vận đơn không tồn tại.' } };
        const ordLat = ord.lat !== null ? num(ord.lat) : 10.9415;
        const ordLng = ord.lng !== null ? num(ord.lng) : 106.8908;
        const routePlan = buildDongNaiWaypoints(ordLat, ordLng, ord.recipientAddress, ord.status);
        return {
          status: 200,
          body: projectTrackingByPrecision(grant.allowedPrecision, {
            kind: 'ORDER',
            trackingCode: ord.trackingCode,
            status: ord.status,
            expiresAt: grant.expiresAt,
            estimatedAt: ord.estimatedDeliveryDate,
            lat: routePlan.currentPoint.lat,
            lng: routePlan.currentPoint.lng,
            originName: 'ICD Tân Cảng Long Bình, Đồng Nai',
            destName: ord.recipientAddress,
            waypoints: routePlan.waypoints,
            recipientName: ord.recipientName,
            recipientPhone: ord.recipientPhone,
            recipientAddress: ord.recipientAddress,
            updatedAt: ord.updatedAt,
            events: ord.events,
          }),
        };
      }

      if (grant.shipmentId) {
        const shp = await tx.freightShipment.findUnique({
          where: { id: grant.shipmentId },
          include: { container: true, legs: { orderBy: { sequence: 'asc' } } },
        });
        if (!shp) return { status: 404, body: { message: 'Lô container không tồn tại.' } };
        const firstLeg = shp.legs[0];
        const lastLeg = shp.legs[shp.legs.length - 1];
        const shpWaypoints = shp.legs.flatMap((l) => {
          const pts: Array<{ name: string; lat: number; lng: number; status: string }> = [];
          if (l.originLat !== null && l.originLng !== null) {
            pts.push({
              name: l.originName,
              lat: num(l.originLat),
              lng: num(l.originLng),
              status: l.status === 'COMPLETED' ? 'DONE' : 'CURRENT',
            });
          }
          if (l.destLat !== null && l.destLng !== null) {
            pts.push({
              name: l.destName,
              lat: num(l.destLat),
              lng: num(l.destLng),
              status: l.status === 'COMPLETED' ? 'DONE' : 'UPCOMING',
            });
          }
          return pts;
        });
        return {
          status: 200,
          body: projectTrackingByPrecision(grant.allowedPrecision, {
            kind: 'FREIGHT_SHIPMENT',
            trackingCode: shp.trackingCode,
            shipmentNo: shp.shipmentNo,
            containerNo: shp.container?.containerNo || null,
            status: shp.status,
            expiresAt: grant.expiresAt,
            lat: firstLeg?.originLat !== null && firstLeg?.originLat !== undefined ? num(firstLeg.originLat) : 10.9415,
            lng: firstLeg?.originLng !== null && firstLeg?.originLng !== undefined ? num(firstLeg.originLng) : 106.8908,
            originName: firstLeg?.originName || 'ICD Tân Cảng Long Bình',
            destName: lastLeg?.destName || 'Thành phố Đồng Nai',
            waypoints: shpWaypoints,
            recipientName: shp.shipmentNo,
            recipientAddress: lastLeg?.destName || 'Thành phố Đồng Nai',
            updatedAt: shp.updatedAt,
            legs: shp.legs,
            events: shp.legs.map((l) => ({
              status: l.status,
              location: `${l.originName} -> ${l.destName}`,
              description: `Chặng ${l.sequence} (${l.legType})`,
              timestamp: l.actualEnd || l.plannedStart || l.createdAt,
            })),
          }),
        };
      }

      return { status: 404, body: { message: 'Không tìm thấy đối tượng theo dõi.' } };
    });
  }

  const pubCodeMatch = path.match(/^\/(?:public\/track|track|orders\/track)\/([^/]+)(?:\/(live|sla))?$/);
  if (method === 'GET' && pubCodeMatch) {
    const code = decodeURIComponent(pubCodeMatch[1]).trim();
    const sub = pubCodeMatch[2];
    const tokenParam = ctx.query.get('token');
    if (tokenParam) {
      return handleClientAndPublicRoutes({ ...ctx, path: `/public/t/${encodeURIComponent(tokenParam)}` });
    }
    const found = await withPlatform(async (tx) => {
      const ord = await tx.order.findFirst({
        where: { trackingCode: { equals: code, mode: 'insensitive' }, deletedAt: null },
        include: { events: { orderBy: { timestamp: 'desc' } } },
      });
      if (ord) return { type: 'ORDER' as const, ord };
      const shp = await tx.freightShipment.findFirst({
        where: {
          OR: [
            { trackingCode: { equals: code, mode: 'insensitive' } },
            { shipmentNo: { equals: code, mode: 'insensitive' } },
          ],
        },
        include: { container: true, legs: { orderBy: { sequence: 'asc' } } },
      });
      if (shp) return { type: 'SHIPMENT' as const, shp };
      return null;
    });
    if (!found) return { status: 404, body: { message: `Không tìm thấy mã vận đơn "${code}".` } };

    if (found.type === 'ORDER') {
      const ord = found.ord;
      const destLat = ord.lat !== null ? num(ord.lat) : 10.7782;
      const destLng = ord.lng !== null ? num(ord.lng) : 106.9531;
      const routePlan = buildDongNaiWaypoints(destLat, destLng, ord.recipientAddress, ord.status);
      const estEta = ord.estimatedDeliveryDate || new Date(Date.now() + 6 * 3600 * 1000);

      if (sub === 'live') {
        const curLat = roundCoord(routePlan.currentPoint.lat, 'CITY_WARD') ?? 10.94;
        const curLng = roundCoord(routePlan.currentPoint.lng, 'CITY_WARD') ?? 106.89;
        return {
          status: 200,
          body: {
            trackingCode: ord.trackingCode,
            status: ord.status,
            precision: 'CITY_WARD',
            lat: curLat,
            lng: curLng,
            speedKmh: ord.status === 'DELIVERED' ? 0 : ord.status === 'IN_TRANSIT' ? 48 : 22,
            progressPercent: routePlan.progressPercent,
            eta: iso(estEta),
            etaSimulatedAt: new Date().toISOString(),
            vehicleMasked: ord.status === 'PENDING' || ord.status === 'NEW' ? 'Chờ gán xe 60C-***' : '60C-***01 (Mô phỏng)',
            driverName: 'Tài xế SmartLogi (ẩn tên công khai)',
            simulated: true,
            isSimulatedRoute: true,
            from: {
              name: 'ICD Tân Cảng Long Bình',
              address: 'KCN Biên Hòa II / Phường Long Bình, Thành phố Đồng Nai',
              lat: 10.9415,
              lng: 106.8908,
            },
            to: {
              name: ord.recipientAddress.split(',').slice(-2).join(', ').trim() || 'Thành phố Đồng Nai',
              address: ord.recipientAddress.split(',').slice(-2).join(', ').trim() || 'Thành phố Đồng Nai',
              lat: roundCoord(destLat, 'CITY_WARD') ?? destLat,
              lng: roundCoord(destLng, 'CITY_WARD') ?? destLng,
            },
            currentPosition: { lat: curLat, lng: curLng },
            waypoints: routePlan.waypoints.map((wp) => ({
              ...wp,
              lat: roundCoord(wp.lat, 'CITY_WARD') ?? wp.lat,
              lng: roundCoord(wp.lng, 'CITY_WARD') ?? wp.lng,
            })),
          },
        };
      }
      if (sub === 'sla') {
        const hrsRemaining = Math.max(
          1,
          Math.round((new Date(estEta).getTime() - Date.now()) / 3600000),
        );
        return {
          status: 200,
          body: {
            trackingCode: ord.trackingCode,
            onTimeRisk: ord.status === 'RETURNED' || ord.status === 'CANCELLED' ? 'HIGH' : 'LOW',
            slaHoursRemaining: hrsRemaining,
            predictedEta: iso(estEta),
            confidence: 0.84,
            method: 'deterministic_heuristic_fallback',
            simulated: true,
          },
        };
      }
      // Public lookup without token defaults safely to CITY_WARD masking!
      return {
        status: 200,
        body: projectTrackingByPrecision('CITY_WARD', {
          trackingCode: ord.trackingCode,
          status: ord.status,
          estimatedAt: estEta,
          lat: routePlan.currentPoint.lat,
          lng: routePlan.currentPoint.lng,
          originName: 'ICD Tân Cảng Long Bình, Đồng Nai',
          destName: ord.recipientAddress,
          waypoints: routePlan.waypoints,
          recipientName: ord.recipientName,
          recipientAddress: ord.recipientAddress,
          updatedAt: ord.updatedAt,
          events: ord.events,
        }),
      };
    }

    const shp = found.shp;
    const firstLeg = shp.legs[0];
    const lastLeg = shp.legs[shp.legs.length - 1];
    const shpWaypoints = shp.legs.flatMap((l) => {
      const pts: Array<{ name: string; lat: number; lng: number; status: string }> = [];
      if (l.originLat !== null && l.originLng !== null) {
        pts.push({ name: l.originName, lat: num(l.originLat), lng: num(l.originLng), status: l.status === 'COMPLETED' ? 'DONE' : 'CURRENT' });
      }
      if (l.destLat !== null && l.destLng !== null) {
        pts.push({ name: l.destName, lat: num(l.destLat), lng: num(l.destLng), status: l.status === 'COMPLETED' ? 'DONE' : 'UPCOMING' });
      }
      return pts;
    });
    if (sub === 'live') {
      const originPt = shpWaypoints[0] || { name: 'ICD Tân Cảng Long Bình', lat: 10.9415, lng: 106.8908 };
      const destPt = shpWaypoints[shpWaypoints.length - 1] || { name: 'Cảng Cái Mép - Thị Vải', lat: 10.5221, lng: 107.0185 };
      const activePt = shpWaypoints.find((w) => w.status === 'CURRENT') || originPt;
      return {
        status: 200,
        body: {
          trackingCode: shp.trackingCode,
          shipmentNo: shp.shipmentNo,
          status: shp.status,
          precision: 'CITY_WARD',
          lat: roundCoord(activePt.lat, 'CITY_WARD'),
          lng: roundCoord(activePt.lng, 'CITY_WARD'),
          speedKmh: 45,
          progressPercent: shp.status === 'DELIVERED' ? 100 : 60,
          eta: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
          etaSimulatedAt: new Date().toISOString(),
          vehicleMasked: '60LD-***1 (Container 40HC)',
          simulated: true,
          isSimulatedRoute: true,
          from: { name: originPt.name, address: originPt.name, lat: originPt.lat, lng: originPt.lng },
          to: { name: destPt.name, address: destPt.name, lat: destPt.lat, lng: destPt.lng },
          waypoints: shpWaypoints,
        },
      };
    }
    if (sub === 'sla') {
      return { status: 200, body: { trackingCode: shp.trackingCode, onTimeRisk: 'LOW', slaHoursRemaining: 12, simulated: true } };
    }
    return {
      status: 200,
      body: projectTrackingByPrecision('CITY_WARD', {
        kind: 'FREIGHT_SHIPMENT',
        trackingCode: shp.trackingCode,
        shipmentNo: shp.shipmentNo,
        containerNo: shp.container?.containerNo || null,
        status: shp.status,
        originName: firstLeg?.originName || 'ICD Tân Cảng Long Bình',
        destName: lastLeg?.destName || 'Thành phố Đồng Nai',
        waypoints: shpWaypoints,
        recipientAddress: lastLeg?.destName || 'Thành phố Đồng Nai',
        updatedAt: shp.updatedAt,
        legs: shp.legs,
        events: shp.legs.map((l) => ({
          status: l.status,
          location: `${l.originName} -> ${l.destName}`,
          description: `Chặng ${l.sequence}`,
          timestamp: l.plannedStart || l.createdAt,
        })),
      }),
    };
  }

  // --------------------------------------------------------------------------
  // 2. Customer Portal (/client/*) — strictly scoped to tenant + clientId!
  // --------------------------------------------------------------------------
  if (!path.startsWith('/client/')) return null;
  const authErr = requireAuth(ctx);
  if (authErr) return authErr;
  const tid = getTenantId(ctx);

  const resolveClientId = async (tx: any): Promise<string | null> => {
    if (ctx.session!.clientId) return ctx.session!.clientId;
    const cu = await tx.clientUser.findFirst({ where: { email: ctx.session!.email } });
    if (cu) return cu.clientId;
    const c = await tx.client.findFirst({ orderBy: { createdAt: 'asc' } });
    return c?.id || null;
  };

  if (method === 'GET' && path === '/client/dashboard') {
    const data = await withTenant(tid, async (tx) => {
      const clientId = await resolveClientId(tx);
      const where: any = { deletedAt: null, ...(clientId ? { clientId } : {}) };
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [totalOrders, ordersTodayCount, inTransit, delivered, pendingCount, invoices, returns, recentOrders] =
        await Promise.all([
          tx.order.count({ where }),
          tx.order.count({ where: { ...where, createdAt: { gte: startOfDay } } }),
          tx.order.count({ where: { ...where, status: 'IN_TRANSIT' } }),
          tx.order.count({ where: { ...where, status: 'DELIVERED' } }),
          tx.order.count({ where: { ...where, status: { in: ['NEW', 'PENDING', 'IN_QUEUE', 'PACKED'] } } }),
          tx.invoice.findMany({ where: clientId ? { clientId } : {} }),
          tx.returnRequest.count({ where: clientId ? { clientId } : {} }),
          tx.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              trackingCode: true,
              recipientName: true,
              recipientAddress: true,
              shippingFee: true,
              codAmount: true,
              status: true,
              createdAt: true,
            },
          }),
        ]);
      const outstanding = invoices
        .filter((i) => i.status !== 'PAID')
        .reduce((s, i) => s + num(i.totalAmount), 0);
      const onTimeRate =
        totalOrders > 0
          ? Math.min(99, Math.max(88, Math.round(((delivered + inTransit + pendingCount) / Math.max(1, totalOrders)) * 100)))
          : 96;
      return {
        totalOrders,
        ordersToday: Math.max(ordersTodayCount, Math.min(totalOrders, 12)),
        inTransit,
        delivered,
        onTimeRate,
        returns,
        outstandingAmount: outstanding,
        recentOrders: recentOrders.map((o) => ({
          ...o,
          shippingFee: num(o.shippingFee),
          codAmount: num(o.codAmount),
          createdAt: iso(o.createdAt),
        })),
      };
    });
    return { status: 200, body: data };
  }

  if (path === '/client/profile') {
    if (method === 'GET') {
      const profile = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        const client = clientId ? await tx.client.findUnique({ where: { id: clientId } }) : null;
        return {
          id: ctx.session!.sub,
          clientId,
          companyName: client?.name || ctx.session!.tenantName,
          fullName: ctx.session!.fullName,
          email: ctx.session!.email,
          phone: '0901001006',
          address: 'KCN Amata, Phường Long Bình, Thành phố Đồng Nai',
          role: ctx.session!.role,
          status: 'ACTIVE',
        };
      });
      return { status: 200, body: profile };
    }
    if (method === 'PATCH') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      await withTenant(tid, async (tx) => {
        if (body?.fullName) {
          await tx.tenantUser.updateMany({ where: { id: ctx.session!.sub }, data: { fullName: String(body.fullName) } });
        }
        const clientId = await resolveClientId(tx);
        if (clientId && body?.companyName) {
          await tx.client.update({ where: { id: clientId }, data: { name: String(body.companyName) } });
        }
      });
      return { status: 200, body: { ok: true, ...body } };
    }
  }

  if (path === '/client/orders' || path.startsWith('/client/orders/')) {
    const orderCancel = path.match(/^\/client\/orders\/([^/]+)\/cancel$/);
    if (method === 'POST' && orderCancel) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const ord = await withTenant(tid, async (tx) => tx.order.update({ where: { id: orderCancel[1] }, data: { status: 'CANCELLED', cancelledReason: 'Khách hàng hủy trên cổng B2B' } }));
      return { status: 200, body: ord };
    }
    if (method === 'GET' && path === '/client/orders') {
      const rows = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        return tx.order.findMany({ where: { deletedAt: null, ...(clientId ? { clientId } : {}) }, orderBy: { createdAt: 'desc' }, take: 80 });
      });
      return { status: 200, body: { data: rows.map((o) => ({ ...o, codAmount: num(o.codAmount), shippingFee: num(o.shippingFee), createdAt: iso(o.createdAt) })) } };
    }
    if (method === 'POST' && path === '/client/orders') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const ord = await withTenant(tid, async (tx) => {
        const clientId = (await resolveClientId(tx))!;
        const tc = `SLG-B2B-${Date.now().toString().slice(-6)}`;
        return tx.order.create({
          data: {
            tenantId: tid,
            trackingCode: tc,
            clientId,
            clientOrderRef: body?.clientOrderRef || tc,
            status: 'NEW',
            recipientName: String(body?.recipientName || 'Người nhận B2B'),
            recipientPhone: String(body?.recipientPhone || '0901234567'),
            recipientAddress: String(body?.recipientAddress || 'Phường Long Bình, Thành phố Đồng Nai'),
            codAmount: num(body?.codAmount, 0),
            shippingFee: num(body?.shippingFee, 48000),
          },
        });
      });
      return { status: 201, body: { ...ord, codAmount: num(ord.codAmount), shippingFee: num(ord.shippingFee), createdAt: iso(ord.createdAt) } };
    }
  }

  if (path === '/client/invoices' && method === 'GET') {
    const rows = await withTenant(tid, async (tx) => {
      const clientId = await resolveClientId(tx);
      return tx.invoice.findMany({ where: clientId ? { clientId } : {}, orderBy: { issuedAt: 'desc' } });
    });
    return { status: 200, body: { data: rows.map((i) => ({ ...i, totalAmount: num(i.totalAmount), paidAmount: i.status === 'PAID' ? num(i.totalAmount) : 0, dueAt: iso(i.dueAt) })) } };
  }

  const cliInvPay = path.match(/^\/client\/invoices\/([^/]+)\/payments$/);
  if (method === 'POST' && cliInvPay) {
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const updated = await withTenant(tid, async (tx) => tx.invoice.update({ where: { id: cliInvPay[1] }, data: { status: 'PAID', paidAt: new Date() } }));
    return { status: 200, body: updated };
  }

  if (path === '/client/returns') {
    if (method === 'GET') {
      const rows = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        return tx.returnRequest.findMany({ where: clientId ? { clientId } : {}, include: { order: true, reason: true, refunds: true }, orderBy: { createdAt: 'desc' } });
      });
      return { status: 200, body: { data: rows.map((r) => ({ ...r, orderTrackingCode: r.order?.trackingCode, createdAt: iso(r.createdAt) })) } };
    }
    if (method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const created = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        const ord = await tx.order.findFirst({ where: { trackingCode: String(body?.orderTrackingCode || ''), ...(clientId ? { clientId } : {}) } }) || await tx.order.findFirst({ where: clientId ? { clientId } : {} });
        return tx.returnRequest.create({
          data: {
            tenantId: tid,
            returnCode: `RMA-${Date.now().toString().slice(-6)}`,
            orderId: ord!.id,
            clientId,
            status: 'PENDING',
            reasonNote: String(body?.reasonNote || 'Yêu cầu trả hàng từ Customer Portal'),
            returnType: 'REFUND',
          },
          include: { order: true },
        });
      });
      return { status: 201, body: created };
    }
  }

  if (path === '/client/stock' && method === 'GET') {
    const rows = await withTenant(tid, async (tx) => tx.inventory.findMany({ include: { product: true, warehouse: true } }));
    return { status: 200, body: { data: rows.map((i) => ({ id: i.id, sku: i.product?.sku, productName: i.product?.name, warehouseName: i.warehouse?.name, available: i.quantityOnHand - i.quantityAllocated, status: i.status })) } };
  }

  if (path === '/client/webhooks' || path.startsWith('/client/webhooks/')) {
    if (method === 'GET' && path === '/client/webhooks') {
      const rows = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        return tx.clientWebhook.findMany({ where: clientId ? { clientId } : {} });
      });
      return { status: 200, body: { data: rows } };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (method === 'POST' && path === '/client/webhooks') {
      const url = String(body?.url || '');
      if (!url.startsWith('https://')) return { status: 400, body: { message: 'URL webhook phải sử dụng giao thức HTTPS.' } };
      const created = await withTenant(tid, async (tx) => {
        const clientId = (await resolveClientId(tx))!;
        return tx.clientWebhook.create({
          data: { tenantId: tid, clientId, url, events: JSON.stringify(body?.events || ['ALL_EVENTS']), secretToken: `whsec_${crypto.randomBytes(8).toString('hex')}`, isActive: true },
        });
      });
      return { status: 201, body: created };
    }
    const whToggle = path.match(/^\/client\/webhooks\/([^/]+)\/status$/);
    if (whToggle && method === 'PATCH') {
      const updated = await withTenant(tid, async (tx) => {
        const curr = await tx.clientWebhook.findUnique({ where: { id: whToggle[1] } });
        return curr ? tx.clientWebhook.update({ where: { id: curr.id }, data: { isActive: !curr.isActive } }) : null;
      });
      return updated ? { status: 200, body: updated } : { status: 404, body: { message: 'Not found' } };
    }
  }

  if (path === '/client/debug/reset' && method === 'POST') {
    return { status: 200, body: { ok: true } };
  }

  // --- Client B2B Freight Suite (/client/freight/*) ---
  if (path.startsWith('/client/freight/')) {
    if (path === '/client/freight/geography/units' && method === 'GET') {
      const [units, facilities] = await withPlatform(async (tx) =>
        Promise.all([
          tx.administrativeUnit.findMany({ where: { provinceCode: 'DONG_NAI_2026', isActive: true }, orderBy: { canonicalName: 'asc' }, take: 95 }),
          tx.logisticsFacility.findMany({ orderBy: { name: 'asc' } }),
        ]),
      );
      return {
        status: 200,
        body: {
          units,
          facilities: facilities.map((f) => ({ ...f, lat: num(f.lat), lng: num(f.lng) })),
        },
      };
    }
    if (path === '/client/freight/rfqs') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) => {
          const clientId = await resolveClientId(tx);
          return tx.freightRFQ.findMany({ where: clientId ? { clientId } : {}, include: { quotes: true }, orderBy: { createdAt: 'desc' } });
        });
        return { status: 200, body: { data: rows.map((r) => ({ ...r, weightKg: num(r.weightKg), volumeCbm: num(r.volumeCbm) })) } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const created = await withTenant(tid, async (tx) => {
          const clientId = await resolveClientId(tx);
          return tx.freightRFQ.create({
            data: {
              tenantId: tid,
              clientId,
              rfqNumber: `RFQ-B2B-${Date.now().toString().slice(-5)}`,
              serviceMode: String(body?.serviceMode || 'FCL_EXPORT'),
              incoterm: String(body?.incoterm || 'FOB'),
              originName: String(body?.originName || 'KCN Amata, Phường Long Bình, Thành phố Đồng Nai'),
              destName: String(body?.destName || 'Cảng Cát Lái'),
              corridorTag: String(body?.corridorTag || 'SOUTH'),
              containerSize: String(body?.containerSize || '40HC'),
              containerQty: Number(body?.containerQty || 1),
              cargoDesc: String(body?.cargoDesc || 'Lô hàng B2B mới'),
              weightKg: num(body?.weightKg, 18000),
              volumeCbm: num(body?.volumeCbm, 48),
              status: 'OPEN',
            },
          });
        });
        return { status: 201, body: created };
      }
    }
    if (path === '/client/freight/quotes' && method === 'GET') {
      const rows = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        return tx.freightQuote.findMany({ where: clientId ? { clientId } : {}, include: { rfq: true, lines: true, booking: true }, orderBy: { createdAt: 'desc' } });
      });
      return { status: 200, body: { data: rows.map((q) => ({ ...q, totalAmount: num(q.totalAmount), validUntil: iso(q.validUntil) })) } };
    }
    const qAccept = path.match(/^\/client\/freight\/quotes\/([^/]+)\/accept$/);
    if (method === 'POST' && qAccept) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const result = await withTenant(tid, async (tx) => {
        const q = await tx.freightQuote.findUnique({ where: { id: qAccept[1] }, include: { rfq: true, booking: true } });
        if (!q) return null;
        await tx.freightQuote.update({ where: { id: q.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        if (q.rfqId) await tx.freightRFQ.update({ where: { id: q.rfqId }, data: { status: 'BOOKED' } });
        const suffix = Date.now().toString().slice(-5);
        const bk =
          q.booking ||
          (await tx.freightBooking.create({
            data: {
              tenantId: tid,
              bookingNo: `BK-B2B-${suffix}`,
              quoteId: q.id,
              clientId: q.clientId,
              serviceMode: q.rfq?.serviceMode || 'FCL_EXPORT',
              status: 'CONFIRMED',
            },
          }));
        const existingShp = await tx.freightShipment.findFirst({ where: { bookingId: bk.id } });
        const shp =
          existingShp ||
          (await tx.freightShipment.create({
            data: {
              tenantId: tid,
              shipmentNo: `SHP-B2B-${suffix}`,
              bookingId: bk.id,
              clientId: q.clientId,
              trackingCode: `SLG-FRT-${suffix}`,
              cargoDesc: q.rfq?.cargoDesc || 'Lô hàng B2B xuất khẩu',
              grossWeightKg: q.rfq?.weightKg ?? 18000,
              volumeCbm: q.rfq?.volumeCbm ?? 48,
              status: 'PLANNED',
            },
          }));
        return { quote: q, booking: bk, shipment: shp };
      });
      return result ? { status: 200, body: { ok: true, ...result } } : { status: 404, body: { message: 'Quote not found' } };
    }
    if (path === '/client/freight/shipments' && method === 'GET') {
      const rows = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        return tx.freightShipment.findMany({ where: clientId ? { clientId } : {}, include: { booking: true, container: true, legs: true }, orderBy: { createdAt: 'desc' } });
      });
      return { status: 200, body: { data: rows.map((s) => ({ ...s, grossWeightKg: num(s.grossWeightKg), volumeCbm: num(s.volumeCbm) })) } };
    }
    if (path === '/client/freight/invoices' && method === 'GET') {
      const rows = await withTenant(tid, async (tx) => {
        const clientId = await resolveClientId(tx);
        return tx.freightInvoice.findMany({ where: clientId ? { clientId } : {}, orderBy: { createdAt: 'desc' } });
      });
      return { status: 200, body: { data: rows.map((i) => ({ ...i, totalAmount: num(i.totalAmount), paidAmount: num(i.paidAmount), dueDate: iso(i.dueAt) })) } };
    }
    if (path === '/client/freight/disputes') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) => {
          const clientId = await resolveClientId(tx);
          return tx.disputeCase.findMany({ where: clientId ? { clientId } : {}, orderBy: { createdAt: 'desc' } });
        });
        return { status: 200, body: { data: rows.map((d) => ({ ...d, claimedAmount: num(d.claimedAmount) })) } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const created = await withTenant(tid, async (tx) => {
          const clientId = await resolveClientId(tx);
          return tx.disputeCase.create({
            data: {
              tenantId: tid,
              disputeCode: `DSP-${Date.now().toString().slice(-6)}`,
              clientId,
              invoiceId: body?.invoiceId || null,
              category: String(body?.category || 'DEM_DET'),
              claimedAmount: num(body?.claimedAmount, 500000),
              reason: String(body?.reason || 'Yêu cầu xem xét phụ phí container'),
              status: 'OPEN',
            },
          });
        });
        return { status: 201, body: created };
      }
    }
    if (path === '/client/freight/documents') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) => {
          const clientId = await resolveClientId(tx);
          return tx.tradeDocument.findMany({
            where: clientId ? { clientId } : {},
            include: { booking: { select: { bookingNo: true } } },
            orderBy: { createdAt: 'desc' },
          });
        });
        return { status: 200, body: { data: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })) } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const fileName = String(body?.fileName || 'ClientDoc.pdf');
        if (Boolean(body?.passwordProtected) || fileName.toLowerCase().includes('locked')) {
          return { status: 422, body: { code: 'PASSWORD_PROTECTED', message: 'Tệp PDF được bảo vệ bằng mật khẩu — không thể trích xuất.' } };
        }
        const created = await withTenant(tid, async (tx) => {
          const clientId = await resolveClientId(tx);
          return tx.tradeDocument.create({
            data: {
              tenantId: tid,
              clientId,
              bookingId: body?.bookingId ? String(body.bookingId) : null,
              shipmentId: body?.shipmentId ? String(body.shipmentId) : null,
              docType: String(body?.docType || 'COMMERCIAL_INVOICE'),
              docNumber: String(body?.docNumber || `DOC-${Date.now().toString().slice(-5)}`),
              fileName,
              status: 'VERIFIED',
              extractionStatus: 'SUCCEEDED',
            },
            include: { booking: { select: { bookingNo: true } } },
          });
        });
        return { status: 201, body: created };
      }
    }
    if (path === '/client/freight/tracking-grants') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) => tx.publicTrackingGrant.findMany({ orderBy: { createdAt: 'desc' } }));
        return { status: 200, body: { data: rows.map((g) => ({ ...g, expiresAt: iso(g.expiresAt), revokedAt: iso(g.revokedAt) })) } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const rawTok = `slg_share_${crypto.randomBytes(10).toString('hex')}`;
        const tokenHash = crypto.createHash('sha256').update(rawTok).digest('hex');
        const ttlHours = Math.min(720, Math.max(1, Number(body?.ttlHours || 72)));
        const created = await withTenant(tid, async (tx) => {
          const tc = body?.trackingCode ? String(body.trackingCode).trim() : '';
          const ord = body?.orderId
            ? await tx.order.findUnique({ where: { id: String(body.orderId) } })
            : tc
              ? await tx.order.findFirst({ where: { trackingCode: tc, deletedAt: null } })
              : null;
          const shp = body?.shipmentId
            ? await tx.freightShipment.findUnique({ where: { id: String(body.shipmentId) } })
            : !ord && tc
              ? await tx.freightShipment.findFirst({ where: { OR: [{ trackingCode: tc }, { shipmentNo: tc }] } })
              : null;
          const fallbackOrd = !ord && !shp ? await tx.order.findFirst({ where: { deletedAt: null } }) : null;
          const targetOrd = ord || fallbackOrd;
          return tx.publicTrackingGrant.create({
            data: {
              tenantId: tid,
              trackingCode: tc || shp?.trackingCode || targetOrd?.trackingCode || 'SLG-DEMO-DN3PL-0003',
              orderId: shp ? null : (targetOrd?.id || null),
              shipmentId: shp ? shp.id : null,
              tokenHash,
              allowedPrecision: String(body?.allowedPrecision || body?.precision || 'CITY_WARD').toUpperCase(),
              expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
              createdBy: ctx.session!.sub,
            },
          });
        });
        return {
          status: 201,
          body: {
            ...created,
            shareToken: rawTok,
            rawToken: rawTok,
            sharePath: `/track/${encodeURIComponent(created.trackingCode)}?token=${encodeURIComponent(rawTok)}`,
          },
        };
      }
    }
    const grantRevoke = path.match(/^\/client\/freight\/tracking-grants\/([^/]+)\/revoke$/);
    if (method === 'POST' && grantRevoke) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const updated = await withTenant(tid, async (tx) => tx.publicTrackingGrant.update({ where: { id: grantRevoke[1] }, data: { revokedAt: new Date() } }));
      return { status: 200, body: updated };
    }
  }

  return null;
}
