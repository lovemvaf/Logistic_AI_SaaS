import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OutboxService } from '../../../core/outbox/outbox.service';
import { generateTrackingCode } from '../../../core/utils/tracking-code';

@Injectable()
export class FreightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async getControlTowerSummary() {
    const db = this.prisma.getTenantDb();
    const [
      bookingsTotal,
      bookingsActive,
      shipmentsTotal,
      containersByStatus,
      tractorsCount,
      chassisCount,
      rfqsOpen,
      quotesSent,
      disputesOpen,
      invoices,
      slots,
      declsPendingReview,
    ] = await Promise.all([
      db.freightBooking.count(),
      db.freightBooking.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      db.freightShipment.count(),
      db.containerEquipment.groupBy({ by: ['status'], _count: { _all: true } }),
      db.tractorUnit.count(),
      db.chassisUnit.count(),
      db.freightRFQ.count({ where: { status: 'OPEN' } }),
      db.freightQuote.count({ where: { status: 'SENT' } }),
      db.disputeCase.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      db.freightInvoice.findMany({
        where: { direction: 'AR', status: { in: ['ISSUED', 'PARTIAL', 'DISPUTED'] } },
        select: { totalAmount: true, paidAmount: true },
      }),
      db.yardSlot.groupBy({ by: ['status'], _count: { _all: true } }),
      db.customsDeclaration.count({ where: { status: 'NEEDS_CUSTOMS_REVIEW' } }),
    ]);

    const arOutstandingVnd = invoices.reduce(
      (sum: number, inv: any) => sum + Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount)),
      0,
    );
    const totalContainers = containersByStatus.reduce((s: number, g: any) => s + g._count._all, 0);
    const totalSlots = slots.reduce((s: number, g: any) => s + g._count._all, 0);
    const occupiedSlots = slots.find((g: any) => g.status === 'OCCUPIED')?._count?._all ?? 0;

    return {
      bookingsTotal,
      bookingsActive,
      shipmentsTotal,
      tractorsCount,
      chassisCount,
      totalContainers,
      containersByStatus: containersByStatus.map((c: any) => ({ status: c.status, count: c._count._all })),
      rfqsOpen,
      quotesSent,
      disputesOpen,
      arOutstandingAmount: Math.round(arOutstandingVnd * 100) / 100,
      yardSlotsTotal: totalSlots,
      yardSlotsOccupied: occupiedSlots,
      yardOccupancyPct: totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 1000) / 10 : 0,
      customsDeclarationsPendingReview: declsPendingReview,
      dataSource: 'LIVE_POSTGRES_AGGREGATION',
    };
  }

  async listTractors() {
    return this.prisma.getTenantDb().tractorUnit.findMany({ orderBy: { unitCode: 'asc' } });
  }

  async createTractor(dto: any) {
    if (!dto?.unitCode || !dto?.plateNumber) {
      throw new BadRequestException('unitCode and plateNumber are required');
    }
    return this.prisma.getTenantDb().tractorUnit.create({
      data: {
        unitCode: String(dto.unitCode).trim().toUpperCase(),
        plateNumber: String(dto.plateNumber).trim().toUpperCase(),
        horsePower: Number(dto.horsePower || 420),
        emissionStd: dto.emissionStd || 'EURO5',
        status: dto.status || 'AVAILABLE',
        currentFacilityId: dto.currentFacilityId || null,
      },
    });
  }

  async listChassis() {
    return this.prisma.getTenantDb().chassisUnit.findMany({ orderBy: { chassisCode: 'asc' } });
  }

  async createChassis(dto: any) {
    if (!dto?.chassisCode || !dto?.plateNumber) {
      throw new BadRequestException('chassisCode and plateNumber are required');
    }
    return this.prisma.getTenantDb().chassisUnit.create({
      data: {
        chassisCode: String(dto.chassisCode).trim().toUpperCase(),
        plateNumber: String(dto.plateNumber).trim().toUpperCase(),
        axleCount: Number(dto.axleCount || 3),
        compatibleSizes: Array.isArray(dto.compatibleSizes) ? dto.compatibleSizes : ['20GP', '40HC'],
        status: dto.status || 'AVAILABLE',
      },
    });
  }

  async listContainers(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.getTenantDb().containerEquipment.findMany({
      where,
      orderBy: { containerNo: 'asc' },
    });
  }

  async createContainer(dto: any) {
    if (!dto?.containerNo) throw new BadRequestException('containerNo is required');
    return this.prisma.getTenantDb().containerEquipment.create({
      data: {
        containerNo: String(dto.containerNo).trim().toUpperCase(),
        sizeType: dto.sizeType || '40HC',
        isoCode: dto.isoCode || (dto.sizeType === '20GP' ? '22G1' : '45G1'),
        tareWeightKg: Number(dto.tareWeightKg || 3800),
        maxPayloadKg: Number(dto.maxPayloadKg || 26680),
        reeferTempC: dto.reeferTempC ?? null,
        ownershipType: dto.ownershipType || 'CARRIER_OWNED',
        status: dto.status || 'EMPTY_AT_DEPOT',
        currentSealNo: dto.currentSealNo || null,
      },
    });
  }

  async listAssignments(query?: { status?: string }) {
    const where: any = {};
    if (query?.status) where.status = query.status;
    return this.prisma.getTenantDb().equipmentAssignment.findMany({
      where,
      include: {
        tractor: { select: { id: true, unitCode: true, plateNumber: true } },
        chassis: { select: { id: true, chassisCode: true, plateNumber: true } },
        container: { select: { id: true, containerNo: true, sizeType: true } },
        booking: { select: { id: true, bookingNo: true } },
      },
      orderBy: { startAt: 'desc' },
    });
  }

  /**
   * Assigns tractor/chassis/container/driver across an explicit [startAt, endAt] time window.
   * Uses Postgres transaction-scoped advisory locks per resource so concurrent dispatches
   * NEVER double-book equipment and consistently raise 409 ConflictException.
   */
  async assignEquipment(dto: {
    tractorId?: string;
    chassisId?: string;
    containerId?: string;
    driverId?: string;
    freightLegId?: string;
    bookingId?: string;
    startAt: string | Date;
    endAt: string | Date;
    notes?: string;
  }) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      throw new BadRequestException('Valid startAt and endAt (with endAt > startAt) are required');
    }
    if (!dto.tractorId && !dto.chassisId && !dto.containerId && !dto.driverId) {
      throw new BadRequestException('At least one resource (tractorId, chassisId, containerId, or driverId) is required');
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const resourcePairs: Array<[string, string | undefined]> = [
        ['tractorId', dto.tractorId],
        ['chassisId', dto.chassisId],
        ['containerId', dto.containerId],
        ['driverId', dto.driverId],
      ];

      // Acquire deterministic sorted advisory locks in Postgres mode to serialize racing dispatches
      if (!PrismaService.isSqlite && typeof tx.$executeRawUnsafe === 'function') {
        const lockKeys = resourcePairs
          .filter(([, val]) => Boolean(val))
          .map(([field, val]) => `${field}:${val}`)
          .sort();
        for (const k of lockKeys) {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, k);
        }
      }

      for (const [field, val] of resourcePairs) {
        if (!val) continue;
        const overlap = await tx.equipmentAssignment.findFirst({
          where: {
            [field]: val,
            status: { in: ['RESERVED', 'ACTIVE'] },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        });
        if (overlap) {
          throw new ConflictException(
            `Equipment double-booking conflict on ${field}=${val} (overlaps assignment ${overlap.id} from ${overlap.startAt.toISOString()} to ${overlap.endAt.toISOString()})`,
          );
        }
      }

      const assignment = await tx.equipmentAssignment.create({
        data: {
          tractorId: dto.tractorId || null,
          chassisId: dto.chassisId || null,
          containerId: dto.containerId || null,
          driverId: dto.driverId || null,
          freightLegId: dto.freightLegId || null,
          bookingId: dto.bookingId || null,
          status: 'RESERVED',
          startAt,
          endAt,
          notes: dto.notes || null,
        },
      });

      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: 'freight.equipment.assigned',
          aggregateId: assignment.id,
          payload: {
            assignmentId: assignment.id,
            tractorId: assignment.tractorId,
            chassisId: assignment.chassisId,
            containerId: assignment.containerId,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
          },
        },
        tx,
      );

      return assignment;
    });
  }

  async listRfqs(query?: { clientId?: string; status?: string }) {
    const where: any = {};
    if (query?.clientId) where.clientId = query.clientId;
    if (query?.status) where.status = query.status;

    return this.prisma.getTenantDb().freightRFQ.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        quotes: { include: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRfq(dto: any) {
    if (!dto?.originName || !dto?.destName || !dto?.cargoDesc) {
      throw new BadRequestException('originName, destName, and cargoDesc are required');
    }
    const rfqNumber =
      dto.rfqNumber ||
      `RFQ-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    return this.prisma.getTenantDb().freightRFQ.create({
      data: {
        rfqNumber,
        clientId: dto.clientId || null,
        serviceMode: dto.serviceMode || 'FCL_EXPORT',
        incoterm: dto.incoterm || 'FOB',
        originName: String(dto.originName).trim(),
        destName: String(dto.destName).trim(),
        corridorTag: dto.corridorTag || null,
        containerSize: dto.containerSize || '40HC',
        containerQty: Math.max(1, Number(dto.containerQty || 1)),
        cargoDesc: String(dto.cargoDesc).trim(),
        weightKg: dto.weightKg ?? null,
        volumeCbm: dto.volumeCbm ?? null,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
        status: 'OPEN',
      },
    });
  }

  async listQuotes(query?: { clientId?: string; rfqId?: string; status?: string }) {
    const where: any = {};
    if (query?.clientId) where.clientId = query.clientId;
    if (query?.rfqId) where.rfqId = query.rfqId;
    if (query?.status) where.status = query.status;

    return this.prisma.getTenantDb().freightQuote.findMany({
      where,
      include: {
        rfq: true,
        client: { select: { id: true, name: true } },
        lines: true,
        booking: { select: { id: true, bookingNo: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuote(dto: any) {
    const linesInput: any[] = Array.isArray(dto.lines) ? dto.lines : [];
    const totalFromLines = linesInput.reduce(
      (s, l) => s + Number(l.qty || 1) * Number(l.unitPrice || 0),
      0,
    );
    const totalAmount = Number(dto.totalAmount ?? totalFromLines);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new BadRequestException('Quote totalAmount or positive lines are required');
    }

    const quoteNumber =
      dto.quoteNumber ||
      `QT-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      let resolvedClientId = dto.clientId || null;
      if (!resolvedClientId && dto.rfqId) {
        const rfq = await tx.freightRFQ.findUnique({ where: { id: dto.rfqId } });
        if (!rfq) throw new NotFoundException(`FreightRFQ ${dto.rfqId} not found`);
        resolvedClientId = rfq.clientId;
        await tx.freightRFQ.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });
      }

      const quote = await tx.freightQuote.create({
        data: {
          quoteNumber,
          rfqId: dto.rfqId || null,
          clientId: resolvedClientId,
          contractRateId: dto.contractRateId || null,
          currency: dto.currency || 'VND',
          totalAmount,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : new Date(Date.now() + 14 * 86400000),
          status: dto.status || 'SENT',
        },
      });

      if (linesInput.length > 0) {
        for (const l of linesInput) {
          const qty = Number(l.qty || 1);
          const unitPrice = Number(l.unitPrice || 0);
          await tx.quoteLine.create({
            data: {
              quoteId: quote.id,
              lineType: l.lineType || 'FREIGHT',
              description: String(l.description || 'Ocean/Inland Freight'),
              qty,
              unitPrice,
              lineTotal: Math.round(qty * unitPrice * 100) / 100,
            },
          });
        }
      }

      return tx.freightQuote.findUnique({
        where: { id: quote.id },
        include: { lines: true, rfq: true },
      });
    });
  }

  async acceptQuote(quoteId: string, opts?: { clientId?: string }) {
    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const quote = await tx.freightQuote.findUnique({
        where: { id: quoteId },
        include: { rfq: true, booking: true },
      });
      if (!quote) throw new NotFoundException(`FreightQuote ${quoteId} not found`);
      if (opts?.clientId && quote.clientId !== opts.clientId) {
        throw new NotFoundException(`FreightQuote ${quoteId} not found`);
      }
      if (quote.status === 'ACCEPTED' || quote.booking) {
        throw new ConflictException(`Quote ${quote.quoteNumber} is already accepted`);
      }
      if (quote.validUntil && new Date(quote.validUntil).getTime() < Date.now()) {
        throw new BadRequestException(`Quote ${quote.quoteNumber} has expired`);
      }

      await tx.freightQuote.update({
        where: { id: quoteId },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (quote.rfqId) {
        await tx.freightRFQ.update({
          where: { id: quote.rfqId },
          data: { status: 'BOOKED' },
        });
      }

      const bookingNo = `BK-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      const booking = await tx.freightBooking.create({
        data: {
          bookingNo,
          quoteId: quote.id,
          clientId: quote.clientId,
          serviceMode: quote.rfq?.serviceMode || 'FCL_EXPORT',
          status: 'CONFIRMED',
        },
      });

      const trackingCode = generateTrackingCode();
      const shipmentNo = `SHP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      const shipment = await tx.freightShipment.create({
        data: {
          shipmentNo,
          bookingId: booking.id,
          clientId: quote.clientId,
          trackingCode,
          cargoDesc: quote.rfq?.cargoDesc || 'General Containerized Cargo',
          grossWeightKg: quote.rfq?.weightKg ?? null,
          volumeCbm: quote.rfq?.volumeCbm ?? null,
          status: 'PLANNED',
        },
      });

      await tx.freightLeg.create({
        data: {
          shipmentId: shipment.id,
          sequence: 1,
          legType: booking.serviceMode.includes('IMPORT') ? 'PORT_GATE_OUT' : 'FIRST_MILE',
          originName: quote.rfq?.originName || 'Bien Hoa ICD',
          destName: quote.rfq?.destName || 'Cat Lai Terminal (External)',
          status: 'PENDING',
        },
      });

      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: 'freight.booking.confirmed',
          aggregateId: booking.id,
          payload: {
            bookingId: booking.id,
            bookingNo: booking.bookingNo,
            quoteId: quote.id,
            shipmentId: shipment.id,
            trackingCode,
          },
        },
        tx,
      );

      return { booking, shipment };
    });
  }

  async listBookings(query?: { clientId?: string; status?: string }) {
    const where: any = {};
    if (query?.clientId) where.clientId = query.clientId;
    if (query?.status) where.status = query.status;

    return this.prisma.getTenantDb().freightBooking.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        shipments: {
          include: {
            container: { select: { id: true, containerNo: true, sizeType: true, status: true } },
            legs: { orderBy: { sequence: 'asc' } },
          },
        },
        assignments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBooking(dto: any) {
    const bookingNo =
      dto.bookingNo ||
      `BK-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    return this.prisma.getTenantDb().freightBooking.create({
      data: {
        bookingNo,
        clientId: dto.clientId || null,
        serviceMode: dto.serviceMode || 'FCL_EXPORT',
        vesselName: dto.vesselName || null,
        voyageNo: dto.voyageNo || null,
        mblNo: dto.mblNo || null,
        hblNo: dto.hblNo || null,
        etd: dto.etd ? new Date(dto.etd) : null,
        eta: dto.eta ? new Date(dto.eta) : null,
        originFacilityId: dto.originFacilityId || null,
        destFacilityId: dto.destFacilityId || null,
        status: dto.status || 'CONFIRMED',
      },
    });
  }

  async listShipments(query?: { clientId?: string; bookingId?: string }) {
    const where: any = {};
    if (query?.clientId) where.clientId = query.clientId;
    if (query?.bookingId) where.bookingId = query.bookingId;

    return this.prisma.getTenantDb().freightShipment.findMany({
      where,
      include: {
        booking: { select: { id: true, bookingNo: true, serviceMode: true, mblNo: true, hblNo: true } },
        client: { select: { id: true, name: true } },
        container: true,
        legs: { orderBy: { sequence: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShipment(dto: any) {
    if (!dto?.bookingId) throw new BadRequestException('bookingId is required');
    const shipmentNo =
      dto.shipmentNo ||
      `SHP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    return this.prisma.getTenantDb().freightShipment.create({
      data: {
        shipmentNo,
        bookingId: dto.bookingId,
        clientId: dto.clientId || null,
        containerId: dto.containerId || null,
        trackingCode: dto.trackingCode || generateTrackingCode(),
        cargoDesc: dto.cargoDesc || null,
        grossWeightKg: dto.grossWeightKg ?? null,
        volumeCbm: dto.volumeCbm ?? null,
        demRuleId: dto.demRuleId || null,
        detRuleId: dto.detRuleId || null,
        status: 'PLANNED',
      },
    });
  }

  async addShipmentLeg(shipmentId: string, dto: any) {
    const db = this.prisma.getTenantDb();
    const shipment = await db.freightShipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException(`FreightShipment ${shipmentId} not found`);

    const count = await db.freightLeg.count({ where: { shipmentId } });
    return db.freightLeg.create({
      data: {
        shipmentId,
        sequence: Number(dto.sequence || count + 1),
        legType: dto.legType || 'LINEHAUL',
        originName: String(dto.originName || 'Dong Nai'),
        destName: String(dto.destName || 'Port Terminal'),
        originLat: dto.originLat ?? null,
        originLng: dto.originLng ?? null,
        destLat: dto.destLat ?? null,
        destLng: dto.destLng ?? null,
        status: dto.status || 'PENDING',
      },
    });
  }
}
