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

  @Get('active')
  @RequirePermissions(Permissions.InventoryRead)
  async activeSession(@Request() req: any) {
    const db = this.prisma.getTenantDb();
    const shift = await db.staffShift.findFirst({
      where: { status: 'OPEN', ...(req.user?.sub ? { staffId: req.user.sub } : {}) },
      include: { warehouse: true, staff: { select: { id: true, fullName: true } } },
      orderBy: { shiftStart: 'desc' },
    });
    return shift || null;
  }

  @Get('scans')
  @RequirePermissions(Permissions.InventoryRead)
  async listScans() {
    return this.prisma.getTenantDb().scanLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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
    return this.prisma.getTenantDb().staffShift.findMany({
      include: { warehouse: true, staff: { select: { id: true, fullName: true, email: true } } },
      orderBy: { shiftStart: 'desc' },
      take: 50,
    });
  }

  @Post()
  @RequirePermissions(Permissions.PackStationScan)
  async start(@Body() body: { warehouseId?: string }, @Request() req: any) {
    const db = this.prisma.getTenantDb();
    let warehouseId = body?.warehouseId;
    if (!warehouseId) {
      const wh = await db.warehouse.findFirst({ select: { id: true } });
      warehouseId = wh?.id;
    }
    if (!warehouseId || !req.user?.sub) {
      throw new BadRequestException('warehouseId and authenticated user are required');
    }
    return db.staffShift.create({
      data: { warehouseId, staffId: req.user.sub, shiftStart: new Date(), status: 'OPEN' },
    });
  }

  @Post(':id/seal')
  @RequirePermissions(Permissions.PackStationScan)
  async sealSession(@Param('id') id: string) {
    const existing = await this.prisma.getTenantDb().staffShift.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Packing session ${id} not found`);
    return this.prisma.getTenantDb().staffShift.update({
      where: { id },
      data: { shiftEnd: new Date(), status: 'CLOSED' },
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param('id') id: string) {
    const session = await this.prisma.getTenantDb().staffShift.findUnique({
      where: { id },
      include: { warehouse: true, staff: { select: { id: true, fullName: true } } },
    });
    if (!session) throw new NotFoundException(`Packing session ${id} not found`);
    return session;
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
      status: wh.status,
    }));
  }

  @Get(':id')
  @RequirePermissions(Permissions.InventoryRead)
  async detail(@Param('id') id: string) {
    const wh = await this.prisma.getTenantDb().warehouse.findFirst({
      where: { OR: [{ id }, { code: id.replace(/^STN-/, '') }] },
    });
    if (!wh) throw new NotFoundException(`Station ${id} not found`);
    return { id: `STN-${wh.code}`, warehouseId: wh.id, name: `${wh.name} - Pack Station`, status: wh.status };
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
    return this.prisma.getTenantDb().tenantUser.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, email: true, status: true },
      orderBy: { fullName: 'asc' },
      take: 100,
    });
  }
}
