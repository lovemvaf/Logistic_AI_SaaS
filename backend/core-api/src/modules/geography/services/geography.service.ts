import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DONG_NAI_2026_UNITS,
  DONG_NAI_PRE_2025_ALIASES,
  normalizeVietnameseAdminName,
  normalizeVietnameseAliasKey,
} from 'shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  async listUnits(params: {
    unitType?: string;
    corridor?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const limit = Math.min(Math.max(1, Number(params.limit || 95)), 200);
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (params.unitType && ['WARD', 'COMMUNE'].includes(params.unitType.toUpperCase())) {
      where.unitType = params.unitType.toUpperCase();
    }
    if (params.corridor && ['NORTH', 'CENTRAL', 'SOUTH'].includes(params.corridor.toUpperCase())) {
      where.corridor = params.corridor.toUpperCase();
    }
    if (params.search && params.search.trim()) {
      const norm = normalizeVietnameseAdminName(params.search);
      where.OR = [
        { canonicalName: { contains: params.search.trim(), mode: 'insensitive' } },
        ...(norm ? [{ normalizedName: { contains: norm } }] : []),
      ];
    }

    return this.prisma.runAsPlatform(async (db) => {
      const [data, total, wardCount, communeCount] = await Promise.all([
        db.administrativeUnit.findMany({
          where,
          include: { aliases: true },
          orderBy: [{ unitType: 'asc' }, { canonicalName: 'asc' }],
          skip,
          take: limit,
        }),
        db.administrativeUnit.count({ where }),
        db.administrativeUnit.count({ where: { isActive: true, unitType: 'WARD' } }),
        db.administrativeUnit.count({ where: { isActive: true, unitType: 'COMMUNE' } }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          wardCount,
          communeCount,
          expectedTotal2026: 95,
          officialCodeStatusNote:
            'Danh mục tên 95 phường/xã TP Đồng Nai 2026 giữ officialCodeStatus=PENDING_OFFICIAL_CODE và boundaryStatus=NO_OFFICIAL_POLYGON cho tới khi có công bố mã/GIS chính thức.',
        },
      };
    });
  }

  async resolveUnit(rawInput: string) {
    const query = String(rawInput || '').trim();
    if (!query) {
      throw new BadRequestException('q parameter is required');
    }
    const strippedAccented = query
      .replace(/^(phường|xã|thị trấn|tt\.|p\.|x\.|tp\.|thành phố|huyện|thị xã|tx\.)\s+/i, '')
      .trim();
    const normalized = normalizeVietnameseAdminName(query);
    const aliasKey = normalizeVietnameseAliasKey(query);

    return this.prisma.runAsPlatform(async (db) => {
      // 1. Exact accent-aware canonical match first (distinguishes Lộc Thành vs Lộc Thạnh)
      if (strippedAccented) {
        const accentedExact = await db.administrativeUnit.findMany({
          where: { isActive: true, canonicalName: { equals: strippedAccented, mode: 'insensitive' } },
          include: { aliases: true },
        });
        if (accentedExact.length === 1) {
          return {
            matched: true,
            matchedVia: 'CANONICAL_NAME',
            ambiguous: false,
            query,
            normalizedQuery: normalized,
            unit: accentedExact[0],
            candidates: accentedExact,
          };
        }
      }

      const directExact = await db.administrativeUnit.findMany({
        where: {
          isActive: true,
          OR: [
            { normalizedName: normalized },
            { normalizedName: { startsWith: `${normalized} (` } },
          ],
        },
        include: { aliases: true },
      });

      if (directExact.length === 1) {
        return {
          matched: true,
          matchedVia: 'CANONICAL_NAME',
          ambiguous: false,
          query,
          normalizedQuery: normalized,
          unit: directExact[0],
          candidates: directExact,
        };
      }
      if (directExact.length > 1) {
        return {
          matched: true,
          matchedVia: 'CANONICAL_NAME_AMBIGUOUS',
          ambiguous: true,
          query,
          normalizedQuery: normalized,
          unit: null,
          candidates: directExact,
        };
      }

      const aliasMatches = await db.administrativeAlias.findMany({
        where: {
          OR: [
            { normalizedAlias: aliasKey },
            { normalizedAlias: normalized },
            ...(normalized ? [{ normalizedAlias: { endsWith: ` ${normalized}` } }] : []),
          ],
        },
        include: { unit: { include: { aliases: true } } },
      });

      const uniqueAliasUnitsMap = new Map<string, any>();
      for (const a of aliasMatches) {
        if (a.unit) uniqueAliasUnitsMap.set(a.unit.id, a.unit);
      }
      const uniqueAliasUnits = Array.from(uniqueAliasUnitsMap.values());

      if (uniqueAliasUnits.length === 1) {
        return {
          matched: true,
          matchedVia: 'HISTORICAL_ALIAS',
          ambiguous: false,
          query,
          normalizedQuery: normalized,
          unit: uniqueAliasUnits[0],
          candidates: uniqueAliasUnits,
        };
      }
      if (uniqueAliasUnits.length > 1) {
        return {
          matched: true,
          matchedVia: 'HISTORICAL_ALIAS_AMBIGUOUS',
          ambiguous: true,
          query,
          normalizedQuery: normalized,
          unit: null,
          candidates: uniqueAliasUnits,
        };
      }

      const fuzzy = await db.administrativeUnit.findMany({
        where: {
          isActive: true,
          OR: [
            { canonicalName: { contains: query, mode: 'insensitive' } },
            ...(normalized ? [{ normalizedName: { contains: normalized } }] : []),
          ],
        },
        take: 10,
      });

      return {
        matched: fuzzy.length === 1,
        matchedVia: fuzzy.length === 1 ? 'PARTIAL_MATCH' : 'UNRESOLVED',
        ambiguous: fuzzy.length > 1,
        query,
        normalizedQuery: normalized,
        unit: fuzzy.length === 1 ? fuzzy[0] : null,
        candidates: fuzzy,
      };
    });
  }

  async getUnitDetail(id: string) {
    return this.prisma.runAsPlatform(async (db) => {
      const unit = await db.administrativeUnit.findUnique({
        where: { id },
        include: {
          aliases: true,
          boundaryVersions: { orderBy: { createdAt: 'desc' } },
          facilities: true,
        },
      });
      if (!unit) throw new NotFoundException(`AdministrativeUnit ${id} not found`);
      return unit;
    });
  }

  async listFacilities(params: {
    facilityType?: string;
    corridor?: string;
    outsideCity?: string;
    search?: string;
  }) {
    const where: any = { isActive: true };
    if (params.facilityType) where.facilityType = params.facilityType.toUpperCase();
    if (params.corridor) where.corridor = params.corridor.toUpperCase();
    if (params.outsideCity === 'true') where.outsideCity = true;
    if (params.outsideCity === 'false') where.outsideCity = false;
    if (params.search && params.search.trim()) {
      where.OR = [
        { name: { contains: params.search.trim(), mode: 'insensitive' } },
        { code: { contains: params.search.trim(), mode: 'insensitive' } },
        { localityName: { contains: params.search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.runAsPlatform(async (db) => {
      return db.logisticsFacility.findMany({
        where,
        include: {
          administrativeUnit: {
            select: {
              id: true,
              canonicalName: true,
              unitType: true,
              officialCodeStatus: true,
              boundaryStatus: true,
            },
          },
          geofences: true,
          roadRestrictions: { where: { isActive: true } },
          queueObservations: { orderBy: { observedAt: 'desc' }, take: 3 },
        },
        orderBy: [{ outsideCity: 'asc' }, { corridor: 'asc' }, { name: 'asc' }],
      });
    });
  }

  async getFacilityDetail(id: string) {
    return this.prisma.runAsPlatform(async (db) => {
      const facility = await db.logisticsFacility.findUnique({
        where: { id },
        include: {
          administrativeUnit: true,
          geofences: true,
          roadRestrictions: true,
          queueObservations: { orderBy: { observedAt: 'desc' }, take: 20 },
        },
      });
      if (!facility) throw new NotFoundException(`LogisticsFacility ${id} not found`);
      return facility;
    });
  }

  async listCorridors() {
    return this.prisma.runAsPlatform(async (db) => {
      return db.transportCorridor.findMany({
        include: {
          originFacility: { select: { id: true, code: true, name: true, outsideCity: true, localityName: true } },
          destFacility: { select: { id: true, code: true, name: true, outsideCity: true, localityName: true } },
          roadRestrictions: { where: { isActive: true } },
        },
        orderBy: [{ corridorTag: 'asc' }, { code: 'asc' }],
      });
    });
  }

  async listRestrictions() {
    return this.prisma.runAsPlatform(async (db) => {
      return db.roadRestriction.findMany({
        where: { isActive: true },
        include: {
          corridor: { select: { id: true, code: true, name: true } },
          facility: { select: { id: true, code: true, name: true, outsideCity: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async addQueueObservation(
    facilityId: string,
    dto: { waitMinutes: number; queueLength?: number; notes?: string },
  ) {
    const waitMinutes = Number(dto.waitMinutes);
    if (!Number.isFinite(waitMinutes) || waitMinutes < 0 || waitMinutes > 2880) {
      throw new BadRequestException('waitMinutes must be between 0 and 2880');
    }

    return this.prisma.runAsPlatform(async (db) => {
      const facility = await db.logisticsFacility.findUnique({ where: { id: facilityId } });
      if (!facility) throw new NotFoundException(`Facility ${facilityId} not found`);

      return db.terminalQueueObservation.create({
        data: {
          facilityId,
          waitMinutes: Math.round(waitMinutes),
          queueLength: Math.max(0, Math.round(Number(dto.queueLength || 0))),
          sourceLabel: 'OPERATOR_REPORTED',
          isOfficialTelemetry: false,
          notes: dto.notes ? String(dto.notes).slice(0, 500) : null,
        },
      });
    });
  }

  async getOverview() {
    return this.prisma.runAsPlatform(async (db) => {
      const [totalUnits, wardCount, communeCount, facilities, corridors, restrictions, pendingCodes] =
        await Promise.all([
          db.administrativeUnit.count({ where: { isActive: true } }),
          db.administrativeUnit.count({ where: { isActive: true, unitType: 'WARD' } }),
          db.administrativeUnit.count({ where: { isActive: true, unitType: 'COMMUNE' } }),
          db.logisticsFacility.findMany({ where: { isActive: true }, select: { id: true, outsideCity: true, corridor: true } }),
          db.transportCorridor.count(),
          db.roadRestriction.count({ where: { isActive: true } }),
          db.administrativeUnit.count({ where: { isActive: true, officialCodeStatus: 'PENDING_OFFICIAL_CODE' } }),
        ]);

      return {
        provinceName: 'Thành phố Đồng Nai',
        provinceCode: 'DONG_NAI_2026',
        totalUnits,
        wardCount,
        communeCount,
        pendingOfficialCodeCount: pendingCodes,
        dongNaiFacilitiesCount: facilities.filter((f: any) => !f.outsideCity).length,
        externalGatewayFacilitiesCount: facilities.filter((f: any) => f.outsideCity).length,
        corridorsCount: corridors,
        activeRestrictionsCount: restrictions,
      };
    });
  }

  async bootstrap2026Master() {
    return this.prisma.runAsPlatform(async (db) => {
      let upsertedUnits = 0;
      for (const u of DONG_NAI_2026_UNITS) {
        await db.administrativeUnit.upsert({
          where: {
            provinceCode_unitType_normalizedName: {
              provinceCode: 'DONG_NAI_2026',
              unitType: u.unitType,
              normalizedName: u.normalizedName,
            },
          },
          create: {
            canonicalName: u.canonicalName,
            normalizedName: u.normalizedName,
            unitType: u.unitType,
            corridor: u.corridor,
            officialCodeStatus: u.officialCodeStatus,
            boundaryStatus: u.boundaryStatus,
            sourceDoc: u.sourceDoc,
          },
          update: {
            canonicalName: u.canonicalName,
            corridor: u.corridor,
          },
        });
        upsertedUnits++;
      }

      let upsertedAliases = 0;
      for (const alias of DONG_NAI_PRE_2025_ALIASES) {
        const unit = await db.administrativeUnit.findUnique({
          where: {
            provinceCode_unitType_normalizedName: {
              provinceCode: 'DONG_NAI_2026',
              unitType: alias.unitType,
              normalizedName: alias.unitNormalizedName,
            },
          },
        });
        if (!unit) continue;
        const normAlias = normalizeVietnameseAliasKey(alias.aliasName);
        await db.administrativeAlias.upsert({
          where: { unitId_normalizedAlias: { unitId: unit.id, normalizedAlias: normAlias } },
          create: {
            unitId: unit.id,
            aliasName: alias.aliasName,
            normalizedAlias: normAlias,
            aliasType: alias.aliasType,
            sourceDoc: 'PRE_2025_REFERENCE',
          },
          update: { aliasName: alias.aliasName },
        });
        upsertedAliases++;
      }

      return { ok: true, upsertedUnits, upsertedAliases };
    });
  }

  async updateUnitOfficialMetadata(
    id: string,
    dto: {
      officialCode?: string;
      sourceDoc: string;
      sourceUrl?: string;
      geometryGeoJson?: Record<string, unknown>;
    },
  ) {
    if (!dto?.sourceDoc || !dto.sourceDoc.trim()) {
      throw new BadRequestException('Authoritative sourceDoc is required before updating official code/GIS metadata');
    }

    return this.prisma.runAsPlatform(async (db) => {
      const existing = await db.administrativeUnit.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`AdministrativeUnit ${id} not found`);

      const nextCodeStatus = dto.officialCode ? 'OFFICIAL_VERIFIED' : existing.officialCodeStatus;
      const nextBoundaryStatus = dto.geometryGeoJson ? 'OFFICIAL_GIS_POLYGON' : existing.boundaryStatus;

      const updated = await db.administrativeUnit.update({
        where: { id },
        data: {
          ...(dto.officialCode ? { officialCode: String(dto.officialCode).trim() } : {}),
          officialCodeStatus: nextCodeStatus,
          boundaryStatus: nextBoundaryStatus,
          sourceDoc: dto.sourceDoc.trim(),
        },
      });

      const versionCount = await db.administrativeBoundaryVersion.count({ where: { unitId: id } });
      await db.administrativeBoundaryVersion.create({
        data: {
          unitId: id,
          versionTag: `v${versionCount + 1}-${new Date().toISOString().slice(0, 10)}`,
          sourceDoc: dto.sourceDoc.trim(),
          sourceUrl: dto.sourceUrl ? String(dto.sourceUrl).trim() : null,
          officialCode: dto.officialCode ? String(dto.officialCode).trim() : existing.officialCode,
          geometryGeoJson: dto.geometryGeoJson ?? undefined,
          boundaryStatus: nextBoundaryStatus,
          verifiedAt: new Date(),
        },
      });

      return updated;
    });
  }
}
