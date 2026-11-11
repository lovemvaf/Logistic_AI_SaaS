import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OutboxService } from '../../../core/outbox/outbox.service';

@Injectable()
export class YardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async listYards() {
    const yards = await this.prisma.getTenantDb().yard.findMany({
      include: {
        slots: { select: { id: true, status: true, isReeferSlot: true } },
      },
      orderBy: { code: 'asc' },
    });

    return yards.map((y: any) => {
      const occupied = y.slots.filter((s: any) => s.status === 'OCCUPIED').length;
      const reserved = y.slots.filter((s: any) => s.status === 'RESERVED').length;
      const empty = y.slots.filter((s: any) => s.status === 'EMPTY').length;
      return {
        ...y,
        slotStats: {
          configured: y.slots.length,
          occupied,
          reserved,
          empty,
        },
      };
    });
  }

  async createYard(dto: { code: string; name: string; facilityId?: string; totalSlots?: number; reeferPlugs?: number }) {
    if (!dto?.code || !dto?.name) {
      throw new BadRequestException('code and name are required');
    }
    return this.prisma.getTenantDb().yard.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        facilityId: dto.facilityId || null,
        totalSlots: Math.max(1, Number(dto.totalSlots || 40)),
        reeferPlugs: Math.max(0, Number(dto.reeferPlugs || 4)),
      },
    });
  }

  async getYardSlots(yardId: string) {
    const db = this.prisma.getTenantDb();
    const yard = await db.yard.findUnique({ where: { id: yardId } });
    if (!yard) throw new NotFoundException(`Yard ${yardId} not found`);

    return db.yardSlot.findMany({
      where: { yardId },
      include: { container: { select: { id: true, containerNo: true, sizeType: true, status: true } } },
      orderBy: [{ block: 'asc' }, { rowNo: 'asc' }, { bayNo: 'asc' }, { tierNo: 'asc' }],
    });
  }

  async createYardSlot(
    yardId: string,
    dto: { block: string; rowNo: number; bayNo: number; tierNo?: number; isReeferSlot?: boolean },
  ) {
    const db = this.prisma.getTenantDb();
    const yard = await db.yard.findUnique({ where: { id: yardId } });
    if (!yard) throw new NotFoundException(`Yard ${yardId} not found`);

    const tierNo = Number(dto.tierNo || 1);
    const slotCode = `${dto.block.toUpperCase()}-R${dto.rowNo}-B${dto.bayNo}-T${tierNo}`;
    return db.yardSlot.create({
      data: {
        yardId,
        block: dto.block.toUpperCase(),
        rowNo: Number(dto.rowNo),
        bayNo: Number(dto.bayNo),
        tierNo,
        slotCode,
        isReeferSlot: Boolean(dto.isReeferSlot),
        status: 'EMPTY',
      },
    });
  }

  async listGateEvents(query?: { yardId?: string; containerId?: string }) {
    const where: any = {};
    if (query?.yardId) where.yardId = query.yardId;
    if (query?.containerId) where.containerId = query.containerId;

    return this.prisma.getTenantDb().containerGateEvent.findMany({
      where,
      include: {
        yard: { select: { id: true, code: true, name: true } },
        yardSlot: { select: { id: true, slotCode: true } },
        container: { select: { id: true, containerNo: true, sizeType: true, status: true } },
        eir: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  async recordGateEvent(dto: {
    yardId: string;
    containerId: string;
    yardSlotId?: string;
    tractorId?: string;
    chassisId?: string;
    bookingId?: string;
    eventType: 'GATE_IN' | 'GATE_OUT';
    loadState?: 'FULL' | 'EMPTY';
    sealNo?: string;
    grossWeightKg?: number;
    condition?: 'GOOD' | 'MINOR_DENT' | 'DAMAGED';
    damageNotes?: string;
    driverName?: string;
    inspectorName?: string;
    operatorId?: string;
    notes?: string;
  }) {
    if (!['GATE_IN', 'GATE_OUT'].includes(dto.eventType)) {
      throw new BadRequestException('eventType must be GATE_IN or GATE_OUT');
    }
    const loadState = dto.loadState === 'FULL' ? 'FULL' : 'EMPTY';

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const [yard, container] = await Promise.all([
        tx.yard.findUnique({ where: { id: dto.yardId } }),
        tx.containerEquipment.findUnique({ where: { id: dto.containerId } }),
      ]);
      if (!yard) throw new NotFoundException(`Yard ${dto.yardId} not found`);
      if (!container) throw new NotFoundException(`Container ${dto.containerId} not found`);

      let resolvedSlotId: string | null = dto.yardSlotId || null;

      if (dto.eventType === 'GATE_IN') {
        if (resolvedSlotId) {
          const slot = await tx.yardSlot.findUnique({ where: { id: resolvedSlotId } });
          if (!slot || slot.yardId !== yard.id) {
            throw new BadRequestException('Target yardSlotId does not belong to yard');
          }
          if (slot.status === 'OCCUPIED' && slot.containerId && slot.containerId !== container.id) {
            throw new ConflictException(`Yard slot ${slot.slotCode} is already occupied`);
          }
          if (container.sizeType === '40RF' && !slot.isReeferSlot && yard.reeferPlugs > 0) {
            // Allow only if explicitly intended, otherwise warn via notes
          }
          await tx.yardSlot.update({
            where: { id: slot.id },
            data: { status: 'OCCUPIED', containerId: container.id },
          });
        } else {
          const freeSlot = await tx.yardSlot.findFirst({
            where: { yardId: yard.id, status: 'EMPTY' },
            orderBy: [{ block: 'asc' }, { rowNo: 'asc' }, { bayNo: 'asc' }, { tierNo: 'asc' }],
          });
          if (freeSlot) {
            resolvedSlotId = freeSlot.id;
            await tx.yardSlot.update({
              where: { id: freeSlot.id },
              data: { status: 'OCCUPIED', containerId: container.id },
            });
          }
        }
      } else {
        // GATE_OUT releases any occupied slot currently holding this container
        await tx.yardSlot.updateMany({
          where: { yardId: yard.id, containerId: container.id },
          data: { status: 'EMPTY', containerId: null },
        });
      }

      const nextContainerStatus =
        dto.eventType === 'GATE_IN'
          ? loadState === 'EMPTY'
            ? 'EMPTY_AT_DEPOT'
            : 'GATE_IN_PORT'
          : loadState === 'EMPTY'
            ? 'GATE_OUT_EMPTY'
            : 'LADEN_IN_TRANSIT';

      await tx.containerEquipment.update({
        where: { id: container.id },
        data: {
          status: nextContainerStatus,
          ...(dto.sealNo ? { currentSealNo: dto.sealNo.trim() } : {}),
          lastInspectedAt: new Date(),
        },
      });

      const gateEvent = await tx.containerGateEvent.create({
        data: {
          yardId: yard.id,
          yardSlotId: resolvedSlotId,
          containerId: container.id,
          tractorId: dto.tractorId || null,
          chassisId: dto.chassisId || null,
          bookingId: dto.bookingId || null,
          eventType: dto.eventType,
          loadState,
          sealNo: dto.sealNo || null,
          grossWeightKg: dto.grossWeightKg ?? null,
          operatorId: dto.operatorId || null,
          notes: dto.notes || null,
        },
      });

      const eirNumber = `EIR-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      const eir = await tx.equipmentInterchangeReceipt.create({
        data: {
          eirNumber,
          gateEventId: gateEvent.id,
          yardId: yard.id,
          containerId: container.id,
          tractorId: dto.tractorId || null,
          chassisId: dto.chassisId || null,
          direction: dto.eventType === 'GATE_IN' ? 'IN' : 'OUT',
          loadState,
          sealNo: dto.sealNo || null,
          condition: dto.condition || 'GOOD',
          damageNotes: dto.damageNotes || null,
          driverName: dto.driverName || null,
          inspectorName: dto.inspectorName || 'Yard Inspector',
        },
      });

      await this.outbox.enqueue(
        {
          channel: 'KAFKA',
          topic: dto.eventType === 'GATE_IN' ? 'yard.container.gate_in' : 'yard.container.gate_out',
          aggregateId: container.id,
          payload: {
            gateEventId: gateEvent.id,
            eirId: eir.id,
            eirNumber,
            yardId: yard.id,
            containerId: container.id,
            containerNo: container.containerNo,
            eventType: dto.eventType,
            loadState,
            condition: eir.condition,
          },
        },
        tx,
      );

      return { gateEvent, eir, containerStatus: nextContainerStatus };
    });
  }

  async listEirs(query?: { yardId?: string; containerId?: string }) {
    const where: any = {};
    if (query?.yardId) where.yardId = query.yardId;
    if (query?.containerId) where.containerId = query.containerId;

    return this.prisma.getTenantDb().equipmentInterchangeReceipt.findMany({
      where,
      include: {
        yard: { select: { id: true, code: true, name: true } },
        container: { select: { id: true, containerNo: true, sizeType: true } },
        tractor: { select: { id: true, unitCode: true, plateNumber: true } },
        chassis: { select: { id: true, chassisCode: true, plateNumber: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
  }
}
