import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExcludeRoles, Permissions, PermissionsGuard, RequirePermissions, Roles } from 'shared-types';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { PrismaService } from '../../../core/prisma/prisma.service';

@ApiTags('Warehouse Bins Alias')
@Controller('warehouses/bins')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class WarehousesBinsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    const safePage = Math.max(1, Number(page || 1));
    const take = Math.min(100, Math.max(1, Number(limit || 50)));
    const skip = (safePage - 1) * take;
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (search) where.barcode = { contains: search, mode: 'insensitive' };

    const db = this.prisma.getTenantDb();
    const [data, total] = await Promise.all([
      db.bin.findMany({
        where,
        skip,
        take,
        include: { rack: { include: { zone: true } }, warehouse: true },
        orderBy: { barcode: 'asc' },
      }),
      db.bin.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: safePage, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param('id') id: string) {
    const bin = await this.prisma.getTenantDb().bin.findUnique({
      where: { id },
      include: { rack: { include: { zone: true } }, warehouse: true, inventory: { include: { product: true } } },
    });
    if (!bin) throw new NotFoundException(`Bin ${id} not found`);
    return bin;
  }

  @Post()
  @RequirePermissions(Permissions.InventoryAdjust)
  async create(
    @Body()
    body: {
      rackId: string;
      warehouseId: string;
      barcode: string;
      rowIndex?: number;
      levelIndex?: number;
      maxWeightKg?: number;
      maxVolumeCbm?: number;
    },
  ) {
    if (!body?.rackId || !body?.warehouseId || !body?.barcode) {
      throw new BadRequestException('rackId, warehouseId, and barcode are required');
    }
    return this.prisma.getTenantDb().bin.create({
      data: {
        rackId: body.rackId,
        warehouseId: body.warehouseId,
        barcode: body.barcode,
        rowIndex: Number(body.rowIndex || 1),
        levelIndex: Number(body.levelIndex || 1),
        maxWeightKg: body.maxWeightKg ?? 1000,
        maxVolumeCbm: body.maxVolumeCbm ?? 1.5,
      },
    });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.InventoryAdjust)
  async update(@Param('id') id: string, @Body() body: any) {
    const existing = await this.prisma.getTenantDb().bin.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Bin ${id} not found`);
    return this.prisma.getTenantDb().bin.update({
      where: { id },
      data: {
        ...(body?.barcode !== undefined ? { barcode: String(body.barcode) } : {}),
        ...(body?.maxWeightKg !== undefined ? { maxWeightKg: Number(body.maxWeightKg) } : {}),
        ...(body?.maxVolumeCbm !== undefined ? { maxVolumeCbm: Number(body.maxVolumeCbm) } : {}),
      },
    });
  }

  @Delete(':id')
  @RequirePermissions(Permissions.InventoryAdjust)
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.getTenantDb().bin.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Bin ${id} not found`);
    await this.prisma.getTenantDb().bin.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags('WMS Equipment')
@Controller('equipment')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class EquipmentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list() {
    return this.prisma.getTenantDb().equipmentCheckout.findMany({
      include: { warehouse: true, staff: { select: { id: true, fullName: true, email: true } } },
      orderBy: { checkedOutAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param('id') id: string) {
    const item = await this.prisma.getTenantDb().equipmentCheckout.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Equipment ${id} not found`);
    return item;
  }

  @Post()
  @RequirePermissions(Permissions.TasksUpdate)
  async create(@Body() body: { warehouseId?: string; equipmentCode: string }, @Request() req: any) {
    const db = this.prisma.getTenantDb();
    let warehouseId = body?.warehouseId;
    if (!warehouseId) {
      const wh = await db.warehouse.findFirst({ select: { id: true } });
      warehouseId = wh?.id;
    }
    if (!warehouseId || !body?.equipmentCode || !req.user?.sub) {
      throw new BadRequestException('equipmentCode, active warehouse, and authenticated user are required');
    }
    return db.equipmentCheckout.create({
      data: {
        warehouseId,
        equipmentCode: body.equipmentCode,
        staffId: req.user.sub,
        status: 'OUT',
      },
    });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.TasksUpdate)
  async update(@Param('id') id: string, @Body() body: { status?: string }) {
    const existing = await this.prisma.getTenantDb().equipmentCheckout.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Equipment ${id} not found`);
    return this.prisma.getTenantDb().equipmentCheckout.update({
      where: { id },
      data: {
        status: body?.status || 'RETURNED',
        ...(body?.status === 'RETURNED' ? { returnedAt: new Date() } : {}),
      },
    });
  }
}

@ApiTags('WMS Packing Sessions')
@Controller('packing-sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class PackingSessionsController {
  constructor(private readonly prisma: PrismaService) {}

  private mapScanLog(log: any, stationId: string) {
    const raw = String(log.deviceId || '');
    const parts = raw.startsWith('PACK|') || raw.startsWith('PACK-OVERRIDE|') ? raw.split('|') : [];
    const packCode = parts[1] || log.barcode;
    const expectedSku = parts[2] || log.barcode;
    const result = raw.startsWith('PACK-OVERRIDE|')
      ? 'OVERRIDE'
      : log.result === 'MATCHED'
        ? 'MATCH'
        : 'MISMATCH';
    return {
      packCode,
      trackingCode: packCode,
      sku: log.barcode,
      expectedSku,
      result,
      stationId,
      staffId: log.actorId || undefined,
      scannedAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    };
  }

  private async enrichShift(shift: any) {
    const db = this.prisma.getTenantDb();
    const endWindow = shift.shiftEnd || new Date();
    const [scanRows, packedCount] = await Promise.all([
      db.scanLog.findMany({
        where: {
          warehouseId: shift.warehouseId,
          createdAt: { gte: shift.shiftStart, lte: endWindow },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.packStationLog.count({
        where: {
          warehouseId: shift.warehouseId,
          createdAt: { gte: shift.shiftStart, lte: endWindow },
        },
      }),
    ]);

    const stationId = shift.warehouse?.code ? `STN-${shift.warehouse.code}` : shift.warehouseId;
    const scanLogs = scanRows.map((row: any) => this.mapScanLog(row, stationId));
    const totalMatched = scanLogs.filter((l: any) => l.result === 'MATCH').length;
    const totalMismatched = scanLogs.filter((l: any) => l.result === 'MISMATCH').length;
    const totalCorrected = scanLogs.filter((l: any) => l.result === 'OVERRIDE').length;
    const elapsedSeconds = Math.max(
      1,
      Math.round((new Date(endWindow).getTime() - new Date(shift.shiftStart).getTime()) / 1000),
    );

    return {
      ...shift,
      sessionCode: `CA-${String(shift.id).slice(0, 6).toUpperCase()}`,
      stationId,
      status: shift.status === 'OPEN' ? 'ACTIVE' : shift.status === 'CLOSED' ? 'CLOSED' : 'SEALING',
      totalPacked: packedCount,
      totalMatched,
      totalMismatched,
      totalCorrected,
      elapsedSeconds,
      startedAt: shift.shiftStart,
      closedAt: shift.shiftEnd,
      scanLogs,
    };
  }

  @Get('active')
  @RequirePermissions(Permissions.InventoryRead)
  async activeSession(@Request() req: any) {
    const db = this.prisma.getTenantDb();
    const shift = await db.staffShift.findFirst({
      where: { status: 'OPEN', ...(req.user?.sub ? { staffId: req.user.sub } : {}) },
      include: { warehouse: true, staff: { select: { id: true, fullName: true } } },
      orderBy: { shiftStart: 'desc' },
    });
    return shift ? this.enrichShift(shift) : null;
  }

  @Get('scans')
  @RequirePermissions(Permissions.InventoryRead)
  async listScans() {
    const rows = await this.prisma.getTenantDb().scanLog.findMany({
      include: { warehouse: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row: any) =>
      this.mapScanLog(row, row.warehouse?.code ? `STN-${row.warehouse.code}` : row.warehouseId),
    );
  }

  @Get('dashboard')
  @RequirePermissions(Permissions.InventoryRead)
  async dashboard() {
    const db = this.prisma.getTenantDb();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [openShifts, packedToday, scansToday] = await Promise.all([
      db.staffShift.count({ where: { status: 'OPEN' } }),
      db.packStationLog.count({ where: { createdAt: { gte: startOfDay } } }),
      db.scanLog.count({ where: { createdAt: { gte: startOfDay } } }),
    ]);
    return { openShifts, packedToday, scansToday };
  }

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list() {
    const shifts = await this.prisma.getTenantDb().staffShift.findMany({
      include: { warehouse: true, staff: { select: { id: true, fullName: true, email: true } } },
      orderBy: { shiftStart: 'desc' },
      take: 50,
    });
    return Promise.all(shifts.map((shift: any) => this.enrichShift(shift)));
  }

  @Post()
  @RequirePermissions(Permissions.PackStationScan)
  async start(
    @Body() body: { warehouseId?: string; stationId?: string; staffId?: string },
    @Request() req: any,
  ) {
    const db = this.prisma.getTenantDb();
    let warehouseId = body?.warehouseId;
    if (!warehouseId && body?.stationId) {
      const code = body.stationId.replace(/^STN-/, '');
      const matched = await db.warehouse.findFirst({ where: { code }, select: { id: true } });
      warehouseId = matched?.id;
    }
    if (!warehouseId) {
      const wh = await db.warehouse.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
      warehouseId = wh?.id;
    }
    if (!warehouseId || !req.user?.sub) {
      throw new BadRequestException('warehouseId and authenticated user are required');
    }
    const created = await db.staffShift.create({
      data: { warehouseId, staffId: req.user.sub, shiftStart: new Date(), status: 'OPEN' },
      include: { warehouse: true, staff: { select: { id: true, fullName: true } } },
    });
    return this.enrichShift(created);
  }

  @Post(':id/seal')
  @RequirePermissions(Permissions.PackStationScan)
  async sealSession(@Param('id') id: string) {
    const existing = await this.prisma.getTenantDb().staffShift.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Packing session ${id} not found`);
    const updated = await this.prisma.getTenantDb().staffShift.update({
      where: { id },
      data: { shiftEnd: new Date(), status: 'CLOSED' },
      include: { warehouse: true, staff: { select: { id: true, fullName: true } } },
    });
    return this.enrichShift(updated);
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param('id') id: string) {
    const session = await this.prisma.getTenantDb().staffShift.findUnique({
      where: { id },
      include: { warehouse: true, staff: { select: { id: true, fullName: true } } },
    });
    if (!session) throw new NotFoundException(`Packing session ${id} not found`);
    return this.enrichShift(session);
  }
}

@ApiTags('WMS Stations')
@Controller('stations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class StationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list() {
    const warehouses = await this.prisma.getTenantDb().warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return warehouses.map((wh: any) => ({
      id: `STN-${wh.code}`,
      warehouseId: wh.id,
      name: `${wh.name} - Pack Station`,
      code: wh.code,
      status: wh.status === 'ACTIVE' ? 'AVAILABLE' : 'OFFLINE',
    }));
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param('id') id: string) {
    const wh = await this.prisma.getTenantDb().warehouse.findFirst({
      where: { OR: [{ id }, { code: id.replace(/^STN-/, '') }] },
    });
    if (!wh) throw new NotFoundException(`Station ${id} not found`);
    return {
      id: `STN-${wh.code}`,
      warehouseId: wh.id,
      name: `${wh.name} - Pack Station`,
      code: wh.code,
      status: wh.status === 'ACTIVE' ? 'AVAILABLE' : 'OFFLINE',
    };
  }
}

@ApiTags('WMS Staff')
@Controller('staff')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class StaffController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list() {
    const users = await this.prisma.getTenantDb().tenantUser.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, email: true, status: true },
      orderBy: { fullName: 'asc' },
      take: 100,
    });
    return users.map((u: any) => ({
      id: u.id,
      staffCode: u.id.slice(0, 8).toUpperCase(),
      fullName: u.fullName,
      email: u.email,
      role: 'WAREHOUSE_STAFF',
      phone: '-',
    }));
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param('id') id: string) {
    const user = await this.prisma.getTenantDb().tenantUser.findFirst({
      where: { OR: [{ id }, { email: id }] },
      select: { id: true, fullName: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException(`Staff ${id} not found`);
    const wh = await this.prisma.getTenantDb().warehouse.findFirst({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { code: true },
    });
    return {
      id: user.id,
      staffCode: user.id.slice(0, 8).toUpperCase(),
      fullName: user.fullName,
      email: user.email,
      role: 'WAREHOUSE_STAFF',
      phone: '-',
      stationId: wh ? `STN-${wh.code}` : undefined,
    };
  }
}
