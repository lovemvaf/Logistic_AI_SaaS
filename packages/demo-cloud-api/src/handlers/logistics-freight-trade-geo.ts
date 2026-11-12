import * as crypto from 'crypto';
import {
  DONG_NAI_2026_UNITS,
  DONG_NAI_PRE_2025_ALIASES,
  normalizeVietnameseAdminName,
  normalizeVietnameseAliasKey,
} from 'shared-types/dist/dong-nai-2026';
import { DEMO_TENANT_IDS } from '../auth';
import { iso, num, withPlatform, withTenant } from '../db';
import { appendSimulationEvent } from '../scenarios';
import type { ApiContext, ApiResult } from '../types';
import { assertInternalRole, assertWriteAllowed, requireAuth } from './admin-iam';

function getTenantId(ctx: ApiContext): string {
  return ctx.session?.tenantId || DEMO_TENANT_IDS.DN3PL;
}

const ISO_6346_RE = /^[A-Z]{4}\d{7}$/;

function calculateDemDetForShipment(shipment: any, now = new Date()) {
  const demRule = shipment.demRule;
  const detRule = shipment.detRule;
  const dischargeAt = shipment.dischargeAt ? new Date(shipment.dischargeAt) : null;
  const gateOutFullAt = shipment.gateOutFullAt ? new Date(shipment.gateOutFullAt) : now;
  const emptyReturnAt = shipment.emptyReturnAt ? new Date(shipment.emptyReturnAt) : now;

  let demurrageAmount = 0;
  let demurrageBillableDays = 0;
  if (demRule && dischargeAt) {
    const totalDays = Math.max(0, Math.ceil((gateOutFullAt.getTime() - dischargeAt.getTime()) / 86400000));
    demurrageBillableDays = Math.max(0, totalDays - demRule.freeDays);
    const tier1 = Math.min(demurrageBillableDays, demRule.tier1Days);
    const tier2 = Math.max(0, demurrageBillableDays - demRule.tier1Days);
    demurrageAmount = tier1 * num(demRule.dailyRateTier1) + tier2 * num(demRule.dailyRateTier2);
  }

  let detentionAmount = 0;
  let detentionBillableDays = 0;
  if (detRule && shipment.gateOutFullAt) {
    const totalDays = Math.max(0, Math.ceil((emptyReturnAt.getTime() - gateOutFullAt.getTime()) / 86400000));
    detentionBillableDays = Math.max(0, totalDays - detRule.freeDays);
    const tier1 = Math.min(detentionBillableDays, detRule.tier1Days);
    const tier2 = Math.max(0, detentionBillableDays - detRule.tier1Days);
    detentionAmount = tier1 * num(detRule.dailyRateTier1) + tier2 * num(detRule.dailyRateTier2);
  }

  const totalDemDet = demurrageAmount + detentionAmount;
  return {
    shipmentId: shipment.id,
    shipmentNo: shipment.shipmentNo,
    clocksSeparated: true,
    demurrageBillableDays,
    demurrageAmount,
    detentionBillableDays,
    detentionAmount,
    totalDemDetAmount: totalDemDet,
    totalDemDet,
    demurrage: {
      freeDays: demRule?.freeDays ?? 3,
      chargeableDays: demurrageBillableDays,
      totalAmount: demurrageAmount,
    },
    detention: {
      freeDays: detRule?.freeDays ?? 5,
      chargeableDays: detentionBillableDays,
      totalAmount: detentionAmount,
    },
    currency: demRule?.currency || 'VND',
  };
}

export async function handleLogisticsFreightTradeGeoRoutes(ctx: ApiContext): Promise<ApiResult | null> {
  const { method, path, query, body } = ctx;

  // --------------------------------------------------------------------------
  // 1. Dong Nai 2026 Geography Registry (/geography/*)
  // --------------------------------------------------------------------------
  if (path === '/geography/overview' && method === 'GET') {
    const data = await withPlatform(async (tx) => {
      const [units, aliases, facilities, corridors, restrictions, observations] = await Promise.all([
        tx.administrativeUnit.findMany({ where: { provinceCode: 'DONG_NAI_2026', isActive: true } }),
        tx.administrativeAlias.count(),
        tx.logisticsFacility.count(),
        tx.transportCorridor.count(),
        tx.roadRestriction.count(),
        tx.terminalQueueObservation.findMany({ include: { facility: true }, orderBy: { observedAt: 'desc' }, take: 10 }),
      ]);
      const wards = units.filter((u) => u.unitType === 'WARD').length;
      const communes = units.filter((u) => u.unitType === 'COMMUNE').length;
      const pendingCodes = units.filter((u) => u.officialCodeStatus === 'PENDING_OFFICIAL_CODE').length;
      const noPolygon = units.filter((u) => u.boundaryStatus === 'NO_OFFICIAL_POLYGON').length;
      return {
        provinceCode: 'DONG_NAI_2026',
        provinceName: 'Thành phố Đồng Nai',
        totalUnits: units.length,
        wardCount: wards,
        communeCount: communes,
        wardsCount: wards,
        communesCount: communes,
        aliasesCount: aliases,
        facilitiesCount: facilities,
        corridorsCount: corridors,
        restrictionsCount: restrictions,
        pendingOfficialCodeCount: pendingCodes,
        noOfficialPolygonCount: noPolygon,
        syntheticDisclaimer: 'Mã đơn vị chính thức (officialCodeStatus) và đa giác ranh giới (NO_OFFICIAL_POLYGON) giữ trạng thái chờ công bố chính thức; không tự bịa số liệu.',
        latestObservations: observations.map((o) => ({
          id: o.id,
          facilityCode: o.facility.code,
          facilityName: o.facility.name,
          waitMinutes: o.waitMinutes,
          queueLength: o.queueLength,
          sourceLabel: o.sourceLabel,
          isOfficialTelemetry: o.isOfficialTelemetry,
          observedAt: iso(o.observedAt),
        })),
      };
    });
    return { status: 200, body: data };
  }

  if (path === '/geography/units' && method === 'GET') {
    const corridor = query.get('corridor')?.trim().toUpperCase();
    const q = query.get('q')?.trim() || query.get('search')?.trim();
    const limit = Math.min(200, Math.max(1, Number(query.get('limit') || 95)));
    const rows = await withPlatform(async (tx) =>
      tx.administrativeUnit.findMany({
        where: {
          provinceCode: 'DONG_NAI_2026',
          isActive: true,
          ...(corridor && corridor !== 'ALL' ? { corridor } : {}),
          ...(q ? { OR: [{ canonicalName: { contains: q, mode: 'insensitive' } }, { normalizedName: { contains: q.toUpperCase() } }] } : {}),
        },
        include: { aliases: true },
        orderBy: [{ unitType: 'asc' }, { canonicalName: 'asc' }],
        take: limit,
      }),
    );
    return { status: 200, body: { data: rows, meta: { total: rows.length } } };
  }

  if (path === '/geography/units/resolve' && method === 'GET') {
    const rawName = query.get('q') || query.get('name') || '';
    const norm = normalizeVietnameseAdminName(rawName);
    const aliasKey = normalizeVietnameseAliasKey(rawName);
    const match = await withPlatform(async (tx) => {
      const direct = await tx.administrativeUnit.findFirst({
        where: { normalizedName: norm },
        include: { aliases: true },
      });
      if (direct) return { matchedBy: 'CANONICAL', unit: direct };
      const alias = await tx.administrativeAlias.findFirst({
        where: { OR: [{ normalizedAlias: aliasKey }, { normalizedAlias: norm }] },
        include: { unit: true },
      });
      if (alias) return { matchedBy: `ALIAS:${alias.aliasType}`, unit: alias.unit, aliasName: alias.aliasName };
      return null;
    });
    return { status: 200, body: match || { matchedBy: 'NONE', unit: null } };
  }

  if (path === '/geography/facilities' && method === 'GET') {
    const rows = await withPlatform(async (tx) =>
      tx.logisticsFacility.findMany({
        include: {
          administrativeUnit: true,
          queueObservations: { orderBy: { observedAt: 'desc' }, take: 1 },
        },
        orderBy: { name: 'asc' },
      }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((f) => ({
          ...f,
          lat: num(f.lat),
          lng: num(f.lng),
          latestQueue: f.queueObservations[0] || null,
        })),
        meta: { total: rows.length },
      },
    };
  }

  const facObsMatch = path.match(/^\/geography\/facilities\/([^/]+)\/queue-observations$/);
  if (method === 'POST' && facObsMatch) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const facId = facObsMatch[1];
    const created = await withPlatform(async (tx) =>
      tx.terminalQueueObservation.create({
        data: {
          facilityId: facId,
          waitMinutes: Number(body?.waitMinutes || 35),
          queueLength: Number(body?.queueLength || 12),
          sourceLabel: 'SYNTHETIC_DEMO',
          isOfficialTelemetry: false,
          notes: String(body?.notes || 'Quan trắc mô phỏng qua Demo Portal'),
        },
      }),
    );
    return { status: 201, body: created };
  }

  if (path === '/geography/corridors' && method === 'GET') {
    const rows = await withPlatform(async (tx) =>
      tx.transportCorridor.findMany({ include: { originFacility: true, destFacility: true, roadRestrictions: true } }),
    );
    return {
      status: 200,
      body: { data: rows.map((c) => ({ ...c, restrictions: c.roadRestrictions, nominalKm: num(c.nominalKm) })), meta: { total: rows.length } },
    };
  }

  if (path === '/geography/restrictions' && method === 'GET') {
    const rows = await withPlatform(async (tx) => tx.roadRestriction.findMany({ include: { corridor: true, facility: true } }));
    return { status: 200, body: { data: rows.map((r) => ({ ...r, maxTonnageTons: num(r.maxTonnageTons), maxHeightM: num(r.maxHeightM) })), meta: { total: rows.length } } };
  }

  if (method === 'POST' && path === '/geography/admin/units/bootstrap-2026') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (ctx.session!.role !== 'SUPER_ADMIN') {
      return { status: 403, body: { code: 'FORBIDDEN_ROLE', message: 'Chỉ Super Admin được bootstrap danh mục hành chính.' } };
    }
    const result = await withPlatform(async (tx) => {
      let upserted = 0;
      const unitIdMap = new Map<string, string>();
      for (const u of DONG_NAI_2026_UNITS) {
        const rec = await tx.administrativeUnit.upsert({
          where: {
            provinceCode_unitType_normalizedName: {
              provinceCode: 'DONG_NAI_2026',
              unitType: u.unitType,
              normalizedName: u.normalizedName,
            },
          },
          update: { canonicalName: u.canonicalName, corridor: u.corridor },
          create: {
            canonicalName: u.canonicalName,
            normalizedName: u.normalizedName,
            unitType: u.unitType,
            provinceName: 'Thành phố Đồng Nai',
            provinceCode: 'DONG_NAI_2026',
            corridor: u.corridor,
            officialCodeStatus: 'PENDING_OFFICIAL_CODE',
            boundaryStatus: 'NO_OFFICIAL_POLYGON',
            sourceDoc: u.sourceDoc,
          },
        });
        unitIdMap.set(`${u.unitType}:${u.normalizedName}`, rec.id);
        upserted++;
      }
      for (const al of DONG_NAI_PRE_2025_ALIASES) {
        const unitId = unitIdMap.get(`${al.unitType}:${al.unitNormalizedName}`);
        if (!unitId) continue;
        const normalizedAlias = normalizeVietnameseAliasKey(al.aliasName);
        await tx.administrativeAlias.upsert({
          where: { unitId_normalizedAlias: { unitId, normalizedAlias } },
          update: { aliasName: al.aliasName },
          create: { unitId, aliasName: al.aliasName, normalizedAlias, aliasType: al.aliasType, sourceDoc: 'PRE_2025_REFERENCE' },
        });
      }
      return {
        upserted,
        upsertedUnits: upserted,
        aliasesCount: DONG_NAI_PRE_2025_ALIASES.length,
        upsertedAliases: DONG_NAI_PRE_2025_ALIASES.length,
      };
    });
    return { status: 200, body: { ok: true, ...result } };
  }

  const unitOfficialMatch = path.match(/^\/geography\/admin\/units\/([^/]+)\/official$/);
  if (method === 'PATCH' && unitOfficialMatch) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (ctx.session!.role !== 'SUPER_ADMIN') return { status: 403, body: { message: 'Chỉ Super Admin được cập nhật mã hành chính.' } };
    const updated = await withPlatform(async (tx) =>
      tx.administrativeUnit.update({
        where: { id: unitOfficialMatch[1] },
        data: {
          officialCode: body?.officialCode ? String(body.officialCode) : null,
          officialCodeStatus: body?.officialCode ? 'OFFICIAL_VERIFIED' : 'PENDING_OFFICIAL_CODE',
          ...(body?.geometryGeoJson ? { boundaryStatus: 'OFFICIAL_GIS_POLYGON' } : {}),
          sourceDoc: String(body?.sourceDoc || 'QĐ hành chính cập nhật'),
        },
      }),
    );
    return { status: 200, body: updated };
  }

  // --------------------------------------------------------------------------
  // 2. Freight & Container Dispatch (/freight/*)
  // --------------------------------------------------------------------------
  if (path.startsWith('/freight/')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);

    if (method === 'GET' && path === '/freight/summary') {
      const sum = await withTenant(tid, async (tx) => {
        const [rfqs, quotes, bookings, shipments, containers, tractors, chassis, assignments] = await Promise.all([
          tx.freightRFQ.count(),
          tx.freightQuote.count(),
          tx.freightBooking.count(),
          tx.freightShipment.count(),
          tx.containerEquipment.count(),
          tx.tractorUnit.count(),
          tx.chassisUnit.count(),
          tx.equipmentAssignment.count({ where: { status: 'ACTIVE' } }),
        ]);
        return { rfqs, quotes, bookings, shipments, containers, tractors, chassis, activeAssignments: assignments };
      });
      return { status: 200, body: sum };
    }

    if (path === '/freight/rfqs') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) =>
          tx.freightRFQ.findMany({ include: { client: true, quotes: true }, orderBy: { createdAt: 'desc' } }),
        );
        return {
          status: 200,
          body: { data: rows.map((r) => ({ ...r, clientName: r.client?.name, weightKg: num(r.weightKg), volumeCbm: num(r.volumeCbm), createdAt: iso(r.createdAt) })), meta: { total: rows.length } },
        };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const created = await withTenant(tid, async (tx) => {
          const client = await tx.client.findFirst();
          return tx.freightRFQ.create({
            data: {
              tenantId: tid,
              clientId: body?.clientId || client?.id || null,
              rfqNumber: `RFQ-${Date.now().toString().slice(-6)}`,
              serviceMode: String(body?.serviceMode || 'FCL_EXPORT'),
              incoterm: String(body?.incoterm || 'FOB'),
              originName: String(body?.originName || 'KCN Amata, Phường Long Bình, Thành phố Đồng Nai'),
              destName: String(body?.destName || 'Cảng Cát Lái'),
              corridorTag: String(body?.corridorTag || 'SOUTH'),
              containerSize: String(body?.containerSize || '40HC'),
              containerQty: Number(body?.containerQty || 1),
              cargoDesc: String(body?.cargoDesc || 'Hàng xuất khẩu KCN Amata'),
              weightKg: num(body?.weightKg, 18000),
              volumeCbm: num(body?.volumeCbm, 50),
              status: 'SUBMITTED',
            },
          });
        });
        return { status: 201, body: created };
      }
    }

    if (path === '/freight/quotes') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) =>
          tx.freightQuote.findMany({ include: { rfq: true, client: true, lines: true }, orderBy: { createdAt: 'desc' } }),
        );
        return {
          status: 200,
          body: { data: rows.map((q) => ({ ...q, totalAmount: num(q.totalAmount), clientName: q.client?.name, rfqNumber: q.rfq?.rfqNumber, validUntil: iso(q.validUntil) })), meta: { total: rows.length } },
        };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const created = await withTenant(tid, async (tx) => {
          const rfq = body?.rfqId ? await tx.freightRFQ.findUnique({ where: { id: String(body.rfqId) } }) : await tx.freightRFQ.findFirst();
          const client = rfq?.clientId ? null : await tx.client.findFirst();
          const base = num(body?.baseAmount || body?.totalAmount, 5200000);
          const q = await tx.freightQuote.create({
            data: {
              tenantId: tid,
              rfqId: rfq?.id || null,
              clientId: rfq?.clientId || client?.id || null,
              quoteNumber: `QT-${Date.now().toString().slice(-6)}`,
              totalAmount: base,
              validUntil: new Date(Date.now() + 14 * 86400 * 1000),
              status: 'SENT',
            },
          });
          if (rfq) await tx.freightRFQ.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });
          return q;
        });
        return { status: 201, body: { ...created, totalAmount: num(created.totalAmount) } };
      }
    }

    const quoteAccept = path.match(/^\/freight\/quotes\/([^/]+)\/accept$/);
    if (method === 'POST' && quoteAccept) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const result = await withTenant(tid, async (tx) => {
        const q = await tx.freightQuote.findUnique({ where: { id: quoteAccept[1] }, include: { rfq: true } });
        if (!q) return null;
        await tx.freightQuote.update({ where: { id: q.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        if (q.rfqId) await tx.freightRFQ.update({ where: { id: q.rfqId }, data: { status: 'BOOKED' } });
        const existingBk = await tx.freightBooking.findFirst({ where: { quoteId: q.id } });
        if (existingBk) return { quote: q, booking: existingBk };
        const suffix = Date.now().toString().slice(-5);
        const bk = await tx.freightBooking.create({
          data: {
            tenantId: tid,
            bookingNo: `BK-${suffix}`,
            quoteId: q.id,
            clientId: q.clientId,
            serviceMode: q.rfq?.serviceMode || 'FCL_EXPORT',
            vesselName: 'ONE APUS V.118E',
            voyageNo: '118E',
            status: 'CONFIRMED',
            etd: new Date(Date.now() + 4 * 86400 * 1000),
          },
        });
        const shp = await tx.freightShipment.create({
          data: {
            tenantId: tid,
            shipmentNo: `SHP-${suffix}`,
            bookingId: bk.id,
            clientId: q.clientId,
            trackingCode: `SHP-TRK-${suffix}`,
            cargoDesc: q.rfq?.cargoDesc || 'FCL Container Export',
            grossWeightKg: q.rfq?.weightKg || 18500,
            volumeCbm: q.rfq?.volumeCbm || 52,
            status: 'BOOKED',
          },
        });
        await tx.freightLeg.create({
          data: {
            tenantId: tid,
            shipmentId: shp.id,
            sequence: 1,
            legType: 'FACTORY_TO_PORT',
            originName: q.rfq?.originName || 'KCN Amata, Đồng Nai',
            destName: q.rfq?.destName || 'Cảng Cát Lái',
            status: 'PLANNED',
          },
        });
        return { quote: q, booking: bk, shipment: shp };
      });
      if (!result) return { status: 404, body: { message: 'Không tìm thấy báo giá.' } };
      return { status: 200, body: { ok: true, ...result } };
    }

    if (method === 'GET' && path === '/freight/bookings') {
      const rows = await withTenant(tid, async (tx) =>
        tx.freightBooking.findMany({ include: { client: true, shipments: true, originFacility: true, destFacility: true }, orderBy: { createdAt: 'desc' } }),
      );
      return { status: 200, body: { data: rows.map((b) => ({ ...b, clientName: b.client?.name, etd: iso(b.etd), eta: iso(b.eta) })), meta: { total: rows.length } } };
    }

    if (method === 'GET' && path === '/freight/shipments') {
      const rows = await withTenant(tid, async (tx) =>
        tx.freightShipment.findMany({
          include: { booking: true, container: true, legs: { orderBy: { sequence: 'asc' } }, demRule: true, detRule: true, client: true },
          orderBy: { createdAt: 'desc' },
        }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((s) => ({
            ...s,
            grossWeightKg: num(s.grossWeightKg),
            volumeCbm: num(s.volumeCbm),
            demDet: calculateDemDetForShipment(s),
          })),
          meta: { total: rows.length },
        },
      };
    }

    if (method === 'GET' && path === '/freight/tractors') {
      const rows = await withTenant(tid, async (tx) => tx.tractorUnit.findMany({ orderBy: { unitCode: 'asc' } }));
      return { status: 200, body: { data: rows, meta: { total: rows.length } } };
    }

    if (method === 'GET' && path === '/freight/chassis') {
      const rows = await withTenant(tid, async (tx) => tx.chassisUnit.findMany({ orderBy: { chassisCode: 'asc' } }));
      return { status: 200, body: { data: rows, meta: { total: rows.length } } };
    }

    if (path === '/freight/containers') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) => tx.containerEquipment.findMany({ orderBy: { containerNo: 'asc' } }));
        return { status: 200, body: { data: rows.map((c) => ({ ...c, reeferTempC: c.reeferTempC !== null ? num(c.reeferTempC) : null })), meta: { total: rows.length } } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const containerNo = String(body?.containerNo || '').trim().toUpperCase();
        if (!ISO_6346_RE.test(containerNo)) {
          return { status: 400, body: { code: 'INVALID_ISO_6346', message: `Số container "${containerNo}" không đúng chuẩn ISO 6346 (4 chữ cái + 7 chữ số, VD: MSCU1234567).` } };
        }
        const created = await withTenant(tid, async (tx) =>
          tx.containerEquipment.create({
            data: {
              tenantId: tid,
              containerNo,
              sizeType: String(body?.sizeType || '40HC'),
              isoCode: String(body?.isoCode || '45G1'),
              status: 'EMPTY_AT_DEPOT',
            },
          }),
        );
        return { status: 201, body: created };
      }
    }

    if (path === '/freight/assignments') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) =>
          tx.equipmentAssignment.findMany({
            include: { tractor: true, chassis: true, container: true, booking: true, freightLeg: true },
            orderBy: { startAt: 'desc' },
          }),
        );
        return { status: 200, body: { data: rows.map((a) => ({ ...a, startAt: iso(a.startAt), endAt: iso(a.endAt) })), meta: { total: rows.length } } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const startAt = body?.startAt ? new Date(body.startAt) : new Date();
        const endAt = body?.endAt ? new Date(body.endAt) : new Date(startAt.getTime() + 12 * 3600 * 1000);
        const tractorId = body?.tractorId ? String(body.tractorId) : null;
        const chassisId = body?.chassisId ? String(body.chassisId) : null;
        const containerId = body?.containerId ? String(body.containerId) : null;

        const overlap = await withTenant(tid, async (tx) => {
          if (Boolean(body?.simulateConflict)) {
            const existing = await tx.equipmentAssignment.findFirst({
              where: { status: 'ACTIVE' },
              include: { tractor: true, chassis: true, container: true },
            });
            if (existing) return { conflict: existing };
            return {
              conflict: {
                id: 'sim-conflict',
                startAt,
                endAt,
                tractor: { unitCode: 'TRC-DN3PL-01' },
                chassis: null,
                container: null,
              },
            };
          }
          const conflicts = await tx.equipmentAssignment.findMany({
            where: {
              status: 'ACTIVE',
              startAt: { lt: endAt },
              endAt: { gt: startAt },
              OR: [
                ...(tractorId ? [{ tractorId }] : []),
                ...(chassisId ? [{ chassisId }] : []),
                ...(containerId ? [{ containerId }] : []),
              ],
            },
            include: { tractor: true, chassis: true, container: true },
          });
          if (conflicts.length > 0) return { conflict: conflicts[0] };

          const created = await tx.equipmentAssignment.create({
            data: {
              tenantId: tid,
              tractorId,
              chassisId,
              containerId,
              driverId: body?.driverId || null,
              freightLegId: body?.freightLegId || null,
              bookingId: body?.bookingId || null,
              status: 'ACTIVE',
              startAt,
              endAt,
              notes: body?.notes ? String(body.notes) : 'Phân công trực tiếp từ Bảng điều phối Container',
            },
            include: { tractor: true, chassis: true, container: true },
          });
          return { created };
        });

        if ('conflict' in overlap && overlap.conflict) {
          const c = overlap.conflict;
          return {
            status: 409,
            body: {
              code: 'EQUIPMENT_ASSIGNMENT_CONFLICT',
              message: `Xung đột trùng lịch (409 Conflict): thiết bị ${c.tractor?.unitCode || c.chassis?.chassisCode || c.container?.containerNo || ''} đã được gán trong khung giờ ${c.startAt.toISOString()} — ${c.endAt.toISOString()}.`,
              conflictingAssignmentId: c.id,
            },
          };
        }
        return { status: 201, body: overlap.created };
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. Yard Gate-In / Gate-Out & EIR (/yard/*)
  // --------------------------------------------------------------------------
  if (path.startsWith('/yard/')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);

    if (method === 'GET' && path === '/yard/yards') {
      const rows = await withTenant(tid, async (tx) =>
        tx.yard.findMany({ include: { slots: true, _count: { select: { gateEvents: true, eirs: true } } } }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((y) => ({
            ...y,
            occupiedSlots: y.slots.filter((s) => s.status === 'OCCUPIED').length,
          })),
          meta: { total: rows.length },
        },
      };
    }

    const yardSlotsMatch = path.match(/^\/yard\/yards\/([^/]+)\/slots$/);
    if (method === 'GET' && yardSlotsMatch) {
      const rows = await withTenant(tid, async (tx) =>
        tx.yardSlot.findMany({ where: { yardId: yardSlotsMatch[1] }, include: { container: true }, orderBy: { slotCode: 'asc' } }),
      );
      return { status: 200, body: { data: rows, meta: { total: rows.length } } };
    }

    if (path === '/yard/gate-events') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) =>
          tx.containerGateEvent.findMany({
            include: { yard: true, yardSlot: true, container: true, tractor: true, chassis: true, eir: true },
            orderBy: { occurredAt: 'desc' },
          }),
        );
        return { status: 200, body: { data: rows.map((g) => ({ ...g, occurredAt: iso(g.occurredAt) })), meta: { total: rows.length } } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const eventType = String(body?.eventType || 'GATE_IN').toUpperCase();
        const condition = body?.damageFound ? 'DAMAGED' : String(body?.condition || 'GOOD').toUpperCase();
        const res = await withTenant(tid, async (tx) => {
          const yard = body?.yardId ? await tx.yard.findUnique({ where: { id: String(body.yardId) } }) : await tx.yard.findFirst();
          const container = body?.containerId
            ? await tx.containerEquipment.findUnique({ where: { id: String(body.containerId) } })
            : body?.containerNo
              ? (await tx.containerEquipment.findFirst({ where: { containerNo: String(body.containerNo).toUpperCase() } })) ||
                (await tx.containerEquipment.findFirst())
              : await tx.containerEquipment.findFirst();
          const slot = body?.yardSlotId
            ? await tx.yardSlot.findUnique({ where: { id: String(body.yardSlotId) } })
            : await tx.yardSlot.findFirst({ where: { yardId: yard!.id, status: eventType === 'GATE_IN' ? 'EMPTY' : 'OCCUPIED' } });

          const ge = await tx.containerGateEvent.create({
            data: {
              tenantId: tid,
              yardId: yard!.id,
              yardSlotId: slot?.id || null,
              containerId: container!.id,
              tractorId: body?.tractorId || null,
              chassisId: body?.chassisId || null,
              eventType,
              loadState: String(body?.loadState || 'EMPTY'),
              sealNo: body?.sealNo || null,
              operatorId: ctx.session!.sub,
              notes: body?.notes ? String(body.notes) : `Cập nhật ${eventType} từ Portal Bãi Container`,
            },
          });

          if (slot) {
            await tx.yardSlot.update({
              where: { id: slot.id },
              data: {
                status: eventType === 'GATE_IN' ? 'OCCUPIED' : 'EMPTY',
                containerId: eventType === 'GATE_IN' ? container!.id : null,
              },
            });
          }

          await tx.containerEquipment.update({
            where: { id: container!.id },
            data: {
              status: eventType === 'GATE_IN' ? 'EMPTY_AT_DEPOT' : 'LADEN_IN_TRANSIT',
              ...(body?.sealNo ? { currentSealNo: String(body.sealNo) } : {}),
            },
          });

          const eir = await tx.equipmentInterchangeReceipt.create({
            data: {
              tenantId: tid,
              eirNumber: `EIR-${Date.now().toString().slice(-6)}`,
              gateEventId: ge.id,
              yardId: yard!.id,
              containerId: container!.id,
              tractorId: body?.tractorId || null,
              chassisId: body?.chassisId || null,
              direction: eventType === 'GATE_IN' ? 'IN' : 'OUT',
              loadState: String(body?.loadState || 'EMPTY'),
              sealNo: body?.sealNo || null,
              condition,
              damageNotes: body?.damageNotes ? String(body.damageNotes) : condition === 'DAMAGED' ? 'Trầy xước/móp vách container khi giám định' : null,
              driverName: String(body?.driverName || 'Nguyễn Văn An'),
              inspectorName: ctx.session!.fullName,
            },
          });
          return { gateEvent: ge, eir };
        });
        await appendSimulationEvent(null, {
          sandboxKey: ctx.session!.sandboxKey,
          tenantId: tid,
          category: 'YARD',
          eventType,
          summary: `${eventType} container -> phát hành EIR ${res.eir.eirNumber} (${condition})`,
        });
        return { status: 201, body: res };
      }
    }

    if (method === 'GET' && path === '/yard/eirs') {
      const rows = await withTenant(tid, async (tx) =>
        tx.equipmentInterchangeReceipt.findMany({ include: { container: true, yard: true }, orderBy: { issuedAt: 'desc' } }),
      );
      return { status: 200, body: { data: rows.map((e) => ({ ...e, issuedAt: iso(e.issuedAt) })), meta: { total: rows.length } } };
    }
  }

  // --------------------------------------------------------------------------
  // 4. Trade XNK & Customs Review Gate (/trade/*)
  // --------------------------------------------------------------------------
  if (path.startsWith('/trade/')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);

    if (path === '/trade/documents') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) =>
          tx.tradeDocument.findMany({
            include: { booking: true, shipment: true, versions: true, hsSuggestions: true },
            orderBy: { createdAt: 'desc' },
          }),
        );
        return { status: 200, body: { data: rows.map((d) => ({ ...d, createdAt: iso(d.createdAt) })), meta: { total: rows.length } } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const fileName = String(body?.fileName || 'Document.pdf');
        const simFail = String(body?.simulateFailure || '').toUpperCase();
        if (
          simFail === 'PASSWORD_PROTECTED' ||
          Boolean(body?.passwordProtected) ||
          fileName.toLowerCase().includes('locked') ||
          fileName.toLowerCase().includes('password')
        ) {
          return {
            status: 422,
            body: {
              code: 'PASSWORD_PROTECTED',
              message: `Tệp chứng từ "${fileName}" đang đặt mật khẩu bảo vệ (422 PASSWORD_PROTECTED). Vui lòng mở khóa trước khi tải lên.`,
            },
          };
        }
        if (simFail === 'CORRUPTED') {
          return {
            status: 422,
            body: {
              code: 'CORRUPTED_FILE',
              message: `Tệp chứng từ "${fileName}" bị lỗi cấu trúc PDF (422 CORRUPTED_FILE). Không thể trích xuất OCR/JSON.`,
            },
          };
        }
        const created = await withTenant(tid, async (tx) => {
          const bk = body?.bookingId ? await tx.freightBooking.findUnique({ where: { id: String(body.bookingId) } }) : await tx.freightBooking.findFirst();
          const doc = await tx.tradeDocument.create({
            data: {
              tenantId: tid,
              bookingId: bk?.id || null,
              clientId: bk?.clientId || null,
              docType: String(body?.docType || 'COMMERCIAL_INVOICE'),
              docNumber: String(body?.docNumber || `DOC-${Date.now().toString().slice(-6)}`),
              fileName,
              status: 'VERIFIED',
              extractionStatus: 'SUCCEEDED',
              extractedJson: body?.extractedJson || { grossWeightKg: Number(body?.grossWeightKg || 21200), packageCount: Number(body?.packageCount || 48) },
            },
          });
          await tx.tradeDocumentVersion.create({
            data: { tenantId: tid, documentId: doc.id, versionNo: 1, fileName, uploadedBy: ctx.session!.sub, note: 'Uploaded via Portal' },
          });
          return doc;
        });
        return { status: 201, body: created };
      }
    }

    const reconcileMatch = path.match(/^\/trade\/bookings\/([^/]+)\/reconcile$/);
    if (method === 'POST' && reconcileMatch) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const bkId = reconcileMatch[1];
      const res = await withTenant(tid, async (tx) => {
        const docs = await tx.tradeDocument.findMany({ where: { bookingId: bkId } });
        const ci = docs.find((d) => d.docType === 'COMMERCIAL_INVOICE');
        const pl = docs.find((d) => d.docType === 'PACKING_LIST');
        const ciJson = (ci?.extractedJson as any) || {};
        const plJson = (pl?.extractedJson as any) || {};
        const ciW = num(ciJson.grossWeightKg, 0);
        const plW = num(plJson.grossWeightKg, 0);
        const ciPkg = num(ciJson.packageCount, 0);
        const plPkg = num(plJson.packageCount, 0);
        const discrepancies: Array<{
          severity: string;
          field: string;
          sourceA: string;
          valueA: number;
          sourceB: string;
          valueB: number;
        }> = [];
        if (ci && pl && ciW !== plW) {
          discrepancies.push({
            severity: 'HIGH',
            field: 'grossWeightKg',
            sourceA: 'CI',
            valueA: ciW,
            sourceB: 'PL',
            valueB: plW,
          });
        }
        if (ci && pl && ciPkg > 0 && plPkg > 0 && ciPkg !== plPkg) {
          discrepancies.push({
            severity: 'MEDIUM',
            field: 'packageCount',
            sourceA: 'CI',
            valueA: ciPkg,
            sourceB: 'PL',
            valueB: plPkg,
          });
        }
        return {
          bookingId: bkId,
          documentsChecked: docs.length,
          status: discrepancies.length > 0 ? 'MISMATCH_FOUND' : 'RECONCILED',
          discrepancyCount: discrepancies.length,
          discrepancies,
          ciWeightKg: ciW,
          plWeightKg: plW,
        };
      });
      return { status: 200, body: res };
    }

    if (path === '/trade/declarations') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) =>
          tx.customsDeclaration.findMany({
            include: { booking: true, events: { orderBy: { occurredAt: 'desc' } }, hsSuggestions: true },
            orderBy: { createdAt: 'desc' },
          }),
        );
        return { status: 200, body: { data: rows.map((d) => ({ ...d, createdAt: iso(d.createdAt) })), meta: { total: rows.length } } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const created = await withTenant(tid, async (tx) => {
          const bk = await tx.freightBooking.findFirst();
          const decl = await tx.customsDeclaration.create({
            data: {
              tenantId: tid,
              declarationNo: String(body?.declarationNo || `3069${Date.now().toString().slice(-6)}`),
              bookingId: body?.bookingId || bk?.id || null,
              direction: String(body?.direction || 'EXPORT'),
              channel: String(body?.channel || 'YELLOW'),
              portCode: String(body?.portCode || 'VNSGN'),
              hsReviewRequired: true,
              status: 'NEEDS_CUSTOMS_REVIEW',
              notes: body?.notes || 'Tạo tờ khai nháp chờ duyệt HS',
            },
          });
          await tx.hSCodeSuggestion.create({
            data: {
              tenantId: tid,
              declarationId: decl.id,
              itemDescription: String(body?.itemDescription || 'Electronic Assembly Module'),
              suggestedHsCode: String(body?.suggestedHsCode || '85423100'),
              confidence: 0.78,
              advisoryOnly: true,
              status: 'NEEDS_CUSTOMS_REVIEW',
              sourceMethod: 'rule_fallback',
            },
          });
          return decl;
        });
        return { status: 201, body: created };
      }
    }

    const declSubmitMatch = path.match(/^\/trade\/declarations\/([^/]+)\/submit$/);
    if (method === 'POST' && declSubmitMatch) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const declId = declSubmitMatch[1];
      const res = await withTenant(tid, async (tx) => {
        const decl = await tx.customsDeclaration.findUnique({ where: { id: declId }, include: { hsSuggestions: true } });
        if (!decl) return { status: 404, body: { message: 'Không tìm thấy tờ khai hải quan.' } };
        const unapprovedHs = decl.hsSuggestions.some((h) => h.status !== 'APPROVED');
        if (decl.hsReviewRequired || decl.status === 'NEEDS_CUSTOMS_REVIEW' || unapprovedHs) {
          return {
            status: 409,
            body: {
              code: 'HS_REVIEW_REQUIRED',
              message: 'Chặn truyền tờ khai (409 HS_REVIEW_REQUIRED): Cán bộ XNK bắt buộc phải kiểm tra và phê duyệt mã HS tham khảo trước khi truyền VNACCS.',
            },
          };
        }
        if (decl.channel === 'RED' && decl.status === 'HOLD' && !body?.inspectionCleared) {
          return {
            status: 409,
            body: {
              code: 'RED_CHANNEL_HOLD',
              message: 'Tờ khai đang bị tạm giữ phân luồng ĐỎ (RED_CHANNEL_HOLD) chờ hoàn tất kiểm hóa thực tế.',
            },
          };
        }
        const updated = await tx.customsDeclaration.update({
          where: { id: decl.id },
          data: { status: 'CLEARED', submittedAt: new Date(), clearedAt: new Date() },
        });
        await tx.customsStatusEvent.create({
          data: {
            tenantId: tid,
            declarationId: decl.id,
            status: 'CLEARED',
            channel: decl.channel,
            message: '[SIMULATED VNACCS] Đã truyền & thông quan sau khi hoàn tất duyệt mã HS.',
            actorId: ctx.session!.sub,
          },
        });
        return { status: 200, body: { ok: true, simulated: true, declaration: updated } };
      });
      return res;
    }

    if (path === '/trade/hs-suggestions' && method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const itemDescription = String(body?.itemDescription || 'Electronic PCB');
      const suggestedHsCode = itemDescription.toLowerCase().includes('agro') || itemDescription.toLowerCase().includes('fruit') ? '08109090' : '85423100';
      const created = await withTenant(tid, async (tx) =>
        tx.hSCodeSuggestion.create({
          data: {
            tenantId: tid,
            declarationId: body?.declarationId || null,
            documentId: body?.documentId || null,
            itemDescription,
            suggestedHsCode,
            confidence: 0.78,
            advisoryOnly: true,
            status: 'NEEDS_CUSTOMS_REVIEW',
            sourceMethod: 'rule_fallback',
          },
        }),
      );
      return { status: 201, body: { ...created, confidence: num(created.confidence) } };
    }

    const hsReview = path.match(/^\/trade\/hs-suggestions\/([^/]+)\/review$/);
    if (method === 'POST' && hsReview) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const hs = await withTenant(tid, async (tx) => {
        const h = await tx.hSCodeSuggestion.update({
          where: { id: hsReview[1] },
          data: {
            status: String(body?.decision || 'APPROVED').toUpperCase(),
            approvedHsCode: String(body?.approvedHsCode || body?.hsCode || '85423100'),
            reviewedBy: ctx.session!.sub,
            reviewedAt: new Date(),
            reviewNote: body?.reviewNote ? String(body.reviewNote) : 'Đã duyệt bởi chuyên viên XNK',
          },
        });
        if (h.declarationId && h.status === 'APPROVED') {
          await tx.customsDeclaration.update({
            where: { id: h.declarationId },
            data: { hsReviewRequired: false, status: 'READY_TO_SUBMIT' },
          });
        }
        return h;
      });
      return { status: 200, body: hs };
    }
  }

  // --------------------------------------------------------------------------
  // 5. Pricing, DEM/DET, Finance & Bank Reconciliation (/pricing/*, /finance/*)
  // --------------------------------------------------------------------------
  if (method === 'POST' && path === '/pricing/estimate') {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const tid = getTenantId(ctx);
    const weightKg = num(body?.weightKg, 10);
    const codAmount = num(body?.codAmount, 0);
    const corridor = String(body?.corridor || body?.corridorTag || 'CENTRAL').toUpperCase();
    const serviceLevel = String(body?.serviceLevel || 'STANDARD').toUpperCase();

    const rate = await withTenant(tid, async (tx) =>
      tx.contractRate.findFirst({ where: { status: 'ACTIVE' }, include: { surcharges: true } }),
    );
    const baseFee = corridor === 'NORTH' ? 48000 : corridor === 'SOUTH' ? 42000 : 35000;
    const weightSurcharge = Math.max(0, Math.ceil(weightKg - 2)) * 4500;
    const expressMult = serviceLevel === 'EXPRESS' ? 1.35 : serviceLevel === 'SAME_DAY' ? 1.65 : 1.0;
    const codFee = codAmount > 0 ? Math.max(15000, Math.round(codAmount * 0.008)) : 0;
    const totalEstimate = Math.round((baseFee + weightSurcharge) * expressMult + codFee);

    return {
      status: 200,
      body: {
        totalEstimate,
        currency: 'VND',
        breakdown: {
          baseFee,
          weightSurcharge,
          serviceMultiplier: expressMult,
          codCollectionFee: codFee,
        },
        matchedContract: rate ? { code: rate.contractCode, baseContainerRate: num(rate.baseRate) } : null,
        formula: `(${baseFee} + max(0, ceil(${weightKg}-2))*4500) * ${expressMult} + COD(0.8%)`,
      },
    };
  }

  if (path.startsWith('/pricing/')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);

    if (method === 'GET' && path === '/pricing/contracts') {
      const rows = await withTenant(tid, async (tx) => tx.contractRate.findMany({ include: { surcharges: true, client: true } }));
      return { status: 200, body: { data: rows.map((r) => ({ ...r, baseRate: num(r.baseRate), clientName: r.client?.name })) } };
    }
    if (method === 'GET' && path === '/pricing/dem-det-rules') {
      const rows = await withTenant(tid, async (tx) => tx.demDetRule.findMany());
      return { status: 200, body: { data: rows.map((r) => ({ ...r, dailyRateTier1: num(r.dailyRateTier1), dailyRateTier2: num(r.dailyRateTier2) })) } };
    }
    const demDetMatch = path.match(/^\/pricing\/shipments\/([^/]+)\/dem-det$/);
    if (method === 'GET' && demDetMatch) {
      const shp = await withTenant(tid, async (tx) =>
        tx.freightShipment.findUnique({ where: { id: demDetMatch[1] }, include: { demRule: true, detRule: true } }),
      );
      if (!shp) return { status: 404, body: { message: 'Không tìm thấy shipment.' } };
      return { status: 200, body: calculateDemDetForShipment(shp) };
    }
    if (method === 'GET' && path === '/pricing/invoices') {
      const rows = await withTenant(tid, async (tx) =>
        tx.freightInvoice.findMany({ include: { client: true, ledgerEntries: true, allocations: true }, orderBy: { createdAt: 'desc' } }),
      );
      return { status: 200, body: { data: rows.map((i) => ({ ...i, totalAmount: num(i.totalAmount), paidAmount: num(i.paidAmount), subtotal: num(i.subtotal), taxAmount: num(i.taxAmount), dueDate: iso(i.dueAt), clientName: i.client?.name })) } };
    }
    const payInv = path.match(/^\/pricing\/invoices\/([^/]+)\/payments$/);
    if (method === 'POST' && payInv) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const amt = num(body?.amount, 0);
      const updated = await withTenant(tid, async (tx) => {
        const inv = await tx.freightInvoice.findUnique({ where: { id: payInv[1] } });
        if (!inv) return null;
        await tx.paymentAllocation.create({
          data: { tenantId: tid, invoiceId: inv.id, amount: amt, reference: String(body?.reference || `PAY-${Date.now().toString().slice(-5)}`), method: String(body?.method || 'BANK_TRANSFER'), allocatedBy: ctx.session!.sub, status: 'POSTED' },
        });
        const nextPaid = num(inv.paidAmount) + amt;
        return tx.freightInvoice.update({
          where: { id: inv.id },
          data: { paidAmount: nextPaid, status: nextPaid >= num(inv.totalAmount) ? 'PAID' : 'PARTIAL' },
        });
      });
      return updated ? { status: 200, body: updated } : { status: 404, body: { message: 'Không tìm thấy hóa đơn.' } };
    }
    if (method === 'GET' && path === '/pricing/disputes') {
      const rows = await withTenant(tid, async (tx) => tx.disputeCase.findMany({ include: { client: true, invoice: true }, orderBy: { createdAt: 'desc' } }));
      return { status: 200, body: { data: rows.map((d) => ({ ...d, claimedAmount: num(d.claimedAmount), approvedAmount: d.approvedAmount !== null ? num(d.approvedAmount) : null, clientName: d.client?.name })) } };
    }
    const dispResolve = path.match(/^\/pricing\/disputes\/([^/]+)\/resolve$/);
    if (method === 'PATCH' && dispResolve) {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const updated = await withTenant(tid, async (tx) =>
        tx.disputeCase.update({
          where: { id: dispResolve[1] },
          data: {
            status: String(body?.status || 'RESOLVED').toUpperCase(),
            approvedAmount: body?.approvedAmount !== undefined ? num(body.approvedAmount) : null,
            resolutionNotes: body?.resolutionNotes ? String(body.resolutionNotes) : 'Đã xử lý tranh chấp',
          },
        }),
      );
      return { status: 200, body: updated };
    }
  }

  if (path.startsWith('/finance/')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (path === '/finance/cod-remittances' && method === 'GET') {
      const rows = await withTenant(tid, async (tx) =>
        tx.codRemittance.findMany({ include: { driver: { include: { user: true } } }, orderBy: { createdAt: 'desc' } }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((r) => ({
            ...r,
            driverName: r.driver?.user?.fullName || 'Driver',
            totalCodCollected: num(r.totalCodCollected),
            totalExpensesDeducted: num(r.totalExpensesDeducted),
            amountRemitted: num(r.amountRemitted),
            createdAt: iso(r.createdAt),
          })),
        },
      };
    }
    const remOp = path.match(/^\/finance\/cod-remittances\/([^/]+)\/(reconcile|submit)$/);
    if (remOp && method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const updated = await withTenant(tid, async (tx) =>
        tx.codRemittance.update({
          where: { id: remOp[1] },
          data: { status: remOp[2] === 'reconcile' ? 'RECONCILED' : 'SUBMITTED' },
        }),
      );
      return { status: 200, body: updated };
    }
    if (path === '/finance/bank-transactions' && method === 'GET') {
      return {
        status: 200,
        body: {
          data: [
            { id: 'bnk-1', txRef: 'VCB-20261111-01', description: 'NOP COD REM-20261101', amount: 2850000, matchedQr: 'REM-20261101', status: 'MATCHED', txDate: '2026-11-11T08:30:00Z' },
            { id: 'bnk-2', txRef: 'VCB-20261111-02', description: 'NOP COD REM-20261102', amount: 4120000, matchedQr: 'REM-20261102', status: 'MATCHED', txDate: '2026-11-11T08:35:00Z' },
            { id: 'bnk-3', txRef: 'VCB-20261111-03', description: 'NOP COD REM-20261103', amount: 1950000, matchedQr: 'REM-20261103', status: 'MATCHED', txDate: '2026-11-11T08:40:00Z' },
            { id: 'bnk-4', txRef: 'VCB-20261111-99', description: 'CHUYEN KHOAN LA KHONG RO MA', amount: 680000, matchedQr: null, status: 'UNMATCHED', txDate: '2026-11-11T09:10:00Z' },
          ],
        },
      };
    }
    if (path === '/finance/expenses') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) => tx.driverExpense.findMany({ include: { driver: { include: { user: true } } }, orderBy: { createdAt: 'desc' } }));
        return { status: 200, body: { data: rows.map((e) => ({ ...e, driverName: e.driver?.user?.fullName || 'Driver', amount: num(e.amount), createdAt: iso(e.createdAt) })) } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const created = await withTenant(tid, async (tx) => {
          const drv = await tx.driver.findFirst();
          return tx.driverExpense.create({
            data: { tenantId: tid, driverId: drv!.id, amount: num(body?.amount, 150000), category: String(body?.category || 'FUEL'), note: String(body?.note || ''), status: 'PENDING' },
          });
        });
        return { status: 201, body: created };
      }
    }
    const expDecide = path.match(/^\/finance\/expenses\/([^/]+)\/decision$/);
    if (expDecide && method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const updated = await withTenant(tid, async (tx) => tx.driverExpense.update({ where: { id: expDecide[1] }, data: { status: String(body?.decision || 'APPROVED').toUpperCase() } }));
      return { status: 200, body: updated };
    }
    if (path === '/finance/invoices') {
      if (method === 'GET') {
        const rows = await withTenant(tid, async (tx) => tx.invoice.findMany({ include: { client: true }, orderBy: { issuedAt: 'desc' } }));
        return { status: 200, body: { data: rows.map((i) => ({ ...i, totalAmount: num(i.totalAmount), clientName: i.client?.name, dueAt: iso(i.dueAt) })) } };
      }
      if (method === 'POST') {
        const writeErr = assertWriteAllowed(ctx);
        if (writeErr) return writeErr;
        const created = await withTenant(tid, async (tx) => {
          const client = await tx.client.findFirst();
          return tx.invoice.create({
            data: { tenantId: tid, clientId: client!.id, invoiceNumber: `INV-${Date.now().toString().slice(-6)}`, totalAmount: num(body?.totalAmount, 5000000), status: 'PENDING', dueAt: new Date(Date.now() + 14 * 86400 * 1000) },
          });
        });
        return { status: 201, body: created };
      }
    }
    const finInvPay = path.match(/^\/finance\/invoices\/([^/]+)\/payments$/);
    if (finInvPay && method === 'POST') {
      const writeErr = assertWriteAllowed(ctx);
      if (writeErr) return writeErr;
      const updated = await withTenant(tid, async (tx) => {
        const inv = await tx.invoice.findUnique({ where: { id: finInvPay[1] } });
        if (!inv) return null;
        await tx.paymentTransaction.create({
          data: { tenantId: tid, invoiceId: inv.id, amount: num(body?.amount, num(inv.totalAmount)), method: 'BANK_TRANSFER', status: 'COMPLETED', transactionId: `TX-${Date.now()}` },
        });
        return tx.invoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: new Date() } });
      });
      return updated ? { status: 200, body: updated } : { status: 404, body: { message: 'Invoice not found' } };
    }
  }

  // --------------------------------------------------------------------------
  // 6. Logistics Fleet, Trips, Drivers, Geofences, SOS, Returns & Driver Sim
  // --------------------------------------------------------------------------
  if (path === '/logistics/shipments' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 20)));
    const rows = await withPlatform(async (tx) =>
      tx.delivery.findMany({
        where: { ...(ctx.session!.tenantId ? { tenantId: ctx.session!.tenantId } : {}), deletedAt: null },
        include: { order: true, trip: { include: { vehicle: true } }, driver: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((d) => ({
          id: d.id,
          trackingNumber: d.order?.trackingCode || `SHP-${d.id.slice(0, 6)}`,
          driver: d.driver?.user?.fullName || 'Nguyễn Văn An',
          vehicle: d.trip?.vehicle?.plateNumber || '60C-DN3PL01',
          origin: 'ICD Tân Cảng Long Bình',
          destination: d.deliveryAddress,
          status: d.status === 'DELIVERED' ? 'DELIVERED' : d.status === 'DELAYED' ? 'DELAYED' : 'IN_TRANSIT',
          progress: d.status === 'DELIVERED' ? 100 : 65,
          eta: iso(d.order?.estimatedDeliveryDate || new Date(Date.now() + 7200 * 1000)),
        })),
        meta: { total: rows.length },
      },
    };
  }

  if (path.startsWith('/logistics/trips')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET' && path === '/logistics/trips') {
      const rows = await withTenant(tid, async (tx) =>
        tx.trip.findMany({
          include: { driver: { include: { user: true } }, vehicle: true, stops: { include: { order: true } }, deliveries: true },
          orderBy: { createdAt: 'desc' },
        }),
      );
      return {
        status: 200,
        body: {
          data: rows.map((t) => ({
            ...t,
            code: t.tripCode,
            driverName: t.driver?.user?.fullName || 'Tài xế Demo',
            driverUserId: t.driver?.userId,
            vehiclePlate: t.vehicle?.plateNumber,
            totalWeightKg: num(t.totalWeightKg),
            totalVolumeCbm: num(t.totalVolumeCbm),
            estimatedDistanceKm: num(t.estimatedDistanceKm),
            actualDistanceKm: num(t.actualDistanceKm, num(t.estimatedDistanceKm)),
            codCollected: t.deliveries.reduce((s, d) => s + num(d.codAmountCollected), 0),
            createdAt: iso(t.createdAt),
            startedAt: iso(t.departureTime),
          })),
          meta: { total: rows.length },
        },
      };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (method === 'POST' && (path === '/logistics/trips' || path === '/logistics/trips/assign')) {
      const created = await withTenant(tid, async (tx) => {
        const veh = await tx.vehicle.findFirst();
        const drv = await tx.driver.findFirst();
        return tx.trip.create({
          data: {
            tenantId: tid,
            tripCode: `TRP-${Date.now().toString().slice(-6)}`,
            vehicleId: body?.vehicleId || veh!.id,
            driverId: body?.driverId || drv!.id,
            status: 'DISPATCHED',
            estimatedDistanceKm: 36.5,
            aiOptimized: true,
          },
        });
      });
      return { status: 201, body: { ...created, code: created.tripCode } };
    }
    const tripOp = path.match(/^\/logistics\/trips\/([^/]+)\/(start|complete|optimize|pod)$/);
    if (tripOp) {
      const [, tripId, op] = tripOp;
      if (op === 'pod' && method === 'GET') {
        const dels = await withTenant(tid, async (tx) => tx.delivery.findMany({ where: { tripId } }));
        return { status: 200, body: { data: dels } };
      }
      const nextStatus = op === 'start' ? 'IN_PROGRESS' : op === 'complete' ? 'COMPLETED' : undefined;
      const updated = await withTenant(tid, async (tx) =>
        tx.trip.update({
          where: { id: tripId },
          data: {
            ...(nextStatus ? { status: nextStatus } : {}),
            ...(op === 'start' ? { departureTime: new Date() } : {}),
            ...(op === 'complete' ? { returnTime: new Date(), actualDistanceKm: 42.3 } : {}),
            ...(op === 'optimize' ? { aiOptimized: true } : {}),
          },
        }),
      );
      return { status: 200, body: { ...updated, code: updated.tripCode } };
    }
    if (method === 'POST' && path === '/logistics/trips/pod') {
      const deliveryId = body?.deliveryId ? String(body.deliveryId) : undefined;
      const updated = await withTenant(tid, async (tx) => {
        const del = deliveryId ? await tx.delivery.findUnique({ where: { id: deliveryId } }) : await tx.delivery.findFirst();
        if (!del) return null;
        const d = await tx.delivery.update({
          where: { id: del.id },
          data: {
            status: String(body?.status || 'DELIVERED'),
            codAmountCollected: num(body?.codAmountCollected, num(del.codAmountExpected)),
            podSignatureUrl: body?.signatureDataUrl ? 'data:image/png;base64,demo-epod-signed' : del.podSignatureUrl,
          },
        });
        await tx.order.update({ where: { id: d.orderId }, data: { status: String(body?.status || 'DELIVERED'), actualDeliveryTime: new Date() } });
        return d;
      });
      return updated ? { status: 200, body: updated } : { status: 404, body: { message: 'Không tìm thấy điểm giao.' } };
    }
  }

  if (path === '/logistics/drivers' || path === '/logistics/drivers/ranking') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) =>
      tx.driver.findMany({ where: { deletedAt: null }, include: { user: true, _count: { select: { deliveries: true, trips: true } } } }),
    );
    return {
      status: 200,
      body: {
        data: rows.map((d, idx) => ({
          id: d.id,
          userId: d.userId,
          name: d.user?.fullName || `Tài xế #${idx + 1}`,
          email: d.user?.email,
          phone: d.user?.phone,
          licenseClass: d.licenseClass,
          status: d.status,
          deliveriesCount: d._count.deliveries,
          tripsCount: d._count.trips,
          onTimeScore: 96 - idx * 3,
        })),
      },
    };
  }

  const drvLog = path.match(/^\/logistics\/drivers\/([^/]+)\/trip-log$/);
  if (drvLog && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const logs = await withTenant(tid, async (tx) => tx.gpsTrackingLog.findMany({ where: { driverId: drvLog[1] }, orderBy: { timestamp: 'desc' }, take: 30 }));
    return { status: 200, body: { data: logs.map((l) => ({ ...l, lat: num(l.lat), lng: num(l.lng), speedKmh: num(l.speed), timestamp: iso(l.timestamp) })) } };
  }

  if (path === '/logistics/vehicles' || path === '/logistics/vehicles/fleet') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) => tx.vehicle.findMany({ where: { deletedAt: null } }));
    return { status: 200, body: { data: rows.map((v) => ({ ...v, capacityKg: num(v.capacityKg), capacityCbm: num(v.capacityCbm) })), meta: { total: rows.length } } };
  }

  if (path === '/logistics/vehicles/fuel' || path === '/logistics/vehicles/maintenance') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    return { status: 201, body: { ok: true, loggedAt: new Date().toISOString(), ...body } };
  }

  if (path === '/logistics/geofences') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const rows = await withPlatform(async (tx) =>
      tx.facilityGeofence.findMany({ include: { facility: true } }),
    );
    return { status: 200, body: { data: rows.map((g) => ({ ...g, lat: num(g.facility.lat), lng: num(g.facility.lng), facilityName: g.facility.name })) } };
  }

  if (path.startsWith('/logistics/sos')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET' && path === '/logistics/sos') {
      const rows = await withTenant(tid, async (tx) =>
        tx.sosAlert.findMany({ include: { driver: { include: { user: true } } }, orderBy: { createdAt: 'desc' } }),
      );
      return { status: 200, body: { data: rows.map((s) => ({ ...s, lat: 10.9478, lng: 106.8722, driverName: s.driver?.user?.fullName, createdAt: iso(s.createdAt) })) } };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    if (method === 'POST' && path === '/logistics/sos') {
      const created = await withTenant(tid, async (tx) => {
        const drv = await tx.driver.findFirst();
        return tx.sosAlert.create({
          data: { tenantId: tid, driverId: drv!.id, message: String(body?.message || 'Cảnh báo SOS từ tài xế'), status: 'ACTIVE' },
        });
      });
      await appendSimulationEvent(null, { sandboxKey: ctx.session!.sandboxKey, tenantId: tid, category: 'SOS', eventType: 'SOS_TRIGGERED', summary: created.message || 'Cảnh báo SOS từ tài xế' });
      return { status: 201, body: created };
    }
    const sosOp = path.match(/^\/logistics\/sos\/([^/]+)\/(acknowledge|resolve)$/);
    if (sosOp && method === 'POST') {
      const updated = await withTenant(tid, async (tx) =>
        tx.sosAlert.update({ where: { id: sosOp[1] }, data: { status: sosOp[2] === 'acknowledge' ? 'ACKNOWLEDGED' : 'RESOLVED' } }),
      );
      return { status: 200, body: updated };
    }
  }

  if (path.startsWith('/logistics/returns')) {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    if (method === 'GET' && path === '/logistics/returns') {
      const rows = await withTenant(tid, async (tx) =>
        tx.returnRequest.findMany({ include: { order: true, reason: true, items: true, refunds: true }, orderBy: { createdAt: 'desc' } }),
      );
      return { status: 200, body: { data: rows.map((r) => ({ ...r, trackingCode: r.order?.trackingCode, reasonCode: r.reason?.code, createdAt: iso(r.createdAt) })) } };
    }
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const retOp = path.match(/^\/logistics\/returns\/([^/]+)\/(inspect|refund)$/);
    if (retOp && method === 'POST') {
      const updated = await withTenant(tid, async (tx) =>
        tx.returnRequest.update({ where: { id: retOp[1] }, data: { status: retOp[2] === 'refund' ? 'REFUNDED' : 'INSPECTED' } }),
      );
      return { status: 200, body: updated };
    }
  }

  if (method === 'POST' && path === '/logistics/routing/optimize-async') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const job = await withTenant(tid, async (tx) =>
      tx.routeOptimizationJob.create({
        data: {
          tenantId: tid,
          status: 'COMPLETED',
          payload: JSON.stringify(body || {}),
          result: JSON.stringify({ distanceSource: 'haversine_circuity_1.41', estimatedKm: 34.2, corridor: 'SOUTH' }),
          completedAt: new Date(),
        },
      }),
    );
    return { status: 201, body: { ok: true, jobId: job.id, status: 'COMPLETED', distanceSource: 'haversine_circuity_1.41' } };
  }

  if (method === 'POST' && path === '/logistics/finance/ai/feedback') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    return { status: 201, body: { ok: true, recorded: true } };
  }

  // --------------------------------------------------------------------------
  // 7. Mobile Driver Simulator & GPS Telemetry (/mobile/*, /driver-app/*, /gps/batch)
  // --------------------------------------------------------------------------
  if (path === '/mobile/trips' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) =>
      tx.trip.findMany({
        include: { vehicle: true, driver: { include: { user: true } }, deliveries: { include: { order: true } } },
        orderBy: [{ createdAt: 'desc' }, { tripCode: 'asc' }],
      }),
    );
    const ordered = [...rows].sort((a, b) => {
      const aHasDel = a.deliveries.length > 0 ? 1 : 0;
      const bHasDel = b.deliveries.length > 0 ? 1 : 0;
      return bHasDel - aHasDel;
    });
    return {
      status: 200,
      body: {
        data: ordered.map((t) => ({
          ...t,
          code: t.tripCode,
          driverName: t.driver?.user?.fullName,
          vehiclePlate: t.vehicle?.plateNumber,
          estimatedDistanceKm: num(t.estimatedDistanceKm),
          deliveries: t.deliveries.map((d) => ({
            ...d,
            trackingCode: d.order?.trackingCode,
            codAmountExpected: num(d.codAmountExpected),
            codAmountCollected: num(d.codAmountCollected),
          })),
        })),
      },
    };
  }

  const mobStops = path.match(/^\/mobile\/trips\/([^/]+)\/stops$/);
  if (mobStops && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const rows = await withTenant(tid, async (tx) => tx.delivery.findMany({ where: { tripId: mobStops[1] }, include: { order: true }, orderBy: { stopSequence: 'asc' } }));
    return { status: 200, body: { data: rows.map((d) => ({ ...d, trackingCode: d.order?.trackingCode, codAmountExpected: num(d.codAmountExpected), codAmountCollected: num(d.codAmountCollected) })) } };
  }

  if (path === '/mobile/wallet' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const tid = getTenantId(ctx);
    const [rems, exps] = await withTenant(tid, async (tx) => Promise.all([tx.codRemittance.findMany({ take: 10 }), tx.driverExpense.findMany({ take: 10 })]));
    return {
      status: 200,
      body: {
        pendingCodTotal: rems.filter((r) => r.status === 'PENDING').reduce((s, r) => s + num(r.totalCodCollected), 0),
        remittances: rems.map((r) => ({ ...r, totalCodCollected: num(r.totalCodCollected), amountRemitted: num(r.amountRemitted) })),
        expenses: exps.map((e) => ({ ...e, amount: num(e.amount) })),
      },
    };
  }

  if (path === '/driver-app/profile' && method === 'GET') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    return { status: 200, body: { id: ctx.session!.sub, email: ctx.session!.email, fullName: ctx.session!.fullName, licenseClass: 'FC', tenantSlug: ctx.session!.tenantSlug } };
  }

  if ((path === '/mobile/gps-batch' || path === '/gps/batch') && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const points = Array.isArray(body?.points) ? body.points : [{ lat: num(body?.lat, 10.9415), lng: num(body?.lng, 106.8908), speedKmh: num(body?.speedKmh, 48) }];
    const saved = await withTenant(tid, async (tx) => {
      const drv = await tx.driver.findFirst();
      const trip = body?.tripId ? null : await tx.trip.findFirst();
      let count = 0;
      for (const pt of points.slice(0, 50)) {
        await tx.gpsTrackingLog.create({
          data: {
            tenantId: tid,
            driverId: drv!.id,
            tripId: body?.tripId ? String(body.tripId) : (trip?.id || null),
            lat: num(pt.lat, 10.9415),
            lng: num(pt.lng, 106.8908),
            speed: num(pt.speedKmh ?? pt.speed, 45),
            heading: num(pt.heading, 165),
            isOfflineCached: Boolean(pt.isOfflineCached || body?.offline),
            timestamp: pt.timestamp ? new Date(pt.timestamp) : new Date(),
          },
        });
        count++;
      }
      return count;
    });
    await appendSimulationEvent(null, { sandboxKey: ctx.session!.sandboxKey, tenantId: tid, category: 'DRIVER_SIM', eventType: 'GPS_BATCH_SYNCED', summary: `Đồng bộ ${saved} tọa độ GPS từ App Tài xế vào Neon DB.` });
    return { status: 200, body: { ok: true, ingested: saved } };
  }

  const mobPod = path.match(/^\/mobile\/uploads\/pod\/([^/]+)$/);
  if (mobPod && method === 'POST') {
    const roleErr = assertInternalRole(ctx);
    if (roleErr) return roleErr;
    const writeErr = assertWriteAllowed(ctx);
    if (writeErr) return writeErr;
    const tid = getTenantId(ctx);
    const delId = mobPod[1];
    // Simulate optimistic locking conflict check when forceConflict=true or stale syncVersion sent
    const clientVersion = body?.syncVersion !== undefined ? Number(body.syncVersion) : undefined;
    const res = await withTenant(tid, async (tx) => {
      const del = (await tx.delivery.findUnique({ where: { id: delId } })) || (await tx.delivery.findFirst());
      if (!del) return { status: 404, body: { message: 'Không tìm thấy điểm giao.' } };
      if (Boolean(body?.simulateConflict) || (clientVersion !== undefined && clientVersion < del.syncVersion)) {
        return {
          status: 409,
          body: {
            code: 'SYNC_VERSION_CONFLICT',
            message: `Xung đột phiên bản ngoại tuyến (Client v${clientVersion ?? 0} < Server v${del.syncVersion}). Chọn "Giữ bản mới nhất" hoặc "Ghi đè" để hoàn tất.`,
            serverVersion: del.syncVersion,
            serverStatus: del.status,
          },
        };
      }
      const nextStatus = String(body?.status || 'DELIVERED');
      const updated = await tx.delivery.update({
        where: { id: del.id },
        data: {
          status: nextStatus,
          codAmountCollected: num(body?.codAmountCollected, num(del.codAmountExpected)),
          podSignatureUrl: body?.signatureDataUrl ? 'data:image/png;base64,demo-epod-signed' : 'data:image/png;base64,demo-epod-verified',
          syncVersion: { increment: 1 },
        },
      });
      await tx.order.update({
        where: { id: del.orderId },
        data: { status: nextStatus, ...(nextStatus === 'DELIVERED' ? { actualDeliveryTime: new Date() } : {}) },
      });
      return { status: 200, body: { ok: true, delivery: { ...updated, codAmountCollected: num(updated.codAmountCollected) } } };
    });
    return res;
  }

  return null;
}
