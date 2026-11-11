import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OutboxService } from '../../../core/outbox/outbox.service';
import { DemDetCalculatorService } from './dem-det-calculator.service';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly demDetCalculator: DemDetCalculatorService,
  ) {}

  async listContractRates(query?: { status?: string; corridorTag?: string }) {
    const where: any = {};
    if (query?.status) where.status = query.status;
    if (query?.corridorTag) where.corridorTag = query.corridorTag;

    return this.prisma.getTenantDb().contractRate.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        surcharges: { where: { isActive: true } },
      },
      orderBy: { validFrom: 'desc' },
    });
  }

  async createContractRate(dto: any) {
    if (!dto?.contractCode || !dto?.originName || !dto?.destName) {
      throw new BadRequestException('contractCode, originName, and destName are required');
    }
    const baseRate = Number(dto.baseRate);
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
      throw new BadRequestException('baseRate must be positive');
    }

    return this.prisma.getTenantDb().contractRate.create({
      data: {
        contractCode: String(dto.contractCode).trim().toUpperCase(),
        clientId: dto.clientId || null,
        originName: String(dto.originName).trim(),
        destName: String(dto.destName).trim(),
        corridorTag: dto.corridorTag || null,
        serviceMode: dto.serviceMode || 'FCL',
        containerSize: dto.containerSize || '40HC',
        currency: dto.currency || 'VND',
        baseRate,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validTo: dto.validTo ? new Date(dto.validTo) : new Date(Date.now() + 180 * 86400000),
        status: dto.status || 'ACTIVE',
      },
    });
  }

  async listSurcharges() {
    return this.prisma.getTenantDb().surchargeRule.findMany({
      include: { contractRate: { select: { id: true, contractCode: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createSurcharge(dto: any) {
    const amount = Number(dto.amount);
    if (!dto?.code || !dto?.name || !Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('code, name, and non-negative amount are required');
    }
    return this.prisma.getTenantDb().surchargeRule.create({
      data: {
        contractRateId: dto.contractRateId || null,
        code: String(dto.code).trim().toUpperCase(),
        name: String(dto.name).trim(),
        surchargeType: dto.surchargeType || 'TOLL',
        calcMode: dto.calcMode === 'PERCENT' ? 'PERCENT' : 'FIXED',
        amount,
        currency: dto.currency || 'VND',
        isActive: dto.isActive !== false,
      },
    });
  }

  async listDemDetRules() {
    return this.prisma.getTenantDb().demDetRule.findMany({
      orderBy: [{ chargeType: 'asc' }, { carrierCode: 'asc' }],
    });
  }

  async createDemDetRule(dto: any) {
    if (!dto?.carrierCode || !['DEMURRAGE', 'DETENTION'].includes(dto.chargeType)) {
      throw new BadRequestException('carrierCode and valid chargeType (DEMURRAGE | DETENTION) are required');
    }
    return this.prisma.getTenantDb().demDetRule.create({
      data: {
        carrierCode: String(dto.carrierCode).trim().toUpperCase(),
        chargeType: dto.chargeType,
        containerSize: dto.containerSize || '40HC',
        freeDays: Math.max(0, Number(dto.freeDays ?? 5)),
        excludeWeekends: Boolean(dto.excludeWeekends),
        excludeHolidays: Boolean(dto.excludeHolidays),
        currency: dto.currency || 'VND',
        dailyRateTier1: Number(dto.dailyRateTier1 || 0),
        tier1Days: Math.max(1, Number(dto.tier1Days ?? 5)),
        dailyRateTier2: Number(dto.dailyRateTier2 || 0),
        isActive: dto.isActive !== false,
      },
    });
  }

  async computeShipmentDemDet(shipmentId: string, asOfIso?: string) {
    const db = this.prisma.getTenantDb();
    const shipment = await db.freightShipment.findUnique({
      where: { id: shipmentId },
      include: { demRule: true, detRule: true, container: true },
    });
    if (!shipment) throw new NotFoundException(`FreightShipment ${shipmentId} not found`);

    const asOf = asOfIso ? new Date(asOfIso) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new BadRequestException('Invalid asOf date');

    const demurrage = shipment.demRule
      ? this.demDetCalculator.calculateCharge({
          rule: {
            chargeType: 'DEMURRAGE',
            freeDays: shipment.demRule.freeDays,
            excludeWeekends: shipment.demRule.excludeWeekends,
            excludeHolidays: shipment.demRule.excludeHolidays,
            currency: shipment.demRule.currency,
            dailyRateTier1: Number(shipment.demRule.dailyRateTier1),
            tier1Days: shipment.demRule.tier1Days,
            dailyRateTier2: Number(shipment.demRule.dailyRateTier2),
          },
          startAt: shipment.dischargeAt,
          endAt: shipment.gateOutFullAt ?? asOf,
        })
      : null;

    const detention = shipment.detRule
      ? this.demDetCalculator.calculateCharge({
          rule: {
            chargeType: 'DETENTION',
            freeDays: shipment.detRule.freeDays,
            excludeWeekends: shipment.detRule.excludeWeekends,
            excludeHolidays: shipment.detRule.excludeHolidays,
            currency: shipment.detRule.currency,
            dailyRateTier1: Number(shipment.detRule.dailyRateTier1),
            tier1Days: shipment.detRule.tier1Days,
            dailyRateTier2: Number(shipment.detRule.dailyRateTier2),
          },
          startAt: shipment.gateOutFullAt,
          endAt: shipment.emptyReturnAt ?? asOf,
        })
      : null;

    return {
      shipmentId: shipment.id,
      shipmentNo: shipment.shipmentNo,
      containerNo: shipment.container?.containerNo ?? null,
      clocksSeparated: true,
      demurrage,
      detention,
      totalDemDet:
        (demurrage?.totalAmount ?? 0) + (detention?.totalAmount ?? 0),
    };
  }

  async listFreightInvoices(query?: { direction?: string; status?: string }) {
    const where: any = {};
    if (query?.direction) where.direction = query.direction;
    if (query?.status) where.status = query.status;

    return this.prisma.getTenantDb().freightInvoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        booking: { select: { id: true, bookingNo: true } },
        shipment: { select: { id: true, shipmentNo: true } },
        ledgerEntries: true,
        allocations: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFreightInvoice(dto: any) {
    const subtotal = Number(dto.subtotal);
    const taxAmount = Number(dto.taxAmount || 0);
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      throw new BadRequestException('subtotal must be positive');
    }
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    const invoiceNo =
      dto.invoiceNo ||
      `FINV-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const invoice = await tx.freightInvoice.create({
        data: {
          invoiceNo,
          clientId: dto.clientId || null,
          bookingId: dto.bookingId || null,
          shipmentId: dto.shipmentId || null,
          direction: dto.direction === 'AP' ? 'AP' : 'AR',
          currency: dto.currency || 'VND',
          subtotal,
          taxAmount,
          totalAmount,
          status: 'ISSUED',
          dueAt: dto.dueAt ? new Date(dto.dueAt) : new Date(Date.now() + 30 * 86400000),
        },
      });

      await tx.freightLedgerEntry.create({
        data: {
          invoiceId: invoice.id,
          entryType: dto.entryType || 'FREIGHT',
          amount: totalAmount,
          currency: invoice.currency,
          description: dto.description || `Freight invoice ${invoiceNo}`,
        },
      });

      return invoice;
    });
  }

  async allocatePayment(
    invoiceId: string,
    dto: { amount: number; reference: string; method?: string; actorId?: string },
  ) {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }
    if (!dto.reference || !dto.reference.trim()) {
      throw new BadRequestException('payment reference is required');
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const invoice = await tx.freightInvoice.findUnique({
        where: { id: invoiceId },
        include: { allocations: true },
      });
      if (!invoice) throw new NotFoundException(`FreightInvoice ${invoiceId} not found`);
      if (invoice.status === 'VOID') throw new ConflictException('Cannot pay voided invoice');

      const duplicate = invoice.allocations.find(
        (a: any) => a.reference === dto.reference.trim() && a.status === 'POSTED',
      );
      if (duplicate) return duplicate;

      const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
      if (amount > remaining + 0.01) {
        throw new BadRequestException(`Payment ${amount} exceeds remaining invoice balance ${remaining}`);
      }

      const allocation = await tx.paymentAllocation.create({
        data: {
          invoiceId,
          amount,
          reference: dto.reference.trim(),
          method: dto.method || 'BANK_TRANSFER',
          allocatedBy: dto.actorId || null,
          status: 'POSTED',
        },
      });

      const nextPaid = Math.round((Number(invoice.paidAmount) + amount) * 100) / 100;
      const nextStatus = nextPaid >= Number(invoice.totalAmount) - 0.01 ? 'PAID' : 'PARTIAL';

      await tx.freightInvoice.update({
        where: { id: invoiceId },
        data: { paidAmount: nextPaid, status: nextStatus },
      });

      await tx.freightLedgerEntry.create({
        data: {
          invoiceId,
          entryType: 'PAYMENT',
          amount: -amount,
          currency: invoice.currency,
          description: `Payment ${dto.reference.trim()}`,
        },
      });

      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: 'freight.payment.allocated',
          aggregateId: invoiceId,
          payload: {
            allocationId: allocation.id,
            invoiceId,
            invoiceNo: invoice.invoiceNo,
            amount,
            nextStatus,
          },
        },
        tx,
      );

      return allocation;
    });
  }

  async listDisputes() {
    return this.prisma.getTenantDb().disputeCase.findMany({
      include: {
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true } },
        shipment: { select: { id: true, shipmentNo: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDispute(dto: any) {
    const claimedAmount = Number(dto.claimedAmount);
    if (!dto?.reason || !Number.isFinite(claimedAmount) || claimedAmount <= 0) {
      throw new BadRequestException('reason and positive claimedAmount are required');
    }
    const disputeCode =
      dto.disputeCode ||
      `DSP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    return this.prisma.getTenantDb().disputeCase.create({
      data: {
        disputeCode,
        invoiceId: dto.invoiceId || null,
        shipmentId: dto.shipmentId || null,
        clientId: dto.clientId || null,
        category: dto.category || 'DEM_DET',
        claimedAmount,
        reason: String(dto.reason).trim(),
        status: 'OPEN',
      },
    });
  }

  async resolveDispute(
    id: string,
    dto: { status: 'RESOLVED_CREDIT' | 'REJECTED'; approvedAmount?: number; resolutionNotes?: string },
  ) {
    if (!['RESOLVED_CREDIT', 'REJECTED'].includes(dto.status)) {
      throw new BadRequestException('status must be RESOLVED_CREDIT or REJECTED');
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const dispute = await tx.disputeCase.findUnique({ where: { id } });
      if (!dispute) throw new NotFoundException(`DisputeCase ${id} not found`);
      if (['RESOLVED_CREDIT', 'REJECTED'].includes(dispute.status)) {
        throw new ConflictException(`DisputeCase ${dispute.disputeCode} already resolved`);
      }

      const approvedAmount =
        dto.status === 'RESOLVED_CREDIT' ? Math.max(0, Number(dto.approvedAmount ?? dispute.claimedAmount)) : 0;

      const updated = await tx.disputeCase.update({
        where: { id },
        data: {
          status: dto.status,
          approvedAmount,
          resolutionNotes: dto.resolutionNotes || null,
        },
      });

      if (dto.status === 'RESOLVED_CREDIT' && dispute.invoiceId && approvedAmount > 0) {
        const inv = await tx.freightInvoice.findUnique({ where: { id: dispute.invoiceId } });
        if (inv) {
          await tx.freightLedgerEntry.create({
            data: {
              invoiceId: inv.id,
              entryType: 'CREDIT_NOTE',
              amount: -approvedAmount,
              currency: inv.currency,
              description: `Dispute credit note ${dispute.disputeCode}`,
            },
          });
          const nextPaid = Math.min(Number(inv.totalAmount), Number(inv.paidAmount) + approvedAmount);
          const nextStatus = nextPaid >= Number(inv.totalAmount) - 0.01 ? 'PAID' : 'PARTIAL';
          await tx.freightInvoice.update({
            where: { id: inv.id },
            data: { paidAmount: nextPaid, status: nextStatus },
          });
        }
      }

      return updated;
    });
  }
}
